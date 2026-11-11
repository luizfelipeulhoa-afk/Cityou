import { buildPlaceholder } from '../world/monuments.js'
import { fitModel } from '../world/SpaceMarker.js'
import * as THREE from 'three'
import { getCityLayout, isPilotCity, tileKey } from '../../shared/game/city-layout.js'
import { createPilotBuilding } from './pilotArchitecture.js'

const palette = {
  sandstone: 0xc7ad85, grass: 0x9dbc83, bright: 0xb0e34c, leaf: 0x92d343,
  trunk: 0x827055, cream: 0xf5ead1, charcoal: 0x303d3c, orange: 0xed7f42,
}

export function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.87, metalness: 0, ...options })
}

export function box(parent, width, height, depth, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function cylinder(parent, radius, height, x, y, z, mat, top = radius, segments = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, segments), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

function roundedBlock(width, depth, height, radius = 0.25) {
  const shape = new THREE.Shape()
  const x = -width / 2, y = -depth / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + depth - radius)
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth)
  shape.lineTo(x + radius, y + depth)
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 5 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

export function tree(parent, x, z, scale = 1) {
  const group = new THREE.Group()
  group.position.set(x, 0.04, z)
  group.scale.setScalar(scale)
  cylinder(group, 0.045, 0.36, 0, 0.18, 0, material(palette.trunk), 0.03, 6)
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), material(palette.bright))
  crown.position.set(0, 0.5, 0)
  crown.scale.set(1, 1.08, 0.95)
  crown.castShadow = true
  group.add(crown)
  const side = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), material(palette.leaf))
  side.position.set(0.13, 0.44, 0.06)
  side.castShadow = true
  group.add(side)
  parent.add(group)
  return group
}

function palm(parent, x, z, scale = 1) {
  const g = new THREE.Group()
  g.position.set(x, 0.03, z)
  g.scale.setScalar(scale)
  const trunk = cylinder(g, 0.04, 0.9, 0, 0.45, 0, material(palette.trunk), 0.025, 7)
  trunk.rotation.z = -0.1
  const leafMat = material(palette.bright, { side: THREE.DoubleSide })
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.quadraticCurveTo(0.21, 0.14, 0.65, 0)
    shape.quadraticCurveTo(0.26, -0.12, 0, 0)
    const leaf = new THREE.Mesh(new THREE.ShapeGeometry(shape, 5), leafMat)
    leaf.rotation.x = -Math.PI / 2 + 0.21
    leaf.rotation.z = a
    leaf.position.set(0.045, 0.88, 0)
    leaf.castShadow = true
    g.add(leaf)
  }
  parent.add(g)
}

function mountain(parent, x, z, width, height, depth, colors = [0x6c926d, 0x91ac85]) {
  const geometry = new THREE.SphereGeometry(1, 22, 15, 0, Math.PI * 2, 0, Math.PI / 2)
  const positions = geometry.attributes.position
  const vertexColors = []
  const base = new THREE.Color(colors[0])
  const peak = new THREE.Color(colors[1])
  for (let i = 0; i < positions.count; i++) {
    const h = positions.getY(i)
    const variation = 1 + 0.035 * Math.sin(positions.getX(i) * 9 + positions.getZ(i) * 6)
    positions.setXYZ(i, positions.getX(i) * width * variation, h * height, positions.getZ(i) * depth * variation)
    const color = base.clone().lerp(peak, Math.max(0, h - 0.25))
    vertexColors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material(0xffffff, { vertexColors: true, flatShading: false }))
  mesh.position.set(x, -0.5, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function christ(parent, x, y, z) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  const stone = material(0xf2eee0)
  box(g, 0.46, 0.15, 0.4, 0, 0.075, 0, material(0x9c9f8b))
  cylinder(g, 0.16, 0.69, 0, 0.49, 0, stone, 0.105, 7)
  const arms = box(g, 1.08, 0.1, 0.11, 0, 0.76, 0, stone)
  arms.rotation.z = 0.025
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), stone)
  head.position.y = 0.94
  g.add(head)
  parent.add(g)
}

function waveRibbon(parent, z, mat) {
  const vertices = [], indices = []
  for (let i = 0; i <= 180; i++) {
    const x = -9.3 + i * 18.6 / 180
    const curve = z + Math.sin(x * 2.7) * 0.17
    vertices.push(x, 0.081, curve - 0.038, x, 0.081, curve + 0.038)
    if (i < 180) {
      const j = i * 2
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  parent.add(new THREE.Mesh(geometry, mat))
}

function sailboat(parent, x, z, scale, angle = 0) {
  const g = new THREE.Group()
  g.position.set(x, -0.31, z)
  g.scale.setScalar(scale)
  g.rotation.y = angle
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 7), material(0xf4ead8))
  hull.scale.set(0.35, 0.2, 1)
  g.add(hull)
  cylinder(g, 0.011, 0.75, 0, 0.38, 0, material(0x717b73), 0.009, 5)
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.1)
  shape.lineTo(0, 0.78)
  shape.lineTo(0.35, 0.12)
  shape.closePath()
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(0xfff2d3, { side: THREE.DoubleSide }))
  g.add(sail)
  parent.add(g)
  return g
}

