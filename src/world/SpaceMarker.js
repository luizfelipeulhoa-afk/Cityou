import * as THREE from 'three'
import { gsap } from 'gsap'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { latLonToVector3, surfaceFrame, surfaceQuaternion } from './geo.js'
import { buildPlaceholder } from './monuments.js'
import { applyGlbStyle } from '../tres/glbMaterial.js'

const GOLD = new THREE.Color('#ffd166')
const LOCK_TINT = new THREE.Color('#c9d4ec')
// Luz de céu local somada ao difuso (faces viradas para fora do globo recebem o valor cheio).
const SKY_FILL = '0.24'
const LOCKED = { desat: 1, glow: 0, ring: 0, lock: 1, fog: 1 }
const UNLOCKED = { desat: 0, glow: 1, ring: 1, lock: 0, fog: 0 }
// Ordem de desenho na passada opaca: globo (0), anel de chão (1), modelos e selos (2).
const ORDER_RING = 1
const ORDER_MODEL = 2

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

/**
 * Raio da base de um modelo já normalizado por fitModel(): a maior distância ao eixo entre os vértices
 * do décimo mais baixo. É a base que encosta no chão (o octógono do Cristo, não os braços abertos),
 * e dela saem o anel de luz, a sombra de contato e a oclusão junto ao chão.
 */
export function measureBase(fitted) {
  const height = fitted.userData.fittedHeight || 0
  if (height <= 0) return 0
  fitted.updateMatrixWorld(true)
  const limit = height * 0.1
  const v = new THREE.Vector3()
  let r2 = 0
  fitted.traverse((o) => {
    const pos = o.isMesh && o.geometry.attributes.position
    if (!pos) return
    const step = Math.max(1, Math.floor(pos.count / 8000))
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
      if (v.y <= limit) r2 = Math.max(r2, v.x * v.x + v.z * v.z)
    }
  })
  return Math.sqrt(r2)
}

