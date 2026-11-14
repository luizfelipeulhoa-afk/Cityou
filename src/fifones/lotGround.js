// O chão em volta de cada prédio da cidade do Rio: um tapete de terra e mato de bordas macias sob o lote, que faz o prédio
// brotar do terreno em vez de parecer apoiado nele (a base redonda do GLB fica enterrada, CityWorld.loadModel), e a
// calçada ligando o prédio à rua: uma faixa rente à frente do lote, do lado da rua, com um acesso mais largo na porta.
// Tudo é visual, calculado dos prédios e das ruas que a cidade já tem; não há nada novo no servidor. Duas malhas
// instanciadas (2 draws) com Lambert, para pegar a mesma luz do terreno.
import * as THREE from 'three'

// Textura branca de bordas macias (a cor vem da instância): `feather` é a fração, de cada lado, que vai de opaco a zero.
function softTexture(width, height, featherX, featherY, paving = 0) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  const image = context.createImageData(width, height)
  const smooth = (a, b, value) => { const t = Math.min(1, Math.max(0, (value - a) / (b - a))); return t * t * (3 - 2 * t) }
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const u = Math.abs((i + 0.5) / width * 2 - 1), v = Math.abs((j + 0.5) / height * 2 - 1)
    const alpha = (1 - smooth(1 - featherX, 1, u)) * (1 - smooth(1 - featherY, 1, v))
    // Junta de calçada: uma linha mais escura a cada `paving` pixels, no sentido do comprimento.
    const line = paving && j % paving === 0 ? 0.9 : 1
    const grain = 0.96 + ((i * 7 + j * 13) % 9) * 0.01
    const shade = Math.round(255 * line * grain)
    const k = (j * width + i) * 4
    image.data[k] = image.data[k + 1] = image.data[k + 2] = shade
    image.data[k + 3] = Math.round(alpha * 255)
  }
  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function instanced(name, texture, capacity, order) {
  const geometry = new THREE.PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshLambertMaterial({
    map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.name = name
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = order
  mesh.userData.decorative = true
  return mesh
}

/**
 * `capacity`: quantos prédios no máximo. Devolve { patches, walks, update({ patches, walks }), dispose() }.
 * `patches`: [{ x, z, width, depth, y, hill }] (o tapete de um lote, no centro dele, na cena).
 * `walks`: [{ x, z, width, length, angle, y }] (uma faixa de calçada; o comprimento corre no sentido `angle` em y).
 */
export function createLotGround(scene, capacity) {
  const patches = instanced('Chão dos lotes', softTexture(64, 64, 0.34, 0.34), capacity, 1)
  const walks = instanced('Calçadas dos prédios', softTexture(32, 64, 0.22, 0.04, 8), capacity * 2, 2)
  scene.add(patches, walks)
  const terrain = new THREE.Color(0x7bc67e).lerp(new THREE.Color(0x4e9f5d), 0.3)
  const flat = terrain.clone().lerp(new THREE.Color(0xb7a46a), 0.18).multiplyScalar(1.03)
  const hill = new THREE.Color(0x4e9f5d).lerp(new THREE.Color(0xb07a4f), 0.5).lerp(new THREE.Color(0xf2d7a6), 0.12)
  const stone = new THREE.Color(0xe6dbbd)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()

  function fill(mesh, items, place, tint) {
    const count = Math.min(items.length, mesh.instanceMatrix.count)
    for (let i = 0; i < count; i++) {
      place(items[i])
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, tint(items[i], i))
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  return {
    patches,
    walks,
    update(next) {
      fill(patches, next.patches, item => {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(item.width, 1, item.depth)
      }, (item, index) => color.copy(item.hill ? hill : flat).multiplyScalar(1 + ((index * 7) % 5 - 2) * 0.018))
      fill(walks, next.walks, item => {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(0, item.angle, 0)
        dummy.scale.set(item.width, 1, item.length)
      }, () => color.copy(stone))
    },
    dispose() {
      for (const mesh of [patches, walks]) {
        mesh.removeFromParent()
        mesh.geometry.dispose()
        mesh.material.map?.dispose()
        mesh.material.dispose()
        mesh.dispose()
      }
    },
  }
}
