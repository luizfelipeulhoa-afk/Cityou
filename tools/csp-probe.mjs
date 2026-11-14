// Etapa 6: confere, no navegador, quais violações do CSP em Report-Only aparecem nas páginas do app.
// Uso: node tools/csp-probe.mjs http://127.0.0.1:8787  (Worker com contas: wrangler.test-session.jsonc)
import { chromium, browserOptions } from './runtime.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:8787'
const browser = await chromium.launch(browserOptions)
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
const seen = []
page.on('console', m => { if (/Content Security Policy|Refused to|violat/i.test(m.text())) seen.push(`console: ${m.text().slice(0, 220)}`) })
page.on('pageerror', e => seen.push(`pageerror: ${String(e).slice(0, 220)}`))
await page.exposeFunction('__csp', v => seen.push(`event: ${v}`))
await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__csp(`${e.violatedDirective} ${e.blockedURI || '(inline)'}`)))
await page.goto(BASE + '/')
await page.evaluate(async () => fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fifones-City': '1' }, body: JSON.stringify({ email: `csp-${Date.now()}@example.test`, display_name: 'Probe', password: 'senha-sintetica-123' }) }))
for (const path of ['/', '/app#/inicio', '/app#/tarefas', '/app#/agenda', '/app#/cidade', '/app#/mundo', '/city.html', '/world.html']) {
  await page.goto(BASE + path); await page.waitForTimeout(2500)
}
await browser.close()
const unique = [...new Set(seen)]
console.log(unique.length ? unique.join('\n') : 'sem violações de CSP nas páginas visitadas')
console.log(`\n${unique.length} violação(ões) única(s)`)
