// Um só carregador de GLB para os componentes declarativos, com a regra visual de glbMaterial.js.
import { applyGlbStyle } from './glbMaterial.js'

let loader = null

/** GLTFLoader com Meshopt. Os dois módulos só são baixados no primeiro GLB, como no mapa-mundo de hoje. */
export function getGlbLoader() {
  loader ??= Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]).then(([{ GLTFLoader }, { MeshoptDecoder }]) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder))
    .catch((error) => { loader = null; throw error }) // falha de rede não fica guardada: o próximo pedido tenta de novo
  return loader
}

/** Carrega um GLB e devolve a cena dele já com faces planas e material fosco. */
export async function loadGlb(url) {
  const gltf = await (await getGlbLoader()).loadAsync(url)
  return applyGlbStyle(gltf.scene)
}

/** Libera geometria, materiais e texturas de um GLB carregado por loadGlb(). */
export function disposeGlb(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set()
  root.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry)
    for (const material of child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : []) {
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  for (const item of [...geometries, ...materials, ...textures]) item.dispose()
}