const regionalTerrain = {
  'ilha-inicial': { ground: 0xaac583, backdrop: 0x247e96, palms: true },
  'cristo-redentor': { ground: 0x8faf74 },
  'machu-picchu': { ground: 0x8f9c62, backdrop: 0x748653, hills: [0x688064, 0xa1ad87], hillHeight: 6, trees: 4 },
  'chichen-itza': { ground: 0xa0ad68, backdrop: 0x7f9a59, trees: 8 },
  coliseu: { ground: 0xb5a887, backdrop: 0xa3a180, trees: 3 },
  petra: { ground: 0xc89674, backdrop: 0xb38261, hills: [0x9b6957, 0xca987b], hillHeight: 4.6 },
  'taj-mahal': { ground: 0x9fb77f, backdrop: 0x88a36d, river: true, trees: 4 },
  'grande-muralha': { ground: 0x91a276, backdrop: 0x788b60, hills: [0x597756, 0x93a56b], hillHeight: 4.2, trees: 6 },
}

// O monumento é o pano de fundo da cidade. Era pequeno (5,4 de largura); agora é bem maior.
export const LANDMARK_FOOTPRINT = 8.8
export const LANDMARK_HEIGHT = 7.6

function addLandmark(parent, region, x, y, z) {
  const landmark = new THREE.Group()
  landmark.name = `landmark:${region.id}`
  landmark.position.set(x, y, z)
  landmark.add(fitModel(buildPlaceholder(region.placeholder), LANDMARK_FOOTPRINT, LANDMARK_HEIGHT))
  parent.add(landmark)
  return landmark
}

function addRegionalScenery(group, terrain) {
  const surroundings = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), material(terrain.backdrop))
  surroundings.rotation.x = -Math.PI / 2
  surroundings.position.y = -0.65
  surroundings.receiveShadow = true
  group.add(surroundings)

  if (terrain.hills) {
    mountain(group, -11, -15, 5, terrain.hillHeight, 4, terrain.hills)
    mountain(group, 10, -17, 6, terrain.hillHeight * 0.8, 4, terrain.hills)
  }
  if (terrain.palms) {
    for (const x of [-8, -5, 5, 8]) palm(group, x, -9, 1.2)
  }
  for (let i = 0; i < (terrain.trees ?? 0); i++) {
    const x = (i % 2 ? 1 : -1) * (4.4 + Math.floor(i / 2) * 1.75)
    const planted = tree(group, x, -11 - i % 3, 1 + 0.12 * (i % 3))
    planted.position.y = -0.65
  }
  if (terrain.river) {
    box(group, 5, 0.04, 100, 13, -0.64, 0, material(0x4e8994))
  }
}

function sceneryTiles(group, name, cells, geometry) {
  if (cells.length === 0) return
  const tiles = new THREE.InstancedMesh(geometry ?? new THREE.BoxGeometry(1, 1, 1), material(0xffffff), cells.length)
  tiles.name = name
  tiles.receiveShadow = true
  const item = new THREE.Object3D()
  const color = new THREE.Color()
  for (const [index, { position, scale, tint }] of cells.entries()) {
    item.position.set(...position)
    item.scale.set(...scale)
    item.updateMatrix()
    tiles.setMatrixAt(index, item.matrix)
    tiles.setColorAt(index, color.set(tint))
  }
  group.add(tiles)
}

function slopeHeight(x, y, min) {
  return 0.6 + (4.6 - Math.min(3, (y - min) * 0.25)) *
    (0.52 + Math.sin(x * 0.26 + 0.7) ** 2 * 0.45)
}

function pilotIsland(group, layout, shore) {
  const dock = material(0x916747)
  const trim = material(0xc79d70)
  const [entryX, entryY] = layout.entry
  const x = entryX - layout.center
  const z = entryY - layout.center
  box(group, 1.2, 0.14, 5.3, x, 0.055, z - 1.05, dock)
  box(group, 3.5, 0.15, 1.55, x, 0.058, z + 1.6, dock)
  const pilings = [-1.6, -0.46, 0.46, 1.6].map(offset => ({
    position: [x + offset, -0.14, z + 1.95], scale: [0.1, 0.78, 0.1], tint: 0x6f4d36,
  }))
  sceneryTiles(group, 'Pilares do cais', pilings)
  for (const side of [-0.53, 0.53]) box(group, 0.04, 0.035, 4.9, x + side, 0.15, z - 1.15, trim)
  const boats = [
    sailboat(group, x - 2.1, z + 1.35, 1.65, 0.75),
    sailboat(group, x + 2.25, z + 2.12, 1.22, -0.45),
  ]
  const palmShore = shore.filter(({ position: [px, , pz] }) => pz < z - 3 || Math.abs(px - x) > 4)
  for (let i = 1; i < palmShore.length; i += 9) {
    const [px, , pz] = palmShore[i].position
    palm(group, px, pz, 0.82 + (i % 4) * 0.12)
  }
  const reef = shore.map(({ position: [px, , pz] }, index) => ({
    position: [px * 1.06, -0.43, pz * 1.06],
    scale: [0.32 + (index % 4) * 0.11, 0.12, 0.22 + (index % 3) * 0.1],
    tint: index % 2 ? 0x498c88 : 0x5eaaa1,
  }))
  sceneryTiles(group, 'Recife raso', reef)
  return (time, reducedMotion) => {
    if (reducedMotion) return
    for (let i = 0; i < boats.length; i++) boats[i].rotation.z = Math.sin(time * 0.7 + i) * 0.035
  }
}

