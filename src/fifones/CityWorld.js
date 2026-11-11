import * as THREE from 'three'
import { gsap } from 'gsap'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
// CubeCity, MIT: retain its simulation-object lifecycle and recursive tile picking.
import SimObject from '@/js/components/tiles/sim-object.js'
import { getIntersectedTile } from '@/js/tools/interactor/utils.js'
import { fitModel } from '../world/SpaceMarker.js'
import { WORLD_MODELS_MANIFEST } from '../world/worldSpaces.js'
import { createCoreBuilding, createEnvironment, material } from './sceneEnvironment.js'

const SIZE = 17
const CENTER = 8
const NOOP = () => {}
const ACTIVITY_MAX_AGE = 45_000
const ACTIVITY_STATES = new Set(['working', 'observed', 'focus', 'waiting', 'idle', 'unknown'])
const ACTIVE_STATES = new Set(['working', 'observed', 'focus'])
const SELECTION_EMISSION = new THREE.Color(0xf2944f)
const ACTIVE_EMISSION = new THREE.Color(0x84cfab)
const WAITING_EMISSION = new THREE.Color(0xe7aa56)
const IN_USE_EMISSION = new THREE.Color(0xffb86b)
const heightCaps = { stuntsync: 4.5, stunt: 4.5, chatgpt: 3.8, gpt: 3.8, claude: 3.3 }
const coreKinds = new Set(['plaza', 'headquarters', 'hq', 'road', 'tree', 'park', 'home', 'house'])

function dimensions(definition = {}, rotation = 0) {
  const width = Number(definition.width) || 1
  const depth = Number(definition.depth) || 1
  return Math.abs(rotation % 2) === 1 ? { width: depth, depth: width } : { width, depth }
}

function materials(object, fn) {
  object.traverse((child) => {
    if (!child.material) return
    for (const mat of Array.isArray(child.material) ? child.material : [child.material]) fn(mat, child)
  })
}

function disposeOwned(object, geometry = true, textures = false) {
  const seenMaterials = new Set(), seenGeometry = new Set()
  const ownedTextures = textures ? new Set() : null
  object.traverse((child) => {
    if (geometry && child.geometry && !seenGeometry.has(child.geometry)) {
      seenGeometry.add(child.geometry)
      child.geometry.dispose()
    }
    for (const mat of child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : []) {
      if (seenMaterials.has(mat)) continue
      seenMaterials.add(mat)
      if (ownedTextures) {
        for (const value of Object.values(mat)) if (value?.isTexture) ownedTextures.add(value)
      }
      mat.dispose()
    }
  })
  ownedTextures?.forEach(texture => texture.dispose())
}

function footprint(placement, definition) {
  const { width, depth } = dimensions(definition, placement.rotation)
  const cells = []
  for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < depth; dy++) cells.push({ x: placement.x + dx, y: placement.y + dy })
  return cells
}

