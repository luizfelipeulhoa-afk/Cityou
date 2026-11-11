// Mede a latência da API: tempo no servidor (cabeçalho Server-Timing) e ida e volta.
// Uso: node tools/api-perf.mjs [url-base] [rota] [repetições]
//   node tools/api-perf.mjs http://127.0.0.1:8787 /api/health 50
//   node tools/api-perf.mjs https://<seu-site> /api/health 50
const [base = 'http://127.0.0.1:8787', path = '/api/health', countArg = '50'] = process.argv.slice(2)
const count = Math.max(5, Number(countArg) || 50)

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}
const parseTiming = header => Object.fromEntries((header || '').split(',').map(part => {
  const match = part.trim().match(/^([\w-]+);dur=([\d.]+)/)
  return match ? [match[1], Number(match[2])] : null
}).filter(Boolean))

const samples = { roundTrip: [], total: [], db: [] }
let regions = new Set()
await fetch(base + path).then(response => response.arrayBuffer()) // aquece a conexão
for (let i = 0; i < count; i++) {
  const from = performance.now()
  const response = await fetch(base + path, { cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  samples.roundTrip.push(performance.now() - from)
  if (!response.ok) { console.error(`Resposta ${response.status} em ${path}`); process.exit(1) }
  const timing = parseTiming(response.headers.get('server-timing'))
  if (timing.total !== undefined) samples.total.push(timing.total)
  if (timing.db !== undefined) samples.db.push(timing.db)
  if (body.db_region) regions.add(body.db_region)
}

const row = (label, values) => values.length
  ? `${label.padEnd(22)} mediana ${percentile(values, 50).toFixed(1).padStart(7)} ms   p95 ${percentile(values, 95).toFixed(1).padStart(7)} ms`
  : `${label.padEnd(22)} sem dados`
console.log(`${base}${path} · ${count} chamadas`)
console.log(row('Ida e volta', samples.roundTrip))
console.log(row('Servidor (total)', samples.total))
console.log(row('Servidor (banco)', samples.db))
if (regions.size) console.log(`Região do banco: ${[...regions].join(', ')}`)
const serverMedian = samples.total.length ? percentile(samples.total, 50) : null
if (serverMedian !== null) console.log(serverMedian <= 60 ? 'Meta do servidor (60 ms na mediana): dentro.' : 'Meta do servidor (60 ms na mediana): FORA.')
