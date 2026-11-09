<script setup>
import { computed, ref, watch } from 'vue'
import WorldMap from '@/components/WorldMap.vue'
import { WORLD_SPACES, findSpace } from '@/world/worldSpaces.js'
import { applyProgress, completeSpace, loadProgress, saveProgress } from '@/world/progress.js'

// Página de demonstração: o progresso vive aqui (localStorage) e desce por props.
// Num app real, troque loadProgress/saveProgress pela API do backend.
const progress = ref(loadProgress())
watch(progress, p => saveProgress(p), { deep: true })

const spaces = computed(() => applyProgress(WORLD_SPACES, progress.value))
const done = computed(() => spaces.value.filter(s => s.concluido).length)
const opened = ref(null)
const openedSpace = computed(() => opened.value && spaces.value.find(s => s.id === opened.value))

function onOpen(id) {
  opened.value = findSpace(id) ? id : null
}

function completeOpened() {
  const id = opened.value
  opened.value = null
  progress.value = completeSpace(progress.value, id)
}
</script>

<template>
  <main class="world-app">
    <WorldMap v-model:progress="progress" class="world-app__map" @open-world="onOpen" />

    <header class="world-app__hud">
      <div class="world-app__brand">
        <span class="world-app__logo" aria-hidden="true">B</span>
        <div>
          <strong>BuildU</strong>
          <small>Mapa-mundo</small>
        </div>
      </div>
      <div class="world-app__progress" :aria-label="`${done} de ${spaces.length} espaços concluídos`">
        <span
          v-for="space in spaces"
          :key="space.id"
          class="world-app__pip"
          :class="{ 'is-open': space.desbloqueado, 'is-done': space.concluido }"
          :style="{ '--pip': space.cor }"
          :title="space.nome"
        />
        <b>{{ done }}/{{ spaces.length }}</b>
      </div>
    </header>

    <p class="world-app__hint">Arraste para girar · pinça ou roda para zoom · toque num espaço</p>

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

.world-app__hud {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}
.world-app__brand { display: flex; align-items: center; gap: 10px; }
.world-app__brand div { display: grid; line-height: 1.1; }
.world-app__brand strong { font-size: 18px; letter-spacing: 0.01em; }
.world-app__brand small { opacity: 0.7; }
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
  background: rgba(10, 18, 44, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
}
.world-app__progress b { margin-left: 4px; font-size: 13px; font-variant-numeric: tabular-nums; }
.world-app__pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  transition: background 0.4s ease, box-shadow 0.4s ease, transform 0.4s ease;
}
.world-app__pip.is-open { background: var(--pip); box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15); }
.world-app__pip.is-done { background: #ffd166; transform: scale(1.15); box-shadow: 0 0 10px rgba(255, 209, 102, 0.7); }

.world-app__hint {
  position: absolute;
  left: 50%;
  bottom: max(14px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  margin: 0;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(10, 18, 44, 0.45);
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
  pointer-events: none;
}

.world-app__sheet {
  position: absolute;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  width: min(440px, calc(100% - 32px));
  transform: translateX(-50%);
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(10, 18, 44, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  z-index: 10;
}
.world-app__sheet h1 { margin: 2px 0 2px; font-size: 22px; }
.world-app__sheet p { margin: 6px 0; opacity: 0.85; }
.world-app__kicker { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.world-app__place { font-size: 13px; opacity: 0.65 !important; }
.world-app__actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; align-items: center; }
.world-app__actions button {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.world-app__actions button.is-primary { background: #ffd166; color: #2b1d00; border-color: transparent; }
.world-app__done { color: #ffd166; font-weight: 700; margin-right: 6px; }
.sheet-enter-active, .sheet-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; transform: translate(-50%, 16px); }

@media (max-width: 560px) {
  .world-app__brand small { display: none; }
  .world-app__hint { font-size: 11px; }
}
</style>
