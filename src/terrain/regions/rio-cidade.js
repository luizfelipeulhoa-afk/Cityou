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
const hill = { x: peak.x, z: peak.z, radiusX: 18, radiusZ: 9.5, height: 6.5 }

// Retângulo que cobre a grade da cidade e o morro do Cristo (unidades do terreno), para o corte abaixo.
const gridX0 = layout.min - layout.center, gridZ0 = layout.min - layout.center - CITY_SHIFT
const cropBounds = {
  minX: Math.min(gridX0, hill.x - hill.radiusX), maxX: Math.max(gridX0 + size - 1, hill.x + hill.radiusX),
  minZ: Math.min(gridZ0, hill.z - hill.radiusZ), maxZ: Math.max(gridZ0 + size - 1, hill.z + hill.radiusZ),
}

export default {
  ...rio,
  id: 'rio-cidade',
  name: 'Rio de Janeiro · cenário da cidade',
  lots: { x0: gridX0, z0: gridZ0, rows },
  // O morro do Cristo: some ao relevo real atrás da grade (unidades do terreno).
  relief: [hill],
  landmarks: [...rio.landmarks, { id: 'morro-do-cristo', name: 'Morro do Cristo', ...peakGeo, radius: 10 }],
  // Chão dos lotes com o verde da mata do mapa, um tom por lote e a variação por face do relevo.
  plateau: { tint: -0.3, contrast: 0.012, facets: 0.8 },
  // Corte (13/11/2026, src/terrain/terrainData.js): além deste raio (a grade e o morro do Cristo, com folga), o
  // relevo real vira mar liso. Sem isto, girar a câmera mostrava a praia e os morros reais de verdade, longe da
  // cidade, que a névoa (abaixo) não cobria de todo lado: o corte tira de vez, não só esconde.
  crop: {
    x: (cropBounds.minX + cropBounds.maxX) / 2, z: (cropBounds.minZ + cropBounds.maxZ) / 2,
    radius: Math.hypot((cropBounds.maxX - cropBounds.minX) / 2, (cropBounds.maxZ - cropBounds.minZ) / 2) + 4,
    blend: 14,
  },
  // A névoa da cidade fecha bem mais perto que a da faixa de Copacabana (13/11/2026, src/terrain/lighting.js:
  // TERRAIN.fog, 80 unidades): com o corte acima, o mar aberto já cobre o resto, então o orçamento de malha da
  // cidade cai bem abaixo do da faixa de Copacabana. A vegetação acompanha a névoa.
  detail: { maxTriangles: 6000 },
  vegetation: { ...rio.vegetation, treeRange: 40, palmRange: 26, decorativePalms: 0 },
}
