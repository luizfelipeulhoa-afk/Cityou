<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadWorldProgress, travelTo } from '@/fifones/api.js'
import WorldMap from '@/components/WorldMap.vue'
import { WORLD_SPACES } from '@/world/worldSpaces.js'
import { applyProgress, completeSpace, currentSpaceId, loadProgress, mergeProgress, saveProgress } from '@/world/progress.js'
import { createProgressSync, hasLocalBackend } from '@/world/progressSync.js'

const progress = ref(loadProgress())
const mode = ref('loading')
const syncStatus = ref('local')
const availableTrips = ref(0)
const travelOpen = ref(true)
const visitError = ref('')
const visiting = ref(false)
const listOpen = ref(false)
const selectedId = ref(null)
const map = ref(null)
const destinationDialog = ref(null)
let sync

function acceptRegionalProgress(value) {
  mode.value = 'regional'
  progress.value = value
  availableTrips.value = value.viagens_disponiveis
  travelOpen.value = value.viagens_abertas !== false
  syncStatus.value = 'sincronizado'
}

async function loadMap() {
  visitError.value = ''
  try {
    const saved = await loadWorldProgress()
    if (Number.isInteger(saved.viagens_disponiveis)) {
      acceptRegionalProgress(saved)
      return
    }
    progress.value = mergeProgress(progress.value, saved)
  } catch (error) {
    if (!hasLocalBackend() || (error.status && error.status !== 404)) {
      mode.value = 'offline'
      syncStatus.value = 'offline'
      visitError.value = 'Não foi possível carregar o progresso. Tente novamente.'
      return
    }
  }

  mode.value = 'legacy'
  if (hasLocalBackend() && !sync) {
    sync = createProgressSync({
      getProgress: () => progress.value,
      applyProgress: (merged) => { progress.value = merged },
      onStatus: (status) => { syncStatus.value = status },
    })
    sync.start()
  }
}

watch(progress, p => {
  if (mode.value !== 'legacy') return
  saveProgress(p)
  sync?.push()
}, { deep: true })
const onPageHide = () => sync?.flushOnExit()
onMounted(() => { void loadMap(); window.addEventListener('pagehide', onPageHide) })
onBeforeUnmount(() => { window.removeEventListener('pagehide', onPageHide); sync?.stop() })

const spaces = computed(() => applyProgress(WORLD_SPACES, progress.value))
const done = computed(() => spaces.value.filter(s => s.concluido).length)
const finished = computed(() => done.value === spaces.value.length)
const current = computed(() => spaces.value.find(s => s.id === currentSpaceId(progress.value)))
const selected = computed(() => spaces.value.find(space => space.id === selectedId.value))
watch(selectedId, async id => {
  if (!id) return
  await nextTick()
  destinationDialog.value?.focus()
})
const syncLabel = computed(() => ({
  sincronizado: 'Progresso salvo',
  sincronizando: 'Salvando o progresso…',
  offline: 'Sem conexão com o servidor',
}[syncStatus.value] || ''))

// Dica de primeiro uso: some no primeiro gesto e não volta nesta sessão.
const HINT_KEY = 'buildu:world-hint-seen'
function hintSeen() {
  try { return sessionStorage.getItem(HINT_KEY) === '1' }
  catch { return false }
}
const showHint = ref(!hintSeen())
function dismissHint() {
  if (!showHint.value) return
  showHint.value = false
  try { sessionStorage.setItem(HINT_KEY, '1') }
  catch { /* sem sessionStorage: a dica volta na próxima visita */ }
}

function enterCity(id) {
  visiting.value = true
  const url = new URL('./city.html', window.location.href)
  url.searchParams.set('local', id)
  window.location.assign(url)
}

function onOpen(id) {
  if (visiting.value) return
  const space = spaces.value.find(item => item.id === id && item.desbloqueado)
  if (!space) return
  if (mode.value === 'regional') enterCity(id)
  if (mode.value === 'legacy') selectedId.value = id
}

