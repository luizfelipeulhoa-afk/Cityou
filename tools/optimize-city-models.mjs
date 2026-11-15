// Reduz um GLB do Tripo (uma textura de cor) para o orçamento da cidade e o grava na pasta pública.
// Aceita uma ou várias malhas (por exemplo o prédio e a placa do prédio), desde que todas usem a mesma textura de cor:
// o orçamento de triângulos é dividido entre as malhas na proporção dos triângulos de cada uma, e o GLB sai com uma
// textura WebP só. Uma malha só sai igual a antes da generalização.
// Uso: node tools/optimize-city-models.mjs <entrada.glb> <saida.glb> [--tris 9000] [--texture 1024] [--quality 80]
//        [--flip-limit 0.2] [--allow-uv-flip]
// `--flip-limit` (padrão 0,2) é o cosseno mínimo entre a normal de um triângulo antes e depois de um colapso: valores
// menores deixam colapsar mais em quinas (a forma pode ficar mais arredondada). `--allow-uv-flip` deixa de recusar
// colapsos que viram o triângulo no espaço da textura. Os dois padrões são os de sempre.
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

/**
 * Monta um GLB com uma ou mais malhas que dividem uma textura WebP e um material. `material` mantém os campos do
 * material original. Passe `parts` (lista de { positions, uvs, indices, name }) ou, para uma malha só, os campos soltos.
 */
