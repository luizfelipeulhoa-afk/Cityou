// Etapa de latência, item 5 (docs/LATENCIA.md): estado inicial embutido no HTML de /app para quem já tem conta.
// Rode com: npm run test:worker
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestHarness } from 'wrangler'
import worker from '../worker/index.js'

const ORIGIN = 'https://cityou.test'
// `wrangler.test-boot.jsonc` serve `tests/fixtures/boot-assets/` de verdade (workerd, com HTMLRewriter), para
// os dois testes que precisam do embutido de fato. Os demais chamam `worker.fetch` direto, mais rápido, e só
// não cabem aqui quando o embutido teria sucesso (HTMLRewriter não existe fora do workerd).
const bootHarness = createTestHarness({ workers: [{ configPath: 'wrangler.test-boot.jsonc' }] })
const loginHarness = createTestHarness({ workers: [{ configPath: 'wrangler.test-login.jsonc' }] })
let env

async function applyMigrations(db) {
  for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', file), 'utf8').replace(/^\s*--.*$/gm, '')
    await db.batch(sql.split(';').map(part => part.trim()).filter(Boolean).map(statement => db.prepare(statement)))
  }
}

before(async () => {
  await Promise.all([bootHarness.listen(), loginHarness.listen()])
  await Promise.all([bootHarness, loginHarness].map(async target => applyMigrations((await target.getWorker().getEnv()).DB)))
  env = await loginHarness.getWorker().getEnv()
})
after(() => Promise.all([bootHarness.close(), loginHarness.close()]))

const account = (n = crypto.randomUUID().slice(0, 8)) => ({ email: `boot-${n}@cityou.test`, password: 'senha-bem-comprida', display_name: 'Conta Teste' })
const SIGNUP_HEADERS = { Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json' }

async function signedCookie(harness, body = account()) {
  const signup = await harness.fetch(ORIGIN + '/api/auth/signup', { method: 'POST', headers: SIGNUP_HEADERS, body: JSON.stringify(body) })
  assert.equal(signup.status, 201, await signup.text())
  return signup.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
}

function bootOf(body) {
  const match = body.match(/<script type="application\/json" id="cityou-boot">([\s\S]*?)<\/script>/)
  return match ? JSON.parse(match[1]) : null
}

test('conta com sessão: /app ganha o script #cityou-boot com o resumo da conta, sem cache compartilhável', async () => {
  const cookie = await signedCookie(bootHarness)
  const response = await bootHarness.fetch(ORIGIN + '/app', { headers: { Cookie: cookie } })
  assert.equal(response.status, 200)
  const boot = bootOf(await response.text())
  assert.ok(boot, 'script de estado inicial ausente')
  assert.ok(Array.isArray(boot.tasks))
  assert.match(boot.events_month, /^\d{4}-\d{2}$/)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.match(response.headers.get('Vary') || '', /Cookie/)
})

test('tarefa com </script> no título não fecha a tag cedo no estado embutido', async () => {
  const cookie = await signedCookie(bootHarness)
  const created = await bootHarness.fetch(ORIGIN + '/api/personal/tasks', {
    method: 'POST', headers: { Cookie: cookie, ...SIGNUP_HEADERS }, body: JSON.stringify({ title: 'Perigo</script><script>alert(1)</script>' }),
  })
  assert.equal(created.status, 201)
  const body = await (await bootHarness.fetch(ORIGIN + '/app', { headers: { Cookie: cookie } })).text()
  assert.doesNotMatch(body, /<script>alert\(1\)<\/script>/)
  const boot = bootOf(body)
  assert.ok(boot.tasks.some(task => task.title.includes('</script>')))
})

// Os testes abaixo chamam `worker.fetch` direto (sem rede, sem workerd): servem para as recusas antes do
// HTMLRewriter, onde o embutido nunca chega a ser gerado, então o global que só existe no workerd não entra em jogo.
const HTML = '<!doctype html><html><head></head><body><div id="app"></div></body></html>'
const htmlAsset = () => new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const page = (path, cookie, extraEnv = {}) => worker.fetch(
  new Request(ORIGIN + path, cookie ? { headers: { Cookie: cookie } } : undefined),
  { ...env, ASSETS: { fetch: async () => htmlAsset() }, ...extraEnv },
)

test('sem sessão de conta: a página não ganha estado embutido e redireciona (login obrigatório)', async () => {
  const response = await page('/app', null)
  assert.equal(response.status, 302)
})

test('?local= não ganha estado embutido mesmo com sessão', async () => {
  const cookie = await signedCookie(loginHarness)
  const response = await page('/app?local=ilha-inicial', cookie)
  assert.equal(bootOf(await response.text()), null)
})

test('BOOT_EMBED=false desliga o estado embutido', async () => {
  const cookie = await signedCookie(loginHarness)
  const response = await page('/app', cookie, { BOOT_EMBED: 'false' })
  assert.equal(bootOf(await response.text()), null)
})

test('erro ao buscar o estado não derruba a página: cai para o estado de sempre', async () => {
  const cookie = await signedCookie(loginHarness)
  const brokenSessions = { getByName: () => ({ fetch: async () => { throw new Error('boom') } }) }
  const response = await page('/app', cookie, { DEMO_SESSIONS: brokenSessions })
  assert.equal(response.status, 200)
  assert.equal(bootOf(await response.text()), null)
})
