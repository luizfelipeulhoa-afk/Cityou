import catalogFile from './city-catalog.json' with { type: 'json' }

// No city-catalog.json, os itens `island-*` são prédios da Ilha Inicial: saem do catálogo comum
// às outras cidades e entram só no catálogo regional da ilha (mais abaixo).
const islandOnly = item => item.id.startsWith('island-')
const baseCatalog = catalogFile.filter(item => !islandOnly(item))

const center = 8
const baseRoadSeeds = [6, 7, 8, 9, 10].map(x => [x, 9])
const legacy = { min: 0, max: 16, center, roadSeeds: baseRoadSeeds, waterTiles: [], slopeTiles: [], protectedTiles: [] }
const insideLegacy = (x, y) => x >= 0 && x <= 16 && y >= 0 && y <= 16

export const tileKey = (x, y) => `${x},${y}`

export function roadPath(x, y, endX, endY) {
  if (![x, y, endX, endY].every(value => Number.isSafeInteger(value) && value >= -8 && value <= 24)) return []
  const points = [{ x, y }]
  while (x !== endX) {
    x += Math.sign(endX - x)
    points.push({ x, y })
  }
  while (y !== endY) {
    y += Math.sign(endY - y)
    points.push({ x, y })
  }
  return points
}

function pilot({ terrain, extraRoad, scenic = false, ...details }) {
  const waterTiles = []
  const slopeTiles = []
  for (let y = -8; y <= 24; y++) {
    for (let x = -8; x <= 24; x++) {
      if (insideLegacy(x, y)) continue
      const zone = terrain(x, y)
      if (zone === 'water') waterTiles.push([x, y])
      if (zone === 'slope') slopeTiles.push([x, y])
    }
  }
  const protectedTiles = [...waterTiles, ...slopeTiles]
  const roadSeeds = scenic ? [] : [...baseRoadSeeds, ...extraRoad.map(({ x, y }) => [x, y])]
  return {
    min: -8, max: 24, center, waterTiles, slopeTiles, protectedTiles, roadSeeds, scenic, ...details,
  }
}

const pilots = {
  'ilha-inicial': pilot({
    terrain(x, y) {
      const outsideCoast = ((x - 8) / 15) ** 2 + ((y - 8) / 14) ** 2 > 1
      return outsideCoast || (x >= 19 && y >= 14) ? 'water' : 'land'
    },
    extraRoad: [],
    scenic: true,
    landmarks: [{ id: 'ilha-inicial', x: -1, y: 23 }],
    entry: [8, 23],
    arrivalPath: [[8, 23], [8, 19], [8, 9]],
  }),
  'cristo-redentor': pilot({
    terrain(x, y) {
      if (y > 22 - Math.floor((x + 8) / 14)) return 'water'
      if (y < -4 + Math.floor((x + 8) / 10) || (x <= -5 && y < 2)) return 'slope'
      return 'land'
    },
    extraRoad: [
      ...roadPath(10, 10, 10, 19),
      ...roadPath(11, 19, 23, 19),
    ],
    landmarks: [{ id: 'cristo-redentor', x: 5, y: -7 }],
    entry: [23, 19],
    arrivalPath: [[23, 19], [18, 19], [10, 19], [10, 9]],
  }),
}

export function getCityLayout(location) {
  return Object.hasOwn(pilots, location) ? pilots[location] : legacy
}

// Cidade só de cenário: sem ruas, sem prédios e sem catálogo (a Ilha Inicial).
export function isScenicCity(location) {
  return getCityLayout(location).scenic === true
}

export function isPilotCity(location) {
  return Object.hasOwn(pilots, location)
}

function building(id, label, width, depth, height, color, cost, destination = null, art = {}) {
  return { id, label, width, depth, height, color, cost, destination, model: null, ...(destination && { interior: id }), ...art }
}

// Prédios do Rio com GLB próprio (Tripo, reduzidos por tools/optimize-city-models.mjs para cerca de 6 a 8 mil
// triângulos). Cada GLB traz o seu disco de calçadão; a cidade o ajusta a 90% da área. `height` é a altura que o
// modelo tem ao ocupar 90% da área, para a trava de altura da cidade não encolher o prédio.
const rioModel = id => ({ model: `/models/rio/${id}.glb`, preview: `/previews/${id}.png` })

