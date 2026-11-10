// Monumentos low poly do mapa-mundo, construídos em código.
// Cada um é feito de sólidos simples (caixas, cilindros, cones), facetados e em cores chapadas, no mesmo
// estilo do globo. São nítidos em qualquer tamanho, pesam poucos KB e não dependem de GLB.
// Convenções: base em Y=0, frente em +Z, ~1 unidade de diâmetro; fitModel() normaliza o resto.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const CYL = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg)
const BOX = (x, y, z) => new THREE.BoxGeometry(x, y, z)
const CONE = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg)
const ICO = (r, d = 0) => new THREE.IcosahedronGeometry(r, d)
const V2 = (x, y) => new THREE.Vector2(x, y)

function part(group, geometry, color, t = {}) {
  const mesh = new THREE.Mesh(geometry)
  mesh.userData.color = color
  mesh.position.set(t.x || 0, t.y || 0, t.z || 0)
  mesh.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ')
  mesh.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1)
  group.add(mesh)
  return mesh
}

// Prisma triangular deitado (telhado, frontão): base `w` x `d`, altura `h`, cumeeira ao longo de Z.
function gable(w, h, d) {
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)])
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false })
  geo.translate(0, 0, -d / 2)
  return geo
}

function hexBase(g, top, side) {
  part(g, CYL(0.5, 0.44, 0.08), side, { y: 0.04 })
  part(g, CYL(0.47, 0.5, 0.06), top, { y: 0.11 })
}

function rock(g, x, y, z, r, color = '#9aa5b1', ry = 0) {
  part(g, ICO(r), color, { x, y: y + r * 0.35, z, sy: 0.7, ry })
}

function tree(g, x, y, z, h = 0.1) {
  part(g, CYL(0.008, 0.012, h * 0.4, 4), '#8a6a45', { x, y: y + h * 0.2, z })
  part(g, CONE(h * 0.36, h * 0.85, 5), '#3fae5c', { x, y: y + h * 0.4 + h * 0.4, z })
}

function palm(g, x, y, z, h, lean, turn = 0) {
  part(g, CYL(0.018, 0.03, h, 5), '#b07d4f', { x, y: y + h / 2, z, rz: lean })
  const tx = x - Math.sin(lean) * h / 2, ty = y + h / 2 + Math.cos(lean) * h / 2
  for (let i = 0; i < 6; i++) {
    const leaf = BOX(0.2, 0.012, 0.06)
    leaf.translate(0.1, 0, 0)
    part(g, leaf, i % 2 ? '#2fb35e' : '#43c96f', { x: tx, y: ty, z, ry: turn + i * Math.PI / 3, rz: -0.5 })
  }
  part(g, ICO(0.026), '#7a5532', { x: tx, y: ty - 0.02, z })
}

