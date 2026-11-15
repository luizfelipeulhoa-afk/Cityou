// Mede a latência da API: ida e volta, tempo no servidor (cabeçalho Server-Timing) e tempo no Durable Object.
//
// Uso:
//   node tools/api-perf.mjs [url-base] [rota] [repetições] [opções]
//   node tools/api-perf.mjs http://127.0.0.1:8787 /api/health 50
//   node tools/api-perf.mjs http://127.0.0.1:8787 /api/personal 50
//   node tools/api-perf.mjs http://127.0.0.1:8787 /api/personal/entries 30 --method POST --body '{"kind":"note","day":"{day}","title":"teste {uuid}"}'
//   node tools/api-perf.mjs http://127.0.0.1:8787 --suite 50 --json     # a base: personal, city e uma escrita de cidade
//
// Opções: --method M · --body JSON (aceita {uuid} e {n}, trocados a cada chamada, e {day}, a data de hoje) · --header 'Nome: valor' (repetível)
//         --cookie 'a=b' · --json (uma linha de JSON no fim) · --suite (as três medidas da base de desempenho)
//
// Cuidado: a demonstração guarda no máximo 100 registros por tipo; uma escrita de registro com mais de ~90 chamadas passa a dar erro.
// A sessão de demonstração é obtida sozinha (o Worker põe o cookie ao servir /app). Se o site exige login,
// as rotas de dados respondem 401: entre numa conta e passe o cookie com --cookie.
// Escritas levam sozinhas Origin e X-Cityou-Request. Respostas com erro são contadas e o teste segue;
// os tempos vêm só das respostas que deram certo.
const argv = process.argv.slice(2)
const flags = {}, positional = []
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (!arg.startsWith('--')) { positional.push(arg); continue }
  const name = arg.slice(2)
  if (['json', 'suite'].includes(name)) flags[name] = true
  else if (name === 'header') (flags.header ??= []).push(argv[++i])
  else flags[name] = argv[++i]
}
const [base = 'http://127.0.0.1:8787', pathArg, countArg] = positional
const suiteCount = flags.suite && pathArg && /^\d+$/.test(pathArg) ? pathArg : countArg
const count = Math.max(5, Number(flags.suite ? (suiteCount ?? 50) : (countArg ?? 50)) || 50)
const origin = new URL(base).origin

const percentile = (values, p) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}
const parseTiming = header => Object.fromEntries((header || '').split(',').map(part => {
  const match = part.trim().match(/^([\w-]+);dur=([\d.]+)/)
  return match ? [match[1], Number(match[2])] : null
}).filter(Boolean))

// Cookies: só o que o Worker devolve em Set-Cookie (a demonstração) ou o que veio em --cookie.
const jar = new Map()
if (flags.cookie) for (const part of flags.cookie.split(';')) { const [k, ...v] = part.trim().split('='); if (k) jar.set(k, v.join('=')) }
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
const remember = response => {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';'), [k, ...v] = pair.split('=')
    if (k && v.length) jar.set(k.trim(), v.join('='))
  }
}
async function ensureSession() {
  if (jar.size) return
  const response = await fetch(base + '/app', { redirect: 'manual' }).catch(() => null)
  if (response) { remember(response); await response.arrayBuffer().catch(() => {}) }
}

function request(spec, bodyText) {
  const method = spec.method ?? 'GET'
  const headers = { ...spec.headers }
  if (jar.size) headers.Cookie = cookieHeader()
  if (method !== 'GET' && method !== 'HEAD') {
    headers.Origin = origin
    headers['X-Cityou-Request'] = '1'
    if (bodyText !== undefined) headers['Content-Type'] = 'application/json'
  }
  return fetch(base + spec.path, { method, headers, body: bodyText, cache: 'no-store', redirect: 'manual' })
}

/** Roda `count` chamadas de uma medida (mais 3 de aquecimento, descartadas) e devolve os números. */
async function measure(spec, repetitions) {
  const samples = { roundTrip: [], total: [], do: [], db: [] }
  const errors = {}
  let sent = 0
  for (let i = -3; i < repetitions; i++) {
    const bodyText = spec.body ? spec.body(sent++) : undefined
    const from = performance.now()
    let response
    try { response = await request(spec, bodyText) } catch (error) { errors.rede = (errors.rede ?? 0) + 1; continue }
    const body = await response.json().catch(() => ({}))
    const elapsed = performance.now() - from
    remember(response)
    if (!response.ok) { errors[response.status] = (errors[response.status] ?? 0) + 1; continue }
    spec.after?.(body)
    if (i < 0) continue
    samples.roundTrip.push(elapsed)
    const timing = parseTiming(response.headers.get('server-timing'))
    for (const key of ['total', 'do', 'db']) if (timing[key] !== undefined) samples[key].push(timing[key])
  }
  const stat = values => values.length ? { p50: percentile(values, 50), p95: percentile(values, 95) } : null
  return { label: spec.label, calls: repetitions, ok: samples.roundTrip.length, errors,
    roundTrip: stat(samples.roundTrip), total: stat(samples.total), do: stat(samples.do), db: stat(samples.db) }
}