const regionalCatalog = {
  'ilha-inicial': [
    building('island-house', 'Casa costeira', 2, 2, 1.6, '#e6bc87', 20),
    building('island-hall', 'Salão comunitário', 2, 2, 2.1, '#72a69f', 30),
    building('island-dhoni', 'Oficina de dhoni', 3, 2, 2.1, '#985b43', 40, '/#/projetos'),
    building('island-market', 'Mercado de pescado', 3, 2, 2.5, '#e5ac55', 50, '/#/tarefas'),
    building('island-fiber', 'Ateliê de fibra vegetal', 3, 3, 2.4, '#bc784a', 60),
    ...catalogFile.filter(islandOnly),
  ],
  'cristo-redentor': [
    building('rio-sobrado', 'Sobrado com comércio', 2, 2, 4.2, '#ddaf77', 20),
    building('rio-botequim', 'Botequim de esquina', 2, 2, 2.8, '#5e9784', 30),
    building('rio-kiosk', 'Quiosque esportivo', 3, 2, 2.0, '#75a4af', 35),
    building('rio-fair', 'Pavilhão de feira', 3, 2, 3.0, '#c77955', 50, '/#/tarefas'),
    building('rio-samba', 'Quadra de escola de samba', 3, 3, 3.8, '#588ab1', 60, '/#/agenda'),
    building('rio-feira-barraca', 'Barraca de feira', 2, 2, 1.4, '#d9553f', 20, null, rioModel('rio-feira-barraca')),
    building('rio-laje', 'Casa da laje', 2, 2, 1.6, '#4f8fcf', 25, null, rioModel('rio-laje')),
    building('rio-quiosque-coco', 'Quiosque de coco', 2, 2, 1.2, '#d9a14f', 25, null, rioModel('rio-quiosque-coco')),
    building('rio-academia', 'Academia ao ar livre', 2, 2, 1.3, '#f0d27a', 30, null, rioModel('rio-academia')),
    building('rio-salva-vidas', 'Posto salva-vidas', 2, 2, 1.7, '#efe8d8', 30, null, rioModel('rio-salva-vidas')),
    building('rio-bonde', 'Ponto do bonde', 2, 2, 1.2, '#e8b930', 35, null, rioModel('rio-bonde')),
    building('rio-casarao', 'Casarão colonial', 3, 3, 2.1, '#e2b73f', 50, null, rioModel('rio-casarao')),
    building('rio-igreja', 'Igrejinha da vila', 3, 3, 2.4, '#e6dcc0', 55, null, rioModel('rio-igreja')),
    building('rio-edificio-deco', 'Edifício Art Déco', 3, 3, 2.4, '#6fa3cf', 60, null, rioModel('rio-edificio-deco')),
    building('rio-prefeitura', 'Prefeitura', 3, 3, 2.4, '#e9d28a', 70, null, rioModel('rio-prefeitura')),
    building('rio-casa', 'Casa térrea', 2, 2, 1.1, '#e0603f', 20, null, rioModel('rio-casa')),
    building('rio-picole', 'Carrinho de picolé', 1, 1, 1.1, '#f0d27a', 15, null, rioModel('rio-picole')),
    building('rio-sobradinho', 'Sobrado colorido', 2, 2, 2.2, '#ffd166', 30, null, rioModel('rio-sobradinho')),
    building('rio-predio-comercial', 'Prédio comercial', 2, 2, 2.0, '#2e3a59', 55, null, rioModel('rio-predio-comercial')),
    building('rio-milho', 'Carrinho de milho', 1, 1, 0.9, '#b07a4f', 15, null, rioModel('rio-milho')),
    building('rio-hospital', 'Hospital', 3, 3, 1.7, '#a6dcff', 75, null, rioModel('rio-hospital')),
    building('rio-academia-grande', 'Academia grande', 3, 3, 1.5, '#2e3a59', 65, null, rioModel('rio-academia-grande')),
  ],
}

const catalogs = Object.fromEntries(Object.entries(regionalCatalog)
  .map(([location, buildings]) => [location, [...buildings, ...baseCatalog]]))
const kinds = new Map([...baseCatalog, ...Object.values(regionalCatalog).flat()].map(item => [item.id, item]))

// A Ilha Inicial é de cenário (sem praça, sede, rua nem prédios de atividade), mas o jogador constrói nela o Farol,
// a Cabana e o Píer (decidido em 13/11/2026). Uma cidade de cenário só aceita os tipos desta lista.
const scenicBuildable = { 'ilha-inicial': ['island-lighthouse', 'island-cabin', 'island-pier', 'island-hammock', 'island-palms', 'island-bonfire', 'island-statue', 'island-boat-small', 'island-boat-large'] }

/** Tipos que o jogador pode construir numa cidade de cenário (vazio se ela é só para contemplar). */
export function scenicBuildKinds(location) {
  return isScenicCity(location) ? (scenicBuildable[location] ?? []) : []
}

export function getCityCatalog(location) {
  if (isScenicCity(location)) return scenicBuildKinds(location).map(id => kinds.get(id)).filter(Boolean)
  return Object.hasOwn(catalogs, location) ? catalogs[location] : baseCatalog
}

export function getBuilding(kind) {
  return kinds.get(kind)
}

export function occupiedTiles({ kind, x, y, rotation = 0 }) {
  const { width, depth } = getBuilding(kind)
  const rotated = rotation % 2 !== 0
  const columns = rotated ? depth : width
  const rows = rotated ? width : depth
  const tiles = []
  for (let dy = 0; dy < rows; dy++) {
    for (let dx = 0; dx < columns; dx++) tiles.push({ x: x + dx, y: y + dy })
  }
  return tiles
}

