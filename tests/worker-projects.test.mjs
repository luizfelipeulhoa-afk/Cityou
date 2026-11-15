// Etapa 5, parte 2 (docs/PLANO-PROXIMOS-PASSOS.md): Projetos reais, um nome e um próximo passo.
// Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loginHarness, ORIGIN, session, sleep, useHarnesses, GHOST_ID } from './helpers/worker-session.mjs'

useHarnesses()

const make = (extra = {}) => ({ name: 'Reformar o escritório', description: 'Sem pressa', ...extra })

test('criar: 201, aparece em GET /api/personal e created_id é o id', async () => {
  const send = session()
  const created = await send('/api/personal/projects', { method: 'POST', body: make({ next_step: 'Medir a parede' }), status: 201 })
  const project = created.projects.find(item => item.id === created.created_id)
  assert.ok(project)
  assert.deepEqual([project.name, project.status, project.next_step, project.steps_done, project.last_step_at], ['Reformar o escritório', 'active', 'Medir a parede', 0, null])
  assert.ok(project.created_at && project.updated_at)
  assert.deepEqual((await send('/api/personal')).projects.map(item => item.id), [created.created_id])
  // Sem próximo passo também vale (a caixa fica esperando).
  const bare = await send('/api/personal/projects', { method: 'POST', body: { name: 'Só o nome' }, status: 201 })
  assert.equal(bare.projects.find(item => item.id === bare.created_id).next_step, null)
})

test('editar: PUT parcial devolve o estado novo, muda updated_at e preserva o resto; guardar e retomar', async () => {
  const send = session()
  const { created_id: id, projects } = await send('/api/personal/projects', { method: 'POST', body: make({ next_step: 'Medir' }), status: 201 })
  await sleep(10)
  const renamed = await send(`/api/personal/projects/${id}`, { method: 'PUT', body: { name: 'Escritório novo' } })
  const project = renamed.projects[0]
  assert.deepEqual([project.name, project.description, project.next_step, project.created_at], ['Escritório novo', 'Sem pressa', 'Medir', projects[0].created_at])
  assert.notEqual(project.updated_at, projects[0].updated_at)
  assert.equal((await send(`/api/personal/projects/${id}`, { method: 'PUT', body: { status: 'archived' } })).projects[0].status, 'archived')
  assert.equal((await send(`/api/personal/projects/${id}`, { method: 'PUT', body: { status: 'active', next_step: null } })).projects[0].next_step, null)
  await send(`/api/personal/projects/${id}`, { method: 'PUT', body: {}, status: 422 })
  await send(`/api/personal/projects/${id}`, { method: 'PUT', body: { status: 'concluido' }, status: 422 })
})

test('apagar: DELETE devolve o estado sem o item e um novo DELETE é 404', async () => {
  const send = session()
  const { created_id: id } = await send('/api/personal/projects', { method: 'POST', body: make(), status: 201 })
  assert.deepEqual((await send(`/api/personal/projects/${id}`, { method: 'DELETE' })).projects, [])
  await send(`/api/personal/projects/${id}`, { method: 'DELETE', status: 404 })
  await send(`/api/personal/projects/${GHOST_ID}`, { method: 'PUT', body: { name: 'x' }, status: 404 })
  await send(`/api/personal/projects/${GHOST_ID}/step-done`, { method: 'POST', body: {}, status: 404 })
})

test('422 para campo extra, sem gravar nada', async () => {
  const send = session()
  const response = await send('/api/personal/projects', { method: 'POST', body: { ...make(), xp: 10 }, status: 422 })
  assert.match(response.message, /Campo não aceito: xp/)
  for (const field of ['credits', 'level', 'unlock', 'steps_done', 'due_date']) await send('/api/personal/projects', { method: 'POST', body: { ...make(), [field]: 1 }, status: 422 })
  assert.deepEqual((await send('/api/personal')).projects, [])
})

test('422 para limites: nome, descrição, próximo passo e tipos', async () => {
  const send = session()
  const bad = body => send('/api/personal/projects', { method: 'POST', body, status: 422 })
  await bad(make({ name: 'n'.repeat(121) }))
  await bad(make({ name: '  ' }))
  await bad(make({ name: 'com\u0007controle' }))
  await bad(make({ description: 'd'.repeat(1001) }))
  await bad(make({ next_step: 's'.repeat(181) }))
  await bad(make({ next_step: '' }))
  await bad(make({ next_step: 12 }))
  await bad({ name: 42 })
  assert.deepEqual((await send('/api/personal')).projects, [])
  await send('/api/personal/projects', { method: 'POST', body: make({ name: 'n'.repeat(120), next_step: 's'.repeat(180), description: 'linha 1\nlinha 2' }), status: 201 })
})

