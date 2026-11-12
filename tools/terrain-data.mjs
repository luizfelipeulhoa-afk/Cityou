// Gera o mapa de alturas de uma região de terreno a partir dos tiles públicos Terrarium (Mapzen/Tilezen).
// Roda uma vez, fora do app: em tempo de execução o terreno vem só do arquivo gerado.
//
// Uso: node tools/terrain-data.mjs rio [--mask[=x0,z0,colunas,linhas]] [--preview]
//   --mask     recria a máscara dos lotes (src/terrain/regions/<id>.lots.json) a partir do relevo.
//              Sem isso a máscara fica como está: ela é um arquivo editado à mão.
//   --preview  grava uma imagem de conferência em .verification/terrain-<id>.png
// Os tiles baixados ficam em data/terrain-tiles/ (fora do git); rodar de novo não baixa nada.
// Fonte dos dados, fórmula, licença e atribuição: docs/TERRAIN.md.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { decodePng } from '../src/terrain/png.js'
import { createFrame } from '../src/terrain/frame.js'

const SOURCE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const CACHE = path.resolve('data/terrain-tiles')
const TILE = 256
const args = process.argv.slice(2)
const id = args.find(arg => !arg.startsWith('--'))
if (!id) throw new Error('Informe a região: node tools/terrain-data.mjs rio')
const maskOption = args.find(arg => arg === '--mask' || arg.startsWith('--mask='))
const preview = args.includes('--preview')

const { default: region } = await import(`../src/terrain/regions/${id}.js`)
const frame = createFrame(region)
const { size, spacing, center, metersPerValue, zoom } = region.heightmap
const cellMeters = spacing * region.metersPerUnit
const worldOf = index => (index - (size - 1) / 2) * spacing // deslocamento em relação ao centro da grade
const sampleWorld = (i, j) => [center[0] + worldOf(i), center[1] + worldOf(j)]
const gridOf = (x, z) => [(x - center[0]) / spacing + (size - 1) / 2, (z - center[1]) / spacing + (size - 1) / 2]

// ---------- 1. Tiles ----------
const tiles = 2 ** zoom
const tileX = lon => (lon + 180) / 360 * tiles
const tileY = lat => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * tiles
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
for (let k = 0; k < size; k += 8) {
  for (const [i, j] of [[k, 0], [k, size - 1], [0, k], [size - 1, k], [size - 1, size - 1]]) {
    const { lat, lon } = frame.toGeo(...sampleWorld(i, j))
    x0 = Math.min(x0, tileX(lon)); x1 = Math.max(x1, tileX(lon))
    y0 = Math.min(y0, tileY(lat)); y1 = Math.max(y1, tileY(lat))
  }
}
// Uma folga de dois pixels cobre a interpolação nas bordas.
x0 = Math.floor(x0 - 2 / TILE); y0 = Math.floor(y0 - 2 / TILE); x1 = Math.floor(x1 + 2 / TILE); y1 = Math.floor(y1 + 2 / TILE)
const width = (x1 - x0 + 1) * TILE, height = (y1 - y0 + 1) * TILE
const mosaic = new Float32Array(width * height) // metros
const mosaicLand = new Uint8Array(width * height)
fs.mkdirSync(CACHE, { recursive: true })
let downloaded = 0
for (let ty = y0; ty <= y1; ty++) {
  for (let tx = x0; tx <= x1; tx++) {
    const file = path.join(CACHE, `terrarium-${zoom}-${tx}-${ty}.png`)
    if (!fs.existsSync(file)) {
      const response = await fetch(`${SOURCE}/${zoom}/${tx}/${ty}.png`, { headers: { 'User-Agent': 'terrain-data/1.0' } })
      if (!response.ok) throw new Error(`Tile ${zoom}/${tx}/${ty}: HTTP ${response.status}`)
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
      downloaded++
    }
    const png = await decodePng(new Uint8Array(fs.readFileSync(file)))
    if (png.width !== TILE || png.height !== TILE || png.bitDepth !== 8 || png.channels < 3) throw new Error(`Tile ${file} fora do formato esperado.`)
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const source = (py * TILE + px) * png.channels
        const target = ((ty - y0) * TILE + py) * width + (tx - x0) * TILE + px
        const red = png.data[source], green = png.data[source + 1], blue = png.data[source + 2]
        // Fórmula do Terrarium: altura = R*256 + G + B/256 - 32768.
        const meters = red * 256 + green + blue / 256 - 32768
        mosaic[target] = meters
        // A terra (SRTM) tem valor inteiro; a água foi preenchida com batimetria interpolada (ETOPO1), de valor
        // fracionário. Junto à costa esse preenchimento passa de +20 m: a altura sozinha não separa terra de mar.
        mosaicLand[target] = blue === 0 && meters > 0 ? 1 : 0
      }
    }
  }
}

