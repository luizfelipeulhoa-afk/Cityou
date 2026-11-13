// Cache de leitura na borda (worker/edge-cache.js). Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { harness, ORIGIN, sleep, useHarnesses } from './helpers/worker-session.mjs'
import { sessionCookie } from '../worker/demo.js'

useHarnesses()

const newSession = () => {
  const cookie = sessionCookie(new URL(ORIGIN)).split(';')[0]
  const get = path => harness.fetch(ORIGIN + path, { headers: { Cookie: cookie } })
  const write = (path, body) => harness.fetch(ORIGIN + path, {
    method: 'POST', headers: { Cookie: cookie, Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { cookie, get, write }
}

test('segunda leitura sai do cache, com o mesmo conteúdo e Cache-Control no-store para o navegador', async () => {
  const { get } = newSession()
  const first = await get('/api/personal')
  assert.equal(first.headers.get('X-Cityou-Cache'), 'miss')
  const body = await first.json()
  await sleep(50) // a gravação do cache é em segundo plano
  const second = await get('/api/personal')
  assert.equal(second.headers.get('X-Cityou-Cache'), 'hit')
  assert.equal(second.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await second.json(), body)
})

test('escrita invalida: a leitura seguinte é nova e já traz o item', async () => {
  const { get, write } = newSession()
  await (await get('/api/personal')).arrayBuffer()
  await sleep(50)
  assert.equal((await get('/api/personal')).headers.get('X-Cityou-Cache'), 'hit')
  const created = await write('/api/personal/events', { title: 'Cache', day: '2026-12-10', start_time: '09:00', end_time: '10:00' })
  assert.equal(created.status, 201)
  const after = await get('/api/personal?month=2026-12')
  assert.equal(after.headers.get('X-Cityou-Cache'), 'miss')
  assert.equal((await after.json()).events.length, 1)
})

test('sessões diferentes nunca compartilham entrada', async () => {
  const a = newSession(), b = newSession()
  await (await a.write('/api/personal/events', { title: 'Só da A', day: '2026-12-10', start_time: '09:00', end_time: '10:00' })).arrayBuffer()
  await (await a.get('/api/personal?month=2026-12')).arrayBuffer()
  await sleep(50)
  const fromB = await b.get('/api/personal?month=2026-12')
  assert.equal(fromB.headers.get('X-Cityou-Cache'), 'miss')
  assert.deepEqual((await fromB.json()).events, [])
})

test('consulta diferente é outra entrada, e erro e rota sem cache não são guardados', async () => {
  const { get } = newSession()
  await (await get('/api/city')).arrayBuffer()
  await sleep(50)
  assert.equal((await get('/api/city')).headers.get('X-Cityou-Cache'), 'hit')
  assert.equal((await get('/api/city?local=ilha-inicial')).headers.get('X-Cityou-Cache'), 'miss')
  const bad = await get('/api/city?local=inexistente')
  assert.ok(bad.status >= 400)
  await sleep(50)
  assert.equal((await get('/api/city?local=inexistente')).headers.get('X-Cityou-Cache'), 'miss')
  assert.equal((await get('/api/personal/tasks')).headers.get('X-Cityou-Cache'), null)
  const anon = await harness.fetch(ORIGIN + '/api/personal')
  assert.equal(anon.headers.get('X-Cityou-Cache'), null)
})

test('só leituras de /api/personal e /api/city entram no cache, e a revalidação vem antes do vencimento', async () => {
  const { isCacheableRead, MAX_AGE_MS, REFRESH_AFTER_MS } = await import('../worker/edge-cache.js')
  assert.ok(isCacheableRead('GET', '/api/city') && !isCacheableRead('POST', '/api/city') && !isCacheableRead('GET', '/api/health'))
  assert.ok(REFRESH_AFTER_MS < MAX_AGE_MS)
})
