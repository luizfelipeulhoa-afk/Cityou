// Regra visual de todo GLB que o app carrega (mapa-mundo e cidade): faces planas e superfície fosca.
// Vale para o código de hoje (SpaceMarker.js, CityWorld.js) e para os componentes TresJS desta pasta.
// Este arquivo não importa three nem TresJS: só mexe nas propriedades do material que recebe.

/**
 * - flatShading = true: cada triângulo com uma só normal, o mesmo corte dos monumentos feitos em código;
 * - metalness = 0 e roughness = 1, sem os mapas de metal e rugosidade: com o mapa, o valor final seria
 *   o fator vezes a textura e a rugosidade continuaria vindo do arquivo;
 * - needsUpdate = true: o programa do material é recompilado com essas opções.
 * O MeshLambertMaterial do mapa-mundo não tem metal nem rugosidade; nele só o flatShading tem efeito.
 */
export function applyGlbMaterial(material) {
  material.flatShading = true
  if ('metalness' in material) {
    material.metalness = 0
    material.metalnessMap = null
  }
  if ('roughness' in material) {
    material.roughness = 1
    material.roughnessMap = null
  }
  material.needsUpdate = true
  return material
}

/** Aplica a regra a todas as malhas de um GLB carregado (uma vez por material, mesmo que seja compartilhado). */
export function applyGlbStyle(root) {
  const done = new Set()
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (done.has(material)) continue
      done.add(material)
      applyGlbMaterial(material)
    }
  })
  return root
}