// ---------- 2. Amostragem na grade da região ----------
const clampX = x => Math.min(width - 1, Math.max(0, x)), clampY = y => Math.min(height - 1, Math.max(0, y))
function sampleMosaic(lat, lon) {
  const fx = (tileX(lon) - x0) * TILE - 0.5, fy = (tileY(lat) - y0) * TILE - 0.5
  const nearest = clampY(Math.round(fy)) * width + clampX(Math.round(fx))
  if (!mosaicLand[nearest]) return 0
  const ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy
  let sum = 0, weight = 0
  for (const [dx, dy, w] of [[0, 0, (1 - ux) * (1 - uy)], [1, 0, ux * (1 - uy)], [0, 1, (1 - ux) * uy], [1, 1, ux * uy]]) {
    const index = clampY(iy + dy) * width + clampX(ix + dx)
    if (mosaicLand[index]) { sum += mosaic[index] * w; weight += w }
  }
  return weight > 0 ? sum / weight : mosaic[nearest]
}
const meters = new Float32Array(size * size) // 0 = água
for (let j = 0; j < size; j++) {
  for (let i = 0; i < size; i++) {
    const { lat, lon } = frame.toGeo(...sampleWorld(i, j))
    meters[j * size + i] = sampleMosaic(lat, lon)
  }
}

// ---------- 3. Limpeza: ilhotas de uma amostra e furos de água pequenos ----------
function components(isMember) {
  const label = new Int32Array(size * size).fill(-1)
  const sizes = []
  const stack = []
  for (let start = 0; start < label.length; start++) {
    if (label[start] >= 0 || !isMember(start)) continue
    let count = 0
    label[start] = sizes.length
    stack.push(start)
    while (stack.length) {
      const index = stack.pop(), x = index % size, y = (index - x) / size
      count++
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
        const next = ny * size + nx
        if (label[next] < 0 && isMember(next)) { label[next] = sizes.length; stack.push(next) }
      }
    }
    sizes.push(count)
  }
  return { label, sizes }
}
const neighbors8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
const landParts = components(index => meters[index] > 0)
let removedSpecks = 0, removedBumps = 0
for (let index = 0; index < meters.length; index++) {
  if (meters[index] > 0 && landParts.sizes[landParts.label[index]] <= 2) { meters[index] = 0; removedSpecks++ }
}
const waterParts = components(index => meters[index] === 0)
let filledHoles = 0
for (let pass = 0; pass < 4; pass++) {
  for (let index = 0; index < meters.length; index++) {
    if (meters[index] !== 0 || waterParts.sizes[waterParts.label[index]] > 6) continue
    const x = index % size, y = (index - x) / size
    let sum = 0, count = 0
    for (const [dx, dy] of neighbors8) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const value = meters[ny * size + nx]
      if (value > 0) { sum += value; count++ }
    }
    if (count) { meters[index] = sum / count; filledHoles++ }
  }
}

