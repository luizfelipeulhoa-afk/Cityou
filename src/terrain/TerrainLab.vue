<script setup>
// Página de teste do terreno (/terrain.html): o cenário do Rio com a zona jogável, a sobreposição das zonas
// bloqueadas, as vistas dos marcos e o assento de prédios em lotes. Toque num lote para construir.
import { computed, markRaw, onBeforeUnmount, ref, shallowRef } from 'vue'
import { Box3, BoxGeometry, BufferAttribute, Color, ConeGeometry, Group, Mesh, NoToneMapping, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three'
import { TresCanvas } from '@tresjs/core'
import { loadGlb } from '../tres/glbLoader.js'
import { CAMERA_DEFAULTS } from './camera.js'
import rio from './regions/rio.js'
import { loadTerrain, seatBuilding } from './TerrainScene.js'
import { PALETTE } from './terrainData.js'
import TerrainStage from './TerrainStage.vue'

const EXAMPLE_GLB = '/models/world/taj-mahal.glb' // um GLB leve do projeto, carregado com o Meshopt de sempre
const camera = markRaw(new PerspectiveCamera(CAMERA_DEFAULTS.fov, 1, CAMERA_DEFAULTS.near, CAMERA_DEFAULTS.far))
const buildings = markRaw(new Group())
buildings.name = 'Prédios de exemplo'

const data = shallowRef(null)
const stage = shallowRef(null)
const failure = ref('')
const showBlocked = ref(new URLSearchParams(location.search).has('bloqueados'))
const showVegetation = ref(true)
const size = ref(2)
const message = ref('Carregando o relevo…')
const frame = ref({ triangles: 0, calls: 0, fog: 0 })
const occupied = new Set()
let context = null
let timer = 0

const home = { x: 2, z: -2, azimuth: -0.35, polar: 1.05, distance: 62 }
const views = computed(() => {
  if (!data.value) return []
  const toward = (mark) => {
    const position = data.value.frame.toWorld(mark.lat, mark.lon)
    const target = data.value.lots.clampToPlayable(position.x, position.z)
    return { id: mark.id, label: mark.name, x: target.x, z: target.z, azimuth: Math.atan2(target.x - position.x, target.z - position.z), polar: 1.3, distance: 52, ...mark.view }
  }
  return [{ id: 'inicio', label: 'Início', ...home }, ...(rio.landmarks ?? []).map(toward)]
})

loadTerrain(rio).then((terrain) => {
  data.value = markRaw(terrain)
  message.value = 'Toque num lote para assentar um prédio.'
}).catch((error) => {
  failure.value = error.message
})

// Prédio de exemplo feito em código, com o material do terreno: corpo creme e telhado de destaque.
function painted(geometry, color) {
  const tint = new Color(color).toArray().map(channel => Math.round(channel * 255))
  const colors = new Uint8Array(geometry.attributes.position.count * 3)
  for (let k = 0; k < colors.length; k++) colors[k] = tint[k % 3]
  geometry.setAttribute('color', new BufferAttribute(colors, 3, true))
  return new Mesh(geometry, stage.value.objects.material)
}
function exampleBuilding(lots) {
  const building = new Group()
  const height = 0.9 + lots * 0.55
  const body = painted(new BoxGeometry(1, height, 1), PALETTE.cream)
  body.position.y = height / 2
  const roof = painted(new ConeGeometry(0.78, 0.5, 4), lots % 2 ? PALETTE.earth : PALETTE.accent)
  roof.position.y = height + 0.25
  roof.rotation.y = Math.PI / 4
  building.add(body, roof)
  return building
}

const footprint = (lot, lots) => Array.from({ length: lots * lots }, (_, k) => `${lot.x + k % lots},${lot.z + Math.floor(k / lots)}`)

/** Tenta assentar um prédio de `lots` × `lots` no lote âncora. Devolve o grupo criado, ou null se o lote recusa. */
function build(lot, lots = size.value, object = exampleBuilding(lots)) {
  const terrain = data.value
  const cells = footprint(lot, lots)
  if (!terrain.isBuildable(lot, lots) || cells.some(cell => occupied.has(cell))) {
    const kinds = cells.map((cell) => { const [x, z] = cell.split(',').map(Number); return occupied.has(cell) ? 'ocupado' : { free: '', decorative: 'decorativo', blocked: 'bloqueado' }[terrain.lots.kindAt({ x, z })] }).filter(Boolean)
    message.value = `Lote (${lot.x}, ${lot.z}) recusado para ${lots}×${lots}: ${[...new Set(kinds)].join(', ')}.`
    return null
  }
  const seat = seatBuilding(terrain, object, lot, lots, { material: stage.value.objects.material })
  cells.forEach(cell => occupied.add(cell))
  buildings.add(seat)
  message.value = `Prédio ${lots}×${lots} assentado no lote (${lot.x}, ${lot.z}), com o terreno em y = ${seat.position.y.toFixed(2)}.`
  stage.value.invalidate()
  return seat
}

function pick(point) {
  build(data.value.snapToLot(point, size.value))
}

// Lote âncora livre mais próximo de um ponto, para os exemplos iniciais.
function findSite(lots, near) {
  const terrain = data.value
  let best = null
  for (const lot of terrain.lots.playable) {
    if (!terrain.isBuildable(lot, lots) || footprint(lot, lots).some(cell => occupied.has(cell))) continue
    const center = terrain.lots.footprintCenter(lot, lots)
    const distance = Math.hypot(center.x - near.x, center.z - near.z)
    if (!best || distance < best.distance) best = { lot, distance }
  }
  return best?.lot
}

// Para a conferência automática (tools/terrain-check.mjs): medidas de cada prédio assentado e ponto da tela de um ponto do mundo.
function inspect() {
  return buildings.children.map((seat) => {
    seat.updateWorldMatrix(true, true)
    const [pedestal, holder] = seat.children
    const disc = new Box3().setFromObject(pedestal), building = new Box3().setFromObject(holder)
    return {
      lot: seat.userData.lot, size: seat.userData.size, y: seat.position.y,
      ground: data.value.getHeightAt(seat.position.x, seat.position.z),
      discBottom: disc.min.y, discTop: disc.max.y, buildingBottom: building.min.y,
      width: Math.max(building.max.x - building.min.x, building.max.z - building.min.z),
    }
  })
}
function project(x, y, z) {
  camera.updateMatrixWorld()
  const point = new Vector3(x, y, z).project(camera)
  const rect = context.renderer.instance.domElement.getBoundingClientRect()
  return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height, visible: point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1 }
}