function onLocked({ id }) {
  if (mode.value === 'regional' && !visiting.value) selectedId.value = id
}

async function chooseDestination() {
  const destination = selected.value
  if (!destination || visiting.value || availableTrips.value < 1) return
  visiting.value = true
  visitError.value = ''
  try {
    acceptRegionalProgress(await travelTo(destination.id))
    enterCity(destination.id)
  } catch (error) {
    if (error.status === 409) {
      try { acceptRegionalProgress(await loadWorldProgress()) } catch { /* Keep the last confirmed state. */ }
    }
    visitError.value = error.message
    visiting.value = false
  }
}

function completeSelected() {
  progress.value = completeSpace(progress.value, selectedId.value)
  selectedId.value = null
}

function goTo(space) {
  listOpen.value = false
  dismissHint()
  if (mode.value === 'regional') {
    if (space.desbloqueado) onOpen(space.id)
    else onLocked({ id: space.id })
    return
  }
  if (space.desbloqueado) map.value?.activateSpace(space.id)
  else map.value?.focusSpace(space.id).then(() => map.value?.activateSpace(space.id))
}

function toggleList() {
  listOpen.value = !listOpen.value
  dismissHint()
}

function stateLabel(space) {
  if (space.concluido) return 'concluído'
  if (space.desbloqueado) return 'disponível'
  return availableTrips.value > 0 ? 'pode abrir' : 'bloqueado'
}
</script>

