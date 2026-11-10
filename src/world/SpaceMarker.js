import * as THREE from 'three'
import { gsap } from 'gsap'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { latLonToVector3, surfaceFrame, surfaceQuaternion } from './geo.js'

const GOLD = new THREE.Color('#ffd166')
const LOCK_TINT = new THREE.Color('#c9d4ec')
const LOCKED = { desat: 1, alpha: 0.6, glow: 0, ring: 0, lock: 1, fog: 1 }
const UNLOCKED = { desat: 0, alpha: 1, glow: 1, ring: 1, lock: 0, fog: 0 }

// ---------- Utilidades ----------
let dotTexture = null
function getDotTexture() {
  if (dotTexture) return dotTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  dotTexture = new THREE.CanvasTexture(canvas)
  dotTexture.colorSpace = THREE.SRGBColorSpace
  return dotTexture
}

function disposeObject(object, { textures = false } = {}) {
  const geometries = new Set(), materials = new Set()
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry)
    const list = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : []
    list.forEach(m => materials.add(m))
  })
  geometries.forEach(g => g.dispose())
  materials.forEach((m) => {
    if (textures) for (const value of Object.values(m)) if (value && value.isTexture && value !== dotTexture) value.dispose()
    m.dispose()
  })
}

/**
 * Normaliza qualquer modelo (GLB ou placeholder): centraliza em X/Z, apoia a base
 * em Y=0 e escala para caber em `footprint` (maior lado em X/Z) e `maxHeight`.
 */
export function fitModel(object, footprint, maxHeight) {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object, true)
  const wrapper = new THREE.Group()
  wrapper.name = 'fitted-model'
  wrapper.add(object)
  if (box.isEmpty()) { wrapper.userData.fittedHeight = 0; return wrapper }
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  object.position.x -= center.x
  object.position.z -= center.z
  object.position.y -= box.min.y
  const s = Math.min(footprint / Math.max(size.x, size.z, 1e-6), maxHeight / Math.max(size.y, 1e-6))
  wrapper.scale.setScalar(s)
  wrapper.userData.fittedHeight = size.y * s
  return wrapper
}

async function glbAvailable(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (res.status === 405 || res.status === 501) return true // servidor sem HEAD: tenta o GET mesmo assim
    const type = res.headers.get('content-type') || ''
    return res.ok && !type.includes('text/html') // dev servers devolvem index.html para 404
  }
  catch {
    return false
  }
}

// ---------- Placeholders low poly ----------
// Construídos em "unidade" (base hexagonal com ~1 de diâmetro, base em Y=0,
// frente para +Z) e depois normalizados por fitModel, como um GLB.
const CYL = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg)
const BOX = (x, y, z) => new THREE.BoxGeometry(x, y, z)
const CONE = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg)
const ICO = (r, d = 0) => new THREE.IcosahedronGeometry(r, d)

function part(group, geometry, color, t = {}) {
  const mesh = new THREE.Mesh(geometry)
  mesh.userData.color = color
  mesh.position.set(t.x || 0, t.y || 0, t.z || 0)
  mesh.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ')
  mesh.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1)
  group.add(mesh)
  return mesh
}

