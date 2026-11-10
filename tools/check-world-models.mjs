// Confere o orçamento dos GLB do mapa-mundo: triângulos, tamanho do arquivo e texturas.
// Uso: node tools/check-world-models.mjs [pasta]   (padrão: public-fifones/models/world)
// Sai com código 1 se algum modelo estourar o orçamento. Sem dependências.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.argv[2] || 'public-fifones/models/world')
const MAX_FILE_KB = 2048
const MAX_TEXTURE = 1024
const MAX_TRIANGLES = {
  'ilha-inicial': 6000, 'cristo-redentor': 20000, 'machu-picchu': 25000, 'chichen-itza': 15000,
  'coliseu': 25000, 'petra': 20000, 'taj-mahal': 25000, 'grande-muralha': 25000,
}

function readGlb(file) {
  const buf = fs.readFileSync(file)
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um GLB')
  const jsonLength = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB sem bloco JSON')
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
  const binStart = 20 + jsonLength + 8
  return { json, bin: buf.length > binStart ? buf.subarray(binStart) : null, bytes: buf.length }
}

// Largura x altura lendo só o cabeçalho de PNG, JPEG ou WebP.
function imageSize(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)] }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
      i += 2 + b.readUInt16BE(i + 2)
    }
  }
  return null
}

function inspect(file) {
  const { json, bin, bytes } = readGlb(file)
  let triangles = 0
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if ((prim.mode ?? 4) !== 4) continue
      const accessor = json.accessors[prim.indices ?? prim.attributes.POSITION]
      triangles += Math.floor(accessor.count / 3)
    }
  }
  const textures = (json.images || []).map((image) => {
    const view = image.bufferView !== undefined && bin ? json.bufferViews[image.bufferView] : null
    const size = view ? imageSize(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)) : null
    return { type: (image.mimeType || '?').replace('image/', ''), size, kb: view ? Math.round(view.byteLength / 1024) : 0 }
  })
  const extensions = (json.extensionsRequired || []).join(', ')
  return { triangles, kb: Math.round(bytes / 1024), textures, materials: (json.materials || []).length, extensions }
}

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(name => name.endsWith('.glb')).sort() : []
if (!files.length) { console.log(`Nenhum GLB em ${DIR} ainda: o mapa usa os placeholders.`); process.exit(0) }

let failed = false
for (const name of files) {
  const id = name.replace(/\.glb$/, '')
  const problems = []
  try {
    const info = inspect(path.join(DIR, name))
    const limit = MAX_TRIANGLES[id]
    if (!limit) problems.push('nome fora da lista dos 8 espaços (o mapa não vai carregar este arquivo)')
    else if (info.triangles > limit) problems.push(`${info.triangles} triângulos (máx. ${limit})`)
    if (info.kb > MAX_FILE_KB) problems.push(`${info.kb} KB (máx. ${MAX_FILE_KB})`)
    for (const t of info.textures) if (t.size && Math.max(...t.size) > MAX_TEXTURE) problems.push(`textura ${t.size.join('x')} (máx. ${MAX_TEXTURE})`)
    if (/draco/i.test(info.extensions)) problems.push('usa Draco, que o mapa não decodifica (use meshopt)')
    const tex = info.textures.map(t => `${t.type} ${t.size ? t.size.join('x') : '?'} ${t.kb} KB`).join('; ') || 'sem textura'
    console.log(`${problems.length ? '✗' : '✓'} ${name}: ${info.triangles} tris, ${info.kb} KB, ${info.materials} material(is), ${tex}${info.extensions ? `, exige ${info.extensions}` : ''}`)
  }
  catch (error) {
    problems.push(error.message)
    console.log(`✗ ${name}: ${error.message}`)
  }
  for (const p of problems) console.log(`    ${p}`)
  if (problems.length) failed = true
}
if (failed) { console.log('\nReduza com: node tools/optimize-world-models.mjs <arquivo.glb> <id>'); process.exit(1) }
