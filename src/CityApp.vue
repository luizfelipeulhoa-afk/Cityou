<script setup>
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { previewBuild, previewRoadPath, roadPath, usesAutoRoad } from '../shared/game/city-layout.js'
import { findSpace } from './world/worldSpaces.js'
import CityWorld from './fifones/CityWorld.js'
import { progression } from './fifones/progression.js'
import { cityAction, completeTask, loadActivity, loadCity, loadProjects, loadTasks, syncRewards } from './fifones/api.js'

const paths = {
  city: 'M3 21V9l6-3v15M9 21V3l7 3v15M16 12l5-3v12M1 21h22M12 8h1m-1 4h1m-1 4h1M5 12h1m-1 4h1m13-2h1m-1 3h1',
  tasks: 'M9 5h11v16H4V5h3m2-2h6v4H9zM8 12l2 2 4-4m-6 8h8',
  calendar: 'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 4h2',
  projects: 'M3 7h7l2 2h9v11H3zM3 7V4h7l2 3',
  library: 'M3 4h5v17H3zM10 4h5v17h-5zM17 5l4-1 3 16-4 1z',
  fitness: 'M7 7l10 10M4 7l3-3M3 10l7-7m4 18l7-7m-4 6l3-3',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon: 'M20 15a8 8 0 0 1-11-11 8.5 8.5 0 1 0 11 11z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2',
  chevron: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
  check: 'M5 12l4 4L19 6',
  arrow: 'M5 12h14m-5-5l5 5-5 5',
  pointer: 'M5 3l14 9-7 1-3 7z',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6l3 3-3 3',
  rotate: 'M20 9A8 8 0 1 0 20 16M20 3v6h-6',
  home: 'M3 11l9-8 9 8M6 9v12h12V9M10 21v-7h4v7',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  demolish: 'M4 7h16M9 3h6l1 4M6 7l1 14h10l1-14M10 11v6m4-6v6',
  upgrade: 'M12 20V4m-6 6l6-6 6 6',
  sound: 'M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  wifi: 'M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 20h.01',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01',
}
const Icon = defineComponent({ props: { name: String, size: { default: 20 } }, setup: props => () => h('svg', { width: props.size, height: props.size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true }, [h('path', { d: paths[props.name] || paths.city })]) })
const nav = [
  { id: 'city', icon: 'city', label: 'Minha cidade' },
  { id: 'tasks', icon: 'tasks', label: 'Tarefas', path: '/#/tarefas' },
  { id: 'calendar', icon: 'calendar', label: 'Agenda', path: '/#/agenda' },
  { id: 'projects', icon: 'projects', label: 'Projetos', path: '/#/projetos' },
  { id: 'library', icon: 'library', label: 'Biblioteca', path: '/#/documentos' },
  { id: 'fitness', icon: 'fitness', label: 'Fitness', path: '/#/fitness' },
  { id: 'settings', icon: 'settings', label: 'Conexões', path: '/#/configuracoes' },
]
const canvas = ref(null)
const requestedRegion = findSpace(new URLSearchParams(window.location.search).get('local'))
const state = ref(null)
const region = computed(() => requestedRegion ?? findSpace(state.value?.location_id))
// A Ilha Inicial é só cenário: sem catálogo, ruas nem prédios. As construções ficam no Rio de Janeiro.
const scenic = computed(() => state.value?.scenic === true)
// Na ilha (cenário) o catálogo existe, mas só com os prédios que ela aceita.
const islandBuild = computed(() => scenic.value && (state.value?.catalog?.length ?? 0) > 0)
const tileCoordinates = ref({ x: 8, y: 8 })
const buildTile = ref(null)
const roadStart = ref(null)
const roadEnd = ref(null)
const roadCoordinates = ref({ x: 8, y: 9, end_x: 8, end_y: 12 })
const activeInterior = ref(null)
const interiorPending = ref(false)
let interiorSequence = 0
let interiorReturnFocus
const tasks = ref([])
const projects = ref([])
const tasksConnected = ref(null)
const activity = ref(null)
const loading = ref(true)
const bootError = ref('')
const sceneError = ref('')
const saving = ref(false)
const taskSaving = ref(null)
const refreshing = ref(false)
const lighting = ref('day')
const tasksOpen = ref(true)
const catalogOpen = ref(true)
const activeFilter = ref('all')
const selectedId = ref(null)
const selectedKind = ref(null)
const mode = ref('select')
const rotation = ref(0)
const workspace = ref(null)
const iframeLoading = ref(false)
const confirmation = ref(null)
const toast = ref(null)
const helpOpen = ref(false)
const historyOpen = ref(false)
const missionTab = ref('tasks')
const celebration = ref(null)
let celebrationTimer = null
let goalPreference = 'stunt'
try { goalPreference = localStorage.getItem('fifones-city-building-goal') || 'stunt' } catch { /* Private browsing still works. */ }
const goalId = ref(goalPreference)
const progress = computed(() => progression(state.value || {}, goalId.value))
function setGoal(id) {
  goalId.value = id
  try { localStorage.setItem('fifones-city-building-goal', id) } catch { /* Optional preference. */ }
}
function pursueGoal() {
  const goal = progress.value.goal
  if (!goal) return
  if (!progress.value.missing) pickItem(goal)
  else { tasksOpen.value = true; missionTab.value = 'tasks'; notify('Escolha uma tarefa real para avançar na sua construção.', 'info') }
}
function celebrate(amount, levelUp) {
  clearTimeout(celebrationTimer)
  celebration.value = { amount, levelUp, key: Date.now() }
  celebrationTimer = setTimeout(() => { celebration.value = null }, 2800)
}

let engine = null
let poll = null
let activityPoll = null
let activityLoading = false
let toastTimer = null
let iframeTimer = null
let disposed = false
let returnFocus = null
let responsiveMedia = null
function onCompactViewport(event) { if (event.matches) tasksOpen.value = false }
const sourceConnected = computed(() => Boolean(state.value?.source?.connected) && tasksConnected.value !== false)
// Prédios de atividade (dom-*) nascem da atividade da pessoa, na aba de organização do dia; não saem do catálogo.
const availableCatalog = computed(() => (state.value?.catalog || []).filter(item => Number(item.cost) > 0 && !item.id.startsWith('dom-')))
const filteredCatalog = computed(() => availableCatalog.value.filter(item => activeFilter.value === 'all' || (activeFilter.value === 'life' ? ['home', 'tree', 'road'].includes(item.id) : !['home', 'tree', 'road'].includes(item.id))))
const chosen = computed(() => state.value?.catalog?.find(item => item.id === selectedKind.value))
const selected = computed(() => state.value?.placements?.find(item => item.id === selectedId.value))
const selectedCatalog = computed(() => state.value?.catalog?.find(item => item.id === selected.value?.kind))
const usesRoadEditor = computed(() => state.value?.grid_max === 24)
const roadPreview = computed(() => {
  if (!roadStart.value || !state.value) return null
  const start = roadStart.value
  const end = roadEnd.value ?? start
  return previewRoadPath(state.value, roadPath(start.x, start.y, end.x, end.y))
})
watch(roadPreview, value => engine?.setRoadPreview(value?.points ?? []))

