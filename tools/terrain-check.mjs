// Confere a página de teste do terreno (/terrain.html) no navegador, servida pelo dev server do Vite:
// carrega sem erro, os prédios de exemplo assentam no platô, um toque num lote livre constrói, lote ocupado,
// decorativo ou bloqueado recusa, a sobreposição das zonas bloqueadas liga, e as vistas dos marcos são gravadas.
// Com --perf, mede também o custo por quadro (por software: serve para comparar versões, não para prever um celular).
// Com --dist, confere a página já construída (npm run build) em vez do dev server.
// Uso: node tools/terrain-check.mjs [--perf] [--dist]
// Em sessão na nuvem: CITYOU_CHROME=/opt/pw-browsers/chromium node tools/terrain-check.mjs
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium, browserOptions } from './runtime.mjs'

const PORT = 5189
const OUT = '.verification'
const PERF = process.argv.includes('--perf')
const DIST = process.argv.includes('--dist') ? path.resolve('dist') : null
fs.mkdirSync(OUT, { recursive: true })

let server
if (DIST) {
  if (!fs.existsSync(path.join(DIST, 'terrain.html'))) throw new Error('dist/terrain.html não existe: rode npm run build antes.')
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' }
  const files = http.createServer((request, response) => {
    const file = path.join(DIST, path.normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname)))
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end(); return }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file))
  })
  await new Promise(resolve => files.listen(PORT, '127.0.0.1', resolve))
  server = { close: () => new Promise(resolve => files.close(resolve)) }
}
else {
  server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: PORT, strictPort: true } })
  await server.listen()
}
const browser = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const lines = []

async function open(viewport, { throttle = 0 } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`) })
  if (throttle) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle })
  await page.goto(`http://127.0.0.1:${PORT}/terrain.html`)
  await page.waitForFunction(() => window.__terrainLab?.ready, null, { timeout: 240000 })
  return { page, errors }
}
const settle = page => page.waitForTimeout(700)
const frame = page => page.evaluate(() => {
  const lab = window.__terrainLab, info = lab.context.renderer.instance.info.render
  return { triangles: info.triangles, calls: info.calls, fogNear: Math.round(lab.stage.fog.near), fogFar: Math.round(lab.stage.fog.far) }
})

