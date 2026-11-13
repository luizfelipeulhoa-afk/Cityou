// Dados do terreno de uma região, sem three: alturas no mundo, platô, malha, cores e vegetação.
// Roda no navegador e no Node (os testes usam este módulo direto). A cena three fica em TerrainScene.js.
//
// Mundo: +Y para cima, o platô da zona jogável em y = 0 e o mar em y = −plateau.height.
import { createFrame } from './frame.js'
import { createLots } from './lots.js'
import { computeErrors, countTriangles, forEachTriangle, locateTriangle } from './rtin.js'

// Paleta fixa do jogo. As faixas dos degradês são misturas destas cores.
export const PALETTE = {
  grassLight: '#7BC67E', grassDark: '#4E9F5D', sand: '#F2D7A6', sea: '#3FB8AF', sky: '#8FD3F4',
  rock: '#A9A9B8', earth: '#B07A4F', cream: '#FFF4E0', accent: '#FFD25A',
}

const DEFAULTS = {
  // Altura do platô acima do mar e largura da mistura com o relevo, em unidades: `blend` do lado da terra (estreita, para
  // os morros vizinhos não serem achatados) e `shore` do lado da água (mais larga: é a faixa de areia que desce até o mar).
  // `tint`: quanto o chão dos lotes livres puxa do verde claro para o creme (negativo: para o verde-escuro, como a mata);
  // `contrast`: diferença de tom entre lotes vizinhos; `facets`: quanto da variação de tom por face (a do relevo) o platô recebe.
  plateau: { height: 0.4, blend: 2, shore: 3, tint: 0.3, contrast: 0.008, facets: 0 },
  detail: {
    maxTriangles: 60000,
    tolerance: 0.05, // erro de altura aceito junto à zona jogável, em unidades
    falloff: 0.005, // quanto a tolerância cresce por unidade de distância
    coast: 0.25, // erro somado quando tirar o vértice mudaria a linha da costa
    landmark: 0.5, // multiplica a tolerância em volta dos marcos da região
    nearLeg: 2, nearRange: 24, legGrowth: 0.1, maxLeg: 32, // maior cateto permitido: nearLeg perto, crescendo com a distância
  },
  vegetation: { seed: 7, treeRange: 150, treeDensity: 0.16, palmRange: 70, palmDensity: 0.1, decorativePalms: 0.3 },
  // Faixa de areia do relevo real: até `range` metros da água e abaixo de `elevation` metros de altitude.
  beach: { range: 130, elevation: 9 },
  seaMargin: 1200, // quanto o mar continua além da grade de alturas, em unidades
}

const hex = color => [1, 3, 5].map(start => Number.parseInt(color.slice(start, start + 2), 16))
const mix = (a, b, t) => a.map((channel, k) => channel + (b[k] - channel) * t)
const smoothstep = (a, b, value) => { const t = Math.min(1, Math.max(0, (value - a) / (b - a))); return t * t * (3 - 2 * t) }
// As cores dos vértices vão para a placa em espaço linear.
const LINEAR = Array.from({ length: 256 }, (_, value) => { const c = value / 255; return Math.round((c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 255) })
// Gerador determinístico: a mesma vegetação em toda visita.
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Distância (em amostras) de cada vértice até o vértice marcado mais próximo, por duas passadas.
function distanceField(size, isTarget) {
  const distance = new Float32Array(size * size)
  for (let index = 0; index < distance.length; index++) distance[index] = isTarget(index) ? 0 : 1e9
  const relax = (index, x, y, dx, dy, cost) => {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return
    const candidate = distance[ny * size + nx] + cost
    if (candidate < distance[index]) distance[index] = candidate
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x; relax(i, x, y, -1, 0, 1); relax(i, x, y, 0, -1, 1); relax(i, x, y, -1, -1, Math.SQRT2); relax(i, x, y, 1, -1, Math.SQRT2) }
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) { const i = y * size + x; relax(i, x, y, 1, 0, 1); relax(i, x, y, 0, 1, 1); relax(i, x, y, 1, 1, Math.SQRT2); relax(i, x, y, -1, 1, Math.SQRT2) }
  return distance
}

/**
 * Monta o terreno de uma região.
 * @param region configuração (src/terrain/regions/*.js)
 * @param values Uint16Array do mapa de alturas (decodePng(...).data)
 */