<template>
  <main class="world-app">
    <WorldMap ref="map" :progress="progress" :regional="mode === 'regional'" class="world-app__map" @open-world="onOpen" @locked="onLocked" @update:progress="mode === 'legacy' && (progress = $event)" @interact="dismissHint" @select="dismissHint" />

    <header class="world-app__hud">
      <div class="world-app__brand">
        <span class="world-app__logo" aria-hidden="true">B</span>
        <div>
          <strong>BuildU</strong>
          <small>Mapa-mundo</small>
        </div>
      </div>
      <div class="world-app__progress" role="img" :aria-label="`${done} de ${spaces.length} espaços concluídos. ${syncLabel}`">
        <span
          v-for="space in spaces"
          :key="space.id"
          class="world-app__pip"
          :class="{ 'is-open': space.desbloqueado, 'is-done': space.concluido }"
          :style="{ '--pip': space.cor }"
        />
        <b>{{ done }}/{{ spaces.length }}</b>
        <span v-if="syncLabel" class="world-app__sync" :class="`is-${syncStatus}`" :title="syncLabel" />
      </div>
    </header>

    <div v-if="!selected" class="world-app__dock">
      <p v-if="visitError" class="world-app__hint" role="alert">{{ visitError }}</p>
      <button v-if="mode === 'offline'" type="button" class="world-app__go" @click="loadMap">Tentar novamente</button>
      <transition name="fade">
        <p v-if="showHint" class="world-app__hint">Arraste para girar · pinça ou roda para aproximar</p>
      </transition>

      <transition name="sheet">
        <nav v-if="listOpen" id="world-spaces" class="world-app__list" aria-label="Espaços do mapa">
          <button v-for="space in spaces" :key="space.id" type="button" :class="{ 'is-concluído': space.concluido, 'is-bloqueado': !space.desbloqueado && !availableTrips }" @click="goTo(space)">
            <span class="world-app__badge" :style="{ '--pip': space.cor }" aria-hidden="true">{{ space.concluido ? '★' : space.desbloqueado ? space.ordem : '🔒' }}</span>
            <span class="world-app__list-name">{{ space.nome }}<small>{{ space.local }}</small></span>
            <span class="world-app__list-state">{{ stateLabel(space) }}</span>
          </button>
        </nav>
      </transition>

      <div class="world-app__objective">
        <button type="button" class="world-app__menu" :aria-expanded="listOpen" aria-controls="world-spaces" aria-label="Lista de espaços" @click="toggleList">
          <span aria-hidden="true">☰</span>
        </button>
        <div v-if="mode === 'regional'" class="world-app__goal">
          <small>{{ spaces.filter(space => space.desbloqueado).length }} de {{ spaces.length }} cidades abertas</small>
          <strong>{{ !travelOpen ? 'Desenvolva sua cidade' : availableTrips ? 'Escolha um novo destino' : 'Visite uma cidade' }}</strong>
        </div>
        <div v-else-if="finished" class="world-app__goal">
          <small>Jornada completa</small>
          <strong>Os 8 espaços foram concluídos ★</strong>
        </div>
        <template v-else-if="current">
          <div class="world-app__goal">
            <small>{{ current.concluido ? 'Último espaço' : 'Próximo destino' }}</small>
            <strong>{{ current.nome }}</strong>
          </div>
          <button type="button" class="world-app__go" @click="goTo(current)">Ir</button>
        </template>
      </div>
    </div>

    <transition name="sheet">
      <section v-if="selected" ref="destinationDialog" tabindex="-1" class="world-app__sheet" role="dialog" :aria-label="selected.nome" @keydown.esc="selectedId = null">
        <h1>{{ selected.nome }}</h1>
        <p class="world-app__place">{{ selected.local }}</p>
        <p v-if="mode === 'legacy'">{{ selected.descricao }}</p>
        <p v-else-if="!selected.desbloqueado">{{ !travelOpen ? 'As viagens ainda não estão abertas. Por enquanto, desenvolva a cidade onde você está.' : availableTrips ? 'Use uma viagem disponível para abrir sua cidade aqui.' : 'Construa seu primeiro prédio em uma cidade aberta para ganhar uma viagem.' }}</p>
        <p v-if="visitError" role="alert">{{ visitError }}</p>
        <div class="world-app__actions">
          <button v-if="mode === 'regional' && selected.desbloqueado" type="button" class="is-primary" @click="enterCity(selected.id)">Entrar na cidade</button>
          <button v-else-if="mode === 'regional' && availableTrips" type="button" class="is-primary" :disabled="visiting" @click="chooseDestination">{{ visiting ? 'Abrindo…' : 'Abrir cidade' }}</button>
          <button v-else-if="mode === 'legacy' && !selected.concluido" type="button" class="is-primary" @click="completeSelected">Concluir fase (simulação)</button>
          <button type="button" :disabled="visiting" @click="selectedId = null">Voltar ao mapa</button>
        </div>
      </section>
    </transition>
  </main>
</template>

<style>
html, body, #app { height: 100%; margin: 0; }
body {
  background: #0b1430;
  font-family: 'Figtree', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  overscroll-behavior: none;
}
@font-face {
  font-family: 'Figtree';
  src: url('/fonts/fifones-body.woff2') format('woff2');
  font-display: swap;
}
</style>