try {
  // ---- 1. Carga e prédios de exemplo ----
  const { page, errors } = await open({ width: 1280, height: 720 })
  const stats = await page.evaluate(() => window.__terrainLab.data.stats)
  assert.ok(stats.triangles <= 60000, `terreno com ${stats.triangles} triângulos`)
  await settle(page)
  const first = await frame(page)
  assert.ok(first.triangles > stats.triangles, 'o terreno foi desenhado')
  lines.push(`carga: terreno com ${stats.triangles} triângulos (${stats.trees} árvores, ${stats.palms} palmeiras), montado em ${Math.round(stats.milliseconds)} ms`)
  lines.push(`quadro inicial: ${first.triangles} triângulos em ${first.calls} draws, névoa de ${first.fogNear} a ${first.fogFar}`)
  const seats = await page.evaluate(() => window.__terrainLab.inspect())
  assert.equal(seats.length, 4, 'três prédios em código e um GLB')
  for (const seat of seats) {
    assert.equal(seat.y, 0, 'o platô fica em y = 0')
    assert.equal(seat.y, seat.ground, 'o assento usa getHeightAt')
    assert.ok(Math.abs(seat.discBottom - seat.ground) < 1e-6, `disco do prédio ${seat.size}×${seat.size} encosta no terreno`)
    assert.ok(Math.abs(seat.buildingBottom - seat.discTop) < 1e-4, `prédio ${seat.size}×${seat.size} encosta no disco (${seat.buildingBottom} e ${seat.discTop})`)
    assert.ok(seat.width <= seat.size + 1e-6 && seat.width > seat.size * 0.5, `prédio ${seat.size}×${seat.size} cabe na área`)
  }
  lines.push(`prédios de exemplo: ${seats.map(seat => `${seat.size}×${seat.size} no lote (${seat.lot.x}, ${seat.lot.z})`).join(', ')}; todos com o disco no terreno e o prédio no disco`)
  await page.screenshot({ path: `${OUT}/terrain-inicio.png` })

  // ---- 2. Toque: constrói no lote livre, recusa no ocupado, no decorativo e no bloqueado ----
  const targets = await page.evaluate(() => {
    const lab = window.__terrainLab, { lots } = lab.data
    const used = new Set(lab.inspect().flatMap(seat => Array.from({ length: seat.size ** 2 }, (_, k) => `${seat.lot.x + k % seat.size},${seat.lot.z + Math.floor(k / seat.size)}`)))
    const near = (kind, size) => lots.playable
      .filter(lot => lots.kindAt(lot) === kind && (kind !== 'free' || (lab.data.isBuildable(lot, size) && !Array.from({ length: size * size }, (_, k) => `${lot.x + k % size},${lot.z + Math.floor(k / size)}`).some(cell => used.has(cell)))))
      .map((lot) => { const c = lots.footprintCenter(lot, size); return { lot, screen: lab.project(c.x, 0, c.z), distance: Math.hypot(c.x - 4, c.z - 2) } })
      .filter(item => item.screen.visible && item.screen.y > 140 && item.screen.y < 640)
      .sort((a, b) => a.distance - b.distance)[0]
    // Um lote bloqueado de morro, atrás da zona jogável, e outro no mar, à frente.
    const hill = lots.getBlockedAreas().flatMap(area => [{ x: area.x + Math.floor(area.width / 2), z: area.z + area.depth - 1 }])
      .map(lot => ({ lot, y: lab.data.getHeightAt(lot.x, lot.z) })).filter(item => item.y > 1.5)
      .map(item => ({ ...item, screen: lab.project(item.lot.x, item.y, item.lot.z) })).find(item => item.screen.visible && item.screen.y > 140)
    const sea = { lot: { x: 2, z: 12 }, screen: lab.project(2, lab.data.seaY, 12) }
    return { free: near('free', 2), decorative: near('decorative', 1), hill, sea }
  })
  const count = () => page.evaluate(() => window.__terrainLab.buildings.children.length)
  const note = () => page.locator('.lab-note').innerText()
  const tap = async ({ screen }) => { await page.mouse.click(screen.x, screen.y); await page.waitForTimeout(250) }
  assert.ok(targets.free && targets.decorative && targets.hill && targets.sea.screen.visible, 'os quatro alvos do toque estão na tela')
  await tap(targets.free)
  assert.equal(await count(), 5, `toque no lote livre (${targets.free.lot.x}, ${targets.free.lot.z}) constrói`)
  assert.match(await note(), /assentado/)
  await tap(targets.free)
  assert.equal(await count(), 5, 'lote ocupado recusa')
  assert.match(await note(), /recusado.*ocupado/)
  await page.getByLabel('Prédio').selectOption('1')
  await tap(targets.decorative)
  assert.equal(await count(), 5, 'lote decorativo recusa')
  assert.match(await note(), /recusado.*decorativo/)
  await tap(targets.hill)
  assert.equal(await count(), 5, 'lote de morro recusa')
  assert.match(await note(), /recusado.*bloqueado/)
  await tap(targets.sea)
  assert.equal(await count(), 5, 'o mar recusa')
  assert.match(await note(), /recusado.*bloqueado/)
  lines.push('toque: lote livre constrói; ocupado, decorativo, morro e mar recusam')

  // ---- 3. Sobreposição das zonas bloqueadas ----
  await page.getByLabel('zonas bloqueadas').check()
  await settle(page)
  assert.equal(await page.evaluate(() => window.__terrainLab.stage.objects.group.children[3]?.visible), true)
  await page.screenshot({ path: `${OUT}/terrain-bloqueados.png` })
  await page.getByLabel('zonas bloqueadas').uncheck()
  lines.push('sobreposição das zonas bloqueadas: liga e desliga')

  // ---- 4. Vistas dos marcos e poses nos limites da câmera ----
  for (const name of ['Pão de Açúcar', 'Corcovado']) {
    await page.getByRole('button', { name }).click()
    await settle(page)
    const info = await frame(page)
    await page.screenshot({ path: `${OUT}/terrain-${name === 'Corcovado' ? 'corcovado' : 'pao-de-acucar'}.png` })
    lines.push(`vista ${name}: ${info.triangles} triângulos em ${info.calls} draws, névoa de ${info.fogNear} a ${info.fogFar}`)
  }
  const extremes = await page.evaluate(() => {
    const { lots } = window.__terrainLab.data, { limits } = window.__terrainLab.stage, b = lots.bounds
    return [
      { name: 'limite-fundo', x: 0, z: b.minZ, azimuth: 0, polar: limits.maxPolar, distance: limits.maxDistance },
      { name: 'limite-esquerda', x: b.minX, z: b.maxZ, azimuth: Math.PI / 2, polar: limits.maxPolar, distance: limits.minDistance },
      { name: 'limite-direita', x: b.maxX, z: b.maxZ, azimuth: -Math.PI / 2, polar: limits.maxPolar, distance: limits.maxDistance },
      { name: 'limite-mar', x: 0, z: b.maxZ, azimuth: Math.PI, polar: limits.maxPolar, distance: limits.maxDistance },
      { name: 'limite-cima', x: 0, z: 0, azimuth: 0.4, polar: limits.minPolar, distance: limits.maxDistance },
    ]
  })
  for (const pose of extremes) {
    await page.evaluate(view => window.__terrainLab.stage.view(view), pose)
    await settle(page)
    const info = await frame(page)
    await page.screenshot({ path: `${OUT}/terrain-${pose.name}.png` })
    lines.push(`pose ${pose.name}: névoa de ${info.fogNear} a ${info.fogFar}`)
  }
  assert.deepEqual(errors, [], 'erros no console')
  await page.close()

  // ---- 5. Celular em pé ----
  const phone = await open({ width: 412, height: 915 })
  await settle(phone.page)
  await phone.page.screenshot({ path: `${OUT}/terrain-celular.png` })
  await phone.page.getByRole('button', { name: 'Pão de Açúcar' }).click()
  await settle(phone.page)
  await phone.page.screenshot({ path: `${OUT}/terrain-celular-pao-de-acucar.png` })
  assert.deepEqual(phone.errors, [], 'erros no console (celular)')
  await phone.page.close()
  lines.push('celular em pé (412 × 915): carrega sem erro')

  // ---- 6. Custo (opcional) ----
  if (PERF) {
    const slow = await open({ width: 412, height: 915 }, { throttle: 4 })
    const built = await slow.page.evaluate(() => window.__terrainLab.data.stats.milliseconds)
    lines.push(`montagem do terreno com a CPU 4× mais lenta: ${Math.round(built)} ms na thread principal`)
    await slow.page.close()
    const bench = await open({ width: 412, height: 915 })
    for (const [name, view] of [['início', null], ['Corcovado', 'Corcovado'], ['de cima, longe', { x: 0, z: 0, azimuth: 0.4, polar: 0.2, distance: 90 }]]) {
      if (typeof view === 'string') await bench.page.getByRole('button', { name: view }).click()
      else if (view) await bench.page.evaluate(v => window.__terrainLab.stage.view(v), view)
      await settle(bench.page)
      const result = await bench.page.evaluate(() => new Promise((resolve) => {
        const lab = window.__terrainLab, renderer = lab.context.renderer.instance
        const start = performance.now(), first = renderer.info.render.frame
        let cpu = 0
        const tick = () => {
          const before = performance.now()
          renderer.render(lab.context.scene.value, lab.camera) // um quadro inteiro, medido no JavaScript e no envio dos comandos
          cpu += performance.now() - before
          if (performance.now() - start < 4000) requestAnimationFrame(tick)
          else {
            const frames = renderer.info.render.frame - first
            resolve({ fps: frames / ((performance.now() - start) / 1000), cpu: cpu / frames, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls })
          }
        }
        requestAnimationFrame(tick)
      }))
      lines.push(`custo por quadro, ${name}: ${result.fps.toFixed(1)} quadros/s por software, ${result.cpu.toFixed(2)} ms de CPU por quadro, ${result.triangles} triângulos em ${result.calls} draws`)
    }
    await bench.page.close()
  }

  console.log(lines.map(line => `✓ ${line}`).join('\n'))
  console.log(`Imagens em ${OUT}/terrain-*.png`)
}
finally {
  await browser.close()
  await server.close()
}
