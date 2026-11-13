// MeshLambertMaterial para GLB: a mesma resposta de luz do terreno (Lambert com cor por vértice) e um fragment shader
// mais leve que o PBR. Os GLB do Tripo chegam como MeshStandardMaterial com rugosidade ~0,9 e sem metal, ou seja,
// só difuso. Importa three; a regra do `flatShading` continua em glbMaterial.js.
import { MeshLambertMaterial } from 'three'

export function toLambert(material) {
  if (!material.isMeshStandardMaterial) return material
  return new MeshLambertMaterial({
    name: material.name, map: material.map, color: material.color, vertexColors: material.vertexColors,
    side: material.side, alphaTest: material.alphaTest, flatShading: material.flatShading,
    transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite,
    normalMap: material.normalMap, normalScale: material.normalScale,
    emissive: material.emissive, emissiveMap: material.emissiveMap, emissiveIntensity: material.emissiveIntensity,
  })
}

/** Troca os materiais Standard de um GLB por Lambert, uma vez por material de origem (os compartilhados continuam compartilhados). */
export function toLambertScene(root) {
  const done = new Map()
  const swap = material => {
    if (!done.has(material)) done.set(material, toLambert(material))
    return done.get(material)
  }
  root.traverse(child => {
    if (!child.isMesh || !child.material) return
    child.material = Array.isArray(child.material) ? child.material.map(swap) : swap(child.material)
  })
  return root
}
