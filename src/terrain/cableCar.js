// Bondinho do Pão de Açúcar na cidade do Rio (16/11/2026, pedido do dono): uma estação no topo da Urca, outra no topo do
// Pão de Açúcar, dois cabos com a curva do próprio peso e duas cabines que se cruzam no meio, como o de verdade. Só
// cenário: nada vai ao servidor. Cada estação fica no ponto mais alto do chão debaixo dela, e um pedestal de pedra
// facetada, no cinza da rocha do terreno, desce até abaixo do ponto mais baixo: a estação nasce da montanha, sem flutuar
// e sem o chão furar o piso. Faces planas, `MeshLambertMaterial`, como o resto da cidade.
import * as THREE from 'three'

const ROCK = 0xa9a9b8, WALL = 0xf3ead8, ROOF = 0x55606e, GLASS = 0x8fc8e0, CABIN = 0xd9553f, CABLE = 0x3d434c

const lambert = color => new THREE.MeshLambertMaterial({ color, flatShading: true })

/**
 * @param heightAt (x, z) → altura do terreno (mesmas coordenadas de `from` e `to`)
 * @param from, to { x, z } das duas estações (a de baixo primeiro)
 * @returns { group, update(tempo), dispose }
 */
export function createCableCar(heightAt, from, to) {
  const group = new THREE.Group()
  group.name = 'Bondinho do Pão de Açúcar'
  const materials = { rock: lambert(ROCK), wall: lambert(WALL), roof: lambert(ROOF), glass: lambert(GLASS), cabin: lambert(CABIN), cable: lambert(CABLE) }
  const geometries = []
  const mesh = (geometry, material, parent = group) => { geometries.push(geometry); const m = new THREE.Mesh(geometry, material); parent.add(m); return m }

  const dx = to.x - from.x, dz = to.z - from.z
  const heading = Math.atan2(dx, dz)
  const sideX = Math.cos(heading), sideZ = -Math.sin(heading) // perpendicular ao cabo, no chão
  const RAIL = 0.13 // meia distância entre os dois cabos

  // Uma estação: piso no ponto mais alto do chão sob ela, pedestal de pedra até abaixo do mais baixo.
  const station = point => {
    const samples = []
    for (const ox of [-0.55, 0, 0.55]) for (const oz of [-0.55, 0, 0.55]) samples.push(heightAt(point.x + ox, point.z + oz))
    const floor = Math.max(...samples) + 0.04, low = Math.min(...samples) - 0.6
    const base = new THREE.Group()
    base.position.set(point.x, floor, point.z)
    base.rotation.y = heading
    group.add(base)
    // Afloramento de pedra, largo embaixo e irregular (os vértices de cima e de baixo giram um pouco entre si), para ler
    // como parte da rocha e não como uma coluna.
    const plinthHeight = floor - low
    const geometry = new THREE.CylinderGeometry(0.6, 0.6 + plinthHeight * 0.55, plinthHeight, 7, 2)
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i), angle = Math.atan2(position.getZ(i), position.getX(i)), radius = Math.hypot(position.getX(i), position.getZ(i))
      const twist = angle + (y / plinthHeight) * 0.5, wobble = 1 + Math.sin(angle * 3 + y * 5) * 0.08
      position.setXYZ(i, Math.cos(twist) * radius * wobble, y, Math.sin(twist) * radius * wobble)
    }
    geometry.computeVertexNormals()
    const plinth = mesh(geometry, materials.rock, base)
    plinth.position.y = -plinthHeight / 2
    const body = mesh(new THREE.BoxGeometry(0.78, 0.36, 0.62), materials.wall, base)
    body.position.y = 0.18
    const windows = mesh(new THREE.BoxGeometry(0.8, 0.1, 0.5), materials.glass, base)
    windows.position.y = 0.24
    const roof = mesh(new THREE.BoxGeometry(0.92, 0.07, 0.76), materials.roof, base)
    roof.position.y = 0.4
    // A torre de saída dos cabos, do lado que dá para a outra estação.
    const tower = mesh(new THREE.BoxGeometry(0.5, 0.26, 0.12), materials.roof, base)
    tower.position.set(0, 0.52, point === from ? 0.3 : -0.3)
    return new THREE.Vector3(point.x, floor + 0.6, point.z)
  }
  const start = station(from), end = station(to)

  // Cabo: curva de catenária (aproximada por parábola), com a flecha proporcional ao vão.
  const span = start.distanceTo(end)
  const sag = span * 0.06
  const along = (t, offset) => new THREE.Vector3(
    THREE.MathUtils.lerp(start.x, end.x, t) + sideX * offset,
    THREE.MathUtils.lerp(start.y, end.y, t) - sag * 4 * t * (1 - t),
    THREE.MathUtils.lerp(start.z, end.z, t) + sideZ * offset,
  )
  const curves = [-RAIL, RAIL].map(offset => {
    const points = Array.from({ length: 21 }, (_, i) => along(i / 20, offset))
    const curve = new THREE.CatmullRomCurve3(points)
    mesh(new THREE.TubeGeometry(curve, 40, 0.012, 4, false), materials.cable)
    return offset
  })

  // Cabine: corpo vermelho com faixa de vidro, pendurada por uma haste no cabo.
  const cabin = () => {
    const holder = new THREE.Group()
    group.add(holder)
    const hanger = mesh(new THREE.BoxGeometry(0.025, 0.2, 0.025), materials.cable, holder)
    hanger.position.y = -0.1
    const body = mesh(new THREE.BoxGeometry(0.26, 0.2, 0.34), materials.cabin, holder)
    body.position.y = -0.3
    const band = mesh(new THREE.BoxGeometry(0.27, 0.08, 0.35), materials.glass, holder)
    band.position.y = -0.27
    const top = mesh(new THREE.BoxGeometry(0.2, 0.04, 0.26), materials.roof, holder)
    top.position.y = -0.18
    holder.rotation.y = heading
    return holder
  }
  const cabins = curves.map(cabin)

  // Ida e volta a cada 28 s, parando 4 s em cada estação; as duas cabines andam em sentidos opostos.
  const PERIOD = 28, PAUSE = 4
  const progress = time => {
    const phase = time % PERIOD, travel = PERIOD / 2 - PAUSE
    const leg = phase < PERIOD / 2 ? phase : phase - PERIOD / 2
    const t = THREE.MathUtils.clamp((leg - PAUSE / 2) / travel, 0, 1)
    const eased = t * t * (3 - 2 * t)
    return phase < PERIOD / 2 ? eased : 1 - eased
  }
  const update = time => {
    const t = THREE.MathUtils.clamp(0.04 + progress(time) * 0.92, 0, 1)
    cabins[0].position.copy(along(t, curves[0]))
    cabins[1].position.copy(along(1 - t, curves[1]))
  }
  update(0.5)

  const dispose = () => {
    for (const geometry of geometries) geometry.dispose()
    for (const material of Object.values(materials)) material.dispose()
  }
  return { group, update, dispose }
}