const activityStates = new Set(['working', 'observed', 'focus', 'waiting', 'idle', 'unknown'])
function placeActivity(kind) {
  const signal = activity.value?.places?.[kind]
  const known = activityStates.has(signal?.state)
  return { state: known ? signal.state : 'unknown', label: known && typeof signal.label === 'string' ? signal.label : 'Sem sinal recente' }
}
const selectedActivity = computed(() => selectedCatalog.value?.destination ? placeActivity(selected.value?.kind) : null)
const workspaceActivity = computed(() => workspace.value?.kind ? placeActivity(workspace.value.kind) : null)
const activeOfficeCount = computed(() => [...new Set((state.value?.placements || []).map(item => item.kind))].filter(kind => {
  const definition = state.value?.catalog?.find(item => item.id === kind)
  return definition?.destination && ['working', 'observed'].includes(placeActivity(kind).state)
}).length)
const openTasks = computed(() => tasks.value.filter(task => task.status !== 'done' && !task.completed_at))
const doneTasks = computed(() => tasks.value.length - openTasks.value.length)
const protectedBuilding = computed(() => ['headquarters', 'plaza'].includes(selected.value?.kind) || selected.value?.id.startsWith('seed-road-'))
const confirmsBuild = computed(() => mode.value === 'build' && chosen.value &&
  usesAutoRoad(state.value?.location_id, chosen.value.id))
const buildQuote = computed(() => {
  if (!confirmsBuild.value || !buildTile.value) return null
  return previewBuild(state.value, { ...buildTile.value, kind: chosen.value.id, rotation: rotation.value })
})
const toolText = computed(() => {
  if (mode.value === 'build') return confirmsBuild.value
    ? 'Escolha um terreno para ver o custo.'
    : `Toque no terreno para construir ${chosen.value?.label || ''}`
  if (mode.value === 'move') return 'Escolha o novo terreno para este prédio'
  if (mode.value === 'remove') return 'Selecione uma construção para demolir'
  return ''
})
const upgradeCost = computed(() => Number(selectedCatalog.value?.cost || 0) * Number(selected.value?.level || 1))
const day = computed(() => {
  const start = Date.parse(state.value?.started_at || '')
  return Number.isFinite(start) ? Math.max(1, Math.floor((Date.now() - start) / 86400000) + 1) : 1
})
function coins(value) { return Number(value || 0).toLocaleString('pt-BR') }
function notify(message, kind = 'success') {
  toast.value = { message, kind }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, kind === 'error' ? 6500 : 4000)
}
function applySnapshot(value) {
  if (disposed) return false
  const snapshot = value?.city || value
  if (!snapshot || !Array.isArray(snapshot.placements)) return false
  if (requestedRegion && snapshot.location_id !== requestedRegion.id) return false
  if (state.value && Number(snapshot.revision) < Number(state.value.revision)) return false
  const previous = state.value
  state.value = snapshot
  if (previous && snapshot.earned > previous.earned) celebrate(snapshot.earned - previous.earned, snapshot.level > previous.level)
  if (!snapshot.source?.connected) engine?.setInUse?.(null)
  if (selectedId.value && !snapshot.placements.some(item => item.id === selectedId.value)) {
    if (activeInterior.value || interiorPending.value) closeInterior()
    selectedId.value = null
  }
  engine?.setState(snapshot)
  return true
}
async function refreshActivity() {
  if (disposed || document.hidden || activityLoading) return
  activityLoading = true
  try {
    const result = await loadActivity()
    if (disposed || document.hidden) return
    const snapshot = result?.activity
    activity.value = snapshot?.places && typeof snapshot.places === 'object' && !Array.isArray(snapshot.places) ? snapshot : null
    engine?.setActivity?.(activity.value)
  }
  catch {
    if (disposed) return
    activity.value = null
    engine?.setActivity?.(null)
  }
  finally { activityLoading = false }
}
function startPolling() {
  clearInterval(poll)
  clearInterval(activityPoll)
  if (disposed || document.hidden) return
  poll = setInterval(() => refreshAll(), 30000)
  activityPoll = setInterval(() => refreshActivity(), 10000)
}
async function reloadWorkspace() {
  const results = await Promise.allSettled([loadTasks(), loadProjects()])
  if (disposed) return
  if (results[0].status === 'fulfilled') {
    tasks.value = results[0].value.tasks || []
    tasksConnected.value = Boolean(results[0].value.connected)
  }
  else tasksConnected.value = false
  if (!tasksConnected.value) engine?.setInUse?.(null)
  if (results[1].status === 'fulfilled') projects.value = results[1].value.projects || []
}
async function refreshAll(manual = false) {
  if (refreshing.value || saving.value) return
  refreshing.value = true
  try {
    const before = Number(state.value?.earned || 0)
    const snapshot = await syncRewards()
    applySnapshot(snapshot)
    await reloadWorkspace()
    const earned = Number(state.value?.earned || 0) - before
    if (earned > 0) notify(`+${coins(earned)} moedas · progresso sincronizado`)
    else if (manual) notify(sourceConnected.value ? 'Seu progresso está atualizado.' : 'Cidade salva. O app original está offline.', sourceConnected.value ? 'success' : 'info')
  }
  catch (error) {
    if (error.details?.city) applySnapshot(error.details.city)
    const results = await Promise.allSettled([loadCity(), reloadWorkspace()])
    if (results[0].status === 'fulfilled') applySnapshot(results[0].value)
    if (manual) notify(sourceConnected.value ? 'Conexão restabelecida. Atualize para sincronizar seu progresso.' : error.message, sourceConnected.value ? 'info' : 'error')
  }
  finally { refreshing.value = false }
}
function updateTool() { engine?.setTool({ mode: mode.value, kind: selectedKind.value, rotation: rotation.value, placementId: selectedId.value, buildTile: buildTile.value }) }
function cancelTool() {
  mode.value = 'select'
  buildTile.value = null
  selectedKind.value = null
  rotation.value = 0
  roadStart.value = null
  roadEnd.value = null
  updateTool()
}
function pickItem(item) {
  if (saving.value || refreshing.value || activeInterior.value) return
  cancelTool()
  if (state.value.credits < item.cost) { setGoal(item.id); notify(`${item.label} é sua próxima construção. Faltam ${coins(item.cost - state.value.credits)} moedas.`, 'info'); return }
  selectedId.value = null
  selectedKind.value = item.id
  mode.value = item.id === 'road' && usesRoadEditor.value ? 'road' : 'build'
  rotation.value = 0
  updateTool()
}
async function performAction(action, message) {
  if (saving.value || refreshing.value || !state.value) return false
  saving.value = true
  try {
    const result = await cityAction({ ...action, expected_revision: state.value.revision })
    applySnapshot(result)
    notify(message)
    return true
  }
  catch (error) {
    const refreshed = applySnapshot(error.details?.city)
    if (error.status === 409) {
      if (!refreshed) {
        try { applySnapshot(await loadCity()) } catch { /* Keep the last confirmed state. */ }
      }
      notify(error.message || 'A cidade foi atualizada. Escolha o terreno novamente.', 'info')
    }
    else notify(error.message, 'error')
    return false
  }
  finally { saving.value = false }
}
function setRoadEndpoint(tile) {
  if (!roadStart.value || roadEnd.value) {
    roadStart.value = tile
    roadEnd.value = null
    Object.assign(roadCoordinates.value, tile)
  } else {
    roadEnd.value = tile
    Object.assign(roadCoordinates.value, { end_x: tile.x, end_y: tile.y })
  }
}

