// Reduz um GLB do Tripo (uma malha, uma textura) para o orçamento da cidade e o grava na pasta pública.
// Uso: node tools/optimize-city-models.mjs <entrada.glb> <saida.glb> [--tris 9000] [--texture 1024] [--quality 80]
// Sem baixar nada da internet: o redutor é o de tools/lib/simplify-textured.mjs e a textura vai para WebP pelo
// `sharp`, que já vem instalado com o wrangler (devDependency). O GLB sai sem normais (o material de faces planas
// as calcula) e sem compressão de malha, então o carregador da cidade não precisa de decodificador.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { simplifyTextured } from './lib/simplify-textured.mjs'

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }

export function readGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um GLB')
  const jsonLength = buffer.readUInt32LE(12)
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))
  const binStart = 20 + jsonLength + 8
  return { json, bin: buffer.length > binStart ? buffer.subarray(binStart) : Buffer.alloc(0) }
}

function readAccessor({ json, bin }, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView]
  const Type = ARRAYS[accessor.componentType]
  if (!Type || accessor.normalized) throw new Error(`acessor ${index}: tipo ${accessor.componentType} não suportado`)
  const size = COMPONENTS[accessor.type]
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
  const stride = view.byteStride || size * Type.BYTES_PER_ELEMENT
  const out = new Type(accessor.count * size)
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const getters = { 5121: 'getUint8', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < size; c++) out[i * size + c] = data[getters[accessor.componentType]](start + i * stride + c * Type.BYTES_PER_ELEMENT, true)
  }
  return out
}

const pad4 = buffer => (buffer.length % 4 ? Buffer.concat([buffer, Buffer.alloc(4 - (buffer.length % 4))]) : buffer)

/** Monta um GLB de uma malha com uma textura WebP. `material` mantém os campos do material original. */
export function buildGlb({ positions, uvs, indices, webp, material = {}, name = 'predio' }) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], positions[i + c]); max[c] = Math.max(max[c], positions[i + c]) }
  const chunks = [pad4(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength)), pad4(Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength)), pad4(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)), pad4(webp)]
  const offsets = []
  let cursor = 0
  for (const chunk of chunks) { offsets.push(cursor); cursor += chunk.length }
  const bin = Buffer.concat(chunks)
  const lengths = [positions.byteLength, uvs.byteLength, indices.byteLength, webp.length]
  const json = {
    asset: { version: '2.0', generator: 'cityou tools/optimize-city-models.mjs' },
    extensionsUsed: ['EXT_texture_webp'], extensionsRequired: ['EXT_texture_webp'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ ...material, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
    textures: [{ extensions: { EXT_texture_webp: { source: 0 } } }],
    images: [{ bufferView: 3, mimeType: 'image/webp' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: 2, componentType: indices instanceof Uint32Array ? 5125 : 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: lengths[0], target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: lengths[1], target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: lengths[2], target: 34963 },
      { buffer: 0, byteOffset: offsets[3], byteLength: lengths[3] },
    ],
    buffers: [{ byteLength: bin.length }],
  }
  let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
  if (jsonBuffer.length % 4) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(4 - (jsonBuffer.length % 4), 0x20)])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + bin.length, 8)
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBuffer.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, bin])
}

export async function optimizeCityModel(input, { tris = 9000, texture = 1024, quality = 80 } = {}) {
  const glb = readGlb(input)
  const { json } = glb
  if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error('o GLB deve ter uma malha de uma só parte')
  const primitive = json.meshes[0].primitives[0]
  const positions = readAccessor(glb, primitive.attributes.POSITION)
  const uvs = readAccessor(glb, primitive.attributes.TEXCOORD_0)
  const indices = readAccessor(glb, primitive.indices)
  const material = json.materials?.[0] ?? {}
  const image = json.images?.[0]
  if (!image || image.bufferView === undefined) throw new Error('o GLB não tem textura embutida')
  const view = json.bufferViews[image.bufferView]
  const source = glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)

  const reduced = simplifyTextured(positions, uvs, indices, { targetTriangles: tris })
  const sharp = createRequire(import.meta.url)('sharp')
  const webp = await sharp(source).resize(texture, texture, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer()
  const keep = {}
  if (material.doubleSided) keep.doubleSided = true
  if (material.alphaMode) { keep.alphaMode = material.alphaMode; if (material.alphaCutoff !== undefined) keep.alphaCutoff = material.alphaCutoff }
  const output = buildGlb({ positions: reduced.positions, uvs: reduced.uvs, indices: reduced.indices, webp, material: keep, name: json.nodes?.[0]?.name || 'predio' })
  return { output, stats: { ...reduced.stats, textureBytes: webp.length, inputTriangles: indices.length / 3 } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2)
  const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args.splice(i, 2)[1]) : fallback }
  const tris = flag('tris', 9000), texture = flag('texture', 1024), quality = flag('quality', 80)
  const [inFile, outFile] = args
  if (!inFile || !outFile) { console.error('Uso: node tools/optimize-city-models.mjs <entrada.glb> <saida.glb> [--tris 9000] [--texture 1024] [--quality 80]'); process.exit(2) }
  const started = performance.now()
  const { output, stats } = await optimizeCityModel(fs.readFileSync(inFile), { tris, texture, quality })
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
  fs.writeFileSync(outFile, output)
  const kb = n => Math.round(n / 1024)
  console.log(`${path.basename(inFile)}: ${stats.inputTriangles} → ${stats.after} triângulos (${stats.vertices} vértices, ${stats.rejected} colapsos recusados), ${kb(fs.statSync(inFile).size)} KB → ${kb(output.length)} KB (textura ${kb(stats.textureBytes)} KB), ${((performance.now() - started) / 1000).toFixed(1)} s`)
}
