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