function pilotRio(group, layout, shore) {
  const segments = shore.map(({ position: [x, , z] }) => ({ x, z }))
  const edge = new Map()
  for (const { x, z } of segments) {
    if (!edge.has(x) || z < edge.get(x)) edge.set(x, z)
  }
  const coast = [...edge].map(([x, z]) => ({ x, z }))
  sceneryTiles(group, 'Passeio de pedra clara na orla', coast.map(({ x, z }) => ({
    position: [x, 0.01, z], scale: [1, 0.12, 0.98], tint: 0xd8c7a3,
  })))
  sceneryTiles(group, 'Ciclovia costeira', coast.map(({ x, z }) => ({
    position: [x, 0.075, z - 0.3], scale: [1, 0.017, 0.18], tint: 0xc58461,
  })))
  // A small repeating wave evokes local paving while following the authored coastline.
  const ribbons = coast.flatMap(({ x, z }) => Array.from({ length: 5 }, (_, sample) => {
    const along = x - 0.4 + sample * 0.2
    return {
      position: [along, 0.079, z + 0.07 + Math.sin(along * 2.9) * 0.105],
      scale: [0.205, 0.015, 0.056], tint: 0x4b5951,
    }
  }))
  sceneryTiles(group, 'Mosaico do passeio', ribbons)
  for (let index = 2; index < coast.length; index += 5) {
    const { x, z } = coast[index]
    tree(group, x, z + 0.24, 0.74)
  }
  const edgeLand = material(0x929b77)
  box(group, 22, 0.45, 22.5, -27.5, -0.226, -2.5, edgeLand)
  box(group, 22, 0.45, 29, 27.5, -0.226, -2.5, edgeLand)
  // Silhouettes beyond the grid give the Corcovado and the bay a separate horizon.
  mountain(group, -23, -19, 6.1, 6.5, 4.5)
  mountain(group, -18, -24, 5.8, 7.3, 5.3, [0x5c756a, 0x849d81])
  mountain(group, 10, -23, 8.1, 5.4, 5.2)
  mountain(group, 23, -16, 5.9, 4.8, 5.7, [0x708d78, 0x8ca28a])
  const [entryX, entryY] = layout.entry
  const x = entryX - layout.center, z = entryY - layout.center
  sceneryTiles(group, 'Entrada da avenida', [-0.34, 0.34].map(offset => ({
    position: [x + offset, 0.10, z + 0.39], scale: [0.06, 0.09, 0.43], tint: 0xf3ddaa,
  })))
}

function pilotWater(island) {
  const geometry = new THREE.PlaneGeometry(130, 130, 46, 46)
  geometry.rotateX(-Math.PI / 2)
  const colors = []
  const positions = geometry.attributes.position
  const shallow = new THREE.Color(island ? 0x7bd5c5 : 0x84adab)
  const deep = new THREE.Color(island ? 0x257a94 : 0x467483)
  const color = new THREE.Color()
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i)
    const distance = island
      ? Math.hypot(x / 15, z / 14)
      : Math.hypot(Math.max(0, Math.abs(x) - 14) / 12, (z - 12) / 17)
    const depth = THREE.MathUtils.smoothstep(distance, island ? 0.93 : 0, island ? 1.6 : 1.05)
    color.copy(shallow).lerp(deep, depth)
    color.multiplyScalar(1 + Math.sin(x * 0.47 + z * 0.34) * 0.022)
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const water = new THREE.Mesh(geometry, material(0xffffff, { roughness: 0.57, vertexColors: true }))
  water.position.y = -0.5
  water.name = island ? 'Lagoa e mar aberto' : 'Baía'
  water.receiveShadow = true
  return water
}

function pilotLand(group, cells) {
  const vertices = [], colors = []
  const corners = [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5]]
  const occupied = new Set(cells.map(({ x, z }) => tileKey(x, z)))
  for (const { x, z, tint } of cells) {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [dx, dz] = corners[index]
      vertices.push(x + dx, 0.015, z + dz)
      colors.push(tint.r, tint.g, tint.b)
    }
    const neighbors = [[-1, 0], [0, 1], [1, 0], [0, -1]]
    for (let edge = 0; edge < corners.length; edge++) {
      const [nx, nz] = neighbors[edge]
      if (occupied.has(tileKey(x + nx, z + nz))) continue
      const a = corners[edge], b = corners[(edge + 1) % corners.length]
      for (const [point, height] of [[a, 0.015], [a, -0.50], [b, -0.50], [a, 0.015], [b, -0.50], [b, 0.015]]) {
        vertices.push(x + point[0], height, z + point[1])
        colors.push(tint.r * 0.81, tint.g * 0.77, tint.b * 0.68)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material(0xffffff, { vertexColors: true }))
  mesh.name = 'Patamar edificável'
  mesh.receiveShadow = true
  group.add(mesh)
}

