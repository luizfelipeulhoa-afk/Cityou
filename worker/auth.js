// Contas: cadastro, entrada, saída e sessão por cookie. Contrato em docs/API.md, seção "Conta".
// Só funciona com o banco D1 ligado (`env.DB`); sem ele as rotas respondem 503 e o app segue como demonstração.
// Os dados da pessoa continuam no Durable Object DemoSession: `users.data_key` é o nome do objeto dela.
// No cadastro, a conta adota o objeto da sessão de demonstração do navegador, então nada do que ela já fez se perde.
import { sha256Hex } from '../shared/game/proof.js'
import { HttpError, json } from './http.js'

const SESSION_COOKIE = 'cityou_session'
const SESSION_SECONDS = 30 * 24 * 60 * 60
const ITERATIONS = 100_000 // limite do PBKDF2 na Web Crypto dos Workers
const ATTEMPT_WINDOW_MINUTES = 15
const MAX_ATTEMPTS = 8
const encoder = new TextEncoder()

// O mesmo esquema de migrations/0001 e 0002, idempotente: o Worker o aplica sozinho no primeiro uso,
// para o banco de produção não depender de rodar `wrangler d1 migrations apply`.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_iterations INTEGER NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, data_key TEXT)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)',
  `CREATE TABLE IF NOT EXISTS login_attempts (email TEXT NOT NULL, window_start TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email, window_start))`,
  `CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)`,
  'CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id)',
]

export const accountsEnabled = env => Boolean(env?.DB)

const ready = new WeakMap()
function ensureSchema(env) {
  if (!ready.has(env.DB)) {
    ready.set(env.DB, (async () => {
      await env.DB.batch(SCHEMA.map(statement => env.DB.prepare(statement)))
      const columns = await env.DB.prepare('PRAGMA table_info(users)').all()
      if (!columns.results.some(column => column.name === 'data_key')) await env.DB.prepare('ALTER TABLE users ADD COLUMN data_key TEXT').run()
      await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_data_key ON users(data_key)').run()
    })().catch((error) => { ready.delete(env.DB); throw error }))
  }
  return ready.get(env.DB)
}

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const randomHex = size => hex(crypto.getRandomValues(new Uint8Array(size)))
const hashToken = token => sha256Hex(encoder.encode(token))

async function hashPassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256)
  return hex(new Uint8Array(bits))
}

function sameText(a, b) { // comparação em tempo constante
  let difference = a.length ^ b.length
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length || 0)
  return difference === 0
}

export function sessionTokenOf(request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)cityou_session=([a-f0-9]{64})(?:;|$)/)?.[1]
}

function sessionCookie(url, token, seconds = SESSION_SECONDS) {
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`
}

const publicUser = row => ({ id: row.id, email: row.email, display_name: row.display_name, timezone: row.timezone })

/** A conta da sessão deste pedido, ou null. Uma leitura no banco por pedido. */
export async function sessionUser(request, env) {
  if (!accountsEnabled(env)) return null
  const token = sessionTokenOf(request)
  if (!token) return null
  await ensureSchema(env)
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.display_name, users.timezone, users.data_key FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL`,
  ).bind(await hashToken(token), new Date().toISOString()).first()
  return row ?? null
}

function fieldsError(fields) { return new HttpError(422, Object.values(fields)[0], fields) }

function readEmail(value, fields) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) fields.email = 'Digite um e-mail válido.'
  return email
}

async function readJson(request) {
  let body
  try { body = JSON.parse((await request.text()).slice(0, 4000)) } catch { throw new HttpError(422, 'Dados inválidos.') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(422, 'Dados inválidos.')
  return body
}

async function openSession(env, url, userId) {
  const token = randomHex(32)
  const now = new Date()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await hashToken(token), userId, now.toISOString(), now.toISOString(), new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString()).run()
  return sessionCookie(url, token)
}

