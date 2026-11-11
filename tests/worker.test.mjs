// Testes do Worker com D1 e Durable Objects simulados, sem conta do Cloudflare.
// Rode com: npm run test:worker
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestHarness } from 'wrangler'
import worker from '../worker/index.js'
import { DemoSession, sessionCookie } from '../worker/demo.js'
import { applyCityAction, newCity, normalizeAction, snapshot } from '../worker/city.js'
import referencePlans from '../shared/game/city-reference-plans.json' with { type: 'json' }
import { connectedRoads, getBuilding, getCityLayout, hasRoadFrontage, tileKey } from '../shared/game/city-layout.js'
import { SPACE_ORDER } from '../src/world/worldSpaces.js'

const ORIGIN = 'https://cityou.test'
const harness = createTestHarness({ workers: [{ configPath: 'wrangler.test.jsonc' }] })
const closedHarness = createTestHarness({ workers: [{ configPath: 'wrangler.test-closed.jsonc' }] })
const call = (path, init) => harness.fetch(ORIGIN + path, init)
let env

async function applyMigrations(db) {
  for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', file), 'utf8').replace(/^\s*--.*$/gm, '')
    const statements = sql.split(';').map(part => part.trim()).filter(Boolean)
    await db.batch(statements.map(statement => db.prepare(statement)))
  }
}

before(async () => {
  await harness.listen()
  await closedHarness.listen()
  env = await harness.getWorker().getEnv()
})
after(async () => { await harness.close(); await closedHarness.close() })

test('health: sem banco ligado responde not_configured', async () => {
  const response = await worker.fetch(new Request(ORIGIN + '/api/health'), {})
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { app: 'cityou', status: 'ok', db: 'not_configured', db_region: null })
})

test('health: banco sem migrações responde no_schema; com migrações, ok', async () => {
  assert.equal((await (await call('/api/health')).json()).db, 'no_schema')
  await applyMigrations(env.DB)
  const response = await call('/api/health')
  assert.equal((await response.json()).db, 'ok')
})

test('toda resposta da API sai sem cache e com Server-Timing', async () => {
  const response = await call('/api/health')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.match(response.headers.get('Server-Timing'), /^total;dur=\d+(\.\d)?, db;dur=\d+(\.\d)?$/)
})

test('rota desconhecida responde 404 em JSON, no formato lido por ApiError', async () => {
  const response = await call('/api/nao-existe')
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { message: 'Rota não encontrada.', detail: 'Rota não encontrada.' })
})

test('método errado numa rota que existe responde 405', async () => {
  const response = await call('/api/health', { method: 'DELETE', headers: { 'X-Fifones-City': '1', Origin: ORIGIN } })
  assert.equal(response.status, 405)
})

test('escrita sem o cabeçalho, sem origem ou de outra origem é recusada', async () => {
  const attempts = [
    {},
    { 'X-Fifones-City': '1' },
    { 'X-Fifones-City': '1', Origin: 'https://outro-site.example' },
    { 'X-Fifones-City': '1', Origin: 'não é uma url' },
    { Origin: ORIGIN },
  ]
  for (const headers of attempts) {
    const response = await call('/api/health', { method: 'POST', headers })
    assert.equal(response.status, 403, JSON.stringify(headers))
  }
})

