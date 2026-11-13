// Recomprime as texturas embutidas de um GLB multi-malha (um personagem, não um prédio: optimize-city-models.mjs
// só aceita uma malha de uma parte só) para WebP, sem mexer na geometria. Uso único (o Fifo, em
// src/fifones/characters.js): outro personagem assim pede generalizar o redutor em vez de repetir isto à mão.
// Uso: node tools/one-off/pack-character.mjs <entrada.glb> <saida.glb> [tamanho-da-textura]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { readGlb } from '../optimize-city-models.mjs'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const [inFile, outFile, sizeArg] = process.argv.slice(2)
const size = Number(sizeArg) || 1024
const glb = readGlb(fs.readFileSync(inFile))
const { json, bin } = glb

// Só a textura de cor segue: normal map, metal/rugosidade e oclusão não têm efeito no material de faces planas
// da cidade (applyGlbStyle/toLambertScene em src/tres/) e só pesam o arquivo à toa.
const keepTextureIndexes = new Set()
for (const material of json.materials || []) {
  const index = material.pbrMetallicRoughness?.baseColorTexture?.index ?? material.emissiveTexture?.index
  if (index !== undefined) keepTextureIndexes.add(index)
}
const keepImageIndexes = new Set([...keepTextureIndexes].map(t => json.textures[t].source))
const imageViewIndexes = new Set((json.images || []).map(img => img.bufferView))

const chunks = []
let cursor = 0
const pad4 = buffer => { const rem = buffer.length % 4; return rem ? Buffer.concat([buffer, Buffer.alloc(4 - rem)]) : buffer }
const push = buffer => { const padded = pad4(Buffer.from(buffer)); const offset = cursor; chunks.push(padded); cursor += padded.length; return offset }

const newViews = []
const remap = new Map() // índice do bufferView antigo -> novo (só para os que não são imagem)
for (let i = 0; i < json.bufferViews.length; i++) {
  if (imageViewIndexes.has(i)) continue
  const view = json.bufferViews[i]
  const bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)
  const offset = push(bytes)
  remap.set(i, newViews.length)
  newViews.push({ ...view, byteOffset: offset })
}

// Imagens mantidas: recomprime para WebP e acrescenta no fim. Mapa velho índice → novo (só as mantidas).
const imageRemap = new Map()
const newImages = []
for (let i = 0; i < (json.images || []).length; i++) {
  if (!keepImageIndexes.has(i)) continue
  const image = json.images[i]
  const view = json.bufferViews[image.bufferView]
  const bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)
  const webp = await sharp(bytes).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  const offset = push(webp)
  newViews.push({ buffer: 0, byteOffset: offset, byteLength: webp.length })
  imageRemap.set(i, newImages.length)
  newImages.push({ bufferView: newViews.length - 1, mimeType: 'image/webp' })
}

for (const accessor of json.accessors) if (accessor.bufferView !== undefined) accessor.bufferView = remap.get(accessor.bufferView)
json.bufferViews = newViews
json.images = newImages
// Só as texturas mantidas sobrevivem, renumeradas; material aponta pra elas por EXT_texture_webp e perde
// normalTexture/metallicRoughnessTexture/occlusionTexture (índices de textura antigos, agora inválidos).
const textureRemap = new Map([...keepTextureIndexes].sort((a, b) => a - b).map((oldIndex, newIndex) => [oldIndex, newIndex]))
json.textures = [...keepTextureIndexes].sort((a, b) => a - b)
  .map(oldIndex => ({ extensions: { EXT_texture_webp: { source: imageRemap.get(json.textures[oldIndex].source) } } }))
for (const material of json.materials || []) {
  delete material.normalTexture
  delete material.occlusionTexture
  if (material.pbrMetallicRoughness) {
    delete material.pbrMetallicRoughness.metallicRoughnessTexture
    if (material.pbrMetallicRoughness.baseColorTexture) material.pbrMetallicRoughness.baseColorTexture.index = textureRemap.get(material.pbrMetallicRoughness.baseColorTexture.index)
  }
  if (material.emissiveTexture) material.emissiveTexture.index = textureRemap.get(material.emissiveTexture.index)
}
json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'EXT_texture_webp'])]
json.extensionsRequired = [...new Set([...(json.extensionsRequired || []), 'EXT_texture_webp'])]
json.buffers = [{ byteLength: cursor }]

const newBin = Buffer.concat(chunks, cursor)
let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
if (jsonBuffer.length % 4) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(4 - (jsonBuffer.length % 4), 0x20)])
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + newBin.length, 8)
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBuffer.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(newBin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
const out = Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, newBin])
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, out)
console.log(inFile, '->', outFile, `${(fs.statSync(inFile).size / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`)