// Os GLB do Tripo chegam como MeshStandardMaterial com rugosidade 0,9 e sem metal: na prática, só difuso.
// O Lambert desenha esse mesmo difuso com uma fração do custo por pixel e dispensa o mapa de ambiente
// (PMREM) que o PBR exigia. A luz de céu local e o contorno aceso entram em patchMaterial().
// Quando chega aqui, o material já passou por applyGlbStyle(): o Lambert herda as faces planas
// (metal e rugosidade não existem nele).
function toLambert(material) {
  if (!material.isMeshStandardMaterial) return material.clone()
  return new THREE.MeshLambertMaterial({
    name: material.name, map: material.map, color: material.color, vertexColors: material.vertexColors,
    side: material.side, alphaTest: material.alphaTest, flatShading: material.flatShading,
    normalMap: material.normalMap, normalScale: material.normalScale,
    emissive: material.emissive, emissiveMap: material.emissiveMap, emissiveIntensity: material.emissiveIntensity,
  })
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
    this.baseRadius = this.size * 0.5
    this.timeline = null
    this.disposed = false

    this.root = new THREE.Group()
    this.root.name = `space:${space.id}`
    this.root.position.copy(this.normal).multiplyScalar(surfaceRadius)
    this.root.quaternion.copy(surfaceQuaternion(this.normal))
    // Um conjunto de uniforms para o modelo inteiro (todas as malhas e materiais do marcador).
    this.uniforms = {
      uDesat: { value: 1 }, uGlow: { value: 0 }, uFlash: { value: 0 },
      uGlowColor: { value: this.accent.clone() }, uLockTint: { value: LOCK_TINT },
      uBuOrigin: { value: this.root.position }, uBuUp: { value: this.normal }, uBuInvHeight: { value: 1 },
    }

    this.content = new THREE.Group()
    this.root.add(this.content)
    this.setModel(this.preparePlaceholder(), 'placeholder')
    this.buildDecor()
    this.applyVisuals(0)
  }

  // Estado e luz do modelo no próprio material, por uniforms compartilhados:
  // - bloqueado vira uma estátua de pedra clara (sem cor, opaca), em vez de vidro translúcido;
  // - a base escurece junto ao chão e as faces viradas para o céu local recebem mais luz;
  // - desbloqueado, o contorno acende na cor do espaço (fresnel), sem lavar a textura.
  // Tudo opaco: os modelos entram na passada opaca, com descarte por profundidade e sem ordenação.
  patchMaterial(material) {
    material.transparent = false
    material.depthWrite = true
    const uniforms = this.uniforms
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform vec3 uBuOrigin;
uniform vec3 uBuUp;
uniform float uBuInvHeight;
varying float vBuHeight;
varying vec3 vBuUpView;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vBuHeight = dot((modelMatrix * vec4(transformed, 1.0)).xyz - uBuOrigin, uBuUp) * uBuInvHeight;
vBuUpView = (viewMatrix * vec4(uBuUp, 0.0)).xyz;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uDesat;
uniform float uGlow;
uniform float uFlash;
uniform vec3 uGlowColor;
uniform vec3 uLockTint;
varying float vBuHeight;
varying vec3 vBuUpView;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
float buLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = mix(diffuseColor.rgb, (0.3 + 0.62 * buLum) * uLockTint, uDesat);
diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(-0.02, 0.26, vBuHeight));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float buSky = 0.5 + 0.5 * dot(normal, normalize(vBuUpView));
float buEdge = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
totalEmissiveRadiance += diffuseColor.rgb * (${SKY_FILL} * buSky)
  + uGlowColor * (uGlow * buEdge * buEdge * (0.4 + 0.6 * buSky) + uFlash);`)
    }
    material.customProgramCacheKey = () => 'buildu-space-marker'
    material.needsUpdate = true
    return material
  }

  patchModel(model, convert = false) {
    const patched = new Map()
    model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = false
      o.receiveShadow = false
      o.renderOrder = ORDER_MODEL
      const list = Array.isArray(o.material) ? o.material : [o.material]
      const next = list.map((m) => {
        if (!patched.has(m)) patched.set(m, this.patchMaterial(convert ? toLambert(m) : m.clone()))
        return patched.get(m)
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
    // Mede a base antes de pendurar o modelo no marcador (as matrizes ainda são locais ao modelo).
    this.baseRadius = THREE.MathUtils.clamp(measureBase(fitted) || this.size * 0.5, this.size * 0.3, this.size * 0.75)
    this.model = fitted
    this.modelSource = source
    this.modelHeight = Math.max(fitted.userData.fittedHeight || 0, this.size * 0.3)
    this.uniforms.uBuInvHeight.value = 1 / this.modelHeight
    this.content.add(fitted)
    this.updateProxy()
  }

  /** Existe um GLB para este espaço? (uma requisição HEAD) */
  probe() {
    return this.space.glbPath ? glbAvailable(this.space.glbPath) : Promise.resolve(false)
  }

  /**
   * Carrega o GLB e troca o monumento em código por ele. `url` vem de resolveModelSources() (arquivo com
   * hash, quando o build gerou models.json); se ele falhar, tenta `fallbackUrl`. Sem GLB, fica o que estava.
   */
  async loadModel(loader, url = this.space.glbPath, fallbackUrl = null) {
    if (!url) return false
    let gltf
    try {
      gltf = await loader.loadAsync(url)
    }
    catch (error) {
      if (fallbackUrl) return this.loadModel(loader, fallbackUrl)
      console.warn(`[BuildU] Não foi possível carregar ${url}; mantendo o placeholder.`, error)
      return false
    }
    if (this.disposed) { disposeObject(gltf.scene, { textures: true }); return false }
    const model = this.patchModel(applyGlbStyle(gltf.scene), true)
    model.rotation.y += (this.space.rotacaoY || 0) * Math.PI / 180 // corrige GLB exportado de costas
    this.setModel(fitModel(model, this.size, this.size * 1.05), 'glb')
    // A troca aparece como um pulso curto, a não ser que uma animação de estado esteja tocando.
    if (!this.timeline?.isActive()) gsap.fromTo(this.vis, { pop: 0.9 }, { pop: 1, duration: 0.5, ease: 'back.out(2.4)', overwrite: 'auto' })
    return true
  }

  buildDecor() {
    const s = this.size

    // Luz de chão: um anel fino em volta da base, um halo suave e uma onda que se expande, tudo num
    // único plano com shader radial. É desenhado logo depois do globo, sem teste de profundidade:
    // o relevo nunca o corta, e o modelo, desenhado em seguida, cobre a parte que fica atrás dele.
    this.ringUniforms = {
      uColor: { value: this.accent.clone() }, uOpacity: { value: 0 }, uPulse: { value: 0 },
      uRipple: { value: 0 }, uRippleOn: { value: 1 },
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.66, 40, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: this.ringUniforms,
      vertexShader: /* glsl */`
        varying vec2 vP;
        void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPulse;
        uniform float uRipple;
        uniform float uRippleOn;
        varying vec2 vP;
        void main() {
          float r = length(vP); // 1.0 = raio do anel
          float aa = fwidth(r) * 1.25;
          float band = 1.0 - smoothstep(0.028 - aa, 0.028 + aa, abs(r - 1.0));
          float glow = max(1.0 - abs(r - 1.0) * 3.4, 0.0);
          float halo = glow * glow * glow * (0.2 + 0.16 * uPulse);
          float wave = (1.0 - smoothstep(0.02 - aa, 0.02 + aa, abs(r - 1.0 - uRipple * 0.62))) * (1.0 - uRipple) * uRippleOn;
          float alpha = clamp(band * (0.72 + 0.28 * uPulse) + halo + wave * 0.5, 0.0, 1.0) * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      // Mistura normal na passada opaca: com transparent=true o anel iria para depois dos modelos.
      blending: THREE.CustomBlending, transparent: false, depthTest: false, depthWrite: false,
    }))
    this.ring.position.y = s * 0.004
    this.ring.renderOrder = ORDER_RING
    this.root.add(this.ring)

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
    body.renderOrder = hole.renderOrder = ORDER_MODEL
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
    const starMesh = new THREE.Mesh(starGeo, new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#ffae00', emissiveIntensity: 0.6, flatShading: true }))
    starMesh.renderOrder = ORDER_MODEL
    this.starSpin.add(starMesh)
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
        .to(v, { desat: 0, duration: 0.9, ease: 'power2.out' }, 0.35)
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

  /** Ponto no chão logo à frente da base (lado sul, que na tela fica embaixo), para a etiqueta do destino. */
  getFoot(target = new THREE.Vector3()) {
    return this.root.localToWorld(target.set(0, 0, this.baseRadius * 1.5))
  }

  applyVisuals(t) {
    const v = this.vis
    const s = this.size
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + this.index * 0.9)
    this.uniforms.uDesat.value = v.desat
    // Cor do contorno e do anel: a do espaço, dourada depois de concluído, neutra enquanto bloqueado.
    this.uniforms.uGlowColor.value.copy(this.accent).lerp(GOLD, v.gold).lerp(LOCK_TINT, v.desat * 0.8)
    // Contorno aceso: respira enquanto o espaço espera ser concluído, fica firme depois.
    const breathing = this.shown.concluido ? 0.55 : 0.3 + 0.5 * pulse
    this.uniforms.uGlow.value = v.glow * breathing + this.hoverAmount * 0.45
    this.uniforms.uFlash.value = v.flash

    this.content.scale.setScalar(v.pop * (1 + this.hoverAmount * 0.06))

    const ring = Math.min(v.ring, 1)
    this.ring.visible = v.ring > 0.01
    if (this.ring.visible) {
      const u = this.ringUniforms
      u.uColor.value.copy(this.uniforms.uGlowColor.value)
      u.uOpacity.value = ring
      u.uPulse.value = pulse
      u.uRipple.value = (t * 0.55 + this.index * 0.17) % 1
      u.uRippleOn.value = 1 - v.gold
      // O anel abraça a base medida do modelo, com folga para não encostar nela.
      this.ring.scale.setScalar(this.baseRadius * 1.17 * (0.85 + 0.15 * Math.min(v.ring, 1.2) + this.hoverAmount * 0.08))
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