test('migração: e-mail único e chave estrangeira valem no D1 local', async () => {
  const now = new Date().toISOString()
  const insertUser = (id, email) => env.DB.prepare(
    'INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, email, 'Teste', 'h', 's', 1, now, now).run()
  await insertUser('u1', 'a@cityou.test')
  await assert.rejects(insertUser('u2', 'a@cityou.test'), /UNIQUE/)
  await assert.rejects(
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind('t', 'usuario-que-nao-existe', now, now, now).run(),
    /FOREIGN KEY/,
  )
})

const ISLAND = 'ilha-inicial'
const PETRA = 'petra'
const GREAT_WALL = 'grande-muralha'

function newDemoSession(target = call) {
  const cookie = sessionCookie(new URL(ORIGIN)).split(';')[0]
  const session = async (path, { method = 'GET', body, status = 200 } = {}) => {
    const headers = { Cookie: cookie }
    if (body !== undefined) {
      headers.Origin = ORIGIN
      headers['X-Fifones-City'] = '1'
      headers['Content-Type'] = 'application/json'
    }
    const response = await target(path, { method, headers, body: JSON.stringify(body) })
    const result = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`)
    return result
  }
  session.cookie = cookie
  return session
}

const city = (session, local) => session(`/api/city?local=${local}`)
const world = session => session('/api/world/progress')
const build = (session, local, request_id, expected_revision, { kind = 'home', x = 7, y = 8, status } = {}) =>
  session(`/api/city/actions?local=${local}`, {
    method: 'POST', body: { type: 'build', kind, x, y, expected_revision, request_id }, status,
  })
const travel = (session, local, request_id, status) => session('/api/world/travel', {
  method: 'POST', body: { local, request_id }, status,
})

test('cidades regionais: construir abre uma escolha de viagem e só o servidor libera destinos', async () => {
  const session = newDemoSession()
  assert.equal((await call('/api/city')).status, 401)
  await session(`/api/city?local=${PETRA}`, { status: 403 })
  await session('/api/city?local=local-inexistente', { status: 404 })
  await travel(session, PETRA, 'sem-vaga', 409)
  await travel(session, 'local-inexistente', 'destino-invalido', 404)

  const start = await city(session, ISLAND)
  const withRoad = await build(session, ISLAND, 'estrada', start.revision, { kind: 'road' })
  assert.equal((await world(session)).viagens_disponiveis, 0)
  const withHouse = await build(session, ISLAND, 'casa-um', withRoad.revision, { x: 6 })
  await build(session, ISLAND, 'casa-dois', withHouse.revision, { x: 5, y: 9 })
  const earned = await world(session)
  assert.deepEqual(earned.desbloqueados, [ISLAND])
  assert.deepEqual(earned.concluidos, [ISLAND])
  assert.equal(earned.viagens_disponiveis, 1)

  const opened = await travel(session, PETRA, 'primeira-viagem')
  assert.deepEqual(opened.desbloqueados, [ISLAND, PETRA])
  assert.equal(opened.viagens_disponiveis, 0)
  assert.deepEqual(await travel(session, PETRA, 'primeira-viagem'), opened)
  await travel(session, GREAT_WALL, 'primeira-viagem', 409)
  await travel(session, GREAT_WALL, 'sem-outra-vaga', 409)
  await session('/api/world/progress', {
    method: 'PUT', body: { ...opened, desbloqueados: [ISLAND, PETRA, GREAT_WALL] },
  })
  assert.deepEqual((await world(session)).desbloqueados, [ISLAND, PETRA])
  await session(`/api/city?local=${GREAT_WALL}`, { status: 403 })
})

test('cidades regionais: construções isoladas, carteira única e reenvio sem cobrança dupla', async () => {
  const session = newDemoSession()
  const initial = await city(session, ISLAND)
  const island = await build(session, ISLAND, 'casa-ilha', initial.revision)
  await travel(session, PETRA, 'viajar-petra')
  const petraBefore = await city(session, PETRA)
  assert.equal(petraBefore.credits, island.credits)
  assert.equal(petraBefore.placements.some(item => item.kind === 'home'), false)
  const petra = await build(session, PETRA, 'casa-petra', petraBefore.revision)
  const repeat = await build(session, PETRA, 'casa-petra', petraBefore.revision)
  assert.equal(repeat.credits, petra.credits)
  assert.equal(repeat.placements.filter(item => item.kind === 'home').length, 1)
  assert.notEqual(petra.placements.find(item => item.kind === 'home').id, island.placements.find(item => item.kind === 'home').id)

  await travel(session, GREAT_WALL, 'viajar-muralha')
  const task = await session('/api/personal/tasks', { method: 'POST', body: { title: 'Tarefa da carteira' }, status: 201 })
  await session(`/api/workspace/tasks/${task.id}/complete`, { method: 'POST', body: {} })
  const [petraNow, wallNow] = await Promise.all([city(session, PETRA), city(session, GREAT_WALL)])
  assert.equal(petraNow.credits, 20)
  assert.equal(wallNow.credits, petraNow.credits)
  const requests = [
    { local: PETRA, revision: petraNow.revision },
    { local: GREAT_WALL, revision: wallNow.revision },
  ]
  const attempts = await Promise.allSettled(requests.map(({ local, revision }) =>
    build(session, local, `concorrente-${local}`, revision, { x: 6 })))
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
  const refused = attempts.find(result => result.status === 'rejected')
  assert.match(String(refused.reason), /Moedas insuficientes/)
  const [petraAfter, wallAfter, islandAfter] = await Promise.all([city(session, PETRA), city(session, GREAT_WALL), city(session, ISLAND)])
  assert.deepEqual([petraAfter, wallAfter, islandAfter].map(result => result.credits), [0, 0, 0])
  assert.equal([...petraAfter.placements, ...wallAfter.placements].filter(item => item.kind === 'home').length, 2)
  assert.deepEqual(islandAfter.placements, island.placements)

  const other = newDemoSession()
  await other(`/api/city?local=${PETRA}`, { status: 403 })
  assert.equal((await city(other, ISLAND)).credits, initial.credits)
})

test('cidades regionais: cidade, viagem e comprovante anteriores continuam válidos', async () => {
  const oldCity = newCity()
  oldCity.credits = 30
  oldCity.revision = 1
  oldCity.placements.push({ id: 'casa-anterior', kind: 'home', x: 7, y: 7, rotation: 0, level: 1 })
  const oldAction = normalizeAction({ type: 'build', kind: 'home', x: 7, y: 7, expected_revision: 0, request_id: 'compra-anterior' })
  const legacyRows = new Map([
    ['city/state', oldCity],
    [`city-request/${oldAction.request_id}`, JSON.stringify(oldAction)],
    ['world/progress', { versao: 1, epoca: 2, desbloqueados: [ISLAND, 'cristo-redentor'], concluidos: [] }],
  ])
  const session = Object.create(DemoSession.prototype)
  session.read = (kind, id) => structuredClone(legacyRows.get(`${kind}/${id}`) ?? null)
  const progress = await session.world().json()
  assert.deepEqual(progress.desbloqueados, [ISLAND, 'cristo-redentor'])
  assert.deepEqual(progress.concluidos, [ISLAND])
  assert.equal(progress.viagens_disponiveis, 0)
  session.requireLocation('cristo-redentor')
  assert.equal(session.citySnapshot('cristo-redentor').credits, 30)
  const repeated = await session.cityAction(oldAction, ISLAND).json()
  assert.equal(repeated.credits, 30)
  assert.deepEqual(repeated.placements, oldCity.placements)
})

test('metas premiam a carteira uma vez, ao atingir a quantidade de dias', async () => {
  const session = newDemoSession()
  const today = (await session('/api/personal')).today
  const createGoal = async target => (await session('/api/personal/entries', {
    method: 'POST', body: { kind: 'goal', day: today, title: 'Meta de teste', target }, status: 201,
  })).created_id
  const check = (id, done) => session(`/api/personal/entries/${id}/checkin`, {
    method: 'PUT', body: { done },
  })

  await check(await createGoal(2), true)
  assert.equal((await city(session, ISLAND)).credits, 50)
  const goal = await createGoal(1)
  await check(goal, true)
  await check(goal, false)
  await check(goal, true)
  const player = await city(session, ISLAND)
  assert.equal(player.credits, 75)
  assert.equal(player.reward_count, 1)
})

test('plantas-piloto comportam o total previsto com ruas, reservas e cinco tipos', () => {
  const expected = { [ISLAND]: 32, 'cristo-redentor': 40 }
  for (const [location, capacity] of Object.entries(expected)) {
    const plan = referencePlans[location]
    assert.equal(plan.capacity, capacity)
    const town = newCity(location, true)
    const action = input => applyCityAction(town, normalizeAction({
      ...input, expected_revision: town.revision, request_id: 'planta-' + town.revision,
    }), location, true)
    const layout = getCityLayout(location)
    const protectedTiles = new Set(layout.protectedTiles.map(([x, y]) => tileKey(x, y)))
    assert.ok(layout.protectedTiles.length > 0)
    assert.equal(layout.max - layout.min + 1, 33)
    assert.equal(layout.roadSeeds.some(([x, y]) => protectedTiles.has(tileKey(x, y))), false)
    for (const [x, y, end_x, end_y] of plan.roads) action({ type: 'road_path', x, y, end_x, end_y })
    for (const [kind, x, y, rotation] of plan.buildings) action({ type: 'build', kind, x, y, rotation })
    assert.equal(town.credits, 5000 - plan.cost)
    assert.equal(new Set(plan.buildings.map(([kind]) => kind)).size, 5)
    assert.ok(plan.buildings.filter(([kind]) => getBuilding(kind).width === 3).length >= capacity * 0.25)
    const roads = connectedRoads(town.placements)
    const built = town.placements.filter(placement => plan.buildings.some(([kind]) => kind === placement.kind))
    assert.equal(built.length, capacity)
    assert.ok(built.every(placement => hasRoadFrontage(placement, roads)))
    assert.equal(snapshot(town, location, true).unlock_radius, 16)
  }
})

test('prévia abre os oito locais e mantém o saldo de teste ao alternar cidades', async () => {
  const preview = createTestHarness({
    workers: [{ configPath: 'wrangler.test.jsonc', vars: { CITYOU_TEST_OPEN_REGIONS: '1', TRAVEL_OPEN: 'false' } }],
  })
  await preview.listen()
  try {
    const session = newDemoSession((path, init) => preview.fetch(ORIGIN + path, init))
    const worldState = await world(session)
    assert.equal(worldState.test_mode, true)
    assert.equal(worldState.viagens_abertas, true)
    assert.deepEqual(worldState.desbloqueados, SPACE_ORDER)
    const initial = await city(session, ISLAND)
    assert.equal(initial.credits, 5000)
    assert.equal(initial.test_mode, true)
    assert.deepEqual([initial.grid_min, initial.grid_max, initial.unlock_radius], [-8, 24, 16])
    assert.equal((await city(session, PETRA)).credits, 5000)
    const rio = await city(session, 'cristo-redentor')
    assert.ok(rio.catalog.some(item => item.id === 'rio-fair'))
    assert.equal(rio.catalog.some(item => item.id === 'island-market'), false)
    assert.notDeepEqual(rio.protected_tiles, initial.protected_tiles)
    await build(session, ISLAND, 'lote-agua', initial.revision, {
      kind: 'tree', x: -8, y: -8, status: 422,
    })
    await build(session, 'cristo-redentor', 'lote-encosta', rio.revision, {
      kind: 'tree', x: 5, y: -7, status: 422,
    })
    await build(session, 'cristo-redentor', 'catalogo-invalido', rio.revision, {
      kind: 'island-house', x: 11, y: 10, status: 422,
    })
    const built = await build(session, ISLAND, 'casa-costeira', initial.revision, { kind: 'island-house', x: 9, y: 10 })
    assert.equal(built.credits, 4980)
    assert.equal((await city(session, 'cristo-redentor')).credits, 4980)
    assert.equal((await city(session, PETRA)).credits, 4980)
    assert.equal((await city(session, ISLAND)).credits, 4980)

    const regular = newDemoSession()
    assert.equal((await world(regular)).test_mode, false)
    assert.equal((await city(regular, ISLAND)).credits, 50)
    await regular('/api/city?local=cristo-redentor', { status: 403 })
  } finally {
    await preview.close()
  }
})

test('trecho viário é validado e cobrado em conjunto, com reenvio idempotente', async () => {
  const session = newDemoSession()
  const start = await city(session, ISLAND)
  const path = (request_id, expected_revision, x, y, end_x, end_y, status) => session('/api/city/actions?local=' + ISLAND, {
    method: 'POST', body: { type: 'road_path', request_id, expected_revision, x, y, end_x, end_y }, status,
  })

  await path('isolado', start.revision, 5, 5, 7, 5, 422)
  await path('colisao', start.revision, 6, 8, 9, 8, 409)
  assert.equal((await city(session, ISLAND)).credits, start.credits)

  const built = await path('trecho', start.revision, 6, 9, 6, 11)
  assert.equal(built.credits, start.credits - 4)
  assert.equal(built.revision, start.revision + 1)
  const retried = await path('trecho', start.revision, 6, 9, 6, 11)
  assert.deepEqual(retried.placements, built.placements)
  assert.equal(retried.credits, built.credits)

  const cut = built.placements.find(item => item.kind === 'road' && item.x === 6 && item.y === 10)
  await session('/api/city/actions?local=' + ISLAND, {
    method: 'POST',
    body: { type: 'remove', request_id: 'cortar', expected_revision: built.revision, placement_id: cut.id },
    status: 422,
  })
  assert.deepEqual((await city(session, ISLAND)).placements, built.placements)
})

const closedCall = (path, init) => closedHarness.fetch(ORIGIN + path, init)

test('viagens fechadas: ninguém abre destino novo, mas construir na cidade atual segue valendo', async () => {
  const session = newDemoSession(closedCall)
  const start = await city(session, ISLAND)
  const withRoad = await build(session, ISLAND, 'estrada', start.revision, { kind: 'road' })
  const withHouse = await build(session, ISLAND, 'casa-um', withRoad.revision, { x: 6 })
  await build(session, ISLAND, 'casa-dois', withHouse.revision, { x: 5, y: 9 })
  const earned = await world(session)
  assert.equal(earned.viagens_abertas, false)
  assert.equal(earned.viagens_disponiveis, 0)
  assert.deepEqual(earned.concluidos, [ISLAND])
  const refused = await travel(session, PETRA, 'viagem-fechada', 409)
  assert.match(refused.message, /ainda não estão abertas/)
  await session(`/api/city?local=${PETRA}`, { status: 403 })
  // O navegador não consegue reabrir as viagens: a sessão lê o estado da configuração do Worker.
  const forged = await closedCall('/api/world/travel', {
    method: 'POST',
    headers: { Cookie: sessionCookie(new URL(ORIGIN)).split(';')[0], Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json', 'X-Travel-Open': '1' },
    body: JSON.stringify({ local: PETRA, request_id: 'forjada' }),
  })
  assert.equal(forged.status, 409)
})

// Uma foto JPEG mínima, só para passar na checagem de formato. Cada uma tem um byte final diferente.
const photo = n => 'data:image/jpeg;base64,' + btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, n))
const NOTE = 'Treinei pernas por quarenta minutos na academia.'

async function newHabit(session, extra = {}) {
  const today = (await session('/api/personal')).today
  return (await session('/api/personal/entries', {
    method: 'POST', body: { kind: 'habit', day: today, title: 'Treinar', domain: 'saude', place: 'Academia Central', ...extra }, status: 201,
  })).created_id
}
const checkin = (session, id, body, status) => session(`/api/personal/entries/${id}/checkin`, { method: 'PUT', body, status })

test('atividades guardam área e local; área ou local inválidos são recusados', async () => {
  const session = newDemoSession()
  const id = await newHabit(session)
  const entry = (await session('/api/personal')).entries.find(item => item.id === id)
  assert.equal(entry.domain, 'saude')
  assert.equal(entry.place, 'Academia Central')
  const today = (await session('/api/personal')).today
  const other = await session('/api/personal/entries', { method: 'POST', body: { kind: 'habit', day: today, title: 'Sem área' }, status: 201 })
  assert.equal((await session('/api/personal')).entries.find(item => item.id === other.created_id).domain, 'organizacao')
  await session('/api/personal/entries', { method: 'POST', body: { kind: 'habit', day: today, title: 'X', domain: 'jogos' }, status: 422 })
  await session('/api/personal/entries', { method: 'POST', body: { kind: 'habit', day: today, title: 'X', place: 'a'.repeat(81) }, status: 422 })
})

test('comprovação: bônus uma vez por atividade por dia, com teto diário, e a nota fica guardada', async () => {
  const session = newDemoSession()
  const before = (await city(session, ISLAND)).credits
  const habit = await newHabit(session)
  const done = await checkin(session, habit, { done: true, proof: { note: NOTE } })
  assert.deepEqual(done.proof_result, { bonus: 5, reason: null })
  assert.equal((await city(session, ISLAND)).credits, before + 5 + 5)
  assert.deepEqual(done.proofs.map(item => [item.entry_id, item.note, item.has_photo]), [[habit, NOTE, false]])
  // Marcar de novo com outra nota atualiza a comprovação, mas não paga de novo.
  const again = await checkin(session, habit, { done: true, proof: { note: NOTE + ' Mais uma série.' } })
  assert.deepEqual(again.proof_result, { bonus: 0, reason: 'already_proved' })
  assert.equal((await city(session, ISLAND)).credits, before + 10)
  // O teto é de 3 bônus por dia.
  const paid = []
  for (const title of ['Ler', 'Meditar', 'Caminhar']) {
    const id = await newHabit(session, { title })
    paid.push((await checkin(session, id, { done: true, proof: { note: NOTE } })).proof_result)
  }
  assert.deepEqual(paid.map(item => item.bonus), [5, 5, 0])
  assert.equal(paid[2].reason, 'daily_cap')
})

test('comprovação: marcar sem comprovar continua valendo e a comprovação é opcional', async () => {
  const session = newDemoSession()
  const before = (await city(session, ISLAND)).credits
  const habit = await newHabit(session)
  const plain = await checkin(session, habit, { done: true })
  assert.equal(plain.proof_result, undefined)
  assert.equal((await city(session, ISLAND)).credits, before + 5)
  const undone = await checkin(session, habit, { done: false, proof: { note: NOTE } })
  assert.equal(undone.proof_result, undefined)
})

test('comprovação: foto vale uma vez, só JPEG ou WebP, e a foto só volta para quem enviou', async () => {
  const session = newDemoSession()
  const first = await newHabit(session)
  const second = await newHabit(session, { title: 'Outro' })
  const result = await checkin(session, first, { done: true, proof: { photo: photo(1) } })
  assert.equal(result.proof_result.bonus, 5)
  assert.equal(result.proofs[0].has_photo, true)
  assert.equal(JSON.stringify(result).includes('base64'), false)
  const today = result.today
  const fetchPhoto = cookie => call(`/api/personal/proofs/${first}/${today}/photo`, { headers: { Cookie: cookie } })
  const image = await fetchPhoto(session.cookie)
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('Content-Type'), 'image/jpeg')
  assert.equal(new Uint8Array(await image.arrayBuffer())[0], 0xff)
  // Outro visitante não enxerga a foto: cada sessão tem o seu próprio armazenamento.
  assert.equal((await fetchPhoto(newDemoSession().cookie)).status, 404)
  assert.equal((await call(`/api/personal/proofs/${first}/${today}/photo`)).status, 401)
  await checkin(session, second, { done: true, proof: { photo: photo(1) } }, 422)
  await checkin(session, second, { done: true, proof: { photo: 'data:image/gif;base64,R0lGODlh' } }, 422)
  await checkin(session, second, { done: true, proof: { photo: 'data:image/jpeg;base64,AAAA' } }, 422)
  await checkin(session, second, { done: true, proof: { note: 'curta' } }, 422)
  await checkin(session, second, { done: true, proof: {} }, 422)
  await checkin(session, second, { done: true, proof: { note: NOTE, extra: 1 } }, 422)
  assert.equal((await checkin(session, second, { done: true, proof: { photo: photo(2) } })).proof_result.bonus, 5)
})