const today = new Date().toISOString().slice(0, 10)
const jsonBody = text => i => text.replaceAll('{uuid}', () => crypto.randomUUID()).replaceAll('{n}', String(i)).replaceAll('{day}', today)

/** A escrita da cidade: constrói uma casa (se faltar) e depois gira a peça, com a revisão e o request_id certos. */
async function cityWriteSpec() {
  const read = await request({ path: '/api/city' })
  const city = await read.json().catch(() => ({}))
  if (!read.ok) throw new Error(`GET /api/city respondeu ${read.status}: sem sessão (use --cookie) ou servidor fora do ar.`)
  let revision = city.revision, placement = city.placements?.find(item => item.kind === 'home')
  if (!placement) {
    // Procura um lote livre: o servidor recusa lote ocupado, bloqueado ou fora do terreno.
    for (let y = 2; y <= 14 && !placement; y++) for (let x = 2; x <= 14 && !placement; x++) {
      const response = await request({ method: 'POST', path: '/api/city/actions' },
        JSON.stringify({ type: 'build', kind: 'home', x, y, expected_revision: revision, request_id: crypto.randomUUID() }))
      if (!response.ok) continue
      const next = await response.json()
      revision = next.revision
      placement = next.placements.find(item => item.kind === 'home' && item.x === x && item.y === y)
    }
  }
  if (!placement) throw new Error('Não achei um lote livre para uma casa (moedas insuficientes ou cidade cheia).')
  return {
    label: 'POST /api/city/actions (girar)', method: 'POST', path: '/api/city/actions',
    body: i => JSON.stringify({ type: 'rotate', placement_id: placement.id, rotation: (i + 1) % 4, expected_revision: revision, request_id: crypto.randomUUID() }),
    after: body => { if (Number.isSafeInteger(body.revision)) revision = body.revision },
  }
}

const fmt = stat => stat ? `${stat.p50.toFixed(1).padStart(7)} / ${stat.p95.toFixed(1).padStart(7)}` : '    sem dados'
function print(results) {
  console.log(`${base} · ${count} chamadas por medida · mediana / p95 em ms`)
  console.log(`${'medida'.padEnd(34)}${'ida e volta'.padStart(19)}${'servidor'.padStart(19)}${'Durable Object'.padStart(19)}  erros`)
  for (const r of results) {
    const errors = Object.entries(r.errors).map(([code, n]) => `${code}×${n}`).join(' ') || '-'
    console.log(`${r.label.padEnd(34)}${fmt(r.roundTrip).padStart(19)}${fmt(r.total).padStart(19)}${fmt(r.do ?? r.db).padStart(19)}  ${errors}`)
  }
  const worst = results.filter(r => r.total).map(r => r.total.p50)
  if (worst.length) console.log(Math.max(...worst) <= 60 ? 'Meta do servidor (60 ms na mediana): dentro.' : 'Meta do servidor (60 ms na mediana): FORA.')
  if (results.some(r => r.errors[401])) console.log('Houve 401: o site exige login. Entre numa conta e passe o cookie com --cookie.')
}

const results = []
if (flags.suite) {
  await ensureSession()
  results.push(await measure({ label: 'GET /api/personal', path: '/api/personal' }, count))
  results.push(await measure({ label: 'GET /api/city', path: '/api/city' }, count))
  try { results.push(await measure(await cityWriteSpec(), count)) } catch (error) { console.error(String(error.message ?? error)) }
} else {
  const path = pathArg ?? '/api/health'
  if (path !== '/api/health') await ensureSession()
  const spec = { label: `${flags.method ?? 'GET'} ${path}`, method: flags.method, path, body: flags.body ? jsonBody(flags.body) : undefined,
    headers: Object.fromEntries((flags.header ?? []).map(line => { const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()] })) }
  results.push(await measure(spec, count))
}
print(results)
if (flags.json) console.log(JSON.stringify({ base, count, results }))
if (!results.length || results.every(r => r.ok === 0)) process.exit(1)