function hexBase(g, top, side) {
  part(g, CYL(0.5, 0.44, 0.08), side, { y: 0.04 })
  part(g, CYL(0.47, 0.5, 0.06), top, { y: 0.11 })
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

function house(g, x, y, z) {
  part(g, BOX(0.09, 0.06, 0.075), '#d6cdbb', { x, y: y + 0.03, z })
  part(g, CONE(0.075, 0.06, 4), '#a8794f', { x, y: y + 0.09, z, ry: Math.PI / 4 })
}

const PLACEHOLDERS = {
  ilha(g) {
    part(g, CYL(0.52, 0.54, 0.05), '#6fe6dc', { y: 0.025 })
    part(g, CYL(0.36, 0.44, 0.07, 7), '#f7e2a8', { y: 0.085 })
    part(g, CYL(0.22, 0.3, 0.05, 7), '#f1d48f', { y: 0.145 })
    palm(g, -0.08, 0.16, 0.02, 0.36, 0.18, 0.2)
    palm(g, 0.15, 0.13, -0.1, 0.28, -0.3, 0.9)
    part(g, ICO(0.06), '#9aa5b1', { x: 0.22, y: 0.13, z: 0.18, sy: 0.6 })
    part(g, ICO(0.04), '#b3bcc6', { x: -0.27, y: 0.12, z: -0.14, sy: 0.7 })
  },
  cristo(g) {
    hexBase(g, '#79cf6b', '#5a9b55')
    part(g, CYL(0.08, 0.36, 0.4), '#69c25e', { y: 0.34 })
    part(g, BOX(0.11, 0.07, 0.11), '#d9d4c7', { y: 0.575 })
    part(g, CYL(0.036, 0.054, 0.26), '#f3f0e8', { y: 0.74 })
    part(g, BOX(0.36, 0.04, 0.045), '#f3f0e8', { y: 0.83 })
    part(g, ICO(0.036), '#f3f0e8', { y: 0.9 })
  },
  machu(g) {
    hexBase(g, '#7ccf6a', '#5f9d58')
    part(g, CYL(0.42, 0.46, 0.07), '#86d36f', { y: 0.175 })
    part(g, CYL(0.33, 0.37, 0.07), '#76c863', { y: 0.245 })
    part(g, CYL(0.24, 0.28, 0.07), '#86d36f', { y: 0.315 })
    part(g, CONE(0.17, 0.52, 5), '#5aa95f', { x: 0.06, y: 0.4, z: -0.3 })
    house(g, -0.2, 0.21, 0.24)
    house(g, 0.16, 0.28, 0.12)
    house(g, -0.04, 0.35, 0.02)
    house(g, 0.27, 0.21, -0.02)
  },
  chichen(g) {
    hexBase(g, '#9fd277', '#77a65c')
    const h = 0.075
    for (let i = 0; i < 5; i++) {
      const size = 0.62 - i * 0.1
      part(g, BOX(size, h, size), i % 2 ? '#d8c08a' : '#e5d19f', { y: 0.14 + h / 2 + i * h })
      part(g, BOX(0.12, h, 0.05), '#f2e3b8', { y: 0.14 + h / 2 + i * h, z: size / 2 + 0.02 })
    }
    part(g, BOX(0.18, 0.1, 0.18), '#cdb27e', { y: 0.14 + 5 * h + 0.05 })
    part(g, BOX(0.21, 0.025, 0.21), '#b99a66', { y: 0.14 + 5 * h + 0.112 })
    part(g, BOX(0.05, 0.06, 0.01), '#6f5a3a', { y: 0.14 + 5 * h + 0.04, z: 0.092 })
  },
  coliseu(g) {
    hexBase(g, '#9fd277', '#77a65c')
    const V = (x, y) => new THREE.Vector2(x, y)
    const lower = new THREE.LatheGeometry([V(0.26, 0), V(0.42, 0), V(0.42, 0.14), V(0.26, 0.1), V(0.26, 0)], 12)
    part(g, lower, '#e8cfa5', { y: 0.14 })
    const upper = new THREE.LatheGeometry([V(0.36, 0.14), V(0.42, 0.14), V(0.42, 0.28), V(0.38, 0.28), V(0.36, 0.14)], 9, 0.5, Math.PI * 1.45)
    part(g, upper, '#dcc095', { y: 0.14 })
    part(g, CYL(0.26, 0.26, 0.03, 12), '#e9d7a8', { y: 0.155 })
    for (let i = 0; i < 12; i++) {
      const a = (i + 0.5) / 12 * Math.PI * 2
      part(g, BOX(0.05, 0.06, 0.012), '#b08b5f', { x: Math.sin(a) * 0.415, y: 0.21, z: Math.cos(a) * 0.415, ry: a })
    }
  },
  petra(g) {
    hexBase(g, '#efc29d', '#cf946f')
    part(g, BOX(0.8, 0.6, 0.34), '#d98a6c', { y: 0.44, z: -0.12 })
    part(g, new THREE.DodecahedronGeometry(0.22), '#cf7f62', { x: -0.26, y: 0.72, z: -0.14, sy: 0.6 })
    part(g, new THREE.DodecahedronGeometry(0.2), '#d48669', { x: 0.24, y: 0.7, z: -0.16, sy: 0.55 })
    for (const x of [-0.15, -0.05, 0.05, 0.15]) part(g, CYL(0.022, 0.022, 0.2, 6), '#f3b998', { x, y: 0.24, z: 0.08 })
    part(g, BOX(0.42, 0.04, 0.07), '#f5c3a5', { y: 0.36, z: 0.08 })
    part(g, CYL(0.12, 0.12, 0.06, 3), '#f5c3a5', { y: 0.42, z: 0.08, rx: -Math.PI / 2, sx: 1.7, sz: 0.5 })
    part(g, CYL(0.06, 0.06, 0.12, 8), '#f3b998', { y: 0.53, z: 0.08 })
    part(g, CONE(0.075, 0.06, 8), '#f5c3a5', { y: 0.62, z: 0.08 })
    part(g, BOX(0.07, 0.11, 0.01), '#7a3f33', { y: 0.195, z: 0.118 })
  },
  taj(g) {
    hexBase(g, '#a6dc86', '#7aa865')
    part(g, BOX(0.72, 0.05, 0.72), '#f4efe6', { y: 0.165 })
    part(g, CYL(0.22, 0.22, 0.22, 8), '#fbf8f2', { y: 0.3 })
    part(g, BOX(0.09, 0.14, 0.012), '#cfe0f4', { y: 0.27, z: 0.205 })
    part(g, CYL(0.11, 0.11, 0.05, 8), '#f6f2ea', { y: 0.435 })
    part(g, new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), '#ffffff', { y: 0.46, sy: 1.15 })
    part(g, CONE(0.02, 0.1, 6), '#ffd77a', { y: 0.67 })
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      part(g, new THREE.SphereGeometry(0.05, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', { x: x * 0.13, y: 0.41, z: z * 0.13 })
      part(g, CYL(0.022, 0.028, 0.42, 6), '#f7f3ec', { x: x * 0.31, y: 0.4, z: z * 0.31 })
      part(g, CONE(0.036, 0.05, 6), '#ffffff', { x: x * 0.31, y: 0.636, z: z * 0.31 })
    }
    part(g, BOX(0.06, 0.012, 0.12), '#5fd3e8', { y: 0.195, z: 0.29 })
  },
  muralha(g) {
    hexBase(g, '#86cf6c', '#649d57')
    part(g, CONE(0.24, 0.2, 6), '#79c565', { x: -0.22, y: 0.24, z: 0.04 })
    part(g, CONE(0.21, 0.27, 6), '#6dbb5f', { x: 0.2, y: 0.275, z: -0.12 })
    const pts = [[-0.4, 0.17, 0.18], [-0.22, 0.35, 0.04], [0, 0.22, -0.03], [0.2, 0.42, -0.12], [0.4, 0.17, -0.2]]
      .map(([x, y, z]) => new THREE.Vector3(x, y, z))
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const d = b.clone().sub(a)
      const flat = Math.hypot(d.x, d.z)
      part(g, BOX(d.length() + 0.04, 0.06, 0.07), '#d6c39a', {
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
        ry: -Math.atan2(d.z, d.x), rz: Math.atan2(d.y, flat), order: 'YZX',
      })
    }
    for (const p of pts.slice(1, -1)) {
      part(g, BOX(0.1, 0.13, 0.1), '#c7b28a', { x: p.x, y: p.y + 0.03, z: p.z })
      part(g, BOX(0.115, 0.025, 0.115), '#b39c74', { x: p.x, y: p.y + 0.1, z: p.z })
    }
  },
}

