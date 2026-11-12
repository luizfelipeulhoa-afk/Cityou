// Objetos three do terreno: a malha (terra e mar num draw call), a vegetação em instâncias, a sobreposição das
// zonas bloqueadas e o assento dos prédios. Os dados vêm de createTerrainData(); aqui nada é calculado de novo.
// Um material só, fosco e de faces planas, para terreno, árvores, palmeiras e discos.
import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, Box3, Vector3,
} from 'three'
import { decodePng } from './png.js'
import { createTerrainData, PALETTE } from './terrainData.js'

/** Baixa o mapa de alturas da região (um arquivo do próprio site) e monta os dados do terreno. */
export async function loadTerrain(region) {
  const response = await fetch(region.heightmap.url)
  if (!response.ok) throw new Error(`O mapa de alturas de ${region.name} não carregou (HTTP ${response.status}).`)
  const image = await decodePng(new Uint8Array(await response.arrayBuffer()))
  return createTerrainData(region, image.data)
}

const linear = hex => new Color(hex).toArray().map(channel => Math.round(channel * 255))

// Junta peças numa geometria sem índice, com a cor de cada peça nos vértices (o material lê a cor do vértice).
function merge(parts) {
  const total = parts.reduce((sum, { geometry }) => sum + (geometry.index ? geometry.index.count : geometry.attributes.position.count), 0)
  const positions = new Float32Array(total * 3), colors = new Uint8Array(total * 3)
  const point = new Vector3()
  let cursor = 0
  for (const { geometry, color, matrix, tint } of parts) {
    const source = geometry.attributes.position, index = geometry.index
    const base = linear(color)
    for (let k = 0; k < (index ? index.count : source.count); k++) {
      point.fromBufferAttribute(source, index ? index.getX(k) : k)
      if (matrix) point.applyMatrix4(matrix)
      positions.set([point.x, point.y, point.z], cursor * 3)
      const shade = tint ? tint(point) : 1
      colors.set(base.map(channel => Math.min(255, Math.round(channel * shade))), cursor * 3)
      cursor++
    }
    geometry.dispose()
  }
  const merged = new BufferGeometry()
  merged.setAttribute('position', new BufferAttribute(positions, 3))
  merged.setAttribute('color', new BufferAttribute(colors, 3, true))
  return merged
}

// Árvore de encosta: copa de 15 faces (um icosaedro sem a base) e tronco de 3 lados. Altura perto de 0,9.
function treeGeometry() {
  const crown = new IcosahedronGeometry(0.42, 0).toNonIndexed()
  const kept = []
  const source = crown.attributes.position
  for (let face = 0; face < source.count; face += 3) {
    const top = Math.max(source.getY(face), source.getY(face + 1), source.getY(face + 2))
    if (top > -0.2) for (let k = 0; k < 3; k++) kept.push(source.getX(face + k), source.getY(face + k), source.getZ(face + k))
  }
  crown.setAttribute('position', new BufferAttribute(new Float32Array(kept), 3))
  return merge([
    { geometry: new CylinderGeometry(0.035, 0.06, 0.3, 3, 1, true), color: PALETTE.earth, matrix: new Matrix4().makeTranslation(0, 0.15, 0) },
    { geometry: crown, color: PALETTE.grassDark, matrix: new Matrix4().makeScale(1, 0.9, 1).setPosition(0, 0.55, 0), tint: point => (point.y > 0.6 ? 1.22 : 1) },
  ])
}

// Palmeira da orla: tronco inclinado de 4 lados e 6 folhas dobradas, com as duas faces desenhadas. Altura perto de 1,2.
function palmGeometry() {
  const lean = new Matrix4().makeShear(0, 0, 0.14, 0, 0, 0).setPosition(0, 0.5, 0)
  const parts = [{ geometry: new CylinderGeometry(0.03, 0.055, 1, 4, 1, true), color: PALETTE.earth, matrix: lean }]
  const leaf = new Float32Array([
    0, 0, 0, 0.3, 0.06, -0.07, 0.3, 0.06, 0.07, // base da folha
    0.3, 0.06, -0.07, 0.62, -0.14, 0, 0.3, 0.06, 0.07, // ponta caída
    0, 0, 0, 0.3, 0.06, 0.07, 0.3, 0.06, -0.07, // as mesmas duas faces, viradas para baixo
    0.3, 0.06, -0.07, 0.3, 0.06, 0.07, 0.62, -0.14, 0,
  ])
  for (let k = 0; k < 6; k++) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(leaf.slice(), 3))
    parts.push({ geometry, color: k % 2 ? PALETTE.grassDark : PALETTE.grassLight, matrix: new Matrix4().makeRotationY(k * Math.PI / 3 + 0.3).setPosition(0.07, 1, 0) })
  }
  return merge(parts)
}