test('passo concluído: zera o próximo passo, soma passos dados e guarda quando; sem pagar moedas', async () => {
  const send = session()
  const coins = (await send('/api/city')).credits
  const { created_id: id } = await send('/api/personal/projects', { method: 'POST', body: make({ next_step: 'Medir' }), status: 201 })
  const done = await send(`/api/personal/projects/${id}/step-done`, { method: 'POST', body: {} })
  const project = done.projects[0]
  assert.deepEqual([project.next_step, project.steps_done], [null, 1])
  assert.match(project.last_step_at, /^\d{4}-\d\d-\d\dT/)
  // Sem passo definido não há o que concluir; corpo com campos é recusado; o contador não anda.
  await send(`/api/personal/projects/${id}/step-done`, { method: 'POST', body: {}, status: 422 })
  await send(`/api/personal/projects/${id}`, { method: 'PUT', body: { next_step: 'Comprar tinta' } })
  await send(`/api/personal/projects/${id}/step-done`, { method: 'POST', body: { steps_done: 99 }, status: 422 })
  await send(`/api/personal/projects/${id}/step-done`, { method: 'POST', body: { credits: 5 }, status: 422 })
  assert.equal((await send(`/api/personal/projects/${id}/step-done`, { method: 'POST', body: {} })).projects[0].steps_done, 2)
  assert.equal((await send('/api/city')).credits, coins)
  // Um projeto guardado não dá passo.
  await send(`/api/personal/projects/${id}`, { method: 'PUT', body: { status: 'archived', next_step: 'Outro' } })
  await send(`/api/personal/projects/${id}/step-done`, { method: 'POST', body: {}, status: 422 })
  // steps_done e last_step_at não se editam pelo cliente.
  await send(`/api/personal/projects/${id}`, { method: 'PUT', body: { steps_done: 50 }, status: 422 })
})

test('cada sessão só vê, edita e apaga os próprios projetos', async () => {
  const ana = session(), bia = session()
  const { created_id: id } = await ana('/api/personal/projects', { method: 'POST', body: make({ next_step: 'Medir' }), status: 201 })
  assert.deepEqual((await bia('/api/personal')).projects, [])
  assert.deepEqual((await bia('/api/personal/projects')).projects, [])
  await bia(`/api/personal/projects/${id}`, { method: 'PUT', body: { name: 'Da Bia' }, status: 404 })
  await bia(`/api/personal/projects/${id}/step-done`, { method: 'POST', body: {}, status: 404 })
  await bia(`/api/personal/projects/${id}`, { method: 'DELETE', status: 404 })
  assert.equal((await ana('/api/personal')).projects[0].name, 'Reformar o escritório')
})

test('teto por conta: o próximo registro é 422 com a mensagem e apagar libera vaga', async () => {
  const send = session()
  const ids = []
  for (let n = 0; n < 3; n++) ids.push((await send('/api/personal/projects', { method: 'POST', body: make({ name: `P${n}` }), status: 201 })).created_id)
  const full = await send('/api/personal/projects', { method: 'POST', body: make(), status: 422 })
  assert.equal(full.message, 'Você chegou ao limite de 3 registros deste tipo. Apague algum para continuar.')
  await send(`/api/personal/projects/${ids[1]}`, { method: 'DELETE' })
  await send('/api/personal/projects', { method: 'POST', body: make(), status: 201 })
})

test('persistência: o mesmo cookie recebe o mesmo estado', async () => {
  const send = session()
  await send('/api/personal/projects', { method: 'POST', body: make({ next_step: 'Medir' }), status: 201 })
  const first = await send('/api/personal')
  assert.deepEqual((await send('/api/personal')).projects, first.projects)
  const listed = await send('/api/personal/projects')
  assert.deepEqual(listed, { projects: first.projects })
  assert.deepEqual(await session()('/api/personal/projects'), { projects: [] })
})

test('com login obrigatório, as rotas de projetos sem sessão respondem 401', async () => {
  for (const [method, path] of [['GET', '/api/personal/projects'], ['POST', '/api/personal/projects'], ['PUT', `/api/personal/projects/${GHOST_ID}`], ['DELETE', `/api/personal/projects/${GHOST_ID}`], ['POST', `/api/personal/projects/${GHOST_ID}/step-done`]]) {
    const response = await loginHarness.fetch(ORIGIN + path, { method, headers: { Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json' }, body: ['GET', 'DELETE'].includes(method) ? undefined : '{}' })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
})
