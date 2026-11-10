// Gera public-fifones/models/world/manifest.json: a lista dos GLB que existem.
// O mapa lê este arquivo numa única requisição, em vez de sondar os 8 modelos (e gerar 404 no console).
// O Vite roda isto ao iniciar o dev server, a cada GLB adicionado/removido e no build.
// Uso manual: node tools/world-models-manifest.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const WORLD_MODELS_DIR = fileURLToPath(new URL('../public-fifones/models/world', import.meta.url))

export function writeWorldManifest(dir = WORLD_MODELS_DIR) {
  fs.mkdirSync(dir, { recursive: true })
  const ids = fs.readdirSync(dir).filter(name => name.endsWith('.glb')).map(name => name.slice(0, -4)).sort()
  const file = path.join(dir, 'manifest.json')
  const next = `${JSON.stringify(ids)}\n`
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next) fs.writeFileSync(file, next)
  return ids
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = writeWorldManifest()
  console.log(ids.length ? `manifest.json: ${ids.join(', ')}` : 'manifest.json: nenhum GLB ainda')
}
