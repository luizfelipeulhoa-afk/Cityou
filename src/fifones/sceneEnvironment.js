import { buildPlaceholder } from '../world/monuments.js'
import { fitModel } from '../world/SpaceMarker.js'
import * as THREE from 'three'

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

export const LANDMARK_FOOTPRINT = 5.4
export const LANDMARK_HEIGHT = 4.5

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

export function createEnvironment(scene, region) {
  const locationId = region?.id
  const terrain = regionalTerrain[locationId]
  const groundColor = terrain?.ground ?? palette.grass
  const tileColor = terrain ? new THREE.Color(groundColor).lerp(new THREE.Color(0xede2c3), 0.55) : 0xc9d5ae
  const group = new THREE.Group()
  group.name = region?.nome ?? 'Rio 2035 · Baía de Guanabara'
  scene.add(group)

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
    const landmark = addLandmark(group, region, 0, -0.65, -13.5)
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

export function createCoreBuilding(kind, definition = {}) {
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
