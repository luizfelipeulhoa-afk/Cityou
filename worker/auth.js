// Contas: cadastro, entrada, saída e sessão por cookie. Contrato em docs/API.md, seção "Conta".
// Só funciona com o banco D1 ligado (`env.DB`); sem ele as rotas respondem 503 e o app segue como demonstração.
// Os dados da pessoa continuam no Durable Object DemoSession: `users.data_key` é o nome do objeto dela.
// No cadastro, a conta adota o objeto da sessão de demonstração do navegador, então nada do que ela já fez se perde.
import { sha256Hex } from '../shared/game/proof.js'
import { accountKey, adoptAccountData, demoKeyOf, holdAccountData, sessionCookie as freshDemoCookie } from './demo.js'
import { HttpError, json, readJsonObject } from './http.js'

const SESSION_COOKIE = 'cityou_session'
const SESSION_SECONDS = 30 * 24 * 60 * 60
const ITERATIONS = 100_000 // limite do PBKDF2 na Web Crypto dos Workers
const ATTEMPT_WINDOW_MINUTES = 15
const MAX_ATTEMPTS = 8
const MAX_AUTH_BODY = 4_000
const encoder = new TextEncoder()

export const accountsEnabled = env => Boolean(env?.DB)

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

async function openSession(env, url, userId) {
  const token = randomHex(32)
  const now = new Date()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await hashToken(token), userId, now.toISOString(), now.toISOString(), new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString()).run()
  return sessionCookie(url, token)
}

async function signup({ request, env, url }) {
  const body = await readJsonObject(request, MAX_AUTH_BODY)
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
  const id = crypto.randomUUID(), salt = randomHex(16), now = new Date().toISOString()
  const hash = await hashPassword(body.password, salt, ITERATIONS)
  let dataKey = await demoKeyOf(request, env)
  if (!dataKey || await env.DB.prepare('SELECT 1 FROM users WHERE data_key = ?').bind(dataKey).first()) dataKey = await accountKey(id)
  else {
    try { await holdAccountData(env, dataKey, id) } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 410) throw error
      return json({ message: error.message, detail: error.message }, 410, { 'Set-Cookie': freshDemoCookie(url) })
    }
  }
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, created_at, updated_at, data_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, email, name, hash, salt, ITERATIONS, now, now, dataKey).run()
  } catch (error) {
    if (/UNIQUE.*users\.email/i.test(String(error))) throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com a sua senha.', { email: 'E-mail já cadastrado.' })
    if (/UNIQUE.*users\.data_key/i.test(String(error))) throw new HttpError(409, 'Os dados desta demonstração já estão vinculados. Reabra o Cityou e tente novamente.')
    throw error
  }
  // D1 reserva o vínculo antes de alterar o objeto. Se a adoção falhar, entrar com a senha retoma o mesmo vínculo.
  await adoptAccountData(env, dataKey, id)
  const cookie = await openSession(env, url, id)
  const response = json({ user: { id, email, display_name: name, timezone: 'America/Sao_Paulo' } }, 201, { 'Set-Cookie': cookie })
  response.headers.append('Set-Cookie', freshDemoCookie(url))
  return response
}

const WRONG = 'E-mail ou senha incorretos.'

async function login({ request, env, url }) {
  const body = await readJsonObject(request, MAX_AUTH_BODY)
  const fields = {}
  const email = readEmail(body.email, fields)
  if (typeof body.password !== 'string' || !body.password || body.password.length > 200) fields.password = 'Digite uma senha de até 200 caracteres.'
  if (Object.keys(fields).length) throw fieldsError(fields)
  const windowMs = ATTEMPT_WINDOW_MINUTES * 60_000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString()
  const reserved = await env.DB.prepare(
    `INSERT INTO login_attempts (email, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (email, window_start) DO UPDATE SET count = count + 1
     WHERE count < ? RETURNING count`,
  ).bind(email, windowStart, MAX_ATTEMPTS).first()
  if (!reserved) throw new HttpError(429, `Muitas tentativas. Espere ${ATTEMPT_WINDOW_MINUTES} minutos e tente de novo.`)
  let user
  let valid
  try {
    user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first()
    // Sem conta, calcula um hash mesmo assim para reduzir a diferença de tempo.
    const hash = await hashPassword(body.password, user?.password_salt ?? 'sem-conta', user?.password_iterations ?? ITERATIONS)
    valid = Boolean(user && sameText(hash, user.password_hash))
  } finally {
    // Só senhas efetivamente recusadas consomem a reserva até o fim da janela.
    if (valid !== false) await env.DB.prepare('UPDATE login_attempts SET count = count - 1 WHERE email = ? AND window_start = ? AND count > 0')
      .bind(email, windowStart).run()
  }
  if (!valid) throw new HttpError(401, WRONG)
  await adoptAccountData(env, user.data_key ?? await accountKey(user.id), user.id)
  const cookie = await openSession(env, url, user.id)
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': cookie })
}

async function logout({ request, env, url }) {
  const token = sessionTokenOf(request)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run()
  const response = json({})
  response.headers.append('Set-Cookie', sessionCookie(url, 'x', 0))
  // O cookie da demonstração deste navegador apontava para os dados da conta: troca por um novo.
  response.headers.append('Set-Cookie', freshDemoCookie(url))
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
  return handler(context)
}
