// Núcleo do terreno do globo, em JavaScript puro (sem three), para rodar num
// Web Worker com um pacote pequeno. Devolve arrays tipados prontos para virar
// BufferGeometry: icosaedro subdividido, não indexado, com cor por face.
//
// Observação: `detail` é linear, como no three r172 (cada aresta vira detail+1
// segmentos, 20·(detail+1)² triângulos). 28 dá ~16,8 mil triângulos.
import { DESERTS, ICE, LAND, MOUNTAINS, RAINFORESTS, WATER } from './continents.js'

const DEG = Math.PI / 180
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (x, lo, hi) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t) }

// ---------- Cores (RGB linear, como o THREE.Color) ----------
const srgbToLinear = c => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4))
function hex(value) {
  const n = parseInt(value.slice(1), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}
function mix(out, a, b, t) {
  out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t)
  return out
}
function hue(p, q, t) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t)
  return p
}
/** Soma (dh, ds, dl) em HSL, com a mesma conta do THREE.Color.offsetHSL. */
function offsetHSL(c, dh, ds, dl) {
  const [r, g, b] = c
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  let l = (min + max) / 2
  if (min !== max) {
    const delta = max - min
    s = l <= 0.5 ? delta / (max + min) : delta / (2 - max - min)
    if (max === r) h = (g - b) / delta + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h /= 6
  }
  h = (((h + dh) % 1) + 1) % 1
  s = clamp(s + ds, 0, 1)
  l = clamp(l + dl, 0, 1)
  if (s === 0) { c[0] = c[1] = c[2] = l; return c }
  const p = l <= 0.5 ? l * (1 + s) : l + s - l * s
  const q = 2 * l - p
  c[0] = hue(q, p, h + 1 / 3); c[1] = hue(q, p, h); c[2] = hue(q, p, h - 1 / 3)
  return c
}

// Paleta (sRGB). Cores vivas e suaves, pensadas para flat shading.
const PALETTE = Object.fromEntries(Object.entries({
  snow: '#f4f8ff', rock: '#a99f98', rockDark: '#8f8a96',
  desert: '#f2d08d', desert2: '#e8bb78', steppe: '#d9d08a',
  rainforest: '#3fa65a', tropical: '#6cc75c', savanna: '#b8d064',
  temperate: '#80d06e', boreal: '#4ea477', tundra: '#b5c8a0',
  beach: '#f7e4ab',
  lagoon: '#8ef4e2', shallow: '#56dad4', mid: '#37b8d8', deep: '#2793d4', deeper: '#1f76c6', seaIce: '#e4f3ff',
}).map(([key, value]) => [key, hex(value)]))
const FLOWERS = ['#ff7eb0', '#ffd166', '#ffffff', '#c792ff', '#ff9f6b'].map(hex)
const LUSH = hex('#5fdc6e')
const BRIGHT_SEA = hex('#5ff2e6')
const SUNNY_SAND = hex('#fff0b8')
export const OCEAN_COLOR = PALETTE.deep

// ---------- Polígonos em lon/lat ----------
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
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function inAny(lon, lat, polys) {
  for (const p of polys) if (inPolygon(lon, lat, p)) return true
  return false
}