function instances(geometry, material, items, name) {
  const count = items.length / 6
  const mesh = new InstancedMesh(geometry, material, count)
  mesh.name = name
  const dummy = new Object3D(), color = new Color()
  for (let k = 0; k < count; k++) {
    const [x, y, z, scale, turn, chance] = items.subarray(k * 6, k * 6 + 6)
    dummy.position.set(x, y - 0.02, z)
    dummy.rotation.set(0, turn, 0)
    dummy.scale.set(scale, scale * (0.9 + chance * 0.25), scale)
    dummy.updateMatrix()
    mesh.setMatrixAt(k, dummy.matrix)
    mesh.setColorAt(k, color.setScalar(0.86 + chance * 0.24))
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

/** Cria o grupo three do terreno. Devolve `{ group, terrain, trees, palms, material, setBlockedOverlay(visible), stats, dispose() }`. */
export function createTerrainObjects(data) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3, true))
  geometry.computeBoundingSphere()
  const terrain = new Mesh(geometry, material)
  terrain.name = `Terreno · ${data.region.name}`
  terrain.matrixAutoUpdate = false
  const trees = instances(treeGeometry(), material, data.trees, 'Árvores das encostas')
  const palms = instances(palmGeometry(), material, data.palms, 'Palmeiras da orla')
  const group = new Group()
  group.name = `Cenário · ${data.region.name}`
  group.add(terrain, trees, palms)

  let overlay = null
  /** Liga ou desliga a sobreposição dos lotes bloqueados (depuração). É criada na primeira vez. */
  const setBlockedOverlay = (visible) => {
    if (!overlay && visible) {
      const areas = data.getBlockedAreas()
      const lots = areas.reduce((sum, area) => sum + area.width * area.depth, 0)
      const positions = new Float32Array(lots * 18)
      let cursor = 0
      for (const area of areas) {
        for (let dz = 0; dz < area.depth; dz++) {
          for (let dx = 0; dx < area.width; dx++) {
            const x = area.x + dx, z = area.z + dz
            const corner = (cx, cz) => [cx, data.getHeightAt(cx, cz) + 0.07, cz]
            const a = corner(x - 0.46, z - 0.46), b = corner(x + 0.46, z - 0.46), c = corner(x + 0.46, z + 0.46), d = corner(x - 0.46, z + 0.46)
            positions.set([...a, ...d, ...b, ...b, ...d, ...c], cursor)
            cursor += 18
          }
        }
      }
      const overlayGeometry = new BufferGeometry()
      overlayGeometry.setAttribute('position', new BufferAttribute(positions, 3))
      overlay = new Mesh(overlayGeometry, new MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.42, depthWrite: false, side: DoubleSide, fog: false }))
      overlay.name = 'Lotes bloqueados (depuração)'
      overlay.renderOrder = 2
      group.add(overlay)
    }
    if (overlay) overlay.visible = visible
  }

  return {
    group, terrain, trees, palms, material, setBlockedOverlay,
    stats: {
      terrainTriangles: data.triangles,
      treeTriangles: trees.count * trees.geometry.attributes.position.count / 3,
      palmTriangles: palms.count * palms.geometry.attributes.position.count / 3,
    },
    dispose() {
      for (const object of [terrain, trees, palms, overlay]) {
        if (!object) continue
        object.geometry.dispose()
        if (object.material !== material) object.material.dispose()
        object.dispose?.()
      }
      material.dispose()
    },
  }
}

const PEDESTAL_HEIGHT = 0.06

/**
 * Assenta um prédio num lote. O prédio fica sobre um disco fino de 10 lados, e o disco sobre o terreno, na
 * altura de getHeightAt no centro da área. Convenção dos GLB: origem no centro de baixo da base e frente em +Z.
 *
 * @param data dados do terreno (createTerrainData)
 * @param object prédio (Object3D); pode ser null para criar só o disco
 * @param lot lote âncora ({ x, z }): o de menor x e menor z da área
 * @param size lado da área, em lotes (1 a 4)
 * @param options.rotation quartos de volta (0 a 3); options.fit ajusta a escala para a base caber na área
 * @returns o grupo já posicionado, ou null se a área não é toda de lotes livres
 */
export function seatBuilding(data, object, lot, size = 1, { rotation = 0, fit = true, material = null } = {}) {
  if (!data.isBuildable(lot, size)) return null
  const center = data.lots.footprintCenter(lot, size)
  const seat = new Group()
  seat.name = `Prédio ${size}×${size} no lote (${lot.x}, ${lot.z})`
  seat.position.set(center.x, data.getHeightAt(center.x, center.z), center.z)
  seat.userData = { lot, size }
  const disc = new CylinderGeometry(size * 0.48, size * 0.48, PEDESTAL_HEIGHT, 10)
  const colors = new Uint8Array(disc.attributes.position.count * 3)
  const cream = linear(PALETTE.cream)
  for (let k = 0; k < colors.length; k++) colors[k] = cream[k % 3]
  disc.setAttribute('color', new BufferAttribute(colors, 3, true))
  const pedestal = new Mesh(disc, material ?? new MeshLambertMaterial({ vertexColors: true, flatShading: true }))
  pedestal.name = 'Disco de 10 lados'
  pedestal.position.y = PEDESTAL_HEIGHT / 2
  seat.add(pedestal)
  if (object) {
    object.removeFromParent()
    if (fit) {
      // Mesma regra da cidade: a base ocupa 90% da área e o modelo fica centrado, com o fundo em y = 0.
      object.position.set(0, 0, 0)
      object.scale.setScalar(1)
      object.updateWorldMatrix(false, true)
      const box = new Box3().setFromObject(object)
      const extent = box.getSize(new Vector3()), middle = box.getCenter(new Vector3())
      const scale = size * 0.9 / Math.max(extent.x, extent.z, 1e-6)
      object.scale.setScalar(scale)
      object.position.set(-middle.x * scale, -box.min.y * scale, -middle.z * scale)
    }
    const holder = new Group()
    holder.position.y = PEDESTAL_HEIGHT
    holder.rotation.y = -rotation * Math.PI / 2
    holder.add(object)
    seat.add(holder)
  }
  return seat
}