function buildPlaceholder(kind) {
  const g = new THREE.Group()
  ;(PLACEHOLDERS[kind] || PLACEHOLDERS.cristo)(g)
  g.updateMatrixWorld(true)
  // Junta as peças por cor: poucos draw calls por marcador.
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
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }))
    out.add(mesh)
  }
  return out
}

// ---------- Partículas ----------
class Burst {
  constructor(max = 90) {
    this.max = max
    this.count = 0
    this.age = 0
    this.life = 1.5
    this.gravity = 0
    this.positions = new Float32Array(max * 3)
    this.velocities = new Float32Array(max * 3)
    this.geometry = new THREE.BufferGeometry()
    this.attribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', this.attribute)
    this.material = new THREE.PointsMaterial({
      size: 0.08, map: getDotTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.visible = false
    this.points.frustumCulled = false
  }

  fire({ color, count = 70, speed = 1, spread = 0.5, size = 0.08, gravity = 0.4, life = 1.5, radius = 0.1, height = 0 }) {
    this.material.color.copy(color)
    this.material.size = size
    this.count = Math.min(count, this.max)
    this.geometry.setDrawRange(0, this.count)
    for (let i = 0; i < this.count; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * radius
      const o = i * 3
      this.positions[o] = Math.cos(a) * r
      this.positions[o + 1] = height * Math.random()
      this.positions[o + 2] = Math.sin(a) * r
      const s = spread * (0.3 + Math.random() * 0.7)
      this.velocities[o] = Math.cos(a) * s
      this.velocities[o + 1] = speed * (0.45 + Math.random() * 0.8)
      this.velocities[o + 2] = Math.sin(a) * s
    }
    this.attribute.needsUpdate = true
    this.age = 0
    this.life = life
    this.gravity = gravity
    this.points.visible = true
  }

  update(dt) {
    if (!this.points.visible) return
    this.age += dt
    if (this.age >= this.life) { this.points.visible = false; return }
    const drag = Math.pow(0.35, dt)
    for (let i = 0; i < this.count; i++) {
      const o = i * 3
      this.velocities[o] *= drag
      this.velocities[o + 2] *= drag
      this.velocities[o + 1] = this.velocities[o + 1] * drag - this.gravity * dt
      this.positions[o] += this.velocities[o] * dt
      this.positions[o + 1] += this.velocities[o + 1] * dt
      this.positions[o + 2] += this.velocities[o + 2] * dt
    }
    this.attribute.needsUpdate = true
    this.material.opacity = 1 - (this.age / this.life) ** 2
  }
}

// ---------- Marcador ----------
export default class SpaceMarker {
  /**
   * @param {object} space dados do espaço (worldSpaces.js)
   * @param {object} options { index, surfaceRadius, size }
   */
  constructor(space, { index = 0, surfaceRadius = 5, size = 0.6 } = {}) {
    this.space = space
    this.id = space.id
    this.index = index
    this.size = size * (space.escala || 1)
    this.surfaceRadius = surfaceRadius
    this.normal = latLonToVector3(space.lat, space.lon, 1)
    const frame = surfaceFrame(this.normal)
    this.east = frame.east
    this.south = frame.south
    this.accent = new THREE.Color(space.cor || '#ffffff')
    this.state = { desbloqueado: false, concluido: false } // estado lógico
    this.shown = { desbloqueado: false, concluido: false } // estado já animado na tela
    this.vis = { ...LOCKED, gold: 0, star: 0, starLift: 0, pop: 1, beam: 0, flash: 0 }
    this.hovered = false
    this.hoverAmount = 0
    this.modelSource = 'placeholder'
    this.timeline = null
    this.disposed = false
    this.uniforms = {
      uDesat: { value: 1 }, uAlpha: { value: 0.6 }, uGlow: { value: 0 },
      uGlowColor: { value: this.accent.clone() }, uLockTint: { value: LOCK_TINT },
    }

    this.root = new THREE.Group()
    this.root.name = `space:${space.id}`
    this.root.position.copy(this.normal).multiplyScalar(surfaceRadius)
    this.root.quaternion.copy(surfaceQuaternion(this.normal))

    this.content = new THREE.Group()
    this.root.add(this.content)
    this.setModel(this.preparePlaceholder(), 'placeholder')
    this.buildDecor()
    this.applyVisuals(0)
  }

  // Desatura, aplica translucidez e brilho via uniforms compartilhados por todo o modelo.
  patchMaterial(material) {
    material.transparent = true
    material.depthWrite = true
    material.forceSinglePass = true // transparente + DoubleSide faria 2 draws por malha
    const uniforms = this.uniforms
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uDesat;
uniform float uAlpha;
uniform float uGlow;
uniform vec3 uGlowColor;
uniform vec3 uLockTint;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float buLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(diffuseColor.rgb, (0.32 + 0.75 * buLum) * uLockTint, uDesat);
diffuseColor.a *= uAlpha;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uGlowColor * uGlow;`)
    }
    material.customProgramCacheKey = () => 'buildu-space-marker'
    material.needsUpdate = true
    return material
  }

  patchModel(model) {
    const cloned = new Map()
    model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = false
      o.receiveShadow = false
      const list = Array.isArray(o.material) ? o.material : [o.material]
      const next = list.map((m) => {
        if (!cloned.has(m)) cloned.set(m, this.patchMaterial(m.clone()))
        return cloned.get(m)
      })
      o.material = Array.isArray(o.material) ? next : next[0]
    })
    return model
  }

  preparePlaceholder() {
    const model = this.patchModel(buildPlaceholder(this.space.placeholder))
    return fitModel(model, this.size, this.size * 1.05)
  }

  setModel(fitted, source) {
    if (this.model) {
      this.content.remove(this.model)
      disposeObject(this.model, { textures: this.modelSource === 'glb' })
    }
    this.model = fitted
    this.modelSource = source
    this.modelHeight = Math.max(fitted.userData.fittedHeight || 0, this.size * 0.3)
    this.content.add(fitted)
    this.updateProxy()
  }

  /** Existe um GLB para este espaço? (uma requisição HEAD) */
  probe() {
    return this.space.glbPath ? glbAvailable(this.space.glbPath) : Promise.resolve(false)
  }

  /** Carrega o GLB em glbPath; se falhar, mantém o placeholder. Chame probe() antes. */
  async loadModel(loader) {
    const url = this.space.glbPath
    if (!url) return false
    try {
      const gltf = await loader.loadAsync(url)
      if (this.disposed) { disposeObject(gltf.scene, { textures: true }); return false }
      const model = this.patchModel(gltf.scene)
      model.rotation.y += (this.space.rotacaoY || 0) * Math.PI / 180 // corrige GLB exportado de costas
      this.setModel(fitModel(model, this.size, this.size * 1.05), 'glb')
      return true
    }
    catch (error) {
      console.warn(`[BuildU] Não foi possível carregar ${url}; mantendo o placeholder.`, error)
      return false
    }
  }

  buildDecor() {
    const s = this.size

    // Anel de luz hexagonal na base + onda que pulsa para fora.
    const ringGeo = new THREE.RingGeometry(s * 0.6, s * 0.72, 6, 1)
    ringGeo.rotateX(-Math.PI / 2)
    ringGeo.rotateY(Math.PI / 6)
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: this.accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    this.ring = new THREE.Mesh(ringGeo, this.ringMaterial)
    this.ring.position.y = s * 0.03
    this.ring.renderOrder = 3
    this.rippleMaterial = this.ringMaterial.clone()
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(s * 0.62, s * 0.68, 6, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 6), this.rippleMaterial)
    this.ripple.position.y = s * 0.025
    this.ripple.renderOrder = 3
    this.root.add(this.ring, this.ripple)

    // Cadeado low poly flutuando acima do modelo.
    const lockMat = new THREE.MeshLambertMaterial({ color: '#e1e7f4', emissive: '#6f82b3', emissiveIntensity: 0.25, flatShading: true })
    const keyMat = new THREE.MeshLambertMaterial({ color: '#56607a', flatShading: true })
    this.lock = new THREE.Group()
    const shackleGeo = new THREE.TorusGeometry(s * 0.095, s * 0.03, 5, 10, Math.PI).translate(0, s * 0.12, 0)
    const bodyGeo = new THREE.BoxGeometry(s * 0.3, s * 0.24, s * 0.12)
    const body = new THREE.Mesh(mergeGeometries([bodyGeo, shackleGeo]), lockMat)
    bodyGeo.dispose()
    shackleGeo.dispose()
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.025, s * 0.025, s * 0.02, 6).rotateX(Math.PI / 2), keyMat)
    hole.position.set(0, -s * 0.01, s * 0.065)
    this.lock.add(body, hole)
    this.root.add(this.lock)

    // Névoa: manchas macias (sprites) girando devagar ao redor da base.
    const mist = []
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.4
      const r = s * (0.42 + (i % 4) * 0.08)
      mist.push(Math.cos(a) * r, s * (0.08 + (i % 5) * 0.07), Math.sin(a) * r)
    }
    const mistGeo = new THREE.BufferGeometry()
    mistGeo.setAttribute('position', new THREE.Float32BufferAttribute(mist, 3))
    this.fogMaterial = new THREE.PointsMaterial({
      map: getDotTexture(), color: '#e9f0ff', size: s * 0.75, sizeAttenuation: true,
      transparent: true, opacity: 0.5, depthWrite: false,
    })
    this.fog = new THREE.Points(mistGeo, this.fogMaterial)
    this.fog.renderOrder = 4
    this.root.add(this.fog)

    // Selo de concluído: estrela dourada + halo.
    const shape = new THREE.Shape()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.085 : s * 0.2
      const a = i / 10 * Math.PI * 2 + Math.PI / 2
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    shape.closePath()
    const starGeo = new THREE.ExtrudeGeometry(shape, { depth: s * 0.06, bevelEnabled: true, bevelThickness: s * 0.02, bevelSize: s * 0.02, bevelSegments: 1, curveSegments: 1 })
    starGeo.center()
    this.star = new THREE.Group()
    this.starSpin = new THREE.Group()
    this.starSpin.add(new THREE.Mesh(starGeo, new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#ffae00', emissiveIntensity: 0.6, flatShading: true })))
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getDotTexture(), color: GOLD, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.halo.scale.setScalar(s * 0.9)
    this.star.add(this.halo, this.starSpin)
    this.root.add(this.star)

    // Feixe de luz do desbloqueio.
    const beamHeight = s * 3.4
    const beamGeo = new THREE.CylinderGeometry(s * 0.18, s * 0.42, beamHeight, 8, 1, true)
    beamGeo.translate(0, beamHeight / 2, 0)
    this.beamUniforms = { uColor: { value: this.accent.clone().lerp(new THREE.Color('#ffffff'), 0.25) }, uOpacity: { value: 0 }, uTime: { value: 0 } }
    this.beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      uniforms: this.beamUniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float a = pow(1.0 - vUv.y, 1.5) * uOpacity;
          a *= 0.75 + 0.25 * sin(vUv.y * 22.0 - uTime * 9.0);
          gl_FragColor = vec4(uColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }))
    this.beam.renderOrder = 11
    this.beam.visible = false
    this.root.add(this.beam)

    this.burst = new Burst(90)
    this.burst.points.renderOrder = 11
    this.root.add(this.burst.points)

    this.updateProxy()
  }

  updateProxy() {
    const s = this.size
    this.proxyRadius = s * 0.72
    const h = (this.modelHeight || s) + s * 0.55
    const geo = new THREE.CylinderGeometry(s * 0.72, s * 0.72, h, 8)
    geo.translate(0, h / 2, 0)
    if (!this.hitProxy) {
      this.hitProxy = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }))
      this.hitProxy.userData.spaceId = this.id
      this.root.add(this.hitProxy)
    }
    else {
      this.hitProxy.geometry.dispose()
      this.hitProxy.geometry = geo
    }
  }

  /** Aplica o estado. Com animate=false tudo muda na hora; com true, só registra (o globo orquestra play*). */
  setState(next, { animate = false } = {}) {
    this.state = { desbloqueado: !!next.desbloqueado, concluido: !!next.concluido }
    if (animate) return
    this.timeline?.kill()
    this.timeline = null
    this.shown = { ...this.state }
    Object.assign(this.vis, this.shown.desbloqueado ? UNLOCKED : LOCKED, {
      gold: this.shown.concluido ? 1 : 0, star: this.shown.concluido ? 1 : 0, starLift: 0, pop: 1, beam: 0, flash: 0,
    })
    this.beam.visible = false
  }

  setHovered(value) { this.hovered = !!value }

  playUnlock(timeScale = 1) {
    this.timeline?.kill()
    this.shown.desbloqueado = true
    const v = this.vis
    const s = this.size
    return new Promise((resolve) => {
      this.beam.scale.set(1, 0.001, 1)
      const tl = gsap.timeline({ onComplete: resolve, onInterrupt: resolve })
      tl.to(v, { beam: 0.75, duration: 0.35, ease: 'power1.out' }, 0)
        .to(this.beam.scale, { y: 1, duration: 0.9, ease: 'power3.out' }, 0)
        .call(() => this.burst.fire({ color: this.accent, count: 80, speed: s * 2.2, spread: s * 1.1, size: s * 0.13, gravity: s * 0.9, radius: s * 0.4 }), null, 0.25)
        .to(v, { lock: 1.25, duration: 0.15, ease: 'power1.out' }, 0.12)
        .to(v, { lock: 0, duration: 0.35, ease: 'back.in(2)' }, 0.27)
        .to(v, { fog: 0, duration: 0.8, ease: 'power1.out' }, 0.2)
        .to(v, { desat: 0, alpha: 1, duration: 0.9, ease: 'power2.out' }, 0.35)
        .fromTo(v, { pop: 0.82 }, { pop: 1, duration: 1, ease: 'elastic.out(1, 0.45)', immediateRender: false }, 0.4)
        .to(v, { flash: 0.7, duration: 0.2 }, 0.4)
        .to(v, { flash: 0, duration: 0.9 }, 0.6)
        .to(v, { ring: 1, glow: 1, duration: 0.7, ease: 'back.out(2)' }, 0.6)
        .to(v, { beam: 0, duration: 0.8, ease: 'power2.in' }, 1.3)
      tl.timeScale(timeScale)
      this.timeline = tl
    })
  }

  playComplete(timeScale = 1) {
    this.timeline?.kill()
    this.shown = { desbloqueado: true, concluido: true }
    const v = this.vis
    const s = this.size
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve, onInterrupt: resolve })
      tl.to(v, { ...UNLOCKED, duration: 0.5, ease: 'power2.out' }, 0)
        .fromTo(v, { star: 0, starLift: 0.9 }, { star: 1, starLift: 0, duration: 1.1, ease: 'bounce.out', immediateRender: false }, 0.1)
        .fromTo(this.starSpin.rotation, { y: 0 }, { y: Math.PI * 4, duration: 1.4, ease: 'power3.out', immediateRender: false }, 0.1)
        .to(v, { gold: 1, duration: 0.8 }, 0.3)
        .call(() => this.burst.fire({ color: GOLD, count: 90, speed: s * 1.6, spread: s * 1.6, size: s * 0.11, gravity: s * 1.4, radius: s * 0.3, height: this.modelHeight * 0.8 }), null, 0.55)
        .to(v, { pop: 1.12, duration: 0.18, ease: 'power2.out' }, 0.55)
        .to(v, { pop: 1, duration: 0.7, ease: 'elastic.out(1, 0.4)' }, 0.73)
        .to(v, { flash: 0.8, duration: 0.15 }, 0.55)
        .to(v, { flash: 0, duration: 1 }, 0.7)
      tl.timeScale(timeScale)
      this.timeline = tl
    })
  }

  /** Resposta imediata ao toque: um pulso curto, já visível no quadro seguinte. */
  press() {
    gsap.killTweensOf(this.vis, 'pop,flash')
    gsap.fromTo(this.vis, { pop: 0.9, flash: 0.35 }, { pop: 1, flash: 0, duration: 0.45, ease: 'back.out(3)' })
  }

  /** "Não" balançando o cadeado ao tocar num espaço bloqueado. */
  shake() {
    gsap.killTweensOf(this.lock.rotation, 'z')
    gsap.to(this.lock.rotation, { keyframes: { z: [0, 0.4, -0.32, 0.2, -0.1, 0] }, duration: 0.55, ease: 'none' })
  }

  /** Ponto acima do modelo (para tooltip e caminhos), em coordenadas do mundo. */
  getAnchor(target = new THREE.Vector3()) {
    return this.root.localToWorld(target.set(0, this.modelHeight + this.size * 0.25, 0))
  }

  applyVisuals(t) {
    const v = this.vis
    const s = this.size
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + this.index * 0.9)
    this.uniforms.uDesat.value = v.desat
    this.uniforms.uAlpha.value = v.alpha
    this.uniforms.uGlowColor.value.copy(this.accent).lerp(GOLD, v.gold)
    const breathing = this.shown.concluido ? 0.14 : 0.06 + 0.16 * pulse
    this.uniforms.uGlow.value = v.glow * breathing + this.hoverAmount * 0.12 + v.flash

    this.content.scale.setScalar(v.pop * (1 + this.hoverAmount * 0.06))

    this.ring.visible = v.ring > 0.01
    this.ringMaterial.color.copy(this.accent).lerp(GOLD, v.gold)
    this.ringMaterial.opacity = Math.min(v.ring, 1) * (0.55 + 0.35 * pulse)
    this.ring.scale.setScalar(0.85 + 0.15 * Math.min(v.ring, 1.2) + this.hoverAmount * 0.08)

    const showRipple = v.ring > 0.01 && v.gold < 0.99
    this.ripple.visible = showRipple
    if (showRipple) {
      const phase = (t * 0.55 + this.index * 0.17) % 1
      this.ripple.scale.setScalar(1 + phase * 0.9)
      this.rippleMaterial.color.copy(this.ringMaterial.color)
      this.rippleMaterial.opacity = (1 - phase) * 0.55 * Math.min(v.ring, 1) * (1 - v.gold)
    }

    const top = this.modelHeight
    this.lock.visible = v.lock > 0.01
    this.lock.scale.setScalar(Math.max(v.lock, 0.0001))
    this.lock.position.y = top + s * 0.28 + Math.sin(t * 1.6 + this.index) * s * 0.035
    this.lock.rotation.y = Math.sin(t * 0.7 + this.index) * 0.45

    this.fog.visible = v.fog > 0.01
    this.fogMaterial.opacity = 0.5 * v.fog

    this.star.visible = v.star > 0.01
    this.star.scale.setScalar(Math.max(v.star, 0.0001))
    this.star.position.y = top + s * (0.32 + v.starLift * 1.6) + Math.sin(t * 1.8 + this.index) * s * 0.03

    this.beam.visible = v.beam > 0.01
    this.beamUniforms.uOpacity.value = v.beam
    this.beamUniforms.uTime.value = t
  }

  update(t, dt) {
    const target = this.hovered ? 1 : 0
    this.hoverAmount += (target - this.hoverAmount) * Math.min(1, dt * 10)
    this.fog.rotation.y += dt * 0.12
    this.starSpin.rotation.y += dt * 1.1
    this.burst.update(dt)
    this.applyVisuals(t)
  }

  dispose() {
    this.disposed = true
    this.timeline?.kill()
    gsap.killTweensOf(this.vis)
    gsap.killTweensOf(this.lock.rotation)
    gsap.killTweensOf(this.starSpin.rotation)
    gsap.killTweensOf(this.beam.scale)
    this.root.parent?.remove(this.root)
    disposeObject(this.root, { textures: this.modelSource === 'glb' })
  }
}
