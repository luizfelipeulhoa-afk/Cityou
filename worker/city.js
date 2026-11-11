import catalog from '../shared/game/city-catalog.json' with { type: 'json' }
import { RULES } from '../shared/game/rules.js'
import { HttpError } from './http.js'

const kinds = new Map(catalog.map(item => [item.id, item]))
const core = new Set(['plaza', 'headquarters'])
const actionTypes = ['build', 'move', 'rotate', 'remove', 'upgrade']
const actionFields = ['type', 'expected_revision', 'request_id', 'kind', 'x', 'y', 'rotation', 'placement_id']

export function newCity() {
  const started_at = new Date().toISOString()
  const credits = RULES.rewards.welcome.credits
  const placements = [
    { id: 'core-plaza', kind: 'plaza', x: 8, y: 8 },
    { id: 'core-headquarters', kind: 'headquarters', x: 8, y: 7 },
    ...[6, 7, 8, 9, 10].map(x => ({ id: `seed-road-${x}`, kind: 'road', x, y: 9 })),
  ].map(item => ({ ...item, rotation: 0, level: 1 }))
  return {
    revision: 0, credits, earned: 0, reward_count: 0, started_at, placements,
    history: [{ label: 'Boas-vindas à cidade', amount: credits, created_at: started_at }],
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

export function normalizeAction(input) {
  const action = Object.fromEntries(actionFields.map(field => [field, input[field] ?? null]))
  if (Object.keys(input).some(field => !actionFields.includes(field)) ||
      !actionTypes.includes(action.type) || !integerIn(action.expected_revision, Number.MAX_SAFE_INTEGER) ||
      typeof action.request_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(action.request_id) ||
      (action.kind !== null && (typeof action.kind !== 'string' || action.kind.length > 40)) ||
      (action.placement_id !== null && (typeof action.placement_id !== 'string' || !action.placement_id || action.placement_id.length > 100)) ||
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

function applyPlacement(city, action) {
  const { type, kind, x, y, rotation, placement_id } = action
  if (type === 'build') {
    const item = kinds.get(kind)
    if (!item || core.has(kind) || x === null || y === null || placement_id !== null) {
      throw new HttpError(422, 'Escolha uma construção e coordenadas válidas.')
    }
    const placement = { id: crypto.randomUUID(), kind, x, y, rotation: rotation ?? 0, level: 1 }
    validateSite(city, placement)
    requireCredits(city, item.cost)
    city.placements.push(placement)
    return { amount: -item.cost, label: `Construiu ${item.label}` }
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

export function applyCityAction(city, action) {
  if (action.expected_revision !== city.revision) throw new HttpError(409, 'A cidade mudou. Atualize e tente novamente.')
  const { amount, label } = applyPlacement(city, action)
  recordChange(city, label, amount)
}
