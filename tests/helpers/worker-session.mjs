// Ajudante dos testes do Worker (padrão de tests/worker-tasks.test.mjs): D1 local do harness, migrações aplicadas e
// uma "sessão" por cookie, com Origin e X-Cityou-Request nas escritas e conferência do status.
import { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestHarness } from 'wrangler'
import { sessionCookie } from '../../worker/demo.js'

export const ORIGIN = 'https://cityou.test'
export const harness = createTestHarness({ workers: [{ configPath: 'wrangler.test.jsonc' }] })
export const loginHarness = createTestHarness({ workers: [{ configPath: 'wrangler.test-login.jsonc' }] })

async function applyMigrations(db) {
  for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', file), 'utf8').replace(/^\s*--.*$/gm, '')
    await db.batch(sql.split(';').map(part => part.trim()).filter(Boolean).map(statement => db.prepare(statement)))
  }
}

/** Registra os ganchos before/after do arquivo de teste que chamar. */
export function useHarnesses() {
  before(async () => {
    await Promise.all([harness.listen(), loginHarness.listen()])
    for (const target of [harness, loginHarness]) await applyMigrations((await target.getWorker().getEnv()).DB)
  })
  after(async () => { await Promise.all([harness.close(), loginHarness.close()]) })
}

export function session(target = harness) {
  const cookie = sessionCookie(new URL(ORIGIN)).split(';')[0]
  return async (path, { method = 'GET', body, status = 200 } = {}) => {
    const headers = { Cookie: cookie }
    if (method !== 'GET') Object.assign(headers, { Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json' })
    const response = await target.fetch(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const result = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`)
    return result
  }
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
/** Dia (AAAA-MM-DD, horário de São Paulo) deslocado `offset` dias de hoje. */
export function dayFromToday(offset = 0) {
  const date = new Date(Date.now() + offset * 86_400_000)
  return dateFormatter.format(date)
}
export const GHOST_ID = '00000000-0000-0000-0000-000000000000'
