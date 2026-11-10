<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import WorldGlobe from '@/world/WorldGlobe.js'
import { WORLD_SPACES } from '@/world/worldSpaces.js'
import { applyProgress, completeSpace, currentSpaceId, initialProgress, normalizeProgress, unlockSpace } from '@/world/progress.js'

const props = defineProps({
  /** { desbloqueados: string[], concluidos: string[] } — use v-model:progress para o debug salvar. */
  progress: { type: Object, default: () => initialProgress() },
  spaces: { type: Array, default: () => WORLD_SPACES },
  /** Abre o painel de debug (também abre com a tecla D ou ?debug=1). */
  debug: { type: Boolean, default: false },
})
const emit = defineEmits(['open-world', 'select', 'update:progress', 'locked', 'ready'])

const root = ref(null)
const canvas = ref(null)
const tooltipEl = ref(null)
const globe = shallowRef(null)
const error = ref('')
const ready = ref(false)
const cinematic = ref(false)
const banner = ref(null)
const stats = ref(null)
const modelSources = reactive({})
const tooltip = reactive({ visible: false, title: '', text: '', kind: 'info', id: null, sticky: false })
const debugOpen = ref(props.debug || readDebugQuery())
const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
let tooltipTimer = null
let bannerTimer = null

const order = computed(() => props.spaces.map(s => s.id))
const localProgress = ref(normalizeProgress(props.progress, order.value))
watch(() => props.progress, p => { localProgress.value = normalizeProgress(p, order.value) }, { deep: true })
const spacesState = computed(() => applyProgress(props.spaces, localProgress.value))
const currentId = computed(() => currentSpaceId(localProgress.value, order.value))
const completedCount = computed(() => localProgress.value.concluidos.length)

watch(spacesState, list => globe.value?.setSpaces(list, { animate: true }))
// Em modo debug, o globo fica acessível no console: window.__buildUWorld
watch([debugOpen, globe], ([on, g]) => { if (on && g) window.__buildUWorld = g })

function readDebugQuery() {
  try { return new URLSearchParams(window.location.search).get('debug') === '1' }
  catch { return false }
}

function statusLabel(space) {
  if (space.concluido) return 'Concluído'
  if (space.desbloqueado) return coarsePointer ? 'Toque para entrar' : 'Clique para entrar'
  return 'Bloqueado'
}

function showTooltip({ id, title, text, kind = 'info', ms = 0, sticky = false }) {
  clearTimeout(tooltipTimer)
  Object.assign(tooltip, { visible: true, id, title, text, kind, sticky })
  globe.value?.setTracked(id)
  if (ms) tooltipTimer = setTimeout(hideTooltip, ms)
}

function hideTooltip() {
  clearTimeout(tooltipTimer)
  tooltip.visible = false
  tooltip.sticky = false
  tooltip.id = null
  if (tooltipEl.value) tooltipEl.value.style.opacity = '0'
  globe.value?.setTracked(null)
}

function showBanner(icon, text) {
  clearTimeout(bannerTimer)
  banner.value = { icon, text }
  bannerTimer = setTimeout(() => { banner.value = null }, 3200)
}

const callbacks = {
  onTap(hit) {
    if (!hit) { hideTooltip(); return }
    const { space, locked, previous } = hit
    try { navigator.vibrate?.(locked ? [10, 50, 10] : 12) } catch { /* sem vibração neste aparelho */ }
    if (locked) {
      const text = previous ? `Complete ${previous.nome} para desbloquear` : 'Ainda bloqueado'
      showTooltip({ id: space.id, title: space.nome, text, kind: 'locked', ms: 2800, sticky: true })
      emit('locked', { id: space.id, previousId: previous?.id || null })
    }
    else {
      emit('select', space.id) // imediato; `open-world` vem quando a câmera termina de focar
      showTooltip({ id: space.id, title: space.nome, text: space.concluido ? 'Concluído ★' : 'Abrindo…', kind: 'open', ms: 1800, sticky: true })
    }
  },
  onOpen(space) {
    emit('open-world', space.id)
  },
  onHover(space) {
    if (tooltip.sticky) return
    if (!space) { hideTooltip(); return }
    showTooltip({ id: space.id, title: space.nome, text: statusLabel(space), kind: space.desbloqueado ? 'info' : 'locked' })
  },
  onTrack({ x, y, visible }) {
    const el = tooltipEl.value
    if (!el) return
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    el.style.opacity = visible ? '1' : '0'
  },
  onInteract() {
    if (tooltip.sticky) hideTooltip()
  },
  onCinematic(on) { cinematic.value = on },
  onUnlocked(space) { showBanner('✦', `${space.nome} desbloqueado!`) },
  onCompleted(space) { showBanner('★', `${space.nome} concluído!`) },
  onModel({ id, source }) { modelSources[id] = source },
  onReady() { emit('ready') },
  onStats(s) { if (debugOpen.value) stats.value = s },
}

