// Mede a abertura do mapa-mundo num "celular médio" simulado:
// CPU 4x mais lenta e rede "Slow 4G" (150 ms de latência, 1,6 Mbps).
// Uso: npm run build && node tools/world-perf.mjs [--runs 3] [--label antes]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { chromium, browserOptions } from './runtime.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const RUNS = Number(option('runs', 3))
const LABEL = option('label', 'medição')
const DIST = path.resolve('dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.glb': 'model/gltf-binary' }
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg'])

if (!fs.existsSync(path.join(DIST, 'world.html'))) throw new Error('dist/world.html não existe: rode npm run build antes.')

// Servidor estático com gzip e 404 de verdade, como numa hospedagem de produção.
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = path.join(DIST, path.normalize(url))
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return }
  const ext = path.extname(file)
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' }
  if (req.method === 'HEAD') { res.writeHead(200, headers).end(); return }
  const body = fs.readFileSync(file)
  if (COMPRESSIBLE.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' }).end(zlib.gzipSync(body))
  }
  else res.writeHead(200, headers).end(body)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const median = values => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const browser = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const runs = []
try {
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.addInitScript(() => {
      window.__longTasks = []
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, duration: e.duration }) }).observe({ type: 'longtask', buffered: true })
    })
    await page.goto(`${base}/world.html`, { waitUntil: 'commit' })
    await page.waitForFunction(() => performance.getEntriesByName('world:first-frame').length > 0, null, { timeout: 180000 })
    await page.waitForFunction(() => performance.getEntriesByName('world:model-probe').length > 0, null, { timeout: 180000 })
    // Espera os GLB terminarem de baixar (a lista diz quantos são), para a conta de KB não depender de
    // quantos modelos couberam numa janela fixa. Os modelos chegam depois do primeiro quadro.
    const expected = await page.evaluate(async () => {
      for (const name of ['models.json', 'manifest.json']) {
        try {
          const response = await fetch(`/models/world/${name}`)
          if (!response.ok) continue
          const list = await response.json()
          return Array.isArray(list) ? list.length : Object.keys(list).length
        }
        catch { /* tenta a próxima lista */ }
      }
      return 0
    })
    const glbs = () => performance.getEntriesByType('resource').filter(r => /\.glb(\?|$)/.test(r.name))
    await page.waitForFunction(`(${glbs})().length >= ${expected}`, null, { timeout: 180000 })
    await page.waitForTimeout(1000)
    runs.push(await page.evaluate(() => {
      const one = name => performance.getEntriesByName(name)[0]
      const firstFrame = one('world:first-frame').startTime
      const all = performance.getEntriesByType('resource')
      const models = all.filter(r => /\.glb(\?|$)/.test(r.name))
      // A abertura é tudo menos os modelos e a conferência da lista feita por esta ferramenta.
      const resources = all.filter(r => !models.includes(r) && r.startTime <= one('world:model-probe').startTime + one('world:model-probe').duration)
      const tasks = window.__longTasks.filter(t => t.start < firstFrame + 500)
      const probes = resources.filter(r => r.name.includes('/models/world/'))
      const scripts = resources.filter(r => r.name.endsWith('.js'))
      return {
        firstFrameMs: Math.round(firstFrame),
        terrainMs: Math.round(one('world:terrain')?.duration ?? -1),
        markersMs: Math.round(one('world:markers')?.duration ?? -1),
        longTaskMs: Math.round(tasks.reduce((sum, t) => sum + t.duration, 0)),
        blockingMs: Math.round(tasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)),
        longestTaskMs: Math.round(Math.max(0, ...tasks.map(t => t.duration))),
        // Maior passo de JavaScript depois do primeiro quadro (troca do terreno, nuvens, cada marcador).
        maxInitStepMs: Math.round(Math.max(0, ...performance.getEntriesByType('measure').filter(m => m.name.startsWith('world:step:')).map(m => m.duration))),
        readyMs: Math.round(one('world:ready')?.startTime ?? -1),
        modelProbeMs: Math.round(one('world:model-probe').duration),
        modelRequests: probes.length,
        // Modelos: quando o primeiro e o último GLB terminaram de chegar, e quanto pesam.
        firstModelMs: Math.round(Math.min(...models.map(r => r.responseEnd))),
        lastModelMs: Math.round(Math.max(...models.map(r => r.responseEnd))),
        modelsKB: Math.round(models.reduce((sum, r) => sum + r.transferSize, 0) / 1024),
        // JavaScript baixado só quando há GLB (carregador, decodificador), depois da abertura.
        lateJsKB: Math.round(all.filter(r => r.name.endsWith('.js') && !resources.includes(r)).reduce((sum, r) => sum + r.transferSize, 0) / 1024),
        requests: resources.length + 1,
        jsKB: Math.round(scripts.reduce((sum, r) => sum + r.transferSize, 0) / 1024),
        totalKB: Math.round((resources.reduce((sum, r) => sum + r.transferSize, 0) + performance.getEntriesByType('navigation')[0].transferSize) / 1024),
        // Detalhe para diagnóstico (fica no JSON, fora da tabela): [início, duração] de cada tarefa longa.
        detail: { tasks: window.__longTasks.map(t => [Math.round(t.start), Math.round(t.duration)]), measures: performance.getEntriesByType('measure').map(m => [m.name, Math.round(m.startTime), Math.round(m.duration)]) },
      }
    }))
    await context.close()
  }
}
finally {
  await browser.close()
  server.close()
}

const result = Object.fromEntries(Object.keys(runs[0]).filter(key => key !== 'detail').map(key => [key, median(runs.map(r => r[key]))]))
fs.mkdirSync('.verification', { recursive: true })
fs.writeFileSync(`.verification/world-perf-${LABEL}.json`, JSON.stringify({ label: LABEL, runs, median: result }, null, 2))
console.log(`Mapa-mundo, ${LABEL} (mediana de ${RUNS}; CPU 4x, Slow 4G, 412x915):`)
console.table(result)
