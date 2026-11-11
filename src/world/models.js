// De onde vem o GLB de cada espaço do mapa-mundo.
//
// models.json é gerado no build (tools/world-models-manifest.mjs): para cada id, o arquivo com o hash do
// conteúdo no nome (`v/coliseu.1a2b3c4d.glb`), o tamanho e os triângulos. O servidor entrega esses arquivos
// com cache imutável, então uma visita repetida não faz nenhuma requisição por modelo, e um modelo trocado
// muda de endereço na hora. manifest.json (só a lista de ids) continua valendo onde o models.json não existe.
import { WORLD_MODELS_DIR } from './worldSpaces.js'

export const WORLD_MODELS_INDEX = `${WORLD_MODELS_DIR}/models.json`

// Só nomes simples dentro da pasta dos modelos: nada de "..", barra inicial ou outro domínio.
const SAFE_FILE = /^(?:[\w-]+\/)*[\w.-]+\.glb$/

/**
 * @param {Array<{id: string, glbPath: string}>} spaces
 * @param {{ index?: object|null, manifest?: string[]|null }} lists conteúdo de models.json e de manifest.json
 * @returns {Map<string, { url: string, fallbackUrl: string|null, kb: number }>} só os espaços com modelo
 */
export function resolveModelSources(spaces, { index = null, manifest = null } = {}) {
  const sources = new Map()
  const entries = index && typeof index === 'object' && !Array.isArray(index) ? index : null
  for (const space of spaces) {
    const entry = entries?.[space.id]
    const file = typeof entry?.arquivo === 'string' && SAFE_FILE.test(entry.arquivo) && !entry.arquivo.includes('..') ? entry.arquivo : null
    if (file) {
      const url = `${WORLD_MODELS_DIR}/${file}`
      // Se o arquivo com hash faltar (build pela metade), o caminho de sempre ainda serve.
      sources.set(space.id, { url, fallbackUrl: url === space.glbPath ? null : space.glbPath, kb: Number(entry.kb) > 0 ? Number(entry.kb) : 1 })
    }
    else if (!entries && Array.isArray(manifest) && manifest.includes(space.id)) {
      sources.set(space.id, { url: space.glbPath, fallbackUrl: null, kb: 1 })
    }
  }
  return sources
}