export function buildGlb({ parts, positions, uvs, indices, webp, material = {}, name = 'predio' }) {
  parts = parts || [{ positions, uvs, indices, name }]
  const chunks = [], lengths = [], accessors = [], bufferViews = []
  const meshes = [], nodes = []
  parts.forEach((part, k) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < part.positions.length; i += 3) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], part.positions[i + c]); max[c] = Math.max(max[c], part.positions[i + c]) }
    for (const array of [part.positions, part.uvs, part.indices]) { chunks.push(pad4(Buffer.from(array.buffer, array.byteOffset, array.byteLength))); lengths.push(array.byteLength) }
    accessors.push(
      { bufferView: k * 3, componentType: 5126, count: part.positions.length / 3, type: 'VEC3', min, max },
      { bufferView: k * 3 + 1, componentType: 5126, count: part.uvs.length / 2, type: 'VEC2' },
      { bufferView: k * 3 + 2, componentType: part.indices instanceof Uint32Array ? 5125 : 5123, count: part.indices.length, type: 'SCALAR' },
    )
    meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: k * 3, TEXCOORD_0: k * 3 + 1 }, indices: k * 3 + 2, material: 0 }] })
    nodes.push({ mesh: k, name: part.name })
  })
  chunks.push(pad4(webp)); lengths.push(webp.length)
  const imageView = parts.length * 3
  const offsets = []
  let cursor = 0
  for (const chunk of chunks) { offsets.push(cursor); cursor += chunk.length }
  const bin = Buffer.concat(chunks)
  for (let i = 0; i < chunks.length; i++) bufferViews.push({ buffer: 0, byteOffset: offsets[i], byteLength: lengths[i], ...(i < imageView ? { target: i % 3 === 2 ? 34963 : 34962 } : {}) })
  const json = {
    asset: { version: '2.0', generator: 'cityou tools/optimize-city-models.mjs' },
    extensionsUsed: ['EXT_texture_webp'], extensionsRequired: ['EXT_texture_webp'],
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes,
    meshes,
    materials: [{ ...material, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
    textures: [{ extensions: { EXT_texture_webp: { source: 0 } } }],
    images: [{ bufferView: imageView, mimeType: 'image/webp' }],
    accessors, bufferViews,
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

export async function optimizeCityModel(input, { tris = 9000, texture = 1024, quality = 80, flipLimit, keepUvOrientation, minPartTriangles = 500 } = {}) {
  const glb = readGlb(input)
  const { json } = glb
  if (!json.meshes?.length || json.meshes.some(mesh => mesh.primitives.length !== 1)) throw new Error('cada malha do GLB deve ter uma só parte')
  const primitives = json.meshes.map(mesh => mesh.primitives[0])
  const materials = primitives.map(primitive => json.materials?.[primitive.material ?? 0] ?? {})
  // A textura de cor é a do material, não a primeira imagem: alguns GLB trazem também um mapa de normais.
  const sources = materials.map(material => json.textures?.[material.pbrMetallicRoughness?.baseColorTexture?.index]?.source ?? 0)
  if (new Set(sources).size !== 1) throw new Error('as malhas do GLB devem usar a mesma textura de cor')
  const material = materials[0]
  const image = json.images?.[sources[0]]
  if (!image || image.bufferView === undefined) throw new Error('o GLB não tem textura embutida')
  const view = json.bufferViews[image.bufferView]
  const source = glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)

  const inputs = primitives.map(primitive => ({
    positions: readAccessor(glb, primitive.attributes.POSITION),
    uvs: readAccessor(glb, primitive.attributes.TEXCOORD_0),
    indices: readAccessor(glb, primitive.indices),
  }))
  const total = inputs.reduce((sum, part) => sum + part.indices.length / 3, 0)
  const options = {}
  if (flipLimit !== undefined) options.flipLimit = flipLimit
  if (keepUvOrientation !== undefined) options.keepUvOrientation = keepUvOrientation
  const parts = [], stats = { before: 0, after: 0, vertices: 0, rejected: 0, collapses: 0 }
  inputs.forEach((part, k) => {
    const own = part.indices.length / 3
    // Uma malha só leva a meta inteira; com várias, cada uma leva a sua fatia (com um mínimo para as pequenas).
    const target = inputs.length === 1 ? tris : Math.min(own, Math.max(minPartTriangles, Math.round(tris * own / total)))
    const reduced = simplifyTextured(part.positions, part.uvs, part.indices, { targetTriangles: target, ...options })
    parts.push({ positions: reduced.positions, uvs: reduced.uvs, indices: reduced.indices, name: json.nodes?.find(node => node.mesh === k)?.name || json.meshes[k].name || `predio${k}` })
    for (const key of Object.keys(stats)) stats[key] += reduced.stats[key]
  })
  const sharp = createRequire(import.meta.url)('sharp')
  const webp = await sharp(source).resize(texture, texture, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer()
  const keep = {}
  if (material.doubleSided) keep.doubleSided = true
  if (material.alphaMode) { keep.alphaMode = material.alphaMode; if (material.alphaCutoff !== undefined) keep.alphaCutoff = material.alphaCutoff }
  const output = buildGlb({ parts, webp, material: keep })
  return { output, stats: { ...stats, textureBytes: webp.length, inputTriangles: total } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2)
  const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args.splice(i, 2)[1]) : fallback }
  const tris = flag('tris', 9000), texture = flag('texture', 1024), quality = flag('quality', 80), flipLimit = flag('flip-limit', undefined)
  const uvFlip = args.indexOf('--allow-uv-flip')
  if (uvFlip >= 0) args.splice(uvFlip, 1)
  const [inFile, outFile] = args
  if (!inFile || !outFile) { console.error('Uso: node tools/optimize-city-models.mjs <entrada.glb> <saida.glb> [--tris 9000] [--texture 1024] [--quality 80] [--flip-limit 0.2] [--allow-uv-flip]'); process.exit(2) }
  const started = performance.now()
  const { output, stats } = await optimizeCityModel(fs.readFileSync(inFile), { tris, texture, quality, flipLimit, keepUvOrientation: uvFlip >= 0 ? false : undefined })
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
  fs.writeFileSync(outFile, output)
  const kb = n => Math.round(n / 1024)
  console.log(`${path.basename(inFile)}: ${stats.inputTriangles} → ${stats.after} triângulos (${stats.vertices} vértices, ${stats.rejected} colapsos recusados), ${kb(fs.statSync(inFile).size)} KB → ${kb(output.length)} KB (textura ${kb(stats.textureBytes)} KB), ${((performance.now() - started) / 1000).toFixed(1)} s`)
}
