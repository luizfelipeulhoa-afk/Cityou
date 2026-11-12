// Zona jogável: uma grade de lotes quadrados de 1 unidade, lida da máscara da região (um caractere por lote).
// Um lote é identificado pelas coordenadas inteiras do seu centro no mundo: { x: 3, z: -2 } é o quadrado de lado 1
// centrado em x = 3, z = −2. Um prédio de n × n lotes é ancorado no lote de menor x e menor z, como na cidade.
const KINDS = { '.': 'free', '#': 'blocked', d: 'decorative' }

export function createLots({ x0, z0, rows }) {
  const columns = rows[0].length, lines = rows.length
  const kindAt = ({ x, z }) => KINDS[rows[z - z0]?.[x - x0]] ?? 'blocked'
  const playable = []
  for (let r = 0; r < lines; r++) {
    for (let c = 0; c < columns; c++) if (rows[r][c] !== '#') playable.push({ x: x0 + c, z: z0 + r })
  }
  if (playable.length === 0) throw new Error('A máscara não tem nenhum lote livre.')
  const bounds = {
    minX: Math.min(...playable.map(lot => lot.x)) - 0.5, maxX: Math.max(...playable.map(lot => lot.x)) + 0.5,
    minZ: Math.min(...playable.map(lot => lot.z)) - 0.5, maxZ: Math.max(...playable.map(lot => lot.z)) + 0.5,
  }

  let blockedAreas = null

  return {
    x0, z0, columns, lines, playable, bounds,

    /** 'free' (constrói e anda), 'decorative' (só anda) ou 'blocked'. Fora da grade é bloqueado. */
    kindAt,

    /** Um prédio de `size` × `size` lotes ancorado em `lot` cabe inteiro em lotes livres? */
    isBuildable(lot, size = 1) {
      if (!Number.isInteger(lot?.x) || !Number.isInteger(lot?.z) || !Number.isInteger(size) || size < 1) return false
      for (let dz = 0; dz < size; dz++) {
        for (let dx = 0; dx < size; dx++) if (kindAt({ x: lot.x + dx, z: lot.z + dz }) !== 'free') return false
      }
      return true
    },

    /** Lote âncora do prédio de `size` × `size` cujo centro fica mais perto de `position` ({ x, z } no mundo). */
    snapToLot(position, size = 1) {
      const offset = (size - 1) / 2
      return { x: Math.round(position.x - offset), z: Math.round(position.z - offset) }
    },

    /** Centro, no mundo, do prédio de `size` × `size` lotes ancorado em `lot`. */
    footprintCenter(lot, size = 1) {
      return { x: lot.x + (size - 1) / 2, z: lot.z + (size - 1) / 2 }
    },

    /** Lotes bloqueados da grade, juntados em retângulos: [{ x, z, width, depth }], com x e z do lote do canto. */
    getBlockedAreas() {
      if (blockedAreas) return blockedAreas
      const used = rows.map(() => new Array(columns).fill(false))
      blockedAreas = []
      for (let r = 0; r < lines; r++) {
        for (let c = 0; c < columns; c++) {
          if (used[r][c] || rows[r][c] !== '#') continue
          let width = 1
          while (c + width < columns && rows[r][c + width] === '#' && !used[r][c + width]) width++
          let depth = 1
          const fits = line => { for (let k = c; k < c + width; k++) if (rows[line][k] !== '#' || used[line][k]) return false; return true }
          while (r + depth < lines && fits(r + depth)) depth++
          for (let dr = 0; dr < depth; dr++) for (let dc = 0; dc < width; dc++) used[r + dr][c + dc] = true
          blockedAreas.push({ x: x0 + c, z: z0 + r, width, depth })
        }
      }
      return blockedAreas
    },

    /** Ponto da zona jogável mais próximo de (x, z): é onde o alvo da câmera pode ficar. */
    clampToPlayable(x, z) {
      if (kindAt({ x: Math.round(x), z: Math.round(z) }) !== 'blocked') return { x, z }
      let best = null, bestDistance = Infinity
      for (const lot of playable) {
        const px = Math.min(lot.x + 0.5, Math.max(lot.x - 0.5, x)), pz = Math.min(lot.z + 0.5, Math.max(lot.z - 0.5, z))
        const distance = (px - x) ** 2 + (pz - z) ** 2
        if (distance < bestDistance) { bestDistance = distance; best = { x: px, z: pz } }
      }
      return best
    },
  }
}
