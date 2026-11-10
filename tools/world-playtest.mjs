// Teste de ponta a ponta do mapa-mundo com o backend real e banco temporário.
// Uso: npm run build && node tools/world-playtest.mjs
// Em sessão na nuvem: CITYOU_CHROME=/opt/pw-browsers/chromium node tools/world-playtest.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { devices } from 'playwright'
import { chromium, python, browserOptions } from './runtime.mjs'

const PORT = 8878
const BASE = `http://127.0.0.1:${PORT}`
const KEY = 'buildu:world-progress:v1'
fs.mkdirSync('.verification', { recursive: true })
const temp = fs.mkdtempSync(path.resolve('.verification/world-'))
const server = spawn(python, ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', String(PORT), '--log-level', 'warning'],
  { env: { ...process.env, CITY_DATA_DIR: temp, FIFONES_UPSTREAM: 'http://127.0.0.1:9' }, stdio: 'ignore', windowsHide: true })

async function ready(url) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) return } catch { /* ainda subindo */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`servidor não respondeu: ${url}`)
}
const api = async () => (await fetch(`${BASE}/api/world/progress`)).json()
const results = []
let browser

async function open(contextOptions = { viewport: { width: 1100, height: 760 } }) {
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${BASE}/world.html?debug=1`)
  await page.waitForFunction(() => window.__buildUWorld?.isReady, null, { timeout: 90000 })
  await page.keyboard.press('d') // fecha o painel de debug; o globo segue acessível em window.__buildUWorld
  return { context, page, errors }
}
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), KEY)
const settle = page => page.waitForFunction(() => !window.__buildUWorld.cinematic && !window.__buildUWorld.flying, null, { timeout: 60000 })
async function tap(page, id, touch = false) {
  await page.evaluate(id => window.__buildUWorld.focusSpace(id), id)
  await settle(page)
  const p = await page.evaluate(id => window.__buildUWorld.projectMarker(id), id)
  if (touch) await page.touchscreen.tap(p.x, p.y + 24)
  else await page.mouse.click(p.x, p.y + 24)
}

try {
  await ready(`${BASE}/api/health`)
  browser = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

  // 1. Abertura
  const a = await open()
  assert.equal(await a.page.evaluate(() => window.__buildUWorld.markers.size), 8)
  assert.deepEqual((await api()).desbloqueados, ['ilha-inicial'])
  results.push('abre com 8 marcadores e só a ilha desbloqueada')

  // 2. Espaço bloqueado
  await tap(a.page, 'cristo-redentor')
  await a.page.waitForSelector('.world-map__tooltip.is-visible')
  assert.match(await a.page.locator('.world-map__tooltip').innerText(), /Complete Ilha Inicial para desbloquear/)
  results.push('toque em bloqueado mostra o tooltip do espaço anterior')

  // 3. Abrir e concluir: a tela muda na hora, o servidor recebe em segundo plano
  await tap(a.page, 'ilha-inicial')
  await a.page.waitForSelector('.world-app__sheet')
  assert.equal(await a.page.locator('.world-app__sheet h1').innerText(), 'Ilha Inicial')
  await a.page.locator('.world-app__sheet .is-primary').click()
  assert.deepEqual((await stored(a.page)).concluidos, ['ilha-inicial'])
  await a.page.waitForFunction(() => window.__buildUWorld.markers.get('cristo-redentor').shown.desbloqueado, null, { timeout: 60000 })
  results.push('open-world abre o painel; concluir salva na hora e desbloqueia o Cristo')
  for (let i = 0; i < 30 && !(await api()).concluidos.length; i++) await a.page.waitForTimeout(200)
  assert.deepEqual((await api()).concluidos, ['ilha-inicial'])
  assert.deepEqual((await api()).desbloqueados, ['ilha-inicial', 'cristo-redentor'])
  results.push('o backend recebeu o progresso em segundo plano')

  // 4. Outro navegador, sem nada salvo, recebe o progresso do servidor
  const b = await open()
  await b.page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').concluidos?.length === 1, KEY, { timeout: 30000 })
  await b.page.waitForFunction(() => window.__buildUWorld.markers.get('cristo-redentor').state.desbloqueado, null, { timeout: 30000 })
  results.push('um segundo navegador recebe o progresso do servidor')

  // 5. Reset num navegador vence no outro (época nova)
  await settle(a.page)
  await a.page.keyboard.press('d')
  await a.page.locator('.world-map__debug .is-danger').click()
  for (let i = 0; i < 30 && (await api()).epoca !== 1; i++) await a.page.waitForTimeout(200)
  const afterReset = await api()
  assert.deepEqual([afterReset.epoca, afterReset.concluidos, afterReset.desbloqueados], [1, [], ['ilha-inicial']])
  await b.page.reload()
  await b.page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').epoca === 1, KEY, { timeout: 30000 })
  assert.deepEqual((await stored(b.page)).concluidos, [])
  results.push('reset num navegador vale no servidor e no outro navegador')

  // 6. Celular: toque e alvos de pelo menos 44 px
  const m = await open({ ...devices['Pixel 7'] })
  const targets = await m.page.evaluate(() => {
    const g = window.__buildUWorld
    const pxPerUnit = g.viewportHeight / (2 * Math.tan(g.camera.fov * Math.PI / 360))
    return [...g.markers.values()].map(k => k.proxyRadius * 2 * k.hitProxy.scale.x * pxPerUnit / g.camera.position.distanceTo(k.root.position))
  })
  assert.ok(targets.every(px => px >= 43.5), `alvos de toque: ${targets.map(Math.round).join(', ')}`)
  await tap(m.page, 'ilha-inicial', true)
  await m.page.waitForSelector('.world-app__sheet')
  results.push('no celular os 8 alvos têm 44 px e o toque abre o painel')

  const errors = [...a.errors, ...b.errors, ...m.errors]
  assert.deepEqual(errors, [], 'erros no console')
  results.push('nenhum erro no console')
  for (const line of results) console.log(`✓ ${line}`)
}
finally {
  await browser?.close()
  server.kill()
  fs.rmSync(temp, { recursive: true, force: true })
}
