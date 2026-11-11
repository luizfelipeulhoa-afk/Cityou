// Custo por quadro do mapa-mundo num build pronto, com renderização por software (SwiftShader).
// Complementa tools/world-perf.mjs (abertura): aqui a cena já está montada, com os GLB carregados.
// Mede, em quatro enquadramentos, os quadros desenhados por segundo com a cena ativa (sem a pausa de
// ociosidade), o tempo de CPU de cada tick (JavaScript + envio dos comandos) e os draws/triângulos.
// Por software, o custo por pixel pesa muito mais que num aparelho com GPU: os fps servem para comparar
// duas versões na mesma máquina, não para prever o fps de um celular.
//
// Uso: npm run build && node tools/world-frame-bench.mjs [--label depois] [--dist dist] [--runs 3]
// Para comparar duas versões, rode alternando (antes, depois, antes, depois) e compare as medianas.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, browserOptions } from './runtime.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const LABEL = option('label', 'medição')
const DIST = path.resolve(option('dist', 'dist'))
const RUNS = Number(option('runs', 3))
const SECONDS = 5
const KEY = 'buildu:world-progress:v1'
const IDS = ['ilha-inicial', 'cristo-redentor', 'machu-picchu', 'chichen-itza', 'coliseu', 'petra', 'taj-mahal', 'grande-muralha']
const SCENES = [
  { name: 'visão geral', id: 'taj-mahal', distance: 'overviewDistance' },
  { name: 'foco no Taj Mahal', id: 'taj-mahal', distance: 'focusDistance' },
  { name: 'foco no Cristo (mar)', id: 'cristo-redentor', distance: 'focusDistance' },
  { name: 'foco na Ilha (mar)', id: 'ilha-inicial', distance: 'focusDistance' },
]
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' }

if (!fs.existsSync(path.join(DIST, 'world.html'))) throw new Error(`${DIST}/world.html não existe: rode npm run build antes.`)

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = path.join(DIST, path.normalize(url))
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const browser = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = {}
try {
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    // Sete espaços abertos e três concluídos: anéis, estrelas, trilha e caminho ativo todos na tela.
    await page.addInitScript(([key, ids]) => {
      localStorage.setItem(key, JSON.stringify({ versao: 1, epoca: 0, desbloqueados: ids.slice(0, 7), concluidos: ids.slice(0, 3) }))
    }, [KEY, IDS])
    await page.goto(`${base}/world.html?debug=1`)
    await page.waitForFunction(() => window.__buildUWorld?.isReady, null, { timeout: 120000 })
    await page.waitForFunction(() => [...window.__buildUWorld.markers.values()].filter(m => m.modelSource === 'glb').length >= 7, null, { timeout: 120000 })
    await page.keyboard.press('d') // fecha o painel de debug; o globo segue em window.__buildUWorld
    await page.waitForTimeout(1500)
    await page.evaluate(() => {
      const g = window.__buildUWorld
      g.renderer.setPixelRatio(1); g.pixelRatio = 1; g.resize()
      g.measure = () => {} // sem redução automática de resolução durante a medida
      const render = g.renderer.render.bind(g.renderer)
      const tick = g.tick.bind(g)
      const bench = window.__bench = { frames: 0, cpu: [] }
      let drew = false
      g.renderer.render = (...a) => { drew = true; return render(...a) }
      g.tick = () => {
        g.lastInteraction = performance.now() // cena ativa: todo tick desenha
        drew = false
        const start = performance.now()
        tick()
        if (drew) { bench.frames++; bench.cpu.push(performance.now() - start) }
      }
    })
    for (const scene of SCENES) {
      await page.evaluate(({ id, distance }) => { const g = window.__buildUWorld; return g.flyTo(id, { duration: 0.01, distance: g[distance] }) }, scene)
      await page.waitForTimeout(1200)
      const result = await page.evaluate(seconds => new Promise((resolve) => {
        const bench = window.__bench
        bench.frames = 0; bench.cpu = []
        const start = performance.now()
        setTimeout(() => {
          const cpu = bench.cpu.slice().sort((a, b) => a - b)
          const info = window.__buildUWorld.renderer.info.render
          resolve({
            fps: +(bench.frames / ((performance.now() - start) / 1000)).toFixed(1),
            cpuMs: +(cpu[Math.floor(cpu.length / 2)] ?? 0).toFixed(2),
            draws: info.calls, triangles: info.triangles,
          })
        }, seconds * 1000)
      }), SECONDS)
      ;(results[scene.name] ||= []).push(result)
    }
    await context.close()
  }
}
finally {
  await browser.close()
  server.close()
}

const summary = Object.fromEntries(Object.entries(results).map(([name, list]) => [name, Object.fromEntries(Object.keys(list[0]).map(key => [key, median(list.map(r => r[key]))]))]))
fs.mkdirSync('.verification', { recursive: true })
fs.writeFileSync(`.verification/world-frame-${LABEL}.json`, JSON.stringify({ label: LABEL, results, median: summary }, null, 2))
console.log(`Mapa-mundo, custo por quadro, ${LABEL} (mediana de ${RUNS}; software, 412x915, dpr 1):`)
console.table(summary)