// Ponta de uma amostra só, mais de 45 m acima de todas as vizinhas: é ruído do SRTM (havia uma de 99 m na
// beira d'água de Copacabana). Vira a média das vizinhas de terra, ou água se quase tudo em volta é água.
let removedSpikes = 0
for (let y = 1; y < size - 1; y++) {
  for (let x = 1; x < size - 1; x++) {
    const index = y * size + x
    let highest = 0, sum = 0, count = 0
    for (const [dx, dy] of neighbors8) {
      const near = meters[(y + dy) * size + x + dx]
      highest = Math.max(highest, near)
      if (near > 0) { sum += near; count++ }
    }
    if (meters[index] - highest <= 45) continue
    meters[index] = count >= 4 ? sum / count : 0
    removedSpikes++
  }
}

// Um prédio alto isolado vira um "morro" de uma amostra no meio da planície (ou da areia): sai.
if (region.lowland) {
  const { start } = region.lowland
  for (let pass = 0; pass < 2; pass++) {
    const source = meters.slice()
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value = source[y * size + x]
        if (value < start || value > 90) continue
        let total = 0, flat = 0, sum = 0, count = 0
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
            const near = source[ny * size + nx]
            total++
            if (near < start) { flat++; if (near > 0) { sum += near; count++ } }
          }
        }
        if (count && flat / total >= 0.62) { meters[y * size + x] = sum / count; removedBumps++ }
      }
    }
  }
}

// ---------- 4. Picos: o SRTM achata os estreitos; cada um volta à altura real ----------
const report = []
for (const peak of region.peaks ?? []) {
  const [gi, gj] = gridOf(...Object.values(frame.toWorld(peak.lat, peak.lon)))
  const search = Math.ceil((peak.search ?? 350) / cellMeters)
  let top = { value: 0 }
  for (let j = Math.round(gj) - search; j <= Math.round(gj) + search; j++) {
    for (let i = Math.round(gi) - search; i <= Math.round(gi) + search; i++) {
      if (i < 0 || j < 0 || i >= size || j >= size) continue
      if (meters[j * size + i] > top.value) top = { value: meters[j * size + i], i, j }
    }
  }
  if (!top.value) throw new Error(`Pico ${peak.name}: nenhuma terra perto do ponto informado.`)
  const factor = Math.max(1, peak.height / top.value)
  const radius = peak.radius / cellMeters
  for (let j = Math.floor(top.j - radius); j <= Math.ceil(top.j + radius); j++) {
    for (let i = Math.floor(top.i - radius); i <= Math.ceil(top.i + radius); i++) {
      if (i < 0 || j < 0 || i >= size || j >= size) continue
      const t = 1 - Math.hypot(i - top.i, j - top.j) / radius
      if (t > 0) meters[j * size + i] *= 1 + (factor - 1) * t * t * (3 - 2 * t)
    }
  }
  // Topo arredondado (opcional): sem isso um pico estreito vira uma ponta de um vértice só na malha.
  if (peak.cap) {
    const cap = peak.cap / cellMeters
    for (let j = Math.floor(top.j - cap); j <= Math.ceil(top.j + cap); j++) {
      for (let i = Math.floor(top.i - cap); i <= Math.ceil(top.i + cap); i++) {
        const t = Math.hypot(i - top.i, j - top.j) / cap
        if (t < 1 && i >= 0 && j >= 0 && i < size && j < size) meters[j * size + i] = Math.max(meters[j * size + i], peak.height * (1 - 0.25 * t * t))
      }
    }
  }
  report.push(`  ${peak.name}: ${top.value.toFixed(0)} m nos dados, ${peak.height} m reais → fator local ${factor.toFixed(2)} num raio de ${peak.radius} m${peak.cap ? `, topo arredondado em ${peak.cap} m` : ''}`)
}

