// Testes do Worker com D1 e Durable Objects simulados, sem conta do Cloudflare.
// Rode com: npm run test:worker
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestHarness } from 'wrangler'
import worker from '../worker/index.js'
import { DemoSession, sessionCookie } from '../worker/demo.js'
import { newCity, normalizeAction } from '../worker/city.js'

const ORIGIN = 'https://cityou.test'
const harness = createTestHarness({ workers: [{ configPath: 'wrangler.test.jsonc' }] })
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
  env = await harness.getWorker().getEnv()
})
after(() => harness.close())

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

function newDemoSession() {
  const cookie = sessionCookie(new URL(ORIGIN)).split(';')[0]
  return async (path, { method = 'GET', body, status = 200 } = {}) => {
    const headers = { Cookie: cookie }
    if (body !== undefined) {
      headers.Origin = ORIGIN
      headers['X-Fifones-City'] = '1'
      headers['Content-Type'] = 'application/json'
    }
    const response = await call(path, { method, headers, body: JSON.stringify(body) })
    const result = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`)
    return result
  }
}

const city = (session, local) => session(`/api/city?local=${local}`)
const world = session => session('/api/world/progress')
const build = (session, local, request_id, expected_revision, { kind = 'home', x = 7, y = 7, status } = {}) =>
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
  await build(session, ISLAND, 'casa-dois', withHouse.revision, { x: 5 })
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
