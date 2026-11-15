// Etapa 6: cadastro por convite, limite por IP, renovação de sessão, teto da meta e foto de comprovação.
// Rode com: npm run test:worker
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestHarness } from 'wrangler'
import { goalCredits, RULES } from '../shared/game/rules.js'
import { parseProof, stripPhotoMetadata } from '../shared/game/proof.js'
import { DemoSession, sessionCookie } from '../worker/demo.js'

const ORIGIN = 'https://cityou.test'
const TOKEN = 'segredo-de-teste-com-mais-de-16'
const harness = createTestHarness({
  workers: [{ configPath: 'wrangler.test.jsonc', vars: { SIGNUP_OPEN: 'false', CITYOU_ADMIN_TOKEN: TOKEN, CITYOU_TEST_NO_IP_LIMIT: '', CITYOU_SESSION_CACHE_SECONDS: '0' } }],
})
let env
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

before(async () => {
  await harness.listen()
  env = await harness.getWorker().getEnv()
  const ready = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'invites'").first()
  if (ready) return
  for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', file), 'utf8').replace(/^\s*--.*$/gm, '')
    const statements = sql.split(';').map(part => part.trim()).filter(Boolean)
    await env.DB.batch(statements.map(statement => env.DB.prepare(statement)))
  }
})
after(() => harness.close())