// ---------- 5. Planícies: alisa o ruído dos prédios, rebaixa e deixa a orla descer até o mar ----------
function distanceToWater() {
  const distance = new Float32Array(size * size)
  for (let index = 0; index < distance.length; index++) distance[index] = meters[index] > 0 ? 1e9 : 0
  const diagonal = Math.SQRT2
  const relax = (x, y, dx, dy, cost) => {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return
    const candidate = distance[ny * size + nx] + cost
    if (candidate < distance[y * size + x]) distance[y * size + x] = candidate
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { relax(x, y, -1, 0, 1); relax(x, y, 0, -1, 1); relax(x, y, -1, -1, diagonal); relax(x, y, 1, -1, diagonal) }
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) { relax(x, y, 1, 0, 1); relax(x, y, 0, 1, 1); relax(x, y, 1, 1, diagonal); relax(x, y, -1, 1, diagonal) }
  return distance
}
const smoothstep = (a, b, value) => { const t = Math.min(1, Math.max(0, (value - a) / (b - a))); return t * t * (3 - 2 * t) }
const low = region.lowland
if (low) {
  const source = meters.slice()
  const shore = distanceToWater()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x, value = source[index]
      if (value <= 0) continue
      const flat = 1 - smoothstep(low.start, low.end, value) // 1 na planície, 0 no morro
      if (flat <= 0) continue
      let sum = 0, count = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || source[ny * size + nx] <= 0) continue
          sum += Math.min(source[ny * size + nx], low.end); count++
        }
      }
      let result = value + (sum / count - value) * flat // média 5x5 só entre planícies
      result *= 1 - (1 - low.keep) * flat
      const cap = low.shoreBase + shore[index] * cellMeters * low.shoreSlope
      if (result > cap) result += (cap - result) * flat
      meters[index] = result
    }
  }
}

// ---------- 6. Arquivo: PNG de 16 bits em tons de cinza ----------
function encodePng(pngWidth, pngHeight, bitDepth, colorType, rows) {
  const pixel = (colorType === 2 ? 3 : 1) * bitDepth / 8, stride = pngWidth * pixel
  const raw = Buffer.alloc((stride + 1) * pngHeight)
  const candidate = Buffer.alloc(stride)
  for (let y = 0; y < pngHeight; y++) {
    let best = Infinity
    for (let filter = 0; filter < 5; filter++) { // o filtro de menor soma de valores absolutos comprime melhor
      let score = 0
      for (let i = 0; i < stride; i++) {
        const left = i >= pixel ? rows[y * stride + i - pixel] : 0, up = y ? rows[(y - 1) * stride + i] : 0
        const corner = y && i >= pixel ? rows[(y - 1) * stride + i - pixel] : 0
        let predicted = 0
        if (filter === 1) predicted = left
        else if (filter === 2) predicted = up
        else if (filter === 3) predicted = (left + up) >> 1
        else if (filter === 4) { const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner); predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner }
        const value = (rows[y * stride + i] - predicted) & 255
        candidate[i] = value
        score += value < 128 ? value : 256 - value
      }
      if (score < best) { best = score; raw[y * (stride + 1)] = filter; candidate.copy(raw, y * (stride + 1) + 1) }
    }
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8)
    out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(pngWidth, 0); header.writeUInt32BE(pngHeight, 4); header[8] = bitDepth; header[9] = colorType
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
const values = new Uint16Array(size * size)
const rows = Buffer.alloc(size * size * 2)
let highest = 0, land = 0
for (let index = 0; index < values.length; index++) {
  const value = meters[index] > 0 ? Math.min(65535, Math.max(1, Math.round(meters[index] / metersPerValue))) : 0
  values[index] = value
  rows.writeUInt16BE(value, index * 2)
  if (value) land++
  if (value > highest) highest = value
}
const heightFile = fileURLToPath(region.heightmap.url)
const png = encodePng(size, size, 16, 0, rows)
fs.writeFileSync(heightFile, png)