function pilotSlope(group, layout, slope, water) {
  if (slope.size === 0) return
  const vertices = [], colors = []
  const foot = new THREE.Color(0x829771), canopy = new THREE.Color(0x496c55)
  const color = new THREE.Color()
  const center = layout.center
  const slopePeak = (x, y) => {
    const edge = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) =>
      nx >= layout.min && nx <= layout.max && ny >= layout.min && ny <= layout.max && !slope.has(tileKey(nx, ny)))
    return slopeHeight(x, y, layout.min) * (edge ? 0.28 : 1)
  }
  const addVertex = ([x, y, height]) => {
    vertices.push(x - center, height, y - center)
    color.copy(foot).lerp(canopy, Math.min(1, height / 3.5))
    color.multiplyScalar(1 + Math.sin(x * 4.3 + y * 1.7) * 0.06)
    colors.push(color.r, color.g, color.b)
  }
  for (const [x, y] of layout.slopeTiles) {
    const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([dx, dy]) => {
      const neighbors = [[x, y], [x + dx, y], [x, y + dy], [x + dx, y + dy]]
      let sum = 0, count = 0
      for (const [nx, ny] of neighbors) {
        if (nx < layout.min || ny < layout.min || nx > layout.max || ny > layout.max) continue
        if (!slope.has(tileKey(nx, ny))) {
          const coast = water.has(tileKey(nx, ny))
          return [x + dx / 2, y + dy / 2, coast ? -0.25 : 0.015]
        }
        sum += slopePeak(nx, ny)
        count++
      }
      return [x + dx / 2, y + dy / 2, sum / count]
    })
    const peak = [x, y, slopePeak(x, y)]
    for (let i = 0; i < corners.length; i++) {
      addVertex(corners[i])
      addVertex(corners[(i + 1) % corners.length])
      addVertex(peak)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material(0xffffff, { vertexColors: true, flatShading: true }))
  mesh.name = 'Encosta protegida'
  mesh.receiveShadow = true
  group.add(mesh)
  const monument = layout.landmarks[0]
  const forest = layout.slopeTiles
    .filter(([x, y], index) => index % 5 === 0 && Math.hypot(x - monument.x, y - monument.y) > 3)
    .map(([x, y], index) => ({
      position: [x - center, slopePeak(x, y) + 0.28, y - center],
      scale: [0.28 + index % 3 * 0.085, 0.45 + index % 4 * 0.07, 0.35],
      tint: [0x647a4c, 0x506d53, 0x68835b][index % 3],
    }))
  sceneryTiles(group, 'Copas da encosta', forest, new THREE.IcosahedronGeometry(1, 0))
}

function createPilotEnvironment(group, region, layout) {
  const island = region.id === 'ilha-inicial'
  const floorColor = island ? 0xc2c297 : 0xaaa986
  const water = new Set(layout.waterTiles.map(([x, y]) => tileKey(x, y)))
  const slope = new Set(layout.slopeTiles.map(([x, y]) => tileKey(x, y)))
  group.add(pilotWater(island))
  const land = [], shore = []
  for (let y = layout.min; y <= layout.max; y++) for (let x = layout.min; x <= layout.max; x++) {
    const key = tileKey(x, y)
    const px = x - layout.center, pz = y - layout.center
    const around = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .filter(([ax, ay]) => ax >= layout.min && ax <= layout.max && ay >= layout.min && ay <= layout.max)
    if (water.has(key)) {
      const coastal = around.some(([ax, ay]) => !water.has(tileKey(ax, ay)))
      if (coastal) shore.push({ position: [px, -0.37, pz], scale: [1.002, 0.32, 1.002], tint: 0xdac6a0 })
      continue
    }
    if (slope.has(key)) continue
    const coast = around.some(([ax, ay]) => water.has(tileKey(ax, ay)))
    const tint = new THREE.Color(coast ? (island ? 0xe5d3a5 : 0xc4c6a2) : floorColor)
      .multiplyScalar(1 + (Math.abs(x * 19 + y * 13) % 11 - 5) * 0.002)
    land.push({ x: px, z: pz, tint })
  }
  pilotLand(group, land)
  pilotSlope(group, layout, slope, water)
  if (island) sceneryTiles(group, 'Faixa de areia protegida', shore)
  const animate = island ? pilotIsland(group, layout, shore) : () => {}
  if (!island) pilotRio(group, layout, shore)
  const site = layout.landmarks[0]
  const landmarkY = island ? -0.42 : slopeHeight(site.x, site.y, layout.min)
  const landmark = addLandmark(group, region, site.x - layout.center, landmarkY, site.y - layout.center)
  return { group, landmark, tileColor: island ? 0xdad0a7 : 0xc7c9ac, animate, lamps: [], setDusk() {} }
}

