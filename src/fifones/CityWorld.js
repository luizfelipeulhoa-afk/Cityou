import * as THREE from 'three'
import { gsap } from 'gsap'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
// CubeCity, MIT: retain its simulation-object lifecycle and recursive tile picking.
import SimObject from '@/js/components/tiles/sim-object.js'
import { getIntersectedTile } from '@/js/tools/interactor/utils.js'
import { fitModel } from '../world/SpaceMarker.js'
import { applyGlbStyle } from '../tres/glbMaterial.js'
import { toLambertScene } from '../tres/lambert.js'
import { applyGroundBlendTo } from '../tres/groundBlend.js'
import { lightingFor } from '../terrain/lighting.js'
import { WORLD_MODELS_MANIFEST } from '../world/worldSpaces.js'
import { FRONT_STEP, getCityLayout, HILL_STEP, hillLevelAt, isPilotCity, placementProblem, previewBuild, tileKey } from '../../shared/game/city-layout.js'
import { createTapGesture } from '../interaction/tapGesture.js'
import { buildRioFallback, createCoreBuilding, createEnvironment, LANDMARK_FOOTPRINT, LANDMARK_HEIGHT, material } from './sceneEnvironment.js'
import { CHARACTERS } from './characters.js'
import { createWalkRig } from './characterRig.js'
import { createLotGround } from './lotGround.js'

