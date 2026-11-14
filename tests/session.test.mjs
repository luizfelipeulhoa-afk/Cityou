import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeNext } from '../src/fifones/api.js'

test('next só aceita páginas do app e mantém a aba', () => {
  assert.equal(safeNext('/app', '#/habitos'), '/app#/habitos')
  assert.equal(safeNext('/app#/metas', '#/habitos'), '/app#/metas')
  assert.equal(safeNext('/city.html?local=ilha-inicial'), '/city.html?local=ilha-inicial')
  assert.equal(safeNext('/world'), '/world')
})
test('next fora do app ou com hash estranho vira /app', () => {
  for (const bad of ['', null, '//evil.com', 'https://evil.com', '/admin', '/api/city', '/app/../x', '/app x']) assert.equal(safeNext(bad, '#/x'), '/app')
  assert.equal(safeNext('/app', '#<script>'), '/app')
})

test('cache do navegador: guarda, devolve, limpa e não quebra sem localStorage', async () => {
  const { readCache, writeCache, clearCache } = await import('../src/fifones/api.js')
  assert.equal(readCache('/x'), null)
  writeCache('/x', { a: 1 })
  clearCache()
  const store = new Map()
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) }
  Object.defineProperty(globalThis.localStorage, 'length', { get: () => store.size })
  globalThis.localStorage[Symbol.iterator] = undefined
  writeCache('/api/personal?month=2026-11', { tasks: [1] })
  assert.deepEqual(readCache('/api/personal?month=2026-11'), { tasks: [1] })
  store.set('cityou:swr:/velho', JSON.stringify({ t: Date.now() - 25 * 3600 * 1000, data: 1 }))
  assert.equal(readCache('/velho'), null)
  delete globalThis.localStorage
})

// Por último: depois dele o cliente fica com a sessão encerrada (estado do módulo).
test('401 de um pedido impede a nova tentativa de outro que falhou na rede', async () => {
  const { api } = await import('../src/fifones/api.js')
  const visits = []
  const win = { location: { pathname: '/city', search: '', hash: '', assign: url => visits.push(url) } }
  win.parent = win
  globalThis.window = win
  let failFirst
  const calls = []
  globalThis.fetch = (path) => {
    calls.push(path)
    if (calls.length === 1) return new Promise((_, reject) => { failFirst = () => reject(new TypeError('rede caiu')) })
    return Promise.resolve({ status: 401, ok: false, json: async () => ({ message: 'Sessão vencida.' }) })
  }
  const withRetry = api('/api/city/actions', 'POST', { request_id: 'r1' }, { retry: true })
  await assert.rejects(api('/api/personal/tasks'), { status: 401 })
  failFirst()
  await assert.rejects(withRetry, { status: 401 })
  assert.equal(calls.length, 2, 'nenhuma segunda tentativa depois do 401')
  assert.deepEqual(visits, ['/?entrar=1&next=%2Fcity'])
  await assert.rejects(api('/api/city'), { status: 401 })
  assert.equal(calls.length, 2)
})