export function createEnvironment(scene, region) {
  const locationId = region?.id
  const terrain = regionalTerrain[locationId]
  const groundColor = terrain?.ground ?? palette.grass
  const tileColor = terrain ? new THREE.Color(groundColor).lerp(new THREE.Color(0xede2c3), 0.55) : 0xc9d5ae
  const group = new THREE.Group()
  group.name = region?.nome ?? 'Rio 2035 · Baía de Guanabara'
  scene.add(group)

  if (isPilotCity(locationId)) return createPilotEnvironment(group, region, getCityLayout(locationId))

  const land = new THREE.Mesh(roundedBlock(19, 19, 0.85, 1.05), [material(groundColor), material(palette.sandstone)])
  land.position.y = -0.84
  land.receiveShadow = true
  group.add(land)
  const ground = new THREE.Mesh(roundedBlock(18.72, 18.72, 0.08, 0.9), material(groundColor))
  ground.position.y = -0.03
  ground.receiveShadow = true
  group.add(ground)

  if (terrain?.backdrop) {
    addRegionalScenery(group, terrain)
    const landmark = addLandmark(group, region, 0, -0.65, -13.2)
    return { group, landmark, tileColor, animate() {}, lamps: [], setDusk() {} }
  }

  const oceanMat = material(0x247e96, { roughness: 0.4, metalness: 0.08 })
  oceanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uRioTime = { value: 0 }
    shader.vertexShader = `uniform float uRioTime; varying vec3 vRioPosition;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y += sin(position.x * 0.52 + uRioTime * 0.55) * 0.045 + sin(position.z * 0.82 + uRioTime * 0.38) * 0.032; vRioPosition = transformed;`)
    shader.fragmentShader = `uniform float uRioTime; varying vec3 vRioPosition;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat wave = sin(vRioPosition.x * 1.4 + vRioPosition.z * 2.1 + sin(vRioPosition.x * .9) * 1.8 + uRioTime * .65) * sin(vRioPosition.x * .76 - vRioPosition.z * 1.3 + uRioTime * .25); float glint = pow(max(0., wave), 12.); float deep = smoothstep(12., 65., length(vRioPosition.xz)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.022,.15,.23), deep * .45); diffuseColor.rgb += glint * .035;`)
    oceanMat.userData.shader = shader
  }
  const oceanGeometry = new THREE.PlaneGeometry(160, 160, 115, 115)
  oceanGeometry.rotateX(-Math.PI / 2)
  const ocean = new THREE.Mesh(oceanGeometry, oceanMat)
  ocean.position.y = -0.47
  ocean.receiveShadow = true
  group.add(ocean)

  // Rio's granite silhouettes are geometry, including the open-armed summit statue.
  mountain(group, 0, -14, 2.4, 5.2, 2.7, [0x728b88, 0xa2aaa0])
  mountain(group, -4.5, -14.8, 3.3, 2.1, 3.2)
  mountain(group, -12, -11, 4.3, 3.6, 3.4)
  mountain(group, -17, -18, 5.1, 2.5, 4.3)
  mountain(group, -4, -24, 7, 2.2, 4.6)
  mountain(group, 20, -23, 6, 2.8, 4.4)
  const landmark = region && addLandmark(group, region, -12, 3.08, -11)
  if (!landmark) christ(group, -12, 3.08, -11)

  // A walkable mosaic strip around the waterfront uses real, narrow stone ribbons.
  box(group, 18.8, 0.16, 1.35, 0, -0.01, 9.48, material(palette.cream))
  for (let i = 0; i < 4; i++) waveRibbon(group, 9.02 + i * 0.29, material(0x555a51, { side: THREE.DoubleSide }))
  box(group, 18.8, 0.075, 0.075, 0, 0.07, 10.15, material(palette.sandstone))
  box(group, 18.8, 0.05, 0.13, 0, 0.09, 8.83, material(palette.orange))
  const lampMat = material(0x565e54)
  const lampLight = material(0xffe6a3, { emissive: 0xffc568, emissiveIntensity: 0.4 })
  const lamps = []
  for (let x = -8; x <= 8; x += 4) {
    palm(group, x, 9.07, 0.84)
    cylinder(group, 0.018, 0.85, x + 0.65, 0.5, 10, lampMat, 0.015, 6)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), lampLight)
    lamp.position.set(x + 0.65, 0.94, 10)
    group.add(lamp)
    lamps.push(lamp)
    box(group, 0.43, 0.07, 0.15, x - 0.8, 0.2, 9.86, material(0x9e8160))
    box(group, 0.035, 0.15, 0.12, x - 0.94, 0.11, 9.86, lampMat)
    box(group, 0.035, 0.15, 0.12, x - 0.65, 0.11, 9.86, lampMat)
  }
  for (let i = 0; i < 12; i++) {
    const x = -8.75 + i * 1.58
    tree(group, x, -8.96, 0.8 + (i % 3) * 0.12)
    if (i % 2 === 0) tree(group, -9.05, -7.8 + i * 1.34, 0.9)
  }

  // A small timber pier and raised link anchor the island to the water.
  const deck = material(0xab9876), rail = material(0xe2d5b4)
  box(group, 4.7, 0.15, 0.95, 11.3, -0.05, 6.7, deck)
  box(group, 1.25, 0.14, 4.3, 13.35, -0.07, 7.75, deck)
  for (let x = 9.4; x < 14; x += 0.7) {
    box(group, 0.055, 0.75, 0.055, x, -0.34, 6.35, rail)
    box(group, 0.055, 0.75, 0.055, x, -0.34, 7.05, rail)
  }
  box(group, 4.7, 0.035, 0.03, 11.3, 0.3, 6.27, rail)
  box(group, 4.7, 0.035, 0.03, 11.3, 0.3, 7.12, rail)
  const boats = [sailboat(group, 13, 11, 1.3, 0.25), sailboat(group, -13, 8, 1.05, 0.9), sailboat(group, 20, 1, 1.8, -0.35)]
  const parasolMat = material(0xf2af65)
  for (const x of [-6.4, 4.8]) {
    cylinder(group, 0.015, 0.58, x, 0.35, 9.72, lampMat, 0.015, 5)
    const parasol = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.16, 8), parasolMat)
    parasol.position.set(x, 0.68, 9.72)
    group.add(parasol)
  }

  const peopleCount = 15
  const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.024, 0.065, 5), material(0xec9c61), peopleCount)
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 6, 4), material(0xe6bb8e), peopleCount)
  bodies.userData.decorative = true
  heads.userData.decorative = true
  bodies.castShadow = true
  group.add(bodies, heads)
  const dummy = new THREE.Object3D()
  const colors = [0xf5c96f, 0x436d7e, 0xe98455, 0xf0ebd9, 0x688c64]
  for (let i = 0; i < peopleCount; i++) bodies.setColorAt(i, new THREE.Color(colors[i % colors.length]))
  const animate = (time, reducedMotion) => {
    if (oceanMat.userData.shader) oceanMat.userData.shader.uniforms.uRioTime.value = reducedMotion ? 0 : time
    for (let i = 0; i < boats.length; i++) boats[i].rotation.z = reducedMotion ? 0 : Math.sin(time * 0.65 + i * 2) * 0.035
    for (let i = 0; i < peopleCount; i++) {
      const x = reducedMotion ? i * 1.15 - 8 : ((i * 1.15 + time * (i % 2 ? 0.055 : -0.05) + 80) % 17) - 8.5
      const z = 9.27 + (i % 3) * 0.23
      dummy.position.set(x, 0.14, z)
      dummy.updateMatrix()
      bodies.setMatrixAt(i, dummy.matrix)
      dummy.position.y = 0.197
      dummy.updateMatrix()
      heads.setMatrixAt(i, dummy.matrix)
    }
    bodies.instanceMatrix.needsUpdate = true
    heads.instanceMatrix.needsUpdate = true
  }
  animate(0, true)
  return { group, landmark, tileColor, animate, lamps, setDusk(value) { lampLight.emissiveIntensity = value ? 1.3 : 0.4 } }
}

