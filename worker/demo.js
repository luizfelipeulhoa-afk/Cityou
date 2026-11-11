import { initialProgress, mergeProgress, completeSpace } from '../src/world/progress.js'
import { SPACE_ORDER } from '../src/world/worldSpaces.js'
import { HttpError, json, errorResponse } from './http.js'

const COOKIE = 'cityou_demo'
const SESSION_SECONDS = 30 * 24 * 60 * 60
const kinds = ['habit', 'goal', 'note', 'transaction', 'meal']
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
const sources = Object.fromEntries(['fitness', 'documents', 'memories', 'events']
  .map(key => [key, { connected: false, data: key === 'fitness' ? {} : [] }]))

export function sessionToken(request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)cityou_demo=([a-f0-9]{64})(?:;|$)/)?.[1]
}

export function sessionCookie(url) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`
}

const routes = [
  [/^\/api\/personal$/, { GET: 'personal' }],
  [/^\/api\/personal\/entries$/, { POST: 'addEntry' }],
  [/^\/api\/personal\/entries\/([a-f0-9-]{36})\/checkin$/, { PUT: 'checkin' }],
  [/^\/api\/personal\/tasks$/, { POST: 'addTask' }],
  [/^\/api\/workspace\/tasks$/, { GET: 'tasks' }],
  [/^\/api\/workspace\/tasks\/([a-f0-9-]{36})\/complete$/, { POST: 'finishTask' }],
  [/^\/api\/world\/progress$/, { GET: 'world', PUT: 'saveWorld' }],
]

export async function demoApi(request, env, url) {
  if (url.pathname === '/api/workspace/projects' && request.method === 'GET') {
    return json({ connected: false, projects: [] })
  }
  const route = routes.find(([pattern]) => pattern.test(url.pathname))
  if (!route) throw new HttpError(404, 'Rota não encontrada.')
  if (!Object.hasOwn(route[1], request.method)) throw new HttpError(405, 'Método não permitido.')
  const token = sessionToken(request)
  if (!token) throw new HttpError(401, 'Abra o Cityou novamente com os cookies habilitados.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const response = await env.DEMO_SESSIONS.getByName(key).fetch(request)
  return new Response(response.body, response)
}

async function readBody(request) {
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(422, 'Envie os dados do registro.')
  const decoder = new TextDecoder()
  let text = ''
  let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 24_000) {
      await reader.cancel()
      throw new HttpError(413, 'O registro é muito grande.')
    }
    text += decoder.decode(value, { stream: true })
  }
  let body
  try { body = JSON.parse(text + decoder.decode()) } catch { throw new HttpError(422, 'Dados inválidos.') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(422, 'Dados inválidos.')
  return body
}

function isDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && !value.startsWith('0000')
}

function titleOf(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 180) throw new HttpError(422, 'Escreva um título de até 180 caracteres.')
  return value.trim()
}

export class DemoSession {
  constructor(ctx) {
    this.storage = ctx.storage
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, value TEXT NOT NULL, PRIMARY KEY (kind, id))')
  }

  async fetch(request) {
    const path = new URL(request.url).pathname
    const [pattern, handlers] = routes.find(([pattern]) => pattern.test(path))
    const handler = handlers[request.method]
    const [, id] = path.match(pattern)
    try {
      const writes = request.method !== 'GET'
      const body = writes ? await readBody(request) : undefined
      if (writes && await this.storage.getAlarm() === null) {
        await this.storage.setAlarm(Date.now() + SESSION_SECONDS * 1000)
      }
      return this.storage.transactionSync(() => this[handler](body, id))
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.message)
      throw error
    }
  }

  alarm() {
    this.sql.exec('DELETE FROM records')
  }

  read(kind, id) {
    const row = this.sql.exec('SELECT value FROM records WHERE kind = ? AND id = ?', kind, id).toArray()[0]
    return row ? JSON.parse(row.value) : null
  }

  list(kind, limit = 5000) {
    return this.sql.exec('SELECT value FROM records WHERE kind = ? ORDER BY rowid DESC LIMIT ?', kind, limit)
      .toArray().map(row => JSON.parse(row.value))
  }

  write(kind, id, value) {
    this.sql.exec('INSERT INTO records VALUES (?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET value = excluded.value',
      kind, id, JSON.stringify(value))
  }

  add(kind, data) {
    if (this.sql.exec('SELECT count(*) AS total FROM records WHERE kind = ?', kind).one().total >= 100) {
      throw new HttpError(422, 'A demonstração aceita até 100 registros deste tipo.')
    }
    const record = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    this.write(kind, record.id, record)
    return record
  }

  overview() {
    return { entries: this.list('entry'), checkins: this.list('checkin'), today: dateFormatter.format(new Date()), sources }
  }

  personal() { return json(this.overview()) }

  addEntry(input) {
    const { kind, day, body = '', category = 'pessoal', amount_cents = 0, direction = 'expense', target = 1 } = input
    if (!kinds.includes(kind) || !isDate(day) || typeof body !== 'string' || body.length > 4000 ||
        typeof category !== 'string' || category.length > 50 || !['expense', 'income'].includes(direction) ||
        !Number.isInteger(amount_cents) || amount_cents < 0 || amount_cents > 100_000_000 ||
        !Number.isInteger(target) || target < 1 || target > 10_000) throw new HttpError(422, 'Confira os campos do registro.')
    if (kind === 'transaction' && amount_cents < 1) throw new HttpError(422, 'Informe um valor maior que zero.')
    if (kind === 'meal' && day > dateFormatter.format(new Date())) throw new HttpError(422, 'Registre uma refeição já realizada.')
    const { id } = this.add('entry', { kind, day, title: titleOf(input.title), body, category, amount_cents, direction, target })
    return json({ ...this.overview(), created_id: id }, 201)
  }

  checkin({ done }, id) {
    if (typeof done !== 'boolean') throw new HttpError(422, 'Informe se o registro foi concluído.')
    const entry = this.read('entry', id)
    if (!entry) throw new HttpError(404, 'Este item não existe.')
    if (!['habit', 'goal'].includes(entry.kind)) throw new HttpError(422, 'Este item não tem conclusão diária.')
    const day = dateFormatter.format(new Date())
    this.write('checkin', `${id}:${day}`, { entry_id: id, day, done: Number(done) })
    return this.personal()
  }

  tasks() { return json({ connected: false, tasks: this.list('task') }) }

  addTask({ title, due_date = null }) {
    if (due_date !== null && !isDate(due_date)) throw new HttpError(422, 'Confira a data da tarefa.')
    return json(this.add('task', { title: titleOf(title), due_date, status: 'todo', completed_at: null }), 201)
  }

  finishTask(body, id) {
    if (Object.keys(body).length) throw new HttpError(422, 'Concluir não aceita alterações ou valores do cliente.')
    const task = this.read('task', id)
    if (!task) throw new HttpError(404, 'Esta tarefa não existe.')
    if (task.status !== 'done') {
      task.status = 'done'
      task.completed_at = new Date().toISOString()
      this.write('task', id, task)
    }
    return json({ task })
  }

  world() { return json(this.read('world', 'progress') ?? initialProgress()) }

  saveWorld(progress) {
    const { epoca = 0, desbloqueados = [], concluidos = [] } = progress
    if (!Number.isInteger(epoca) || epoca < 0 || epoca > 1_000_000 ||
        ![desbloqueados, concluidos].every(ids => Array.isArray(ids) && ids.length <= SPACE_ORDER.length &&
          ids.every(id => SPACE_ORDER.includes(id)))) throw new HttpError(422, 'Progresso inválido.')
    const normalized = concluidos.reduce((state, id) => completeSpace(state, id), { epoca, desbloqueados, concluidos })
    const merged = mergeProgress(this.read('world', 'progress'), normalized)
    this.write('world', 'progress', merged)
    return json(merged)
  }
}
