// Mede, em cada GLB da cidade (Rio e ilha), a espessura da base redonda que o Tripo põe no pé do prédio, e compara com
// `MODEL_BASES` (shared/game/city-layout.js), que a cidade usa para enterrar essa base no terreno. A base é o disco de
// calçadão: o topo dele é o maior plano virado para cima perto do chão. Serve para medir um modelo novo; confira a olho
// o resultado com o modelo enterrado (a medida erra em modelos sem disco liso, como árvores e barcos).
//   node tools/model-bases.mjs
import fs from 'node:fs'
import path from 'node:path'
import { readGlb } from './optimize-city-models.mjs'
import { MODEL_BASES } from '../shared/game/city-layout.js'

function accessor({ json, bin }, index) {
  const a = json.accessors[index], v = json.bufferViews[a.bufferView]
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type]
  const Type = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType]
  const start = (v.byteOffset || 0) + (a.byteOffset || 0)
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const read = Type === Float32Array ? i => view.getFloat32(start + i * 4, true) : Type === Uint16Array ? i => view.getUint16(start + i * 2, true) : i => view.getUint32(start + i * 4, true)
  return Array.from({ length: a.count * components }, (_, i) => read(i))
}

/** Altura (na unidade do modelo, de 0 a ~1) do maior plano virado para cima entre 0,015 e 0,25 acima do pé. */
export function measureBase(buffer) {
  const glb = readGlb(buffer)
  const primitive = glb.json.meshes[0].primitives[0]
  const position = accessor(glb, primitive.attributes.POSITION), index = accessor(glb, primitive.indices)
  let minY = Infinity
  for (let i = 1; i < position.length; i += 3) minY = Math.min(minY, position[i])
  const area = new Map()
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3]
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2]
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz)
    if (length < 1e-9 || ny / length < 0.9) continue
    const y = (position[a + 1] + position[b + 1] + position[c + 1]) / 3 - minY
    if (y < 0.015 || y > 0.25) continue
    const key = Math.round(y / 0.005) * 0.005
    area.set(key, (area.get(key) ?? 0) + length / 2)
  }
  const best = [...area.entries()].sort((x, y) => y[1] - x[1])[0]
  return best ? Number((best[0] + 0.008).toFixed(3)) : null
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  for (const dir of ['rio', 'island']) {
    const folder = path.resolve('public-fifones/models', dir)
    for (const file of fs.readdirSync(folder).filter(name => name.endsWith('.glb')).sort()) {
      const id = file.replace('.glb', '')
      const measured = measureBase(fs.readFileSync(path.join(folder, file)))
      console.log(id.padEnd(26), 'medido', String(measured).padEnd(6), 'catálogo', MODEL_BASES[id] ?? '— (falta)')
    }
  }
}
