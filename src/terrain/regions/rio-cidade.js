// O terreno do Rio como cenário da cidade (Cristo Redentor): a mesma geografia e o mesmo mapa de alturas de rio.js,
// mas a zona plana é a terra da grade da cidade (33 × 33 lotes), não a faixa de Copacabana. A grade, as ruas, os prédios
// e as regras do servidor não mudam: o terreno só desenha o que fica em volta.
import rio from './rio.js'
import { getCityLayout, tileKey } from '../../../shared/game/city-layout.js'

// O terreno anda esta distância para +Z (o mar) na cena, para a praia real cair junto à orla da cidade.
// Na máscara os lotes ficam no sistema do terreno: z do terreno = z da cidade − CITY_SHIFT.
export const CITY_SHIFT = 5

const layout = getCityLayout('cristo-redentor')
const water = new Set(layout.waterTiles.map(([x, y]) => tileKey(x, y)))
const size = layout.max - layout.min + 1
// Água é bloqueada; o resto, inclusive o que está sob a encosta protegida, é plano: a malha da encosta da cidade assenta por cima.
const rows = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => (
  water.has(tileKey(layout.min + column, layout.min + row)) ? '#' : '.')).join(''))

export default {
  ...rio,
  id: 'rio-cidade',
  name: 'Rio de Janeiro · cenário da cidade',
  lots: { x0: layout.min - layout.center, z0: layout.min - layout.center - CITY_SHIFT, rows },
  // Na cidade a névoa fecha em 105 unidades: a vegetação distante não aparece.
  vegetation: { ...rio.vegetation, treeRange: 80, palmRange: 50 },
}
