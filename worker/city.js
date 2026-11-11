import catalog from '../shared/game/city-catalog.json' with { type: 'json' }
import { RULES } from '../shared/game/rules.js'
import { HttpError } from './http.js'

const kinds = new Map(catalog.map(item => [item.id, item]))
const core = new Set(['plaza', 'headquarters'])
const actionTypes = ['build', 'move', 'rotate', 'remove', 'upgrade']
const actionFields = ['type', 'expected_revision', 'request_id', 'kind', 'x', 'y', 'rotation', 'placement_id', 'activity_id']

export function newTown() {
  const started_at = new Date().toISOString()
  const placements = [
    { id: 'core-plaza', kind: 'plaza', x: 8, y: 8 },
    { id: 'core-headquarters', kind: 'headquarters', x: 8, y: 7 },
    ...[6, 7, 8, 9, 10].map(x => ({ id: `seed-road-${x}`, kind: 'road', x, y: 9 })),
  ].map(item => ({ ...item, rotation: 0, level: 1 }))
  return { revision: 0, started_at, placements }
}

export function newCity() {
  const town = newTown()
  const credits = RULES.rewards.welcome.credits
  return {
    ...town, credits, earned: 0, reward_count: 0,
    history: [{ label: 'Boas-vindas à cidade', amount: credits, created_at: town.started_at }],
  }
}

export function snapshot(city) {
  return {
    ...city, catalog, level: 1 + Math.floor(city.reward_count / 10),
    unlock_radius: Math.min(8, 3 + Math.floor(city.reward_count / 10)),
    source: { connected: false },
  }
}

export function recordChange(city, label, amount) {
  city.credits += amount
  city.revision++
  city.history.unshift({ label, amount, created_at: new Date().toISOString() })
  city.history.length = Math.min(city.history.length, 100)
}

function integerIn(value, max) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max
}

export function validRequestId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(id)
}

export function countsForTravel(placement) {
  return kinds.has(placement.kind) && !core.has(placement.kind) && placement.kind !== 'road' && placement.kind !== 'tree'
}

export function normalizeAction(input) {
  const action = Object.fromEntries(actionFields.map(field => [field, input[field] ?? null]))
  if (Object.keys(input).some(field => !actionFields.includes(field)) ||
      !actionTypes.includes(action.type) || !integerIn(action.expected_revision, Number.MAX_SAFE_INTEGER) ||
      !validRequestId(action.request_id) ||
      (action.kind !== null && (typeof action.kind !== 'string' || action.kind.length > 40)) ||
      (action.placement_id !== null && (typeof action.placement_id !== 'string' || !action.placement_id || action.placement_id.length > 100)) ||
      (action.activity_id !== null && (typeof action.activity_id !== 'string' || !/^[a-f0-9-]{36}$/.test(action.activity_id))) ||
      [action.x, action.y].some(value => value !== null && !integerIn(value, 16)) ||
      (action.rotation !== null && !integerIn(action.rotation, 3))) {
    throw new HttpError(422, 'Confira os dados da ação.')
  }
  return action
}

function bounds({ kind, x, y, rotation }) {
  const { width, depth } = kinds.get(kind)
  return { x, y, right: x + (rotation % 2 ? depth : width), bottom: y + (rotation % 2 ? width : depth) }
}

function validateSite(city, placement) {
  const radius = Math.min(8, 3 + Math.floor(city.reward_count / 10))
  const { x, y, right, bottom } = bounds(placement)
  if (x < 8 - radius || y < 8 - radius || right > 9 + radius || bottom > 9 + radius) {
    throw new HttpError(422, 'A construção precisa caber inteiramente no terreno liberado.')
  }
  for (const existing of city.placements) {
    if (existing.id === placement.id) continue
    const site = bounds(existing)
    if (x < site.right && right > site.x && y < site.bottom && bottom > site.y) {
      throw new HttpError(409, 'Esse espaço já está ocupado.')
    }
  }
}