async function onStage(api) {
  stage.value = api
  api.view(home)
  for (const [lots, near] of [[1, { x: -3, z: 3 }], [2, { x: 2, z: 1 }], [3, { x: 8, z: -1 }]]) {
    const lot = findSite(lots, near)
    if (lot) build(lot, lots)
  }
  message.value = 'Toque num lote para assentar um prédio.'
  timer = setInterval(() => {
    const info = context?.renderer.instance.info.render
    if (info) frame.value = { triangles: info.triangles, calls: info.calls, fog: Math.round(api.fog.far) }
  }, 400)
  window.__terrainLab = { data: data.value, stage: api, camera, buildings, build, findSite, inspect, project, context, ready: false }
  try {
    // O exemplo em GLB entra depois: o terreno não espera por ele.
    const model = await loadGlb(EXAMPLE_GLB)
    const lot = findSite(4, { x: -8, z: -3 })
    if (lot) build(lot, 4, model)
    message.value = 'Toque num lote para assentar um prédio.'
  }
  catch {
    message.value = 'O prédio de exemplo em GLB não carregou; os demais continuam.'
  }
  window.__terrainLab.ready = true
}

function onReady(tres) {
  context = tres
  if (window.__terrainLab) window.__terrainLab.context = tres
}

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <main class="lab">
    <header class="lab-bar">
      <strong>Terreno · {{ rio.name }}</strong>
      <span class="lab-group" role="group" aria-label="Vistas">
        <button v-for="item in views" :key="item.id" type="button" :disabled="!stage" @click="stage.view(item)">{{ item.label }}</button>
      </span>
      <label>Prédio
        <select v-model.number="size">
          <option v-for="n in 4" :key="n" :value="n">{{ n }}×{{ n }}</option>
        </select>
      </label>
      <label><input v-model="showBlocked" type="checkbox"> zonas bloqueadas</label>
      <label><input v-model="showVegetation" type="checkbox"> vegetação</label>
      <span class="lab-stats">{{ frame.triangles.toLocaleString('pt-BR') }} triângulos · {{ frame.calls }} draws · névoa até {{ frame.fog }}</span>
    </header>
    <div class="lab-stage">
      <TresCanvas
        v-if="data" :camera="camera" :clear-color="PALETTE.sky" :antialias="true" :dpr="[1, 2]" :shadows="false"
        :tone-mapping="NoToneMapping" :output-color-space="SRGBColorSpace" render-mode="on-demand" @ready="onReady"
      >
        <!-- Uma luz direcional e um hemisfério, sem sombras: o orçamento do mapa-mundo. Uma face plana recebe 100% da cor. -->
        <TresHemisphereLight :args="[0xffffff, 0x70828f, 1.35]" />
        <TresDirectionalLight :args="[0xfff6e6, 2.15]" :position="[-45, 80, 40]" />
        <TerrainStage :data="data" :camera="camera" :show-blocked="showBlocked" :show-vegetation="showVegetation" @ready="onStage" @pick="pick">
          <primitive :object="buildings" />
        </TerrainStage>
      </TresCanvas>
    </div>
    <p class="lab-note" role="status">{{ failure || message }}</p>
  </main>
</template>

<style>
html, body, #app { height: 100%; margin: 0; }
body { background: #8fd3f4; color: #1d2b33; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; overscroll-behavior: none; }
.lab { height: 100%; display: flex; flex-direction: column; }
.lab-bar { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; padding: 8px 12px; background: #fff4e0; border-bottom: 1px solid rgb(29 43 51 / 0.15); }
.lab-bar label { display: inline-flex; gap: 6px; align-items: center; min-height: 32px; }
.lab-group { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.lab-bar button, .lab-bar select { font: inherit; min-height: 32px; padding: 4px 10px; border-radius: 8px; border: 1px solid rgb(29 43 51 / 0.3); background: #fff; color: inherit; }
.lab-bar button:active { background: #ffd25a; }
.lab-stats { margin-left: auto; font-variant-numeric: tabular-nums; opacity: 0.75; }
.lab-stage { flex: 1; min-height: 0; position: relative; }
.lab-note { position: absolute; left: 12px; right: 12px; bottom: 12px; margin: 0; padding: 8px 12px; width: fit-content; max-width: calc(100% - 24px); border-radius: 10px; background: rgb(255 244 224 / 0.92); pointer-events: none; }
</style>
