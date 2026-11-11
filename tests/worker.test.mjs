// Testes do Worker (API nova) contra um D1 local, sem conta do Cloudflare.
// Rode com: npm run test:worker
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import worker from '../worker/index.js'

const ORIGIN = 'https://cityou.test'
let platform, env, stateDir
const ctx = { waitUntil() {}, passThroughOnException() {} }
const call = (path, init = {}, bindings = env) => worker.fetch(new Request(ORIGIN + path, init), bindings, ctx)

async function applyMigrations(db) {
  for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', file), 'utf8').replace(/^\s*--.*$/gm, '')
    const statements = sql.split(';').map(part => part.trim()).filter(Boolean)
    await db.batch(statements.map(statement => db.prepare(statement)))
  }
}

before(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'cityou-d1-'))
  platform = await getPlatformProxy({ configPath: 'wrangler.test.jsonc', persist: { path: stateDir } })
  env = platform.env
})
after(async () => {
  await platform?.dispose()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

test('health: sem banco ligado responde not_configured', async () => {
  const response = await call('/api/health', {}, {})
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