function requireCredits(city, cost) {
  if (city.credits < cost) throw new HttpError(422, 'Moedas insuficientes. Conclua tarefas ou hábitos para ganhar mais.')
}

// Primeiro terreno livre dentro da área liberada, do centro para fora, para o prédio de uma atividade nascer sem a pessoa escolher o lugar.
function findSite(city, kind, rotation) {
  const radius = Math.min(8, 3 + Math.floor(city.reward_count / 10))
  const spots = []
  for (let y = 8 - radius; y <= 9 + radius; y++) for (let x = 8 - radius; x <= 9 + radius; x++) spots.push({ x, y, far: Math.hypot(x - 8.5, y - 8.5) })
  for (const spot of spots.sort((a, b) => a.far - b.far)) {
    try {
      validateSite(city, { id: 'novo', kind, x: spot.x, y: spot.y, rotation })
      return spot
    } catch { /* ocupado ou fora da área: tenta o próximo */ }
  }
  throw new HttpError(422, 'Não há terreno livre. Libere mais terreno ou remova uma construção.')
}

function applyPlacement(city, action, context = {}) {
  const { type, kind, x, y, rotation, placement_id } = action
  if (type === 'build') {
    const item = kinds.get(kind)
    const auto = x === null && y === null && action.activity_id !== null
    if (!item || core.has(kind) || (!auto && (x === null || y === null)) || placement_id !== null) {
      throw new HttpError(422, 'Escolha uma construção e coordenadas válidas.')
    }
    const site = auto ? findSite(city, kind, rotation ?? 0) : { x, y }
    const placement = { id: crypto.randomUUID(), kind, x: site.x, y: site.y, rotation: rotation ?? 0, level: 1 }
    if (action.activity_id !== null) Object.assign(placement, { activity_id: action.activity_id, nome: context.nome })
    validateSite(city, placement)
    requireCredits(city, item.cost)
    city.placements.push(placement)
    return { amount: -item.cost, label: `Construiu ${placement.nome || item.label}` }
  }

  if (kind !== null || placement_id === null) throw new HttpError(422, 'Escolha uma construção da cidade.')
  const index = city.placements.findIndex(item => item.id === placement_id)
  if (index === -1) throw new HttpError(404, 'A construção não existe mais.')
  const placement = { ...city.placements[index] }
  if (core.has(placement.kind)) throw new HttpError(422, 'A praça e a sede são o centro permanente da cidade.')
  const item = kinds.get(placement.kind)

  if (type === 'move') {
    if (x === null || y === null) throw new HttpError(422, 'Mover exige x e y válidos.')
    Object.assign(placement, { x, y, rotation: rotation ?? placement.rotation })
    validateSite(city, placement)
    city.placements[index] = placement
    return { amount: 0, label: `Moveu ${item.label}` }
  }
  if (type === 'rotate') {
    if (rotation === null || x !== null || y !== null) throw new HttpError(422, 'Girar exige uma orientação entre 0 e 3.')
    placement.rotation = rotation
    validateSite(city, placement)
    city.placements[index] = placement
    return { amount: 0, label: `Girou ${item.label}` }
  }
  if (x !== null || y !== null || rotation !== null) throw new HttpError(422, 'A ação exige apenas o identificador da construção.')
  if (type === 'remove') {
    city.placements.splice(index, 1)
    return { amount: Math.floor(item.cost / 2), label: `Removeu ${item.label}` }
  }
  if (placement.level >= 3) throw new HttpError(422, 'A construção já alcançou o nível máximo.')
  const cost = item.cost * placement.level
  requireCredits(city, cost)
  placement.level++
  city.placements[index] = placement
  return { amount: -cost, label: `Melhorou ${item.label} para nível ${placement.level}` }
}

export function applyCityAction(city, action, context) {
  if (action.expected_revision !== city.revision) throw new HttpError(409, 'A cidade mudou. Atualize e tente novamente.')
  const { amount, label } = applyPlacement(city, action, context)
  recordChange(city, label, amount)
}