export default class CityWorld {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas
    this.callbacks = { onSelect: NOOP, onTile: NOOP, onError: NOOP, onReady: NOOP, onModelStatus: NOOP, ...callbacks }
    this.state = { placements: [], catalog: [], unlock_radius: 3, credits: 0 }
    this.definitions = new Map()
    this.records = new Map()
    this.modelCache = new Map()
    this.tool = { mode: 'select', kind: null, rotation: 0, placementId: null }
    this.selectedId = null
    this.inUseId = null
    this.activity = null
    this.activityCheckedAt = NaN
    this.activityFresh = false
    this.animationTime = 0
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.062)
    this.floorHit = new THREE.Vector3()
    this.hover = null
    this.destroyed = false
    this.pendingModels = 0
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.disposers = []
    this.clock = new THREE.Clock()
    this.loader = new GLTFLoader()
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xd1e4e5)
    this.scene.fog = new THREE.Fog(0xd1e4e5, 48, 105)
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 180)
    this.camera.position.set(17.5, 17.5, 23)
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    }
    catch (error) {
      queueMicrotask(() => this.callbacks.onError(`Não foi possível iniciar o 3D: ${error.message}`))
      return
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.95
    this.renderer.setClearColor(0xd1e4e5)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.set(0, 0.8, 0)
    this.controls.enableDamping = !this.reducedMotion
    this.controls.dampingFactor = 0.075
    this.controls.minDistance = 9
    this.controls.maxDistance = 58
    this.controls.minPolarAngle = 0.25
    this.controls.maxPolarAngle = Math.PI / 2.5
    this.controls.screenSpacePanning = false
    this.controls.panSpeed = 0.7
    this.controls.rotateSpeed = 0.55
    this.controls.zoomSpeed = 0.8
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
    canvas.style.touchAction = 'none'
    this.ambient = new THREE.HemisphereLight(0xe4f2fa, 0x647b55, 1.25)
    this.sun = new THREE.DirectionalLight(0xffd2a4, 2.0)
    this.sun.position.set(-12, 22, 12)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 65 })
    this.sun.shadow.normalBias = 0.035
    this.sun.shadow.bias = -0.00015
    this.scene.add(this.ambient, this.sun)
    this.environment = createEnvironment(this.scene, callbacks.region)
    if (this.environment.landmark) void this.loadLandmark(this.environment.landmarkRegion)
    this.buildings = new THREE.Group()
    this.buildings.name = 'Fifones · CubeCity SimObjects'
    this.picking = new THREE.Group()
    this.picking.name = 'Footprint-aware selection proxies'
    this.scene.add(this.buildings, this.picking)
    this.makeGround()
    this.makeIndicators()
    this.installEvents()
    this.resize()
    this.frame = this.frame.bind(this)
    this.raf = requestAnimationFrame(this.frame)
    queueMicrotask(() => { if (!this.destroyed) this.callbacks.onReady() })
  }

  makeGround() {
    const geo = new THREE.BoxGeometry(0.98, 0.035, 0.98)
    this.tiles = new THREE.InstancedMesh(geo, material(0xffffff), SIZE * SIZE)
    this.tiles.receiveShadow = true
    this.tiles.name = '17 × 17 buildable lots'
    const dummy = new THREE.Object3D()
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      dummy.position.set(x - CENTER, 0.045, y - CENTER)
      dummy.updateMatrix()
      this.tiles.setMatrixAt(y * SIZE + x, dummy.matrix)
    }
    this.scene.add(this.tiles)
    this.unlockBoundary = new THREE.Group()
    this.unlockBoundary.name = 'Perímetro da área desbloqueada'
    const boundaryMaterial = material(0xe7dfb9)
    for (let i = 0; i < 4; i++) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), boundaryMaterial)
      edge.receiveShadow = true
      this.unlockBoundary.add(edge)
    }
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.19, 0.09), material(0xe5a35c))
      post.castShadow = true
      this.unlockBoundary.add(post)
    }
    this.scene.add(this.unlockBoundary)
    this.refreshGround()
  }

  refreshGround() {
    if (!this.tiles) return
    const radius = this.state.unlock_radius ?? 3
    const open = new THREE.Color(this.environment.tileColor)
    const dummy = new THREE.Object3D()
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const unlocked = Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)) <= radius
      const color = open.clone().multiplyScalar(1 + (((x * 13 + y * 7) % 7) - 3) * 0.007)
      this.tiles.setColorAt(y * SIZE + x, color)
      dummy.position.set(x - CENTER, unlocked ? 0.045 : -1, y - CENTER)
      dummy.scale.setScalar(unlocked ? 1 : 0.0001)
      dummy.updateMatrix()
      this.tiles.setMatrixAt(y * SIZE + x, dummy.matrix)
    }
    this.tiles.instanceColor.needsUpdate = true
    this.tiles.instanceMatrix.needsUpdate = true
    if (this.unlockBoundary) {
      const edge = Math.min(radius, 8) + 0.5, side = edge * 2
      const [north, south, west, east, ...posts] = this.unlockBoundary.children
      north.scale.set(side, 1, 0.045); north.position.set(0, 0.075, -edge)
      south.scale.set(side, 1, 0.045); south.position.set(0, 0.075, edge)
      west.scale.set(0.045, 1, side); west.position.set(-edge, 0.075, 0)
      east.scale.set(0.045, 1, side); east.position.set(edge, 0.075, 0)
      posts.forEach((post, i) => post.position.set(i % 2 ? edge : -edge, 0.14, i < 2 ? -edge : edge))
    }
  }

  makeIndicators() {
    this.selection = new THREE.Group()
    this.selection.name = 'Selected building footprint'
    const mat = new THREE.MeshBasicMaterial({ color: 0xf18b46, depthTest: false, transparent: true, opacity: 0.9 })
    const geometry = new THREE.BoxGeometry(1, 0.025, 1)
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(geometry, mat)
      line.renderOrder = 9
      this.selection.add(line)
    }
    this.selection.visible = false
    this.scene.add(this.selection)
    this.preview = new THREE.Group()
    this.preview.name = 'Validated full building footprint'
    this.previewFloor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.055, 1), new THREE.MeshBasicMaterial({ color: 0x91d94b, transparent: true, opacity: 0.5, depthWrite: false }))
    this.previewGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xa4e36c, transparent: true, opacity: 0.16, depthWrite: false }))
    this.preview.add(this.previewFloor, this.previewGhost)
    this.preview.visible = false
    this.scene.add(this.preview)
  }

  installEvents() {
    const listen = (target, event, callback, options) => {
      target.addEventListener(event, callback, options)
      this.disposers.push(() => target.removeEventListener(event, callback, options))
    }
    listen(this.canvas, 'contextmenu', event => event.preventDefault())
    listen(this.canvas, 'pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return
      this.down = { x: event.clientX, y: event.clientY, id: event.pointerId, dragged: false }
    })
    listen(window, 'pointermove', (event) => {
      if (this.down && event.pointerId === this.down.id && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 5) this.down.dragged = true
    })
    listen(this.canvas, 'pointermove', (event) => {
      this.updatePointer(event)
      if (!this.down?.dragged) this.updateHover()
    })
    listen(this.canvas, 'pointerleave', () => { this.hover = null; this.preview.visible = false; this.canvas.style.cursor = 'grab' })
    listen(this.canvas, 'pointercancel', () => { this.down = null })
    listen(window, 'pointerup', (event) => {
      const down = this.down
      this.down = null
      if (!down || event.pointerId !== down.id || down.dragged || event.button !== 0) return
      const rect = this.canvas.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
      this.updatePointer(event)
      this.click()
    })
    listen(window, 'resize', () => this.resize())
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize())
      this.observer.observe(this.canvas.parentElement || this.canvas)
    }
    listen(this.canvas, 'webglcontextlost', (event) => {
      event.preventDefault()
      this.callbacks.onError('O contexto 3D foi interrompido. Recarregue a página para restaurar a cidade.')
    })
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
  }

  getTile() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    if (!this.raycaster.ray.intersectPlane(this.floor, this.floorHit)) return null
    const x = Math.floor(this.floorHit.x + CENTER + 0.5)
    const y = Math.floor(this.floorHit.z + CENTER + 0.5)
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE ? { x, y } : null
  }

  getBuilding() {
    // Original CubeCity helper resolves the nearest intersected child back to its tile.
    const tile = getIntersectedTile(this.raycaster, { normalizedMouse: this.pointer }, this.camera, this.picking)
    return tile?.placement || null
  }

  updateHover() {
    if (this.destroyed) return
    this.hover = this.getTile()
    const building = this.getBuilding()
    this.canvas.style.cursor = this.tool.mode === 'build' || this.tool.mode === 'move' ? 'crosshair' : building ? 'pointer' : 'grab'
    this.refreshPreview()
  }

  click() {
    if (this.tool.mode === 'build' || this.tool.mode === 'move') {
      const tile = this.getTile()
      if (tile) this.callbacks.onTile(tile)
      return
    }
    const placement = this.getBuilding()
    this.setSelected(placement?.id || null)
    this.callbacks.onSelect(placement)
  }

  setState(snapshot) {
    this.state = snapshot || this.state
    this.definitions = new Map((this.state.catalog || []).map(item => [item.id, item]))
    if (!this.renderer || this.destroyed) return
    const animateNew = Boolean(this.hydrated)
    const placements = this.state.placements || []
    const next = new Set(placements.map(item => item.id))
    for (const [id, record] of this.records) {
      if (!next.has(id)) { this.removeRecord(record); this.records.delete(id) }
    }
    for (const placement of placements) {
      const definition = this.definitions.get(placement.kind) || {}
      // A etapa do prédio de uma atividade entra na chave: ao mudar, o volume é refeito.
      const key = `${placement.kind}:${definition.model || ''}:${placement.etapa ?? ''}`
      let record = this.records.get(placement.id)
      if (record && record.key !== key) {
        this.removeRecord(record)
        this.records.delete(placement.id)
        record = null
      }
      if (!record) {
        record = this.createRecord(placement, definition, key)
        this.records.set(placement.id, record)
        record.constructionPending = animateNew
        if (definition.model && !coreKinds.has(placement.kind)) this.loadModel(record, definition)
      }
      record.placement = { ...placement }
      record.proxy.userData.placement = record.placement
      this.updateLevelDetails(record, definition)
      this.positionRecord(record, definition)
      if (record.constructionPending && !definition.model) this.animateConstruction(record)
    }
    this.hydrated = true
    if (!next.has(this.selectedId)) this.selectedId = null
    if (!next.has(this.inUseId)) this.inUseId = null
    this.refreshGround()
    this.refreshSelection()
    this.refreshPreview()
  }

  createRecord(placement, definition, key) {
    // These are the original CubeCity SimObjects, with Rio geometry and model resources.
    const sim = new SimObject()
    sim.name = `${definition.label || placement.kind} · ${placement.id}`
    const mesh = createCoreBuilding(placement.kind, definition, placement)
    sim.setMesh(mesh)
    this.buildings.add(sim)
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }))
    proxy.userData = { placement: { ...placement }, setBuilding: NOOP }
    proxy.name = `Selectable footprint · ${placement.id}`
    this.picking.add(proxy)
    const record = { key, sim, proxy, placement: { ...placement }, height: mesh.userData.height || 0.5, loaded: false, logos: [], baseMaterials: new Map() }
    this.captureMaterials(record)
    this.positionRecord(record, definition)
    return record
  }

  updateLevelDetails(record, definition) {
    const level = Math.max(1, Math.min(3, Number(record.placement.level) || 1))
    if (record.detailLevel === level) return
    if (record.levelDetails) {
      record.sim.remove(record.levelDetails)
      disposeOwned(record.levelDetails)
      record.levelDetails = null
    }
    record.detailLevel = level
    if (level === 1) return
    const details = new THREE.Group()
    details.name = `Level ${level} · physical lot improvements`
    details.userData = { level, placementId: record.placement.id }
    const width = Number(definition.width) || 1, depth = Number(definition.depth) || 1
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const amber = material(0xf4bd68, { emissive: 0xe5a044, emissiveIntensity: 0.65, roughness: 0.45 })
    const add = (x, y, z, w, h, d, mat = amber) => {
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.position.set(x, y, z)
      mesh.scale.set(w, h, d)
      details.add(mesh)
      return mesh
    }
    const edgeX = width / 2 - 0.055, edgeZ = depth / 2 - 0.055
    add(0, 0.035, -edgeZ, width - 0.07, 0.026, 0.025)
    add(0, 0.035, edgeZ, width - 0.07, 0.026, 0.025)
    add(-edgeX, 0.035, 0, 0.025, 0.026, depth - 0.07)
    add(edgeX, 0.035, 0, 0.025, 0.026, depth - 0.07)
    if (level >= 3) {
      const stone = material(0x69745d)
      for (const x of [-edgeX, edgeX]) for (const z of [-edgeZ, edgeZ]) {
        const post = add(x, 0.11, z, 0.055, 0.2, 0.055, stone)
        post.castShadow = true
        add(x, 0.222, z, 0.073, 0.04, 0.073)
      }
    }
    record.levelDetails = details
    record.sim.add(details)
  }
  prepareLogoPivots(record, model) {
    const candidates = []
    model.updateWorldMatrix(true, true)
    model.traverse((object) => {
      if (/logo/i.test(object.name) && (object.isMesh || object.isGroup) && !object.userData.cityLogoPivot) candidates.push(object)
    })
    const candidateSet = new Set(candidates)
    record.logos = []
    for (const object of candidates) {
      let ancestor = object.parent, nested = false
      while (ancestor && ancestor !== model.parent) {
        if (candidateSet.has(ancestor) || ancestor.userData.cityLogoPivot) { nested = true; break }
        ancestor = ancestor.parent
      }
      if (nested || !object.parent) continue
      const parent = object.parent
      parent.updateWorldMatrix(true, true)
      const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert()
      const bounds = new THREE.Box3()
      object.traverse((part) => {
        if (!part.isMesh || !part.geometry) return
        if (!part.geometry.boundingBox) part.geometry.computeBoundingBox()
        if (!part.geometry.boundingBox) return
        const parentTransform = new THREE.Matrix4().multiplyMatrices(parentInverse, part.matrixWorld)
        bounds.union(part.geometry.boundingBox.clone().applyMatrix4(parentTransform))
      })
      if (bounds.isEmpty()) continue
      const center = bounds.getCenter(new THREE.Vector3())
      const pivot = new THREE.Group()
      pivot.name = `Logo pivot · ${object.name}`
      pivot.userData = { cityLogoPivot: true, placementId: record.placement.id }
      pivot.position.copy(center)
      parent.add(pivot)
      // Translation-only reparenting keeps the exact local transform and shared geometry intact.
      object.position.sub(center)
      object.updateMatrix()
      pivot.add(object)
      pivot.updateMatrix()
      record.logos.push({ object: pivot, rotation: 0 })
    }
    model.updateWorldMatrix(true, true)
  }
  captureMaterials(record) {
    record.baseMaterials.clear()
    materials(record.sim.mesh, mat => record.baseMaterials.set(mat, { opacity: mat.opacity, transparent: mat.transparent, emissive: mat.emissive?.clone(), emissiveIntensity: mat.emissiveIntensity }))
  }

  positionRecord(record, definition) {
    const { width, depth } = dimensions(definition, record.placement.rotation)
    const x = record.placement.x - CENTER + (width - 1) / 2
    const z = record.placement.y - CENTER + (depth - 1) / 2
    record.sim.position.set(x, 0.065, z)
    record.sim.rotation.y = -(record.placement.rotation || 0) * Math.PI / 2
    record.proxy.position.set(x, 0.065 + record.height / 2, z)
    record.proxy.scale.set(width * 0.92, Math.max(record.height, 0.11), depth * 0.92)
  }

  async loadLandmark(region) {
    try {
      const response = await fetch(WORLD_MODELS_MANIFEST)
      if (!response.ok) return
      const models = await response.json()
      if (this.destroyed || !Array.isArray(models) || !models.includes(region.id)) return
      const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js')
      if (this.destroyed) return
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      const { scene } = await loader.loadAsync(region.glbPath)
      if (this.destroyed) {
        disposeOwned(scene, true, true)
        return
      }
      scene.rotation.y += region.rotacaoY * Math.PI / 180
      const size = this.environment.landmark.userData.size
      const model = fitModel(scene, size.footprint, size.height)
      if (model.userData.fittedHeight <= 0) {
        disposeOwned(model, true, true)
        return
      }
      scene.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      const anchor = this.environment.landmark
      const [fallback] = anchor.children
      anchor.remove(fallback)
      disposeOwned(fallback)
      anchor.add(model)
    } catch {
      // A cidade mantém o monumento procedural quando o GLB está indisponível.
    }
  }

  async loadModel(record, definition) {
    const url = definition.model
    this.pendingModels++
    this.callbacks.onModelStatus({ kind: record.placement.kind, status: 'loading' })
    try {
      if (!this.modelCache.has(url)) this.modelCache.set(url, this.loader.loadAsync(url))
      const resource = await this.modelCache.get(url)
      if (this.destroyed || this.records.get(record.placement.id) !== record) return
      const hasArrays = (() => { let found = false; resource.scene.traverse(child => { if (Array.isArray(child.material)) found = true }); return found })()
      let model
      if (hasArrays) {
        // The original method assumes a single material; support the GLTF multi-material case.
        model = resource.scene.clone(true)
        model.traverse((child) => {
          if (child.material) child.material = Array.isArray(child.material) ? child.material.map(mat => mat.clone()) : child.material.clone()
        })
      }
      else model = record.sim.initMeshFromResource(resource)
      const sourceNodes = []
      resource.scene.traverse(child => sourceNodes.push(child))
      let nodeIndex = 0
      model.traverse((child) => {
        const source = sourceNodes[nodeIndex++]
        child.userData = { placementId: record.placement.id }
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
          if (child.material && !Array.isArray(child.material) && source?.material) {
            child.material.transparent = source.material.transparent
            child.material.depthWrite = source.material.depthWrite
          }
        }
      })
      const bounds = new THREE.Box3().setFromObject(model)
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      const baseWidth = Number(definition.width) || 1, baseDepth = Number(definition.depth) || 1
      const cap = heightCaps[record.placement.kind] || Number(definition.height) || 2.8
      const scale = Math.min(baseWidth * 0.9 / Math.max(size.x, 0.01), baseDepth * 0.9 / Math.max(size.z, 0.01), cap / Math.max(size.y, 0.01))
      const group = new THREE.Group()
      const normalized = new THREE.Group()
      normalized.add(model)
      normalized.scale.setScalar(scale)
      normalized.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
      group.add(normalized)
      disposeOwned(record.sim.mesh, true)
      record.sim.setMesh(group)
      record.loaded = true
      record.height = size.y * scale
      this.prepareLogoPivots(record, model)
      this.captureMaterials(record)
      record.selected = undefined
      this.positionRecord(record, definition)
      if (record.light) record.light.position.y = record.height * 0.7
      this.refreshSelection()
      if (record.constructionPending) this.animateConstruction(record)
      this.callbacks.onModelStatus({ kind: record.placement.kind, status: 'ready' })
    }
    catch (error) {
      this.modelCache.delete(url)
      if (!this.destroyed && this.records.get(record.placement.id) === record) {
        record.error = error.message
        this.callbacks.onModelStatus({ kind: record.placement.kind, status: 'error', message: error.message })
        this.callbacks.onError(`O modelo de ${definition.label || record.placement.kind} não carregou. A construção foi preservada.`)
      }
    }
    finally { this.pendingModels-- }
  }

  animateConstruction(record) {
    record.constructionPending = false
    if (this.reducedMotion) return
    gsap.fromTo(record.sim.scale, { x: 0.72, y: 0.08, z: 0.72 }, {
      x: 1, y: 1, z: 1, duration: 0.65, ease: 'back.out(1.25)', overwrite: true,
    })
  }

  removeRecord(record) {
    gsap.killTweensOf(record.sim.scale)
    this.buildings.remove(record.sim)
    this.picking.remove(record.proxy)
    disposeOwned(record.sim.mesh, !record.loaded)
    disposeOwned(record.proxy)
    if (record.levelDetails) disposeOwned(record.levelDetails)
    if (record.light) { record.sim.remove(record.light); record.light.dispose(); record.light = null }
  }

  setTool(tool = {}) {
    this.tool = { mode: 'select', kind: null, rotation: 0, placementId: null, ...tool }
    this.refreshPreview()
  }

  isValid(tile, definition, rotation) {
    if (!tile) return false
    const cells = footprint({ ...tile, rotation }, definition)
    const radius = this.state.unlock_radius ?? 3
    const occupied = new Set()
    for (const placement of this.state.placements || []) {
      if (this.tool.mode === 'move' && placement.id === this.tool.placementId) continue
      for (const cell of footprint(placement, this.definitions.get(placement.kind) || {})) occupied.add(`${cell.x},${cell.y}`)
    }
    return cells.every(cell => cell.x >= 0 && cell.y >= 0 && cell.x < SIZE && cell.y < SIZE && Math.max(Math.abs(cell.x - CENTER), Math.abs(cell.y - CENTER)) <= radius && !occupied.has(`${cell.x},${cell.y}`))
  }

  refreshPreview() {
    if (!this.preview) return
    const moving = this.tool.mode === 'move'
    const placement = moving ? this.state.placements?.find(item => item.id === this.tool.placementId) : null
    const kind = moving ? placement?.kind : this.tool.kind
    const definition = this.definitions.get(kind)
    const active = this.tool.mode === 'build' || moving
    this.preview.visible = Boolean(active && this.hover && definition)
    if (!this.preview.visible) return
    const rotation = this.tool.rotation || 0
    const { width, depth } = dimensions(definition, rotation)
    const valid = this.isValid(this.hover, definition, rotation) && (moving || (this.state.credits ?? Infinity) >= (definition.cost || 0))
    const color = valid ? 0x8fd64c : 0xf08066
    this.preview.position.set(this.hover.x - CENTER + (width - 1) / 2, 0.095, this.hover.y - CENTER + (depth - 1) / 2)
    this.previewFloor.scale.set(width * 0.96, 1, depth * 0.96)
    const height = Math.min(Number(definition.height) || 0.7, 1.7)
    this.previewGhost.position.y = height / 2
    this.previewGhost.scale.set(width * 0.85, height, depth * 0.85)
    this.previewFloor.material.color.setHex(color)
    this.previewGhost.material.color.setHex(color)
    this.preview.userData.valid = valid
    this.preview.userData.cells = footprint({ ...this.hover, rotation }, definition)
  }

  setSelected(id) {
    this.selectedId = id
    this.refreshSelection()
  }

  refreshSelection() {
    if (!this.selection) return
    for (const [id, record] of this.records) {
      // CubeCity's selection feedback operates on cloned materials, preserving GLTF maps.
      if (record.selected !== (id === this.selectedId)) {
        record.selected = id === this.selectedId
        record.sim.setSelected(record.selected)
      }
      this.applyRecordFeedback(record)
    }
    const record = this.records.get(this.selectedId)
    this.selection.visible = Boolean(record)
    if (!record) return
    const { width, depth } = dimensions(this.definitions.get(record.placement.kind), record.placement.rotation)
    this.selection.position.set(record.sim.position.x, 0.105, record.sim.position.z)
    const [top, bottom, left, right] = this.selection.children
    top.scale.set(width, 1, 0.035); top.position.set(0, 0, -depth / 2)
    bottom.scale.set(width, 1, 0.035); bottom.position.set(0, 0, depth / 2)
    left.scale.set(0.035, 1, depth); left.position.set(-width / 2, 0, 0)
    right.scale.set(0.035, 1, depth); right.position.set(width / 2, 0, 0)
  }

  setInUse(id) {
    this.inUseId = id || null
    this.refreshActivityStates()
  }

  setActivity(activity) {
    if (this.destroyed) return
    const places = activity?.places
    if (!places || typeof places !== 'object' || Array.isArray(places)) {
      this.activity = null
      this.activityCheckedAt = NaN
    }
    else {
      const normalized = Object.create(null)
      for (const [kind, signal] of Object.entries(places)) {
        normalized[kind] = {
          state: ACTIVITY_STATES.has(signal?.state) ? signal.state : 'unknown',
          label: typeof signal?.label === 'string' ? signal.label.slice(0, 160) : '',
        }
      }
      this.activity = { places: normalized, checked_at: activity.checked_at }
      this.activityCheckedAt = Date.parse(activity.checked_at)
    }
    this.refreshActivityStates()
  }

  isActivityFresh(now = Date.now()) {
    const age = now - this.activityCheckedAt
    return Boolean(this.activity && Number.isFinite(age) && age >= -5_000 && age <= ACTIVITY_MAX_AGE)
  }

  ensureActivityFreshness(now = Date.now()) {
    const fresh = this.isActivityFresh(now)
    if (fresh !== this.activityFresh) this.refreshActivityStates(now)
  }

  refreshActivityStates(now = Date.now()) {
    this.activityFresh = this.isActivityFresh(now)
    for (const record of this.records.values()) this.applyRecordFeedback(record, now)
  }

  applyRecordFeedback(record, now = Date.now()) {
    const fresh = this.isActivityFresh(now)
    const signal = fresh ? this.activity?.places[record.placement.kind] : null
    const signalState = signal?.state || 'unknown'
    const inUse = record.placement.id === this.inUseId
    const rotating = inUse || ACTIVE_STATES.has(signalState)
    const waiting = !inUse && signalState === 'waiting'
    const lit = rotating || waiting
    if (rotating && !record.rotating) record.activeStartedAt = this.animationTime || 0
    record.rotating = rotating
    const tint = inUse ? IN_USE_EMISSION : waiting ? WAITING_EMISSION : ACTIVE_EMISSION
    for (const [mat, base] of record.baseMaterials) {
      mat.opacity = base.opacity
      mat.transparent = base.transparent
      if (mat.emissive && base.emissive) {
        mat.emissive.copy(base.emissive)
        if (record.selected) mat.emissive.lerp(SELECTION_EMISSION, 0.12)
        if (lit) mat.emissive.lerp(tint, waiting ? 0.09 : 0.18)
      }
      if (base.emissiveIntensity !== undefined) mat.emissiveIntensity = lit ? Math.max(base.emissiveIntensity, 0.55) : base.emissiveIntensity
    }
    if (lit && !record.light) {
      record.light = new THREE.PointLight(0xffffff, 0.55, 3, 2)
      record.light.name = `Activity light · ${record.placement.id}`
      record.sim.add(record.light)
    }
    if (record.light) {
      record.light.visible = lit
      record.light.color.copy(tint)
      record.light.intensity = waiting ? 0.28 : 0.55
      record.light.position.set(0, Math.max(0.3, record.height * 0.65), 0.35)
    }
    if (!rotating || this.reducedMotion) for (const logo of record.logos) logo.object.rotation.y = logo.rotation
    record.sim.userData.inUse = inUse
    record.sim.userData.activityState = signalState
    record.activityView = {
      kind: record.placement.kind,
      state: inUse ? 'in-use' : signalState,
      signalState,
      active: rotating,
      label: signal?.label || '',
      inUse,
      lightOn: lit,
      rotating: rotating && !this.reducedMotion && record.logos.length > 0,
      stale: Boolean(this.activity && !fresh),
    }
  }

  setLighting(mode) {
    if (!this.renderer) return
    const dusk = mode === 'dusk'
    this.scene.background.setHex(dusk ? 0xb9b9c4 : 0xd1e4e5)
    this.scene.fog.color.copy(this.scene.background)
    this.sun.color.setHex(dusk ? 0xffae7a : 0xffd2a4)
    this.sun.intensity = dusk ? 1.5 : 2.0
    this.ambient.color.setHex(dusk ? 0xd3d7ed : 0xe4f2fa)
    this.ambient.intensity = dusk ? 0.85 : 1.25
    this.renderer.toneMappingExposure = dusk ? 0.95 : 0.95
    this.environment.setDusk(dusk)
  }

  focus(id) {
    const record = this.records.get(id)
    if (!record || !this.controls) return
    const oldTarget = this.controls.target.clone()
    this.controls.target.set(record.sim.position.x, Math.min(record.height * 0.3, 1.1), record.sim.position.z)
    this.camera.position.add(this.controls.target.clone().sub(oldTarget))
    this.setSelected(id)
    this.controls.update()
  }

  rotateCamera() {
    if (!this.controls) return
    const offset = this.camera.position.clone().sub(this.controls.target)
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)
    this.camera.position.copy(this.controls.target).add(offset)
    this.controls.update()
  }

  home() {
    if (!this.controls) return
    this.controls.target.set(0, 0.8, 0)
    this.camera.position.set(17.5, 17.5, 23)
    this.controls.update()
  }

  resize() {
    if (!this.renderer || this.destroyed) return
    const rect = this.canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  projectTile(x, y) {
    this.camera.updateMatrixWorld()
    const point = new THREE.Vector3(x - CENTER, 0.08, y - CENTER).project(this.camera)
    const rect = this.canvas.getBoundingClientRect()
    return { x: (point.x + 1) * rect.width / 2, y: (1 - point.y) * rect.height / 2 }
  }

  stats() {
    this.ensureActivityFreshness()
    return { placements: this.records.size, modelsLoaded: [...this.records.values()].filter(record => record.loaded).length, modelsLoading: this.pendingModels, modelErrors: [...this.records.values()].filter(record => record.error).map(record => ({ id: record.placement.id, error: record.error })), drawCalls: this.renderer?.info.render.calls || 0, triangles: this.renderer?.info.render.triangles || 0, revision: this.state.revision, selectedId: this.selectedId, activityCheckedAt: this.activity?.checked_at || null, activityStates: Object.fromEntries([...this.records].map(([id, record]) => [id, { ...record.activityView }])), upgrades: [...this.records.values()].filter(record => record.detailLevel > 1).map(record => ({ id: record.placement.id, level: record.detailLevel, detailMeshes: record.levelDetails.children.length })), previewValid: this.preview?.visible ? this.preview.userData.valid : null }
  }

  animateActivity(time) {
    this.animationTime = time
    this.ensureActivityFreshness()

    if (this.reducedMotion) return
    for (const record of this.records.values()) {
      if (!record.rotating) continue
      const elapsed = Math.max(0, time - record.activeStartedAt)
      for (const logo of record.logos) logo.object.rotation.y = logo.rotation + elapsed * 0.65
    }
  }
  frame() {
    if (this.destroyed) return
    this.raf = requestAnimationFrame(this.frame)
    const time = this.clock.getElapsedTime()
    this.controls.target.x = THREE.MathUtils.clamp(this.controls.target.x, -12, 12)
    this.controls.target.z = THREE.MathUtils.clamp(this.controls.target.z, -12, 12)
    this.controls.target.y = THREE.MathUtils.clamp(this.controls.target.y, 0, 4)
    this.controls.update()
    if (this.camera.position.y < 1.5) this.camera.position.y = 1.5
    this.environment.animate(time, this.reducedMotion)
    this.animateActivity(time)
    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.observer?.disconnect()
    for (const dispose of this.disposers) dispose()
    this.controls?.dispose()
    const textures = new Set(), geometries = new Set(), mats = new Set()
    const collect = object => object.traverse((child) => {
      if (child.geometry) geometries.add(child.geometry)
      for (const mat of child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : []) {
        mats.add(mat)
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value)
      }
    })
    collect(this.scene)
    for (const promise of this.modelCache.values()) promise.then(resource => {
      collect(resource.scene)
      resource.scene.traverse(child => child.geometry?.dispose())
      materials(resource.scene, mat => { for (const value of Object.values(mat)) if (value?.isTexture) value.dispose(); mat.dispose() })
    }).catch(NOOP)
    for (const geometry of geometries) geometry.dispose()
    for (const mat of mats) mat.dispose()
    for (const texture of textures) texture.dispose()
    this.modelCache.clear()
    for (const record of this.records.values()) record.light?.dispose()
    this.records.clear()
    this.activity = null
    this.renderer?.dispose()
    this.scene.clear()
  }
}
