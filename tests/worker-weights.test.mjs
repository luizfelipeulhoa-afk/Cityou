// Etapa 5, parte 3 (docs/PLANO-PROXIMOS-PASSOS.md): Peso real, uma pesagem por dia e média móvel de 7 dias.
// Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loginHarness, ORIGIN, session, sleep, useHarnesses, dayFromToday, GHOST_ID } from './helpers/worker-session.mjs'

useHarnesses()

const make = (extra = {}) => ({ day: dayFromToday(-1), grams: 70_500, note: 'Depois do café', ...extra })

test('criar: 201, aparece em GET /api/personal e created_id é o id', async () => {
  const send = session()
  const created = await send('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
  const weight = created.weights.find(item => item.id === created.created_id)
  assert.ok(weight)
  assert.deepEqual([weight.day, weight.grams, weight.note], [dayFromToday(-1), 70_500, 'Depois do café'])
  assert.ok(weight.created_at && weight.updated_at)
  assert.deepEqual((await send('/api/personal')).weights.map(item => item.id), [created.created_id])
  assert.deepEqual((await send('/api/personal/weights')).weights.map(item => item.id), [created.created_id])
  // Hoje vale; a nota é opcional.
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(), grams: 70_000 }, status: 201 })
})

test('editar: PUT parcial (só grams e note) devolve o estado novo, muda updated_at e preserva o resto', async () => {
  const send = session()
  const { created_id: id, weights } = await send('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
  await sleep(10)
  const changed = (await send(`/api/personal/weights/${id}`, { method: 'PUT', body: { grams: 71_000 } })).weights[0]
  assert.deepEqual([changed.grams, changed.note, changed.day, changed.created_at], [71_000, 'Depois do café', weights[0].day, weights[0].created_at])
  assert.notEqual(changed.updated_at, weights[0].updated_at)
  assert.equal((await send(`/api/personal/weights/${id}`, { method: 'PUT', body: { note: '' } })).weights[0].note, '')
  await send(`/api/personal/weights/${id}`, { method: 'PUT', body: {}, status: 422 })
})

test('apagar: DELETE devolve o estado sem o item e um novo DELETE é 404; a vaga do dia volta', async () => {
  const send = session()
  const { created_id: id } = await send('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
  assert.deepEqual((await send(`/api/personal/weights/${id}`, { method: 'DELETE' })).weights, [])
  await send(`/api/personal/weights/${id}`, { method: 'DELETE', status: 404 })
  await send(`/api/personal/weights/${GHOST_ID}`, { method: 'PUT', body: { grams: 70_000 }, status: 404 })
  await send('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
})

test('422 para campo extra, sem gravar nada', async () => {
  const send = session()
  const response = await send('/api/personal/weights', { method: 'POST', body: { ...make(), goal: 65_000 }, status: 422 })
  assert.match(response.message, /Campo não aceito: goal/)
  for (const field of ['credits', 'xp', 'level', 'unlock', 'target']) await send('/api/personal/weights', { method: 'POST', body: { ...make(), [field]: 1 }, status: 422 })
  assert.deepEqual((await send('/api/personal')).weights, [])
})

test('422 para limites: gramas, nota, data e tipos', async () => {
  const send = session()
  const bad = patch => send('/api/personal/weights', { method: 'POST', body: make(patch), status: 422 })
  await bad({ grams: 19_999 })
  await bad({ grams: 400_001 })
  await bad({ grams: 70.5 })
  await bad({ grams: '70500' })
  await bad({ grams: null })
  await bad({ note: 'n'.repeat(201) })
  await bad({ note: 'com\u0000controle' })
  await bad({ day: '2026-02-30' })
  await bad({ day: '1999-12-31' })
  await bad({ day: undefined })
  assert.deepEqual((await send('/api/personal')).weights, [])
  await send('/api/personal/weights', { method: 'POST', body: make({ day: dayFromToday(-2), grams: 20_000 }), status: 201 })
  await send('/api/personal/weights', { method: 'POST', body: make({ day: dayFromToday(-3), grams: 400_000, note: 'n'.repeat(200) }), status: 201 })
})

test('uma pesagem por dia, sem dia futuro e sem trocar o dia', async () => {
  const send = session()
  const { created_id: id } = await send('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
  const again = await send('/api/personal/weights', { method: 'POST', body: make({ grams: 71_000 }), status: 422 })
  assert.equal(again.message, 'Já existe uma pesagem neste dia; edite-a.')
  await send('/api/personal/weights', { method: 'POST', body: make({ day: dayFromToday(2) }), status: 422 })
  const edit = await send(`/api/personal/weights/${id}`, { method: 'PUT', body: { day: dayFromToday(-5) }, status: 422 })
  assert.match(edit.message, /Campo não aceito: day/)
  assert.equal((await send('/api/personal')).weights.length, 1)
})

test('tendência: 10 pesagens conhecidas, avg_grams bate com a média de 7 dias e vem em GET /api/personal', async () => {
  const send = session()
  const grams = [71_000, 70_800, 70_900, 70_600, 70_700, 70_500, 70_400, 70_450, 70_300, 70_250]
  for (const [index, value] of grams.entries()) {
    await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(index - 9), grams: value }, status: 201 })
  }
  const expected = grams.map((_, index) => {
    const window = grams.slice(Math.max(0, index - 6), index + 1)
    return Math.round(window.reduce((sum, value) => sum + value, 0) / window.length)
  })
  const personal = await send('/api/personal')
  assert.deepEqual(personal.weight_trend.map(point => point.avg_grams), expected)
  assert.deepEqual(personal.weight_trend.map(point => point.grams), grams)
  assert.deepEqual(personal.weight_trend.map(point => point.day), grams.map((_, index) => dayFromToday(index - 9)))
  // Só 10 dias de história: sem referência de 14 dias atrás, a direção fica em branco (sem palpite).
  assert.equal(personal.weight_direction, null)
  assert.deepEqual((await send('/api/personal/weights')).weight_trend, personal.weight_trend)
})

test('direção: estável dentro de ±0,5%, subindo e descendo fora dela, ambos só com média de 2 semanas atrás', async () => {
  const run = async (older, newer) => {
    const send = session()
    await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-14), grams: older }, status: 201 })
    return (await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(), grams: newer }, status: 201 })).weight_direction
  }
  assert.equal(await run(70_000, 70_300), 'estavel')
  assert.equal(await run(70_000, 69_700), 'estavel')
  assert.equal(await run(70_000, 70_500), 'subindo')
  assert.equal(await run(70_000, 69_500), 'descendo')
  // A última pesagem tem mais de 2 semanas: sem frase sobre "as últimas 2 semanas".
  const old = session()
  await old('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-40), grams: 70_000 }, status: 201 })
  assert.equal((await old('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-30), grams: 71_000 }, status: 201 })).weight_direction, null)
})

test('GET /api/personal traz os últimos 120 dias e GET /api/personal/weights o histórico completo', async () => {
  const send = session()
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-200), grams: 80_000 }, status: 201 })
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-5), grams: 79_000 }, status: 201 })
  const recent = await send('/api/personal')
  assert.deepEqual(recent.weights.map(item => item.grams), [79_000])
  const history = await send('/api/personal/weights')
  assert.deepEqual(history.weights.map(item => item.grams), [79_000, 80_000])
  assert.equal(history.weight_trend.length, 2)
})

