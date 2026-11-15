// Contas: cadastro, entrada, saída e sessão por cookie. Contrato em docs/API.md, seção "Conta".
// Só funciona com o banco D1 ligado (`env.DB`); sem ele as rotas respondem 503 e o app segue como demonstração.
// Os dados da pessoa continuam no Durable Object DemoSession: `users.data_key` é o nome do objeto dela.
// No cadastro, a conta adota o objeto da sessão de demonstração do navegador, então nada do que ela já fez se perde.
import { sha256Hex } from '../shared/game/proof.js'
import { accountKey, adoptAccountData, demoKeyOf, holdAccountData, requireAdmin, sessionCookie as freshDemoCookie } from './demo.js'
import { HttpError, json, readJsonObject } from './http.js'

const SESSION_COOKIE = 'cityou_session'
// Sessão: vence depois de 30 dias sem uso e, de todo jeito, 180 dias depois de entrar. Cada dia de uso empurra o fim
// (renovação no máximo uma vez por dia, para não escrever no banco a cada pedido). O cookie dura o teto; quem manda é o banco.
const SESSION_IDLE_SECONDS = 30 * 24 * 60 * 60
const SESSION_MAX_SECONDS = 180 * 24 * 60 * 60
const SESSION_RENEW_MS = 24 * 60 * 60 * 1000
// Limite por IP (além do limite por e-mail do login): cadastro 5 por hora, login 30 a cada 15 minutos.
// Só vale com CF-Connecting-IP, que o Cloudflare sempre põe e o navegador não consegue trocar.
const IP_LIMITS = { signup: { max: 5, minutes: 60 }, login: { max: 30, minutes: 15 } }
// Convites (beta por convite): código de 12 letras sem as confundíveis, guardado só como hash.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const INVITE_MAX_USES = 50
const INVITE_MAX_DAYS = 90
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

function sessionCookie(url, token, seconds = SESSION_MAX_SECONDS) {
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`
}

const publicUser = row => ({ id: row.id, email: row.email, display_name: row.display_name, timezone: row.timezone })

/** A conta da sessão deste pedido, ou null. Uma leitura no banco por pedido. */
export async function sessionUser(request, env) {
  if (!accountsEnabled(env)) return null
  const token = sessionTokenOf(request)
  if (!token) return null
  const tokenHash = await hashToken(token)
  const now = new Date()
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.display_name, users.timezone, users.data_key,
            sessions.created_at AS session_created_at, sessions.last_seen_at AS session_seen_at FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL`,
  ).bind(tokenHash, now.toISOString()).first()
  if (!row) return null
  if (now.getTime() - Date.parse(row.session_seen_at) >= SESSION_RENEW_MS) {
    const expires = Math.min(now.getTime() + SESSION_IDLE_SECONDS * 1000, Date.parse(row.session_created_at) + SESSION_MAX_SECONDS * 1000)
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
      .bind(now.toISOString(), new Date(expires).toISOString(), tokenHash).run()
  }
  const { session_created_at: _created, session_seen_at: _seen, ...user } = row
  return user
}

/** Reserva uma tentativa para o IP do pedido; 429 quando a janela enche. O IP entra no banco só como hash da janela. */
async function reserveIp(request, env, action) {
  const ip = request.headers.get('CF-Connecting-IP')
  // CITYOU_TEST_NO_IP_LIMIT só existe nas configurações de teste, que fazem muitos cadastros do mesmo endereço.
  if (!ip || env.CITYOU_TEST_NO_IP_LIMIT === 'true') return
  const { max, minutes } = IP_LIMITS[action]
  const windowMs = minutes * 60_000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString()
  const ipHash = await hashToken(`${windowStart}|${ip}`)
  const reserved = await env.DB.prepare(
    `INSERT INTO ip_attempts (ip_hash, action, window_start, count) VALUES (?, ?, ?, 1)
     ON CONFLICT (ip_hash, action, window_start) DO UPDATE SET count = count + 1
     WHERE count < ? RETURNING count`,
  ).bind(ipHash, action, windowStart, max).first()
  if (!reserved) throw new HttpError(429, `Muitas tentativas desta rede. Espere ${minutes} minutos e tente de novo.`)
}

/** Apaga janelas de tentativa com mais de um dia e as sessões vencidas da conta. Barato: roda no login. */
async function cleanUp(env, userId) {
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(dayAgo),
    env.DB.prepare('DELETE FROM ip_attempts WHERE window_start < ?').bind(dayAgo),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').bind(userId, now.toISOString()),
  ])
}

const inviteOpen = env => env.SIGNUP_OPEN === 'true'
const normalizeInvite = value => typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : ''

function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const letters = Array.from(bytes, byte => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join('')
  return `${letters.slice(0, 4)}-${letters.slice(4, 8)}-${letters.slice(8)}`
}

const INVITE_INVALID = 'Este convite não vale mais (usado, vencido ou cancelado). Peça outro.'

async function checkInvite(env, value) {
  const valid = await env.DB.prepare('SELECT 1 FROM invites WHERE code_hash = ? AND uses < max_uses AND revoked_at IS NULL AND expires_at > ?')
    .bind(await hashToken(normalizeInvite(value)), new Date().toISOString()).first()
  if (!valid) throw new HttpError(403, INVITE_INVALID, { invite: 'Convite sem validade.' })
}

