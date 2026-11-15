// O terreno do Rio como cenário da cidade (Cristo Redentor): a mesma geografia e o mesmo mapa de alturas de rio.js,
// mas a zona plana é a terra da grade da cidade (33 × 33 lotes), não a faixa de Copacabana. A grade, as ruas, os prédios
// e as regras do servidor não mudam: o terreno só desenha o que fica em volta.
import rio from './rio.js'
import { createFrame } from '../frame.js'
import { getCityLayout, tileHeight, tileKey } from '../../../shared/game/city-layout.js'

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
// Máscara: terra da grade plana ('.'); encosta protegida com o relevo real ('#'); toda a água dentro da grade
// fica plana e não construível ('d') — as duas primeiras fileiras são o calçadão de Copacabana (reto, mesma
// largura em toda a frente), o resto (só mais 1 ou 2 fileiras, a grade acaba logo depois) é areia (13/11/2026:
// antes só a 1ª fileira virava calçadão e o resto virava relevo de verdade, que mal cabia nessas poucas fileiras
// e cortava a praia de forma torta; agora a faixa toda é lisa, maior e sem relevo no meio).
const kind = (x, y) => {
  const key = tileKey(x, y)
  if (slope.has(key)) return '#'
  if (!water.has(key)) return '.'
  return 'd'
}
const rows = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) =>
  kind(layout.min + column, layout.min + row)).join(''))

// O Pão de Açúcar (16/11/2026, pedido do dono): o bloco real do mapa de alturas (onde ele fica de verdade, a leste, que o
// corte abaixo tira) é copiado para a vala atrás dos patamares da direita, entre o morro do Cristo e a montanha da
// direita, logo depois do fundo da grade. Coordenadas do terreno. O bloco só soma onde é mais alto (terrainData.js,
// `transplant`, que o corte não apaga), então os outros morros ficam iguais; os patamares da direita ficam no pé da pedra.
const SUGARLOAF_FROM = createFrame(rio).toWorld(-22.9494, -43.1558)
export const SUGARLOAF = { x: 10, z: -26 }
const sugarloaf = { from: { x: SUGARLOAF_FROM.x - 0.3, z: SUGARLOAF_FROM.z - 0.6 }, to: SUGARLOAF, radius: 4.6, blend: 3 }
// O Morro da Urca, colado ao Pão como no Rio de verdade, fecha o resto da vala até a montanha da direita.
const urca = { from: { x: SUGARLOAF_FROM.x - 5.7, z: SUGARLOAF_FROM.z - 6.1 }, to: { x: 17, z: -26.5 }, radius: 3.6, blend: 3 }

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
  transplant: [sugarloaf, urca],
  // O chão dos lotes do morro da comunidade sobe com o patamar (um tico abaixo do topo que sceneEnvironment.js desenha),
  // e o relevo em volta se mistura até essa altura, não até 0: sem vala entre os patamares e os morros.
  lotHeight: lot => { const h = tileHeight('cristo-redentor', lot.x + layout.center, lot.z + CITY_SHIFT + layout.center); return h ? h - 0.04 : 0 },
  landmarks: [...rio.landmarks, { id: 'morro-do-cristo', name: 'Morro do Cristo', ...peakGeo, radius: 10 },
    { id: 'pao-de-acucar-cidade', name: 'Pão de Açúcar (atrás dos patamares da direita)', ...createFrame(rio).toGeo(SUGARLOAF.x, SUGARLOAF.z), radius: 9 }],
  // Chão dos lotes com o verde da mata do mapa, um tom por lote e a variação por face do relevo.
  plateau: { tint: -0.3, contrast: 0.012, facets: 0.8 },
  // Corte (13/11/2026, src/terrain/terrainData.js): além deste raio (a grade e o morro do Cristo, com folga), o
  // relevo real vira mar liso. Sem isto, girar a câmera mostrava a praia e os morros reais de verdade, longe da
  // cidade, que a névoa (abaixo) não cobria de todo lado: o corte tira de vez, não só esconde.
  crop: {
    x: (cropBounds.minX + cropBounds.maxX) / 2, z: (cropBounds.minZ + cropBounds.maxZ) / 2,
    radius: Math.hypot((cropBounds.maxX - cropBounds.minX) / 2, (cropBounds.maxZ - cropBounds.minZ) / 2) + 4,
    blend: 14,
    // O maciço real atrás do morro do Cristo (z de −48 para o norte, x de −80 a +10, até 24 de altura) fica de fora do corte:
    // o círculo acima o decapitava (13/11/2026, #28), e a montanha aparecia cortada no meio. O resto (praia e morros
    // distantes a leste) segue removido.
    keep: [{ x: -32, z: -85, radius: 55, blend: 25 }],
  },
  // A névoa da cidade fecha bem mais perto que a da faixa de Copacabana (13/11/2026, src/terrain/lighting.js:
  // TERRAIN.fog, 80 unidades): com o corte acima, o mar aberto já cobre o resto, então o orçamento de malha da
  // cidade cai bem abaixo do da faixa de Copacabana. A vegetação acompanha a névoa.
  // 6000 (#28) deixava a montanha grossa demais: com o maciço de volta, 16 mil (o mapa satura em ~18 mil), contra 60 mil de rio.js.
  detail: { maxTriangles: 16000 },
  // A borda da grade (o platô fica a uns 12 m de altitude) até o mar é areia, sem faixa verde no meio da praia.
  beach: { range: 300, elevation: 16 },
  // Palmeiras na areia (13/11/2026): a faixa de areia cresceu (acima) e ficou sem o coqueiro fixo que o calçadão
  // feito à mão desenhava; `decorativePalms` espalha algumas nos lotes decorativos, como em `rio.js`.
  vegetation: { ...rio.vegetation, treeRange: 40, palmRange: 26, decorativePalms: 0.22 },
}
