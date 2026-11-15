// Escrita otimista na cidade (docs/LATENCIA.md, item 4): com o servidor atrasado 800 ms, a árvore aparece em < 50 ms;
// num 409, a peça provisória some e as moedas voltam. Uso: node tools/optimistic-playtest.mjs http://127.0.0.1:8886
// (Worker local servindo o dist: npm run build && npx wrangler dev --port 8886 --ip 127.0.0.1 --var CITYOU_TEST_OPEN_REGIONS:1)
import { chromium, browserOptions } from './runtime.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:8886'
const browser = await chromium.launch(browserOptions)
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
const errors = []; page.on('pageerror', e => errors.push(String(e)))
const log = (n, ok, d = '') => console.log(`${ok ? 'OK ' : 'FALHOU'} ${n} ${d}`)
let mode = 'delay', serverCity = null
await page.route('**/api/city/actions*', async route => {
  if (mode === 'delay') { await new Promise(r => setTimeout(r, 800)); return route.continue() }
  const city = serverCity
  await new Promise(r => setTimeout(r, 400))
  await route.fulfill({ status: 409, json: { message: 'A cidade mudou.', city } })
})
await page.goto(BASE + '/city.html')
await page.waitForFunction(() => window.__fifonesCity?.engine && window.__fifonesCity.state, null, { timeout: 60000 })
await page.waitForTimeout(4000)
const trees = () => page.evaluate(() => window.__fifonesCity.state.placements.filter(p => p.kind === 'tree').length)
const engineCount = () => page.evaluate(() => window.__fifonesCity.engine.stats().placements)
async function tryBuild(x, y) {
  await page.locator('.catalog-card', { hasText: 'Árvore' }).first().click()
  const t0 = Date.now()
  await page.evaluate(([x, y]) => window.__fifonesCity.engine.callbacks.onTile({ x, y }), [x, y])
  const before = await engineCount()
  return { t0, before }
}
const n0 = await trees(), e0 = await engineCount()
await page.locator('.catalog-card', { hasText: 'Árvore' }).first().click()
const measured = await page.evaluate(async n => {
  const t = performance.now()
  window.__done = window.__fifonesCity.engine.callbacks.onTile({ x: 7, y: 8 })
  while (window.__fifonesCity.state.placements.filter(p => p.kind === 'tree').length <= n) await new Promise(r => setTimeout(r, 1))
  return performance.now() - t
}, n0)
log('árvore aparece antes da resposta (servidor atrasado 800 ms)', measured < 50, `${measured.toFixed(1)} ms`)
const done = page.evaluate(() => window.__done)
await done; await page.waitForTimeout(1500)
const s1 = await page.evaluate(() => ({ ids: window.__fifonesCity.state.placements.filter(p => p.kind === 'tree').map(p => p.id), rev: window.__fifonesCity.state.revision, count: window.__fifonesCity.engine.stats().placements }))
log('depois da resposta: id real, sem peça provisória, engine igual ao estado', s1.ids.every(id => !id.startsWith('pendente-')) && s1.count === e0 + 1, JSON.stringify(s1))
mode = 'conflict'
serverCity = await page.evaluate(() => JSON.parse(JSON.stringify(window.__fifonesCity.state)))
const c0 = await page.evaluate(() => window.__fifonesCity.state.credits)
const conflict = page.evaluate(() => window.__fifonesCity.engine.callbacks.onTile({ x: 9, y: 8 }))
await page.waitForTimeout(150)
const during = await trees()
log('durante o pedido a peça já aparece', during === n0 + 2, String(during))
await conflict; await page.waitForTimeout(500)
const s2 = await page.evaluate(() => ({ trees: window.__fifonesCity.state.placements.filter(p => p.kind === 'tree').length, credits: window.__fifonesCity.state.credits, count: window.__fifonesCity.engine.stats().placements }))
log('409: a peça provisória some e as moedas voltam', s2.trees === n0 + 1 && s2.credits === c0 && s2.count === e0 + 1, JSON.stringify(s2))
log('sem erro de página', !errors.length, errors.join(' | '))
await browser.close()
