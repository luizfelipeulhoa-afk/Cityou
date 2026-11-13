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
const loginHarness = createTestHarness({ workers: [{ configPath: 'wrangler.test-login.jsonc' }] })
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
  await loginHarness.listen()
  env = await harness.getWorker().getEnv()
})
after(async () => { await harness.close(); await closedHarness.close(); await loginHarness.close() })

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
const RIO = 'cristo-redentor'
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

  const start = await city(session, RIO)
  const withRoad = await build(session, RIO, 'estrada', start.revision, { kind: 'road' })
  assert.equal((await world(session)).viagens_disponiveis, 0)
  const withHouse = await build(session, RIO, 'casa-um', withRoad.revision, { x: 6 })
  await build(session, RIO, 'casa-dois', withHouse.revision, { x: 5, y: 9 })
  const earned = await world(session)
  assert.deepEqual(earned.desbloqueados, [ISLAND, RIO])
  assert.deepEqual(earned.concluidos, [ISLAND, RIO])
  assert.equal(earned.viagens_disponiveis, 1)

  const opened = await travel(session, PETRA, 'primeira-viagem')
  assert.deepEqual(opened.desbloqueados, [ISLAND, RIO, PETRA])
  assert.equal(opened.viagens_disponiveis, 0)
  assert.deepEqual(await travel(session, PETRA, 'primeira-viagem'), opened)
  await travel(session, GREAT_WALL, 'primeira-viagem', 409)
  await travel(session, GREAT_WALL, 'sem-outra-vaga', 409)
  await session('/api/world/progress', {
    method: 'PUT', body: { ...opened, desbloqueados: [ISLAND, RIO, PETRA, GREAT_WALL] },
  })
  assert.deepEqual((await world(session)).desbloqueados, [ISLAND, RIO, PETRA])
  await session(`/api/city?local=${GREAT_WALL}`, { status: 403 })
})

test('cidades regionais: construções isoladas, carteira única e reenvio sem cobrança dupla', async () => {
  const session = newDemoSession()
  const initial = await city(session, RIO)
  const island = await build(session, RIO, 'casa-ilha', initial.revision)
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
  const [petraAfter, wallAfter, islandAfter] = await Promise.all([city(session, PETRA), city(session, GREAT_WALL), city(session, RIO)])
  assert.deepEqual([petraAfter, wallAfter, islandAfter].map(result => result.credits), [0, 0, 0])
  assert.equal([...petraAfter.placements, ...wallAfter.placements].filter(item => item.kind === 'home').length, 2)
  assert.deepEqual(islandAfter.placements, island.placements)

  const other = newDemoSession()
  await other(`/api/city?local=${PETRA}`, { status: 403 })
  assert.equal((await city(other, RIO)).credits, initial.credits)
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
  assert.deepEqual(repeated.placements, []) // a ilha agora é só cenário: nada é exibido nela
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
  assert.equal((await city(session, RIO)).credits, 50)
  const goal = await createGoal(1)
  await check(goal, true)
  await check(goal, false)
  await check(goal, true)
  const player = await city(session, RIO)
  assert.equal(player.credits, 75)
  assert.equal(player.reward_count, 1)
})

