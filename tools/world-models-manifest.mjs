// Listas dos GLB do mapa-mundo, lidas pelo globo em uma única requisição.
//
// manifest.json (em public-fifones/models/world): só os ids que têm GLB. O Vite roda isto ao iniciar o
// dev server, a cada GLB adicionado/removido e no build. A cidade (CityWorld.js) também lê este arquivo.
//
// models.json (só no build, em dist/models/world): para cada id, o arquivo publicado com o hash do
// conteúdo no nome (`v/coliseu.1a2b3c4d5e.glb`), o tamanho e os triângulos. Esses arquivos nunca mudam,
// então o servidor os entrega com cache imutável; um modelo trocado ganha outro nome no build seguinte.
//
// Uso manual: node tools/world-models-manifest.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const WORLD_MODELS_DIR = fileURLToPath(new URL('../public-fifones/models/world', import.meta.url))

const modelIds = dir => (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(name => name.endsWith('.glb')).map(name => name.slice(0, -4)).sort()

export function writeWorldManifest(dir = WORLD_MODELS_DIR) {
  fs.mkdirSync(dir, { recursive: true })
  const ids = modelIds(dir)
  const file = path.join(dir, 'manifest.json')
  const next = `${JSON.stringify(ids)}\n`
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next) fs.writeFileSync(file, next)
  return ids
}

/** Triângulos de um GLB, lidos do bloco JSON do arquivo (sem decodificar a malha). 0 se não der para ler. */
export function glbTriangles(buffer) {
  try {
    if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(16) !== 0x4e4f534a) return 0
    const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'))
    let triangles = 0
    for (const mesh of json.meshes || []) {
      for (const primitive of mesh.primitives || []) {
        if ((primitive.mode ?? 4) !== 4) continue
        triangles += Math.floor(json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3)
      }
    }
    return triangles
  }
  catch {
    return 0
  }
}

/**
 * Lista dos modelos: { id: { arquivo, kb, triangulos } }.
 * Com `versioned`, `arquivo` leva o hash do conteúdo (`v/<id>.<hash>.glb`); sem, é o próprio `<id>.glb`
 * (servidor de desenvolvimento, que serve a pasta de origem e não precisa de cache longo).
 */
export function worldModelsIndex(dir = WORLD_MODELS_DIR, { versioned = false } = {}) {
  const index = {}
  for (const id of modelIds(dir)) {
    const buffer = fs.readFileSync(path.join(dir, `${id}.glb`))
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10)
    index[id] = { arquivo: versioned ? `v/${id}.${hash}.glb` : `${id}.glb`, kb: Math.max(1, Math.round(buffer.length / 1024)), triangulos: glbTriangles(buffer) }
  }
  return index
}

/** No build: copia cada GLB para <saída>/models/world/v/ com o hash no nome e grava models.json ao lado. */
export function publishWorldModels(outDir, dir = WORLD_MODELS_DIR) {
  const target = path.join(outDir, 'models', 'world')
  const index = worldModelsIndex(dir, { versioned: true })
  fs.rmSync(path.join(target, 'v'), { recursive: true, force: true })
  fs.mkdirSync(path.join(target, 'v'), { recursive: true })
  for (const [id, entry] of Object.entries(index)) fs.copyFileSync(path.join(dir, `${id}.glb`), path.join(target, entry.arquivo))
  fs.writeFileSync(path.join(target, 'models.json'), `${JSON.stringify(index)}\n`)
  return index
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = writeWorldManifest()
  console.log(ids.length ? `manifest.json: ${ids.join(', ')}` : 'manifest.json: nenhum GLB ainda')
}
