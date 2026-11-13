// Degradê de base: os GLB do Tripo trazem um disco de chão bege no pé do prédio, que no terreno verde parece uma
// peça colada. Aqui a faixa mais baixa do modelo (em altura do mundo) vai ganhando a cor do chão da região, antes
// da luz, então o disco recebe a mesma luz do terreno e o prédio parece nascer dele. Sem three: só mexe no material.
const MARK = '__groundBlend'

/**
 * `ground`: objeto com r, g, b em espaço linear (um THREE.Color serve), compartilhado por todos os materiais.
 * `range`: { from, to } em unidades acima da base do prédio (a base fica em `baseY`, o y do chão sob ele).
 * Mexe só no fragment shader do Lambert; o programa é o mesmo para todos os prédios.
 */
export function applyGroundBlend(material, { ground, range, baseY = 0 }) {
  if (material.userData[MARK] || !ground) return material
  material.userData[MARK] = true
  const uniforms = { uGroundColor: { value: ground }, uGroundRange: { value: [baseY + range.from, baseY + range.to] } }
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vGroundY;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGroundY = (modelMatrix * vec4(transformed, 1.0)).y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uGroundColor;\nuniform vec2 uGroundRange;\nvarying float vGroundY;\nvoid main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = mix(uGroundColor, diffuseColor.rgb, smoothstep(uGroundRange.x, uGroundRange.y, vGroundY));')
  }
  material.customProgramCacheKey = () => 'groundBlend'
  material.needsUpdate = true
  return material
}

/** Aplica o degradê de base a todos os materiais de uma árvore de objetos. */
export function applyGroundBlendTo(root, options) {
  root.traverse(child => {
    if (!child.isMesh || !child.material) return
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) applyGroundBlend(material, options)
  })
  return root
}