test('plantas-piloto comportam o total previsto com ruas, reservas e cinco tipos', () => {
  const expected = { [RIO]: 40 }
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
    const initial = await city(session, RIO)
    assert.equal(initial.credits, 5000)
    assert.equal(initial.test_mode, true)
    assert.deepEqual([initial.grid_min, initial.grid_max, initial.unlock_radius], [-8, 24, 16])
    assert.equal((await city(session, PETRA)).credits, 5000)
    const rio = await city(session, 'cristo-redentor')
    assert.ok(rio.catalog.some(item => item.id === 'rio-fair'))
    assert.equal(rio.catalog.some(item => item.id === 'island-market'), false)
    const withModel = rio.catalog.filter(item => item.model?.startsWith('/models/rio/'))
    assert.equal(withModel.length, 9)
    assert.ok(withModel.every(item => item.preview === `/previews/${item.id}.png`))
    assert.notDeepEqual(rio.protected_tiles, (await city(session, PETRA)).protected_tiles)
    await build(session, RIO, 'lote-agua', initial.revision, {
      kind: 'tree', x: -8, y: -8, status: 422,
    })
    await build(session, 'cristo-redentor', 'lote-encosta', rio.revision, {
      kind: 'tree', x: 5, y: -7, status: 422,
    })
    await build(session, 'cristo-redentor', 'catalogo-invalido', rio.revision, {
      kind: 'island-house', x: 11, y: 10, status: 422,
    })
    const built = await build(session, RIO, 'casa-costeira', initial.revision, { kind: 'rio-sobrado', x: 7, y: 10 })
    assert.equal(built.credits, 4980)
    assert.equal((await city(session, 'cristo-redentor')).credits, 4980)
    assert.equal((await city(session, PETRA)).credits, 4980)
    assert.equal((await city(session, RIO)).credits, 4980)
    // Prédio com GLB próprio (3 × 3): mesma validação de lote e mesmo custo do catálogo.
    const deco = await build(session, RIO, 'edificio-deco', built.revision, { kind: 'rio-edificio-deco', x: 11, y: 11 })
    assert.equal(deco.credits, 4920)
    await build(session, RIO, 'edificio-deco-sobreposto', deco.revision, { kind: 'rio-laje', x: 12, y: 12, status: 409 })

    const regular = newDemoSession()
    assert.equal((await world(regular)).test_mode, false)
    assert.equal((await city(regular, RIO)).credits, 50)
    await regular('/api/city?local=cristo-redentor') // o Rio já nasce aberto
    await regular(`/api/city?local=${PETRA}`, { status: 403 })
  } finally {
    await preview.close()
  }
})

test('moedas de teste dos sócios: só com o segredo, uma vez por sessão', async () => {
  const token = 'segredo-de-teste-com-mais-de-16'
  const withToken = createTestHarness({ workers: [{ configPath: 'wrangler.test.jsonc', vars: { CITYOU_ADMIN_TOKEN: token } }] })
  await withToken.listen()
  try {
    const session = newDemoSession((path, init) => withToken.fetch(ORIGIN + path, init))
    const grant = (given, cookie = session.cookie) => withToken.fetch(`${ORIGIN}/api/admin/credits`, {
      method: 'POST', body: '{}',
      headers: { Cookie: cookie, Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json', ...(given && { 'X-Cityou-Admin': given }) },
    })
    assert.equal((await grant(null)).status, 403)
    assert.equal((await grant('token-errado-token-errado')).status, 403)
    assert.equal((await city(session, RIO)).credits, 50)
    const ok = await grant(token)
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).credits, 50_050)
    assert.equal((await city(session, RIO)).credits, 50_050)
    assert.equal((await grant(token)).status, 409)
    assert.equal((await city(session, RIO)).credits, 50_050)
    // Outra sessão (outro sócio) recebe a sua parte, e a primeira continua intacta.
    const other = newDemoSession((path, init) => withToken.fetch(ORIGIN + path, init))
    assert.equal((await city(other, RIO)).credits, 50)
  } finally {
    await withToken.close()
  }
  // Sem o segredo configurado, a rota não existe.
  const session = newDemoSession()
  const response = await call('/api/admin/credits', {
    method: 'POST', body: '{}',
    headers: { Cookie: session.cookie, Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json', 'X-Cityou-Admin': 'qualquer-coisa-qualquer' },
  })
  assert.equal(response.status, 404)
})

test('trecho viário é validado e cobrado em conjunto, com reenvio idempotente', async () => {
  const session = newDemoSession()
  const start = await city(session, RIO)
  const path = (request_id, expected_revision, x, y, end_x, end_y, status) => session('/api/city/actions?local=' + RIO, {
    method: 'POST', body: { type: 'road_path', request_id, expected_revision, x, y, end_x, end_y }, status,
  })

  await path('isolado', start.revision, 5, 5, 7, 5, 422)
  await path('colisao', start.revision, 6, 8, 9, 8, 409)
  assert.equal((await city(session, RIO)).credits, start.credits)

  const built = await path('trecho', start.revision, 6, 9, 6, 11)
  assert.equal(built.credits, start.credits - 4)
  assert.equal(built.revision, start.revision + 1)
  const retried = await path('trecho', start.revision, 6, 9, 6, 11)
  assert.deepEqual(retried.placements, built.placements)
  assert.equal(retried.credits, built.credits)

  const cut = built.placements.find(item => item.kind === 'road' && item.x === 6 && item.y === 10)
  await session('/api/city/actions?local=' + RIO, {
    method: 'POST',
    body: { type: 'remove', request_id: 'cortar', expected_revision: built.revision, placement_id: cut.id },
    status: 422,
  })
  assert.deepEqual((await city(session, RIO)).placements, built.placements)
})

