import * as THREE from 'three'
import { gsap } from 'gsap'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import SpaceMarker from './SpaceMarker.js'
import { buildGlobeGeometry } from './terrain.js'
import { DEG, angularDistance, latLonToVector3, slerpDirections, surfaceQuaternion } from './geo.js'

export const GLOBE_RADIUS = 5
const GLOBE_DETAIL = 28
const MAX_SPACES = 8
const PITCH_MAX = 28 * DEG // inclinação da câmera quando bem perto da superfície
const NOOP = () => {}

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Linha pontilhada em arco sobre o globo (bolinhas instanciadas, um draw call).
class DottedArc {
  constructor(radius, { color, dotRadius, maxDots = 160, opacity = 1, spacing = 0.16 }) {
    this.R = radius
    this.spacing = spacing
    this.maxDots = maxDots
    this.segments = []
    this.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(dotRadius, 1), this.material, maxDots)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.renderOrder = 11 // depois das nuvens: some atrás delas, aparece na frente
    this.dummy = new THREE.Object3D()
    this.dir = new THREE.Vector3()
  }

  setSegments(list) {
    let total = 0
    this.segments = list.map(({ a, b, ha, hb }) => {
      const angle = angularDistance(a, b)
      const length = angle * this.R * (1 + 0.25 * angle)
      const count = Math.max(6, Math.round(length / this.spacing))
      const lift = this.R * Math.min(0.03 + angle * 0.14, 0.32)
      return { a: a.clone(), b: b.clone(), ha, hb, lift, count }
    }).filter((seg) => {
      if (total + seg.count > this.maxDots) return false
      total += seg.count
      return true
    })
    this.mesh.count = total
  }

  update(phase) {
    let n = 0
    for (const seg of this.segments) {
      for (let k = 0; k < seg.count; k++) {
        const u = ((k + phase) % seg.count) / seg.count
        slerpDirections(seg.a, seg.b, u, this.dir)
        const r = this.R * (1 + THREE.MathUtils.lerp(seg.ha, seg.hb, u)) + Math.sin(Math.PI * u) * seg.lift
        const taper = THREE.MathUtils.smoothstep(u, 0, 0.1) * (1 - THREE.MathUtils.smoothstep(u, 0.9, 1))
        this.dummy.position.copy(this.dir).multiplyScalar(r)
        this.dummy.scale.setScalar(Math.max(taper, 0.001))
        this.dummy.updateMatrix()
        this.mesh.setMatrixAt(n++, this.dummy.matrix)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.mesh.dispose()
  }
}

/**
 * Cena do mapa-mundo: globo low poly, nuvens, atmosfera, estrelas, os 8 espaços,
 * caminho pontilhado, câmera (OrbitControls sem pan) e animações GSAP.
 *
 * callbacks: onTap({space, locked, previous}|null), onOpen(space), onHover(space|null),
 * onTrack({x, y, visible}), onCinematic(bool), onUnlocked(space), onCompleted(space),
 * onModel({id, source}), onStats({fps, pixelRatio, calls, triangles})
 */
export default class WorldGlobe {
  constructor(canvas, { spaces = [], callbacks = {} } = {}) {
    this.canvas = canvas
    this.callbacks = {
      onTap: NOOP, onOpen: NOOP, onHover: NOOP, onTrack: NOOP, onCinematic: NOOP,
      onUnlocked: NOOP, onCompleted: NOOP, onModel: NOOP, onStats: NOOP, onInteract: NOOP, ...callbacks,
    }
    this.R = GLOBE_RADIUS
    this.spaces = spaces.slice(0, MAX_SPACES)
    this.reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.timeScale = this.reducedMotion ? 2.5 : 1
    this.markers = new Map()
    this.hitProxies = []
    this.queue = Promise.resolve()
    this.flyTween = null
    this.flyResolve = null
    this.flying = false
    this.cinematic = 0
    this.focusedId = null
    this.trackedId = null
    this.hoveredId = null
    this.hoverPointer = null
    this.hoverDirty = false
    this.activePointers = new Set()
    this.gesture = null
    this.lastInteraction = performance.now()
    this.elapsed = 0
    this.pathPhase = 0
    this.frames = 0
    this.frameTime = 0
    this.statsTime = 0
    this.disposed = false
    this.raycaster = new THREE.Raycaster()
    this.ndc = new THREE.Vector2()
    this.occluder = new THREE.Sphere(new THREE.Vector3(), this.R * 0.99)
    this.tmp = new THREE.Vector3()
    this.tmp2 = new THREE.Vector3()
    this.overviewDistance = this.R * 3.2
    this.focusDistance = this.R * 1.9

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = false
    this.renderer.setClearColor(0x000000, 0)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400)
    this.scene.add(this.camera)

    // Luzes: hemisfério + uma direcional presa à câmera (o lado visível sempre iluminado).
    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x4d5f8f, 1.15)
    this.sun = new THREE.DirectionalLight(0xfff3df, 2.3)
    this.sun.position.set(-4, 5, 6)
    this.camera.add(this.sun)
    this.scene.add(this.hemi)

    // Ambiente PBR leve para os GLB (Tripo exporta MeshStandardMaterial).
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.envTexture = pmrem.fromScene(room, 0.04).texture
    room.dispose?.()
    pmrem.dispose()
    this.scene.environment = this.envTexture
    this.scene.environmentIntensity = 0.55

    this.loader = new GLTFLoader()
    this.loader.setMeshoptDecoder(MeshoptDecoder)

    this.buildGlobe()
    this.buildAtmosphere()
    this.buildClouds()
    this.buildStars()
    this.buildMarkers()
    this.trail = new DottedArc(this.R, { color: '#ffffff', dotRadius: this.R * 0.0065, opacity: 0.55, spacing: this.R * 0.034 })
    this.activePath = new DottedArc(this.R, { color: '#ffe08a', dotRadius: this.R * 0.008, opacity: 0.95, spacing: this.R * 0.03 })
    this.scene.add(this.trail.mesh, this.activePath.mesh)
    this.updatePaths()

    this.setupControls()
    this.bindEvents()
    this.resize()
    this.placeCameraAt(this.currentMarker()?.id, this.overviewDistance)
    this.scene.updateMatrixWorld(true)
    this.clock = new THREE.Clock()
    this.renderer.setAnimationLoop(() => this.tick())
    this.loadModels()
  }

  // ---------- Construção da cena ----------
  buildGlobe() {
    const { geometry } = buildGlobeGeometry({ radius: this.R, detail: GLOBE_DETAIL, spaces: this.spaces })
    this.globeUniforms = {
      uTime: { value: 0 },
      uWaveAmp: { value: this.R * 0.0036 },
      uBloom: { value: Array.from({ length: MAX_SPACES }, () => new THREE.Vector4(0, 1, 0, 0)) },
      uBloomRadius: { value: 11 * DEG },
      uRimColor: { value: new THREE.Color('#a6dcff') },
      uRimStrength: { value: 0.5 },
    }
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.globeUniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aVivid;
attribute vec3 aCenter;
attribute float aWave;
uniform float uTime;
uniform float uWaveAmp;
uniform vec4 uBloom[${MAX_SPACES}];
uniform float uBloomRadius;
varying vec3 vSphereNormal;`)
        .replace('#include <color_vertex>', `#include <color_vertex>
float buHash = fract(sin(dot(aCenter, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
float buBloom = 0.0;
for (int i = 0; i < ${MAX_SPACES}; i++) {
  vec4 b = uBloom[i];
  if (b.w <= 0.0) continue;
  float d = acos(clamp(dot(aCenter, b.xyz), -1.0, 1.0)) / uBloomRadius + (buHash - 0.5) * 0.3;
  float w = clamp((b.w * 1.35 - d) / 0.35, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.05, d));
  buBloom = max(buBloom, w);
}
vColor.xyz = mix(vColor.xyz, aVivid, buBloom);
vColor.xyz *= 1.0 + aWave * 0.05 * sin(uTime * 1.7 + buHash * 6.2831);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 buDir = normalize(position);
transformed += buDir * aWave * uWaveAmp * sin(uTime * 1.2 + dot(position, vec3(3.1, 2.3, 1.7)) * 1.4);
vSphereNormal = normalize(normalMatrix * buDir);`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uRimColor;
uniform float uRimStrength;
varying vec3 vSphereNormal;`)
        .replace('#include <opaque_fragment>', `float buRim = 1.0 - max(dot(normalize(vSphereNormal), normalize(vViewPosition)), 0.0);
outgoingLight += uRimColor * pow(buRim, 3.0) * uRimStrength;
#include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => 'buildu-globe'
    this.globe = new THREE.Mesh(geometry, material)
    this.globe.name = 'globe'
    this.scene.add(this.globe)
  }

  buildAtmosphere() {
    const scale = 1.16
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#7cc4ff') },
        uInner: { value: Math.sqrt(1 - (1 / scale) ** 2) },
        uIntensity: { value: 1.05 },
      },
      vertexShader: /* glsl */`
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uInner;
        uniform float uIntensity;
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          float x = -dot(normalize(vN), normalize(-vP));
          float k = clamp(x / uInner, 0.0, 1.0);
          gl_FragColor = vec4(uColor, pow(k, 2.4) * uIntensity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(this.R * scale, 64, 40), material)
    this.atmosphere.renderOrder = 1
    this.scene.add(this.atmosphere)
  }

  buildClouds() {
    const rnd = mulberry32(11)
    const holder = new THREE.Object3D()
    const clusters = []
    for (let i = 0; i < 26; i++) {
      const lat = (rnd() * 2 - 1) * 62
      const lon = rnd() * 360 - 180
      const puffs = []
      const count = 3 + Math.floor(rnd() * 3)
      for (let p = 0; p < count; p++) {
        const g = new THREE.IcosahedronGeometry(this.R * (0.026 + rnd() * 0.022), 0)
        g.scale(1, 0.55, 1)
        g.translate((p - count / 2) * this.R * 0.032 + (rnd() - 0.5) * this.R * 0.016, rnd() * this.R * 0.01, (rnd() - 0.5) * this.R * 0.026)
        puffs.push(g)
      }
      const cluster = mergeGeometries(puffs)
      puffs.forEach(g => g.dispose())
      const n = latLonToVector3(lat, lon, 1)
      holder.position.copy(n).multiplyScalar(this.R * (1.1 + rnd() * 0.035))
      holder.quaternion.copy(surfaceQuaternion(n))
      holder.rotateY(rnd() * Math.PI * 2)
      holder.updateMatrix()
      cluster.applyMatrix4(holder.matrix)
      clusters.push(cluster)
    }
    const geometry = mergeGeometries(clusters)
    clusters.forEach(g => g.dispose())
    // As nuvens se abrem ao passar sobre os espaços, para nunca esconder um monumento.
    this.cloudUniforms = { uAvoid: { value: this.spaces.map(s => latLonToVector3(s.lat, s.lon, 1)) } }
    while (this.cloudUniforms.uAvoid.value.length < MAX_SPACES) this.cloudUniforms.uAvoid.value.push(new THREE.Vector3(0, -1, 0))
    this.cloudMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff, emissive: 0xdde8ff, emissiveIntensity: 0.28, flatShading: true, transparent: true, opacity: 0.95,
    })
    this.cloudMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.cloudUniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform vec3 uAvoid[${MAX_SPACES}];
varying float vCloudFade;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 buW = normalize((modelMatrix * vec4(transformed, 1.0)).xyz);
vCloudFade = 1.0;
for (int i = 0; i < ${MAX_SPACES}; i++) vCloudFade = min(vCloudFade, 1.0 - smoothstep(0.984, 0.995, dot(buW, uAvoid[i])));`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vCloudFade;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.a *= vCloudFade;
if (diffuseColor.a < 0.02) discard;`)
    }
    this.cloudMaterial.customProgramCacheKey = () => 'buildu-clouds'
    this.clouds = new THREE.Mesh(geometry, this.cloudMaterial)
    this.clouds.rotation.z = 0.08
    this.clouds.renderOrder = 10 // depois dos marcadores: escrevem profundidade sem esconder nada
    this.scene.add(this.clouds)
  }

  buildStars() {
    const rnd = mulberry32(3)
    const count = 700
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const v = new THREE.Vector3()
    const tints = [new THREE.Color('#ffffff'), new THREE.Color('#cfe3ff'), new THREE.Color('#fff1c9')]
    for (let i = 0; i < count; i++) {
      v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(140 + rnd() * 60)
      positions.set([v.x, v.y, v.z], i * 3)
      const c = tints[i % 3].clone().multiplyScalar(0.35 + rnd() * 0.65)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    }))
    this.scene.add(this.stars)
  }

  buildMarkers() {
    const down = new THREE.Vector3()
    this.globe.updateMatrixWorld(true)
    this.spaces.forEach((space, index) => {
      const n = latLonToVector3(space.lat, space.lon, 1)
      // Raio exato da superfície (relevo + platô) por raycast ao longo da normal.
      this.raycaster.set(n.clone().multiplyScalar(this.R * 2), down.copy(n).negate())
      const hit = this.raycaster.intersectObject(this.globe, false)[0]
      const surface = hit ? hit.point.length() : this.R
      const marker = new SpaceMarker(space, { index, surfaceRadius: surface - this.R * 0.002, size: this.R * 0.12 })
      marker.setState(space, { animate: false })
      this.markers.set(space.id, marker)
      this.hitProxies.push(marker.hitProxy)
      this.scene.add(marker.root)
      this.globeUniforms.uBloom.value[index].set(n.x, n.y, n.z, space.concluido ? 1 : 0)
    })
  }

  async loadModels() {
    for (const marker of this.markers.values()) {
      const ok = await marker.loadModel(this.loader)
      if (this.disposed) return
      if (ok) {
        const i = this.hitProxies.findIndex(p => p.userData.spaceId === marker.id)
        if (i >= 0) this.hitProxies[i] = marker.hitProxy
        this.updatePaths()
      }
      this.callbacks.onModel({ id: marker.id, source: marker.modelSource })
    }
  }

  setupControls() {
    const c = new OrbitControls(this.camera, this.canvas)
    c.target.set(0, 0, 0)
    c.enablePan = false
    c.enableDamping = !this.reducedMotion
    c.dampingFactor = 0.08
    c.rotateSpeed = 0.5
    c.zoomSpeed = 0.8
    c.minPolarAngle = 0.18
    c.maxPolarAngle = Math.PI - 0.18
    c.autoRotateSpeed = 0.35
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }
    c.addEventListener('start', () => {
      this.lastInteraction = performance.now()
      this.cancelFly()
      this.focusedId = null
      c.autoRotate = false
      this.callbacks.onInteract()
    })
    this.controls = c
  }

  bindEvents() {
    const canvas = this.canvas
    canvas.style.touchAction = 'none'
    this.onPointerDown = (e) => {
      this.activePointers.add(e.pointerId)
      this.lastInteraction = performance.now()
      if (this.activePointers.size > 1) { if (this.gesture) this.gesture.multi = true; return }
      this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), multi: false }
    }
    this.onPointerUp = (e) => {
      this.activePointers.delete(e.pointerId)
      const g = this.gesture
      if (!g || g.id !== e.pointerId) return
      this.gesture = null
      if (g.multi) return
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8 && performance.now() - g.t < 650) this.handleTap(e.clientX, e.clientY)
    }
    this.onPointerCancel = (e) => { this.activePointers.delete(e.pointerId); this.gesture = null }
    this.onPointerMove = (e) => {
      if (e.pointerType !== 'mouse' || e.buttons !== 0) return
      this.hoverPointer = { x: e.clientX, y: e.clientY }
      this.hoverDirty = true
    }
    this.onPointerLeave = () => { this.hoverPointer = null; this.hoverDirty = true }
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement || canvas)
  }

  // ---------- Estado ----------
  orderedMarkers() {
    return this.spaces.map(s => this.markers.get(s.id)).filter(Boolean)
  }

  currentMarker() {
    const list = this.orderedMarkers()
    let current = list[0]
    for (const m of list) if (m.state.desbloqueado) current = m
    return current
  }

  spaceInfo(marker) {
    return { ...marker.space, ...marker.state }
  }

  /**
   * Atualiza os estados dos espaços. Com animate=true, cada desbloqueio/conclusão
   * nova vira uma animação na fila (concluir N e desbloquear N+1 tocam em sequência).
   */
  setSpaces(list, { animate = true } = {}) {
    const events = []
    for (const s of list) {
      const m = this.markers.get(s.id)
      if (!m) continue
      const prev = m.state
      const next = { desbloqueado: !!s.desbloqueado, concluido: !!s.concluido }
      const regress = (prev.desbloqueado && !next.desbloqueado) || (prev.concluido && !next.concluido)
      if (!animate || regress) {
        m.setState(next, { animate: false })
        gsap.killTweensOf(this.globeUniforms.uBloom.value[m.index])
        this.globeUniforms.uBloom.value[m.index].w = next.concluido ? 1 : 0
        continue
      }
      m.setState(next, { animate: true })
      if (!prev.desbloqueado && next.desbloqueado) events.push(() => this.runUnlock(s.id))
      if (!prev.concluido && next.concluido) events.push(() => this.runComplete(s.id))
    }
    if (!events.length) { this.updatePaths(); return this.queue }
    for (const run of events) this.enqueue(run)
    return this.enqueue(() => this.updatePaths())
  }

  enqueue(fn) {
    this.queue = this.queue.then(() => (this.disposed ? null : fn())).catch((error) => console.error('[BuildU] animação do mapa', error))
    return this.queue
  }

  async runUnlock(id) {
    const m = this.markers.get(id)
    if (!m || !m.state.desbloqueado || m.shown.desbloqueado) return
    this.setCinematic(true)
    await this.flyTo(id, { distance: this.focusDistance * 1.05 })
    if (!this.disposed && m.state.desbloqueado) {
      await m.playUnlock(this.timeScale)
      this.updatePaths()
      this.callbacks.onUnlocked(this.spaceInfo(m))
    }
    this.setCinematic(false)
  }

  async runComplete(id) {
    const m = this.markers.get(id)
    if (!m || !m.state.concluido || m.shown.concluido) return
    this.setCinematic(true)
    await this.flyTo(id, { distance: this.focusDistance * 1.3 })
    if (!this.disposed && m.state.concluido) {
      const bloom = gsap.to(this.globeUniforms.uBloom.value[m.index], { w: 1, duration: 2.8 / this.timeScale, ease: 'power1.inOut' })
      await m.playComplete(this.timeScale)
      this.callbacks.onCompleted(this.spaceInfo(m))
      await bloom.then()
      this.updatePaths()
    }
    this.setCinematic(false)
  }

  setCinematic(on) {
    this.cinematic = Math.max(0, this.cinematic + (on ? 1 : -1))
    this.callbacks.onCinematic(this.cinematic > 0)
  }

  /** Repete a animação de desbloqueio (modo debug). */
  replayUnlock(id) {
    const m = this.markers.get(id)
    if (!m || !m.state.desbloqueado) return this.queue
    const wasCompleted = m.state.concluido
    return this.enqueue(async () => {
      const bloom = this.globeUniforms.uBloom.value[m.index]
      gsap.killTweensOf(bloom)
      bloom.w = 0
      m.setState({ desbloqueado: false, concluido: false }, { animate: false })
      this.updatePaths()
      m.setState({ desbloqueado: true, concluido: false }, { animate: true })
      await this.runUnlock(id)
      if (wasCompleted) {
        m.setState({ desbloqueado: true, concluido: true }, { animate: true })
        await this.runComplete(id)
      }
    })
  }

  updatePaths() {
    const list = this.orderedMarkers()
    let current = -1
    list.forEach((m, i) => { if (m.shown.desbloqueado) current = i })
    const seg = (a, b) => ({
      a: a.normal, b: b.normal,
      ha: a.surfaceRadius / this.R - 1 + 0.02, hb: b.surfaceRadius / this.R - 1 + 0.02,
    })
    const trail = []
    for (let i = 0; i < current; i++) if (list[i].shown.concluido && list[i + 1].shown.desbloqueado) trail.push(seg(list[i], list[i + 1]))
    this.trail.setSegments(trail)
    this.trail.update(0)
    this.activePath.setSegments(current >= 0 && current < list.length - 1 ? [seg(list[current], list[current + 1])] : [])
  }

  // ---------- Câmera ----------
  // A câmera orbita o centro do globo (OrbitControls), mas inclina para o horizonte
  // conforme o zoom: visão geral centralizada, de perto uma vista 3/4 dos monumentos.
  pitchFor(distance) {
    const span = Math.max(this.overviewDistance - this.controls.minDistance, 1e-3)
    const t = (distance - this.controls.minDistance) / span
    return PITCH_MAX * (1 - THREE.MathUtils.smoothstep(t, 0.05, 0.75))
  }

  applyPitch() {
    const p = this.pitchFor(this.camera.position.length())
    if (p > 1e-4) this.camera.rotateX(p)
  }

  /** Direção da câmera para que, com a inclinação daquela distância, o espaço fique no centro da tela. */
  focusDirection(id, distance, target = new THREE.Vector3()) {
    const m = this.markers.get(id)
    if (!m) return target.set(0, 0, 1)
    const k = Math.tan(this.pitchFor(distance))
    const r = m.surfaceRadius + m.modelHeight * 0.45
    // Ângulo α ao sul do espaço em que ele aparece exatamente "pitch" acima do eixo de visão.
    const f = a => r * Math.sin(a) - k * (distance - r * Math.cos(a))
    let lo = 0, hi = 1.3
    if (k > 1e-4 && f(hi) > 0) {
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2
        if (f(mid) > 0) hi = mid
        else lo = mid
      }
    }
    else hi = 0
    return target.copy(m.normal).applyAxisAngle(m.east, hi).normalize()
  }

  placeCameraAt(id, distance) {
    this.camera.position.copy(this.focusDirection(id, distance)).multiplyScalar(distance)
    this.camera.lookAt(0, 0, 0)
    this.controls.update()
  }

  /** Gira a câmera ao redor do globo até o espaço e aproxima. Resolve true se completou. */
  flyTo(id, { distance = this.focusDistance, duration } = {}) {
    this.cancelFly()
    const m = this.markers.get(id)
    if (!m) return Promise.resolve(false)
    const fromDir = this.camera.position.clone().normalize()
    const fromDist = this.camera.position.length()
    const toDist = THREE.MathUtils.clamp(distance, this.controls.minDistance, this.controls.maxDistance)
    const toDir = this.focusDirection(id, toDist)
    const angle = angularDistance(fromDir, toDir)
    const lift = Math.min(angle / Math.PI, 1) * this.R * 0.9
    const time = (duration ?? THREE.MathUtils.clamp(0.9 + angle * 0.6, 0.9, 2.3)) / this.timeScale
    // Zera a inércia do OrbitControls antes de assumir a câmera.
    this.controls.enableDamping = false
    this.controls.update()
    this.controls.autoRotate = false
    this.flying = true
    const dir = new THREE.Vector3()
    const proxy = { t: 0 }
    return new Promise((resolve) => {
      this.flyResolve = resolve
      this.flyTween = gsap.to(proxy, {
        t: 1, duration: time, ease: 'power2.inOut',
        onUpdate: () => {
          slerpDirections(fromDir, toDir, proxy.t, dir).normalize()
          const d = THREE.MathUtils.lerp(fromDist, toDist, proxy.t) + Math.sin(Math.PI * proxy.t) * lift
          this.camera.position.copy(dir).multiplyScalar(d)
          this.camera.lookAt(0, 0, 0)
          this.applyPitch()
        },
        onComplete: () => this.finishFly(true),
      })
    })
  }

  finishFly(completed) {
    if (!this.flying) return
    this.flying = false
    this.flyTween = null
    this.controls.update()
    this.controls.enableDamping = !this.reducedMotion
    const resolve = this.flyResolve
    this.flyResolve = null
    resolve?.(completed)
  }

  cancelFly() {
    if (!this.flying) return
    this.flyTween?.kill()
    this.finishFly(false)
  }

  /** Foca um espaço (sem abrir). */
  focusSpace(id) {
    this.focusedId = id
    return this.flyTo(id)
  }

  /** Volta para a visão geral, centrada no espaço atual. */
  resetView() {
    this.focusedId = null
    return this.flyTo(this.currentMarker()?.id, { distance: this.overviewDistance })
  }

  // ---------- Interação ----------
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.hitProxies, false)
    if (!hits.length) return null
    const globeHit = this.raycaster.ray.intersectSphere(this.occluder, this.tmp)
    const globeDistance = globeHit ? globeHit.distanceTo(this.raycaster.ray.origin) : Infinity
    const hit = hits.find(h => h.distance < globeDistance)
    return hit ? this.markers.get(hit.object.userData.spaceId) : null
  }

  handleTap(clientX, clientY) {
    const marker = this.pick(clientX, clientY)
    if (!marker) { this.callbacks.onTap(null); return }
    this.activate(marker.id)
  }

  /** Mesmo efeito de tocar no espaço (usado também pelo teclado). */
  activate(id) {
    const m = this.markers.get(id)
    if (!m) return
    const space = this.spaceInfo(m)
    if (m.state.desbloqueado) {
      this.focusedId = id
      this.callbacks.onTap({ space, locked: false })
      this.flyTo(id).then((ok) => { if (ok && !this.disposed) this.callbacks.onOpen(space) })
    }
    else {
      m.shake()
      const i = this.spaces.findIndex(s => s.id === id)
      const previous = i > 0 ? this.spaceInfo(this.markers.get(this.spaces[i - 1].id)) : null
      this.callbacks.onTap({ space, locked: true, previous })
    }
  }

  setTracked(id) { this.trackedId = id }

  updateHover() {
    this.hoverDirty = false
    const marker = this.hoverPointer && !this.flying ? this.pick(this.hoverPointer.x, this.hoverPointer.y) : null
    const id = marker?.id || null
    if (id === this.hoveredId) return
    if (this.hoveredId) this.markers.get(this.hoveredId)?.setHovered(false)
    this.hoveredId = id
    marker?.setHovered(true)
    this.canvas.style.cursor = marker ? 'pointer' : ''
    this.callbacks.onHover(marker ? this.spaceInfo(marker) : null)
  }

  projectMarker(id) {
    const m = this.markers.get(id)
    if (!m) return null
    const anchor = m.getAnchor(this.tmp)
    const facing = this.tmp2.copy(this.camera.position).sub(anchor).normalize().dot(m.normal)
    const p = anchor.project(this.camera)
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, visible: facing > 0.05 && p.z < 1 }
  }

  // ---------- Loop ----------
  resize() {
    const el = this.canvas.parentElement || this.canvas
    const w = el.clientWidth, h = el.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = this.camera.aspect < 0.8 ? 46 : 35
    this.camera.updateProjectionMatrix()
    const vFov = this.camera.fov * DEG
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect)
    const minFov = Math.min(vFov, hFov)
    this.overviewDistance = (this.R * 1.14) / Math.sin(minFov / 2)
    this.controls.minDistance = this.R * 1.4
    this.controls.maxDistance = this.overviewDistance * 1.3
    this.focusDistance = THREE.MathUtils.clamp(this.R + (this.R * 0.17) / Math.tan(minFov / 2), this.controls.minDistance, this.controls.maxDistance)
  }

  tick() {
    if (this.disposed) return
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.elapsed += dt
    const t = this.elapsed
    const now = performance.now()

    if (!this.flying) {
      const idle = now - this.lastInteraction > 12000
      this.controls.autoRotate = idle && !this.cinematic && !this.focusedId && !this.reducedMotion
      this.controls.update(dt)
      this.applyPitch()
    }
    const dist = this.camera.position.length()
    const zoom = THREE.MathUtils.clamp((dist - this.controls.minDistance) / (this.controls.maxDistance - this.controls.minDistance), 0, 1)
    this.controls.rotateSpeed = 0.16 + 0.5 * zoom

    this.globeUniforms.uTime.value = t
    this.clouds.rotation.y += dt * 0.012
    const cloudOpacity = 0.12 + 0.83 * THREE.MathUtils.smoothstep(dist, this.R * 1.75, this.R * 2.6)
    this.cloudMaterial.opacity = cloudOpacity
    this.stars.rotation.y += dt * 0.002

    for (const m of this.markers.values()) m.update(t, dt)
    this.pathPhase = (this.pathPhase + dt * 1.4) % 1
    this.activePath.update(this.pathPhase)

    if (this.hoverDirty) this.updateHover()
    if (this.trackedId) {
      const pos = this.projectMarker(this.trackedId)
      if (pos) this.callbacks.onTrack(pos)
    }

    this.renderer.render(this.scene, this.camera)
    this.measure(dt)
  }

  // FPS para o debug e redução automática de resolução em aparelhos mais fracos.
  measure(dt) {
    this.frames++
    this.frameTime += dt
    this.statsTime += dt
    if (this.statsTime >= 0.5) {
      const info = this.renderer.info.render
      this.callbacks.onStats({ fps: Math.round(this.frames / this.frameTime), pixelRatio: this.pixelRatio, calls: info.calls, triangles: info.triangles })
      if (this.elapsed > 4 && this.frames / this.frameTime < 48 && this.pixelRatio > 1) {
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25)
        this.renderer.setPixelRatio(this.pixelRatio)
        this.resize()
      }
      this.frames = 0
      this.frameTime = 0
      this.statsTime = 0
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.cancelFly()
    for (const b of this.globeUniforms.uBloom.value) gsap.killTweensOf(b)
    const canvas = this.canvas
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointercancel', this.onPointerCancel)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    for (const m of this.markers.values()) m.dispose()
    this.markers.clear()
    this.trail.dispose()
    this.activePath.dispose()
    for (const mesh of [this.globe, this.atmosphere, this.clouds, this.stars]) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
    this.envTexture.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