// Prédio de uma atividade (área da vida), numa área de 2x2 (4 quadrados). Cada área tem a sua silhueta e todos são altos:
// a altura dá profundidade à cidade. O volume mostra a etapa: terreno, fundação, estrutura, acabamento e concluído.
// É um substituto em código até haver arte do Tripo para cada área.
const DOMAIN_PROFILES = {
  saude: { w: 1.5, d: 1.4, h: 3.8 },
  alimentacao: { w: 1.7, d: 1.5, h: 2.0 },
  financas: { w: 1.25, d: 1.25, h: 5.0 },
  estudos: { w: 1.6, d: 1.4, h: 2.6 },
  mente: { w: 1.5, d: 1.5, h: 3.0 },
  organizacao: { w: 1.35, d: 1.35, h: 4.4 },
}

// Fileiras de janelas na frente e na lateral direita de um corpo que começa em y0.
function windowRows(group, w, d, y0, top, glass) {
  const columns = w > 1.4 ? 3 : 2
  for (let y = y0 + 0.5; y < top - 0.25; y += 0.55) {
    for (let i = 0; i < columns; i++) box(group, 0.2, 0.26, 0.04, (i - (columns - 1) / 2) * (w / (columns + 0.4)), y, d / 2 + 0.01, glass)
    for (const z of [-0.26, 0.26]) box(group, 0.04, 0.26, 0.2, w / 2 + 0.01, y, z * d / 0.6, glass)
  }
}

