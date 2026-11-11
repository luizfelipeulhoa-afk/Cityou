import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const wall = 0xf4e8cd
const timber = 0x936446
const stone = 0xa2a898
const teal = 0x27656b
const navy = 0x305965
const brick = 0xc87351
const cane = 0xd2ac6e

// Build and merge the geometry for one building, including its vertex colors.
// Each version uses one material and is rendered in a single draw.
function coloredMesh(parts, mat) {
  const geometries = parts.map(({ shape, position, size, color }) => {
    let geometry
    if (shape === 'roof') {
      const profile = new THREE.Shape()
      profile.moveTo(-size[0] / 2, 0)
      profile.lineTo(size[0] / 2, 0)
      profile.lineTo(0, size[1])
      profile.closePath()
      geometry = new THREE.ExtrudeGeometry(profile, { depth: size[2], bevelEnabled: false })
      geometry.translate(0, 0, -size[2] / 2)
    } else if (shape === 'hull') {
      geometry = new THREE.SphereGeometry(0.5, 10, 5)
      geometry.scale(...size)
    } else {
      geometry = new THREE.BoxGeometry(...size)
    }
    if (geometry.index) {
      const flat = geometry.toNonIndexed()
      geometry.dispose()
      geometry = flat
    }
    geometry.deleteAttribute('uv')
    geometry.translate(...position)
    const rgb = new THREE.Color(color)
    const colors = new Float32Array(geometry.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
  })
  const geometry = mergeGeometries(geometries)
  geometries.forEach(part => part.dispose())
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function kit(width, depth) {
  const parts = [], details = []
  const add = (shape, [x, y, z], [w, h, d], color, near) => {
    ;(near ? details : parts).push({
      shape, position: [x * width, y, z * depth], size: [w * width, h, d * depth], color,
    })
  }
  const box = (x, y, z, w, h, d, color, near = false) => add('box', [x, y, z], [w, h, d], color, near)
  const roof = (x, y, z, w, h, d, color) => add('roof', [x, y, z], [w, h, d], color, false)
  const hull = (x, y, z, w, h, d, color) => add('hull', [x, y, z], [w, h, d], color, false)
  const slab = (color = stone) => box(0, 0.04, 0, 0.91, 0.08, 0.91, color)
  const column = (x, z, height, color = timber) => box(x, 0.08 + height / 2, z, 0.036, height, 0.037, color)
  const screen = (x, z, color, y = 0.48) => {
    box(x, y, z, 0.16, 0.33, 0.03, color)
    for (const dx of [-0.045, 0, 0.045]) box(x + dx, y, z + 0.019, 0.011, 0.31, 0.006, wall, true)
  }
  const awning = (y, color, z = 0.36, w = 0.78) => {
    box(0, y, z, w, 0.08, 0.19, color)
    for (let i = 0; i < 6; i++) box((i - 2.5) * w / 6, y + 0.015, z + 0.085, w / 13, 0.095, 0.025, wall, true)
  }
  return { parts, details, box, roof, hull, slab, column, screen, awning }
}

const designs = {
  'rio-sobrado'({ box, roof, slab, screen, awning }) {
    slab()
    box(0, 0.69, -0.04, 0.79, 1.22, 0.69, 0xe4b784)
    roof(0, 1.30, -0.04, 0.88, 0.34, 0.75, brick)
    box(0, 0.37, 0.316, 0.61, 0.54, 0.03, teal)
    awning(0.65, 0xa6433b)
    for (const x of [-0.24, 0, 0.24]) {
      screen(x, 0.314, navy, 1.01)
      box(x, 0.83, 0.34, 0.19, 0.035, 0.09, wall, true)
    }
    box(0, 0.54, 0.341, 0.58, 0.045, 0.025, cane, true)
    return 1.64
  },
  'rio-botequim'({ box, slab, awning, screen }) {
    slab(0xc2b89b)
    box(0, 0.48, -0.06, 0.73, 0.8, 0.66, 0xf0d0a0)
    box(0, 0.90, -0.06, 0.82, 0.10, 0.74, 0x436357)
    box(0.1, 0.41, 0.282, 0.36, 0.64, 0.035, 0x1e4547)
    screen(-0.23, 0.282, teal, 0.48)
    awning(0.70, 0x3c7772)
    for (const x of [-0.24, 0.22]) {
      box(x, 0.21, 0.405, 0.14, 0.045, 0.085, brick, true)
      box(x, 0.13, 0.405, 0.035, 0.17, 0.035, navy, true)
    }
    return 0.95
  },
  'rio-kiosk'({ box, slab, column, awning }) {
    slab(0xd2c4a9)
    box(0, 0.36, -0.12, 0.42, 0.56, 0.44, 0x56918c)
    for (const x of [-0.37, 0.37]) for (const z of [-0.31, 0.31]) column(x, z, 0.81, navy)
    box(0, 0.94, 0, 0.91, 0.085, 0.77, 0xf0d888)
    awning(0.83, 0x337b86, 0.29)
    box(0, 0.54, 0.16, 0.51, 0.075, 0.13, wall)
    for (const x of [-0.15, 0, 0.15]) box(x, 0.70, 0.327, 0.052, 0.16, 0.024, brick, true)
    return 0.99
  },
  'rio-fair'({ box, roof, slab, column }) {
    slab(0xc9bfb0)
    for (const x of [-0.32, 0, 0.32]) {
      roof(x, 0.90, 0, 0.33, 0.26, 0.86, 0xc17256)
      for (const z of [-0.36, 0.36]) column(x - 0.13, z, 0.84, 0x416e6b)
      box(x, 0.27, 0.04, 0.20, 0.38, 0.43, 0xf3ca75)
      box(x, 0.48, 0.04, 0.23, 0.065, 0.47, wall)
      box(x, 0.67, 0.33, 0.23, 0.07, 0.04, teal, true)
      for (const dx of [-0.06, 0.06]) box(x + dx, 0.53, 0.12, 0.08, 0.05, 0.11, brick, true)
    }
    return 1.16
  },
  'rio-samba'({ box, roof, slab, column }) {
    slab(0xaab8ab)
    box(0, 0.48, -0.09, 0.83, 0.8, 0.64, 0x348285)
    roof(0, 0.89, -0.055, 0.95, 0.37, 0.81, 0x41797c)
    box(0, 0.44, 0.25, 0.59, 0.59, 0.025, navy)
    box(0, 0.80, 0.33, 0.91, 0.1, 0.16, 0xe5b34f)
    for (const x of [-0.41, 0.41]) column(x, 0.38, 0.7, wall)
    for (let i = -4; i <= 4; i++) box(i * 0.088, 0.73, 0.409, 0.045, 0.11, 0.012, i % 2 ? wall : 0xe8bf56, true)
    return 1.26
  },
  'island-house'({ box, roof, slab, column, screen }) {
    slab(0xd4c39f)
    box(0, 0.45, -0.07, 0.70, 0.71, 0.59, 0xf3e8ce)
    roof(0, 0.80, -0.02, 0.88, 0.31, 0.78, 0xa86248)
    box(0, 0.15, 0.29, 0.74, 0.13, 0.23, timber)
    for (const x of [-0.34, 0.34]) column(x, 0.32, 0.73)
    screen(-0.21, 0.232, teal)
    box(0.16, 0.4, 0.234, 0.16, 0.49, 0.035, 0x327b7a)
    box(0, 0.71, 0.248, 0.59, 0.06, 0.018, navy, true)
    return 1.11
  },
  'island-hall'({ box, roof, slab, column }) {
    slab(0xcaba98)
    box(0, 0.28, -0.30, 0.75, 0.39, 0.10, 0xefd3a7)
    for (const x of [-0.35, 0, 0.35]) for (const z of [-0.30, 0.32]) column(x, z, 0.73, timber)
    roof(0, 0.82, 0, 0.91, 0.34, 0.87, 0x598679)
    roof(0, 1.12, 0, 0.52, 0.19, 0.52, 0x7d9a75)
    box(0, 0.16, 0.12, 0.74, 0.15, 0.55, 0xe8d6a6)
    for (const x of [-0.20, 0.20]) box(x, 0.25, 0.13, 0.27, 0.045, 0.24, cane, true)
    return 1.31
  },
  'island-dhoni'({ box, roof, hull, slab, column }) {
    slab(0xcbb999)
    for (const x of [-0.36, 0.36]) for (const z of [-0.30, 0.33]) column(x, z, 0.82, timber)
    roof(0, 0.92, -0.02, 0.91, 0.24, 0.83, 0x446e71)
    hull(0, 0.30, 0.035, 0.71, 0.31, 0.32, 0x77533a)
    hull(0, 0.345, 0.035, 0.67, 0.22, 0.27, 0xb07e4b)
    box(0, 0.18, -0.22, 0.64, 0.22, 0.16, cane)
    for (const x of [-0.18, 0, 0.18]) box(x, 0.42, 0.035, 0.018, 0.035, 0.24, wall, true)
    return 1.16
  },
  'island-market'({ box, roof, slab, column }) {
    slab(0xc8be9e)
    for (const x of [-0.29, 0.29]) {
      for (const z of [-0.34, 0.34]) column(x, z, 0.69, teal)
      box(x, 0.23, 0.085, 0.25, 0.31, 0.44, 0x589c9a)
      box(x, 0.415, 0.085, 0.28, 0.06, 0.49, wall)
      for (const dx of [-0.074, 0.074]) box(x + dx, 0.469, 0.09, 0.11, 0.042, 0.23, navy, true)
    }
    roof(0, 0.77, -0.02, 0.95, 0.33, 0.88, 0x76a29a)
    box(0, 0.68, 0.416, 0.74, 0.07, 0.047, teal)
    return 1.1
  },
  'island-fiber'({ box, roof, slab, column }) {
    slab(0xd4c2a0)
    box(0, 0.39, -0.12, 0.77, 0.62, 0.52, 0xe5d0a0)
    for (const x of [-0.35, 0.35]) column(x, 0.30, 0.61)
    roof(0, 0.71, -0.015, 0.92, 0.42, 0.87, 0xa77f51)
    box(0, 0.30, 0.36, 0.38, 0.36, 0.026, cane)
    for (let i = -4; i <= 4; i++) box(i * 0.038, 0.3, 0.377, 0.008, 0.34, 0.008, timber, true)
    for (let i = -3; i <= 3; i++) box(0, 0.3 + i * 0.048, 0.381, 0.37, 0.009, 0.008, wall, true)
    return 1.13
  },
}

export function createPilotBuilding(kind, definition) {
  const design = designs[kind]
  if (!Object.hasOwn(designs, kind)) return null
  const pieces = kit(Number(definition.width) || 1, Number(definition.depth) || 1)
  const height = design(pieces)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.87 })
  const model = new THREE.LOD()
  model.name = definition.label || kind
  model.userData.height = height
  model.addLevel(coloredMesh([...pieces.parts, ...pieces.details], material), 0)
  model.addLevel(coloredMesh(pieces.parts, material), 19, 0.10)
  return model
}
