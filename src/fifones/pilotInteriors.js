import { BoxGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SphereGeometry } from 'three'

const interiors = {
  'rio-fair': { label: 'Organizar bancas', destination: '/#/tarefas', floor: 0xd8b38d, wall: 0xf0dbb6, accent: 0xb65a42 },
  'rio-samba': { label: 'Ver programação', destination: '/#/agenda', floor: 0xbd9569, wall: 0xf3e8d0, accent: 0x39745d },
  'island-dhoni': { label: 'Ver trabalhos da oficina', destination: '/#/projetos', floor: 0xbea681, wall: 0xe4d8bd, accent: 0x2c8d87 },
  'island-market': { label: 'Organizar o mercado', destination: '/#/tarefas', floor: 0xd9c39c, wall: 0xf0e5c7, accent: 0x287885 },
}

function furnishing(group, materials, [width, height, depth, x, y, z, color]) {
  if (!materials.has(color)) materials.set(color, new MeshStandardMaterial({ color, roughness: 0.86 }))
  const mesh = new Mesh(new BoxGeometry(width, height, depth), materials.get(color))
  mesh.position.set(x, y + height / 2, z)
  group.add(mesh)
}

export function getInterior(kind) {
  return interiors[kind]
}

export function buildInterior(kind, { width, depth }) {
  const design = getInterior(kind)
  if (!design) return null

  const group = new Group()
  const materials = new Map()
  const box = (w, h, d, x, y, z, color) => furnishing(group, materials, [w, h, d, x, y, z, color])
  const side = width * 0.32
  const rear = -depth * 0.40
  const wallHeight = 0.68

  box(width - 0.04, 0.09, depth - 0.04, 0, -0.08, 0, design.floor)
  box(width - 0.08, wallHeight, 0.10, 0, 0, -depth / 2 + 0.08, design.wall)
  box(0.10, wallHeight, depth * 0.57, -width / 2 + 0.08, 0, -depth * 0.19, design.wall)
  box(width * 0.74, 0.025, 0.08, 0, 0.02, depth * 0.38, design.accent)

  if (kind === 'rio-fair' || kind === 'island-market') {
    for (const x of [-side, side]) {
      for (const z of [-depth * 0.16, depth * 0.18]) {
        box(width * 0.20, 0.27, depth * 0.22, x, 0, z, design.accent)
        box(width * 0.24, 0.06, depth * 0.23, x, 0.27, z, 0xf6ead2)
        for (const offset of [-0.09, 0.09]) {
          box(0.12, 0.06, 0.17, x + offset, 0.33, z, kind === 'rio-fair' ? 0xc99748 : 0x7195a7)
        }
      }
    }
  } else if (kind === 'rio-samba') {
    box(width * 0.65, 0.02, depth * 0.60, 0, 0.01, depth * 0.04, 0xdfbe88)
    box(width * 0.27, 0.30, 0.19, -side, 0, rear, 0x865944)
    for (const x of [-0.25, 0, 0.25]) box(0.15, 0.29, 0.15, x, 0, -depth * 0.23, design.accent)
    box(width * 0.32, 0.09, 0.15, side, 0.11, depth * 0.25, 0x865944)
  } else {
    box(width * 0.22, 0.29, depth * 0.38, -side, 0, 0.02, 0x8c6746)
    box(width * 0.25, 0.06, depth * 0.40, -side, 0.29, 0.02, 0xe9c98a)
    const halfBeam = width * 0.11
    const halfLength = depth * 0.34
    const outline = new Shape()
    outline.moveTo(0, halfLength)
    outline.quadraticCurveTo(halfBeam, halfLength * 0.26, halfBeam, -halfLength * 0.48)
    outline.lineTo(halfBeam * 0.56, -halfLength)
    outline.lineTo(-halfBeam * 0.56, -halfLength)
    outline.lineTo(-halfBeam, -halfLength * 0.48)
    outline.quadraticCurveTo(-halfBeam, halfLength * 0.26, 0, halfLength)
    const hull = new Mesh(
      new ExtrudeGeometry(outline, { depth: 0.09, bevelEnabled: false, curveSegments: 5 }),
      new MeshStandardMaterial({ color: 0x805437, roughness: 0.91 }),
    )
    hull.rotation.x = -Math.PI / 2
    hull.position.set(side * 0.36, 0.14, 0.04)
    group.add(hull)
    for (const z of [-0.22, 0, 0.23]) {
      box(halfBeam * 1.63, 0.035, 0.055, hull.position.x, 0.23, z, 0xdcb67b)
    }
    box(0.055, 0.22, 0.075, hull.position.x, 0.16, 0.07 - halfLength, 0xaa7547)
    box(halfBeam * 1.25, 0.07, 0.08, hull.position.x, 0.05, halfLength * 0.52, 0x4f5b50)
  }

  box(width * 0.25, 0.33, 0.12, side, 0.17, rear, design.accent)
  const hotspot = new Mesh(
    new SphereGeometry(0.09, 10, 6),
    new MeshStandardMaterial({ color: 0xffd26e, emissive: 0xd79938, emissiveIntensity: 0.65 }),
  )
  hotspot.position.set(side, 0.57, rear + 0.1)
  hotspot.userData.action = 'workspace'
  group.add(hotspot)

  return group
}