function adjacent(x, y) {
  return [tileKey(x - 1, y), tileKey(x + 1, y), tileKey(x, y - 1), tileKey(x, y + 1)]
}

export function connectedRoads(placements) {
  const roads = placements.filter(placement => placement.kind === 'road')
  const locations = new Map(roads.map(tile => [tileKey(tile.x, tile.y), tile]))
  const connected = new Set()
  const seeds = roads.filter(placement => placement.id.startsWith('seed-road-'))
  const plaza = placements.find(placement => placement.kind === 'plaza')
  const entry = plaza ? adjacent(plaza.x, plaza.y) : []
  const queue = seeds.length ? seeds : roads.filter(({ x, y }) => entry.includes(tileKey(x, y)))
  for (const tile of queue) connected.add(tileKey(tile.x, tile.y))
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { x, y } = queue[cursor]
    for (const key of adjacent(x, y)) {
      if (locations.has(key) && !connected.has(key)) {
        connected.add(key)
        queue.push(locations.get(key))
      }
    }
  }
  return connected
}

export function hasRoadFrontage(placement, roads) {
  return occupiedTiles(placement).some(({ x, y }) => adjacent(x, y).some(key => roads.has(key)))
}

const protection = new Map(Object.values(pilots).map(layout => [layout, new Set(layout.protectedTiles.map(([x, y]) => tileKey(x, y)))]))

function tileIsAvailable(city, x, y) {
  const layout = getCityLayout(city.location_id)
  const radius = city.unlock_radius
  return x >= layout.center - radius && y >= layout.center - radius &&
    x <= layout.center + radius && y <= layout.center + radius &&
    !protection.get(layout)?.has(tileKey(x, y))
}

export function placementProblem(city, placement) {
  const tiles = occupiedTiles(placement)
  if (tiles.some(({ x, y }) => !tileIsAvailable(city, x, y))) {
    return { status: 422, message: 'A construção precisa caber inteiramente no terreno liberado e fora das áreas protegidas.' }
  }
  const target = new Set(tiles.map(({ x, y }) => tileKey(x, y)))
  for (const existing of city.placements) {
    if (existing.id === placement.id) continue
    if (occupiedTiles(existing).some(({ x, y }) => target.has(tileKey(x, y)))) {
      return { status: 409, message: 'Esse espaço já está ocupado.' }
    }
  }
  // Na ilha não há rua nem entrada: os prédios dela não pedem frente para rua.
  if (isPilotCity(city.location_id) && !isScenicCity(city.location_id) && placement.kind !== 'tree') {
    const roads = connectedRoads(city.placements.filter(existing => existing.id !== placement.id))
    const plaza = city.placements.find(existing => existing.kind === 'plaza')
    const restoresEntry = placement.kind === 'road' && roads.size === 0 &&
      plaza && adjacent(plaza.x, plaza.y).includes(tileKey(placement.x, placement.y))
    if (!restoresEntry && !hasRoadFrontage(placement, roads)) {
      return { status: 422, message: 'Escolha um lote junto a uma rua conectada à entrada da cidade.' }
    }
  }
  return null
}

export function previewRoadPath(city, points) {
  const occupied = new Map(city.placements.flatMap(placement =>
    occupiedTiles(placement).map(({ x, y }) => [tileKey(x, y), placement.kind])))
  const roads = connectedRoads(city.placements)
  const checked = points.map(({ x, y }) => {
    const type = occupied.get(tileKey(x, y))
    const existing = type === 'road'
    return { x, y, existing, valid: existing || (!type && tileIsAvailable(city, x, y)) }
  })
  const newTiles = checked.filter(tile => !tile.existing)
  const plaza = city.placements.find(placement => placement.kind === 'plaza')
  const entry = roads.size === 0 && plaza ? adjacent(plaza.x, plaza.y) : []
  const cost = newTiles.length * getBuilding('road').cost
  let error = null
  let status = 422
  if (checked.some(tile => !tile.valid)) {
    error = 'O trecho cruza uma construção, área protegida ou terreno bloqueado.'
    if (checked.some(tile => !tile.valid && occupied.has(tileKey(tile.x, tile.y)))) status = 409
  } else if (newTiles.length === 0) {
    error = 'Escolha um trecho com pelo menos uma célula livre.'
  } else if (!checked.some(({ x, y }) => roads.has(tileKey(x, y)) ||
    entry.includes(tileKey(x, y)) || adjacent(x, y).some(key => roads.has(key)))) {
    error = 'O trecho precisa se conectar à rede de ruas da cidade.'
  } else if (city.credits < cost) {
    error = 'Moedas insuficientes para construir o trecho.'
  }
  return { points: checked, cost, error, status: error ? status : 200 }
}