function previewRoadCoordinates() {
  const { x, y, end_x, end_y } = roadCoordinates.value
  if (![x, y, end_x, end_y].every(Number.isInteger)) return
  roadStart.value = { x, y }
  roadEnd.value = { x: end_x, y: end_y }
}

async function confirmRoad() {
  if (!roadEnd.value || !roadPreview.value || roadPreview.value.error || !roadPreview.value.cost) return
  const { x, y } = roadStart.value
  const { x: end_x, y: end_y } = roadEnd.value
  const cost = roadPreview.value.cost
  if (await performAction({ type: 'road_path', x, y, end_x, end_y }, `Via construída · −${coins(cost)} moedas`)) cancelTool()
}

function enterInteriorWorkspace(design) {
  if (!design) return
  const destination = new URL(design.destination, window.location.origin)
  if (window.parent !== window && window.parent.location.origin === window.location.origin) {
    window.parent.location.assign(destination)
  } else {
    window.location.assign(destination)
  }
}

async function openSelectedInterior() {
  const placement = selected.value
  const definition = selectedCatalog.value
  if (!placement || !definition?.interior || interiorPending.value || activeInterior.value) return
  interiorReturnFocus = document.activeElement
  const sequence = ++interiorSequence
  interiorPending.value = true
  try {
    const { buildInterior, getInterior } = await import('./fifones/pilotInteriors.js')
    if (disposed || sequence !== interiorSequence || selectedId.value !== placement.id) return
    const design = getInterior(definition.interior)
    const group = buildInterior(definition.interior, definition)
    if (!group || !engine?.openInterior(placement.id, group, () => enterInteriorWorkspace(design))) {
      notify('Não foi possível abrir este interior.', 'error')
      return
    }
    cancelTool()
    activeInterior.value = { ...design, title: definition.label }
    nextTick(() => document.querySelector('.pilot-interior-close')?.focus())
  } catch {
    if (!disposed) notify('Não foi possível carregar este interior. Tente novamente.', 'error')
  } finally {
    if (sequence === interiorSequence) interiorPending.value = false
  }
}

function closeInterior() {
  interiorSequence++
  interiorPending.value = false
  engine?.closeInterior()
  activeInterior.value = null
  nextTick(() => {
    const target = interiorReturnFocus?.isConnected ? interiorReturnFocus : document.querySelector('.building-panel .open-building')
    target?.focus()
  })
}

