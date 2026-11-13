// Fotografa a cidade do Rio (city.html) em vistas fixas, para comparar o visual antes e depois de uma mudança
// de luz, material ou terreno. As imagens vão para .verification/ (fora do git). Também imprime o que o motor
// usa hoje: sombras, tone mapping, materiais por tipo e luzes, para conferir os limites do CLAUDE.md.
//
//   npx wrangler dev --port 8787 --ip 127.0.0.1 --var CITYOU_TEST_OPEN_REGIONS:1
//   CITYOU_CHROME=/opt/pw-browsers/chromium node tools/city-look.mjs http://127.0.0.1:8787 --label antes [--buildings 14]
import fs from 'node:fs'
import { chromium, browserOptions } from './runtime.mjs'
import { createSeeder, LOCATION } from './lib/city-seed.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const base = args.find(arg => /^https?:/.test(arg)) ?? 'http://127.0.0.1:8787'
const label = option('label', 'foto')
const buildings = Number(option('buildings', 14))
const { newSession, api, seed } = createSeeder(base)

const cookie = await newSession()
const seeded = await seed(cookie, buildings)
const city = (await api(cookie, `/api/city?local=${LOCATION}`)).json
const withModel = new Set(city.catalog.filter(item => item.model).map(item => item.id))
const expectedIds = city.placements.filter(placement => withModel.has(placement.kind)).map(placement => placement.id)
fs.mkdirSync('.verification', { recursive: true })

const browser = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })
  await context.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=')[1], url: base }])
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${base}/city.html?local=${LOCATION}`, { waitUntil: 'commit' })
  await page.evaluate(ids => new Promise((resolve, reject) => {
    const started = performance.now()
    const check = () => {
      const engine = window.__fifonesCity?.engine
      const done = engine?.renderer && engine.renderer.info.render.calls > 0 && engine.pendingModels === 0 &&
        ids.every(id => { const record = engine.records.get(id); return record && (record.loaded || record.error) }) &&
        engine.environment?.backdrop?.length === 0
      if (done) return resolve()
      if (performance.now() - started > 90_000) return reject(new Error('Tempo esgotado esperando a cidade.'))
      setTimeout(check, 100)
    }
    check()
  }), expectedIds)
  await page.waitForTimeout(1500)
  const shot = async name => { await page.waitForTimeout(700); await page.screenshot({ path: `.verification/city-${label}-${name}.png` }) }
  await shot('vista')
  await page.evaluate(() => { const e = window.__fifonesCity.engine; e.rotateCamera(); e.rotateCamera() })
  await shot('vista-girada')
  const target = expectedIds[Math.floor(expectedIds.length / 2)]
  if (target) { await page.evaluate(id => { const e = window.__fifonesCity.engine; e.focus(id); e.setSelected(null); e.controls.object.position.sub(e.controls.target).multiplyScalar(0.45).add(e.controls.target); e.controls.update() }, target); await shot('perto') }
  const report = await page.evaluate(() => {
    const engine = window.__fifonesCity.engine
    const kinds = {}, lights = {}
    engine.scene.traverse(object => {
      if (object.isLight) lights[object.type] = (lights[object.type] ?? 0) + 1
      if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) kinds[material.type] = (kinds[material.type] ?? 0) + 1
    })
    const names = { 0: 'nenhum', 1: 'Linear', 2: 'Reinhard', 3: 'Cineon', 4: 'ACESFilmic', 7: 'Neutral' }
    return { shadowMap: engine.renderer.shadowMap.enabled, toneMapping: names[engine.renderer.toneMapping] ?? engine.renderer.toneMapping, materials: kinds, lights, stats: engine.stats() && { drawCalls: engine.renderer.info.render.calls, triangles: engine.renderer.info.render.triangles } }
  })
  console.log(JSON.stringify({ label, built: seeded.built, ...report, pageErrors: errors }, null, 1))
  console.log(`Imagens em .verification/city-${label}-*.png`)
} finally { await browser.close() }
