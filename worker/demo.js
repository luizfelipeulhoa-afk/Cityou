import { normalizeProgress, unlockSpace } from '../src/world/progress.js'
import { SPACE_ORDER } from '../src/world/worldSpaces.js'
import { DOMAINS, RULES } from '../shared/game/rules.js'
import { ProofError, parseProof, sha256Hex } from '../shared/game/proof.js'
import { buildSummary } from '../shared/game/summary.js'
import { kindForDomain, stageFor } from '../shared/game/buildings.js'
import { newCity, newTown, snapshot, normalizeAction, applyCityAction, recordChange, validRequestId, countsForTravel } from './city.js'
import { HttpError, json, errorResponse } from './http.js'

const START = SPACE_ORDER[0]
// A ilha é só cenário; a cidade onde se constrói começa aberta no Rio de Janeiro.
const DEFAULT_CITY = 'cristo-redentor'
// A ilha conta como concluída e o Rio já nasce aberto, para a primeira construção no Rio valer uma viagem.
const withOpenDefault = progress => normalizeProgress({ ...progress, desbloqueados: [...progress.desbloqueados, DEFAULT_CITY], concluidos: [...progress.concluidos, START] })
const COOKIE = 'cityou_demo'
const SESSION_SECONDS = 30 * 24 * 60 * 60
const previewEnabled = env => env?.CITYOU_TEST_OPEN_REGIONS === '1'
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
  [/^\/api\/personal\/proofs\/([a-f0-9-]{36})\/(\d{4}-\d{2}-\d{2})\/photo$/, { GET: 'proofPhoto' }],
  [/^\/api\/workspace\/tasks$/, { GET: 'tasks' }],
  [/^\/api\/workspace\/tasks\/([a-f0-9-]{36})\/complete$/, { POST: 'finishTask' }],
  [/^\/api\/city$/, { GET: 'city' }],
  [/^\/api\/city\/actions$/, { POST: 'cityAction' }],
  [/^\/api\/rewards\/sync$/, { POST: 'syncRewards' }],
  [/^\/api\/world\/progress$/, { GET: 'world', PUT: 'saveWorld' }],
  [/^\/api\/world\/travel$/, { POST: 'travel' }],
]

export async function demoApi(request, env, url) {
  if (url.pathname === '/api/workspace/projects' && request.method === 'GET') {
    return json({ connected: false, projects: [] })
  }
  if (url.pathname === '/api/workspace/activity' && request.method === 'GET') {
    return json({ connected: false, activity: null })
  }
  const route = routes.find(([pattern]) => pattern.test(url.pathname))
  if (!route) throw new HttpError(404, 'Rota não encontrada.')
  if (!Object.hasOwn(route[1], request.method)) throw new HttpError(405, 'Método não permitido.')
  const token = sessionToken(request)
  if (!token) throw new HttpError(401, 'Abra o Cityou novamente com os cookies habilitados.')
  // Local runs may switch the flag while reusing a namespace and cookies.
  const session = previewEnabled(env) ? `test:${token}` : token
  const key = await sha256Hex(new TextEncoder().encode(session))
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

function worldSnapshot(progress, travelOpen, testMode) {
  if (testMode) {
    return { ...progress, desbloqueados: SPACE_ORDER, viagens_abertas: true, viagens_disponiveis: 0, test_mode: true }
  }
  const slots = progress.concluidos.length - (progress.desbloqueados.length - 1)
  const locked = SPACE_ORDER.length - progress.desbloqueados.length
  return { ...progress, viagens_abertas: travelOpen, viagens_disponiveis: travelOpen ? Math.max(0, Math.min(slots, locked)) : 0, test_mode: false }
}

const TRAVEL_CLOSED = 'As viagens ainda não estão abertas. Por enquanto, desenvolva a cidade onde você está.'

function place(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || value.trim().length > 80) throw new HttpError(422, 'O local aceita até 80 caracteres.')
  return value.trim()
}

function domainOf(value) {
  if (value === undefined || value === null) return 'organizacao'
  if (!DOMAINS.includes(value)) throw new HttpError(422, 'Escolha uma área válida.')
  return value
}

