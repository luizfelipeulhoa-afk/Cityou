import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import zlib from 'node:zlib'
import { decodePng } from '../src/terrain/png.js'
import { createFrame } from '../src/terrain/frame.js'
import rio from '../src/terrain/regions/rio.js'

// PNG mínimo, sem filtro, para conferir o leitor sem depender do arquivo da região.
function png(width, height, bitDepth, colorType, rows) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8)
    out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = bitDepth; header[9] = colorType
  const stride = rows.length / height
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) rows.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

const heights = await decodePng(new Uint8Array(fs.readFileSync(rio.heightmap.url)))
const { size, spacing, center, metersPerValue } = rio.heightmap
const frame = createFrame(rio)
const sampleAt = (lat, lon) => {
  const { x, z } = frame.toWorld(lat, lon)
  return [Math.round((x - center[0]) / spacing + (size - 1) / 2), Math.round((z - center[1]) / spacing + (size - 1) / 2)]
}
const metersAround = (lat, lon, radiusMeters) => {
  const [i, j] = sampleAt(lat, lon), radius = Math.ceil(radiusMeters / (spacing * rio.metersPerUnit))
  const found = []
  for (let y = j - radius; y <= j + radius; y++) for (let x = i - radius; x <= i + radius; x++) found.push(heights.data[y * size + x] * metersPerValue)
  return found
}

test('png: lê tons de cinza de 16 bits e RGB de 8 bits', async () => {
  const gray = await decodePng(png(2, 2, 16, 0, Buffer.from([0, 0, 0x12, 0x34, 0xff, 0xff, 0x4e, 0x20])))
  assert.deepEqual([gray.width, gray.height, gray.bitDepth, gray.channels], [2, 2, 16, 1])
  assert.deepEqual([...gray.data], [0, 0x1234, 0xffff, 20000])
  const color = await decodePng(png(1, 2, 8, 2, Buffer.from([1, 2, 3, 250, 251, 252])))
  assert.deepEqual([...color.data], [1, 2, 3, 250, 251, 252])
  await assert.rejects(decodePng(new Uint8Array(16)), /não é um PNG/)
})

test('frame: ida e volta entre latitude/longitude e o mundo, com o fundo do mapa no rumo da região', () => {
  const origin = frame.toWorld(rio.origin.lat, rio.origin.lon)
  assert.ok(Math.abs(origin.x) < 1e-9 && Math.abs(origin.z) < 1e-9)
  const back = frame.toGeo(12.5, -40)
  const again = frame.toWorld(back.lat, back.lon)
  assert.ok(Math.abs(again.x - 12.5) < 1e-6 && Math.abs(again.z + 40) < 1e-6)
  // Um ponto 1 km a noroeste da origem fica atrás dela (−Z), sem desvio lateral.
  const northwest = frame.toWorld(rio.origin.lat + 707.1 / 110743.6, rio.origin.lon - 707.1 / 102547.7)
  assert.ok(Math.abs(northwest.x) < 0.01, `x = ${northwest.x}`)
  assert.ok(Math.abs(northwest.z + 1000 / rio.metersPerUnit) < 0.01, `z = ${northwest.z}`)
})

test('rio: o mapa de alturas tem o formato da região e os pontos de controle batem', () => {
  assert.deepEqual([heights.width, heights.height, heights.bitDepth, heights.channels], [size, size, 16, 1])
  assert.equal(Math.log2(size - 1) % 1, 0, 'o lado precisa ser 2^n + 1')
  for (const point of rio.controlPoints) {
    if (point.height) {
      const top = Math.max(...metersAround(point.lat, point.lon, 250))
      assert.ok(Math.abs(top - point.height) <= point.tolerance, `${point.name}: ${top} m, esperado ${point.height} ± ${point.tolerance}`)
    }
    else if (point.water) assert.equal(metersAround(point.lat, point.lon, 0)[0], 0, `${point.name} deveria ser água`)
    else if (point.coast) {
      const near = metersAround(point.lat, point.lon, 150)
      assert.ok(near.includes(0) && near.some(value => value > 0), `${point.name} deveria estar na linha da costa`)
    }
  }
  // Os dois picos ficam onde a geografia manda: o Corcovado atrás (noroeste), o Pão de Açúcar à direita (nordeste).
  const corcovado = frame.toWorld(-22.9516, -43.2122), sugarloaf = frame.toWorld(-22.9494, -43.1558)
  assert.ok(corcovado.z < -60 && Math.abs(corcovado.x) < 20, JSON.stringify(corcovado))
  assert.ok(sugarloaf.x > 60 && Math.abs(sugarloaf.z) < 15, JSON.stringify(sugarloaf))
})

