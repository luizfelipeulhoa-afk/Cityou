// Base de desempenho da cidade (city.html): abertura, carga dos GLB e custo por quadro, com a cidade
// de partida e com N prédios do Rio. Complementa tools/world-frame-bench.mjs (mapa-mundo) e tools/pilot-perf.mjs.
//
// Mede, por cenário e por rodada, num navegador de celular simulado (CPU mais lenta e rede 4G por padrão):
//   · primeiro quadro desenhado e tempo até o último GLB e o terreno carregarem (abertura fria e com cache);
//   · tempo de CPU de cada renderer.render() (envio dos comandos; vale entre duas versões, não depende de GPU);
//   · intervalo entre quadros (rAF), com renderização por software (SwiftShader): serve para comparar versões
//     na mesma máquina, não para prever o fps de um celular;
//   · draws, triângulos e programas de shader.
//
// Precisa de um Worker rodando com moedas de teste, para semear os prédios (sem elas só cabem poucos):
//   npx wrangler dev --port 8787 --var CITYOU_TEST_OPEN_REGIONS:1
//   CITYOU_CHROME=/opt/pw-browsers/chromium node tools/city-frame-bench.mjs http://127.0.0.1:8787
//
// Opções: --sizes 0,25 (prédios semeados; no Rio com as quatro ruas do bench cabem 25) · --runs 3 · --cpu 4 (fator de lentidão; 1 desliga) · --network 4g|none
//         --label texto · --json (uma linha de JSON por cenário no fim)
// Para comparar duas versões, rode alternando (antes, depois, antes, depois) e compare as medianas.
import { chromium, browserOptions } from './runtime.mjs'

const args = process.argv.slice(2)
const positional = args.filter((arg, i) => !arg.startsWith('--') && !(args[i - 1]?.startsWith('--') && !['--json'].includes(args[i - 1])))
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const base = positional[0] ?? 'http://127.0.0.1:8787'
const SIZES = option('sizes', '0,25').split(',').map(Number)
const RUNS = Math.max(1, Number(option('runs', 3)))
const CPU = Number(option('cpu', 4))
const NETWORK = option('network', '4g')
const LABEL = option('label', 'medição')
const LOCATION = 'cristo-redentor'
const FRAMES = 90
const MODEL_KINDS = ['rio-feira-barraca', 'rio-laje', 'rio-quiosque-coco', 'rio-academia', 'rio-salva-vidas', 'rio-bonde', 'rio-casarao', 'rio-igreja', 'rio-edificio-deco']

const median = values => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null
const round = (value, digits = 1) => value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits

/** Uma sessão de demonstração nova: o Worker põe o cookie ao servir /app. */
async function newSession() {
  const response = await fetch(base + '/app', { redirect: 'manual' })
  const cookie = response.headers.getSetCookie?.()[0]?.split(';')[0]
  if (!cookie) throw new Error('O Worker não devolveu o cookie da demonstração (o site exige login?).')
  return cookie
}

async function api(cookie, path, body) {
  const headers = { Cookie: cookie, Origin: new URL(base).origin, 'X-Fifones-City': '1', 'Content-Type': 'application/json' }
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined })
  return { ok: response.ok, status: response.status, json: await response.json().catch(() => ({})) }
}

/** Estende as ruas e constrói até `count` prédios com modelo; o servidor decide quais lotes valem. */
async function seed(cookie, count) {
  const action = body => api(cookie, `/api/city/actions?local=${LOCATION}`, { ...body, request_id: crypto.randomUUID() })
  let city = (await api(cookie, `/api/city?local=${LOCATION}`)).json
  if (!city.revision && city.revision !== 0) throw new Error('GET /api/city não devolveu a cidade: o Worker está no ar?')
  if (!count) return { built: 0, credits: city.credits, placements: city.placements.length }
  if (!city.test_mode) console.error('Aviso: o Worker não está em modo de teste (sem CITYOU_TEST_OPEN_REGIONS): poucas moedas, só caberão alguns prédios.')
  // Ruas em três corredores, para haver frente de rua para os prédios. Falhas (água, encosta) são ignoradas.
  for (const [x, y, endX, endY] of [[10, 9, 16, 9], [6, 9, 0, 9], [8, 9, 8, 16], [8, 9, 8, 2]]) {
    city = (await action({ type: 'road_path', x, y, end_x: endX, end_y: endY, expected_revision: city.revision })).json.revision !== undefined
      ? (await api(cookie, `/api/city?local=${LOCATION}`)).json : city
  }
  let built = 0, revision = city.revision
  for (let y = city.grid_min; y <= city.grid_max && built < count; y++) {
    for (let x = city.grid_min; x <= city.grid_max && built < count; x++) {
      const result = await action({ type: 'build', kind: MODEL_KINDS[built % MODEL_KINDS.length], x, y, expected_revision: revision })
      if (result.ok) { built++; revision = result.json.revision }
    }
  }
  city = (await api(cookie, `/api/city?local=${LOCATION}`)).json
  return { built, credits: city.credits, placements: city.placements.length }
}

