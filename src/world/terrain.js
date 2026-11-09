import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { DESERTS, ICE, LAND, MOUNTAINS, RAINFORESTS, WATER } from './continents.js'
import { DEG, latLonToVector3 } from './geo.js'

// Paleta (sRGB). Cores vivas e suaves, pensadas para flat shading.
const PALETTE = {
  snow: '#f4f8ff', rock: '#a99f98', rockDark: '#8f8a96',
  desert: '#f2d08d', desert2: '#e8bb78', steppe: '#d9d08a',
  rainforest: '#3fa65a', tropical: '#6cc75c', savanna: '#b8d064',
  temperate: '#80d06e', boreal: '#4ea477', tundra: '#b5c8a0',
  beach: '#f7e4ab',
  lagoon: '#8ef4e2', shallow: '#56dad4', mid: '#37b8d8', deep: '#2793d4', deeper: '#1f76c6', seaIce: '#e4f3ff',
}
const FLOWERS = ['#ff7eb0', '#ffd166', '#ffffff', '#c792ff', '#ff9f6b']
const LUSH = new THREE.Color('#5fdc6e')
const BRIGHT_SEA = new THREE.Color('#5ff2e6')
const SUNNY_SAND = new THREE.Color('#fff0b8')
const colorCache = new Map()
function paletteColor(key) {
  if (!colorCache.has(key)) colorCache.set(key, new THREE.Color(PALETTE[key] || key))
  return colorCache.get(key)
}

// ---------- Geometria de polígonos em lon/lat ----------
function withBounds(points) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
  }
  return { points, minLon, maxLon, minLat, maxLat }
}
const LAND_POLYS = LAND.map(withBounds)
const WATER_POLYS = WATER.map(withBounds)
const ICE_POLYS = ICE.map(withBounds)

function inPolygon(lon, lat, poly) {
  if (lon < poly.minLon || lon > poly.maxLon || lat < poly.minLat || lat > poly.maxLat) return false
  const pts = poly.points
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const inAny = (lon, lat, polys) => polys.some(p => inPolygon(lon, lat, p))

// ---------- Ruído determinístico ----------
function hash3(x, y, z) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const smooth = t => t * t * (3 - 2 * t)
function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi)
  const lerp = THREE.MathUtils.lerp
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz)
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf), x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf)
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf), x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf)
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf)
}
export function fbm(x, y, z, octaves = 3) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq + 17.1 * i, y * freq - 9.7 * i, z * freq + 3.3 * i) * amp
    norm += amp; amp *= 0.5; freq *= 2.03
  }
  return sum / norm
}

// ---------- Terra, relevo e bioma ----------
export function isLand(lat, lon) {
  if (lat < -67.5) return true
  return inAny(lon, lat, LAND_POLYS) && !inAny(lon, lat, WATER_POLYS)
}

