// Etapa 5, parte 1 (docs/PLANO-PROXIMOS-PASSOS.md): Agenda real. Compromissos e dias de respiro no Durable Object.
// Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loginHarness, ORIGIN, session, sleep, useHarnesses, dayFromToday, GHOST_ID } from './helpers/worker-session.mjs'

useHarnesses()

const DAY = '2026-12-10'
const make = (extra = {}) => ({ title: 'Dentista', day: DAY, start_time: '09:00', end_time: '10:00', ...extra })

test('criar: 201, aparece em GET /api/personal e created_id é o id', async () => {
  const send = session()
  const created = await send('/api/personal/events?month=2026-12', { method: 'POST', body: make({ place: 'Clínica', notes: 'Levar exames' }), status: 201 })
  const event = created.events.find(item => item.id === created.created_id)
  assert.ok(event)
  assert.deepEqual([event.kind, event.title, event.day, event.firmness, event.place], ['compromisso', 'Dentista', DAY, 'firme', 'Clínica'])
  assert.ok(event.created_at && event.updated_at)
  const personal = await send('/api/personal?month=2026-12')
  assert.deepEqual(personal.events.map(item => item.id), [created.created_id])
  assert.equal(personal.events_month, '2026-12')
  assert.deepEqual(personal.tasks, [])
})

test('editar: PUT parcial devolve o estado novo, muda updated_at e preserva o resto', async () => {
  const send = session()
  const { created_id: id, events } = await send('/api/personal/events?month=2026-12', { method: 'POST', body: make(), status: 201 })
  const before = events[0]
  await sleep(10)
  const changed = await send(`/api/personal/events/${id}?month=2026-12`, { method: 'PUT', body: { title: 'Dentista (retorno)', firmness: 'leve' } })
  const event = changed.events[0]
  assert.equal(event.title, 'Dentista (retorno)')
  assert.equal(event.firmness, 'leve')
  assert.equal(event.start_time, '09:00')
  assert.equal(event.created_at, before.created_at)
  assert.notEqual(event.updated_at, before.updated_at)
  await send(`/api/personal/events/${id}`, { method: 'PUT', body: {}, status: 422 })
})

test('apagar: DELETE devolve o estado sem o item e um novo DELETE é 404', async () => {
  const send = session()
  const { created_id: id } = await send('/api/personal/events', { method: 'POST', body: make(), status: 201 })
  const after = await send(`/api/personal/events/${id}?month=2026-12`, { method: 'DELETE' })
  assert.deepEqual(after.events, [])
  await send(`/api/personal/events/${id}`, { method: 'DELETE', status: 404 })
  await send(`/api/personal/events/${GHOST_ID}`, { method: 'PUT', body: { title: 'x' }, status: 404 })
})

test('422 para campo extra, sem gravar nada', async () => {
  const send = session()
  const response = await send('/api/personal/events', { method: 'POST', body: { ...make(), credits: 5 }, status: 422 })
  assert.match(response.message, /Campo não aceito: credits/)
  for (const field of ['xp', 'level', 'unlock']) await send('/api/personal/events', { method: 'POST', body: { ...make(), [field]: 1 }, status: 422 })
  assert.deepEqual((await send('/api/personal?month=2026-12')).events, [])
})

test('422 para limites: título, notas, data, hora e fim antes do início', async () => {
  const send = session()
  const bad = async patch => send('/api/personal/events', { method: 'POST', body: make(patch), status: 422 })
  await bad({ title: 'a'.repeat(181) })
  await bad({ title: '   ' })
  await bad({ title: 'com\u0000controle' })
  await bad({ notes: 'n'.repeat(1001) })
  await bad({ place: 'p'.repeat(81) })
  await bad({ day: '2026-02-30' })
  await bad({ day: '1999-12-31' })
  await bad({ day: '2101-01-01' })
  await bad({ start_time: '25:61' })
  await bad({ start_time: '9:00' })
  await bad({ start_time: '10:00', end_time: '09:00' })
  await bad({ start_time: null, end_time: '09:00' })
  await bad({ firmness: 'urgente' })
  await bad({ kind: 'prazo' })
  assert.deepEqual((await send('/api/personal?month=2026-12')).events, [])
  // Dia inteiro (sem horário), início e fim iguais e notas com quebra de linha são válidos.
  await send('/api/personal/events', { method: 'POST', body: { title: 'Aniversário', day: DAY }, status: 201 })
  await send('/api/personal/events', { method: 'POST', body: make({ end_time: '09:00', notes: 'linha 1\nlinha 2' }), status: 201 })
})

