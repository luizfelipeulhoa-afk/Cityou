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
        // Recebe o cookie sem renderizar o globo antes de medir a cidade.
        const landing = await context.request.get(new URL('/', base).href)
        if (!landing.ok()) throw new Error(`GET /: ${landing.status()}`)
        const progressResponse = await context.request.get(new URL('/api/world/progress', base).href)
        if (!progressResponse.ok()) throw new Error(`GET /api/world/progress: ${progressResponse.status()}`)
        const progress = await progressResponse.json()
        if (progress.test_mode !== true) throw new Error('Use um Worker isolado em modo de teste.')
        if (!progress.desbloqueados?.includes(region)) {
          throw new Error(`O destino ${region} não está aberto. Use uma sessão nova do Worker em modo de teste.`)
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