<style scoped>
.world-app {
  position: fixed;
  inset: 0;
  color: #f4f7ff;
}
.world-app__map { position: absolute; inset: 0; }
.world-app button { font: inherit; color: inherit; cursor: pointer; }
.world-app button:focus-visible { outline: 2px solid #ffd166; outline-offset: 2px; }

.world-app__hud {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  left: max(16px, env(safe-area-inset-left));
  right: max(16px, env(safe-area-inset-right));
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}
.world-app__brand { display: flex; align-items: center; gap: 10px; }
.world-app__brand div { display: grid; line-height: 1.1; }
.world-app__brand strong { font-size: 18px; letter-spacing: 0.01em; }
.world-app__brand small { opacity: 0.75; }
.world-app__logo {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: linear-gradient(135deg, #36e2c8, #7cc7ff 55%, #b48cff);
  color: #0b1430;
  font-weight: 800;
  box-shadow: 0 6px 18px rgba(54, 226, 200, 0.35);
}
.world-app__progress {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(10, 18, 44, 0.66);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
}
.world-app__progress b { margin-left: 4px; font-size: 13px; font-variant-numeric: tabular-nums; }
.world-app__pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  transition: background 0.4s ease, box-shadow 0.4s ease, transform 0.4s ease;
}
.world-app__pip.is-open { background: var(--pip); box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15); }
.world-app__pip.is-done { background: #ffd166; transform: scale(1.15); box-shadow: 0 0 10px rgba(255, 209, 102, 0.7); }
.world-app__sync { width: 7px; height: 7px; margin-left: 4px; border-radius: 50%; background: #6ee7a8; pointer-events: auto; }
.world-app__sync.is-sincronizando { background: #7cc7ff; }
.world-app__sync.is-offline { background: #ffb347; }

/* Objetivo, lista e dica ficam juntos embaixo, ao alcance do polegar. */
.world-app__dock {
  position: absolute;
  left: 50%;
  bottom: max(14px, env(safe-area-inset-bottom));
  width: min(420px, calc(100% - 24px));
  transform: translateX(-50%);
  display: grid;
  gap: 8px;
  justify-items: center;
  pointer-events: none;
}
.world-app__dock > * { pointer-events: auto; }
.world-app__hint {
  margin: 0;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(10, 18, 44, 0.6);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.world-app__objective {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  min-height: 56px;
  padding: 6px;
  border-radius: 18px;
  background: rgba(10, 18, 44, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}
.world-app__menu, .world-app__go {
  flex: none;
  min-width: 44px;
  height: 44px;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  font-size: 16px;
}
.world-app button.world-app__go { padding: 0 18px; background: #ffd166; border-color: transparent; color: #2b1d00; font-weight: 700; }
.world-app__goal { display: grid; min-width: 0; flex: 1; line-height: 1.2; }
.world-app__goal small { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
.world-app__goal strong { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.world-app__list {
  width: 100%;
  box-sizing: border-box;
  max-height: min(52vh, 420px);
  overflow: auto;
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 18px;
  background: rgba(10, 18, 44, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
}
.world-app__list button {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 10px;
  border: 0;
  border-radius: 12px;
  background: none;
  text-align: left;
}
.world-app__list button:hover { background: rgba(255, 255, 255, 0.08); }
.world-app__badge {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--pip);
  color: #0b1430;
  font-size: 13px;
  font-weight: 800;
}
.is-concluído .world-app__badge { background: #ffd166; }
.is-bloqueado .world-app__badge { background: rgba(255, 255, 255, 0.12); font-size: 12px; }
.world-app__list-name { display: grid; min-width: 0; font-weight: 600; }
.world-app__list-name small { font-weight: 400; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.world-app__list-state { font-size: 12px; opacity: 0.75; }
.is-bloqueado .world-app__list-name { opacity: 0.7; }

.world-app__sheet {
  position: absolute;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  width: min(440px, calc(100% - 24px));
  box-sizing: border-box;
  transform: translateX(-50%);
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(10, 18, 44, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  z-index: 10;
}
.world-app__sheet h1 { margin: 2px 0 2px; font-size: 22px; }
.world-app__sheet p { margin: 6px 0; opacity: 0.9; }
.world-app__sheet .world-app__place { font-size: 13px; opacity: 0.7; }
.world-app__actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; align-items: center; }
.world-app__actions button {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  font-weight: 600;
}
.world-app__actions button.is-primary { background: #ffd166; color: #2b1d00; border-color: transparent; }

.sheet-enter-active, .sheet-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; transform: translateY(12px); }
.world-app__sheet.sheet-enter-from, .world-app__sheet.sheet-leave-to { transform: translate(-50%, 12px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 560px) {
  .world-app__brand small { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active, .sheet-leave-active, .fade-enter-active, .fade-leave-active, .world-app__pip { transition: none; }
}
</style>