test('rio: a máscara dos lotes é uma grade regular e só usa os símbolos da legenda', () => {
  const { rows, legend, x0, z0 } = rio.lots
  assert.ok(Number.isInteger(x0) && Number.isInteger(z0))
  assert.ok(rows.length > 0 && rows.every(row => row.length === rows[0].length))
  const symbols = new Set(Object.keys(legend))
  assert.deepEqual([...symbols].sort(), ['#', '.', 'd'])
  assert.ok(rows.every(row => [...row].every(symbol => symbols.has(symbol))))
  // As bordas da grade ficam bloqueadas.
  assert.ok([...rows[0], ...rows.at(-1)].every(symbol => symbol === '#'))
  assert.ok(rows.every(row => row[0] === '#' && row.at(-1) === '#'))
})

// ---------- Lotes ----------
const { createLots } = await import('../src/terrain/lots.js')

test('lotes: tipo, construção, encaixe e áreas bloqueadas vêm da máscara', () => {
  const rows = ['######', '#...d#', '#..#.#', '#....#', '######']
  const lots = createLots({ x0: -2, z0: -2, rows })
  assert.equal(lots.kindAt({ x: -1, z: -1 }), 'free')
  assert.equal(lots.kindAt({ x: 2, z: -1 }), 'decorative')
  assert.equal(lots.kindAt({ x: 1, z: 0 }), 'blocked')
  assert.equal(lots.kindAt({ x: 40, z: 40 }), 'blocked', 'fora da grade é bloqueado')
  assert.equal(lots.isBuildable({ x: -1, z: -1 }), true)
  assert.equal(lots.isBuildable({ x: 2, z: -1 }), false, 'decorativo não recebe prédio')
  assert.equal(lots.isBuildable({ x: 1, z: 0 }), false, 'bloqueado recusa')
  assert.equal(lots.isBuildable({ x: -1, z: -1 }, 2), true, 'área 2×2 toda livre')
  assert.equal(lots.isBuildable({ x: 0, z: -1 }, 2), false, 'área 2×2 que pega um lote bloqueado')
  assert.equal(lots.isBuildable({ x: 0.5, z: 0 }), false)
  assert.deepEqual(lots.snapToLot({ x: 0.4, z: -0.6 }), { x: 0, z: -1 })
  assert.deepEqual(lots.snapToLot({ x: -0.5, z: -0.5 }, 2), { x: -1, z: -1 })
  assert.deepEqual(lots.footprintCenter({ x: -1, z: -1 }, 2), { x: -0.5, z: -0.5 })
  assert.deepEqual(lots.bounds, { minX: -1.5, maxX: 2.5, minZ: -1.5, maxZ: 1.5 })
  // Os retângulos cobrem cada lote bloqueado exatamente uma vez.
  const covered = new Map()
  for (const area of lots.getBlockedAreas()) {
    for (let dz = 0; dz < area.depth; dz++) for (let dx = 0; dx < area.width; dx++) {
      const key = `${area.x + dx},${area.z + dz}`
      covered.set(key, (covered.get(key) ?? 0) + 1)
    }
  }
  const blocked = rows.flatMap((row, r) => [...row].flatMap((symbol, c) => (symbol === '#' ? [`${c - 2},${r - 2}`] : [])))
  assert.deepEqual([...covered.keys()].sort(), blocked.sort())
  assert.ok([...covered.values()].every(times => times === 1))
  // O alvo da câmera volta para a zona jogável.
  assert.deepEqual(lots.clampToPlayable(0.2, -0.7), { x: 0.2, z: -0.7 })
  for (const [x, z] of [[1, 0], [30, 30], [-9, 0.3], [0, -8]]) {
    const point = lots.clampToPlayable(x, z)
    const inside = lots.playable.some(lot => Math.abs(point.x - lot.x) <= 0.5 && Math.abs(point.z - lot.z) <= 0.5)
    assert.ok(inside, `(${x}, ${z}) → (${point.x}, ${point.z}) deveria cair num lote jogável`)
  }
})