const closedCall = (path, init) => closedHarness.fetch(ORIGIN + path, init)

test('viagens fechadas: ninguém abre destino novo, mas construir na cidade atual segue valendo', async () => {
  const session = newDemoSession(closedCall)
  const start = await city(session, RIO)
  const withRoad = await build(session, RIO, 'estrada', start.revision, { kind: 'road' })
  const withHouse = await build(session, RIO, 'casa-um', withRoad.revision, { x: 6 })
  await build(session, RIO, 'casa-dois', withHouse.revision, { x: 5, y: 9 })
  const earned = await world(session)
  assert.equal(earned.viagens_abertas, false)
  assert.equal(earned.viagens_disponiveis, 0)
  assert.deepEqual(earned.concluidos, [ISLAND, RIO])
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
  const before = (await city(session, RIO)).credits
  const habit = await newHabit(session)
  const done = await checkin(session, habit, { done: true, proof: { note: NOTE } })
  assert.deepEqual(done.proof_result, { bonus: 5, reason: null })
  assert.equal((await city(session, RIO)).credits, before + 5 + 5)
  assert.deepEqual(done.proofs.map(item => [item.entry_id, item.note, item.has_photo]), [[habit, NOTE, false]])
  // Marcar de novo com outra nota atualiza a comprovação, mas não paga de novo.
  const again = await checkin(session, habit, { done: true, proof: { note: NOTE + ' Mais uma série.' } })
  assert.deepEqual(again.proof_result, { bonus: 0, reason: 'already_proved' })
  assert.equal((await city(session, RIO)).credits, before + 10)
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
  const before = (await city(session, RIO)).credits
  const habit = await newHabit(session)
  const plain = await checkin(session, habit, { done: true })
  assert.equal(plain.proof_result, undefined)
  assert.equal((await city(session, RIO)).credits, before + 5)
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

const buildFor = (session, activity_id, expected_revision, extra = {}, status) => session('/api/city/actions', {
  method: 'POST', body: { type: 'build', activity_id, expected_revision, request_id: crypto.randomUUID(), ...extra }, status,
})

test('prédio da atividade: nasce sozinho no terreno, com o nome do local e o tipo da área', async () => {
  const session = newDemoSession()
  const habit = await newHabit(session, { place: 'Academia Central', domain: 'saude' })
  const start = await city(session, RIO)
  const built = await buildFor(session, habit, start.revision)
  const building = built.placements.find(item => item.activity_id === habit)
  assert.equal(building.kind, 'dom-saude')
  assert.equal(building.nome, 'Academia Central')
  assert.equal(building.etapa, 0)
  assert.equal(building.etapa_nome, 'Terreno')
  assert.ok(Number.isInteger(building.x) && Number.isInteger(building.y))
  assert.equal(built.credits, 30)
  assert.match(built.history[0].label, /Academia Central/)
  assert.deepEqual((await session('/api/personal')).predios, [habit])
  // Pratica hoje: segue sem passar de Terreno, porque a etapa depende de vários dias e semanas.
  await checkin(session, habit, { done: true })
  const after = (await city(session, RIO)).placements.find(item => item.activity_id === habit)
  assert.deepEqual([after.etapa, after.dias, after.semanas], [0, 1, 1])
  assert.equal(after.proxima.etapa_nome, 'Fundação')
  // Sem local, o nome é o título da atividade.
  const noPlace = await newHabit(session, { title: 'Meditar', place: '', domain: 'mente' })
  const second = await buildFor(session, noPlace, (await city(session, RIO)).revision)
  assert.equal(second.placements.find(item => item.activity_id === noPlace).nome, 'Meditar')
})

test('prédio da atividade: uma atividade tem um prédio só, só hábito ou meta, só dela, e sem moedas não constrói', async () => {
  const session = newDemoSession()
  const habit = await newHabit(session)
  const start = await city(session, RIO)
  const built = await buildFor(session, habit, start.revision)
  const repeated = await buildFor(session, habit, built.revision, {}, 409)
  assert.match(repeated.message, /já tem um prédio/)
  const other = await newHabit(session, { title: 'Outro', domain: 'financas' })
  await buildFor(session, other, built.revision, { kind: 'dom-saude' }, 422)
  const task = await session('/api/personal/tasks', { method: 'POST', body: { title: 'Tarefa' }, status: 201 })
  await buildFor(session, task.id, built.revision, {}, 404)
  await buildFor(session, '00000000-0000-0000-0000-000000000000', built.revision, {}, 404)
  await buildFor(session, 'nao-e-um-id', built.revision, {}, 422)
  const stranger = newDemoSession()
  await buildFor(stranger, habit, (await city(stranger, RIO)).revision, {}, 404)
  // Saldo: 50 moedas dão para dois prédios de 20 e o terceiro é recusado.
  let revision = built.revision
  const ids = [other]
  for (const title of ['Terceiro']) ids.push(await newHabit(session, { title }))
  const next = await buildFor(session, ids[0], revision, { kind: 'dom-financas' })
  revision = next.revision
  const refused = await buildFor(session, ids[1], revision, {}, 422)
  assert.match(refused.message, /Moedas insuficientes/)
})

test('prédio da atividade: reenviar a mesma ação não cobra de novo', async () => {
  const session = newDemoSession()
  const habit = await newHabit(session)
  const start = await city(session, RIO)
  const request_id = 'mesma-acao-1'
  const first = await buildFor(session, habit, start.revision, { request_id })
  const again = await buildFor(session, habit, start.revision, { request_id })
  assert.equal(again.credits, first.credits)
  assert.equal(again.placements.filter(item => item.activity_id === habit).length, 1)
})

test('ilha: cenário sem rua nem prédio de atividade; só Farol, Cabana e Píer se constroem; o Rio já nasce aberto', async () => {
  const session = newDemoSession()
  const island = await city(session, ISLAND)
  assert.equal(island.scenic, true)
  assert.deepEqual(island.placements, [])
  assert.deepEqual(island.catalog.map(item => item.id).sort(), ['island-cabin', 'island-lighthouse', 'island-pier'])
  // O que não é da ilha é recusado: prédio comum, prédio de atividade e rua.
  await build(session, ISLAND, 'casa-na-ilha', island.revision, { x: 8, y: 8, status: 422 })
  await build(session, ISLAND, 'dom-na-ilha', island.revision, { kind: 'dom-saude', x: 8, y: 8, status: 422 })
  await session('/api/city/actions?local=' + ISLAND, {
    method: 'POST', status: 422,
    body: { type: 'road_path', x: 8, y: 9, end_x: 9, end_y: 9, expected_revision: island.revision, request_id: 'rua-na-ilha' },
  })
  // Fora da terra da ilha (água) também não.
  await build(session, ISLAND, 'farol-na-agua', island.revision, { kind: 'island-lighthouse', x: 22, y: 16, status: 422 })
  // Quem chega tem 50 moedas: a Cabana (20) assenta sem rua por perto e cobra o custo do catálogo.
  const cabana = await build(session, ISLAND, 'cabana-na-ilha', island.revision, { kind: 'island-cabin', x: 8, y: 8 })
  assert.equal(cabana.credits, island.credits - 20)
  assert.deepEqual(cabana.placements.map(item => item.kind), ['island-cabin'])
  // Dois prédios não ocupam o mesmo lote.
  await build(session, ISLAND, 'cabana-sobre-cabana', cabana.revision, { kind: 'island-cabin', x: 9, y: 9, status: 409 })
  // O Farol (60) tem lote livre, mas faltam moedas: a conta de moedas vem depois da conferência do lote.
  const poor = await build(session, ISLAND, 'farol-sem-moedas', cabana.revision, { kind: 'island-lighthouse', x: 12, y: 8, status: 422 })
  assert.match(poor.message, /Moedas insuficientes/)
  // Remover devolve metade do custo.
  const removed = await session('/api/city/actions?local=' + ISLAND, {
    method: 'POST', body: { type: 'remove', placement_id: cabana.placements[0].id, expected_revision: cabana.revision, request_id: 'tira-cabana' },
  })
  assert.equal(removed.credits, cabana.credits + 10)
  assert.deepEqual(removed.placements, [])
  // Sem "local", a cidade é o Rio, e ele está aberto sem viagem nem prévia.
  const home = await session('/api/city')
  assert.equal(home.location_id, RIO)
  assert.equal(home.scenic, false)
  assert.ok(home.placements.some(item => item.kind === 'road'))
  assert.deepEqual((await world(session)).desbloqueados, [ISLAND, RIO])
})

// Contas: cadastro, entrada e saída, com os dados da demonstração adotados pela conta.
function browser(cookies = {}) {
  const jar = { ...cookies }
  const send = async (path, { method = 'GET', body, redirect = 'manual' } = {}) => {
    const headers = { Cookie: Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ') }
    if (method !== 'GET') Object.assign(headers, { Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json' })
    const response = await call(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect })
    for (const cookie of response.headers.getSetCookie()) {
      const [, name, value] = cookie.match(/^([^=]+)=([^;]*)/)
      if (/Max-Age=0/.test(cookie)) delete jar[name]
      else jar[name] = value
    }
    return response
  }
  send.jar = jar
  return send
}
const demoCookieValue = () => sessionCookie(new URL(ORIGIN)).split(';')[0].split('=')[1]
const account = (n = crypto.randomUUID().slice(0, 8)) => ({ email: `socio-${n}@cityou.test`, password: 'senha-bem-comprida', display_name: 'Sócio Teste' })

test('conta: cadastro abre sessão, valida os campos e não aceita e-mail repetido', async () => {
  const visitor = browser()
  assert.deepEqual(await (await visitor('/api/auth/status')).json(), { accounts: true, user: null })
  assert.equal((await visitor('/api/me')).status, 401)
  const bad = await visitor('/api/auth/signup', { method: 'POST', body: { email: 'sem-arroba', password: 'curta', display_name: '' } })
  assert.equal(bad.status, 422)
  assert.deepEqual(Object.keys((await bad.json()).fields).sort(), ['display_name', 'email', 'password'])
  const data = account()
  const created = await visitor('/api/auth/signup', { method: 'POST', body: { ...data, email: data.email.toUpperCase() } })
  assert.equal(created.status, 201)
  const { user } = await created.json()
  assert.equal(user.email, data.email)
  assert.match(created.headers.getSetCookie()[0], /^cityou_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000(; Secure)?$/)
  assert.deepEqual((await (await visitor('/api/me')).json()).user, user)
  assert.equal((await (await visitor('/api/auth/status')).json()).user.id, user.id)
  assert.equal((await browser()('/api/auth/signup', { method: 'POST', body: data })).status, 409)
  // A senha não fica no banco em texto, e o token da sessão também não.
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first()
  assert.equal(row.password_iterations, 100000)
  assert.match(row.password_hash, /^[a-f0-9]{64}$/)
  assert.equal(await env.DB.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').bind(visitor.jar.cityou_session).first(), null)
  // Escrita sem o cabeçalho ou de outra origem não passa.
  assert.equal((await call('/api/auth/login', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } })).status, 403)
})

test('conta: adota os dados da demonstração e os entrega em qualquer navegador; sair devolve a demonstração vazia', async () => {
  const first = browser({ cityou_demo: demoCookieValue() })
  const before = await (await first('/api/city')).json()
  const built = await (await first('/api/city/actions', { method: 'POST', body: { type: 'build', kind: 'tree', x: 7, y: 8, expected_revision: before.revision, request_id: 'arvore-antes-da-conta' } })).json()
  assert.equal(built.credits, before.credits - 3)
  const data = account()
  assert.equal((await first('/api/auth/signup', { method: 'POST', body: data })).status, 201)
  assert.equal((await (await first('/api/city')).json()).credits, built.credits)

  // Outro aparelho, com outra sessão de demonstração: ao entrar, vê a cidade da conta.
  const second = browser({ cityou_demo: demoCookieValue() })
  assert.equal((await (await second('/api/city')).json()).revision, 0)
  const wrong = await second('/api/auth/login', { method: 'POST', body: { email: data.email, password: 'senha-errada-errada' } })
  assert.equal(wrong.status, 401)
  const unknown = await second('/api/auth/login', { method: 'POST', body: { email: 'ninguem@cityou.test', password: 'senha-errada-errada' } })
  assert.deepEqual([unknown.status, (await unknown.json()).message], [401, (await wrong.json()).message])
  assert.equal((await second('/api/auth/login', { method: 'POST', body: data })).status, 200)
  const mine = await (await second('/api/city')).json()
  assert.deepEqual([mine.credits, mine.revision], [built.credits, built.revision])
  assert.ok(mine.placements.some(item => item.kind === 'tree'))

  // Sair apaga a sessão e troca o cookie da demonstração: o navegador volta a uma demonstração nova.
  const oldDemo = first.jar.cityou_demo
  assert.equal((await first('/api/auth/logout', { method: 'POST', body: {} })).status, 200)
  assert.equal(first.jar.cityou_session, undefined)
  assert.notEqual(first.jar.cityou_demo, oldDemo)
  assert.equal((await first('/api/me')).status, 401)
  assert.equal((await (await first('/api/city')).json()).revision, 0)
  // A sessão do segundo aparelho continua valendo.
  assert.equal((await second('/api/me')).status, 200)
})

test('conta: senha errada repetida bloqueia por um tempo; páginas do app pedem login', async () => {
  const data = account()
  const user = browser()
  assert.equal((await user('/api/auth/signup', { method: 'POST', body: data })).status, 201)
  const stranger = browser()
  for (let i = 0; i < 8; i++) assert.equal((await stranger('/api/auth/login', { method: 'POST', body: { ...data, password: 'chute-numero-' + i } })).status, 401)
  assert.equal((await stranger('/api/auth/login', { method: 'POST', body: data })).status, 429)

  const gate = await stranger('/city?local=cristo-redentor')
  assert.deepEqual([gate.status, gate.headers.get('Location')], [302, '/?entrar=1&next=%2Fcity%3Flocal%3Dcristo-redentor'])
  assert.equal((await stranger('/app')).status, 302)
  assert.notEqual((await stranger('/')).status, 302)
  assert.notEqual((await user('/app')).status, 302)
  const home = await user('/')
  assert.deepEqual([home.status, home.headers.get('Location')], [302, '/app'])
  assert.notEqual((await user('/?inicio')).status, 302)
})

test('conta: sem banco, as rotas de conta avisam e o app segue como demonstração', async () => {
  const response = await closedHarness.fetch(`${ORIGIN}/api/auth/status`)
  assert.deepEqual(await response.json(), { accounts: false, user: null })
  const signup = await closedHarness.fetch(`${ORIGIN}/api/auth/signup`, {
    method: 'POST', body: JSON.stringify(account()), headers: { Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json' },
  })
  assert.equal(signup.status, 503)
  assert.notEqual((await closedHarness.fetch(`${ORIGIN}/city`, { redirect: 'manual' })).status, 302)
})

test('login obrigatório: sem sessão a API de dados responde 401; saúde e contas seguem abertas; com conta tudo funciona', async () => {
  const send = (path, init) => loginHarness.fetch(ORIGIN + path, init)
  const headers = { Origin: ORIGIN, 'X-Fifones-City': '1', 'Content-Type': 'application/json' }
  for (const path of ['/api/city', '/api/personal/summary', '/api/world/progress']) {
    const response = await send(path)
    assert.equal(response.status, 401, path)
    assert.match((await response.json()).message, /Entre na sua conta/)
  }
  assert.equal((await send('/api/health')).status, 200)
  assert.deepEqual(await (await send('/api/auth/status')).json(), { accounts: true, user: null })
  // A conta nova entra e passa a usar a API normalmente.
  const signup = await send('/api/auth/signup', { method: 'POST', headers, body: JSON.stringify(account()) })
  assert.equal(signup.status, 201)
  const cookie = signup.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
  const mine = await send('/api/city', { headers: { Cookie: cookie } })
  assert.equal(mine.status, 200)
})
