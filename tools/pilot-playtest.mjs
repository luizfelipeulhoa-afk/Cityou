import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { devices } from 'playwright'
import { chromium, browserOptions } from './runtime.mjs'
import plans from '../shared/game/city-reference-plans.json' with { type: 'json' }

const base = new URL(process.argv[2] || 'http://127.0.0.1:8883')
const browser = await chromium.launch({
  ...browserOptions,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
await mkdir('.verification', { recursive: true })

async function api(page, path, input) {
  const response = await page.evaluate(async ({ path, input }) => {
    const response = await fetch(path, input ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Fifones-City': '1' },
      body: JSON.stringify(input),
    } : undefined)
    return { ok: response.ok, status: response.status, data: await response.json() }
  }, { path, input })
  assert.equal(response.ok, true, JSON.stringify(response))
  return response.data
}

try {
  for (const [region, plan] of Object.entries(plans)) {
    const mobile = region === 'ilha-inicial'
    const context = await browser.newContext(mobile ? devices['Pixel 7'] : { viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(new URL('/world.html?debug=1', base).href)
      const world = await api(page, '/api/world/progress')
      assert.equal(world.test_mode, true)
      assert.equal(world.desbloqueados.length, 8)
      await page.waitForFunction(() => window.__buildUWorld?.isReady)
      await page.keyboard.press('d')
      async function aimAtMarker() {
        return page.evaluate(async id => {
          const globe = window.__buildUWorld
          await globe.focusSpace(id)
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const { x, y } = globe.projectMarker(id)
          for (const offset of [24, 16, 32, 8, 40, 0, 48, 56]) {
            if (globe.pick(x, y + offset)?.id === id && document.elementFromPoint(x, y + offset) === globe.canvas) {
              return { x, y: y + offset }
            }
          }
          throw new Error(JSON.stringify({ id, x, y, canvas: globe.canvas.getBoundingClientRect().toJSON(), targets: [0, 16, 24, 32, 48, 64, 80].map(offset => [offset, globe.pick(x, y + offset)?.id, document.elementFromPoint(x, y + offset)?.className]) }))
        }, region)
      }
      const target = await aimAtMarker()
      if (mobile) await page.touchscreen.tap(target.x, target.y)
      else {
        await page.mouse.move(target.x, target.y)
        await page.mouse.down()
        await page.mouse.move(target.x + 35, target.y + 10, { steps: 5 })
        await page.mouse.move(target.x, target.y, { steps: 5 })
        await page.mouse.up()
        assert.match(page.url(), /world/)
        const restored = await aimAtMarker()
        await page.mouse.click(restored.x, restored.y)
      }
      const ready = () => page.waitForFunction(id => window.__fifonesCity?.state?.location_id === id, region)
      try { await ready() } catch (error) {
        console.error('Falha de navegação:', region, page.url(), errors)
        await page.screenshot({ path: '.verification/pilot-failure.png' })
        throw error
      }
      const initial = await api(page, '/api/city?local=' + region)
      assert.deepEqual([initial.grid_min, initial.grid_max, initial.credits], [-8, 24, 5000])
      let revision = initial.revision
      const action = async input => {
        const city = await api(page, '/api/city/actions?local=' + region, {
          ...input, expected_revision: revision, request_id: crypto.randomUUID(),
        })
        revision = city.revision
        return city
      }

      const [first, ...roads] = plan.roads
      await page.getByRole('button', { name: /Construir Rua/ }).click()
      const editor = page.getByRole('region', { name: 'Traçar uma via' })
      await editor.getByText('Usar coordenadas').click()
      for (const [index, field] of ['Início X','Início Y','Fim X','Fim Y'].entries()) {
        await editor.getByLabel(field, { exact: true }).fill(String(first[index]))
      }
      await editor.getByRole('button', { name: 'Prévia da via' }).click()
      assert.equal((await api(page, '/api/city?local=' + region)).credits, 5000)
      await editor.getByRole('button', { name: 'Confirmar via' }).click()
      await page.waitForFunction(() => window.__fifonesCity.state.credits < 5000)
      revision = await page.evaluate(() => window.__fifonesCity.state.revision)
      for (const [x, y, end_x, end_y] of roads) await action({ type: 'road_path', x, y, end_x, end_y })
      for (const [kind, x, y, rotation] of plan.buildings) await action({ type: 'build', kind, x, y, rotation })
      await page.reload()
      await ready()
      const state = await page.evaluate(() => window.__fifonesCity.state)
      assert.equal(state.credits, 5000 - plan.cost)
      const newBuildings = state.placements.filter(item => /^(island|rio)-/.test(item.kind))
      assert.equal(newBuildings.length, plan.capacity)
      const interiorTimes = []
      const interiorKinds = mobile ? ['island-dhoni', 'island-market'] : ['rio-fair', 'rio-samba']
      for (const kind of interiorKinds) {
        const placement = newBuildings.find(item => item.kind === kind)
        await page.evaluate(placement => window.__fifonesCity.engine.callbacks.onSelect(placement), placement)
        const start = Date.now()
        await page.getByRole('button', { name: 'Abrir corte do prédio' }).click()
        const panel = page.getByRole('region', { name: 'Interior do prédio' })
        await panel.waitFor()
        interiorTimes.push(Date.now() - start)
        assert.equal(await page.evaluate(() => Boolean(window.__fifonesCity.engine.interior)), true)
        await page.screenshot({ path: '.verification/' + kind + '-interior.png' })
        await panel.getByRole('button', { name: 'Fechar interior' }).click()
        assert.equal(await page.evaluate(() => Boolean(window.__fifonesCity.engine.interior)), false)
      }
      const render = await page.evaluate(async () => {
        const engine = window.__fifonesCity.engine
        engine.rotateCamera()
        const gaps = await new Promise(resolve => {
          const values = []
          let previous
          function frame(now) {
            if (previous !== undefined) values.push(now - previous)
            previous = now
            if (values.length < 60) requestAnimationFrame(frame)
            else resolve(values.sort((a, b) => a - b))
          }
          requestAnimationFrame(frame)
        })
        return { p75FrameMs: Math.round(gaps[44]), ...engine.stats() }
      })
      await page.screenshot({ path: '.verification/' + region + '-full.png' })
      await page.getByRole('link', { name: 'Voltar ao globo' }).click()
      await page.waitForURL(/world.*de=/)
      assert.deepEqual(errors, [])
      console.log(JSON.stringify({ region, buildings: newBuildings.length, credits: state.credits, interiorMs: interiorTimes,
        p75FrameMs: render.p75FrameMs, drawCalls: render.drawCalls, triangles: render.triangles }))
    } finally { await context.close() }
  }
} finally { await browser.close() }