// ---------- Malha ----------
const { computeErrors, countTriangles, forEachTriangle, locateTriangle } = await import('../src/terrain/rtin.js')

test('malha: sem frestas para qualquer limite, com os vértices forçados e a localização de pontos', () => {
  const side = 33, last = side - 1
  let seed = 12345
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const heights = Float32Array.from({ length: side * side }, (_, index) => Math.sin(index % side / 3) * 2 + random() * 3)
  const forced = 9 * side + 22
  const errors = computeErrors(side, (index, x, y, a, b) => (index === forced ? Infinity : Math.abs(heights[index] - (heights[a] + heights[b]) / 2)))
  assert.throws(() => computeErrors(30, () => 0), /2\^n \+ 1/)
  assert.equal(countTriangles(errors, side, -1), 2 * last * last, 'limite abaixo de zero dá a grade inteira')
  for (const threshold of [-1, 0.4, 1.5, 4, 1e9]) {
    const edges = new Map(), vertices = new Set(), triangles = new Set()
    let area = 0
    forEachTriangle(errors, side, threshold, (ax, ay, bx, by, cx, cy) => {
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      assert.ok(cross < 0, 'a face olha para cima')
      area += -cross / 2
      const ids = [ay * side + ax, by * side + bx, cy * side + cx]
      ids.forEach(id => vertices.add(id))
      triangles.add([ax, ay, bx, by, cx, cy].join())
      for (let k = 0; k < 3; k++) {
        const key = [ids[k], ids[(k + 1) % 3]].sort((p, q) => p - q).join('-')
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    })
    assert.equal(area, last * last, `limite ${threshold}: a malha cobre a grade inteira`)
    assert.ok(vertices.has(forced), `limite ${threshold}: o vértice forçado está na malha`)
    for (const [key, times] of edges) {
      const [p, q] = key.split('-').map(Number)
      const onBorder = (p % side === 0 && q % side === 0) || (p % side === last && q % side === last) || (p < side && q < side) || (p >= last * side && q >= last * side)
      assert.equal(times, onBorder ? 1 : 2, `limite ${threshold}: aresta ${key} aparece ${times} vez(es)`)
    }
    for (let n = 0; n < 200; n++) {
      const gx = random() * last, gy = random() * last
      const [ax, ay, bx, by, cx, cy] = locateTriangle(errors, side, threshold, gx, gy)
      assert.ok(triangles.has([ax, ay, bx, by, cx, cy].join()), 'o triângulo localizado é um dos da malha')
      const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      const wa = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / determinant, wb = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / determinant
      assert.ok(wa >= -1e-9 && wb >= -1e-9 && wa + wb <= 1 + 1e-9, 'o ponto está dentro do triângulo localizado')
    }
  }
})

// ---------- Terreno do Rio ----------
const { createTerrainData } = await import('../src/terrain/terrainData.js')
const terrain = createTerrainData(rio, heights.data)

test('rio: a malha cabe no orçamento e o platô é exatamente plano sob todos os lotes jogáveis', () => {
  assert.ok(terrain.triangles <= 60000, `${terrain.triangles} triângulos`)
  assert.equal(terrain.positions.length, terrain.triangles * 9)
  assert.equal(terrain.colors.length, terrain.triangles * 9)
  const perLot = new Map()
  for (let t = 0; t < terrain.triangles; t++) {
    const p = terrain.positions.subarray(t * 9, t * 9 + 9)
    const lot = { x: Math.round((p[0] + p[3] + p[6]) / 3), z: Math.round((p[2] + p[5] + p[8]) / 3) }
    if (terrain.lots.kindAt(lot) === 'blocked') continue
    assert.ok(p[1] === 0 && p[4] === 0 && p[7] === 0, `lote (${lot.x}, ${lot.z}): triângulo fora de y = 0`)
    const key = `${lot.x},${lot.z}`
    perLot.set(key, (perLot.get(key) ?? 0) + 1)
  }
  assert.equal(perLot.size, terrain.lots.playable.length)
  assert.ok([...perLot.values()].every(times => times === 2), 'cada lote jogável é coberto por dois triângulos só dele')
  for (const lot of terrain.lots.playable) {
    for (const [dx, dz] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.31, -0.2]]) {
      assert.equal(terrain.getHeightAt(lot.x + dx, lot.z + dz), 0, `lote (${lot.x}, ${lot.z}) em (${dx}, ${dz})`)
    }
  }
})

