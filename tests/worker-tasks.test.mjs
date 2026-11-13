// Etapa 2 de docs/PLANO-PROXIMOS-PASSOS.md: tarefas reais no Durable Object, apelidos antigos por um deploy e
// nada de `connected`/`source` (o Fifones). Rode com: npm run test:worker
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTestHarness } from 'wrangler'
import { sessionCookie } from '../worker/demo.js'

const ORIGIN = 'https://cityou.test'
const harness = createTestHarness({ workers: [{ configPath: 'wrangler.test.jsonc' }] })
const loginHarness = createTestHarness({ workers: [{ configPath: 'wrangler.test-login.jsonc' }] })

before(async () => { await Promise.all([harness.listen(), loginHarness.listen()]) })
after(async () => { await Promise.all([harness.close(), loginHarness.close()]) })

function session(target = harness) {
  const cookie = sessionCookie(new URL(ORIGIN)).split(';')[0]
  return async (path, { method = 'GET', body, status = 200 } = {}) => {
    const headers = { Cookie: cookie }
    if (method !== 'GET') Object.assign(headers, { Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json' })
    const response = await target.fetch(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const result = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`)
    return result
  }
}

test('tarefas reais: listar, criar e concluir em /api/personal/tasks, sem o campo connected', async () => {
  const send = session()
  assert.deepEqual(await send('/api/personal/tasks'), { tasks: [] })
  const task = await send('/api/personal/tasks', { method: 'POST', body: { title: 'Pagar a conta de luz' }, status: 201 })
  const listed = await send('/api/personal/tasks')
  assert.equal('connected' in listed, false)
  assert.deepEqual(listed.tasks.map(item => [item.id, item.title, item.status]), [[task.id, 'Pagar a conta de luz', 'todo']])
  const before = (await send('/api/city')).credits
  const done = await send(`/api/personal/tasks/${task.id}/complete`, { method: 'POST', body: {} })
  assert.equal(done.task.status, 'done')
  assert.equal(done.city.credits, before + 10)
  // Concluir de novo não paga de novo, e o navegador não manda valores.
  assert.equal((await send(`/api/personal/tasks/${task.id}/complete`, { method: 'POST', body: {} })).city.credits, before + 10)
  await send(`/api/personal/tasks/${task.id}/complete`, { method: 'POST', body: { credits: 99 }, status: 422 })
  await send('/api/personal/tasks/00000000-0000-0000-0000-000000000000/complete', { method: 'POST', body: {}, status: 404 })
})

test('apelidos por um deploy: /api/workspace/tasks* responde igual às rotas novas', async () => {
  const send = session()
  const task = await send('/api/personal/tasks', { method: 'POST', body: { title: 'Pelo apelido' }, status: 201 })
  assert.deepEqual(await send('/api/workspace/tasks'), await send('/api/personal/tasks'))
  const done = await send(`/api/workspace/tasks/${task.id}/complete`, { method: 'POST', body: {} })
  assert.equal(done.task.status, 'done')
})

test('sem Fifones: a cidade não tem `source`, projetos chegam vazios e atividade é nula, sem `connected`', async () => {
  const send = session()
  const city = await send('/api/city')
  assert.equal('source' in city, false)
  assert.deepEqual(await send('/api/workspace/projects'), { projects: [] })
  assert.deepEqual(await send('/api/workspace/activity'), { activity: null })
})

test('cada sessão só vê e conclui as próprias tarefas', async () => {
  const ana = session(), bia = session()
  const task = await ana('/api/personal/tasks', { method: 'POST', body: { title: 'Da Ana' }, status: 201 })
  assert.deepEqual((await bia('/api/personal/tasks')).tasks, [])
  await bia(`/api/personal/tasks/${task.id}/complete`, { method: 'POST', body: {}, status: 404 })
  assert.equal((await ana('/api/personal/tasks')).tasks[0].status, 'todo')
})

test('com login obrigatório, tarefas sem sessão respondem 401 (o cliente leva a pessoa para entrar)', async () => {
  const response = await loginHarness.fetch(ORIGIN + '/api/personal/tasks')
  assert.equal(response.status, 401)
  assert.match((await response.json()).message, /Entre na sua conta/)
})
