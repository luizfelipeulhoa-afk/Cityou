// Etapa 6: CSP em Report-Only, endpoint de relatório e cabeçalhos básicos (worker/index.js). Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { harness, ORIGIN, useHarnesses } from './helpers/worker-session.mjs'
import { CSP_REPORT_ONLY } from '../worker/csp.js'

useHarnesses()

test('CSP vai só em Report-Only, com WASM liberado e sem JS eval, com relatório', () => {
  assert.match(CSP_REPORT_ONLY, /default-src 'self'/)
  assert.match(CSP_REPORT_ONLY, /object-src 'none'/)
  assert.match(CSP_REPORT_ONLY, /report-uri \/api\/csp-report/)
  assert.match(CSP_REPORT_ONLY, /script-src 'self' 'wasm-unsafe-eval'/)
  assert.doesNotMatch(CSP_REPORT_ONLY, /'unsafe-eval'/, 'JS eval continua bloqueado')
})

test('cabeçalhos básicos em toda resposta da API', async () => {
  const response = await harness.fetch(ORIGIN + '/api/health')
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
  assert.match(response.headers.get('Permissions-Policy'), /camera=\(\)/)
  assert.equal(response.headers.get('Content-Security-Policy'), null, 'nada de CSP que bloqueie')
  assert.equal(response.headers.get('Content-Security-Policy-Report-Only'), null, 'JSON não recebe CSP')
})

test('relatório de violação: POST sem cabeçalho de escrita chega (204); GET é recusado', async () => {
  const report = JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'https://exemplo.test/x.js' } })
  const posted = await harness.fetch(ORIGIN + '/api/csp-report', { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: report })
  assert.equal(posted.status, 204)
  const got = await harness.fetch(ORIGIN + '/api/csp-report')
  assert.equal(got.status, 405)
})

test('relatório enorme é cortado, não grava nada e não derruba o Worker', async () => {
  const huge = 'x'.repeat(100_000)
  const posted = await harness.fetch(ORIGIN + '/api/csp-report', { method: 'POST', body: huge })
  assert.equal(posted.status, 204)
})

test('CSP_ENFORCE="true" troca o Report-Only pelo cabeçalho que bloqueia, só nas páginas', async () => {
  const { default: worker } = await import('../worker/index.js')
  const ASSETS = { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) }
  const page = async env => worker.fetch(new Request(ORIGIN + '/terrain.html'), { ASSETS, ...env })
  const watching = await page({})
  assert.equal(watching.headers.get('Content-Security-Policy'), null)
  assert.equal(watching.headers.get('Content-Security-Policy-Report-Only'), CSP_REPORT_ONLY)
  const blocking = await page({ CSP_ENFORCE: 'true' })
  assert.equal(blocking.headers.get('Content-Security-Policy'), CSP_REPORT_ONLY)
  assert.equal(blocking.headers.get('Content-Security-Policy-Report-Only'), null)
})