function onKeydown(e) {
  if (e.key !== 'd' && e.key !== 'D') return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const el = e.target
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
  debugOpen.value = !debugOpen.value
}

onMounted(() => {
  try {
    globe.value = new WorldGlobe(canvas.value, { spaces: spacesState.value, callbacks })
    ready.value = true // a cena já desenha; o evento `ready` sai quando terreno e marcadores estiverem prontos
  }
  catch (e) {
    console.error(e)
    error.value = 'Não foi possível iniciar o 3D neste aparelho (WebGL indisponível).'
  }
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(tooltipTimer)
  clearTimeout(bannerTimer)
  if (window.__buildUWorld === globe.value) delete window.__buildUWorld
  globe.value?.dispose()
  globe.value = null
})

// ---------- Ações (debug e acessibilidade) ----------
function commit(next) {
  localProgress.value = normalizeProgress(next, order.value)
  emit('update:progress', localProgress.value)
}
const debugUnlock = id => commit(unlockSpace(localProgress.value, id, order.value))
const debugComplete = id => commit(completeSpace(localProgress.value, id, order.value))
const debugReset = () => { hideTooltip(); commit(initialProgress(order.value)) }
const debugCompleteCurrent = () => debugComplete(currentId.value)
const debugReplay = id => globe.value?.replayUnlock(id)
const focus = id => globe.value?.focusSpace(id)
const overview = () => globe.value?.resetView()
const activate = id => globe.value?.activate(id)

defineExpose({ focusSpace: focus, resetView: overview })
</script>

<template>
  <div ref="root" class="world-map" :class="{ 'is-cinematic': cinematic }">
    <canvas ref="canvas" class="world-map__canvas" role="img" aria-label="Globo com os oito espaços do BuildU" />

    <div
      ref="tooltipEl"
      class="world-map__tooltip"
      :class="[`is-${tooltip.kind}`, { 'is-visible': tooltip.visible }]"
      role="status"
      aria-live="polite"
    >
      <div class="world-map__tooltip-card">
        <span v-if="tooltip.kind === 'locked'" class="world-map__tooltip-icon" aria-hidden="true">🔒</span>
        <div>
          <strong>{{ tooltip.title }}</strong>
          <span>{{ tooltip.text }}</span>
        </div>
      </div>
    </div>

    <transition name="world-banner">
      <div v-if="banner" class="world-map__banner" role="status">
        <span aria-hidden="true">{{ banner.icon }}</span>{{ banner.text }}
      </div>
    </transition>

    <p v-if="error" class="world-map__error">{{ error }}</p>

    <!-- Alternativa por teclado / leitor de tela aos cliques no 3D. -->
    <ul class="world-map__sr">
      <li v-for="space in spacesState" :key="space.id">
        <button type="button" @click="activate(space.id)">
          {{ space.ordem }}. {{ space.nome }} — {{ space.concluido ? 'concluído' : space.desbloqueado ? 'desbloqueado' : 'bloqueado' }}
        </button>
      </li>
    </ul>

    <transition name="world-debug">
      <aside v-if="debugOpen && ready" class="world-map__debug" aria-label="Debug do mapa-mundo">
        <header>
          <strong>Debug do mapa</strong>
          <span v-if="stats" class="world-map__stats">{{ stats.fps }} fps · {{ stats.calls }} draws · {{ (stats.triangles / 1000).toFixed(1) }}k tris · dpr {{ stats.pixelRatio }}</span>
          <button type="button" class="world-map__close" aria-label="Fechar debug" @click="debugOpen = false">×</button>
        </header>
        <ol>
          <li v-for="space in spacesState" :key="space.id" :class="{ 'is-current': space.id === currentId }">
            <span class="world-map__dot" :style="{ background: space.cor }" />
            <div class="world-map__row-name">
              <span>{{ space.nome }}</span>
              <small>
                {{ space.concluido ? 'concluído' : space.desbloqueado ? 'desbloqueado' : 'bloqueado' }}
                · {{ modelSources[space.id] === 'glb' ? 'GLB' : 'placeholder' }}
              </small>
            </div>
            <div class="world-map__row-actions">
              <button type="button" :disabled="space.desbloqueado" @click="debugUnlock(space.id)">Desbloquear</button>
              <button type="button" :disabled="space.concluido" @click="debugComplete(space.id)">Concluir</button>
              <button type="button" title="Focar a câmera" @click="focus(space.id)">◎</button>
              <button type="button" title="Repetir animação de desbloqueio" :disabled="!space.desbloqueado" @click="debugReplay(space.id)">↻</button>
            </div>
          </li>
        </ol>
        <footer>
          <button type="button" class="is-primary" :disabled="completedCount === spacesState.length" @click="debugCompleteCurrent">Concluir atual</button>
          <button type="button" @click="overview">Visão geral</button>
          <button type="button" class="is-danger" @click="debugReset">Resetar</button>
        </footer>
        <p class="world-map__hint">Tecla D abre/fecha · ?debug=1 na URL</p>
      </aside>
    </transition>
  </div>