test('rio: getHeightAt devolve a altura da malha desenhada, o mar fica no nível do mar e os marcos estão de pé', () => {
  let seed = 99
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const points = Array.from({ length: 300 }, () => [-70 + random() * 150, -90 + random() * 130])
  const found = new Array(points.length).fill(null)
  for (let t = 0; t < terrain.triangles - 8; t++) { // os oito últimos são o mar além da grade
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = terrain.positions.subarray(t * 9, t * 9 + 9)
    const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz)
    points.forEach(([x, z], n) => {
      if (found[n] !== null || x < minX || x > maxX || z < minZ || z > maxZ) return
      const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
      const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / determinant, wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / determinant
      if (wa >= -1e-7 && wb >= -1e-7 && wa + wb <= 1 + 1e-7) found[n] = wa * ay + wb * by + (1 - wa - wb) * cy
    })
  }
  points.forEach(([x, z], n) => {
    assert.notEqual(found[n], null, `nenhum triângulo cobre (${x}, ${z})`)
    assert.ok(Math.abs(terrain.getHeightAt(x, z) - found[n]) < 1e-4, `(${x}, ${z}): ${terrain.getHeightAt(x, z)} na consulta, ${found[n]} na malha`)
  })
  assert.equal(terrain.seaY, -0.4)
  assert.ok(Math.abs(terrain.getHeightAt(0, 60) - terrain.seaY) < 1e-6, 'mar aberto em frente à praia')
  assert.equal(terrain.getHeightAt(9999, 0), terrain.seaY, 'fora da grade')
  const top = (lat, lon) => {
    const { x, z } = terrain.frame.toWorld(lat, lon)
    let best = -Infinity
    for (let dx = -6; dx <= 6; dx += 0.5) for (let dz = -6; dz <= 6; dz += 0.5) best = Math.max(best, terrain.getHeightAt(x + dx, z + dz))
    return best
  }
  const unitsPerMeter = rio.exaggeration / rio.metersPerUnit
  assert.ok(Math.abs(top(-22.9494, -43.1558) - (396 * unitsPerMeter + terrain.seaY)) < 0.6, `Pão de Açúcar: ${top(-22.9494, -43.1558)}`)
  assert.ok(Math.abs(top(-22.9516, -43.2122) - (710 * unitsPerMeter + terrain.seaY)) < 0.8, `Corcovado: ${top(-22.9516, -43.2122)}`)
})

test('rio: a API do terreno responde pela máscara', () => {
  const free = terrain.lots.playable.find(lot => terrain.lots.kindAt(lot) === 'free')
  const decorative = terrain.lots.playable.find(lot => terrain.lots.kindAt(lot) === 'decorative')
  assert.equal(terrain.isBuildable(free), true)
  assert.equal(terrain.isBuildable(decorative), false)
  assert.equal(terrain.isBuildable({ x: rio.lots.x0, z: rio.lots.z0 }), false, 'a borda da grade é bloqueada')
  assert.equal(terrain.isBuildable({ x: 0, z: 60 }), false, 'o mar é bloqueado')
  assert.deepEqual(terrain.snapToLot({ x: free.x + 0.3, z: free.z - 0.4 }), free)
  const blocked = terrain.getBlockedAreas().reduce((sum, area) => sum + area.width * area.depth, 0)
  assert.equal(blocked, rio.lots.rows.join('').split('#').length - 1)
})

// ---------- Cenário da cidade ----------
import cidade, { CITY_SHIFT, CRISTO_SITE, SUGARLOAF } from '../src/terrain/regions/rio-cidade.js'
import { getCityLayout, HILL_STEP, tileHeight, tileKey } from '../shared/game/city-layout.js'

