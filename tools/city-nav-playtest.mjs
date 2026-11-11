import { chromium, browserOptions } from './runtime.mjs'
import assert from 'node:assert/strict'
const b = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message))
const B = process.argv[2] || 'http://127.0.0.1:8787'
await p.goto(B + '/world.html?debug=1')
await p.waitForFunction(() => window.__buildUWorld?.isReady, null, { timeout: 90000 })
await p.keyboard.press('d')
await p.evaluate(() => window.__buildUWorld.focusSpace('ilha-inicial'))
await p.waitForFunction(() => !window.__buildUWorld.cinematic && !window.__buildUWorld.flying, null, { timeout: 60000 })
const pt = await p.evaluate(() => window.__buildUWorld.projectMarker('ilha-inicial'))
await p.mouse.click(pt.x, pt.y + 24)
await p.waitForURL(/local=ilha-inicial/); await p.waitForSelector('.scenic-note', { timeout: 60000 })
console.log('ilha ok')
// voltar do navegador: não pode sobrar tela de partida
await p.goBack(); await p.waitForTimeout(2500)
console.log('overlay após voltar:', await p.locator('.world-app__departure').count())
await p.goForward(); await p.waitForSelector('.scenic-note', { timeout: 60000 })
// Minha cidade -> Rio
await p.getByRole('button', { name: 'Minha cidade', exact: true }).click()
await p.waitForURL(/local=cristo-redentor/); await p.waitForSelector('.catalog', { timeout: 60000 })
console.log('minha cidade -> rio ok')
// seletor de mapas -> ilha
await p.getByRole('navigation', { name: 'Trocar de mapa' }).getByText('Ilha Inicial').click()
await p.waitForURL(/local=ilha-inicial/); await p.waitForSelector('.scenic-note', { timeout: 60000 })
await p.getByRole('navigation', { name: 'Trocar de mapa' }).getByText('Rio de Janeiro').click()
await p.waitForURL(/local=cristo-redentor/); await p.waitForSelector('.catalog', { timeout: 60000 })
console.log('seletor ok')
// Voltar em camadas: abre ajuda -> voltar fecha; depois volta ao globo
await p.getByRole('button', { name: 'Como jogar' }).click()
await p.getByRole('button', { name: '← Voltar' }).click()
assert.equal(await p.locator('.help-popover').count(), 0)
await p.getByRole('button', { name: '← Voltar' }).click()
await p.waitForURL(/world/); console.log('voltar -> globo ok')
console.log('erros', JSON.stringify(errs)); await b.close()