export function createDomainBuilding(definition, stage) {
  const group = new THREE.Group()
  const domain = String(definition.id || '').replace('dom-', '')
  const profile = DOMAIN_PROFILES[domain] || DOMAIN_PROFILES.organizacao
  const color = definition.color || 0x7d9f91
  const body = material(color), trim = material(new THREE.Color(color).multiplyScalar(0.7).getHex())
  const concrete = material(0xcfc8b8), earth = material(0xb59f7d), wood = material(0x9b7a52)
  const glass = material(0x9fd0d6, { roughness: 0.2 }), dark = material(0x4d4a45), accent = material(0xf2e9cf)
  const etapa = Math.max(0, Math.min(4, Number(stage) || 0))
  const { w, d, h } = profile
  box(group, 1.9, 0.06, 1.9, 0, 0.03, 0, etapa >= 3 ? concrete : earth)

  if (etapa === 0) {
    for (const x of [-0.85, 0.85]) for (const z of [-0.85, 0.85]) box(group, 0.06, 0.45, 0.06, x, 0.28, z, wood)
    box(group, 0.9, 0.34, 0.04, 0, 0.5, 0.88, body)
    box(group, 0.7, 0.2, 0.04, 0, 0.5, 0.9, accent)
    group.userData.height = 0.75
  } else if (etapa === 1) {
    box(group, 1.7, 0.12, 1.7, 0, 0.12, 0)
    group.children.at(-1).material = concrete
    for (const [bw, bd, x, z] of [[1.7, 0.1, 0, -0.8], [1.7, 0.1, 0, 0.8], [0.1, 1.7, -0.8, 0], [0.1, 1.7, 0.8, 0]]) box(group, bw, 0.45, bd, x, 0.4, z, concrete)
    for (const x of [-0.4, 0.4]) box(group, 0.1, 0.7, 0.1, x, 0.55, 0, concrete)
    group.userData.height = 0.8
  } else if (etapa === 2) {
    const top = h * 0.55
    box(group, w + 0.1, 0.1, d + 0.1, 0, 0.11, 0, concrete)
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) box(group, 0.14, top, 0.14, x, 0.1 + top / 2, z, concrete)
    for (let y = 1.0; y < top; y += 1.0) box(group, w, 0.09, d, 0, y, 0, concrete)
    box(group, w, top * 0.4, 0.07, 0, 0.1 + top * 0.2, -d / 2 + 0.04, body)
    box(group, 0.07, top * 0.4, d, -w / 2 + 0.04, 0.1 + top * 0.2, 0, body)
    group.userData.height = top + 0.3
  } else if (etapa === 3) {
    const top = h * 0.8
    box(group, w, top, d, 0, 0.06 + top / 2, 0, body)
    box(group, w + 0.12, 0.1, d + 0.12, 0, top + 0.1, 0, concrete)
    windowRows(group, w, d, 0.06, top, glass)
    for (const x of [-0.75, 0, 0.75]) box(group, 0.05, top + 0.2, 0.05, x, (top + 0.2) / 2, d / 2 + 0.18, wood)
    for (let y = 1.0; y < top; y += 1.1) box(group, w + 0.3, 0.04, 0.04, 0, y, d / 2 + 0.18, wood)
    box(group, 0.32, 0.55, 0.05, 0, 0.34, d / 2 + 0.02, dark)
    group.userData.height = top + 0.3
  } else {
    let top = h
    if (domain === 'mente') {
      // Pagode de três andares: cada andar é menor que o de baixo e tem o seu beiral.
      const widths = [w, w * 0.78, w * 0.56]
      let y = 0.06
      for (const width of widths) {
        box(group, width, h / 3, width, 0, y + h / 6, 0, body)
        for (const x of [-1, 0, 1]) box(group, 0.14, 0.3, 0.04, x * width * 0.28, y + h / 6, width / 2 + 0.01, glass)
        box(group, width + 0.4, 0.1, width + 0.4, 0, y + h / 3 + 0.05, 0, trim)
        y += h / 3 + 0.1
      }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(widths[2] * 0.62, 0.8, 4), trim)
      cone.position.y = y + 0.4; cone.rotation.y = Math.PI / 4; group.add(cone)
      box(group, 0.05, 0.7, 0.05, 0, y + 1.1, 0, accent)
      top = y + 1.4
    } else {
      box(group, w, h, d, 0, 0.06 + h / 2, 0, body)
      box(group, w + 0.1, 0.1, d + 0.1, 0, h + 0.1, 0, trim)
      windowRows(group, w, d, 0.06, h, glass)
      box(group, 0.34, 0.58, 0.05, 0, 0.35, d / 2 + 0.02, dark)
      if (domain === 'saude') {
        box(group, 0.74, 0.22, 0.05, 0, h + 0.55, d / 2 - 0.05, material(0x58b86b))
        box(group, 0.22, 0.74, 0.05, 0, h + 0.55, d / 2 - 0.05, material(0x58b86b))
        box(group, w * 0.55, 0.5, d * 0.5, -0.3, h + 0.3, -0.2, concrete)
        top = h + 1
      } else if (domain === 'alimentacao') {
        box(group, 0.95, 0.7, 0.85, 0, h + 0.45, 0, material(0x9fd0d6, { roughness: 0.2, transparent: true, opacity: 0.8 }))
        box(group, 0.2, 2.1, 0.2, -w / 2 + 0.25, h + 1.1, -d / 2 + 0.25, trim)
        top = h + 2.1
      } else if (domain === 'financas') {
        box(group, w * 0.66, 0.9, d * 0.66, 0, h + 0.55, 0, body)
        box(group, w * 0.4, 0.7, d * 0.4, 0, h + 1.35, 0, trim)
        box(group, 0.05, 1.3, 0.05, 0, h + 2.35, 0, accent)
        top = h + 3
      } else if (domain === 'estudos') {
        const tower = h + 2.2
        box(group, 0.62, tower, 0.62, -w / 2 + 0.3, 0.06 + tower / 2, d / 2 - 0.3, body)
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 4), trim)
        roof.position.set(-w / 2 + 0.3, tower + 0.4, d / 2 - 0.3); roof.rotation.y = Math.PI / 4; group.add(roof)
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), accent)
        face.rotation.x = Math.PI / 2; face.position.set(-w / 2 + 0.3, tower - 0.5, d / 2 + 0.02); group.add(face)
        top = tower + 0.8
      } else {
        box(group, w * 0.5, 0.5, d * 0.5, 0.2, h + 0.3, -0.1, concrete)
        box(group, 0.05, 1.7, 0.05, 0.2, h + 1.2, -0.1, dark)
        top = h + 2
      }
    }
    group.userData.height = top
  }
  group.children.forEach(child => { child.castShadow = true; child.receiveShadow = true })
  return group
}