test('cidade: plano sob os lotes construíveis, relevo na encosta protegida, calçadão plano na orla e o morro do Cristo', () => {
  const layout = getCityLayout('cristo-redentor')
  const originalHeights = heights.data.slice()
  const scenery = createTerrainData(cidade, heights.data)
  assert.deepEqual(heights.data, originalHeights, 'o recorte não altera o mapa de alturas de origem')
  assert.ok(scenery.triangles <= cidade.detail.maxTriangles, `${scenery.triangles} triângulos`)
  const water = new Set(layout.waterTiles.map(([x, y]) => tileKey(x, y)))
  const slope = new Set(layout.slopeTiles.map(([x, y]) => tileKey(x, y)))
  let land = 0, beach = 0
  for (let ty = layout.min; ty <= layout.max; ty++) {
    for (let tx = layout.min; tx <= layout.max; tx++) {
      // Lote da cidade (tx − 8, ty − 8); no terreno, z anda CITY_SHIFT.
      const x = tx - layout.center, z = ty - layout.center - CITY_SHIFT
      const kind = scenery.lots.kindAt({ x, z })
      if (slope.has(tileKey(tx, ty))) { assert.equal(kind, 'blocked', `encosta (${tx}, ${ty})`); continue }
      if (water.has(tileKey(tx, ty))) {
        // Toda a água dentro da grade é plana e só decorativa: calçadão e areia, sem relevo no meio (13/11/2026).
        assert.equal(kind, 'decorative', `água (${tx}, ${ty})`)
        beach++
        assert.equal(scenery.getHeightAt(x, z), 0)
        continue
      }
      land++
      assert.equal(kind, 'free', `tile (${tx}, ${ty})`)
      // No morro da comunidade o chão sobe com o patamar (um tico abaixo do topo desenhado): nada de vala (16/11/2026).
      const lift = tileHeight('cristo-redentor', tx, ty)
      if (lift) {
        const y = scenery.getHeightAt(x, z)
        assert.ok(y >= lift - HILL_STEP - 0.05 && y <= lift, `patamar (${tx}, ${ty}): ${y}`)
        continue
      }
      for (const [dx, dz] of [[0, 0], [-0.5, -0.5], [0.5, 0.5]]) assert.equal(scenery.getHeightAt(x + dx, z + dz), 0)
    }
  }
  assert.ok(land > 700)
  assert.ok(beach >= (layout.max - layout.min + 1) * 2, `${beach} lotes de praia`)
  assert.equal(scenery.lots.playable.length, land + beach)
  // A montanha do Cristo fica bem acima do platô (16/11/2026: o Cristo está no pico da esquerda).
  assert.ok(scenery.getHeightAt(CRISTO_SITE.x, CRISTO_SITE.z - CITY_SHIFT) > 5.5)
})

test('cidade: as montanhas atrás da grade ficam na altura da base de construção, menos Cristo, Pão e Urca (16/11/2026)', () => {
  const scenery = createTerrainData(cidade, heights.data)
  const tall = createTerrainData({ ...cidade, soften: undefined }, heights.data)
  const { cap, edge, blend, keep } = cidade.soften
  const near = (x, z, list) => list.some(c => Math.hypot(x - c.x, z - c.z) < c.radius + (c.blend ?? 3))
  const blocks = cidade.transplant.map(b => ({ x: b.to.x, z: b.to.z, radius: b.radius + b.blend, blend: 3 }))
  let lowered = 0
  for (let x = -60; x <= 40; x += 2) for (let z = edge - blend - 2; z >= -110; z -= 2) {
    if (near(x, z, keep) || near(x, z, blocks)) continue
    const h = scenery.getHeightAt(x, z)
    assert.ok(h <= cap + 0.15, `(${x}, ${z}) ainda tem ${h.toFixed(1)} de altura`)
    if (tall.getHeightAt(x, z) > cap + 1) lowered++
  }
  assert.ok(lowered > 50, `o teste precisa de montanhas rebaixadas (achou ${lowered})`)
  // Na frente da linha (a grade e o que fica diante dos patamares), nada muda.
  for (const [x, z] of [[-14, -2], [0, 0], [10, 5], [20, -4]]) assert.equal(scenery.getHeightAt(x, z), tall.getHeightAt(x, z))
})