async function onTile({ x, y }) {
  if (saving.value || refreshing.value || workspace.value || activeInterior.value) return
  if (mode.value === 'road') { setRoadEndpoint({ x, y }); return }
  historyOpen.value = false
  if (mode.value === 'build' && chosen.value) {
    if (confirmsBuild.value) {
      buildTile.value = { x, y }
      updateTool()
      return
    }
    const item = chosen.value
    const result = await performAction({ type: 'build', kind: item.id, x, y, rotation: rotation.value }, `${item.label} construído · −${coins(item.cost)} moedas`)
    if (result && state.value.credits < item.cost) cancelTool()
  }
  else if (mode.value === 'move' && selected.value) {
    if (await performAction({ type: 'move', placement_id: selected.value.id, x, y, rotation: rotation.value }, 'Construção movida.')) cancelTool()
  }
}
async function confirmBuild() {
  const quote = buildQuote.value
  if (!quote || quote.error || quote.cost > state.value.credits) return
  const { x, y } = buildTile.value
  const item = chosen.value
  const action = { type: 'build', kind: item.id, x, y, rotation: rotation.value }
  if (await performAction(action, `${item.label} construído · −${coins(quote.cost)} moedas`)) {
    buildTile.value = null
    if (state.value.credits < item.cost) cancelTool()
    else updateTool()
  }
}
function onSelect(placement) {
  if (saving.value || refreshing.value || workspace.value || activeInterior.value) return
  selectedId.value = placement?.id || null
  if (mode.value === 'remove' && placement) { askRemove(); return }
  if (mode.value !== 'build' && mode.value !== 'move') cancelTool()
}
function moveSelected() { mode.value = 'move'; rotation.value = selected.value?.rotation || 0; updateTool() }
async function rotateSelected() {
  if (mode.value === 'build' || mode.value === 'move') { rotation.value = (rotation.value + 1) % 4; updateTool(); return }
  if (selected.value) await performAction({ type: 'rotate', placement_id: selected.value.id, rotation: ((selected.value.rotation || 0) + 1) % 4 }, 'Construção girada.')
}
function askRemove() {
  if (!selected.value || protectedBuilding.value) return
  confirmation.value = { id: selected.value.id, label: selectedCatalog.value?.label || 'construção', refund: Math.floor(Number(selectedCatalog.value?.cost || 0) / 2) }
  nextTick(() => document.querySelector('.confirm-cancel')?.focus())
}
async function confirmRemove() {
  const item = confirmation.value
  if (!item) return
  if (await performAction({ type: 'remove', placement_id: item.id }, `Construção demolida · +${coins(item.refund)} moedas`)) { confirmation.value = null; cancelTool() }
}
async function upgradeSelected() {
  if (!selected.value) return
  await performAction({ type: 'upgrade', placement_id: selected.value.id }, 'Construção evoluída.')
}
async function finishTask(task) {
  if (saving.value || refreshing.value || taskSaving.value) return
  taskSaving.value = task.id
  saving.value = true
  const before = Number(state.value?.earned || 0)
  try {
    const result = await completeTask(task.id)
    if (!applySnapshot(result)) applySnapshot(await loadCity())
    await reloadWorkspace()
    const earned = Number(state.value?.earned || 0) - before
    notify(earned > 0 ? `Tarefa concluída · +${coins(earned)} moedas` : 'Tarefa concluída. Progresso sincronizado.')
  }
  catch (error) { notify(error.message, 'error'); await reloadWorkspace() }
  finally { taskSaving.value = null; saving.value = false }
}
function openWorkspace(label, destination) {
  cancelTool()
  returnFocus = document.activeElement
  let url
  try {
    url = new URL(destination || '/#/tarefas', 'http://127.0.0.1:8765')
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '8765' || !url.hash.startsWith('#/')) throw new Error('Destino inválido.')
  }
  catch { notify('Este espaço ainda não possui um destino disponível.', 'error'); return }
  const activePlacement = sourceConnected.value && state.value?.placements?.find(placement => {
    const definition = state.value.catalog.find(item => item.id === placement.kind)
    const destination = placement.target || definition?.destination
    if (!destination) return false
    try { return new URL(destination, 'http://127.0.0.1:8765').hash === url.hash } catch { return false }
  })
  const definition = state.value?.catalog?.find(item => {
    if (!item.destination) return false
    try { return new URL(item.destination, 'http://127.0.0.1:8765').hash === url.hash } catch { return false }
  })
  workspace.value = { label, url: url.toString(), kind: activePlacement?.kind || definition?.id || null }
  engine?.setInUse?.(activePlacement?.id || null)
  historyOpen.value = false
  iframeLoading.value = true
  clearTimeout(iframeTimer)
  iframeTimer = setTimeout(() => { iframeLoading.value = false }, 12000)
  nextTick(() => document.querySelector('.workspace-close')?.focus())
}
function closeWorkspace() { const wasOpen = Boolean(workspace.value); workspace.value = null; engine?.setInUse?.(null); clearTimeout(iframeTimer); returnFocus?.focus?.(); if (wasOpen) refreshAll() }
function reloadPage() { window.location.reload() }
function iframeLoaded() { iframeLoading.value = false; clearTimeout(iframeTimer) }
function useNav(item) {
  historyOpen.value = false
  if (activeInterior.value) closeInterior()
  if (item.id === 'city') { closeWorkspace(); cancelTool(); selectedId.value = null; engine?.home() }
  else openWorkspace(item.label, item.path)
}
function setLighting(value) { lighting.value = value; engine?.setLighting(value) }
function onKeydown(event) {
  const editable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable
  if (editable) return
  if (event.key === 'Escape') {
    if (confirmation.value) confirmation.value = null
    else if (workspace.value) closeWorkspace()
    else if (activeInterior.value || interiorPending.value) closeInterior()
    else { cancelTool(); selectedId.value = null; helpOpen.value = false; historyOpen.value = false }
  }
  if (event.key.toLowerCase() === 'r' && !workspace.value && !confirmation.value && !activeInterior.value && mode.value !== 'road') { event.preventDefault(); rotateSelected() }
  if (event.key === 'Tab' && (workspace.value || confirmation.value)) {
    const dialog = document.querySelector(confirmation.value ? '.confirmation' : '.workspace')
    const items = dialog?.querySelectorAll('button:not(:disabled), iframe, a[href]')
    if (items?.length && event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus() }
    else if (items?.length && !event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() }
  }
}
function onVisibility() {
  clearInterval(poll)
  clearInterval(activityPoll)
  if (document.hidden) {
    activity.value = null
    engine?.setActivity?.(null)
  }
  else {
    refreshAll()
    refreshActivity()
    startPolling()
  }
}
function thumbnail(item) {
  if (item.preview) return item.preview
  if (['road','tree','home','tasks','agenda','memory','projects','stunt','chatgpt','claude','gemini','grok'].includes(item.id)) return `/previews/${item.id}.png`
  const color = /^#[0-9a-f]{3,8}$/i.test(item.color) ? item.color : '#65aeb1'
  const kind = `${item.id} ${item.model}`.toLowerCase()
  let art
  if (/tree/.test(kind)) art = '<path d="M49 63v-22" stroke="#886c4c" stroke-width="4"/><path d="M49 12L30 43h11L26 55h46L57 43h11z" fill="#9bd66c"/><path d="M49 12v43h23L57 43h11z" fill="#67ba57"/>'
  else if (/road/.test(kind)) art = '<path d="M9 49L59 23l34 18-50 27z" fill="#78908b"/><path d="M22 49l50-26m-37 33l50-26" stroke="#e4ddba" stroke-width="1.5" stroke-dasharray="6 5"/>'
  else {
    const tower = /chatgpt|claude|gemini|grok|projects/.test(kind)
    const home = /home/.test(kind)
    const top = tower ? 12 : 28
    art = `<path d="M29 ${top + 12}l22-12 23 12v34L51 ${top + 58} 29 ${top + 46}z" fill="${color}"/><path d="M51 ${top}l23 12-23 13-22-13z" fill="#fff4d6"/><path d="M51 ${top + 25}l23-13v34L51 ${top + 58}z" fill="#203f43" opacity=".19"/><path d="M36 ${top + 23}v6m8-2v6m-8 1v6m8-2v6m15-17v6m8-10v6m-8 1v6m8-10v6" stroke="#fff7dc" stroke-width="3"/>`
    if (home) art += '<path d="M24 42l26-24 29 23-28 16z" fill="#dc795b"/><path d="M50 18l29 23-28 16z" fill="#b55e4a"/>'
    if (/tasks|agenda|memory/.test(kind)) art += `<path d="M38 ${top+9}l13-7 13 7-13 7z" fill="#e8aa50"/><path d="M44 ${top+8}l5 3 9-5" fill="none" stroke="#fff7dc" stroke-width="2"/>`
    if (/stunt/.test(kind)) art += '<path d="M18 58l23-13 13 8-24 13z" fill="#e18b54"/><path d="M19 57l17-22 5 10z" fill="#efb672"/>'
  }
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="88" viewBox="0 0 100 88"><ellipse cx="51" cy="73" rx="34" ry="8" fill="#183b3e" opacity=".09"/>${art}</svg>`)
}
onMounted(async () => {
  responsiveMedia = window.matchMedia('(max-width: 600px)')
  onCompactViewport(responsiveMedia)
  responsiveMedia.addEventListener('change', onCompactViewport)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisibility)
  function initializeScene() {
    if (disposed) return
    try {
      engine = new CityWorld(canvas.value, {
        region: region.value, onSelect, onTile,
        onError: error => { sceneError.value = error?.message || String(error) },
        onReady: () => {
          if (state.value) engine?.setState(state.value)
          engine?.setActivity?.(activity.value)
        },
      })
      window.__fifonesCity = { get state() { return state.value }, get activity() { return activity.value }, get engine() { return engine } }
    } catch (error) { sceneError.value = error.message }
  }
  const initializeCity = async () => {
    try {
      applySnapshot(await loadCity())
      if (!requestedRegion) initializeScene()
    } catch (error) { if (!disposed) bootError.value = error.message }
    finally { if (!disposed) loading.value = false }
  }
  if (requestedRegion) initializeScene()
  await Promise.allSettled([initializeCity(), reloadWorkspace(), refreshActivity()])
  startPolling()
})
onUnmounted(() => {
  disposed = true
  clearInterval(poll)
  clearInterval(activityPoll)
  clearTimeout(toastTimer)
  clearTimeout(iframeTimer)
  clearTimeout(celebrationTimer)
  responsiveMedia?.removeEventListener('change', onCompactViewport)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibility)
  engine?.destroy()
  engine = null
  delete window.__fifonesCity
})
</script>

<template>
  <main class="city-app" :class="{ 'is-dusk': lighting === 'dusk', 'catalog-hidden': !catalogOpen, 'is-cutaway': !!activeInterior }">
    <canvas ref="canvas" class="city-canvas" :aria-label="`Cidade 3D em ${region?.nome ?? 'Rio de Janeiro'}. Arraste para explorar e use a roda do mouse para aproximar.`" />
    <div class="scene-vignette" aria-hidden="true" />

    <header class="topbar">
      <button class="brand" aria-label="Cityou, voltar para minha cidade" @click="useNav(nav[0])">
        <span class="brand-mark" aria-hidden="true">c<span>.</span></span>
        <span class="brand-copy"><strong>Cityou</strong><small>{{ region?.nome ?? 'Sua vida, em construção.' }}</small></span>
      </button>
      <div class="city-location"><span class="location-dot" /><span>{{ region?.nome ?? 'Rio de Janeiro' }}</span><span class="location-line" /><span class="city-day">Dia {{ day }}</span></div>
      <div class="topbar-right"><small v-if="state?.test_mode" class="pilot-test-mode" title="Oito regiões abertas e créditos de teste">Prévia de teste</small><a class="city-world-link" :href="region ? `./world.html?de=${encodeURIComponent(region.id)}` : './world.html'">Voltar ao globo</a><span v-if="activeOfficeCount > 0" class="office-activity-count" title="Execuções detectadas/observadas em seus escritórios" :aria-label="`${activeOfficeCount} escritórios com execuções detectadas ou observadas`"><span />{{ activeOfficeCount }}<span class="office-activity-caption">em atividade</span></span>
        <div class="save-status" role="status"><span :class="{ busy: saving || refreshing }" />{{ saving ? 'Salvando…' : refreshing ? 'Sincronizando…' : state ? 'Salvo no servidor' : 'Conectando…' }}</div>
        <button class="balance" :aria-label="`Saldo: ${coins(state?.credits)} moedas. Ver histórico`" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen"><span class="coin-glyph"><Icon name="coin" :size="18" /></span><strong>{{ coins(state?.credits) }}</strong><span class="balance-label">moedas</span></button>
        <div class="level-badge" :title="`${progress.remaining} ações recompensadas para o próximo nível`"><span>NÍVEL</span><strong>{{ state?.level || 1 }}</strong><span class="level-track" role="progressbar" aria-label="Progresso para o próximo nível" :aria-valuenow="progress.withinLevel" :aria-valuemin="0" :aria-valuemax="10"><i :style="{ transform: `scaleX(${progress.withinLevel / 10})` }" /></span></div>
      </div>
    </header>

    <section v-if="historyOpen" class="balance-history panel" aria-label="Histórico de moedas"><div class="history-heading"><h2>Seu saldo</h2><button class="icon-button" aria-label="Fechar histórico" @click="historyOpen = false"><Icon name="close" :size="16" /></button></div><ul><li v-for="(entry, index) in (state?.history || []).slice(0, 5)" :key="index"><span :title="entry.label">{{ entry.label }}</span><strong :class="{ expense: entry.amount < 0 }">{{ entry.amount > 0 ? '+' : '' }}{{ coins(entry.amount) }}</strong></li></ul><p>Tarefa +10 <span>·</span> Hábito +5</p></section>
    <nav class="nav-rail" aria-label="Seus espaços Cityou">
      <button v-for="item in nav" :key="item.id" class="rail-button" :class="{ active: item.id === 'city' && !workspace, 'workspace-active': workspace?.label === item.label }" :aria-label="item.label" :aria-current="item.id === 'city' && !workspace ? 'page' : undefined" @click="useNav(item)"><Icon :name="item.icon" :size="22" /><span class="rail-tooltip">{{ item.label }}</span></button>
      <span class="rail-divider" />
      <button class="rail-button help-button" :class="{ active: helpOpen }" aria-label="Como jogar" :aria-expanded="helpOpen" @click="helpOpen = !helpOpen"><Icon name="help" :size="21" /><span class="rail-tooltip">Como jogar</span></button>
    </nav>

    <aside v-if="scenic && !loading" class="next-build scenic-note panel" aria-label="Sobre a ilha"><span class="eyebrow">ILHA INICIAL</span><p v-if="islandBuild">Aqui você constrói o Farol, a Cabana, o Píer e decorações da ilha. Os outros prédios ficam no Rio de Janeiro.</p><p v-else>Aqui é só para contemplar o mar. Suas construções ficam no Rio de Janeiro.</p><a class="goal-action" href="./city.html?local=cristo-redentor"><span>Ir para o Rio de Janeiro</span></a></aside>

    <aside v-if="!scenic && progress.goal && !loading" class="next-build panel" aria-label="Próxima construção">
      <div class="goal-topline"><span class="eyebrow">SUA PRÓXIMA CONSTRUÇÃO</span><span class="goal-ready" v-if="!progress.missing">Pode construir</span><span v-else>{{ Math.round(progress.goalPercent) }}%</span></div>
      <div class="goal-main"><img :src="thumbnail(progress.goal)" alt="" /><div><label class="goal-picker"><span class="sr-only">Escolher próxima construção</span><select :value="progress.goal.id" aria-label="Escolher próxima construção" @change="setGoal($event.target.value)"><option v-for="item in availableCatalog" :key="item.id" :value="item.id">{{ item.label }}</option></select><Icon name="down" :size="14" /></label><span class="goal-cost">{{ coins(Math.min(state.credits, progress.goal.cost)) }} <span>/ {{ coins(progress.goal.cost) }} moedas</span></span></div></div>
      <div class="goal-track" role="progressbar" :aria-label="`Moedas para ${progress.goal.label}`" :aria-valuenow="Math.min(state.credits, progress.goal.cost)" :aria-valuemin="0" :aria-valuemax="progress.goal.cost"><i :style="{ transform: `scaleX(${progress.goalPercent / 100})` }" /></div>
      <button class="goal-action" :disabled="saving || refreshing" @click="pursueGoal"><span>{{ progress.missing ? `Faltam ${coins(progress.missing)} moedas` : 'Escolher terreno' }}</span><Icon :name="progress.missing ? 'tasks' : 'arrow'" :size="16" /></button>
    </aside>

    <aside class="missions panel" :class="{ collapsed: !tasksOpen }" aria-label="Missões da sua cidade">
      <div class="missions-header"><div class="section-title"><span class="small-icon"><Icon name="tasks" :size="17" /></span><h1>Suas missões</h1><span v-if="sourceConnected" class="count-bubble">{{ openTasks.length }}</span></div><div class="header-actions"><button class="icon-button" :class="{ spinning: refreshing }" aria-label="Atualizar tarefas e recompensas" :disabled="refreshing || saving" @click="refreshAll(true)"><Icon name="refresh" :size="16" /></button><button class="icon-button collapse-button" :aria-label="tasksOpen ? 'Recolher missões' : 'Expandir missões'" :aria-expanded="tasksOpen" @click="tasksOpen = !tasksOpen"><Icon name="down" :size="16" /></button></div></div>
      <div v-if="tasksOpen" class="missions-content">
        <div class="mission-tabs" role="group" aria-label="Mostrar missões ou conquistas"><button :class="{ active: missionTab === 'tasks' }" :aria-pressed="missionTab === 'tasks'" @click="missionTab = 'tasks'">Missões</button><button :class="{ active: missionTab === 'milestones' }" :aria-pressed="missionTab === 'milestones'" @click="missionTab = 'milestones'">Conquistas <span>{{ progress.milestones.filter(item => item.value >= item.total).length }}/3</span></button></div>
        <div v-if="missionTab === 'milestones'" class="milestones"><div v-for="item in progress.milestones" :key="item.id" class="milestone" :class="{ achieved: item.value >= item.total }"><span class="milestone-icon"><Icon :name="item.value >= item.total ? 'check' : item.icon" :size="19" /></span><div><strong>{{ item.label }}</strong><p>{{ item.detail }}</p><div class="milestone-track"><i :style="{ transform: `scaleX(${item.value / item.total})` }" /></div></div><small>{{ item.value }}/{{ item.total }}</small></div><p class="milestone-note">No seu ritmo. Seu progresso não expira.</p></div>
        <template v-else>
        <template v-if="sourceConnected">

          <div class="reward-note"><span class="reward-coin"><Icon name="coin" :size="15" /></span><span>Cada tarefa vale <strong>+10 moedas.</strong></span></div>
          <ul v-if="openTasks.length" class="task-list"><li v-for="task in openTasks.slice(0, 3)" :key="task.id" class="task-row"><button class="task-check" :class="{ pending: taskSaving === task.id }" :disabled="saving || refreshing" :aria-label="`Concluir ${task.title}`" @click="finishTask(task)"><Icon v-if="taskSaving === task.id" name="refresh" :size="13" /></button><span class="task-title" :title="task.title">{{ task.title || 'Tarefa sem título' }}</span><span class="task-reward">+10</span></li></ul>
          <div v-else class="empty-tasks"><span class="empty-check"><Icon name="check" :size="21" /></span><strong>Tudo em dia por aqui.</strong><span>Crie uma tarefa para dar o próximo passo.</span></div>
          <div class="mission-footer"><span><span class="done-dot" />{{ doneTasks }} concluída{{ doneTasks === 1 ? '' : 's' }}</span><button class="text-button" @click="openWorkspace('Tarefas', '/#/tarefas')">Ver tarefas <Icon name="arrow" :size="14" /></button></div>
        </template>
        <div v-else class="offline-tasks"><span class="offline-icon"><Icon name="wifi" :size="22" /></span><strong>{{ tasksConnected === null ? 'Buscando suas tarefas…' : 'Seu Fifones está offline' }}</strong><p>Inicie o app original na porta 8765 para conectar suas tarefas e ganhar moedas.</p><button class="text-button" :disabled="refreshing" @click="refreshAll(true)">Tentar conectar <Icon name="refresh" :size="13" /></button></div>
        </template>
      </div>
    </aside>

    <section v-if="selected && !workspace && !activeInterior" class="building-panel panel" aria-label="Construção selecionada">
      <div class="building-heading"><img v-if="selectedCatalog" :src="thumbnail(selectedCatalog)" alt="" /><div><span class="eyebrow">NA SUA CIDADE</span><h2>{{ selected.nome || selectedCatalog?.label || selected.kind }}</h2><p v-if="selected.activity_id">{{ selectedCatalog?.label }} <span>· {{ selected.x }}, {{ selected.y }}</span></p><p v-else>Nível {{ selected.level || 1 }} <span>· {{ selected.x }}, {{ selected.y }}</span></p></div><button class="icon-button" aria-label="Fechar detalhes da construção" @click="selectedId = null; cancelTool()"><Icon name="close" :size="16" /></button></div>
      <div v-if="selected.activity_id" class="building-stage"><strong>{{ selected.etapa_nome }}</strong><span>{{ selected.dias }} {{ selected.dias === 1 ? 'dia' : 'dias' }} com prática · {{ selected.semanas }} {{ selected.semanas === 1 ? 'semana' : 'semanas' }}</span><i class="stage-track" role="progressbar" aria-label="Etapa do prédio" :aria-valuenow="selected.etapa" aria-valuemin="0" aria-valuemax="4"><b :style="{ transform: `scaleX(${selected.etapa / 4})` }" /></i><small v-if="selected.proxima">Próxima etapa, {{ selected.proxima.etapa_nome }}: {{ selected.proxima.dias }} dias em {{ selected.proxima.semanas }} semanas com prática. O prédio avança com a sua prática, no seu ritmo.</small><small v-else>Prédio concluído.</small></div>
      <div v-if="selectedActivity" class="building-activity" :class="`signal-${selectedActivity.state}`"><span class="activity-dot" /><span>{{ selectedActivity.label }}</span></div>
      <button v-if="selectedCatalog?.interior" class="open-building" :disabled="interiorPending" @click="openSelectedInterior">{{ interiorPending ? 'Abrindo interior…' : 'Abrir corte do prédio' }} <Icon name="expand" :size="16" /></button>
      <button v-else-if="selected.target || selectedCatalog?.destination" class="open-building" @click="openWorkspace(selectedCatalog?.label || 'Seu espaço', selected.target || selectedCatalog?.destination)">Entrar neste espaço <Icon name="arrow" :size="16" /></button>
      <div class="building-actions"><button :disabled="saving || refreshing" :class="{ selected: mode === 'move' }" @click="moveSelected"><Icon name="move" :size="17" /><span>Mover</span></button><button :disabled="saving || refreshing" @click="rotateSelected"><Icon name="rotate" :size="17" /><span>Girar</span></button><button v-if="!protectedBuilding && !selected.activity_id" :disabled="saving || refreshing || selected.level >= 3 || state.credits < upgradeCost" :title="selected.level >= 3 ? 'Nível máximo' : `Evoluir por ${upgradeCost} moedas`" @click="upgradeSelected"><Icon name="upgrade" :size="17" /><span>{{ selected.level >= 3 ? 'Máximo' : `Evoluir · ${upgradeCost}` }}</span></button><button v-if="!protectedBuilding" class="danger-action" :disabled="saving || refreshing" @click="askRemove"><Icon name="demolish" :size="17" /><span>Demolir</span></button></div>
    </section>

    <section v-if="activeInterior" class="pilot-interior-panel panel" aria-label="Interior do prédio">
      <h2>{{ activeInterior.title }}</h2>
      <button class="primary-button" type="button" @click="enterInteriorWorkspace(activeInterior)">{{ activeInterior.label }}</button>
      <button class="secondary-button pilot-interior-close" type="button" @click="closeInterior">Fechar interior</button>
    </section>

    <section v-if="mode === 'road'" class="road-editor panel" aria-label="Traçar uma via">
      <p role="status">{{ roadEnd ? (roadPreview?.error || `Trecho · ${coins(roadPreview?.cost)} moedas`) : roadStart ? 'Toque no fim do trecho.' : 'Toque no início da via.' }}</p>
      <div class="road-editor-actions">
        <button class="primary-button" :disabled="saving || !roadEnd || !!roadPreview?.error || !roadPreview?.cost" @click="confirmRoad">Confirmar via</button>
        <button class="secondary-button" :disabled="saving" @click="cancelTool">Cancelar</button>
      </div>
      <details>
        <summary>Usar coordenadas</summary>
        <form class="road-editor-fields" @submit.prevent="previewRoadCoordinates">
          <label>Início X<input v-model.number="roadCoordinates.x" type="number" :min="state.grid_min" :max="state.grid_max" required /></label>
          <label>Início Y<input v-model.number="roadCoordinates.y" type="number" :min="state.grid_min" :max="state.grid_max" required /></label>
          <label>Fim X<input v-model.number="roadCoordinates.end_x" type="number" :min="state.grid_min" :max="state.grid_max" required /></label>
          <label>Fim Y<input v-model.number="roadCoordinates.end_y" type="number" :min="state.grid_min" :max="state.grid_max" required /></label>
          <button type="submit" class="secondary-button">Prévia da via</button>
        </form>
      </details>
    </section>

    <details v-if="usesRoadEditor && !buildQuote && (mode === 'build' || mode === 'move')" class="tile-coordinates panel">
      <summary>Escolher terreno por coordenadas</summary>
      <form class="road-editor-fields" @submit.prevent="onTile(tileCoordinates)">
        <label>Coluna X<input v-model.number="tileCoordinates.x" type="number" :min="state.grid_min" :max="state.grid_max" required /></label>
        <label>Linha Y<input v-model.number="tileCoordinates.y" type="number" :min="state.grid_min" :max="state.grid_max" required /></label>
        <button type="submit" class="secondary-button" :disabled="saving || refreshing">{{ confirmsBuild ? 'Ver custo' : 'Usar terreno' }}</button>
      </form>
    </details>

    <section v-if="buildQuote" class="road-editor panel" aria-label="Prévia de construção">
      <p role="status">
        <template v-if="buildQuote.error">{{ buildQuote.error }}</template>
        <template v-else>
          {{ chosen.label }} · {{ coins(chosen.cost) }} moedas
          <template v-if="buildQuote.road.tiles.length">
            + {{ buildQuote.road.tiles.length }} {{ buildQuote.road.tiles.length === 1 ? 'trecho' : 'trechos' }} de rua ({{ coins(buildQuote.road.cost) }} moedas)
          </template>
          <br /><strong>Total: {{ coins(buildQuote.cost) }} moedas</strong>
          <template v-if="buildQuote.cost > state.credits"> · Saldo insuficiente</template>
        </template>
      </p>
      <div class="road-editor-actions">
        <button class="primary-button" :disabled="saving || refreshing || !!buildQuote.error || buildQuote.cost > state.credits" @click="confirmBuild">Confirmar construção</button>
        <button class="secondary-button" :disabled="saving" @click="rotateSelected">Girar</button>
        <button class="secondary-button" :disabled="saving" @click="cancelTool">Cancelar</button>
      </div>
    </section>

    <div v-if="toolText && !workspace && !buildQuote" class="tool-hint" role="status"><span class="hint-dot" /><span>{{ toolText }}</span><kbd>R</kbd><span class="rotation-hint">girar</span><button aria-label="Girar construção" title="Girar construção (R)" @click="rotateSelected"><Icon name="rotate" :size="16" /></button><button aria-label="Cancelar construção" @click="cancelTool"><Icon name="close" :size="16" /></button></div>

    <section v-if="!scenic || islandBuild" class="catalog panel" :class="{ 'catalog-is-closed': !catalogOpen }" aria-label="Catálogo de construções">
      <div class="catalog-toolbar"><button class="catalog-title" :aria-expanded="catalogOpen" @click="catalogOpen = !catalogOpen"><span class="build-icon"><Icon name="plus" :size="18" /></span>Construir <Icon name="down" :size="14" /></button><div v-if="catalogOpen" class="catalog-filters" role="group" aria-label="Filtrar construções"><button :class="{ selected: activeFilter === 'all' }" @click="activeFilter = 'all'">Tudo</button><button :class="{ selected: activeFilter === 'life' }" @click="activeFilter = 'life'">Bairro</button><button :class="{ selected: activeFilter === 'work' }" @click="activeFilter = 'work'">Seus espaços</button></div><span v-if="catalogOpen" class="catalog-spacer" /><button v-if="catalogOpen" class="select-tool" :class="{ selected: mode === 'select' }" aria-label="Selecionar construção" @click="cancelTool"><Icon name="pointer" :size="16" /><span>Selecionar</span></button></div>
      <div v-if="catalogOpen" class="catalog-items"><button v-for="item in filteredCatalog" :key="item.id" class="catalog-card" :class="{ chosen: selectedKind === item.id, unaffordable: state.credits < item.cost, 'is-goal': progress.goal?.id === item.id }" :aria-pressed="selectedKind === item.id" :aria-label="`Construir ${item.label}, ${item.cost} moedas`" :disabled="saving || refreshing" @click="pickItem(item)"><span class="card-thumbnail"><img :src="thumbnail(item)" alt="" loading="eager" /></span><span class="card-name">{{ item.label }}</span><span class="card-price"><Icon name="coin" :size="12" />{{ coins(item.cost) }}</span><span v-if="state.credits < item.cost" class="card-missing">Faltam {{ coins(item.cost - state.credits) }}</span><span v-else class="card-missing card-fit">{{ item.width }} × {{ item.depth }} terrenos</span><span v-if="progress.goal?.id === item.id" class="card-goal-dot" title="Sua próxima construção" /><span v-if="selectedKind === item.id" class="card-selected"><Icon name="check" :size="11" /></span></button><div v-if="!filteredCatalog.length" class="catalog-empty">{{ loading ? 'Preparando sua cidade…' : 'O catálogo aparece quando a cidade se conectar.' }}</div></div>
    </section>

    <div class="view-controls"><div class="light-switch" role="group" aria-label="Iluminação da cidade"><button :class="{ selected: lighting === 'day' }" aria-label="Luz do dia" :aria-pressed="lighting === 'day'" @click="setLighting('day')"><Icon name="sun" :size="18" /></button><button :class="{ selected: lighting === 'dusk' }" aria-label="Entardecer" :aria-pressed="lighting === 'dusk'" @click="setLighting('dusk')"><Icon name="moon" :size="17" /></button></div><div class="camera-controls"><button aria-label="Girar câmera" title="Girar câmera" @click="engine?.rotateCamera()"><Icon name="rotate" :size="18" /></button><button aria-label="Voltar à vista inicial" title="Vista inicial" @click="engine?.home()"><Icon name="expand" :size="18" /></button></div><span class="view-caption">{{ lighting === 'day' ? 'Luz do dia' : 'Entardecer' }}<span>·</span>{{ region?.nome ?? 'Rio 2035' }}</span></div>

    <div v-if="helpOpen" class="help-popover panel"><button class="icon-button" aria-label="Fechar ajuda" @click="helpOpen = false"><Icon name="close" :size="16" /></button><h2>Cuide da vida.<br />Construa sua cidade.</h2><p>Você começa com 50 moedas. Tarefas concluídas valem 10; hábitos, 5. A cada 10 recompensas, seu nível sobe e a cidade ganha mais espaço.</p><dl><div><dt>Explorar</dt><dd>Arraste a cidade</dd></div><div><dt>Aproximar</dt><dd>Role o mouse</dd></div><div><dt>Girar construção</dt><dd><kbd>R</kbd></dd></div><div><dt>Cancelar</dt><dd><kbd>Esc</kbd></dd></div></dl><p class="help-footnote">Seu progresso fica salvo neste computador.</p></div>

    <div v-if="loading || bootError || sceneError" class="city-notice panel" role="status"><span class="notice-mark">c.</span><strong>{{ sceneError ? 'Não foi possível abrir a vista 3D' : bootError ? 'A cidade está desconectada' : 'Sua cidade está chegando…' }}</strong><p v-if="bootError || sceneError">{{ sceneError || bootError }}</p><span v-else class="loading-line" /><button v-if="bootError || sceneError" class="primary-button" @click="reloadPage">Tentar novamente</button></div>

    <Transition name="reward"><div v-if="celebration && !workspace" :key="celebration.key" class="reward-burst" role="status"><span v-for="index in 8" :key="index" class="reward-spark" :style="{ '--n': index }" aria-hidden="true" /><span class="reward-medal"><Icon :name="celebration.levelUp ? 'expand' : 'check'" :size="29" /></span><strong>{{ celebration.levelUp ? `Nível ${state.level}!` : `+${coins(celebration.amount)} moedas` }}</strong><span>{{ celebration.levelUp ? 'Mais terrenos para suas ideias.' : 'Seu progresso ganhou espaço.' }}</span></div></Transition>

    <Transition name="toast"><div v-if="toast" class="toast" :class="toast.kind" role="status"><span class="toast-icon"><Icon :name="toast.kind === 'error' ? 'close' : toast.kind === 'info' ? 'wifi' : 'check'" :size="17" /></span><span>{{ toast.message }}</span><button aria-label="Fechar mensagem" @click="toast = null"><Icon name="close" :size="14" /></button></div></Transition>

    <div v-if="workspace" class="workspace-backdrop"><section class="workspace" role="dialog" aria-modal="true" :aria-label="workspace.label"><header class="workspace-header"><div><span class="workspace-mark">c.</span><span><strong>{{ workspace.label }}</strong><small>Seu espaço no Cityou</small></span></div><div class="workspace-header-right"><span v-if="sourceConnected && workspaceActivity" class="workspace-user-badge">Em uso por você</span><span v-if="workspaceActivity" class="workspace-activity" :class="`signal-${workspaceActivity.state}`" :title="workspaceActivity.label"><span class="activity-dot" />{{ workspaceActivity.label }}</span><span class="connection-badge" :class="{ disconnected: !sourceConnected }"><span />{{ sourceConnected ? 'Conectado' : 'Desconectado' }}</span><button class="workspace-close icon-button" aria-label="Fechar espaço e voltar à cidade" @click="closeWorkspace"><Icon name="close" :size="20" /></button></div></header><div v-if="!sourceConnected" class="workspace-offline"><Icon name="wifi" :size="36" /><h2>Vamos reconectar seu espaço.</h2><p>Abra o app original do Fifones na porta 8765.<br />Sua cidade continua salva e disponível.</p><button class="primary-button" :disabled="refreshing" @click="refreshAll(true)">{{ refreshing ? 'Conectando…' : 'Tentar novamente' }}<Icon name="refresh" :size="16" /></button></div><template v-else><div v-if="iframeLoading" class="iframe-loading"><span class="loading-line" />Abrindo {{ workspace.label }}…</div><iframe :key="workspace.url" :src="workspace.url" :title="workspace.label" allow="microphone; camera" @load="iframeLoaded" /></template></section></div>

    <div v-if="confirmation" class="confirmation-backdrop" @click.self="confirmation = null"><section class="confirmation panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><span class="confirm-icon"><Icon name="demolish" :size="25" /></span><h2 id="confirm-title">Demolir {{ confirmation.label }}?</h2><p id="confirm-description">Você receberá {{ coins(confirmation.refund) }} moedas de volta, metade do custo da construção.</p><div><button class="secondary-button confirm-cancel" :disabled="saving" @click="confirmation = null">Manter construção</button><button class="danger-button" :disabled="saving || refreshing" @click="confirmRemove">{{ saving ? 'Demolindo…' : 'Demolir' }}</button></div></section></div>
  </main>
</template>
