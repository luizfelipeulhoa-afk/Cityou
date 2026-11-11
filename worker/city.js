import {
  connectedRoads, getBuilding, getCityCatalog, getCityLayout, hasRoadFrontage, isPilotCity,
  placementProblem, previewRoadPath, roadPath, tileKey,
} from '../shared/game/city-layout.js'
import { RULES } from '../shared/game/rules.js'
import { HttpError } from './http.js'

const core = new Set(['plaza', 'headquarters'])
const actionTypes = ['build', 'move', 'rotate', 'remove', 'upgrade', 'road_path']
const actionFields = ['type', 'expected_revision', 'request_id', 'kind', 'x', 'y', 'rotation', 'placement_id']

export function newTown(location) {
  const { roadSeeds } = getCityLayout(location)
  const started_at = new Date().toISOString()
  const placements = [
    { id: 'core-plaza', kind: 'plaza', x: 8, y: 8 },
    { id: 'core-headquarters', kind: 'headquarters', x: 8, y: 7 },
    ...roadSeeds.map(([x, y]) => ({ id: y === 9 ? `seed-road-${x}` : `seed-road-${x}-${y}`, kind: 'road', x, y })),
  ].map(item => ({ ...item, rotation: 0, level: 1 }))
  return { revision: 0, started_at, placements }
}

export function newCity(location, testMode = false) {
  const town = newTown(location)
  const credits = testMode ? 5000 : RULES.rewards.welcome.credits
  const label = testMode ? 'Créditos da prévia' : 'Boas-vindas à cidade'
  return {
    ...town, credits, earned: 0, reward_count: 0,
    history: [{ label, amount: credits, created_at: town.started_at }],
  }
}

function buildRadius(city, location, testMode) {
  const maximum = getCityLayout(location).max - 8
  return testMode && isPilotCity(location) ? maximum : Math.min(maximum, 3 + Math.floor(city.reward_count / 10))
}