</template>

<style scoped>
.world-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 38%, #3b62b0 0%, #233f7f 38%, #13234d 70%, #0b1430 100%);
  color: #f4f7ff;
  font-family: inherit;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.world-map__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

.world-map__tooltip {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease;
  will-change: transform;
  z-index: 3;
}
.world-map__tooltip:not(.is-visible) { visibility: hidden; }
.world-map__tooltip-card {
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translate(-50%, calc(-100% - 12px));
  padding: 8px 14px;
  border-radius: 14px;
  background: rgba(12, 22, 52, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 10px 30px rgba(4, 10, 30, 0.35);
  backdrop-filter: blur(8px);
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.25;
}
.world-map__tooltip-card::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 12px;
  height: 12px;
  transform: translateX(-50%) rotate(45deg);
  background: inherit;
  border-right: inherit;
  border-bottom: inherit;
}
.world-map__tooltip-card div { display: grid; }
.world-map__tooltip-card strong { font-size: 14px; font-weight: 700; }
.world-map__tooltip-card span { opacity: 0.85; }
.world-map__tooltip.is-locked .world-map__tooltip-card { border-color: rgba(255, 196, 120, 0.45); }
.world-map__tooltip.is-open .world-map__tooltip-card { border-color: rgba(120, 240, 210, 0.5); }
.world-map__tooltip-icon { font-size: 16px; }

.world-map__banner {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 18px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 214, 102, 0.95), rgba(255, 158, 122, 0.95));
  color: #3a2208;
  font-weight: 700;
  box-shadow: 0 12px 30px rgba(255, 170, 80, 0.35);
  z-index: 4;
  pointer-events: none;
}
.world-banner-enter-active, .world-banner-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.world-banner-enter-from, .world-banner-leave-to { opacity: 0; transform: translate(-50%, -12px); }

.world-map__error {
  position: absolute;
  inset: auto 16px 16px;
  margin: 0;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(120, 20, 40, 0.85);
}

.world-map__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  list-style: none;
}
.world-map__sr:focus-within {
  width: auto;
  height: auto;
  margin: 0;
  clip: auto;
  left: 16px;
  bottom: 16px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(12, 22, 52, 0.9);
  z-index: 5;
}
.world-map__sr button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 8px;
  color: inherit;
  background: none;
  border: 0;
  font: inherit;
}
.world-map__sr button:focus-visible { outline: 2px solid #ffd166; border-radius: 6px; }

.world-map__debug {
  position: absolute;
  top: 12px;
  right: 12px;
  width: min(380px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  overflow: auto;
  padding: 12px;
  border-radius: 16px;
  background: rgba(10, 18, 44, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  font-size: 12px;
  z-index: 6;
  user-select: text;
}
.world-map__debug header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.world-map__debug header strong { font-size: 13px; }
.world-map__stats { opacity: 0.7; font-variant-numeric: tabular-nums; }
.world-map__close { margin-left: auto; }
.world-map__debug ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.world-map__debug li {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}
.world-map__debug li.is-current { background: rgba(255, 214, 102, 0.12); }
.world-map__dot { width: 10px; height: 10px; border-radius: 50%; }
.world-map__row-name { display: grid; min-width: 0; }
.world-map__row-name span { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.world-map__row-name small { opacity: 0.65; }
.world-map__row-actions { display: flex; gap: 4px; }
.world-map__debug button {
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.world-map__debug button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
.world-map__debug button:disabled { opacity: 0.35; cursor: default; }
.world-map__debug button.is-primary { background: #ffd166; color: #2b1d00; border-color: transparent; font-weight: 700; }
.world-map__debug button.is-danger { color: #ff9aa5; }
.world-map__debug footer { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.world-map__hint { margin: 8px 0 0; opacity: 0.55; }
.world-debug-enter-active, .world-debug-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.world-debug-enter-from, .world-debug-leave-to { opacity: 0; transform: translateY(-8px); }

@media (max-width: 560px) {
  .world-map__debug {
    top: auto;
    bottom: 8px;
    right: 8px;
    left: 8px;
    width: auto;
    max-height: 55%;
  }
  .world-map__row-actions button { padding: 5px 6px; }
}
</style>