function ellipseWeight(lat, lon, zones) {
  let best = 0
  for (const z of zones) {
    let dLon = Math.abs(lon - z.lon)
    if (dLon > 180) dLon = 360 - dLon
    const d = (((lat - z.lat) / z.rLat) ** 2) + ((dLon / z.rLon) ** 2)
    best = Math.max(best, 1 - d)
  }
  return best
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len = dx * dx + dy * dy || 1
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function mountainHeight(lat, lon) {
  const k = Math.cos(lat * DEG)
  let h = 0
  for (const range of MOUNTAINS) {
    let d = Infinity
    for (let i = 0; i < range.points.length - 1; i++) {
      const [ax, ay] = range.points[i], [bx, by] = range.points[i + 1]
      d = Math.min(d, segmentDistance(lon * k, lat, ax * k, ay, bx * k, by))
    }
    if (d < range.width) h = Math.max(h, range.height * (1 - d / range.width) ** 2)
  }
  return h
}

function landColorKey(lat, lon, h, rand, patch) {
  // `patch` é ruído espacial (0..1): biomas em manchas coerentes, não em "xadrez".
  const a = Math.abs(lat) + (patch - 0.5) * 8
  if (lat < -62 || inAny(lon, lat, ICE_POLYS)) return 'snow'
  if (h > 0.05) return 'snow'
  if (h > 0.036) return rand > 0.5 ? 'rock' : 'rockDark'
  if (a > 71) return 'snow'
  const dry = ellipseWeight(lat, lon, DESERTS) + (patch - 0.5) * 0.35
  const wet = ellipseWeight(lat, lon, RAINFORESTS) + (patch - 0.5) * 0.3
  if (dry > 0.3) return dry > 0.6 ? 'desert' : 'desert2'
  if (wet > 0.1) return 'rainforest'
  if (dry > 0.05) return 'steppe'
  if (a < 14) return 'tropical'
  if (a < 27) return patch > 0.55 ? 'savanna' : 'tropical'
  if (a < 50) return 'temperate'
  if (a < 62) return 'boreal'
  return 'tundra'
}

function vividColor(base, kind, rand, target) {
  target.copy(base)
  if (kind === 'ocean') return target.lerp(BRIGHT_SEA, 0.45).offsetHSL(0, 0.08, 0.04)
  if (kind === 'snow') return target.offsetHSL(0, 0.04, 0.02)
  if (kind === 'beach') return target.lerp(SUNNY_SAND, 0.5)
  if (rand > 0.8) return target.set(FLOWERS[Math.floor(rand * 997) % FLOWERS.length])
  return target.lerp(LUSH, 0.6).offsetHSL(0, 0.12, 0.03)
}

/**
 * Gera a geometria do globo low poly: icosaedro subdividido, não indexado
 * (cada face tem cor própria) e com os atributos usados pelo shader:
 *  - color: cor base da face
 *  - aVivid: cor "florescida" usada quando um espaço é concluído
 *  - aCenter: direção do centróide da face (mesmo valor nos 3 vértices)
 *  - aWave: 1 em vértices de oceano (ondas), 0 em terra
 *
 * Observação: no three r172 `detail` é linear (cada aresta vira detail+1
 * segmentos, 20·(detail+1)² triângulos). detail 4–5 dá só 500–720 faces,
 * pouco para continentes legíveis; 28 dá ~16,8 mil triângulos e continua low poly.
 */
export function buildGlobeGeometry({ radius = 5, detail = 28, spaces = [] } = {}) {
  let base = new THREE.IcosahedronGeometry(1, detail)
  base.deleteAttribute('normal')
  base.deleteAttribute('uv')
  base = mergeVertices(base, 1e-4)
  const index = base.index.array
  const P = base.attributes.position
  const V = P.count

  const dirs = new Float32Array(V * 3)
  const lat = new Float32Array(V), lon = new Float32Array(V)
  const land = new Uint8Array(V)
  const v = new THREE.Vector3()

  const anchors = spaces.map(s => ({
    space: s, dir: latLonToVector3(s.lat, s.lon, 1), ocean: s.terreno === 'oceano',
  }))

  for (let i = 0; i < V; i++) {
    v.fromBufferAttribute(P, i).normalize()
    dirs[i * 3] = v.x; dirs[i * 3 + 1] = v.y; dirs[i * 3 + 2] = v.z
    lat[i] = Math.asin(v.y) / DEG
    lon[i] = Math.atan2(v.x, v.z) / DEG
    let isL = isLand(lat[i], lon[i])
    for (const a of anchors) {
      const d = Math.acos(THREE.MathUtils.clamp(v.dot(a.dir), -1, 1)) / DEG
      if (a.ocean && d < 5.5) isL = false
      else if (!a.ocean && d < 2.4) isL = true
    }
    land[i] = isL ? 1 : 0
  }

  // Vizinhança para medir distância (em arestas) até a costa.
  const neighbors = Array.from({ length: V }, () => [])
  const seen = new Set()
  const link = (a, b) => {
    const key = a < b ? a * V + b : b * V + a
    if (seen.has(key)) return
    seen.add(key)
    neighbors[a].push(b); neighbors[b].push(a)
  }
  for (let f = 0; f < index.length; f += 3) {
    link(index[f], index[f + 1]); link(index[f + 1], index[f + 2]); link(index[f + 2], index[f])
  }
  const hopsFrom = (isSource) => {
    const hops = new Int16Array(V).fill(-1)
    let frontier = []
    for (let i = 0; i < V; i++) if (isSource(i)) { hops[i] = 0; frontier.push(i) }
    while (frontier.length) {
      const next = []
      for (const i of frontier) for (const n of neighbors[i]) if (hops[n] < 0) { hops[n] = hops[i] + 1; next.push(n) }
      frontier = next
    }
    return hops
  }
  const seaHops = hopsFrom(i => land[i] === 1) // em vértices de oceano: distância até a terra
  const shoreHops = hopsFrom(i => land[i] === 0) // em vértices de terra: distância até o mar

  // Relevo (fração do raio).
  const elev = new Float32Array(V)
  for (let i = 0; i < V; i++) {
    if (!land[i]) continue
    const x = dirs[i * 3], y = dirs[i * 3 + 1], z = dirs[i * 3 + 2]
    const inland = Math.min(Math.max(shoreHops[i] - 1, 0), 5)
    let h = 0.011 + inland * 0.003 + (fbm(x * 2.6 + 4, y * 2.6, z * 2.6) - 0.5) * 0.016
    const m = mountainHeight(lat[i], lon[i])
    if (m > 0) h += m * (0.65 + 0.7 * fbm(x * 7, y * 7, z * 7 + 11, 2))
    if (lat[i] < -62) h += 0.012
    elev[i] = Math.max(0.006, h)
  }

  // Platôs planos sob os espaços em terra, para os modelos assentarem bem.
  for (const a of anchors) {
    if (a.ocean) continue
    let best = -1, bestDot = -2
    for (let i = 0; i < V; i++) {
      const d = dirs[i * 3] * a.dir.x + dirs[i * 3 + 1] * a.dir.y + dirs[i * 3 + 2] * a.dir.z
      if (d > bestDot) { bestDot = d; best = i }
    }
    const plateau = Math.min(Math.max(elev[best], 0.014), 0.03)
    const radiusDeg = 3.6
    for (let i = 0; i < V; i++) {
      if (!land[i]) continue
      const d = Math.acos(THREE.MathUtils.clamp(dirs[i * 3] * a.dir.x + dirs[i * 3 + 1] * a.dir.y + dirs[i * 3 + 2] * a.dir.z, -1, 1)) / DEG
      if (d >= radiusDeg) continue
      const w = 1 - THREE.MathUtils.smoothstep(d / radiusDeg, 0.62, 1)
      elev[i] = THREE.MathUtils.lerp(elev[i], plateau, w)
    }
  }

  const islandDirs = anchors.filter(a => a.ocean).map(a => a.dir)

  // Monta a geometria não indexada com cor por face.
  const F = index.length / 3
  const position = new Float32Array(F * 9)
  const color = new Float32Array(F * 9)
  const vivid = new Float32Array(F * 9)
  const center = new Float32Array(F * 9)
  const wave = new Float32Array(F * 3)
  const c = new THREE.Color(), cv = new THREE.Color()
  const centroid = new THREE.Vector3()
  let landFaces = 0

  for (let f = 0; f < F; f++) {
    const ids = [index[f * 3], index[f * 3 + 1], index[f * 3 + 2]]
    centroid.set(0, 0, 0)
    let nLand = 0, avgElev = 0, minSea = 99
    for (const i of ids) {
      centroid.x += dirs[i * 3]; centroid.y += dirs[i * 3 + 1]; centroid.z += dirs[i * 3 + 2]
      nLand += land[i]
      avgElev += elev[i] / 3
      if (!land[i] && seaHops[i] >= 0) minSea = Math.min(minSea, seaHops[i])
    }
    centroid.normalize()
    const cLat = Math.asin(centroid.y) / DEG
    const cLon = Math.atan2(centroid.x, centroid.z) / DEG
    const rand = hash3(f, 7, 13)

    let kind
    const patch = fbm(centroid.x * 3.4 + 7, centroid.y * 3.4, centroid.z * 3.4 - 5, 3)
    if (nLand >= 2) {
      // Costa: faces mistas usam o bioma clareado em direção à areia (transição suave).
      const key = landColorKey(cLat, cLon, avgElev, rand, patch)
      c.copy(paletteColor(key))
      if (nLand === 2 && key !== 'snow') c.lerp(paletteColor('beach'), 0.55)
      kind = key === 'snow' ? 'snow' : nLand === 2 ? 'beach' : 'land'
      landFaces++
    }
    else {
      let key = minSea <= 1 ? 'shallow' : minSea === 2 ? 'mid' : minSea <= 4 ? 'deep' : 'deeper'
      for (const d of islandDirs) {
        const ang = Math.acos(THREE.MathUtils.clamp(centroid.dot(d), -1, 1)) / DEG
        if (ang < 2.8) key = 'lagoon'
        else if (ang < 5.2 && key !== 'lagoon') key = 'shallow'
      }
      if (Math.abs(cLat) > 79) key = 'seaIce'
      c.copy(paletteColor(key))
      if (nLand === 1 && key !== 'seaIce') c.lerp(paletteColor('lagoon'), 0.45)
      kind = key === 'seaIce' ? 'snow' : 'ocean'
    }
    c.offsetHSL(0, 0, (rand - 0.5) * 0.03)
    vividColor(c, kind, hash3(f, 3, 5), cv)

    for (let k = 0; k < 3; k++) {
      const i = ids[k]
      const o = f * 9 + k * 3
      const r = radius * (1 + elev[i])
      position[o] = dirs[i * 3] * r; position[o + 1] = dirs[i * 3 + 1] * r; position[o + 2] = dirs[i * 3 + 2] * r
      color[o] = c.r; color[o + 1] = c.g; color[o + 2] = c.b
      vivid[o] = cv.r; vivid[o + 1] = cv.g; vivid[o + 2] = cv.b
      center[o] = centroid.x; center[o + 1] = centroid.y; center[o + 2] = centroid.z
      wave[f * 3 + k] = land[i] || Math.abs(lat[i]) > 77 ? 0 : 1
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
  geometry.setAttribute('aVivid', new THREE.BufferAttribute(vivid, 3))
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(center, 3))
  geometry.setAttribute('aWave', new THREE.BufferAttribute(wave, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  base.dispose()
  return { geometry, faces: F, landRatio: landFaces / F }
}