/** Gasta um uso do convite, de forma atômica. Devolve o hash do código, ou lança 403. */
async function useInvite(env, value) {
  const code = normalizeInvite(value)
  if (code.length !== 12) throw new HttpError(403, 'O cadastro está só com convite. Digite o código que você recebeu.', { invite: 'Código de convite inválido.' })
  const inviteHash = await hashToken(code)
  const used = await env.DB.prepare(
    `UPDATE invites SET uses = uses + 1
     WHERE code_hash = ? AND uses < max_uses AND revoked_at IS NULL AND expires_at > ? RETURNING uses`,
  ).bind(inviteHash, new Date().toISOString()).first()
  if (!used) throw new HttpError(403, INVITE_INVALID, { invite: 'Convite sem validade.' })
  return inviteHash
}

const releaseInvite = (env, inviteHash) => inviteHash
  ? env.DB.prepare('UPDATE invites SET uses = uses - 1 WHERE code_hash = ? AND uses > 0').bind(inviteHash).run()
  : null

/** POST /api/admin/invites: cria um convite (só com CITYOU_ADMIN_TOKEN). O código aparece só nesta resposta. */
async function createInvite({ request, env }) {
  await requireAdmin(request, env)
  const body = await readJsonObject(request, MAX_AUTH_BODY)
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  const maxUses = body.max_uses ?? 1
  const days = body.days ?? 14
  const fields = {}
  if (!label || label.length > 80) fields.label = 'Dê um nome ao convite (até 80 letras), por exemplo para quem é.'
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > INVITE_MAX_USES) fields.max_uses = `Usos: de 1 a ${INVITE_MAX_USES}.`
  if (!Number.isInteger(days) || days < 1 || days > INVITE_MAX_DAYS) fields.days = `Validade: de 1 a ${INVITE_MAX_DAYS} dias.`
  if (Object.keys(fields).length) throw fieldsError(fields)
  const code = newInviteCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare('INSERT INTO invites (code_hash, label, max_uses, uses, created_at, expires_at) VALUES (?, ?, ?, 0, ?, ?)')
    .bind(await hashToken(normalizeInvite(code)), label, maxUses, now.toISOString(), expiresAt).run()
  return json({ code, label, max_uses: maxUses, expires_at: expiresAt }, 201)
}

/** POST /api/admin/invites/revoke: cancela um convite pelo código. Contas já criadas com ele continuam. */
async function revokeInvite({ request, env }) {
  await requireAdmin(request, env)
  const body = await readJsonObject(request, MAX_AUTH_BODY)
  const result = await env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE code_hash = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), await hashToken(normalizeInvite(body.code))).run()
  if (!result.meta?.changes) throw new HttpError(404, 'Convite não encontrado ou já cancelado.')
  return json({ revoked: true })
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
    .bind(await hashToken(token), userId, now.toISOString(), now.toISOString(), new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000).toISOString()).run()
  return sessionCookie(url, token)
}

async function signup({ request, env, url }) {
  const body = await readJsonObject(request, MAX_AUTH_BODY)
  const fields = {}
  const email = readEmail(body.email, fields)
  const name = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  if (!name || name.length > 60) fields.display_name = 'Diga como podemos chamar você (até 60 letras).'
  if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 200) fields.password = 'A senha precisa de 10 a 200 caracteres.'
  if (!inviteOpen(env) && normalizeInvite(body.invite).length !== 12) fields.invite = 'Digite o código do convite.'
  if (Object.keys(fields).length) throw fieldsError(fields)
  await reserveIp(request, env, 'signup')
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) {
    throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com a sua senha.', { email: 'E-mail já cadastrado.' })
  }
  // Confere o convite antes de reservar os dados da demonstração; o uso só é gasto logo antes de gravar a conta.
  if (!inviteOpen(env)) await checkInvite(env, body.invite)
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
  // O convite é gasto por último, antes de gravar a conta; se a gravação falhar, o uso volta.
  const inviteHash = inviteOpen(env) ? null : await useInvite(env, body.invite)
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations, created_at, updated_at, data_key, invite_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, email, name, hash, salt, ITERATIONS, now, now, dataKey, inviteHash).run()
  } catch (error) {
    await releaseInvite(env, inviteHash)
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
  await reserveIp(request, env, 'login')
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
  await cleanUp(env, user.id)
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

const adminHandlers = {
  'POST /api/admin/invites': createInvite,
  'POST /api/admin/invites/revoke': revokeInvite,
}

/** Rotas de conta. Devolve undefined se o caminho não é de conta. */
export async function authApi(context) {
  const { request, env, url } = context
  if (url.pathname === '/api/auth/status' && request.method === 'GET') {
    const user = await sessionUser(request, env)
    return json({ accounts: accountsEnabled(env), invite_required: accountsEnabled(env) && !inviteOpen(env), user: user ? publicUser(user) : null })
  }
  if (url.pathname === '/api/me' && request.method === 'GET') {
    const user = await sessionUser(request, env)
    if (!user) throw new HttpError(401, 'Entre na sua conta para continuar.')
    return json({ user: publicUser(user) })
  }
  const admin = adminHandlers[`${request.method} ${url.pathname}`]
  if (admin) {
    if (!accountsEnabled(env)) throw new HttpError(503, 'As contas ainda não estão ativas.')
    return admin(context)
  }
  if (!url.pathname.startsWith('/api/auth/')) return undefined
  const handler = handlers[`${request.method} ${url.pathname}`]
  if (!handler) throw new HttpError(Object.keys(handlers).some(key => key.endsWith(` ${url.pathname}`)) ? 405 : 404, 'Rota não encontrada.')
  if (!accountsEnabled(env)) throw new HttpError(503, 'As contas ainda não estão ativas. Use a demonstração por enquanto.')
  return handler(context)
}