// Cada chamada vem de um IP próprio, salvo quando o teste escolhe um: assim o limite por IP só aparece onde é testado.
let nextIp = 1
const post = (path, body, headers = {}) => harness.fetch(ORIGIN + path, {
  method: 'POST',
  headers: { Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.0.${nextIp >> 8}.${nextIp++ & 255}`, ...headers },
  body: JSON.stringify(body),
})
const account = (extra = {}) => ({ email: `convite-${crypto.randomUUID().slice(0, 8)}@cityou.test`, password: 'senha-bem-comprida', display_name: 'Convidada', ...extra })
const invite = async (body = { label: 'teste' }) => post('/api/admin/invites', body, { 'X-Cityou-Admin': TOKEN })

test('convite: só o administrador cria, e o código aparece uma vez', async () => {
  assert.equal((await post('/api/admin/invites', { label: 'x' })).status, 403)
  assert.equal((await invite({ label: '' })).status, 422)
  assert.equal((await invite({ label: 'x', max_uses: 51 })).status, 422)
  const created = await invite({ label: 'Ana', max_uses: 1, days: 7 })
  assert.equal(created.status, 201)
  const body = await created.json()
  assert.match(body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  const stored = await env.DB.prepare('SELECT * FROM invites WHERE label = ?').bind('Ana').first()
  assert.notEqual(stored.code_hash, body.code)
  assert.equal(stored.uses, 0)
})

test('convite: sem código, com código errado ou já usado, o cadastro é recusado', async () => {
  const status = await (await harness.fetch(ORIGIN + '/api/auth/status')).json()
  assert.equal(status.invite_required, true)
  assert.equal((await post('/api/auth/signup', account())).status, 422)
  assert.equal((await post('/api/auth/signup', account({ invite: 'AAAA-BBBB-CCCC' }))).status, 403)
  const { code } = await (await invite({ label: 'um uso' })).json()
  const ok = await post('/api/auth/signup', account({ invite: code.toLowerCase().replaceAll('-', ' ') }))
  assert.equal(ok.status, 201)
  assert.equal((await post('/api/auth/signup', account({ invite: code }))).status, 403)
})

test('convite: e-mail repetido não gasta o uso, e o convite cancelado para de valer', async () => {
  const { code } = await (await invite({ label: 'dois usos', max_uses: 2 })).json()
  const first = account({ invite: code })
  assert.equal((await post('/api/auth/signup', first)).status, 201)
  assert.equal((await post('/api/auth/signup', { ...first })).status, 409)
  const row = await env.DB.prepare("SELECT uses FROM invites WHERE label = 'dois usos'").first()
  assert.equal(row.uses, 1)
  assert.equal((await post('/api/admin/invites/revoke', { code }, { 'X-Cityou-Admin': TOKEN })).status, 200)
  assert.equal((await post('/api/auth/signup', account({ invite: code }))).status, 403)
})

test('limite por IP: o sexto cadastro da mesma rede na hora recebe 429', async () => {
  const ip = { 'CF-Connecting-IP': '203.0.113.7' }
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/signup', account({ invite: 'AAAA-BBBB-CCCC' }), ip)).status, 403)
  assert.equal((await post('/api/auth/signup', account({ invite: 'AAAA-BBBB-CCCC' }), ip)).status, 429)
  // Outra rede segue livre, e o IP não fica guardado em texto.
  assert.equal((await post('/api/auth/signup', account({ invite: 'AAAA-BBBB-CCCC' }), { 'CF-Connecting-IP': '198.51.100.2' })).status, 403)
  // IPv6: endereços diferentes da mesma rede /64 contam juntos.
  for (let i = 1; i <= 5; i++) await post('/api/auth/signup', account({ invite: 'AAAA-BBBB-CCCC' }), { 'CF-Connecting-IP': `2001:db8:1:2::${i}` })
  assert.equal((await post('/api/auth/signup', account({ invite: 'AAAA-BBBB-CCCC' }), { 'CF-Connecting-IP': '2001:db8:1:2::99' })).status, 429)
  const rows = await env.DB.prepare('SELECT ip_hash FROM ip_attempts').all()
  assert.ok(rows.results.every(row => !row.ip_hash.includes('203.0.113.7')))
})

test('limite por IP: o login para na trigésima primeira tentativa da rede', async () => {
  const ip = { 'CF-Connecting-IP': '203.0.113.9' }
  for (let i = 0; i < 30; i++) {
    const response = await post('/api/auth/login', { email: `nao-existe-${i}@cityou.test`, password: 'qualquer-coisa' }, ip)
    assert.equal(response.status, 401)
  }
  assert.equal((await post('/api/auth/login', { email: 'outro@cityou.test', password: 'qualquer-coisa' }, ip)).status, 429)
})

test('sessão: o uso depois de um dia empurra o vencimento, até 180 dias da entrada', async () => {
  const { code } = await (await invite({ label: 'sessão' })).json()
  const created = await post('/api/auth/signup', account({ invite: code }))
  const cookie = created.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
  assert.match(created.headers.getSetCookie()[0], /Max-Age=15552000/)
  const day = 24 * 60 * 60 * 1000
  const longAgo = new Date(Date.now() - 2 * day).toISOString()
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE created_at > ?')
    .bind(longAgo, new Date(Date.now() + day).toISOString(), new Date(Date.now() - 60_000).toISOString()).run()
  assert.equal((await harness.fetch(ORIGIN + '/api/me', { headers: { Cookie: cookie } })).status, 200)
  const renewed = await env.DB.prepare('SELECT expires_at FROM sessions ORDER BY created_at DESC LIMIT 1').first()
  assert.ok(Date.parse(renewed.expires_at) > Date.now() + 29 * day)
  // Perto do teto absoluto, a renovação não passa dele.
  const created180 = new Date(Date.now() - 179 * day).toISOString()
  await env.DB.prepare('UPDATE sessions SET created_at = ?, last_seen_at = ? WHERE expires_at = ?').bind(created180, longAgo, renewed.expires_at).run()
  await harness.fetch(ORIGIN + '/api/me', { headers: { Cookie: cookie } })
  const capped = await env.DB.prepare('SELECT expires_at FROM sessions WHERE created_at = ?').bind(created180).first()
  assert.ok(Date.parse(capped.expires_at) <= Date.parse(created180) + 180 * day)
})

test('meta: paga 5 moedas por dia exigido, até 25', () => {
  assert.deepEqual([1, 2, 4, 5, 30].map(target => goalCredits(target)), [5, 10, 20, 25, 25])
  assert.equal(RULES.paidGoalsPerDay, 3)
})

test('meta: alvo 1 paga 5 e só 3 metas pagam no mesmo dia', async () => {
  const cookie = sessionCookie(new URL(ORIGIN)).split(';')[0]
  const send = (path, method, body) => harness.fetch(ORIGIN + path, {
    method, headers: { Cookie: cookie, Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const credits = async () => (await (await harness.fetch(ORIGIN + '/api/city', { headers: { Cookie: cookie } })).json()).credits
  const start = await credits()
  for (let i = 0; i < 5; i++) {
    const created = await (await send('/api/personal/entries', 'POST', { kind: 'goal', title: `Meta ${i}`, target: 1, day: DAY })).json()
    assert.equal((await send(`/api/personal/entries/${created.created_id}/checkin`, 'PUT', { done: true })).status, 200)
  }
  const gained = (await credits()) - start
  assert.ok(gained >= 15 && gained <= 15 * 1.25, `ganhou ${gained}`)
})

test('foto: o corpo aceita a foto do tamanho da regra', async () => {
  const cookie = sessionCookie(new URL(ORIGIN)).split(';')[0]
  const send = (path, method, body) => harness.fetch(ORIGIN + path, {
    method, headers: { Cookie: cookie, Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const created = await (await send('/api/personal/entries', 'POST', { kind: 'habit', title: 'Caminhar', day: DAY })).json()
  const habit = { id: created.created_id }
  const jpeg = new Uint8Array(RULES.proof.photoMaxBytes - 10)
  jpeg.set([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00])
  const photo = `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`
  const response = await send(`/api/personal/entries/${habit.id}/checkin`, 'PUT', { done: true, proof: { photo } })
  assert.equal(response.status, 200)
})

test('foto: o servidor tira EXIF e XMP do JPEG e do WebP', () => {
  const exif = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
  const jfif = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]
  const scan = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]
  const jpeg = Uint8Array.from([0xff, 0xd8, ...jfif, ...exif, ...scan])
  assert.deepEqual([...stripPhotoMetadata(jpeg)], [0xff, 0xd8, ...jfif, ...scan])
  const parsed = parseProof({ photo: `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}` })
  assert.equal(parsed.photo.bytes.length, jpeg.length - exif.length)
  assert.equal(Buffer.from(parsed.photo.dataUrl.split(',')[1], 'base64').length, parsed.photo.bytes.length)

  const chunk = (name, data) => [...Buffer.from(name), data.length & 0xff, 0, 0, 0, ...data, ...(data.length & 1 ? [0] : [])]
  const body = [...Buffer.from('WEBP'), ...chunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...chunk('VP8L', [1, 2, 3]), ...chunk('EXIF', [9, 9, 9, 9])]
  const webp = Uint8Array.from([...Buffer.from('RIFF'), body.length & 0xff, 0, 0, 0, ...body])
  const clean = stripPhotoMetadata(webp)
  assert.equal(Buffer.from(clean).includes(Buffer.from('EXIF')), false)
  assert.equal(clean[20] & 0x0c, 0)
  assert.equal(clean[4] | (clean[5] << 8), clean.length - 8)

  // Bytes de preenchimento antes do marcador e uma segunda imagem (MPF) depois do fim, com o próprio EXIF: tudo sai.
  const tricky = Uint8Array.from([0xff, 0xd8, 0xff, ...jfif, ...exif, ...scan, 0xff, 0xd8, ...exif, 0xff, 0xd9])
  const out = stripPhotoMetadata(tricky)
  assert.deepEqual([...out], [0xff, 0xd8, ...jfif, ...scan])
})

test('administração de convites: sem o token, a rota responde 404 e não se revela', async () => {
  const none = createTestHarness({ workers: [{ configPath: 'wrangler.test-closed.jsonc' }] })
  await none.listen()
  try {
    const response = await none.fetch(ORIGIN + '/api/admin/invites', {
      method: 'POST', headers: { Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json' }, body: '{"label":"x"}',
    })
    assert.equal(response.status, 404)
  } finally { await none.close() }
})

test('conta: exportar devolve tudo o que ela guarda, e apagar some com conta e dados', async () => {
  const { code } = await (await invite({ label: 'exportar', max_uses: 2 })).json()
  const data = account({ invite: code })
  const created = await post('/api/auth/signup', data)
  assert.equal(created.status, 201)
  const cookie = created.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
  const send = (path, method = 'GET', body) => harness.fetch(ORIGIN + path, {
    method, headers: { Cookie: cookie, Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.9.9' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.equal((await send('/api/personal/entries', 'POST', { kind: 'habit', title: 'Ler 10 páginas', day: DAY })).status, 201)
  const exported = await send('/api/auth/export')
  assert.equal(exported.status, 200)
  assert.match(exported.headers.get('Content-Disposition'), /cityou-meus-dados-\d{4}-\d{2}-\d{2}\.json/)
  const dump = await exported.json()
  assert.equal(dump.user.email, data.email)
  assert.ok(dump.records.some(record => record.kind === 'entry' && record.value.title === 'Ler 10 páginas'))
  assert.equal(dump.records.some(record => record.kind === 'account'), false)
  assert.equal(JSON.stringify(dump).includes('password'), false)
  // Sem sessão não exporta nem apaga; senha errada não apaga.
  assert.equal((await harness.fetch(ORIGIN + '/api/auth/export')).status, 401)
  assert.equal((await send('/api/auth/delete', 'POST', { password: 'senha-errada-mesmo' })).status, 401)
  const deleted = await send('/api/auth/delete', 'POST', { password: data.password })
  assert.equal(deleted.status, 200)
  assert.ok(deleted.headers.getSetCookie().some(item => /^cityou_session=x;.*Max-Age=0/.test(item)))
  assert.equal((await send('/api/me')).status, 401)
  assert.equal(await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(data.email).first(), null)
  // O mesmo e-mail pode criar uma conta nova, que começa vazia.
  const again = await post('/api/auth/signup', { ...data, invite: code })
  assert.equal(again.status, 201)
  const fresh = again.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
  const second = await (await harness.fetch(ORIGIN + '/api/auth/export', { headers: { Cookie: fresh } })).json()
  assert.equal(second.records.some(record => record.kind === 'entry'), false)
})

// A fila da meta sem o relógio do harness: um objeto falso com os registros em memória (a ordem de inserção faz o papel do rowid).
function fakeGoals() {
  const store = new Map(), paid = []
  const bucket = kind => store.get(kind) ?? store.set(kind, new Map()).get(kind)
  const fake = Object.assign(Object.create(DemoSession.prototype), {
    read: (kind, id) => bucket(kind).get(id) ?? null,
    list: (kind, limit = 5000) => [...bucket(kind).values()].reverse().slice(0, limit),
    write: (kind, id, value) => { bucket(kind).set(id, value) },
    grantReward: (amount, label) => paid.push({ amount, label }),
    sql: {
      exec(query, id) {
        if (query.includes('count(*)')) {
          const prefix = id.slice(0, -2)
          return { one: () => ({ total: [...bucket('checkin').entries()].filter(([key, value]) => key.startsWith(prefix) && value.done).length }) }
        }
        bucket('reward:goal-pending').delete(id)
      },
    },
  })
  const goal = (id, target = 1, done = target) => {
    const entry = { id, title: `Meta ${id}`, target, kind: 'goal' }
    fake.write('entry', id, entry)
    for (let i = 0; i < done; i++) fake.write('checkin', `${id}:dia-${i}`, { done: true })
    return entry
  }
  return { fake, paid, goal, pending: () => [...bucket('reward:goal-pending').keys()] }
}

test('meta: a que passa do teto entra na fila e é paga no dia seguinte, a mais antiga primeiro', () => {
  const { fake, paid, goal, pending } = fakeGoals()
  for (const id of ['a', 'b', 'c', 'd', 'e']) fake.rewardGoal(goal(id), '2026-11-15')
  assert.equal(paid.length, 3)
  assert.deepEqual(pending(), ['d', 'e'])
  fake.settleGoals('2026-11-15')
  assert.equal(paid.length, 3, 'no mesmo dia, nada sai da fila')
  fake.settleGoals('2026-11-16')
  assert.deepEqual(paid.map(item => item.label), ['Meta a', 'Meta b', 'Meta c', 'Meta d', 'Meta e'].map(title => `Meta concluída: ${title}`))
  assert.deepEqual(pending(), [])
  fake.settleGoals('2026-11-17')
  assert.equal(paid.length, 5, 'cada meta paga uma vez só')
})

test('meta: só a meta cumprida entra na fila, e a que deixa de estar cumprida sai dela', () => {
  const { fake, paid, goal, pending } = fakeGoals()
  for (const id of ['a', 'b', 'c']) fake.rewardGoal(goal(id), '2026-11-15')
  fake.rewardGoal(goal('longa', 5, 1), '2026-11-15')
  assert.deepEqual(pending(), [], 'meta de 5 dias com 1 marcado não espera pagamento')
  const done = goal('d')
  fake.rewardGoal(done, '2026-11-15')
  assert.deepEqual(pending(), ['d'])
  fake.write('checkin', 'd:dia-0', { done: false })
  fake.settleGoals('2026-11-16')
  assert.deepEqual(pending(), [])
  assert.equal(paid.length, 3)
})

test('meta: com a fila maior que o teto, saem só as três mais antigas, e voltar a marcar não muda a data da espera', () => {
  const { fake, paid, goal, pending } = fakeGoals()
  for (const id of ['a', 'b', 'c']) fake.rewardGoal(goal(id), '2026-11-14')
  for (const id of ['d', 'e', 'f', 'g']) fake.rewardGoal(goal(id), '2026-11-14')
  const d = fake.read('entry', 'd')
  fake.rewardGoal(d, '2026-11-14')
  assert.equal(fake.read('reward:goal-pending', 'd').since, '2026-11-14')
  assert.deepEqual(pending(), ['d', 'e', 'f', 'g'], 'marcar de novo no mesmo dia não muda o lugar na fila')
  fake.settleGoals('2026-11-15')
  assert.deepEqual(paid.slice(3).map(item => item.label), ['d', 'e', 'f'].map(id => `Meta concluída: Meta ${id}`))
  assert.deepEqual(pending(), ['g'])
  fake.settleGoals('2026-11-16')
  assert.deepEqual(pending(), [])
  assert.equal(paid.length, 7)
})

test('sessão no cache do ponto de presença: o banco é lido uma vez, sair vale na hora, exportar e apagar conferem no banco', async () => {
  const cached = createTestHarness({ workers: [{ configPath: 'wrangler.test.jsonc', vars: { SIGNUP_OPEN: 'true', CITYOU_SESSION_CACHE_SECONDS: '30' } }] })
  await cached.listen()
  try {
    const db = (await cached.getWorker().getEnv()).DB
    if (!await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'invites'").first()) {
      for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
        const sql = readFileSync(join('migrations', file), 'utf8').replace(/^\s*--.*$/gm, '')
        await db.batch(sql.split(';').map(part => part.trim()).filter(Boolean).map(statement => db.prepare(statement)))
      }
    }
    const send = (path, { method = 'GET', body, cookie } = {}) => cached.fetch(ORIGIN + path, {
      method, body: body && JSON.stringify(body),
      headers: { Origin: ORIGIN, 'X-Cityou-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    })
    const signup = async () => {
      const response = await send('/api/auth/signup', { method: 'POST', body: account() })
      assert.equal(response.status, 201)
      return response.headers.getSetCookie().find(item => item.startsWith('cityou_session=')).split(';')[0]
    }
    const who = async cookie => (await (await send('/api/auth/status', { cookie })).json()).user
    // 1. Com a sessão no cache, apagar a linha no banco não muda a resposta dentro da janela: prova que o banco não foi lido.
    const first = await signup()
    assert.ok(await who(first))
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users ORDER BY created_at DESC LIMIT 1)').bind('2000-01-01T00:00:00.000Z').run()
    assert.ok(await who(first), 'a segunda leitura saiu do cache')
    // ...mas exportar confere no banco, e a sessão vencida não passa.
    assert.equal((await send('/api/auth/export', { cookie: first })).status, 401)
    // 2. Sair apaga a entrada do cache: a próxima leitura já não tem conta.
    const second = await signup()
    assert.ok(await who(second))
    assert.equal((await send('/api/auth/logout', { method: 'POST', body: {}, cookie: second })).status, 200)
    assert.equal(await who(second), null)
    // 3. Apagar a conta tira do cache as sessões de todos os aparelhos dela.
    const phone = await signup()
    const email = (await who(phone)).email
    const login = await send('/api/auth/login', { method: 'POST', body: { email, password: 'senha-bem-comprida' } })
    assert.equal(login.status, 200)
    const laptop = login.headers.getSetCookie().find(item => item.startsWith('cityou_session=')).split(';')[0]
    assert.ok(await who(laptop))
    assert.equal((await send('/api/auth/delete', { method: 'POST', body: { password: 'senha-bem-comprida' }, cookie: phone })).status, 200)
    assert.equal(await who(laptop), null)
  } finally { await cached.close() }
})