// ---------- Ruído determinístico ----------
function hash3(x, y, z) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  let xf = x - xi, yf = y - yi, zf = z - zi
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf)
  const x00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf)
  const x10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf)
  const x01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf)
  const x11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf)
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
    if (1 - d > best) best = 1 - d
  }
  return best
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len = dx * dx + dy * dy || 1
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function mountainHeight(lat, lon) {
  const k = Math.cos(lat * DEG)
  let h = 0
  for (const range of MOUNTAINS) {
    let d = Infinity
    for (let i = 0; i < range.points.length - 1; i++) {
      const a = range.points[i], b = range.points[i + 1]
      d = Math.min(d, segmentDistance(lon * k, lat, a[0] * k, a[1], b[0] * k, b[1]))
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

function vividColor(out, base, kind, rand) {
  out[0] = base[0]; out[1] = base[1]; out[2] = base[2]
  if (kind === 'ocean') return offsetHSL(mix(out, out, BRIGHT_SEA, 0.45), 0, 0.08, 0.04)
  if (kind === 'snow') return offsetHSL(out, 0, 0.04, 0.02)
  if (kind === 'beach') return mix(out, out, SUNNY_SAND, 0.5)
  if (rand > 0.8) {
    const flower = FLOWERS[Math.floor(rand * 997) % FLOWERS.length]
    out[0] = flower[0]; out[1] = flower[1]; out[2] = flower[2]
    return out
  }
  return offsetHSL(mix(out, out, LUSH, 0.6), 0, 0.12, 0.03)
}

// ---------- Icosfera com vértices compartilhados ----------
// Mesmos 12 vértices, 20 faces e ordem de subdivisão do IcosahedronGeometry do three.
function icosphere(detail) {
  const t = (1 + Math.sqrt(5)) / 2
  const base = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1]
  const faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1]
  const n = detail + 1
  const dirs = []
  const lookup = new Map()
  const index = new Uint32Array(20 * n * n * 3)
  const grid = new Int32Array((n + 1) * (n + 1))
  let out = 0
  for (let f = 0; f < 20; f++) {
    const a = faces[f * 3] * 3, b = faces[f * 3 + 1] * 3, c = faces[f * 3 + 2] * 3
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const wa = n - i - j
        let x = base[a] * wa + base[b] * j + base[c] * i
        let y = base[a + 1] * wa + base[b + 1] * j + base[c + 1] * i
        let z = base[a + 2] * wa + base[b + 2] * j + base[c + 2] * i
        const inv = 1 / Math.hypot(x, y, z)
        x *= inv; y *= inv; z *= inv
        const key = ((Math.round(x * 1e5) + 100000) * 200001 + (Math.round(y * 1e5) + 100000)) * 200001 + (Math.round(z * 1e5) + 100000)
        let id = lookup.get(key)
        if (id === undefined) {
          id = dirs.length / 3
          dirs.push(x, y, z)
          lookup.set(key, id)
        }
        grid[i * (n + 1) + j] = id
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2 * (n - i) - 1; j++) {
        const k = j >> 1
        if (j % 2 === 0) {
          index[out++] = grid[i * (n + 1) + k + 1]; index[out++] = grid[(i + 1) * (n + 1) + k]; index[out++] = grid[i * (n + 1) + k]
        }
        else {
          index[out++] = grid[i * (n + 1) + k + 1]; index[out++] = grid[(i + 1) * (n + 1) + k + 1]; index[out++] = grid[(i + 1) * (n + 1) + k]
        }
      }
    }
  }
  return { dirs: Float32Array.from(dirs), index }
}

function direction(lat, lon) {
  const c = Math.cos(lat * DEG)
  return [c * Math.sin(lon * DEG), Math.sin(lat * DEG), c * Math.cos(lon * DEG)]
}

/**
 * Gera os dados do globo.
 * Atributos (3 vértices por face): position, color (cor base da face),
 * vivid (cor "florescida"), center (direção do centróide da face) e
 * wave (1 em vértices de oceano, 0 em terra).
 * `surface[id]` é o raio da superfície sob cada espaço (platô plano em terra).
 */