export function createTerrainData(region, values) {
  const started = performance.now()
  const plateau = { ...DEFAULTS.plateau, ...region.plateau }
  const detail = { ...DEFAULTS.detail, ...region.detail }
  const vegetation = { ...DEFAULTS.vegetation, ...region.vegetation }
  const beach = { ...DEFAULTS.beach, ...region.beach }
  const seaMargin = region.seaMargin ?? DEFAULTS.seaMargin
  const { size, spacing, center, metersPerValue } = region.heightmap
  if (values.length !== size * size) throw new Error(`O mapa de alturas tem ${values.length} amostras; a região pede ${size} × ${size}.`)
  const last = size - 1
  const originX = center[0] - last / 2 * spacing, originZ = center[1] - last / 2 * spacing
  const bounds = { minX: originX, maxX: originX + last * spacing, minZ: originZ, maxZ: originZ + last * spacing }
  const seaY = -plateau.height
  const unitsPerMeter = region.exaggeration / region.metersPerUnit
  const frame = createFrame(region)
  const lots = createLots(region.lots)
  const play = lots.bounds
  const playDistance = (x, z) => Math.hypot(Math.max(play.minX - x, 0, x - play.maxX), Math.max(play.minZ - z, 0, z - play.maxZ))

  // ---- Alturas no mundo ----
  const heights = new Float32Array(size * size)
  for (let index = 0; index < heights.length; index++) heights[index] = seaY + values[index] * metersPerValue * unitsPerMeter
  // Relevo acrescentado pela região (`relief`): morros suaves somados ao mapa real, antes do platô, que os mistura à borda.
  for (const hill of region.relief ?? []) {
    for (let j = 0; j < size; j++) {
      const dz = (originZ + j * spacing - hill.z) / hill.radiusZ
      if (Math.abs(dz) >= 1) continue
      for (let i = 0; i < size; i++) {
        const d = Math.hypot((originX + i * spacing - hill.x) / hill.radiusX, dz)
        if (d < 1) heights[j * size + i] += hill.height * (1 - d * d) ** 2
      }
    }
  }

  // ---- Corte (`region.crop`): além deste raio do centro dado, o relevo real vira mar liso, com uma faixa de mistura.
  // Mais barato que só apertar `detail.maxTriangles`: tira de vez a praia e os morros reais distantes que a câmera e a
  // névoa da cidade (CityWorld, src/terrain/lighting.js) nunca mostravam mesmo, e corta os triângulos de lá também.
  if (region.crop) {
    const { x: cropX, z: cropZ, radius, blend: cropBlend = 14 } = region.crop
    for (let j = 0; j < size; j++) {
      const wz = originZ + j * spacing
      for (let i = 0; i < size; i++) {
        const distance = Math.hypot(originX + i * spacing - cropX, wz - cropZ)
        if (distance <= radius) continue
        const index = j * size + i
        const t = smoothstep(radius, radius + cropBlend, distance)
        heights[index] += (seaY - heights[index]) * t
        if (t >= 1) values[index] = 0
      }
    }
  }

  // ---- Platô: os cantos dos lotes livres e decorativos ficam em y = 0, e os vizinhos se misturam ao relevo ----
  const isPlateau = new Uint8Array(size * size)
  const plateauVertices = []
  for (const lot of lots.playable) {
    const i = (lot.x - 0.5 - originX) / spacing, j = (lot.z - 0.5 - originZ) / spacing, cells = 1 / spacing
    if (!Number.isInteger(i) || !Number.isInteger(j) || !Number.isInteger(cells)) {
      throw new Error('Os cantos dos lotes precisam cair em amostras do mapa de alturas (confira heightmap.center e spacing).')
    }
    if (i < 0 || j < 0 || i + cells > last || j + cells > last) throw new Error(`O lote (${lot.x}, ${lot.z}) fica fora do mapa de alturas.`)
    for (let dj = 0; dj <= cells; dj++) {
      for (let di = 0; di <= cells; di++) {
        const index = (j + dj) * size + i + di
        if (!isPlateau[index]) { isPlateau[index] = 1; plateauVertices.push([i + di, j + dj]) }
      }
    }
  }
  const reach = Math.ceil(Math.max(plateau.blend, plateau.shore) / spacing)
  const column = x => Math.round((x - originX) / spacing), line = z => Math.round((z - originZ) / spacing)
  for (let j = Math.max(0, line(play.minZ) - reach); j <= Math.min(last, line(play.maxZ) + reach); j++) {
    for (let i = Math.max(0, column(play.minX) - reach); i <= Math.min(last, column(play.maxX) + reach); i++) {
      const index = j * size + i
      if (isPlateau[index]) { heights[index] = 0; continue }
      let nearest = Infinity
      for (const [pi, pj] of plateauVertices) {
        const distance = (pi - i) ** 2 + (pj - j) ** 2
        if (distance < nearest) nearest = distance
      }
      heights[index] *= smoothstep(0, values[index] === 0 ? plateau.shore : plateau.blend, Math.sqrt(nearest) * spacing)
    }
  }

  // ---- Mar: água que continuou no nível do mar depois da mistura ----
  const isSea = new Uint8Array(size * size)
  for (let index = 0; index < isSea.length; index++) isSea[index] = values[index] === 0 && heights[index] <= seaY + 1e-6 ? 1 : 0
  const shore = distanceField(size, index => isSea[index] === 1) // terra: amostras até a água
  const offshore = distanceField(size, index => isSea[index] === 0) // mar: amostras até a terra

  // ---- Erros da malha ----
  const landmarks = (region.landmarks ?? []).map(mark => ({ ...frame.toWorld(mark.lat, mark.lon), radius: mark.radius }))
  const errors = computeErrors(size, (index, x, y, a, b, half, diagonal) => {
    if (isPlateau[index]) return Infinity
    const wx = originX + x * spacing, wz = originZ + y * spacing
    const distance = playDistance(wx, wz)
    let tolerance = detail.tolerance + detail.falloff * distance
    for (const mark of landmarks) tolerance *= detail.landmark + (1 - detail.landmark) * smoothstep(mark.radius * 0.6, mark.radius, Math.hypot(wx - mark.x, wz - mark.z))
    let error = Math.abs(heights[index] - (heights[a] + heights[b]) / 2)
    const endsAtSea = isSea[a] && isSea[b]
    if (isSea[index] ? !endsAtSea : endsAtSea) error += detail.coast
    const leg = (diagonal ? half * 2 : half * Math.SQRT2) * spacing
    const maxLeg = Math.min(detail.maxLeg, detail.nearLeg + Math.max(0, distance - detail.nearRange) * detail.legGrowth)
    return Math.max(error / tolerance, leg / maxLeg)
  })
  // Limite 1 é o desenho pedido; se passar do orçamento de triângulos, o limite sobe até caber.
  const budget = detail.maxTriangles - 8 // oito triângulos são do mar além da grade
  let threshold = 1
  if (countTriangles(errors, size, threshold) > budget) {
    let low = 1, high = 2
    while (countTriangles(errors, size, high) > budget) { low = high; high *= 2 }
    for (let step = 0; step < 14; step++) {
      const middle = (low + high) / 2
      if (countTriangles(errors, size, middle) > budget) low = middle
      else high = middle
    }
    threshold = high
  }

  // ---- Faces: posição, cor e vegetação ----
  const P = Object.fromEntries(Object.entries(PALETTE).map(([name, color]) => [name, hex(color)]))
  const grassBands = [P.grassLight, mix(P.grassLight, P.grassDark, 0.5), P.grassDark]
  const rockBands = [P.rock, mix(P.rock, P.cream, 0.28)]
  const seaBands = [mix(P.sea, P.cream, 0.24), mix(P.sea, P.cream, 0.1), P.sea]
  const plateauFree = plateau.tint >= 0 ? mix(P.grassLight, P.cream, plateau.tint) : mix(P.grassLight, P.grassDark, -plateau.tint), plateauDecorative = P.sand
  const count = countTriangles(errors, size, threshold)
  const positions = new Float32Array((count + 8) * 9)
  const colors = new Uint8Array((count + 8) * 9)
  const random = seeded(vegetation.seed)
  const trees = [], palms = []
  const stats = { sea: 0, sand: 0, grass: 0, rock: 0, earth: 0, plateau: 0 }
  const cellMeters = spacing * region.metersPerUnit
  let cursor = 0
  const paint = (color, shade) => {
    for (let vertex = 0; vertex < 3; vertex++) {
      for (let k = 0; k < 3; k++) colors[cursor + vertex * 3 + k] = LINEAR[Math.min(255, Math.max(0, Math.round(color[k] * shade)))]
    }
  }
  // Um ponto ao acaso dentro da face, exatamente sobre ela.
  const plant = (list, ax, ay, az, bx, by, bz, cx, cy, cz, scale) => {
    let u = random(), v = random()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    list.push(ax + (bx - ax) * u + (cx - ax) * v, ay + (by - ay) * u + (cy - ay) * v, az + (bz - az) * u + (cz - az) * v, scale, random() * Math.PI * 2, random())
  }
  forEachTriangle(errors, size, threshold, (gax, gay, gbx, gby, gcx, gcy) => {
    const a = gay * size + gax, b = gby * size + gbx, c = gcy * size + gcx
    const ax = originX + gax * spacing, az = originZ + gay * spacing, ay = heights[a]
    const bx = originX + gbx * spacing, bz = originZ + gby * spacing, by = heights[b]
    const cx = originX + gcx * spacing, cz = originZ + gcy * spacing, cy = heights[c]
    positions.set([ax, ay, az, bx, by, bz, cx, cy, cz], cursor)
    const middleX = (ax + bx + cx) / 3, middleZ = (az + bz + cz) / 3
    const jitter = 1 + (random() - 0.5) * 0.06
    const area = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2
    const distance = playDistance(middleX, middleZ)
    const lot = isPlateau[a] && isPlateau[b] && isPlateau[c] ? lots.kindAt({ x: Math.round(middleX), z: Math.round(middleZ) }) : 'blocked'
    if (isSea[a] && isSea[b] && isSea[c]) {
      const depth = Math.min(offshore[a], offshore[b], offshore[c]) * spacing
      paint(seaBands[depth <= 2 ? 0 : depth <= 6 ? 1 : 2], 1 + (jitter - 1) * 0.7)
      stats.sea++
    }
    else if (lot !== 'blocked') {
      // Um tom por lote, alternado de leve, deixa a grade visível sem desenhar linhas.
      const tone = 1 + ((Math.abs(Math.round(middleX) * 13 + Math.round(middleZ) * 7) % 5) - 2) * plateau.contrast
      paint(lot === 'free' ? plateauFree : plateauDecorative, tone * (1 + (jitter - 1) * plateau.facets))
      if (lot === 'decorative' && random() < vegetation.decorativePalms) plant(palms, ax, ay, az, bx, by, bz, cx, cy, cz, 0.85 + random() * 0.35)
      stats.plateau++
    }
    else {
      // Inclinação e altitude reais, sem o exagero.
      const rise = unitsPerMeter * region.metersPerUnit // unidades de altura por unidade horizontal, para 1 m/m
      const ux = bx - ax, uy = (by - ay) / rise, uz = bz - az, vx = cx - ax, vy = (cy - ay) / rise, vz = cz - az
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const slope = Math.acos(Math.min(1, Math.abs(ny) / Math.hypot(nx, ny, nz))) * 180 / Math.PI
      const elevation = ((ay + by + cy) / 3 - seaY) / unitsPerMeter
      const fromWater = Math.min(shore[a], shore[b], shore[c]) * cellMeters
      if (slope >= 40 || (elevation >= 520 && slope >= 24)) { paint(rockBands[elevation >= 430 ? 1 : 0], jitter); stats.rock++ }
      else if (fromWater <= beach.range && elevation <= beach.elevation) { // a faixa da praia; costão alto junto ao mar não entra, pela altitude
        paint(P.sand, jitter)
        if (distance < vegetation.palmRange && random() < area * vegetation.palmDensity) plant(palms, ax, ay, az, bx, by, bz, cx, cy, cz, 0.85 + random() * 0.35)
        stats.sand++
      }
      else if (slope >= 36.5) { paint(P.earth, jitter); stats.earth++ } // faixa estreita de terra entre a mata e a pedra
      else {
        const band = elevation < 28 && slope < 7 ? 0 : elevation < 120 && slope < 19 ? 1 : 2
        paint(grassBands[band], jitter)
        if (band > 0 && distance < vegetation.treeRange) {
          const expected = area * vegetation.treeDensity * (1 - smoothstep(vegetation.treeRange * 0.45, vegetation.treeRange, distance)) * (band === 2 ? 1 : 0.45)
          for (let n = Math.floor(expected + random()); n > 0; n--) plant(trees, ax, ay, az, bx, by, bz, cx, cy, cz, 0.75 + random() * 0.6)
        }
        stats.grass++
      }
    }
    cursor += 9
  })
  // O mar continua além da grade: quatro faixas no nível do mar, um pouco abaixo e sobrepostas à borda para não abrir fresta.
  const y = seaY - 0.05, far = seaMargin, { minX, maxX, minZ, maxZ } = bounds
  const strip = (x1, z1, x2, z2) => {
    positions.set([x1, y, z1, x1, y, z2, x2, y, z1, x2, y, z1, x1, y, z2, x2, y, z2], cursor)
    paint(seaBands[2], 1); cursor += 9
    paint(seaBands[2], 1); cursor += 9
  }
  strip(minX - far, minZ - far, maxX + far, minZ + 1)
  strip(minX - far, maxZ - 1, maxX + far, maxZ + far)
  strip(minX - far, minZ + 1, minX + 1, maxZ - 1)
  strip(maxX - 1, minZ + 1, maxX + far, maxZ - 1)

  // ---- Paredes: trechos da borda da grade onde há terra. É o que a névoa precisa esconder (camera.js). ----
  const walls = []
  const edge = (indexAt, pointAt) => {
    let start = -1, top = 0
    for (let k = 0; k <= size; k++) {
      const land = k < size && !isSea[indexAt(k)]
      if (land) { if (start < 0) { start = k; top = seaY } top = Math.max(top, heights[indexAt(k)]) }
      else if (start >= 0) {
        const [x1, z1] = pointAt(Math.max(0, start - 2)), [x2, z2] = pointAt(Math.min(last, k + 1))
        walls.push({ x1, z1, x2, z2, top: top + 0.5 })
        start = -1
      }
    }
  }
  edge(k => k, k => [originX + k * spacing, minZ])
  edge(k => last * size + k, k => [originX + k * spacing, maxZ])
  edge(k => k * size, k => [minX, originZ + k * spacing])
  edge(k => k * size + last, k => [maxX, originZ + k * spacing])

  const getHeightAt = (x, z) => {
    const gx = (x - originX) / spacing, gy = (z - originZ) / spacing
    if (!(gx >= 0 && gy >= 0 && gx <= last && gy <= last)) return seaY
    const [tax, tay, tbx, tby, tcx, tcy] = locateTriangle(errors, size, threshold, gx, gy)
    const determinant = (tby - tcy) * (tax - tcx) + (tcx - tbx) * (tay - tcy)
    const wa = ((tby - tcy) * (gx - tcx) + (tcx - tbx) * (gy - tcy)) / determinant
    const wb = ((tcy - tay) * (gx - tcx) + (tax - tcx) * (gy - tcy)) / determinant
    return wa * heights[tay * size + tax] + wb * heights[tby * size + tbx] + (1 - wa - wb) * heights[tcy * size + tcx]
  }

  return {
    region, frame, lots, seaY, bounds, seaMargin, walls,
    grid: { size, spacing, originX, originZ, heights, isSea, isPlateau },
    positions, colors,
    triangles: count + 8,
    trees: new Float32Array(trees), palms: new Float32Array(palms), // por instância: x, y, z, escala, giro, acaso
    stats: { ...stats, triangles: count + 8, threshold, trees: trees.length / 6, palms: palms.length / 6, milliseconds: performance.now() - started },

    /** Altura do terreno desenhado em (x, z), no mundo. Fora da grade é o nível do mar. */
    getHeightAt,
    /** Um prédio de `size` × `size` lotes ancorado em `lot` ({ x, z }) cabe em lotes livres? */
    isBuildable: (lot, lotSize = 1) => lots.isBuildable(lot, lotSize),
    /** Lote âncora mais próximo de `position` ({ x, z }) para um prédio de `size` × `size` lotes. */
    snapToLot: (position, lotSize = 1) => lots.snapToLot(position, lotSize),
    /** Lotes bloqueados da grade, em retângulos: [{ x, z, width, depth }]. */
    getBlockedAreas: () => lots.getBlockedAreas(),
  }
}