async function signup({ request, env, url, demoKey }) {
  const body = await readJson(request)
  const fields = {}
  const email = readEmail(body.email, fields)
  const name = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  if (!name || name.length > 60) fields.display_name = 'Diga como podemos chamar você (até 60 letras).'
  if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 200) fields.password = 'A senha precisa de 10 a 200 caracteres.'
  if (Object.keys(fields).length) throw fieldsError(fields)
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) {
    throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com a sua senha.', { email: 'E-mail já cadastrado.' })
  }
  // A conta fica com os dados da demonstração deste navegador, se ninguém os adotou antes.
  let dataKey = demoKey
  if (!dataKey || await env.DB.prepare('SELECT 1 FROM users WHERE data_key = ?').bind(dataKey).first()) dataKey = await hashToken(`account:${randomHex(32)}`)
  const id = crypto.randomUUID(), salt = randomHex(16), now = new Date().toISOString()
  const hash = await hashPassword(body.password, salt, ITERATIONS)
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, created_at, updated_at, data_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, email, name, hash, salt, ITERATIONS, now, now, dataKey).run()
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com a sua senha.', { email: 'E-mail já cadastrado.' })
    throw error
  }
  const cookie = await openSession(env, url, id)
  return json({ user: { id, email, display_name: name, timezone: 'America/Sao_Paulo' } }, 201, { 'Set-Cookie': cookie })
}

const WRONG = 'E-mail ou senha incorretos.'

async function login({ request, env, url }) {
  const body = await readJson(request)
  const fields = {}
  const email = readEmail(body.email, fields)
  if (typeof body.password !== 'string' || !body.password) fields.password = 'Digite a sua senha.'
  if (Object.keys(fields).length) throw fieldsError(fields)
  const windowMs = ATTEMPT_WINDOW_MINUTES * 60_000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString()
  const attempts = await env.DB.prepare('SELECT count FROM login_attempts WHERE email = ? AND window_start = ?').bind(email, windowStart).first()
  if ((attempts?.count ?? 0) >= MAX_ATTEMPTS) throw new HttpError(429, `Muitas tentativas. Espere ${ATTEMPT_WINDOW_MINUTES} minutos e tente de novo.`)
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first()
  // Sem conta, calcula um hash mesmo assim: o tempo de resposta não revela se o e-mail existe.
  const hash = await hashPassword(body.password, user?.password_salt ?? 'sem-conta', user?.password_iterations ?? ITERATIONS)
  if (!user || !sameText(hash, user.password_hash)) {
    await env.DB.prepare(
      'INSERT INTO login_attempts (email, window_start, count) VALUES (?, ?, 1) ON CONFLICT (email, window_start) DO UPDATE SET count = count + 1',
    ).bind(email, windowStart).run()
    throw new HttpError(401, WRONG)
  }
  const cookie = await openSession(env, url, user.id)
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': cookie })
}

async function logout({ request, env, url, freshDemoCookie }) {
  const token = sessionTokenOf(request)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run()
  const response = json({})
  response.headers.append('Set-Cookie', sessionCookie(url, 'x', 0))
  // O cookie da demonstração deste navegador apontava para os dados da conta: troca por um novo.
  response.headers.append('Set-Cookie', freshDemoCookie)
  return response
}

const handlers = {
  'POST /api/auth/signup': signup,
  'POST /api/auth/login': login,
  'POST /api/auth/logout': logout,
}

/** Rotas de conta. Devolve undefined se o caminho não é de conta. */
export async function authApi(context) {
  const { request, env, url } = context
  if (url.pathname === '/api/auth/status' && request.method === 'GET') {
    const user = await sessionUser(request, env)
    return json({ accounts: accountsEnabled(env), user: user ? publicUser(user) : null })
  }
  if (url.pathname === '/api/me' && request.method === 'GET') {
    const user = await sessionUser(request, env)
    if (!user) throw new HttpError(401, 'Entre na sua conta para continuar.')
    return json({ user: publicUser(user) })
  }
  if (!url.pathname.startsWith('/api/auth/')) return undefined
  const handler = handlers[`${request.method} ${url.pathname}`]
  if (!handler) throw new HttpError(Object.keys(handlers).some(key => key.endsWith(` ${url.pathname}`)) ? 405 : 404, 'Rota não encontrada.')
  if (!accountsEnabled(env)) throw new HttpError(503, 'As contas ainda não estão ativas. Use a demonstração por enquanto.')
  await ensureSchema(env)
  return handler(context)
}