const CENTER = 8
// Altura do chão sob o prédio (acima do platô, para a base não brigar com o chão no z-buffer).
const BUILDING_BASE_Y = 0.065
const NOOP = () => {}
const ACTIVITY_MAX_AGE = 45_000
const ACTIVE_STATES = new Set(['working', 'observed', 'focus'])
const SELECTION_EMISSION = new THREE.Color(0xf2944f)
const ACTIVE_EMISSION = new THREE.Color(0x84cfab)
const WAITING_EMISSION = new THREE.Color(0xe7aa56)
const IN_USE_EMISSION = new THREE.Color(0xffb86b)
const heightCaps = {}
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
    this.region = callbacks.region
    this.layout = getCityLayout(this.region?.id)
    this.pilot = isPilotCity(this.region?.id)
    this.gridSize = this.layout.max - this.layout.min + 1
    this.protected = new Set(this.layout.protectedTiles.map(([x, y]) => tileKey(x, y)))
    // Patamares do morro da comunidade: alturas distintas, da mais alta para a mais baixa (0 é o chão), para o clique.
    this.hillHeights = [...new Set([0, ...(this.layout.hillTiles ?? []).map(([, , level]) => level * HILL_STEP)])].sort((a, b) => b - a)
    this.tap = createTapGesture()
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
    // Desenho sob demanda (etapa 7b): `dirty` pede um quadro; `framesRendered` conta os desenhados (stats()).
    this.dirty = true
    this.framesRendered = 0
    this.lastRender = 0
    this.visible = true
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
    // Luz e céu vêm da tabela da região (src/terrain/lighting.js): o Rio usa a luz com que o terreno foi calibrado.
    this.look = lightingFor(callbacks.region?.id)
    this.groundColor = new THREE.Color(this.look.ground ?? 0xffffff) // compartilhada por todos os prédios (degradê de base)
    this.scene.background = new THREE.Color(this.look.sky)
    this.scene.fog = new THREE.Fog(this.look.sky, this.look.fog.near, this.look.fog.far)
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 180)
    this.camera.position.set(17.5, 17.5, 23)
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    }
    catch (error) {
      queueMicrotask(() => this.callbacks.onError(`Não foi possível iniciar o 3D: ${error.message}`))
      return
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pilot ? 1.25 : 1.5))
    // Sem sombras projetadas (limite do CLAUDE.md): quem prende o prédio ao chão é a sombra de contato (makeContactShadows).
    this.renderer.shadowMap.enabled = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = this.look.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
    this.renderer.toneMappingExposure = this.look.exposure
    this.renderer.setClearColor(this.look.sky)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.set(0, 0.8, 0)
    this.controls.enableDamping = !this.reducedMotion
    this.controls.dampingFactor = 0.075
    this.controls.minDistance = 9
    // No Rio o zoom máximo ficou mais fechado (13/11/2026): a névoa e o orçamento do terreno (rio-cidade.js,
    // src/terrain/lighting.js) foram cortados para o que dá para ver daqui para dentro.
    this.controls.maxDistance = this.pilot ? (this.region?.id === 'cristo-redentor' ? 46 : 73) : 58
    this.controls.minPolarAngle = 0.25
    this.controls.maxPolarAngle = Math.PI / 2.5
    this.controls.screenSpacePanning = false
    this.controls.panSpeed = 0.7
    this.controls.rotateSpeed = 0.55
    this.controls.zoomSpeed = 0.8
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
    // Atenção: ouvinte direto, nunca `invalidate` solto (o evento viraria argumento).
    this.controls.addEventListener('change', () => this.invalidate())
    canvas.style.touchAction = 'none'
    const { hemisphere, sun } = this.look
    this.ambient = new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity)
    this.sun = new THREE.DirectionalLight(sun.color, sun.intensity)
    this.sun.position.set(...sun.direction).setLength(26)
    this.scene.add(this.ambient, this.sun)
    this.environment = createEnvironment(this.scene, callbacks.region)
    if (this.environment.landmark) void this.loadLandmark(this.region)
    // No Rio o terreno real e o Cristo começam a carregar já na construção da cidade (13/11/2026), sem esperar o
    // estado do servidor nem o `requestIdleCallback` da chegada: a rede do terreno e a do estado correm juntas.
    // A cidade só aparece pronta (16/11/2026): `sceneReady` resolve quando o chão provisório já saiu (terreno real ou a
    // reserva feita à mão). CityApp.vue cobre a tela até lá, para o plano liso de espera nunca aparecer.
    this.sceneReady = new Promise(resolve => { this.markSceneReady = resolve })
    if (this.pilot && this.environment.backdrop?.length) void this.loadTerrain()
    else this.markSceneReady()
    this.walkers = []
    this.foams = [...(this.environment.foams ?? [])]
    void this.loadCharacters()
    this.buildings = new THREE.Group()
    this.buildings.name = 'Fifones · CubeCity SimObjects'
    this.picking = new THREE.Group()
    this.picking.name = 'Footprint-aware selection proxies'
    this.scene.add(this.buildings, this.picking)
    // Selection proxies only take part in raycasts.
    this.picking.visible = false
    this.makeGround()
    // O chão em volta de cada prédio do Rio e a calçada até a rua (lotGround.js); a ilha não tem rua.
    this.lotGround = this.region?.id === 'cristo-redentor' ? createLotGround(this.scene, this.gridSize ** 2) : null
    this.makeContactShadows()
    if (this.pilot) this.makeRoads()
    this.makeIndicators()
    this.installEvents()
    this.resize()
    this.home()
    this.refreshShadows()
    this.frame = this.frame.bind(this)
    this.raf = requestAnimationFrame(this.frame)
    queueMicrotask(() => { if (!this.destroyed) this.callbacks.onReady() })
  }

  /** Pede um quadro. Chamado por tudo o que muda a cena (estado, carga de modelo, câmera, prévia, tween). */
  invalidate() { this.dirty = true }

  makeGround() {
    // Nas cidades piloto a grade só aparece ao construir: lotes claros e translúcidos, com um vão entre eles,
    // para o chão (a mata do terreno no Rio) continuar à vista e cada lote ser contável.
    const geo = this.pilot ? new THREE.BoxGeometry(0.9, 0.02, 0.9) : new THREE.BoxGeometry(0.98, 0.035, 0.98)
    const tileMaterial = this.pilot ? material(0xffffff, { transparent: true, opacity: 0.42, depthWrite: false }) : material(0xffffff)
    this.tiles = new THREE.InstancedMesh(geo, tileMaterial, this.gridSize ** 2)
    this.tiles.name = `${this.gridSize} × ${this.gridSize} buildable lots`
    this.tiles.visible = !this.pilot
    this.scene.add(this.tiles)
    this.unlockBoundary = new THREE.Group()
    this.unlockBoundary.name = 'Perímetro da área desbloqueada'
    const boundaryMaterial = material(0xe7dfb9)
    for (let i = 0; i < 4; i++) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), boundaryMaterial)
      this.unlockBoundary.add(edge)
    }
    const postMaterial = material(0xe5a35c)
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.19, 0.09), postMaterial)
      this.unlockBoundary.add(post)
    }
    this.scene.add(this.unlockBoundary)
    this.refreshGround()
  }

  refreshGround() {
    if (!this.tiles) return
    const radius = this.state.unlock_radius ?? 3
    if (this.displayedRadius === radius) return
    this.displayedRadius = radius
    const baseColor = new THREE.Color(this.environment.tileColor)
    const color = new THREE.Color()
    const dummy = new THREE.Object3D()
    const { min, max } = this.layout
    let index = 0
    for (let y = min; y <= max; y++) for (let x = min; x <= max; x++) {
      if (Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER)) > radius || this.protected.has(tileKey(x, y))) continue
      color.copy(baseColor).multiplyScalar(1 + ((Math.abs(x * 13 + y * 7) % 7) - 3) * 0.007)
      this.tiles.setColorAt(index, color)
      dummy.position.set(x - CENTER, 0.045 + this.groundHeight(x, y), y - CENTER)
      dummy.updateMatrix()
      this.tiles.setMatrixAt(index++, dummy.matrix)
    }
    this.tiles.count = index
    this.tiles.instanceColor.needsUpdate = true
    this.tiles.instanceMatrix.needsUpdate = true
    this.tiles.computeBoundingSphere()
    const edge = Math.min(radius, max - CENTER) + 0.5, side = edge * 2
    const [north, south, west, east, ...posts] = this.unlockBoundary.children
    this.unlockBoundary.visible = !this.pilot || radius < 8
    north.scale.set(side, 1, 0.045)
    north.position.set(0, 0.075, -edge)
    south.scale.set(side, 1, 0.045)
    south.position.set(0, 0.075, edge)
    west.scale.set(0.045, 1, side)
    west.position.set(-edge, 0.075, 0)
    east.scale.set(0.045, 1, side)
    east.position.set(edge, 0.075, 0)
    posts.forEach((post, i) => post.position.set(i % 2 ? edge : -edge, 0.14, i < 2 ? -edge : edge))
  }

  makeRoads() {
    const island = this.region.id === 'ilha-inicial'
    this.roadDeck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material(island ? 0xd8bf93 : 0x687c78), this.gridSize ** 2 * 3)
    this.roadMarks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material(island ? 0xedd9b1 : 0xf5deb0), this.gridSize ** 2 * 2)
    for (const mesh of [this.roadDeck, this.roadMarks]) {
      mesh.count = 0
      mesh.frustumCulled = false
      this.scene.add(mesh)
    }
  }

  refreshRoads() {
    if (!this.roadDeck) return
    const roads = this.state.placements.filter(item => item.kind === 'road')
    const positions = new Set(roads.map(({ x, y }) => tileKey(x, y)))
    const dummy = new THREE.Object3D()
    let deckCount = 0, marksCount = 0
    const draw = (mesh, index, x, y, z, width, height, depth) => {
      dummy.position.set(x, y, z)
      dummy.scale.set(width, height, depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    for (const { x, y } of roads) {
      const cx = x - CENTER, cz = y - CENTER
      draw(this.roadDeck, deckCount++, cx, 0.072, cz, 0.74, 0.026, 0.74)
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (!positions.has(tileKey(x + dx, y + dy))) continue
        draw(this.roadDeck, deckCount++, cx + dx * 0.5, 0.072, cz + dy * 0.5, dx ? 0.29 : 0.74, 0.026, dy ? 0.29 : 0.74)
        draw(this.roadMarks, marksCount++, cx + dx * 0.5, 0.089, cz + dy * 0.5, dx ? 0.22 : 0.035, 0.01, dy ? 0.22 : 0.035)
      }
    }
    this.roadDeck.count = deckCount
    this.roadMarks.count = marksCount
    this.roadDeck.instanceMatrix.needsUpdate = true
    this.roadMarks.instanceMatrix.needsUpdate = true
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
    this.roadPreview = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.88, 0.06, 0.88),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
      this.gridSize * 2 - 1,
    )
    this.roadPreview.frustumCulled = false
    this.roadPreview.count = 0
    this.scene.add(this.roadPreview)
  }

  setRoadPreview(cells = []) {
    if (!this.roadPreview || this.destroyed) return
    this.invalidate()
    const count = Math.min(cells.length, this.gridSize * 2 - 1)
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const { x, y, valid } = cells[i]
      dummy.position.set(x - CENTER, 0.115, y - CENTER)
      dummy.updateMatrix()
      this.roadPreview.setMatrixAt(i, dummy.matrix)
      this.roadPreview.setColorAt(i, color.setHex(valid === false ? 0xd7614f : 0x4eafa0))
    }
    this.roadPreview.count = count
    this.roadPreview.instanceMatrix.needsUpdate = true
    if (this.roadPreview.instanceColor) this.roadPreview.instanceColor.needsUpdate = true
  }

  installEvents() {
    const listen = (target, event, callback, options) => {
      target.addEventListener(event, callback, options)
      this.disposers.push(() => target.removeEventListener(event, callback, options))
    }
    listen(this.canvas, 'contextmenu', event => event.preventDefault())
    listen(this.canvas, 'pointerdown', (event) => {
      if (event.button !== 0) return
      this.stopArrival()
      this.updatePointer(event)
      this.tap.down(event, this.tapTarget())
    })
    listen(window, 'pointermove', event => this.tap.move(event), true)
    listen(this.canvas, 'pointermove', (event) => {
      this.updatePointer(event)
      this.updateHover()
    })
    listen(this.canvas, 'pointerleave', () => {
      this.hover = null
      this.refreshPreview()
      this.canvas.style.cursor = 'grab'
    })
    listen(window, 'pointercancel', event => this.tap.cancel(event), true)
    listen(this.canvas, 'lostpointercapture', event => this.tap.cancel(event))
    listen(window, 'pointerup', (event) => {
      this.updatePointer(event)
      const rect = this.canvas.getBoundingClientRect()
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (this.tap.up(event, inside ? this.tapTarget() : null)) this.click()
    }, true)
    listen(window, 'resize', () => this.resize())
    listen(document, 'visibilitychange', () => { if (!document.hidden) this.invalidate() })
    // Canvas fora da tela (aba escondida, painel por cima): não desenha; ao voltar, desenha um quadro.
    if (typeof IntersectionObserver !== 'undefined') {
      this.visibility = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting
        if (this.visible) this.invalidate()
      })
      this.visibility.observe(this.canvas)
    }
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

  // Altura do chão do tile (0, ou o patamar do morro da comunidade × HILL_STEP).
  groundHeight(x, y) {
    return hillLevelAt(this.region?.id, x, y) * HILL_STEP
  }

  getTile() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const { min, max } = this.layout
    // O raio cruza o plano de cada patamar, do mais alto (o mais perto da câmera) para o chão: vale o primeiro em que
    // o tile atingido é mesmo daquele patamar.
    let fallback = null
    for (const height of this.hillHeights) {
      this.floor.constant = -(0.062 + height)
      if (!this.raycaster.ray.intersectPlane(this.floor, this.floorHit)) continue
      const x = Math.floor(this.floorHit.x + CENTER + 0.5)
      const y = Math.floor(this.floorHit.z + CENTER + 0.5)
      if (x < min || x > max || y < min || y > max) continue
      if (Math.abs(this.groundHeight(x, y) - height) < 1e-6) return { x, y }
      if (height === 0) fallback = { x, y }
    }
    return fallback
  }

  getBuilding() {
    // Original CubeCity helper resolves the nearest intersected child back to its tile.
    const tile = getIntersectedTile(this.raycaster, { normalizedMouse: this.pointer }, this.camera, this.picking)
    return tile?.placement || null
  }

  usesTiles() {
    return ['build', 'move', 'road'].includes(this.tool.mode)
  }

  interiorAction() {
    if (!this.interior?.onActivate) return null
    this.raycaster.setFromCamera(this.pointer, this.camera)
    for (const { object } of this.raycaster.intersectObject(this.interior.group, true)) {
      for (let node = object; node && node !== this.interior.group; node = node.parent) {
        if (node.userData.action) return node.userData.action
      }
    }
    return null
  }

  tapTarget() {
    if (this.interior) return this.interiorAction()
    if (this.usesTiles()) {
      const tile = this.getTile()
      return tile ? tileKey(tile.x, tile.y) : null
    }
    return this.getBuilding()?.id || 'empty'
  }

  updateHover() {
    if (this.destroyed) return
    if (this.interior) {
      this.canvas.style.cursor = this.interiorAction() ? 'pointer' : 'grab'
      return
    }
    this.hover = this.getTile()
    const building = this.usesTiles() ? null : this.getBuilding()
    this.canvas.style.cursor = this.usesTiles() ? 'crosshair' : building ? 'pointer' : 'grab'
    this.refreshPreview()
  }

  click() {
    if (this.interior) {
      const action = this.interiorAction()
      if (action) this.interior.onActivate?.(action)
      return
    }
    if (this.usesTiles()) {
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
      if (!next.has(id)) {
        if (this.interior?.placementId === id) this.closeInterior()
        this.removeRecord(record)
        this.records.delete(id)
      }
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
        record.constructionPending = animateNew && !(this.pilot && placement.kind === 'road')
        if (definition.model && !coreKinds.has(placement.kind)) this.loadModel(record, definition)
      }
      record.placement = { ...placement }
      record.proxy.userData.placement = record.placement
      this.updateLevelDetails(record, definition)
      this.positionRecord(record, definition)
      if (record.constructionPending && !definition.model) this.animateConstruction(record)
    }
    if (!this.hydrated && this.pilot) this.startArrival()
    this.hydrated = true
    if (!next.has(this.selectedId)) this.selectedId = null
    if (!next.has(this.inUseId)) this.inUseId = null
    this.refreshGround()
    this.refreshRoads()
    this.refreshLotGround()
    this.refreshSelection()
    this.refreshPreview()
    this.refreshShadows()
    this.invalidate()
  }

  // O tapete de cada lote e a calçada até a rua (lotGround.js). A calçada fica do lado da rua para onde o prédio olha
  // (a frente do modelo, FRONT_STEP[rotação]); sem rua nesse lado, do primeiro lado que tem. No morro e nas
  // decorações não há calçada nem rua: só o tapete (o morro já tem o próprio chão).
  refreshLotGround() {
    if (!this.lotGround) return
    const roads = new Set(this.state.placements.filter(item => item.kind === 'road').map(({ x, y }) => tileKey(x, y)))
    const patches = [], walks = []
    for (const record of this.records.values()) {
      const { placement, footprint: area } = record
      const definition = this.definitions.get(placement.kind)
      if (!area || !definition || coreKinds.has(placement.kind) || definition.decoration) continue
      patches.push({ x: area.x, z: area.z, width: area.width + 0.5, depth: area.depth + 0.5, y: area.lift + 0.01, hill: area.lift > 0 })
      if (area.lift > 0) continue
      const cells = footprint(placement, definition)
      const own = new Set(cells.map(({ x, y }) => tileKey(x, y)))
      const rotation = placement.rotation || 0
      for (const side of [rotation, (rotation + 3) % 4, (rotation + 1) % 4, (rotation + 2) % 4]) {
        const [dx, dy] = FRONT_STEP[side]
        // O ponto da rua mais perto do meio do lado: é por ele que a calçada sai.
        const lateral = cell => dx ? cell.y - CENTER : cell.x - CENTER
        const middle = dx ? area.z : area.x
        const door = cells.filter(cell => !own.has(tileKey(cell.x + dx, cell.y + dy)) && roads.has(tileKey(cell.x + dx, cell.y + dy)))
          .sort((a, b) => Math.abs(lateral(a) - middle) - Math.abs(lateral(b) - middle))[0]
        if (!door) continue
        const half = (dx ? area.width : area.depth) / 2, across = dx ? area.depth : area.width
        // Do fundo do prédio até a borda do asfalto (que fica a 0,13 do lote): só o trecho do meio aparece.
        const reach = 0.13 + 0.04, from = half * 0.8, length = half + reach - from
        const axis = from + length / 2
        const angle = Math.atan2(dx, dy)
        walks.push({ x: area.x + dx * axis, z: area.z + dy * axis, width: across * 0.94, length, angle, y: area.lift + 0.016 })
        // O acesso da porta: mais largo e mais fundo, no tile da rua mais perto do meio.
        const doorLateral = THREE.MathUtils.clamp(lateral(door), middle - across / 2 + 0.4, middle + across / 2 - 0.4)
        const deep = half * 0.62, wide = half + reach - deep
        walks.push({ x: dx ? area.x + dx * (deep + wide / 2) : doorLateral, z: dx ? doorLateral : area.z + dy * (deep + wide / 2), width: 0.56, length: wide, angle, y: area.lift + 0.02 })
        break
      }
    }
    this.lotGround.update({ patches, walks })
  }

  createRecord(placement, definition, key) {
    // These are the original CubeCity SimObjects, with Rio geometry and model resources.
    const sim = new SimObject()
    sim.name = `${definition.label || placement.kind} · ${placement.id}`
    const mesh = this.pilot && placement.kind === 'road' ? new THREE.Group() : createCoreBuilding(placement.kind, definition, placement)
    if (placement.kind === 'road') mesh.userData.height = 0.065
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
    // No morro da comunidade o prédio assenta no patamar (todos os tiles dele têm a mesma altura).
    const lift = this.groundHeight(record.placement.x, record.placement.y)
    record.sim.position.set(x, BUILDING_BASE_Y + lift, z)
    record.footprint = { x, z, width, depth, lift }
    this.contactDirty = true
    this.invalidate()
    record.sim.rotation.y = -(record.placement.rotation || 0) * Math.PI / 2
    record.proxy.position.set(x, BUILDING_BASE_Y + lift + record.height / 2, z)
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
      applyGlbStyle(scene)
      toLambertScene(scene)
      scene.rotation.y += region.rotacaoY * Math.PI / 180
      const model = fitModel(scene, LANDMARK_FOOTPRINT, LANDMARK_HEIGHT)
      if (model.userData.fittedHeight <= 0) {
        disposeOwned(model, true, true)
        return
      }
      const anchor = this.environment.landmark
      const [fallback] = anchor.children
      anchor.remove(fallback)
      disposeOwned(fallback)
      anchor.add(model)
      this.refreshShadows()
    } catch {
      // A cidade mantém o monumento procedural quando o GLB está indisponível.
    }
  }

  // O terreno real do Rio (src/terrain) no lugar do chão provisório. Se não carregar, só então entra a reserva
  // feita à mão (buildRioFallback, morros e calçadão): construir essa reserva de saída, para jogar fora um instante
  // depois quase sempre que o terreno carrega, era o que atrasava a cidade a abrir (13/11/2026).
  async loadTerrain() {
    try {
      const { loadCityTerrain } = await import('../terrain/cityTerrain.js')
      const terrain = await loadCityTerrain()
      if (this.destroyed) {
        terrain.dispose()
        this.markSceneReady()
        return
      }
      for (const object of this.environment.backdrop) {
        object.removeFromParent()
        disposeOwned(object)
      }
      this.environment.backdrop = []
      this.environment.group.add(terrain.group)
      if (terrain.foam) this.foams.push(terrain.foam)
      // O bondinho anda no mesmo relógio da espuma (com movimento reduzido, parado nas estações).
      if (terrain.cableCar) this.foams.push(terrain.cableCar)
      // O Cristo sai do chão provisório e vai, menor, para o pico da montanha da esquerda (16/11/2026).
      const anchor = this.environment.landmark
      if (anchor && terrain.landmark) {
        const { x, y, z, scale } = terrain.landmark
        anchor.position.set(x, y - 0.05, z)
        anchor.scale.setScalar(scale)
      }
      this.refreshShadows()
      this.markSceneReady()
    } catch {
      if (this.destroyed) return this.markSceneReady()
      for (const object of this.environment.backdrop) {
        object.removeFromParent()
        disposeOwned(object)
      }
      this.environment.backdrop = buildRioFallback(this.environment.group, this.layout)
      this.refreshShadows()
      this.markSceneReady()
    }
  }

  // Personagens ambiente da região (characters.js): só visual, carregados do mesmo jeito que o monumento
  // (faces planas, sem sombra projetada) e andando no caminho deles (animateCharacters). Se um não carregar, a
  // cidade segue sem ele.
  async loadCharacters() {
    for (const character of CHARACTERS[this.region?.id] ?? []) {
      try {
        const resource = await this.loader.loadAsync(character.model)
        if (this.destroyed) return
        applyGlbStyle(resource.scene)
        toLambertScene(resource.scene)
        const bounds = new THREE.Box3().setFromObject(resource.scene)
        const size = bounds.getSize(new THREE.Vector3())
        const scale = character.height / Math.max(size.y, 0.01)
        const center = bounds.getCenter(new THREE.Vector3())
        // O esqueleto é lido na T-pose, antes de escalar e mover o modelo.
        const rig = createWalkRig(resource.scene, { stepLength: character.stepLength })
        resource.scene.traverse(object => { if (object.isSkinnedMesh) object.frustumCulled = false })
        resource.scene.scale.setScalar(scale)
        resource.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
        const walker = new THREE.Group()
        walker.name = `Personagem · ${character.name}`
        walker.add(resource.scene)
        const points = character.path.map(([x, y]) => new THREE.Vector3(x - CENTER, 0.06, y - CENTER))
        const lengths = points.slice(1).map((point, index) => point.distanceTo(points[index]))
        const first = points[1].clone().sub(points[0])
        this.walkers.push({
          object: walker, points, lengths, total: lengths.reduce((a, b) => a + b, 0), speed: character.speed, rig, scale,
          distance: 0, direction: 1, pause: 0, heading: Math.atan2(first.x, first.z),
        })
        walker.position.copy(points[0])
        walker.rotation.y = Math.atan2(first.x, first.z)
        rig?.update(0, 0, scale)
        this.environment.group.add(walker)
        this.invalidate()
      } catch {
        // A cidade segue sem o personagem se o GLB não carregar.
      }
    }
  }

  // Ida e volta no caminho, em velocidade constante, de frente para onde anda, virando devagar nas esquinas e no fim
  // (onde para um instante). Os ossos andam pelo ciclo de characterRig.js, no ritmo da velocidade. Com movimento
  // reduzido, o personagem fica parado no começo do caminho, de braços baixos.
  animateCharacters(time) {
    const dt = Math.min(0.1, time - (this.lastWalkTime ?? time))
    this.lastWalkTime = time
    for (const walker of this.walkers) {
      if (this.reducedMotion || !walker.total) { walker.rig?.update(dt, 0, walker.scale); continue }
      let moving = false
      if (walker.pause > 0) walker.pause -= dt
      else {
        walker.distance += walker.direction * walker.speed * dt
        if (walker.distance >= walker.total || walker.distance <= 0) {
          walker.distance = THREE.MathUtils.clamp(walker.distance, 0, walker.total)
          walker.direction *= -1
          walker.pause = 1.6
        } else moving = true
      }
      let rest = walker.distance, index = 0
      while (index < walker.lengths.length - 1 && rest > walker.lengths[index]) rest -= walker.lengths[index++]
      const from = walker.points[index], to = walker.points[index + 1]
      walker.object.position.lerpVectors(from, to, Math.min(1, rest / walker.lengths[index]))
      // Na volta o personagem anda de frente para o outro lado do mesmo trecho; a curva é suave, não um giro seco.
      const target = Math.atan2((to.x - from.x) * walker.direction, (to.z - from.z) * walker.direction)
      const turn = Math.atan2(Math.sin(target - walker.heading), Math.cos(target - walker.heading))
      walker.heading += THREE.MathUtils.clamp(turn, -6 * dt, 6 * dt)
      walker.object.rotation.y = walker.heading
      walker.rig?.update(dt, moving ? walker.speed : 0, walker.scale)
    }
  }

  async loadModel(record, definition) {
    const url = definition.model
    this.pendingModels++
    this.callbacks.onModelStatus({ kind: record.placement.kind, status: 'loading' })
    try {
      // Faces planas e material fosco uma vez por arquivo; os clones de cada construção herdam.
      if (!this.modelCache.has(url)) {
        this.modelCache.set(url, this.loader.loadAsync(url).then((resource) => { applyGlbStyle(resource.scene); toLambertScene(resource.scene); return resource }))
      }
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
          if (child.material && !Array.isArray(child.material) && source?.material) {
            child.material.transparent = source.material.transparent
            child.material.depthWrite = source.material.depthWrite
          }
        }
      })
      // Sem `base` no catálogo (modelo novo ainda sem a medida), a base bege do GLB assume a cor do chão da região.
      const lift = this.groundHeight(record.placement.x, record.placement.y)
      if (!definition.base && this.look.ground !== null) applyGroundBlendTo(model, { ground: this.groundColor, range: this.look.groundFade, baseY: BUILDING_BASE_Y + lift })
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
      // A base redonda do GLB (o disco que o Tripo põe no pé do prédio) fica enterrada no terreno: o modelo desce a
      // espessura dela (`definition.base`, na unidade do modelo) mais a folga até o topo do terreno, e só o prédio
      // sai do chão, com o jardim, os degraus e os vasos que o disco carregava.
      const sink = definition.base ? definition.base * scale + BUILDING_BASE_Y + 0.02 : 0
      normalized.position.set(-center.x * scale, -bounds.min.y * scale - sink, -center.z * scale)
      group.add(normalized)
      disposeOwned(record.sim.mesh, true)
      record.sim.setMesh(group)
      record.loaded = true
      this.invalidate()
      record.height = size.y * scale - sink
      record.sunk = sink > 0
      this.prepareLogoPivots(record, model)
      this.captureMaterials(record)
      record.selected = undefined
      this.positionRecord(record, definition)
      this.refreshSelection()
      if (record.constructionPending) this.animateConstruction(record)
      this.refreshShadows()
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
      onUpdate: () => this.invalidate(), onComplete: () => this.refreshShadows(),
    })
  }

  removeRecord(record) {
    gsap.killTweensOf(record.sim.scale)
    this.buildings.remove(record.sim)
    this.picking.remove(record.proxy)
    disposeOwned(record.sim.mesh, !record.loaded)
    disposeOwned(record.proxy)
    if (record.levelDetails) disposeOwned(record.levelDetails)
    this.contactDirty = true
    this.invalidate()
  }

  setTool(tool = {}) {
    this.tool = { mode: 'select', kind: null, rotation: 0, placementId: null, ...tool }
    this.invalidate()
    if (this.pilot) this.tiles.visible = !this.interior && this.usesTiles()
    if (this.tool.mode !== 'road') this.setRoadPreview()
    this.refreshPreview()
  }

  isValid(tile, definition, rotation) {
    if (!tile) return false
    if (this.pilot && this.state.location_id === this.region.id) {
      return !placementProblem(this.state, {
        ...tile, kind: definition.id, rotation, id: this.tool.mode === 'move' ? this.tool.placementId : null,
      })
    }
    const cells = footprint({ ...tile, rotation }, definition)
    const radius = this.state.unlock_radius ?? 3
    const occupied = new Set()
    for (const placement of this.state.placements || []) {
      if (this.tool.mode === 'move' && placement.id === this.tool.placementId) continue
      for (const cell of footprint(placement, this.definitions.get(placement.kind) || {})) occupied.add(`${cell.x},${cell.y}`)
    }
    const { min, max } = this.layout
    return cells.every(cell => cell.x >= min && cell.y >= min && cell.x <= max && cell.y <= max &&
      Math.max(Math.abs(cell.x - CENTER), Math.abs(cell.y - CENTER)) <= radius && !occupied.has(tileKey(cell.x, cell.y)))
  }

  refreshPreview() {
    if (!this.preview) return
    this.invalidate()
    const moving = this.tool.mode === 'move'
    const placement = moving ? this.state.placements?.find(item => item.id === this.tool.placementId) : null
    const kind = moving ? placement?.kind : this.tool.kind
    const definition = this.definitions.get(kind)
    const tile = this.tool.buildTile ?? this.hover
    const active = this.tool.mode === 'build' || moving
    this.preview.visible = Boolean(!this.interior && active && tile && definition &&
      !(this.pilot && kind === 'road' && this.roadPreview.count))
    if (!this.preview.visible) {
      if (this.tool.mode === 'build') this.setRoadPreview()
      return
    }
    const rotation = this.tool.rotation || 0
    const { width, depth } = dimensions(definition, rotation)
    const quote = !moving && this.pilot && this.state.location_id === this.region.id
      ? previewBuild(this.state, { ...tile, kind, rotation })
      : null
    const valid = quote
      ? !quote.error && this.state.credits >= quote.cost
      : this.isValid(tile, definition, rotation) && (moving || (this.state.credits ?? Infinity) >= (definition.cost || 0))
    if (!moving) this.setRoadPreview(quote?.road?.tiles.map(point => ({ ...point, valid })) ?? [])
    const color = valid ? 0x8fd64c : 0xf08066
    this.preview.position.set(tile.x - CENTER + (width - 1) / 2, 0.095 + this.groundHeight(tile.x, tile.y), tile.y - CENTER + (depth - 1) / 2)
    this.previewFloor.scale.set(width * 0.96, 1, depth * 0.96)
    const height = Math.min(Number(definition.height) || 0.7, 1.7)
    this.previewGhost.position.y = height / 2
    this.previewGhost.scale.set(width * 0.85, height, depth * 0.85)
    this.previewFloor.material.color.setHex(color)
    this.previewGhost.material.color.setHex(color)
    this.preview.userData.valid = valid
    this.preview.userData.cells = footprint({ ...tile, rotation }, definition)
  }

  setSelected(id) {
    this.selectedId = id
    this.refreshSelection()
  }

  refreshSelection() {
    if (!this.selection) return
    this.invalidate()
    for (const [id, record] of this.records) {
      // CubeCity's selection feedback operates on cloned materials, preserving GLTF maps.
      if (record.selected !== (id === this.selectedId)) {
        record.selected = id === this.selectedId
        record.sim.setSelected(record.selected)
      }
      this.applyRecordFeedback(record)
    }
    const record = this.records.get(this.selectedId)
    this.selection.visible = Boolean(record && !this.interior)
    if (!record) return
    const { width, depth } = dimensions(this.definitions.get(record.placement.kind), record.placement.rotation)
    this.selection.position.set(record.sim.position.x, 0.105 + (record.footprint?.lift ?? 0), record.sim.position.z)
    const [top, bottom, left, right] = this.selection.children
    top.scale.set(width, 1, 0.035); top.position.set(0, 0, -depth / 2)
    bottom.scale.set(width, 1, 0.035); bottom.position.set(0, 0, depth / 2)
    left.scale.set(0.035, 1, depth); left.position.set(-width / 2, 0, 0)
    right.scale.set(0.035, 1, depth); right.position.set(width / 2, 0, 0)
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
    this.invalidate()
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
    this.invalidate()
    const dusk = mode === 'dusk'
    const { sky, sun, hemisphere, exposure } = this.look
    this.scene.background.setHex(dusk ? 0xb9b9c4 : sky)
    this.scene.fog.color.copy(this.scene.background)
    this.sun.color.setHex(dusk ? 0xffae7a : sun.color)
    this.sun.intensity = dusk ? sun.intensity * 0.75 : sun.intensity
    this.ambient.color.setHex(dusk ? 0xd3d7ed : hemisphere.sky)
    this.ambient.intensity = dusk ? hemisphere.intensity * 0.68 : hemisphere.intensity
    this.renderer.toneMappingExposure = exposure
    this.environment.setDusk(dusk)
    this.refreshShadows()
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

  // Não há mais shadow map: o nome ficou porque vários pontos o chamam ao mudar peças; agora só marca a sombra de contato.
  refreshShadows() { this.contactDirty = true; this.invalidate() }

  /** Sombra de contato: um quad de gradiente radial sob cada prédio, todos num InstancedMesh (+1 draw, sem passe de sombra). */
  makeContactShadows() {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.8)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const { opacity, color } = this.look.contact
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, opacity, depthWrite: false })
    this.contactShadows = new THREE.InstancedMesh(geometry, shadowMaterial, Math.max(64, this.gridSize ** 2))
    this.contactShadows.name = 'Sombras de contato'
    this.contactShadows.frustumCulled = false
    this.contactShadows.renderOrder = 1
    this.contactShadows.count = 0
    this.scene.add(this.contactShadows)
    this.contactDirty = true
  }

  refreshContactShadows() {
    this.contactDirty = false
    if (!this.contactShadows) return
    const dummy = new THREE.Object3D()
    const scale = this.look.contact.scale
    let index = 0
    for (const record of this.records.values()) {
      if (!record.footprint || record.placement.kind === 'road' || record.placement.kind === 'tree' || index >= this.contactShadows.instanceMatrix.count) continue
      const { x, z, width, depth, lift } = record.footprint
      dummy.position.set(x, (lift ?? 0) + (record.sunk ? 0.022 : BUILDING_BASE_Y + 0.004), z)
      // Sem a base redonda, a sombra só precisa aninhar o prédio no chão: um halo menor que o do disco.
      const spread = record.sunk ? scale * 0.74 : scale
      dummy.scale.set(width * spread, 1, depth * spread)
      dummy.updateMatrix()
      this.contactShadows.setMatrixAt(index++, dummy.matrix)
    }
    this.contactShadows.count = index
    this.contactShadows.instanceMatrix.needsUpdate = true
  }

  stopArrival() {
    this.arrivalTween?.kill()
    this.arrivalTween = null
  }

  // O Cristo e o terreno real já começaram a carregar no construtor (sem esperar o estado do servidor): aqui só
  // fica a animação de chegada, de câmera.
  startArrival() {
    const key = `cityou:arrival:${this.region.id}`
    if (this.reducedMotion) return
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch { /* The arrival remains available in private browsing. */ }
    const [entryX, entryY] = this.layout.arrivalPath[0]
    const [insideX, insideY] = this.layout.arrivalPath[1]
    const direction = new THREE.Vector3(entryX - insideX, 0, entryY - insideY).normalize()
    const finalPosition = this.camera.position.clone()
    const finalTarget = this.controls.target.clone()
    this.camera.position.addScaledVector(direction, 5)
    this.controls.target.addScaledVector(direction, 3.5)
    this.arrivalTween = gsap.timeline()
      .to(this.camera.position, { ...finalPosition, duration: 0.58, ease: 'power2.out' }, 0)
      .to(this.controls.target, { ...finalTarget, duration: 0.58, ease: 'power2.out' }, 0)
    this.arrivalTween.eventCallback('onUpdate', () => this.invalidate())
  }

  home() {
    if (!this.controls || this.interior) return
    this.stopArrival()
    if (this.pilot) {
      const island = this.region.id === 'ilha-inicial'
      // No Rio o alvo fica um pouco acima do chão para o Cristo, no morro do fundo, caber abaixo do cabeçalho.
      this.controls.target.set(island ? 0 : -1, island ? 0.8 : 3.6, island ? 4 : -4)
      // No Rio a câmera começa mais perto (zoom maior, 13/11/2026): o cenário real dá para ver bem mais de perto.
      this.camera.position.set(island ? 18 : 21, island ? 31 : 29.5, island ? 42 : 39)
    } else {
      this.controls.target.set(0, 0.8, 0)
      this.camera.position.set(17.5, 17.5, 23)
    }
    this.controls.update()
  }

  openInterior(placementId, group, onActivate) {
    if (!group?.isGroup) return false
    const record = this.records.get(placementId)
    if (!record || this.destroyed || !this.renderer) {
      disposeOwned(group, true, true)
      return false
    }
    this.closeInterior()
    this.stopArrival()
    this.interior = {
      placementId, group, onActivate, position: this.camera.position.clone(),
      target: this.controls.target.clone(), minDistance: this.controls.minDistance,
    }
    record.sim.visible = false
    group.position.copy(record.sim.position)
    group.rotation.y = record.sim.rotation.y
    this.scene.add(group)
    this.controls.minDistance = 3
    const offset = new THREE.Vector3(2.8, 4.3, 4.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y)
    const target = group.position.clone().add(new THREE.Vector3(0, 0.35, 0))
    const position = target.clone().add(offset)
    if (this.reducedMotion) {
      this.camera.position.copy(position)
      this.controls.target.copy(target)
      this.controls.update()
    } else {
      this.interior.tween = gsap.timeline()
        .to(this.camera.position, { ...position, duration: 0.24, ease: 'power2.out' }, 0)
        .to(this.controls.target, { ...target, duration: 0.24, ease: 'power2.out' }, 0)
      this.interior.tween.eventCallback('onUpdate', () => this.invalidate())
    }
    this.refreshSelection()
    this.refreshPreview()
    this.setRoadPreview()
    if (this.pilot) this.tiles.visible = false
    this.refreshShadows()
    return true
  }

  closeInterior() {
    const interior = this.interior
    if (!interior) return
    this.interior = null
    interior.tween?.kill()
    const record = this.records.get(interior.placementId)
    if (record) record.sim.visible = true
    this.scene.remove(interior.group)
    disposeOwned(interior.group, true, true)
    this.controls.minDistance = interior.minDistance
    this.controls.target.copy(interior.target)
    this.camera.position.copy(interior.position)
    this.controls.update()
    this.refreshSelection()
    this.refreshPreview()
    if (this.pilot) this.tiles.visible = this.usesTiles()
    this.refreshShadows()
  }

  resize() {
    if (!this.renderer || this.destroyed) return
    const rect = this.canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  projectTile(x, y) {
    this.camera.updateMatrixWorld()
    const point = new THREE.Vector3(x - CENTER, 0.08 + this.groundHeight(x, y), y - CENTER).project(this.camera)
    const rect = this.canvas.getBoundingClientRect()
    return { x: (point.x + 1) * rect.width / 2, y: (1 - point.y) * rect.height / 2 }
  }

  stats() {
    this.ensureActivityFreshness()
    return { placements: this.records.size, modelsLoaded: [...this.records.values()].filter(record => record.loaded).length, modelsLoading: this.pendingModels, framesRendered: this.framesRendered, modelErrors: [...this.records.values()].filter(record => record.error).map(record => ({ id: record.placement.id, error: record.error })), drawCalls: this.renderer?.info.render.calls || 0, triangles: this.renderer?.info.render.triangles || 0, revision: this.state.revision, selectedId: this.selectedId, activityCheckedAt: this.activity?.checked_at || null, activityStates: Object.fromEntries([...this.records].map(([id, record]) => [id, { ...record.activityView }])), upgrades: [...this.records.values()].filter(record => record.detailLevel > 1).map(record => ({ id: record.placement.id, level: record.detailLevel, detailMeshes: record.levelDetails.children.length })), previewValid: this.preview?.visible ? this.preview.userData.valid : null }
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
  frame(now = performance.now()) {
    if (this.destroyed) return
    this.raf = requestAnimationFrame(this.frame)
    // Fora da tela: nenhum trabalho. Ao voltar, o observador/visibilitychange pede um quadro.
    if (document.hidden || !this.visible) return
    const limit = this.pilot ? 20 : 12
    this.controls.target.x = THREE.MathUtils.clamp(this.controls.target.x, -limit, limit)
    this.controls.target.z = THREE.MathUtils.clamp(this.controls.target.z, -limit, limit)
    this.controls.target.y = THREE.MathUtils.clamp(this.controls.target.y, 0, 4)
    // `update()` devolve true enquanto a câmera se move (inclusive no amortecimento).
    if (this.controls.update()) this.dirty = true
    if (this.camera.position.y < 1.5) { this.camera.position.y = 1.5; this.dirty = true }
    // Com movimento reduzido nada anima sozinho: só desenha sob demanda. Sem ele, o ambiente (ondas, personagens,
    // bondinho, logos) anima a no máximo 30 quadros por segundo quando nada mais pede quadro (60 se pedir).
    if (!this.dirty && (this.reducedMotion || now - this.lastRender < 28)) return
    this.dirty = false
    this.lastRender = now
    const time = this.clock.getElapsedTime()
    if (this.contactDirty) this.refreshContactShadows()
    this.environment.animate(time, this.reducedMotion)
    for (const foam of this.foams) foam.update(this.reducedMotion ? 0.5 : time)
    this.animateCharacters(time)
    this.animateActivity(time)
    this.renderer.render(this.scene, this.camera)
    this.framesRendered++
  }

  destroy() {
    if (this.destroyed) return
    this.closeInterior()
    this.stopArrival()
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.observer?.disconnect()
    this.visibility?.disconnect()
    for (const dispose of this.disposers) dispose()
    this.controls?.dispose()
    this.lotGround?.dispose()
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
