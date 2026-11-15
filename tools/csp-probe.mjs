// Conferência pontual de CSP em Report-Only. Cadastro sintético só no Worker local.
// Uso: node tools/csp-probe.mjs <url> [--signup-local]
import assert from 'node:assert/strict'
import { chromium, browserOptions } from './runtime.mjs'

const base = new URL(process.argv[2] || 'http://127.0.0.1:8787')
const signupLocal = process.argv[3] === '--signup-local'
if (signupLocal) assert.equal(base.hostname, '127.0.0.1', 'Cadastro sintético permitido só no Worker local.')
const browser = await chromium.launch(browserOptions)
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  const errors = new Set()
  const models = new Set()
  page.on('pageerror', error => errors.add(String(error)))
  page.on('response', response => {
    if (response.ok() && new URL(response.url()).pathname.endsWith('.glb')) models.add(response.url())
  })
  await page.exposeFunction('__csp', violation => errors.add(violation))
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    window.__csp(`${event.violatedDirective} ${event.blockedURI || '(inline)'}`)
  }))

  async function visit(path) {
    await page.goto('about:blank')
    const target = new URL(path, base)
    const response = await page.goto(target.href)
    assert.equal(response?.status(), 200, path)
    assert.equal(page.url(), target.href, `Redirecionamento inesperado: ${path}`)
    const policy = response.headers()['content-security-policy-report-only']
    assert.match(policy || '', /script-src[^;]*'wasm-unsafe-eval'/, `Política ausente ou incompleta: ${path}`)
    assert.ok(!response.headers()['content-security-policy'], `CSP já aplicada: ${path}`)
  }

  await visit('/')
  if (signupLocal) {
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cityou-Request': '1' },
        body: JSON.stringify({ email: `csp-${crypto.randomUUID()}@example.test`, display_name: 'Probe', password: 'senha-sintetica-123' }),
      })
      return response.status
    })
    assert.equal(status, 201, 'Falha no cadastro sintético')
  }

  for (const path of ['/app#/inicio', '/app#/tarefas', '/app#/agenda', '/app#/cidade', '/app#/mundo', '/city', '/world']) {
    await visit(path)
    if (path === '/city' || path === '/world') await page.locator('canvas').first().waitFor()
    await page.waitForTimeout(2500)
  }

  assert.ok(models.size, 'Nenhum modelo GLB retornou com sucesso.')
  assert.equal(errors.size, 0, [...errors].join('\n'))
  console.log(`CSP em Report-Only nas 8 navegações, ${models.size} GLB recebidos e nenhuma violação observada.`)
} finally {
  await browser.close()
}