export class DemoSession {
  constructor(ctx, env) {
    this.testMode = previewEnabled(env)
    this.travelOpen = env?.TRAVEL_OPEN !== 'false'
    this.storage = ctx.storage
    this.sql = ctx.storage.sql
    this.sql.exec('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, value TEXT NOT NULL, PRIMARY KEY (kind, id))')
  }

  async fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname
    const location = url.searchParams.get('local') ?? DEFAULT_CITY
    const [pattern, handlers] = routes.find(([pattern]) => pattern.test(path))
    const handler = handlers[request.method]
    const [, id, second] = path.match(pattern)
    try {
      const writes = request.method !== 'GET'
      const body = writes ? await readBody(request) : undefined
      let proof
      if (handler === 'checkin' && body.proof !== undefined) {
        try {
          const parsed = parseProof(body.proof)
          proof = { ...parsed, hash: parsed.photo ? await sha256Hex(parsed.photo.bytes) : null }
        } catch (error) {
          if (error instanceof ProofError) throw new HttpError(422, error.message)
          throw error
        }
      }
      if (writes && await this.storage.getAlarm() === null) {
        await this.storage.setAlarm(Date.now() + SESSION_SECONDS * 1000)
      }
      return this.storage.transactionSync(() => {
        if (handler === 'city' || handler === 'cityAction' || handler === 'syncRewards') {
          this.requireLocation(location)
          return this[handler](body, location)
        }
        if (handler === 'proofPhoto') return this.proofPhoto(id, second)
        return this[handler](body, id, proof)
      })
    } catch (error) {
      if (error instanceof HttpError && handler === 'cityAction' && error.status !== 403 && error.status !== 404) {
        return json({ message: error.message, detail: error.message, city: this.citySnapshot(location) }, error.status)
      }
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

  saveRequest(kind, id, fingerprint) {
    this.write(kind, id, fingerprint)
    this.sql.exec(
      'DELETE FROM records WHERE rowid IN (' +
      'SELECT rowid FROM records WHERE kind = ? ORDER BY rowid DESC LIMIT -1 OFFSET 250)',
      kind,
    )
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
    const proofs = this.list('proof').map(({ photo, ...rest }) => ({ ...rest, has_photo: Boolean(photo) }))
    const today = dateFormatter.format(new Date())
    const entries = this.list('entry')
    return { entries, checkins: this.list('checkin'), proofs, today, resumo: this.summary(today, entries), predios: [...this.buildingActivityIds()], sources }
  }

  personal() { return json(this.overview()) }

  summary(day, entries) {
    const city = this.cityState()
    const paid = kind => this.sql.exec('SELECT count(*) AS total FROM records WHERE kind = ?', `reward:${kind}:${day}`).one().total
    const habits = entries.filter(entry => entry.kind === 'habit')
    const done = habits.filter(entry => this.read('checkin', `${entry.id}:${day}`)?.done === 1).length
    return buildSummary({
      credits: city.credits, earned: city.earned, rewardCount: city.reward_count,
      paidToday: { habit: paid('habit'), task: paid('task'), proof: paid('proof') },
      habits: { done, total: habits.length }, history: city.history,
    })
  }

  addEntry(input) {
    const { kind, day, body = '', category = 'pessoal', amount_cents = 0, direction = 'expense', target = 1 } = input
    const domain = domainOf(input.domain)
    const where = place(input.place)
    if (!kinds.includes(kind) || !isDate(day) || typeof body !== 'string' || body.length > 4000 ||
        typeof category !== 'string' || category.length > 50 || !['expense', 'income'].includes(direction) ||
        !Number.isInteger(amount_cents) || amount_cents < 0 || amount_cents > 100_000_000 ||
        !Number.isInteger(target) || target < 1 || target > 10_000) throw new HttpError(422, 'Confira os campos do registro.')
    if (kind === 'transaction' && amount_cents < 1) throw new HttpError(422, 'Informe um valor maior que zero.')
    if (kind === 'meal' && day > dateFormatter.format(new Date())) throw new HttpError(422, 'Registre uma refeição já realizada.')
    const { id } = this.add('entry', { kind, day, title: titleOf(input.title), body, category, amount_cents, direction, target, domain, place: where })
    return json({ ...this.overview(), created_id: id }, 201)
  }

  checkin({ done }, id, proof) {
    if (typeof done !== 'boolean') throw new HttpError(422, 'Informe se o registro foi concluído.')
    const entry = this.read('entry', id)
    if (!entry) throw new HttpError(404, 'Este item não existe.')
    if (!['habit', 'goal'].includes(entry.kind)) throw new HttpError(422, 'Este item não tem conclusão diária.')
    const day = dateFormatter.format(new Date())
    const proofResult = done && proof ? this.saveProof(entry, day, proof) : null
    this.write('checkin', `${id}:${day}`, { entry_id: id, day, done: Number(done) })
    if (done && entry.kind === 'habit') this.reward('habit', day, id, `Hábito concluído: ${entry.title}`)
    if (done && entry.kind === 'goal') this.rewardGoal(entry)
    const overview = this.overview()
    return json(proofResult ? { ...overview, proof_result: proofResult } : overview)
  }

  // A comprovação é privada e opcional. Ela só rende o bônus uma vez por atividade por dia, até o teto diário, e uma
  // mesma foto não vale duas vezes. O app não confere se a atividade aconteceu de verdade.
  saveProof(entry, day, { note, photo, hash }) {
    const key = `${entry.id}:${day}`
    const existing = this.read('proof', key)
    const used = hash ? this.read('proof-hash', hash) : null
    if (used && used.key !== key) throw new HttpError(422, 'Esta foto já foi usada em outra comprovação. Tire uma foto nova.')
    const { total } = this.sql.exec("SELECT count(*) AS total FROM records WHERE kind = 'proof'").one()
    if (!existing && total >= RULES.proof.maxStored) throw new HttpError(422, `A demonstração guarda até ${RULES.proof.maxStored} comprovações.`)
    this.write('proof', key, { entry_id: entry.id, day, note, photo: photo?.dataUrl ?? null, created_at: new Date().toISOString() })
    if (hash) this.write('proof-hash', hash, { key })
    if (existing) return { bonus: 0, reason: 'already_proved' }
    const rewardKind = `reward:proof:${day}`
    if (this.list(rewardKind, RULES.proof.maxBonusPerDay).length >= RULES.proof.maxBonusPerDay) return { bonus: 0, reason: 'daily_cap' }
    this.grantBonus(RULES.proof.bonusCredits, `Comprovação: ${entry.title}`)
    this.write(rewardKind, entry.id, true)
    return { bonus: RULES.proof.bonusCredits, reason: null }
  }

  proofPhoto(id, day) {
    const proof = this.read('proof', `${id}:${day}`)
    const match = /^data:(image\/(?:jpeg|webp));base64,(.+)$/.exec(proof?.photo ?? '')
    if (!match) throw new HttpError(404, 'Esta comprovação não tem foto.')
    const binary = atob(match[2])
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    return new Response(bytes, { headers: { 'Content-Type': match[1], 'Cache-Control': 'private, no-store' } })
  }

  tasks() { return json({ connected: false, tasks: this.list('task') }) }

  addTask({ title, due_date = null, domain, place: where }) {
    if (due_date !== null && !isDate(due_date)) throw new HttpError(422, 'Confira a data da tarefa.')
    return json(this.add('task', { title: titleOf(title), due_date, status: 'todo', completed_at: null, domain: domainOf(domain), place: place(where) }), 201)
  }

  finishTask(body, id) {
    if (Object.keys(body).length) throw new HttpError(422, 'Concluir não aceita alterações ou valores do cliente.')
    const task = this.read('task', id)
    if (!task) throw new HttpError(404, 'Esta tarefa não existe.')
    if (task.status !== 'done') {
      task.status = 'done'
      const completedAt = new Date()
      task.completed_at = completedAt.toISOString()
      this.write('task', id, task)
      this.reward('task', dateFormatter.format(completedAt), id, `Tarefa concluída: ${task.title}`)
    }
    return json({ task, city: this.citySnapshot(DEFAULT_CITY) })
  }

  cityState() { return this.read('city', 'state') ?? newCity(START, this.testMode) }

  requireLocation(location) {
    if (!SPACE_ORDER.includes(location)) throw new HttpError(404, 'Local desconhecido.')
    if (location === START || location === DEFAULT_CITY || this.testMode) return
    const progress = this.progressState()
    if (!progress.desbloqueados.includes(location)) throw new HttpError(403, 'Este local ainda está bloqueado.')
  }

  regionalCity(location, home) {
    if (location === START) return home
    const { credits, earned, reward_count, history } = home
    const region = this.read('regional-city', location) ?? newTown(location)
    return { ...region, credits, earned, reward_count, history }
  }

  // Cada prédio de atividade mostra a etapa dele, calculada pelos dias e semanas com prática. Nada vem do navegador.
  withStages(view) {
    const placements = view.placements.map(item => {
      if (!item.activity_id) return item
      const days = this.sql.exec("SELECT json_extract(value, '$.day') AS day FROM records WHERE kind = 'checkin' AND id GLOB ? AND json_extract(value, '$.done') = 1", `${item.activity_id}:*`)
        .toArray().map(row => row.day)
      return { ...item, ...stageFor(days) }
    })
    return { ...view, placements }
  }

  // Só hábitos e metas viram prédio: são os que têm dias de prática para mostrar a evolução.
  activity(id) {
    const entry = this.read('entry', id)
    return entry && ['habit', 'goal'].includes(entry.kind) ? entry : null
  }

  // Prédio de atividade: o tipo vem da área da atividade e o nome do local que a pessoa preencheu.
  activityContext(action) {
    if (action.activity_id == null || action.type !== 'build') return {}
    const entry = this.activity(action.activity_id)
    return { nome: (entry.place || entry.title).slice(0, 80) }
  }

  withActivity(action) {
    if (action.activity_id == null) return action
    if (action.type !== 'build') throw new HttpError(422, 'A atividade só se liga a uma construção nova.')
    const entry = this.activity(action.activity_id)
    if (!entry) throw new HttpError(404, 'Esta atividade não existe.')
    const kind = kindForDomain(entry.domain ?? 'organizacao')
    if (action.kind !== null && action.kind !== kind) throw new HttpError(422, 'O prédio precisa ser da mesma área da atividade.')
    if (this.buildingActivityIds().has(action.activity_id)) throw new HttpError(409, 'Esta atividade já tem um prédio na cidade.')
    return { ...action, kind }
  }

  buildingActivityIds() {
    const ids = new Set()
    for (const { value } of this.sql.exec("SELECT value FROM records WHERE kind IN ('city', 'regional-city')")) {
      for (const placement of JSON.parse(value).placements ?? []) if (placement.activity_id) ids.add(placement.activity_id)
    }
    return ids
  }

  citySnapshot(location) { return this.withStages(snapshot(this.regionalCity(location, this.cityState()), location, this.testMode)) }

  city(_, location) { return json(this.citySnapshot(location)) }

  syncRewards(body, location) {
    if (Object.keys(body).length) throw new HttpError(422, 'A sincronização não aceita valores ou fatos do cliente.')
    return this.city(undefined, location)
  }

  rewardGoal(entry) {
    const key = 'reward:goal'
    if (this.read(key, entry.id)) return
    const { total } = this.sql.exec(
      "SELECT count(*) AS total FROM records WHERE kind = 'checkin' AND id GLOB ? AND json_extract(value, '$.done') = 1",
      `${entry.id}:*`,
    ).one()
    if (total < entry.target) return
    this.grantReward(RULES.rewards.goalDone.credits, `Meta concluída: ${entry.title}`)
    this.write(key, entry.id, true)
  }

  // Bônus de comprovação: só créditos. Não conta como recompensa para o nível da cidade.
  grantBonus(amount, label) {
    const city = this.cityState()
    city.earned += amount
    recordChange(city, label, amount)
    this.write('city', 'state', city)
  }

  grantReward(amount, label) {
    const city = this.cityState()
    city.reward_count++
    city.earned += amount
    recordChange(city, label, amount)
    this.write('city', 'state', city)
  }

  reward(kind, day, id, label) {
    const key = `reward:${kind}:${day}`
    const max = kind === 'habit' ? RULES.paidHabitsPerDay : RULES.paidTasksPerDay
    if (this.read(key, id) || this.list(key, max).length >= max) return
    this.grantReward(RULES.rewards[kind].credits, label)
    this.write(key, id, true)
  }

  cityAction(body, location) {
    const action = normalizeAction(body)
    const home = this.cityState()
    const city = this.regionalCity(location, home)
    const fingerprint = JSON.stringify(location === START ? action : { location, action })
    const recorded = this.read('city-request', action.request_id)
    if (recorded !== null) {
      if (recorded !== fingerprint) throw new HttpError(409, 'Esse request_id já foi usado para outra ação.')
      return json(this.withStages(snapshot(city, location, this.testMode)))
    }
    const progress = this.progressState()
    const resolved = this.withActivity(action)
    applyCityAction(city, resolved, location, this.testMode, this.activityContext(resolved))
    if (location === START) {
      this.write('city', 'state', city)
    } else {
      const { credits, history, placements, revision, started_at } = city
      this.write('city', 'state', { ...home, credits, history, revision: home.revision + 1 })
      this.write('regional-city', location, { placements, revision, started_at })
    }
    const firstBuilding = resolved.type === 'build' && countsForTravel(resolved) && !progress.concluidos.includes(location)
    if (firstBuilding) {
      if (this.testMode && !progress.desbloqueados.includes(location)) progress.desbloqueados.push(location)
      progress.concluidos.push(location)
    }
    if (firstBuilding || !this.read('world', 'regional-progress')) {
      this.write('world', 'regional-progress', normalizeProgress(progress))
    }
    this.saveRequest('city-request', action.request_id, fingerprint)
    return json(this.withStages(snapshot(city, location, this.testMode)))
  }

  progressState() {
    return withOpenDefault(this.storedProgress())
  }

  storedProgress() {
    const regional = this.read('world', 'regional-progress')
    if (regional) return regional

    // Previously persisted progress and builds predate destination choice.
    const legacy = normalizeProgress(this.read('world', 'progress'))
    for (const location of legacy.desbloqueados) {
      if (legacy.concluidos.includes(location)) continue
      const city = location === START ? this.read('city', 'state') : this.read('regional-city', location)
      if (city?.placements.some(countsForTravel)) legacy.concluidos.push(location)
    }
    return normalizeProgress(legacy)
  }

  world() { return json(worldSnapshot(this.progressState(), this.travelOpen !== false, this.testMode)) }

  saveWorld(progress) {
    const { epoca = 0, desbloqueados = [], concluidos = [] } = progress
    if (!Number.isInteger(epoca) || epoca < 0 || epoca > 1_000_000 ||
        ![desbloqueados, concluidos].every(ids => Array.isArray(ids) && ids.length <= SPACE_ORDER.length &&
          ids.every(id => SPACE_ORDER.includes(id)))) throw new HttpError(422, 'Progresso inválido.')
    // Older clients still send a local cache. Access now comes from server-side actions.
    return this.world()
  }

  travel(body) {
    const { local, request_id } = body
    if (Object.keys(body).length !== 2 || typeof local !== 'string' || !validRequestId(request_id)) {
      throw new HttpError(422, 'Informe o destino e o identificador da viagem.')
    }
    if (!SPACE_ORDER.includes(local)) throw new HttpError(404, 'Local desconhecido.')

    const recorded = this.read('travel-request', request_id)
    if (recorded !== null && recorded !== local) {
      throw new HttpError(409, 'Esse request_id já foi usado para outra viagem.')
    }

    const progress = this.progressState()
    if (this.testMode || progress.desbloqueados.includes(local)) {
      if (recorded === null) this.saveRequest('travel-request', request_id, local)
      return json(worldSnapshot(progress, this.travelOpen, this.testMode))
    }
    if (!this.travelOpen) throw new HttpError(409, TRAVEL_CLOSED)
    if (worldSnapshot(progress, true, false).viagens_disponiveis === 0) {
      throw new HttpError(409, 'Construa um prédio em uma cidade ainda não concluída para liberar uma viagem.')
    }
    const next = unlockSpace(progress, local)
    this.write('world', 'regional-progress', next)
    if (!this.read('regional-city', local)) this.write('regional-city', local, newTown(local))
    this.saveRequest('travel-request', request_id, local)
    return json(worldSnapshot(next, this.travelOpen))
  }
}
