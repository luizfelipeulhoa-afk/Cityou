// O terreno do Rio como cenário da cidade (Cristo Redentor): a mesma geografia e o mesmo mapa de alturas de rio.js,
// mas a zona plana é a terra da grade da cidade (33 × 33 lotes), não a faixa de Copacabana. A grade, as ruas, os prédios
// e as regras do servidor não mudam: o terreno só desenha o que fica em volta.
import rio from './rio.js'
import { createFrame } from '../frame.js'
import { getCityLayout, tileKey } from '../../../shared/game/city-layout.js'

// O terreno anda esta distância para +Z (o mar) na cena, para a praia real cair junto à orla da cidade.
// Na máscara os lotes ficam no sistema do terreno: z do terreno = z da cidade − CITY_SHIFT.
export const CITY_SHIFT = 5

// Topo do morro do Cristo, em coordenadas da cena da cidade (x, z). O morro continua os morros reais à esquerda da
// grade e começa a subir na faixa protegida do fundo (as `slopeTiles` do servidor, que seguem sem construção).
export const CRISTO_PEAK = { x: -3, z: -20 }
// O Cristo no morro tem esta fração do tamanho do monumento de outras cidades (LANDMARK_HEIGHT em sceneEnvironment.js).
export const CRISTO_SCALE = 0.6

const layout = getCityLayout('cristo-redentor')
const water = new Set(layout.waterTiles.map(([x, y]) => tileKey(x, y)))
const slope = new Set(layout.slopeTiles.map(([x, y]) => tileKey(x, y)))
const size = layout.max - layout.min + 1
// Máscara: terra da grade plana ('.'); água e encosta protegida com o relevo real ('#'); a primeira fileira de água junto
// à terra fica plana e não construível ('d'): é o calçadão de Copacabana, entre a avenida e a areia.
const kind = (x, y) => {
  const key = tileKey(x, y)
  if (slope.has(key)) return '#'
  if (!water.has(key)) return '.'
  return water.has(tileKey(x, y - 1)) ? '#' : 'd'
}
const rows = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) =>
  kind(layout.min + column, layout.min + row)).join(''))

const peak = { x: CRISTO_PEAK.x, z: CRISTO_PEAK.z - CITY_SHIFT } // no sistema do terreno
const peakGeo = createFrame(rio).toGeo(peak.x, peak.z)

export default {
  ...rio,
  id: 'rio-cidade',
  name: 'Rio de Janeiro · cenário da cidade',
  lots: { x0: layout.min - layout.center, z0: layout.min - layout.center - CITY_SHIFT, rows },
  // O morro do Cristo: some ao relevo real atrás da grade (unidades do terreno).
  relief: [{ x: peak.x, z: peak.z, radiusX: 18, radiusZ: 9.5, height: 6.5 }],
  landmarks: [...rio.landmarks, { id: 'morro-do-cristo', name: 'Morro do Cristo', ...peakGeo, radius: 10 }],
  // Chão dos lotes com o verde da mata do mapa, um tom por lote e a variação por face do relevo.
  plateau: { tint: -0.3, contrast: 0.012, facets: 0.8 },
  // Na cidade a névoa fecha em 105 unidades: a vegetação distante não aparece. O calçadão tem coqueiros próprios.
  vegetation: { ...rio.vegetation, treeRange: 80, palmRange: 50, decorativePalms: 0 },
}