const browser = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const summary = []
try {
  for (const size of SIZES) {
    const runs = []
    let seeded = null
    for (let run = 0; run < RUNS; run++) {
      const cookie = await newSession()
      seeded = await seed(cookie, size)
      const final = (await api(cookie, `/api/city?local=${LOCATION}`)).json
      const withModel = new Set(final.catalog.filter(item => item.model).map(item => item.id))
      const expectedIds = final.placements.filter(placement => withModel.has(placement.kind)).map(placement => placement.id)
      if (seeded.built < size) console.error(`Aviso: só ${seeded.built} de ${size} prédios couberam (moedas ou lotes).`)
      const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 })
      await context.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=')[1], url: base }])
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(String(error)))
      try {
        const session = await context.newCDPSession(page)
        if (CPU > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: CPU })
        if (NETWORK === '4g') {
          await session.send('Network.enable')
          // Mesmo perfil de tools/pilot-perf.mjs.
          await session.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 500_000, uploadThroughput: 125_000, connectionType: 'cellular4g' })
        }
        const target = `${base}/city.html?local=${LOCATION}`
        // Pronto = há desenho, todo prédio com modelo carregou (ou falhou) e o terreno (que troca o cenário à mão) chegou.
        const ready = () => page.evaluate(expectedIds => new Promise((resolve, reject) => {
          const started = performance.now()
          const check = () => {
            const engine = window.__fifonesCity?.engine
            if (engine?.renderer && engine.renderer.info.render.calls > 0) {
              window.__firstFrame ??= performance.now()
              const modelsDone = engine.pendingModels === 0 && expectedIds.every(id => { const record = engine.records.get(id); return record && (record.loaded || record.error) })
              if (modelsDone && engine.environment?.backdrop?.length === 0) return resolve({ firstFrame: window.__firstFrame, ready: performance.now() })
            }
            if (performance.now() - started > 90_000) return reject(new Error('Tempo esgotado esperando a cidade ficar pronta.'))
            setTimeout(check, 50)
          }
          check()
        }), expectedIds)
        await page.goto(target, { waitUntil: 'commit' })
        const cold = await ready()
        // Estabiliza (compilação de shaders, primeiro desenho com tudo) antes de contar quadros.
        await page.waitForTimeout(1500)
        const measured = await page.evaluate(frames => new Promise(resolve => {
          const engine = window.__fifonesCity.engine
          const render = engine.renderer.render.bind(engine.renderer)
          const cpu = []
          engine.renderer.render = (...rest) => { const from = performance.now(); render(...rest); cpu.push(performance.now() - from) }
          const gaps = []
          let previous
          const tick = now => {
            if (previous !== undefined) gaps.push(now - previous)
            previous = now
            if (gaps.length < frames) requestAnimationFrame(tick)
            else { engine.renderer.render = render; resolve({ gaps, cpu: cpu.slice(-frames), ...engine.stats(), programs: engine.renderer.info.programs?.length ?? null, memory: { geometries: engine.renderer.info.memory.geometries, textures: engine.renderer.info.memory.textures } }) }
          }
          requestAnimationFrame(tick)
        }), FRAMES)
        // Com cache: recarrega e mede de novo a abertura.
        await page.reload({ waitUntil: 'commit' })
        const warm = await ready()
        runs.push({
          firstFrameMs: cold.firstFrame, readyMs: cold.ready, warmFirstFrameMs: warm.firstFrame, warmReadyMs: warm.ready,
          cpuP50: median(measured.cpu), cpuP95: percentile(measured.cpu, 0.95), gapP50: median(measured.gaps), gapP95: percentile(measured.gaps, 0.95),
          drawCalls: measured.drawCalls, triangles: measured.triangles, programs: measured.programs, placements: measured.placements,
          modelsLoaded: measured.modelsLoaded, modelErrors: measured.modelErrors.length, textures: measured.memory.textures, geometries: measured.memory.geometries,
          pageErrors: errors.length,
        })
      } finally { await context.close() }
    }
    const field = name => runs.map(run => run[name])
    const row = {
      label: LABEL, buildings: size, built: seeded.built, runs: RUNS, cpuSlowdown: CPU, network: NETWORK,
      firstFrameMs: round(median(field('firstFrameMs')), 0), readyMs: round(median(field('readyMs')), 0),
      warmReadyMs: round(median(field('warmReadyMs')), 0),
      renderCpuMsP50: round(median(field('cpuP50')), 2), renderCpuMsP95: round(median(field('cpuP95')), 2),
      frameGapMsP50: round(median(field('gapP50')), 1), frameGapMsP95: round(median(field('gapP95')), 1),
      drawCalls: median(field('drawCalls')), triangles: median(field('triangles')), programs: median(field('programs')),
      placements: median(field('placements')), modelsLoaded: median(field('modelsLoaded')), modelErrors: Math.max(...field('modelErrors')),
      textures: median(field('textures')), geometries: median(field('geometries')), pageErrors: Math.max(...field('pageErrors')),
      // Quanto as rodadas diferem entre si (maior valor / menor valor na CPU de render): a medida só vale se for pequena.
      spreadRenderCpu: round(Math.max(...field('cpuP50')) / Math.min(...field('cpuP50')), 2),
    }
    summary.push(row)
  }
} finally { await browser.close() }

console.log(`${base} · ${LABEL} · CPU ${CPU}× mais lenta · rede ${NETWORK} · ${RUNS} rodadas (mediana)`)
console.log('prédios  1º quadro  pronto  c/cache  CPU render p50/p95   rAF p50/p95   draws  triângulos  programas  texturas  erros  dispersão')
for (const row of summary) {
  console.log([
    String(row.built).padStart(7), `${row.firstFrameMs} ms`.padStart(10), `${row.readyMs} ms`.padStart(8), `${row.warmReadyMs} ms`.padStart(8),
    `${row.renderCpuMsP50} / ${row.renderCpuMsP95} ms`.padStart(20), `${row.frameGapMsP50} / ${row.frameGapMsP95} ms`.padStart(14),
    String(row.drawCalls).padStart(6), String(row.triangles).padStart(11), String(row.programs).padStart(10), String(row.textures).padStart(9),
    String(row.modelErrors + row.pageErrors).padStart(6), `${row.spreadRenderCpu}×`.padStart(10),
  ].join('  '))
}
if (args.includes('--json')) for (const row of summary) console.log(JSON.stringify(row))