test('cidade: o Pão de Açúcar e a Urca sobem atrás dos patamares da direita e o resto do relevo fica igual (16/11/2026)', () => {
  const scenery = createTerrainData(cidade, heights.data)
  const without = createTerrainData({ ...cidade, transplant: [] }, heights.data)
  const top = scenery.getHeightAt(SUGARLOAF.x, SUGARLOAF.z)
  // 396 m × 1,6 / 50 m por unidade ≈ 12,7 acima do mar (−0,4); a malha simplifica um pouco o topo.
  assert.ok(top > 5.5, `topo do Pão de Açúcar: ${top}`)
  assert.ok(top > without.getHeightAt(SUGARLOAF.x, SUGARLOAF.z) + 2, 'é o bloco transplantado que sobe ali')
  // Longe do bloco (raio + borda + mistura do platô), a altura não muda.
  const { size, spacing, originX, originZ } = scenery.grid
  const hill = getCityLayout('cristo-redentor').hillTiles.map(([tx, ty]) => [tx - 8, ty - 8 - CITY_SHIFT])
  const nearHill = (x, z) => hill.some(([hx, hz]) => Math.abs(x - hx) < 4 && Math.abs(z - hz) < 4)
  let far = 0
  for (let j = 0; j < size; j += 3) for (let i = 0; i < size; i += 3) {
    const x = originX + i * spacing, z = originZ + j * spacing
    if (cidade.transplant.some(block => Math.hypot(x - block.to.x, z - block.to.z) < block.radius + block.blend + 6) || cidade.squash.some(c => Math.hypot(x - c.x, z - c.z) < c.radius + c.blend + 1) || nearHill(x, z)) continue
    assert.ok(Math.abs(scenery.grid.heights[j * size + i] - without.grid.heights[j * size + i]) < 1e-5, `(${x}, ${z})`)
    far++
  }
  assert.ok(far > 1000)
})

test('cidade: o corte do relevo distante não decapita o maciço atrás do Cristo (13/11/2026)', () => {
  // Teste só do corte: sem o rebaixamento das montanhas de trás (16/11/2026), que achata o maciço de propósito.
  const scenery = createTerrainData({ ...cidade, soften: undefined }, heights.data)
  const uncut = createTerrainData({ ...cidade, crop: undefined, soften: undefined }, heights.data)
  // Sem `crop.keep`, o círculo do corte (raio ~33 + 14 de mistura em volta da grade e do morro) zerava tudo a partir de ~47
  // unidades do centro, e a montanha aparecia cortada no meio. Onde o terreno completo tem montanha (altura >= 8), o da
  // cidade tem de ter a mesma montanha.
  let mountain = 0
  for (let x = -60; x <= 0; x += 10) {
    for (let z = -50; z >= -110; z -= 10) {
      const full = uncut.getHeightAt(x, z)
      if (full < 8) continue
      mountain++
      const h = scenery.getHeightAt(x, z)
      assert.ok(h >= full - 1.5, `maciço em (${x}, ${z}): completo ${full.toFixed(1)}, da cidade ${h.toFixed(1)}`)
    }
  }
  assert.ok(mountain >= 8, `o teste precisa de pontos de montanha (achou ${mountain})`)
  // O que o corte tira de propósito (praia e morros reais distantes a leste e ao sul) continua removido.
  for (const [x, z] of [[66, 6], [66, -72], [-20, 120]]) {
    const h = scenery.getHeightAt(x, z)
    assert.ok(h <= 0.5, `fora do corte em (${x}, ${z}) tem altura ${h.toFixed(1)}, esperado mar`)
  }
  // A malha segue leve: com a montanha de volta, o terreno da cidade fica longe dos 60 mil de rio.js.
  assert.ok(scenery.triangles <= cidade.detail.maxTriangles)
  assert.ok(cidade.detail.maxTriangles <= 20000, 'o terreno da cidade não deve voltar a ser pesado')
})