export function snapshot(city, location, testMode = false) {
  const { min, max, protectedTiles } = getCityLayout(location)
  return {
    ...city, catalog: getCityCatalog(location), level: 1 + Math.floor(city.reward_count / 10),
    unlock_radius: buildRadius(city, location, testMode),
    grid_min: min, grid_max: max, protected_tiles: protectedTiles,
    location_id: location, test_mode: testMode,
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
  return Boolean(getBuilding(placement.kind)) && !core.has(placement.kind) && placement.kind !== 'road' && placement.kind !== 'tree'
}

export function normalizeAction(input) {
  const pathAction = input.type === 'road_path'
  // Existing request receipts depend on the original serialization order, so a field only joins when it is sent.
  const linked = input.activity_id !== undefined
  const fields = [...actionFields, ...(pathAction ? ['end_x', 'end_y'] : []), ...(linked ? ['activity_id'] : [])]
  const action = Object.fromEntries(fields.map(field => [field, input[field] ?? null]))
  const validCoordinate = value => Number.isSafeInteger(value) && value >= -8 && value <= 24
  if (Object.keys(input).some(field => !fields.includes(field)) ||
      !actionTypes.includes(action.type) || !integerIn(action.expected_revision, Number.MAX_SAFE_INTEGER) ||
      !validRequestId(action.request_id) ||
      (action.kind !== null && (typeof action.kind !== 'string' || action.kind.length > 40)) ||
      (action.placement_id !== null && (typeof action.placement_id !== 'string' || !action.placement_id || action.placement_id.length > 100)) ||
      [action.x, action.y].some(value => value !== null && !validCoordinate(value)) ||
      (pathAction && ([action.x, action.y, action.end_x, action.end_y].some(value => !validCoordinate(value)) ||
        action.kind !== null || action.placement_id !== null || action.rotation !== null)) ||
      (linked && (typeof action.activity_id !== 'string' || !/^[a-f0-9-]{36}$/.test(action.activity_id))) ||
      (action.rotation !== null && !integerIn(action.rotation, 3))) {
    throw new HttpError(422, 'Confira os dados da ação.')
  }
  return action
}

function validateSite(context, placement) {
  const issue = placementProblem(context, placement)
  if (issue) throw new HttpError(issue.status, issue.message)
}

function validateRoadChange(context, original, replacement) {
  if (!isPilotCity(context.location_id) || original.kind !== 'road') return

  const before = connectedRoads(context.placements)
  const remaining = context.placements.filter(placement => placement.id !== original.id)
  const after = connectedRoads(replacement ? [...remaining, replacement] : remaining)
  const brokenLink = remaining.some(placement => {
    if (placement.kind === 'road') {
      const key = tileKey(placement.x, placement.y)
      return before.has(key) && !after.has(key)
    }
    return countsForTravel(placement) && hasRoadFrontage(placement, before) && !hasRoadFrontage(placement, after)
  })
  if (brokenLink) throw new HttpError(422, 'Essa rua mantém outra rua ou prédio conectado à entrada da cidade.')
}

function buildRoadPath(city, context, { x, y, end_x, end_y }) {
  const result = previewRoadPath(context, roadPath(x, y, end_x, end_y))
  if (result.error) throw new HttpError(result.status, result.error)
  const newRoads = result.points.filter(point => !point.existing).map(point => ({
    id: crypto.randomUUID(), kind: 'road', x: point.x, y: point.y, rotation: 0, level: 1,
  }))
  city.placements.push(...newRoads)
  return { amount: -result.cost, label: `Construiu trecho de rua (${newRoads.length})` }
}

// Primeiro lote livre e válido, do centro para fora, para o prédio de uma atividade nascer sem a pessoa escolher o lugar.
function findSite(context, kind, rotation) {
  const { min, max, center } = getCityLayout(context.location_id)
  const spots = []
  for (let y = min; y <= max; y++) for (let x = min; x <= max; x++) spots.push({ x, y, far: Math.hypot(x - center - 0.5, y - center - 0.5) })
  for (const spot of spots.sort((a, b) => a.far - b.far)) {
    if (!placementProblem(context, { id: 'novo', kind, x: spot.x, y: spot.y, rotation })) return spot
  }
  throw new HttpError(422, 'Não há terreno livre. Remova uma construção ou desenhe mais ruas.')
}

function requireCredits(city, cost) {
  if (city.credits < cost) throw new HttpError(422, 'Moedas insuficientes. Conclua tarefas ou hábitos para ganhar mais.')
}

function applyPlacement(city, action, context) {
  if (action.type === 'road_path') return buildRoadPath(city, context, action)
  const { type, kind, x, y, rotation, placement_id } = action
  if (type === 'build') {
    const item = getCityCatalog(context.location_id).find(entry => entry.id === kind)
    const linked = action.activity_id !== null && action.activity_id !== undefined
    const auto = linked && x === null && y === null
    if (!item || core.has(kind) || (!auto && (x === null || y === null)) || placement_id !== null) {
      throw new HttpError(422, 'Escolha uma construção e coordenadas válidas.')
    }
    const site = auto ? findSite(context, kind, rotation ?? 0) : { x, y }
    const placement = { id: crypto.randomUUID(), kind, x: site.x, y: site.y, rotation: rotation ?? 0, level: 1 }
    if (linked) Object.assign(placement, { activity_id: action.activity_id, nome: context.activity_name })
    validateSite(context, placement)
    requireCredits(city, item.cost)
    city.placements.push(placement)
    return { amount: -item.cost, label: `Construiu ${placement.nome || item.label}` }
  }

  if (kind !== null || placement_id === null) throw new HttpError(422, 'Escolha uma construção da cidade.')
  const index = city.placements.findIndex(item => item.id === placement_id)
  if (index === -1) throw new HttpError(404, 'A construção não existe mais.')
  const placement = { ...city.placements[index] }
  if (core.has(placement.kind)) throw new HttpError(422, 'A praça e a sede são o centro permanente da cidade.')
  if (isPilotCity(context.location_id) && placement.id.startsWith('seed-road-')) {
    throw new HttpError(422, 'As ruas iniciais fazem parte da planta da cidade.')
  }
  const item = getBuilding(placement.kind)

  if (type === 'move') {
    if (x === null || y === null) throw new HttpError(422, 'Mover exige x e y válidos.')
    Object.assign(placement, { x, y, rotation: rotation ?? placement.rotation })
    validateSite(context, placement)
    validateRoadChange(context, city.placements[index], placement)
    city.placements[index] = placement
    return { amount: 0, label: `Moveu ${item.label}` }
  }
  if (type === 'rotate') {
    if (rotation === null || x !== null || y !== null) throw new HttpError(422, 'Girar exige uma orientação entre 0 e 3.')
    placement.rotation = rotation
    validateSite(context, placement)
    city.placements[index] = placement
    return { amount: 0, label: `Girou ${item.label}` }
  }
  if (x !== null || y !== null || rotation !== null) throw new HttpError(422, 'A ação exige apenas o identificador da construção.')
  if (type === 'remove') {
    validateRoadChange(context, placement)
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

export function applyCityAction(city, action, location, testMode = false, extra = {}) {
  if (action.expected_revision !== city.revision) throw new HttpError(409, 'A cidade mudou. Atualize e tente novamente.')
  const context = { ...city, location_id: location, unlock_radius: buildRadius(city, location, testMode), activity_name: extra.nome }
  const { amount, label } = applyPlacement(city, action, context)
  recordChange(city, label, amount)
}
