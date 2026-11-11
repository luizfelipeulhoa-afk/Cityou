import { devices } from 'playwright'
import { chromium, browserOptions } from './runtime.mjs'

const base = new URL(process.argv[2])
const samples = Number(process.argv[3] || 4)
const browser = await chromium.launch({
  ...browserOptions,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const percentile = (values, fraction = 0.75) => {
  const sorted = values.slice().sort((a, b) => a - b)
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1])
}

try {
  for (const region of ['ilha-inicial', 'cristo-redentor']) {
    const cold = [], warm = [], frameMs = [], triangles = [], calls = []
    for (let sample = 0; sample < samples; sample++) {
      const context = await browser.newContext(devices['Pixel 7'])
      const page = await context.newPage()
      try {
        // The baseline needs an existing trip. Keep the city itself at its seed state.
        await page.goto(new URL('/world.html', base).href, { waitUntil: 'domcontentloaded' })
        if (region !== 'ilha-inicial') {
          const origin = base.origin
          const headers = { Origin: origin, 'X-Fifones-City': '1' }
          const progress = await (await context.request.get(new URL('/api/world/progress', base).href)).json()
          if (!progress.desbloqueados?.includes(region)) {
            const home = await (await context.request.get(new URL('/api/city', base).href)).json()
            const build = await context.request.post(new URL('/api/city/actions', base).href, {
              headers, data: { type: 'build', kind: 'home', x: 7, y: 7, expected_revision: home.revision, request_id: crypto.randomUUID() },
            })
            if (!build.ok()) throw new Error(await build.text())
            const travel = await context.request.post(new URL('/api/world/travel', base).href, {
              headers, data: { local: region, request_id: crypto.randomUUID() },
            })
            if (!travel.ok()) throw new Error(await travel.text())
          }
        }

        const session = await context.newCDPSession(page)
        await session.send('Network.enable')
        await session.send('Network.emulateNetworkConditions', {
          offline: false, latency: 100, downloadThroughput: 500_000, uploadThroughput: 125_000, connectionType: 'cellular4g',
        })
        const target = new URL('/city.html', base)
        target.searchParams.set('local', region)
        async function navigate(reload) {
          if (reload) await page.reload({ waitUntil: 'commit' })
          else await page.goto(target.href, { waitUntil: 'commit' })
          await page.waitForFunction(() => window.__fifonesCity?.state && window.__fifonesCity.engine?.stats().drawCalls > 0, null, { timeout: 30_000 })
          return page.evaluate(() => performance.now())
        }
        await session.send('Network.setCacheDisabled', { cacheDisabled: true })
        cold.push(await navigate(false))
        await session.send('Network.setCacheDisabled', { cacheDisabled: false })
        await navigate(true)
        warm.push(await navigate(true))
        const render = await page.evaluate(async () => {
          const engine = window.__fifonesCity.engine
          engine.rotateCamera()
          const gaps = await new Promise(resolve => {
            let previous
            const values = []
            function measure(now) {
              if (previous !== undefined) values.push(now - previous)
              previous = now
              if (values.length < 36) requestAnimationFrame(measure)
              else resolve(values)
            }
            requestAnimationFrame(measure)
          })
          return { gaps, ...engine.stats() }
        })
        frameMs.push(...render.gaps)
        triangles.push(render.triangles)
        calls.push(render.drawCalls)
      } finally { await context.close() }
    }
    console.log(JSON.stringify({
      region, samples, coldMs: percentile(cold), warmMs: percentile(warm),
      frameMs: percentile(frameMs), triangles: percentile(triangles), drawCalls: percentile(calls),
    }))
  }
} finally { await browser.close() }
