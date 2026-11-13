import assert from 'node:assert/strict'
import { devices } from 'playwright'
import { chromium, browserOptions } from './runtime.mjs'

const base = new URL(process.argv[2] || 'http://127.0.0.1:8787')
const browser = await chromium.launch({
  ...browserOptions,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

try {
  const page = await browser.newPage({ ...devices['Pixel 7'], reducedMotion: 'reduce' })
  await page.goto(new URL('/city.html?local=cristo-redentor', base).href)
  await page.waitForFunction(() => window.__fifonesCity?.state?.location_id === 'cristo-redentor')
  const city = () => page.evaluate(async () => (await fetch('/api/city?local=cristo-redentor')).json())
  const start = await city()
  assert.equal(start.test_mode, true)

  await page.locator('.catalog-card').filter({ hasText: 'Sobrado' }).first().click()
  await page.getByText('Escolher terreno por coordenadas').click()
  await page.getByLabel('Coluna X').fill('-2')
  await page.getByLabel('Linha Y').fill('15')
  await page.getByRole('button', { name: 'Ver custo' }).click()

  const quote = page.getByRole('region', { name: /via de constru/ })
  assert.match(await quote.textContent(), /10 trechos de rua \(20 moedas\)/)
  assert.match(await quote.textContent(), /Total: 40 moedas/)
  await page.waitForFunction(() => window.__fifonesCity.engine?.roadPreview.count === 10)
  const before = await city()
  assert.deepEqual([before.credits, before.revision], [start.credits, start.revision])

  const saved = page.waitForResponse(response => response.url().includes('/api/city/actions') && response.request().method() === 'POST')
  await quote.getByRole('button', { name: /Confirmar constru/ }).tap()
  const response = await saved
  assert.equal(response.status(), 200)
  await quote.waitFor({ state: 'hidden' })
  const after = await city()
  assert.equal(after.credits, start.credits - 40)
  assert.equal(after.revision, start.revision + 1)
  assert.equal(after.placements.length, start.placements.length + 11)
  assert.ok(after.placements.some(item => item.kind === 'rio-sobrado' && item.x === -2 && item.y === 15))
  console.log('Rio: pr\u00e9via de 10 trechos, confirma\u00e7\u00e3o por toque e d\u00e9bito de 40 moedas verificados.')
} finally {
  await browser.close()
}