test('respiro: um por dia, firme é recusado nesse dia e leve (se der) é aceito', async () => {
  const send = session()
  const created = await send('/api/personal/events?month=2026-12', { method: 'POST', body: { kind: 'respiro', day: DAY }, status: 201 })
  const respiro = created.events.find(item => item.id === created.created_id)
  assert.deepEqual([respiro.kind, respiro.title, respiro.start_time, respiro.notes], ['respiro', 'Dia de respiro', null, ''])
  await send('/api/personal/events', { method: 'POST', body: { kind: 'respiro', day: DAY }, status: 422 })
  await send('/api/personal/events', { method: 'POST', body: { kind: 'respiro', day: '2026-12-11', notes: 'x' }, status: 422 })
  await send('/api/personal/events', { method: 'POST', body: make({ firmness: 'firme' }), status: 422 })
  const soft = await send('/api/personal/events?month=2026-12', { method: 'POST', body: make({ firmness: 'leve' }), status: 201 })
  assert.equal(soft.events.length, 2)
  // Tornar o compromisso firme num dia de respiro também é recusado; mover o respiro para um dia com firme, idem.
  await send(`/api/personal/events/${soft.created_id}`, { method: 'PUT', body: { firmness: 'firme' }, status: 422 })
  await send('/api/personal/events', { method: 'POST', body: make({ day: '2026-12-12' }), status: 201 })
})

test('cada sessão só vê, edita e apaga os próprios compromissos', async () => {
  const ana = session(), bia = session()
  const { created_id: id } = await ana('/api/personal/events', { method: 'POST', body: make(), status: 201 })
  assert.deepEqual((await bia('/api/personal?month=2026-12')).events, [])
  await bia(`/api/personal/events/${id}`, { method: 'PUT', body: { title: 'Da Bia' }, status: 404 })
  await bia(`/api/personal/events/${id}`, { method: 'DELETE', status: 404 })
  assert.equal((await ana('/api/personal?month=2026-12')).events[0].title, 'Dentista')
})

test('teto por conta: o próximo registro é 422 com a mensagem e apagar libera vaga', async () => {
  const send = session()
  const ids = []
  for (let n = 0; n < 3; n++) ids.push((await send('/api/personal/events', { method: 'POST', body: make({ title: `Item ${n}` }), status: 201 })).created_id)
  const full = await send('/api/personal/events', { method: 'POST', body: make(), status: 422 })
  assert.equal(full.message, 'Você chegou ao limite de 3 registros deste tipo. Apague algum para continuar.')
  await send(`/api/personal/events/${ids[0]}`, { method: 'DELETE' })
  await send('/api/personal/events', { method: 'POST', body: make(), status: 201 })
})

test('persistência: o mesmo cookie recebe o mesmo estado e ?month= traz o mês certo', async () => {
  const send = session()
  await send('/api/personal/events', { method: 'POST', body: make(), status: 201 })
  await send('/api/personal/events', { method: 'POST', body: make({ title: 'Janeiro', day: '2027-01-05' }), status: 201 })
  const dec = await send('/api/personal?month=2026-12')
  assert.deepEqual(dec.events.map(item => item.title), ['Dentista'])
  assert.deepEqual((await send('/api/personal?month=2026-12')).events, dec.events)
  const jan = await send('/api/personal?month=2027-01')
  assert.deepEqual([jan.events_month, jan.events.map(item => item.title)], ['2027-01', ['Janeiro']])
  assert.equal((await send('/api/personal')).events_month, dayFromToday().slice(0, 7))
  await send('/api/personal?month=2027-13', { status: 422 })
})

test('o navegador não dá poder: nada de credits, xp, level ou unlock, e a agenda não mexe nas moedas', async () => {
  const send = session()
  const coins = (await send('/api/city')).credits
  const { created_id: id } = await send('/api/personal/events', { method: 'POST', body: make(), status: 201 })
  for (const field of ['credits', 'xp', 'level', 'unlock']) {
    await send(`/api/personal/events/${id}`, { method: 'PUT', body: { [field]: 99 }, status: 422 })
  }
  await send('/api/personal/events', { method: 'POST', body: { kind: 'respiro', day: '2026-12-11' }, status: 201 })
  assert.equal((await send('/api/city')).credits, coins)
})

test('com login obrigatório, as rotas da agenda sem sessão respondem 401', async () => {
  for (const [method, path] of [['POST', '/api/personal/events'], ['PUT', `/api/personal/events/${GHOST_ID}`], ['DELETE', `/api/personal/events/${GHOST_ID}`]]) {
    const response = await loginHarness.fetch(ORIGIN + path, { method, headers: { Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : '{}' })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
})