test('cada sessão só vê, edita e apaga as próprias pesagens', async () => {
  const ana = session(), bia = session()
  const { created_id: id } = await ana('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
  assert.deepEqual((await bia('/api/personal')).weights, [])
  assert.deepEqual((await bia('/api/personal/weights')).weights, [])
  await bia(`/api/personal/weights/${id}`, { method: 'PUT', body: { grams: 60_000 }, status: 404 })
  await bia(`/api/personal/weights/${id}`, { method: 'DELETE', status: 404 })
  // A Bia pode pesar no mesmo dia: o limite de um por dia é por conta.
  await bia('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
  assert.equal((await ana('/api/personal')).weights[0].grams, 70_500)
})

test('teto por conta: o próximo registro é 422 com a mensagem e apagar libera vaga', async () => {
  const send = session()
  const ids = []
  for (let n = 0; n < 12; n++) ids.push((await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-n), grams: 70_000 + n }, status: 201 })).created_id)
  const full = await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-20), grams: 70_000 }, status: 422 })
  assert.equal(full.message, 'Você chegou ao limite de 12 registros deste tipo. Apague algum para continuar.')
  await send(`/api/personal/weights/${ids[0]}`, { method: 'DELETE' })
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(-20), grams: 70_000 }, status: 201 })
})

test('persistência e sem poder do navegador: o mesmo cookie recebe o mesmo estado e a pesagem não mexe nas moedas', async () => {
  const send = session()
  const coins = (await send('/api/city')).credits
  const created = await send('/api/personal/weights', { method: 'POST', body: make(), status: 201 })
  const first = await send('/api/personal')
  assert.deepEqual([first.weights, first.weight_trend, first.weight_direction], [created.weights, created.weight_trend, created.weight_direction])
  // O resumo da cidade nova carrega a hora da boas-vindas, que ainda muda a cada leitura (comportamento antigo): fica de fora.
  const { resumo: _a, ...again } = await send('/api/personal'), { resumo: _b, ...stored } = first
  assert.deepEqual(again, stored)
  assert.equal((await send('/api/city')).credits, coins)
  for (const field of ['credits', 'xp', 'level', 'unlock']) await send(`/api/personal/weights/${created.created_id}`, { method: 'PUT', body: { [field]: 5 }, status: 422 })
})

test('com login obrigatório, as rotas de peso sem sessão respondem 401', async () => {
  for (const [method, path] of [['GET', '/api/personal/weights'], ['POST', '/api/personal/weights'], ['PUT', `/api/personal/weights/${GHOST_ID}`], ['DELETE', `/api/personal/weights/${GHOST_ID}`]]) {
    const response = await loginHarness.fetch(ORIGIN + path, { method, headers: { Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json' }, body: ['GET', 'DELETE'].includes(method) ? undefined : '{}' })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
})

test('?month= inválido só derruba a leitura: a escrita ignora o parâmetro', async () => {
  const send = session()
  await send('/api/personal/weights?month=2026-13', { method: 'POST', body: make(), status: 201 })
  await send('/api/personal?month=2026-13', { status: 422 })
})
