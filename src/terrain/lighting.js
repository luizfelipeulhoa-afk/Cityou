// Luz e cor do céu por região, em um lugar só. A cidade (CityWorld), a página de teste do terreno (TerrainLab) e,
// quando medido, o globo leem esta tabela: assim o terreno e os prédios recebem a mesma luz e o mesmo céu.
// Sem three: roda nos testes. As cores são inteiros 0xRRGGBB.
import { PALETTE } from './terrainData.js'

const hex = value => parseInt(value.slice(1), 16)
const mix = (a, b, t) => {
  const channel = shift => Math.round(((hex(a) >> shift) & 255) * (1 - t) + ((hex(b) >> shift) & 255) * t)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

// O terreno foi calibrado sem tone mapping e com esta luz (docs/TERRAIN.md): é a referência.
// `ground` é a cor do platô dos lotes livres (mesma conta de terrainData.js com plateau.tint = -0,3 do Rio):
// o degradê de base dos prédios leva a base do modelo até ela.
export const TERRAIN = Object.freeze({
  sky: hex(PALETTE.sky),
  fog: Object.freeze({ near: 48, far: 105 }),
  toneMapping: 'none',
  exposure: 1,
  hemisphere: Object.freeze({ sky: 0xffffff, ground: 0x70828f, intensity: 1.35 }),
  sun: Object.freeze({ color: 0xfff6e6, intensity: 2.15, direction: Object.freeze([-45, 80, 40]) }),
  ground: mix(PALETTE.grassLight, PALETTE.grassDark, 0.3),
  groundFade: Object.freeze({ from: 0.05, to: 0.36 }),
  contact: Object.freeze({ opacity: 0.4, scale: 1.55, color: 0x1c2b1b }),
})

// Cenários feitos à mão (Ilha Inicial e cidades antigas): o que valia antes, sem degradê de base.
export const HAND_MADE = Object.freeze({
  sky: 0xd1e4e5,
  fog: Object.freeze({ near: 48, far: 105 }),
  toneMapping: 'aces',
  exposure: 0.95,
  hemisphere: Object.freeze({ sky: 0xe4f2fa, ground: 0x647b55, intensity: 1.25 }),
  sun: Object.freeze({ color: 0xffd2a4, intensity: 2.0, direction: Object.freeze([-12, 22, 12]) }),
  ground: null,
  groundFade: null,
  contact: Object.freeze({ opacity: 0.38, scale: 1.4, color: 0x2b3a2a }),
})

export const LIGHTING = Object.freeze({ 'cristo-redentor': TERRAIN })

/** Luz da região; as sem terreno (ilha, cidades antigas) mantêm a luz do cenário feito à mão. */
export const lightingFor = regionId => LIGHTING[regionId] ?? HAND_MADE