export function buildGlobeData({ radius = 5, detail = 28, spaces = [] } = {}) {
  const { dirs, index } = icosphere(detail)
  const V = dirs.length / 3
  const lat = new Float32Array(V), lon = new Float32Array(V)
  const land = new Uint8Array(V)
  const anchors = spaces.map(s => ({ id: s.id, dir: direction(s.lat, s.lon), ocean: s.terreno === 'oceano' }))
  const COS_OCEAN = Math.cos(5.5 * DEG), COS_LAND = Math.cos(2.4 * DEG)

  for (let i = 0; i < V; i++) {
    const x = dirs[i * 3], y = dirs[i * 3 + 1], z = dirs[i * 3 + 2]
    lat[i] = Math.asin(clamp(y, -1, 1)) / DEG
    lon[i] = Math.atan2(x, z) / DEG
    let isL = isLand(lat[i], lon[i])
    for (const a of anchors) {
      const dot = x * a.dir[0] + y * a.dir[1] + z * a.dir[2]
      if (a.ocean && dot > COS_OCEAN) isL = false
      else if (!a.ocean && dot > COS_LAND) isL = true
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
  const hopsFrom = (source) => {
    const hops = new Int16Array(V).fill(-1)
    let frontier = []
    for (let i = 0; i < V; i++) if (land[i] === source) { hops[i] = 0; frontier.push(i) }
    while (frontier.length) {
      const next = []
      for (const i of frontier) for (const m of neighbors[i]) if (hops[m] < 0) { hops[m] = hops[i] + 1; next.push(m) }
      frontier = next
    }
    return hops
  }
  const seaHops = hopsFrom(1) // em vértices de oceano: distância até a terra
  const shoreHops = hopsFrom(0) // em vértices de terra: distância até o mar

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
  const surface = {}
  const RADIUS_DEG = 3.6
  const COS_PLATEAU = Math.cos(RADIUS_DEG * DEG)
  for (const a of anchors) {
    surface[a.id] = radius
    if (a.ocean) continue
    let best = 0, bestDot = -2
    for (let i = 0; i < V; i++) {
      const dot = dirs[i * 3] * a.dir[0] + dirs[i * 3 + 1] * a.dir[1] + dirs[i * 3 + 2] * a.dir[2]
      if (dot > bestDot) { bestDot = dot; best = i }
    }
    const plateau = Math.min(Math.max(elev[best], 0.014), 0.03)
    surface[a.id] = radius * (1 + plateau)
    for (let i = 0; i < V; i++) {
      if (!land[i]) continue
      const dot = dirs[i * 3] * a.dir[0] + dirs[i * 3 + 1] * a.dir[1] + dirs[i * 3 + 2] * a.dir[2]
      if (dot <= COS_PLATEAU) continue
      const d = Math.acos(clamp(dot, -1, 1)) / DEG
      elev[i] = lerp(elev[i], plateau, 1 - smoothstep(d / RADIUS_DEG, 0.62, 1))
    }
  }

  const islands = anchors.filter(a => a.ocean).map(a => a.dir)
  const COS_LAGOON = Math.cos(2.8 * DEG), COS_SHALLOW = Math.cos(5.2 * DEG)

  // Monta os atributos não indexados, com cor por face.
  const F = index.length / 3
  const position = new Float32Array(F * 9)
  const color = new Float32Array(F * 9)
  const vivid = new Float32Array(F * 9)
  const center = new Float32Array(F * 9)
  const wave = new Float32Array(F * 3)
  const c = [0, 0, 0], cv = [0, 0, 0]
  let landFaces = 0

  for (let f = 0; f < F; f++) {
    const i0 = index[f * 3], i1 = index[f * 3 + 1], i2 = index[f * 3 + 2]
    let cx = dirs[i0 * 3] + dirs[i1 * 3] + dirs[i2 * 3]
    let cy = dirs[i0 * 3 + 1] + dirs[i1 * 3 + 1] + dirs[i2 * 3 + 1]
    let cz = dirs[i0 * 3 + 2] + dirs[i1 * 3 + 2] + dirs[i2 * 3 + 2]
    const inv = 1 / Math.hypot(cx, cy, cz)
    cx *= inv; cy *= inv; cz *= inv
    const nLand = land[i0] + land[i1] + land[i2]
    const avgElev = (elev[i0] + elev[i1] + elev[i2]) / 3
    let minSea = 99
    if (!land[i0] && seaHops[i0] >= 0) minSea = Math.min(minSea, seaHops[i0])
    if (!land[i1] && seaHops[i1] >= 0) minSea = Math.min(minSea, seaHops[i1])
    if (!land[i2] && seaHops[i2] >= 0) minSea = Math.min(minSea, seaHops[i2])
    const cLat = Math.asin(clamp(cy, -1, 1)) / DEG
    const cLon = Math.atan2(cx, cz) / DEG
    const rand = hash3(f, 7, 13)

    let kind
    if (nLand >= 2) {
      // Costa: faces mistas usam o bioma clareado em direção à areia (transição suave).
      const patch = fbm(cx * 3.4 + 7, cy * 3.4, cz * 3.4 - 5, 3)
      const key = landColorKey(cLat, cLon, avgElev, rand, patch)
      const base = PALETTE[key]
      c[0] = base[0]; c[1] = base[1]; c[2] = base[2]
      if (nLand === 2 && key !== 'snow') mix(c, c, PALETTE.beach, 0.55)
      kind = key === 'snow' ? 'snow' : nLand === 2 ? 'beach' : 'land'
      landFaces++
    }
    else {
      let key = minSea <= 1 ? 'shallow' : minSea === 2 ? 'mid' : minSea <= 4 ? 'deep' : 'deeper'
      for (const d of islands) {
        const dot = cx * d[0] + cy * d[1] + cz * d[2]
        if (dot > COS_LAGOON) key = 'lagoon'
        else if (dot > COS_SHALLOW && key !== 'lagoon') key = 'shallow'
      }
      if (Math.abs(cLat) > 79) key = 'seaIce'
      const base = PALETTE[key]
      c[0] = base[0]; c[1] = base[1]; c[2] = base[2]
      if (nLand === 1 && key !== 'seaIce') mix(c, c, PALETTE.lagoon, 0.45)
      kind = key === 'seaIce' ? 'snow' : 'ocean'
    }
    offsetHSL(c, 0, 0, (rand - 0.5) * 0.03)
    vividColor(cv, c, kind, hash3(f, 3, 5))

    for (let k = 0; k < 3; k++) {
      const i = index[f * 3 + k]
      const o = f * 9 + k * 3
      const r = radius * (1 + elev[i])
      position[o] = dirs[i * 3] * r; position[o + 1] = dirs[i * 3 + 1] * r; position[o + 2] = dirs[i * 3 + 2] * r
      color[o] = c[0]; color[o + 1] = c[1]; color[o + 2] = c[2]
      vivid[o] = cv[0]; vivid[o + 1] = cv[1]; vivid[o + 2] = cv[2]
      center[o] = cx; center[o + 1] = cy; center[o + 2] = cz
      wave[f * 3 + k] = land[i] || Math.abs(lat[i]) > 77 ? 0 : 1
    }
  }

  return { radius, faces: F, landRatio: landFaces / F, surface, position, color, vivid, center, wave }
}