// ---------- 7. Conferência dos pontos de controle, no arquivo gravado ----------
const stored = (await decodePng(new Uint8Array(fs.readFileSync(heightFile)))).data
const failures = []
for (const point of region.controlPoints ?? []) {
  const [gi, gj] = gridOf(...Object.values(frame.toWorld(point.lat, point.lon))).map(Math.round)
  const around = (radius) => {
    const found = []
    for (let j = gj - radius; j <= gj + radius; j++) for (let i = gi - radius; i <= gi + radius; i++) if (i >= 0 && j >= 0 && i < size && j < size) found.push(stored[j * size + i] * metersPerValue)
    return found
  }
  let ok = true, detail = ''
  if (point.height) {
    const top = Math.max(...around(Math.ceil(250 / cellMeters)))
    ok = Math.abs(top - point.height) <= point.tolerance
    detail = `${top.toFixed(0)} m (esperado ${point.height} ± ${point.tolerance})`
  }
  else if (point.water) { ok = around(0)[0] === 0; detail = ok ? 'água' : `terra, ${around(0)[0].toFixed(0)} m` }
  else if (point.coast) { const near = around(Math.ceil(150 / cellMeters)); ok = near.includes(0) && near.some(value => value > 0); detail = ok ? 'linha da costa' : 'sem costa a 150 m' }
  report.push(`  ${ok ? '✓' : '✗'} ${point.name}: ${detail}`)
  if (!ok) failures.push(point.name)
}

// ---------- 8. Máscara dos lotes ----------
const maskFile = heightFile.replace(/\.height\.png$/, '.lots.json')
const metersAt = (x, z) => { const [i, j] = gridOf(x, z).map(Math.round); return i < 0 || j < 0 || i >= size || j >= size ? 0 : stored[j * size + i] * metersPerValue }
let mask = fs.existsSync(maskFile) ? JSON.parse(fs.readFileSync(maskFile, 'utf8')) : null
if (maskOption) {
  const [mx0, mz0, columns, lines] = maskOption.includes('=')
    ? maskOption.split('=')[1].split(',').map(Number)
    : [mask.x0, mask.z0, mask.rows[0].length, mask.rows.length]
  const FLAT_MAX = 16 // metros, depois do rebaixamento das planícies: acima disso é morro
  const kind = (c, r) => { // 0 livre, 1 morro, 2 água
    const corners = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([dx, dz]) => metersAt(mx0 + c + dx, mz0 + r + dz))
    if (corners.filter(value => value === 0).length >= 2) return 2
    return Math.max(...corners) > FLAT_MAX || corners.includes(0) ? 1 : 0
  }
  const grid = Array.from({ length: lines }, (_, r) => Array.from({ length: columns }, (_, c) => kind(c, r)))
  const inside = (c, r) => c >= 0 && r >= 0 && c < columns && r < lines
  // Zona jogável: a planície ligada ao lote da origem, sem a moldura da grade.
  const free = Array.from({ length: lines }, () => new Array(columns).fill(false))
  // Começa no lote plano mais próximo da origem do mundo.
  let start = null
  for (let r = 1; r < lines - 1; r++) for (let c = 1; c < columns - 1; c++) {
    const distance = Math.hypot(mx0 + c, mz0 + r)
    if (grid[r][c] === 0 && (!start || distance < start.distance)) start = { c, r, distance }
  }
  if (!start) throw new Error('Nenhum lote plano dentro da grade da máscara.')
  const queue = [[start.c, start.r]]
  free[queue[0][1]][queue[0][0]] = true
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [c, r] = queue[cursor]
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr
      if (nc < 1 || nr < 1 || nc >= columns - 1 || nr >= lines - 1 || free[nr][nc] || grid[nr][nc] !== 0) continue
      free[nr][nc] = true
      queue.push([nc, nr])
    }
  }
  // Tira pontas de um lote de largura: não cabe um prédio nelas.
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 0; r < lines; r++) for (let c = 0; c < columns; c++) {
      if (!free[r][c]) continue
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => inside(c + dc, r + dr) && free[r + dr][c + dc]).length
      if (around <= 1) free[r][c] = false
    }
  }
  const touchesWater = (c, r) => neighbors8.some(([dc, dr]) => inside(c + dc, r + dr) && grid[r + dr][c + dc] === 2)
  mask = {
    legend: { '.': 'livre', '#': 'bloqueado', d: 'decorativo' },
    x0: mx0, z0: mz0,
    rows: free.map((line, r) => line.map((isFree, c) => !isFree ? '#' : touchesWater(c, r) ? 'd' : '.').join('')),
  }
  fs.writeFileSync(maskFile, `${JSON.stringify(mask, null, 2).replace(/\[\s+("[^\]]+")\s+\]/s, (_, body) => `[\n    ${body.split(/,\s+/).join(',\n    ')}\n  ]`)}\n`)
}
const count = symbol => mask.rows.join('').split(symbol).length - 1

