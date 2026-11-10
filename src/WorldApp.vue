<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorldMap from '@/components/WorldMap.vue'
import { WORLD_SPACES, findSpace } from '@/world/worldSpaces.js'
import { applyProgress, completeSpace, currentSpaceId, loadProgress, saveProgress } from '@/world/progress.js'
import { createProgressSync, hasLocalBackend } from '@/world/progressSync.js'

// O progresso vive aqui e desce por props. A tela usa o localStorage na hora;
// a cópia no backend (FastAPI) é sincronizada em segundo plano e nunca bloqueia.
// O backend só aceita acesso local, então no site publicado não há sincronização (nem requisições).
const progress = ref(loadProgress())
const syncStatus = ref('local')
const sync = hasLocalBackend()
  ? createProgressSync({
      getProgress: () => progress.value,
      applyProgress: (merged) => { progress.value = merged },
      onStatus: (status) => { syncStatus.value = status },
    })
  : null
watch(progress, (p) => { saveProgress(p); sync?.push() }, { deep: true })
const onPageHide = () => sync?.flushOnExit()
onMounted(() => { sync?.start(); window.addEventListener('pagehide', onPageHide) })
onBeforeUnmount(() => { window.removeEventListener('pagehide', onPageHide); sync?.stop() })

const map = ref(null)
const spaces = computed(() => applyProgress(WORLD_SPACES, progress.value))
const done = computed(() => spaces.value.filter(s => s.concluido).length)
const finished = computed(() => done.value === spaces.value.length)
const current = computed(() => spaces.value.find(s => s.id === currentSpaceId(progress.value)))
const opened = ref(null)
const openedSpace = computed(() => opened.value && spaces.value.find(s => s.id === opened.value))
const listOpen = ref(false)
const syncLabel = computed(() => ({
  sincronizado: 'Progresso salvo neste computador',
  sincronizando: 'Salvando o progresso…',
  offline: 'Sem conexão com o servidor: o progresso está salvo neste navegador',
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

function onOpen(id) {
  listOpen.value = false
  opened.value = findSpace(id) ? id : null
}

function completeOpened() {
  const id = opened.value
  opened.value = null
  progress.value = completeSpace(progress.value, id)
}

function goTo(space) {
  listOpen.value = false
  dismissHint()
  // Desbloqueado: foca e abre. Bloqueado: leva a câmera até lá e mostra o que falta.
  if (space.desbloqueado) map.value?.activateSpace(space.id)
  else map.value?.focusSpace(space.id).then(() => map.value?.activateSpace(space.id))
}

function toggleList() {
  listOpen.value = !listOpen.value
  dismissHint()
}

const stateLabel = space => (space.concluido ? 'concluído' : space.desbloqueado ? 'disponível' : 'bloqueado')
</script>

<template>
  <main class="world-app">
    <WorldMap ref="map" v-model:progress="progress" class="world-app__map" @open-world="onOpen" @interact="dismissHint" @select="dismissHint" />

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

    <div v-if="!openedSpace" class="world-app__dock">
      <transition name="fade">
        <p v-if="showHint" class="world-app__hint">Arraste para girar · pinça ou roda para aproximar</p>
      </transition>

      <transition name="sheet">
        <nav v-if="listOpen" id="world-spaces" class="world-app__list" aria-label="Espaços do mapa">
          <button v-for="space in spaces" :key="space.id" type="button" :class="`is-${stateLabel(space)}`" @click="goTo(space)">
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
        <div v-if="finished" class="world-app__goal">
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
      <section v-if="openedSpace" class="world-app__sheet" role="dialog" aria-modal="false" :aria-label="openedSpace.nome">
        <span class="world-app__kicker" :style="{ color: openedSpace.cor }">Espaço {{ openedSpace.ordem }} de {{ spaces.length }}</span>
        <h1>{{ openedSpace.nome }}</h1>
        <p class="world-app__place">{{ openedSpace.local }}</p>
        <p>{{ openedSpace.descricao }}</p>
        <div class="world-app__actions">
          <button v-if="!openedSpace.concluido" type="button" class="is-primary" @click="completeOpened">Concluir fase (simulação)</button>
          <span v-else class="world-app__done">★ Concluído</span>
          <button type="button" @click="opened = null">Voltar ao mapa</button>
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
.world-app__kicker { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
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
.world-app__done { color: #ffd166; font-weight: 700; margin-right: 6px; }

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