const MONUMENTS = {
  ilha(g) {
    part(g, CYL(0.52, 0.54, 0.05), '#6fe6dc', { y: 0.025 })
    part(g, CYL(0.36, 0.44, 0.07, 7), '#f7e2a8', { y: 0.085 })
    part(g, CYL(0.22, 0.3, 0.05, 7), '#f1d48f', { y: 0.145 })
    palm(g, -0.08, 0.16, 0.02, 0.36, 0.18, 0.2)
    palm(g, 0.15, 0.13, -0.1, 0.28, -0.3, 0.9)
    rock(g, 0.22, 0.13, 0.18, 0.06)
    rock(g, -0.27, 0.12, -0.14, 0.04, '#b3bcc6')
  },

  // Cristo Redentor: figura de túnica branca, braços abertos em T, pedestal e morro íngreme.
  cristo(g) {
    hexBase(g, '#79cf6b', '#5a9b55')
    // Morro: três degraus de relevo e rochas à vista.
    part(g, CYL(0.3, 0.46, 0.15, 7), '#6cc35f', { y: 0.19 })
    part(g, CYL(0.15, 0.3, 0.15, 7), '#5fb757', { y: 0.34, ry: 0.4 })
    part(g, CYL(0.09, 0.15, 0.09, 7), '#74c868', { y: 0.46 })
    rock(g, -0.3, 0.15, 0.18, 0.07)
    rock(g, 0.3, 0.17, 0.1, 0.06, '#b3bcc6')
    rock(g, 0.08, 0.25, 0.28, 0.05, '#9aa5b1')
    tree(g, -0.38, 0.12, -0.12, 0.12)
    tree(g, 0.36, 0.12, -0.2, 0.1)
    // Pedestal em dois blocos.
    part(g, BOX(0.17, 0.06, 0.17), '#cfcabd', { y: 0.535 })
    part(g, BOX(0.12, 0.1, 0.12), '#e3dfd2', { y: 0.615 })
    // Túnica: corpo alto que afina para os ombros, com a barra mais larga e uma faixa sombreada.
    part(g, CYL(0.048, 0.085, 0.34, 6), '#f4f1ea', { y: 0.835 })
    part(g, CYL(0.07, 0.085, 0.05, 6), '#dcd7ca', { y: 0.69 })
    part(g, CYL(0.05, 0.05, 0.04, 6), '#dcd7ca', { y: 0.93 })
    // Ombros e braços retos, em T: braço grosso perto do ombro, antebraço mais fino e mão.
    const sy = 1.0
    part(g, BOX(0.15, 0.06, 0.08), '#f4f1ea', { y: sy })
    for (const sgn of [-1, 1]) {
      part(g, BOX(0.17, 0.052, 0.062), '#f4f1ea', { x: sgn * 0.16, y: sy })
      part(g, BOX(0.15, 0.04, 0.05), '#ece8dd', { x: sgn * 0.315, y: sy })
      part(g, BOX(0.04, 0.045, 0.04), '#e3dfd2', { x: sgn * 0.41, y: sy })
      part(g, BOX(0.17, 0.014, 0.07), '#dcd7ca', { x: sgn * 0.16, y: sy - 0.03 })
    }
    // Pescoço, cabeça e cabelo.
    part(g, CYL(0.018, 0.022, 0.035, 5), '#f4f1ea', { y: 1.045 })
    part(g, ICO(0.04), '#f4f1ea', { y: 1.09 })
    part(g, ICO(0.043), '#cfcabd', { y: 1.095, z: -0.012, sy: 0.9 })
  },

  // Machu Picchu: terraços em degraus, casas de pedra com telhado de palha e o pico pontudo atrás.
  machu(g) {
    hexBase(g, '#7ccf6a', '#5f9d58')
    // Pico principal e pico menor (Huayna Picchu), com faces escuras e claras.
    part(g, CONE(0.3, 0.78, 5), '#5aa95f', { x: 0.04, y: 0.5, z: -0.3, ry: 0.3 })
    part(g, CONE(0.14, 0.34, 5), '#8aa46a', { x: 0.04, y: 0.72, z: -0.3, ry: 0.3 })
    part(g, CONE(0.2, 0.55, 5), '#4f9a58', { x: 0.34, y: 0.4, z: -0.2, ry: 1 })
    part(g, CONE(0.19, 0.5, 5), '#4a9453', { x: -0.33, y: 0.38, z: -0.2, ry: 0.5 })
    // Terraços: lajes que sobem em faixas, com muros de pedra na frente de cada uma.
    const tiers = [[0.46, 0.17, '#86d36f'], [0.38, 0.235, '#76c863'], [0.3, 0.3, '#86d36f'], [0.22, 0.365, '#76c863']]
    tiers.forEach(([r, y, c], i) => {
      part(g, CYL(r * 0.93, r, 0.065, 7), c, { y })
      part(g, CYL(r * 1.005, r * 1.01, 0.02, 7), '#b9b3a4', { y: y - 0.02 })
      if (i) part(g, CYL(r * 0.93, r * 0.98, 0.012, 7), '#a6dd8a', { y: y + 0.037 })
    })
    // Escadas de pedra pelos terraços.
    for (let i = 0; i < 4; i++) part(g, BOX(0.045, 0.065, 0.04), '#cfc9ba', { x: 0.1, y: 0.17 + i * 0.065, z: 0.37 - i * 0.085 })
    // Casas: paredes de pedra e telhado de duas águas em palha.
    const hut = (x, y, z, ry) => {
      part(g, BOX(0.12, 0.07, 0.09), '#d9d2c1', { x, y: y + 0.035, z, ry })
      part(g, gable(0.14, 0.06, 0.115), '#c79a5e', { x, y: y + 0.07, z, ry })
    }
    hut(-0.18, 0.2, 0.23, 0.2)
    hut(0.2, 0.2, 0.2, -0.1)
    hut(-0.04, 0.27, 0.1, 0.5)
    hut(0.11, 0.335, -0.02, 0)
    hut(-0.13, 0.335, -0.06, 0.3)
    hut(0.3, 0.17, -0.05, 0.9)
    rock(g, -0.36, 0.12, 0.12, 0.05)
    // Lhamas minúsculas (corpo + pescoço) para dar escala.
    part(g, BOX(0.035, 0.022, 0.016), '#f3ede0', { x: 0.03, y: 0.205, z: 0.36 })
    part(g, BOX(0.01, 0.03, 0.01), '#f3ede0', { x: 0.045, y: 0.225, z: 0.36 })
  },

  // Chichén Itzá: El Castillo, nove níveis, escadarias nos quatro lados e templo no topo.
  chichen(g) {
    hexBase(g, '#9fd277', '#77a65c')
    const y0 = 0.14, h = 0.065, tiers = 9
    for (let i = 0; i < tiers; i++) {
      const size = 0.66 - i * 0.062
      part(g, BOX(size, h, size), i % 2 ? '#dcc58f' : '#e9d6a5', { y: y0 + h / 2 + i * h })
      part(g, BOX(size + 0.012, 0.012, size + 0.012), '#c9ad78', { y: y0 + i * h + 0.006 })
    }
    const topY = y0 + tiers * h
    // Escadarias: rampa clara central em cada face, com guarda-corpo escuro de cada lado.
    const run = (0.66 - 0.062 * (tiers - 1)) / 2
    const half = 0.33
    const rise = tiers * h
    const len = Math.hypot(half - run + 0.02, rise)
    const slope = Math.atan2(rise, half - run + 0.02)
    for (let k = 0; k < 4; k++) {
      const dir = k * Math.PI / 2
      const grp = new THREE.Group()
      const ramp = part(grp, BOX(0.13, 0.018, len), '#f4e8c4', {})
      ramp.position.set(0, y0 + rise / 2, (half + run) / 2)
      ramp.rotation.x = slope
      for (const s of [-1, 1]) {
        const rail = part(grp, BOX(0.025, 0.03, len), '#bda274', {})
        rail.position.set(s * 0.078, y0 + rise / 2 + 0.01, (half + run) / 2)
        rail.rotation.x = slope
      }
      grp.rotation.y = dir
      g.add(grp)
    }
    // Templo no topo: bloco, porta escura e cornija.
    part(g, BOX(0.19, 0.1, 0.19), '#d2b883', { y: topY + 0.05 })
    part(g, BOX(0.06, 0.07, 0.012), '#5e4a30', { y: topY + 0.045, z: 0.096 })
    part(g, BOX(0.215, 0.022, 0.215), '#b99a66', { y: topY + 0.111 })
    part(g, BOX(0.13, 0.03, 0.13), '#c9ad78', { y: topY + 0.137 })
    // Selva em volta.
    tree(g, -0.4, 0.12, 0.28, 0.14)
    tree(g, 0.38, 0.12, 0.3, 0.12)
    tree(g, -0.38, 0.12, -0.3, 0.13)
    tree(g, 0.4, 0.12, -0.28, 0.15)
  },

  // Coliseu: anfiteatro oval com três andares de arcos, anel externo partido de um lado e arena de areia.
  coliseu(g) {
    hexBase(g, '#9fd277', '#77a65c')
    const bays = 20, ax = 0.44, az = 0.34, tiersH = 0.085, y0 = 0.14
    // Arena de areia e arquibancada interna em degraus.
    part(g, CYL(1, 1, 0.02, 20), '#ecd9a4', { y: y0 + 0.01, sx: 0.23, sz: 0.17 })
    for (let i = 0; i < 3; i++) part(g, CYL(1, 1, 0.045, 20), i % 2 ? '#d9b98c' : '#e4c79b', { y: y0 + 0.04 + i * 0.045, sx: 0.33 - i * 0.025, sz: 0.25 - i * 0.02 })
    part(g, CYL(1, 1, 0.022, 20), '#ecd9a4', { y: y0 + 0.176, sx: 0.215, sz: 0.158 })
    // Fachada: pilares entre os arcos, três andares; o andar 3 (e parte do 2) falta no setor quebrado.
    for (let i = 0; i < bays; i++) {
      const a = (i / bays) * Math.PI * 2
      const a2 = ((i + 1) / bays) * Math.PI * 2
      const mid = (a + a2) / 2
      const x = Math.sin(mid) * ax, z = Math.cos(mid) * az
      const chord = Math.hypot(Math.sin(a2) * ax - Math.sin(a) * ax, Math.cos(a2) * az - Math.cos(a) * az)
      const tang = Math.atan2(Math.sin(mid) * az, Math.cos(mid) * ax)
      const broken = Math.sin(mid) < -0.2 && Math.cos(mid) < 0.5 // lado oeste
      const levels = broken ? (i % 2 ? 1 : 2) : 3
      for (let t = 0; t < levels; t++) {
        const y = y0 + tiersH / 2 + t * tiersH
        const col = t === 2 ? '#e0c79b' : t === 1 ? '#e9d3a7' : '#efdcb4'
        part(g, BOX(chord * 0.99, tiersH, 0.05), col, { x, y, z, ry: tang })
        // Arco: vão escuro e cornija.
        part(g, BOX(chord * 0.5, tiersH * 0.62, 0.056), '#8d7352', { x, y: y - 0.006, z, ry: tang })
        part(g, BOX(chord * 0.5, 0.012, 0.06), '#c9ad78', { x, y: y + tiersH * 0.34, z, ry: tang })
      }
      if (!broken) part(g, BOX(chord, 0.014, 0.06), '#c9ad78', { x, y: y0 + 3 * tiersH + 0.007, z, ry: tang })
    }
    // Entulho no setor quebrado.
    rock(g, -0.42, 0.14, -0.12, 0.04, '#cdb98e')
    rock(g, -0.4, 0.14, 0.1, 0.035, '#d9c79c')
  },

  // Petra: Al-Khazneh, fachada escavada na rocha rosada, seis colunas, frontão e tholos cônico.
  petra(g) {
    hexBase(g, '#efc29d', '#cf946f')
    // Paredão de rocha em volta (três blocos irregulares) e chão de areia.
    part(g, BOX(0.9, 0.66, 0.24), '#c97a60', { y: 0.44, z: -0.22 })
    part(g, BOX(0.22, 0.66, 0.42), '#bd6f58', { x: -0.4, y: 0.44, z: -0.08, ry: 0.15 })
    part(g, BOX(0.22, 0.58, 0.42), '#c4745c', { x: 0.4, y: 0.4, z: -0.08, ry: -0.15 })
    part(g, new THREE.DodecahedronGeometry(0.17), '#b86a53', { x: -0.3, y: 0.76, z: -0.22, sy: 0.7 })
    part(g, new THREE.DodecahedronGeometry(0.16), '#c27a62', { x: 0.28, y: 0.7, z: -0.22, sy: 0.65 })
    // Fachada rebaixada, de tom mais claro.
    part(g, BOX(0.5, 0.64, 0.05), '#e2a287', { y: 0.46, z: -0.055 })
    // Nível inferior: seis colunas, entablamento e frontão central.
    const cols = [-0.2, -0.12, -0.04, 0.04, 0.12, 0.2]
    for (const x of cols) {
      part(g, CYL(0.02, 0.022, 0.2, 6), '#f4c3a3', { x, y: 0.26, z: -0.015 })
      part(g, BOX(0.05, 0.016, 0.05), '#f8d3b9', { x, y: 0.368, z: -0.015 })
    }
    part(g, BOX(0.5, 0.036, 0.06), '#f8d3b9', { y: 0.395, z: -0.02 })
    part(g, gable(0.5, 0.1, 0.05), '#f4c3a3', { y: 0.413, z: -0.02 })
    part(g, BOX(0.08, 0.13, 0.012), '#5a2f2a', { y: 0.215, z: -0.03 }) // porta
    // Nível superior: tholos (rotunda) com telhado cônico entre dois frontões partidos.
    part(g, BOX(0.14, 0.05, 0.05), '#f4c3a3', { x: -0.17, y: 0.55, z: -0.02 })
    part(g, BOX(0.14, 0.05, 0.05), '#f4c3a3', { x: 0.17, y: 0.55, z: -0.02 })
    part(g, CYL(0.075, 0.08, 0.04, 8), '#f8d3b9', { y: 0.505, z: -0.02 })
    part(g, CYL(0.06, 0.065, 0.13, 8), '#f4c3a3', { y: 0.59, z: -0.02 })
    part(g, CYL(0.07, 0.07, 0.016, 8), '#f8d3b9', { y: 0.664, z: -0.02 })
    part(g, CONE(0.07, 0.1, 8), '#f4c3a3', { y: 0.722, z: -0.02 })
    part(g, ICO(0.016), '#f8d3b9', { y: 0.785, z: -0.02 })
    // Escadinha de entrada e rochas soltas.
    part(g, BOX(0.4, 0.025, 0.07), '#e9b895', { y: 0.155, z: 0.04 })
    part(g, BOX(0.3, 0.025, 0.05), '#f3cbae', { y: 0.18, z: 0.025 })
    rock(g, -0.32, 0.14, 0.24, 0.05, '#c98569')
    rock(g, 0.34, 0.14, 0.2, 0.04, '#d58f73')
  },

  // Taj Mahal: mausoléu de mármore, cúpula bulbosa, quatro chhatris, quatro minaretes e espelho d'água.
  taj(g) {
    hexBase(g, '#a6dc86', '#7aa865')
    // Plataforma em dois níveis.
    part(g, BOX(0.8, 0.04, 0.8), '#eae4d6', { y: 0.16 })
    part(g, BOX(0.62, 0.04, 0.62), '#f4efe6', { y: 0.2 })
    // Corpo principal: base octogonal de cantos cortados, com iwan (arco) em cada face.
    part(g, CYL(0.215, 0.215, 0.23, 8), '#fbf8f2', { y: 0.335, ry: Math.PI / 8 })
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2
      part(g, BOX(0.11, 0.17, 0.02), '#fbf8f2', { x: Math.sin(a) * 0.2, y: 0.33, z: Math.cos(a) * 0.2, ry: a })
      part(g, BOX(0.07, 0.12, 0.024), '#9db7d6', { x: Math.sin(a) * 0.205, y: 0.315, z: Math.cos(a) * 0.205, ry: a })
      part(g, gable(0.075, 0.04, 0.022), '#9db7d6', { x: Math.sin(a) * 0.205, y: 0.375, z: Math.cos(a) * 0.205, ry: a })
    }
    // Cúpula bulbosa por revolução, com tambor, colar e pináculo dourado.
    part(g, CYL(0.115, 0.125, 0.06, 8), '#f6f2ea', { y: 0.48 })
    const dome = new THREE.LatheGeometry([V2(0, 0), V2(0.13, 0.01), V2(0.15, 0.06), V2(0.15, 0.11), V2(0.12, 0.17), V2(0.07, 0.22), V2(0.03, 0.255), V2(0.008, 0.29), V2(0, 0.29)], 10)
    part(g, dome, '#ffffff', { y: 0.51 })
    part(g, CYL(0.006, 0.01, 0.07, 5), '#ffd77a', { y: 0.83 })
    part(g, ICO(0.014), '#ffd77a', { y: 0.87 })
    // Quatro chhatris (cúpulas pequenas) sobre pilares.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      part(g, BOX(0.075, 0.07, 0.075), '#f7f3ec', { x: sx * 0.15, y: 0.485, z: sz * 0.15 })
      part(g, new THREE.SphereGeometry(0.052, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', { x: sx * 0.15, y: 0.52, z: sz * 0.15 })
      part(g, CONE(0.009, 0.04, 4), '#ffd77a', { x: sx * 0.15, y: 0.59, z: sz * 0.15 })
      // Minarete de cada canto: fuste, três anéis, mirante e cúpula.
      const mx = sx * 0.34, mz = sz * 0.34
      part(g, CYL(0.03, 0.036, 0.42, 8), '#f7f3ec', { x: mx, y: 0.41, z: mz })
      for (const yy of [0.3, 0.42, 0.54]) part(g, CYL(0.04, 0.04, 0.012, 8), '#e4ddd0', { x: mx, y: yy, z: mz })
      part(g, CYL(0.036, 0.036, 0.045, 8), '#f7f3ec', { x: mx, y: 0.64, z: mz })
      part(g, new THREE.SphereGeometry(0.036, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', { x: mx, y: 0.66, z: mz })
    }
    // Espelho d'água e jardim à frente.
    part(g, BOX(0.075, 0.012, 0.3), '#62d6ea', { y: 0.186, z: 0.5 * 0 + 0.46 })
    part(g, BOX(0.13, 0.008, 0.08), '#e9e3d4', { y: 0.176, z: 0.31 })
    for (const s of [-1, 1]) part(g, BOX(0.11, 0.014, 0.28), '#7fcf6a', { x: s * 0.11, y: 0.18, z: 0.46 })
  },

  // Grande Muralha: muro com ameias zigzagueando por duas colinas, com três torres de vigia.
  muralha(g) {
    hexBase(g, '#86cf6c', '#649d57')
    // Duas colinas de topo arredondado; o muro corre pelos cumes, de ponta a ponta do modelo.
    part(g, CYL(0.07, 0.3, 0.22, 7), '#79c565', { x: -0.24, y: 0.25, z: 0.02, ry: 0.3 })
    part(g, CYL(0.07, 0.28, 0.32, 7), '#6dbb5f', { x: 0.2, y: 0.3, z: -0.02, ry: 0.8 })
    part(g, CYL(0.1, 0.2, 0.1, 6), '#5fae55', { x: -0.02, y: 0.19, z: 0.04 })
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.46, 0.17, 0.12), new THREE.Vector3(-0.32, 0.3, 0.06), new THREE.Vector3(-0.24, 0.37, 0.02),
      new THREE.Vector3(-0.1, 0.27, 0.03), new THREE.Vector3(0.02, 0.23, 0.02), new THREE.Vector3(0.12, 0.36, -0.01),
      new THREE.Vector3(0.2, 0.47, -0.02), new THREE.Vector3(0.34, 0.33, -0.05), new THREE.Vector3(0.46, 0.2, -0.1),
    ], false, 'catmullrom', 0.4)
    const N = 26, pts = curve.getPoints(N)
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a)
      const flat = Math.hypot(d.x, d.z)
      const o = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.01, z: (a.z + b.z) / 2, ry: -Math.atan2(d.z, d.x), rz: Math.atan2(d.y, flat), order: 'YZX' }
      part(g, BOX(d.length() + 0.014, 0.09, 0.105), '#e8d8ae', o)
      if (i % 2 === 0) part(g, BOX(d.length() * 0.9, 0.035, 0.11), '#cdb98a', { ...o, y: o.y + 0.06 }) // ameias
    }
    // Torres de vigia: base, corpo com porta e janelas, cornija e telhadinho.
    const tower = (p, s = 1) => {
      part(g, BOX(0.14 * s, 0.05, 0.14 * s), '#bfae85', { x: p.x, y: p.y + 0.02, z: p.z })
      part(g, BOX(0.11 * s, 0.14 * s, 0.11 * s), '#d3c196', { x: p.x, y: p.y + 0.105 * s, z: p.z })
      part(g, BOX(0.03 * s, 0.05 * s, 0.012), '#6d5a3c', { x: p.x, y: p.y + 0.085 * s, z: p.z + 0.056 * s })
      part(g, BOX(0.126 * s, 0.022, 0.126 * s), '#b39c74', { x: p.x, y: p.y + 0.185 * s, z: p.z })
      part(g, CONE(0.09 * s, 0.075 * s, 4), '#c0644f', { x: p.x, y: p.y + 0.23 * s, z: p.z, ry: Math.PI / 4 })
    }
    tower(pts[5]); tower(pts[13], 1.1); tower(pts[22], 0.95)
    tree(g, 0.34, 0.12, 0.22, 0.1)
    tree(g, -0.36, 0.12, -0.2, 0.11)
    tree(g, 0.0, 0.12, 0.3, 0.09)
  },
}

/** Monta o monumento `kind` e junta as peças por cor (poucos draw calls). */
export function buildPlaceholder(kind) {
  const g = new THREE.Group()
  ;(MONUMENTS[kind] || MONUMENTS.cristo)(g)
  g.updateMatrixWorld(true)
  const buckets = new Map()
  g.traverse((o) => {
    if (!o.isMesh) return
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name)
    geo.applyMatrix4(o.matrixWorld)
    if (!buckets.has(o.userData.color)) buckets.set(o.userData.color, [])
    buckets.get(o.userData.color).push(geo)
    o.geometry.dispose()
  })
  const out = new THREE.Group()
  out.name = `placeholder:${kind}`
  for (const [color, list] of buckets) {
    const merged = mergeGeometries(list, false)
    list.forEach(geo => geo.dispose())
    merged.computeVertexNormals()
    out.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide })))
  }
  return out
}

export const MONUMENT_KINDS = Object.freeze(Object.keys(MONUMENTS))