// ---------- 9. Imagem de conferência ----------
if (preview) {
  const scale = 2, side = size * scale
  const image = Buffer.alloc(side * side * 3)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = Math.floor(x / scale), j = Math.floor(y / scale)
      const value = stored[j * size + i] * metersPerValue
      const east = stored[j * size + Math.min(size - 1, i + 1)] * metersPerValue, south = stored[Math.min(size - 1, j + 1) * size + i] * metersPerValue
      const shade = Math.min(1.25, Math.max(0.55, 1 + (value - east + value - south) / cellMeters * 0.9))
      let color = value === 0 ? [63, 184, 175] : value < 4 ? [242, 215, 166] : value < 60 ? [123, 198, 126] : value < 350 ? [78, 159, 93] : [169, 169, 184]
      if (value > 0) color = color.map(channel => Math.min(255, channel * shade))
      const [wx, wz] = sampleWorld(i, j)
      const c = Math.round(wx - mask.x0), r = Math.round(wz - mask.z0)
      const symbol = mask.rows[r]?.[c]
      if (symbol && symbol !== '#') color = symbol === 'd' ? [255, 210, 90] : color.map((channel, k) => channel * 0.55 + [255, 244, 224][k] * 0.45)
      else if (symbol === '#' && (x + y) % 4 === 0) color = color.map(channel => channel * 0.7)
      image.set(color, (y * side + x) * 3)
    }
  }
  fs.mkdirSync('.verification', { recursive: true })
  fs.writeFileSync(`.verification/terrain-${id}.png`, encodePng(side, side, 8, 2, image))
}

console.log(`Região ${region.name}`)
console.log(`  Tiles: zoom ${zoom}, ${(x1 - x0 + 1) * (y1 - y0 + 1)} (${downloaded} baixados agora, o resto do cache em ${path.relative('.', CACHE)}/)`)
console.log(`  Grade: ${size} × ${size} amostras de ${cellMeters} m (${(size - 1) * cellMeters / 1000} km de lado), ${(land / values.length * 100).toFixed(1)}% de terra, ponto mais alto ${(highest * metersPerValue).toFixed(0)} m`)
console.log(`  Limpeza: ${removedSpecks} amostras de terra soltas no mar removidas, ${filledHoles} furos de água pequenos fechados, ${removedSpikes} pontas de uma amostra removidas, ${removedBumps} calombos de prédio na planície aplainados`)
console.log(`  Arquivo: ${path.relative('.', heightFile)} (${(png.length / 1024).toFixed(0)} KB)`)
console.log(`  Máscara: ${path.relative('.', maskFile)}, ${mask.rows[0].length} × ${mask.rows.length} lotes: ${count('.')} livres, ${count('d')} decorativos, ${count('#')} bloqueados${maskOption ? ' (recriada agora)' : ''}`)
console.log(report.join('\n'))
if (preview) console.log(`  Imagem de conferência: .verification/terrain-${id}.png`)
if (failures.length) {
  console.error(`Pontos de controle fora do esperado: ${failures.join(', ')}`)
  process.exit(1)
}