export function createCoreBuilding(kind, definition = {}, placement = null) {
  if (typeof kind === 'string' && kind.startsWith('dom-')) return createDomainBuilding(definition, placement?.etapa)
  const pilotBuilding = createPilotBuilding(kind, definition)
  if (pilotBuilding) return pilotBuilding
  const group = new THREE.Group()
  const white = material(0xf0eadc), dark = material(palette.charcoal), orange = material(palette.orange)
  if (kind === 'headquarters' || kind === 'hq') {
    const body = new THREE.Mesh(roundedBlock(0.82, 0.8, 0.67, 0.13), dark)
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)
    const roof = new THREE.Mesh(roundedBlock(0.7, 0.68, 0.05, 0.09), material(0x4b5750))
    roof.position.y = 0.67
    group.add(roof)
    box(group, 0.88, 0.07, 0.83, 0, 0.06, 0, material(0xd5c6a8))
    // The F is physical orange lettering on the south-facing headquarters facade.
    box(group, 0.08, 0.35, 0.025, -0.16, 0.4, 0.409, orange)
    box(group, 0.29, 0.075, 0.025, -0.055, 0.54, 0.409, orange)
    box(group, 0.22, 0.065, 0.025, -0.085, 0.415, 0.409, orange)
    box(group, 0.12, 0.2, 0.025, 0.22, 0.25, 0.412, material(0x98b9ad))
    box(group, 0.25, 0.035, 0.2, 0.23, 0.02, 0.49, white)
    group.scale.y = 1.35
    group.userData.height = 1.01
  }
  else if (kind === 'plaza') {
    box(group, 0.94, 0.055, 0.94, 0, 0.027, 0, material(0xe0d6bb))
    for (let i = -1; i <= 1; i++) box(group, 0.008, 0.005, 0.92, i * 0.3, 0.057, 0, material(0xc5b89f))
    cylinder(group, 0.23, 0.07, 0, 0.095, 0, material(0xbfb99c), 0.25, 18)
    cylinder(group, 0.2, 0.02, 0, 0.14, 0, material(0x88c5bc, { roughness: 0.22 }), 0.2, 18)
    cylinder(group, 0.035, 0.15, 0, 0.23, 0, white, 0.025, 8)
    group.userData.height = 0.32
  }
  else if (kind === 'road') {
    box(group, 1, 0.045, 0.94, 0, 0.022, 0, material(0x92998d))
    box(group, 1, 0.012, 0.1, 0, 0.05, -0.42, white)
    box(group, 1, 0.012, 0.1, 0, 0.05, 0.42, white)
    for (const x of [-0.32, 0, 0.32]) box(group, 0.13, 0.006, 0.025, x, 0.05, 0, material(0xe9d6a4))
    group.userData.height = 0.065
  }
  else if (kind === 'tree' || kind === 'park') {
    box(group, 0.86, 0.045, 0.86, 0, 0.02, 0, material(0x9cce7d))
    tree(group, -0.13, 0, 0.92)
    tree(group, 0.23, 0.19, 0.57)
    group.userData.height = 0.8
  }
  else if (kind === 'home' || kind === 'house') {
    box(group, 0.63, 0.46, 0.6, 0, 0.23, 0, material(0xe8dec6))
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.29, 4), material(0xc58557))
    roof.position.y = 0.6
    roof.rotation.y = Math.PI / 4
    group.add(roof)
    box(group, 0.13, 0.22, 0.025, 0, 0.11, 0.305, dark)
    box(group, 0.12, 0.12, 0.025, -0.2, 0.29, 0.306, material(0x99c4c0))
    box(group, 0.12, 0.12, 0.025, 0.2, 0.29, 0.306, material(0x99c4c0))
    group.userData.height = 0.76
  }
  else {
    const color = definition.color || 0x7d9f91
    box(group, 0.65, 0.18, 0.65, 0, 0.09, 0, material(color))
    box(group, 0.44, 0.055, 0.44, 0, 0.2, 0, white)
    group.userData.height = 0.24
    group.userData.placeholder = true
  }
  return group
}
