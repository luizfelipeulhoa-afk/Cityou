<script setup>
// Ajudas de navegação do mapa-mundo, desenhadas por cima do canvas:
// - o destino: uma etiqueta sobre o marcador quando ele está à vista, ou uma seta presa à borda
//   apontando para onde ele está (atrás do globo, fora da tela);
// - os controles da câmera (aproximar, afastar, voltar à visão geral);
// - o aviso de carga dos modelos.
// A posição do destino muda a cada quadro, então chega por `track()` e vai direto para o DOM
// (só `transform`, sem estado reativo e sem layout). O resto é estado comum, por props.
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps({
  /** Espaço em destaque: { id, nome, cor }. */
  goal: { type: Object, default: null },
  /** A câmera saiu da visão inicial: mostra o botão de voltar. */
  away: Boolean,
  /** Progresso da carga dos modelos, { loaded, total }, ou null quando não há carga. */
  loading: { type: Object, default: null },
  /** Esconde a etiqueta (por exemplo, quando o tooltip do mesmo espaço está aberto). */
  labelHidden: Boolean,
  /** Esconde tudo durante uma animação de desbloqueio ou conclusão. */
  quiet: Boolean,
  /** Botões de zoom: úteis com mouse; no toque, a pinça já resolve. */
  zoomButtons: Boolean,
})
const emit = defineEmits(['focus-goal', 'recenter', 'zoom'])

const labelEl = useTemplateRef('label')
const pointerEl = useTemplateRef('pointer')
const arrowEl = useTemplateRef('arrow')
const mode = shallowRef('hidden') // 'label' | 'pointer' | 'hidden'
let lastPlace = ''
let lastAngle = ''

/** Chamado pelo globo a cada quadro com { mode, x, y, angle }. */
function track(info) {
  if (info.mode !== mode.value) { mode.value = info.mode; lastPlace = '' }
  const el = info.mode === 'label' ? labelEl.value : info.mode === 'pointer' ? pointerEl.value : null
  if (!el) return
  const place = `translate3d(${info.x.toFixed(1)}px, ${info.y.toFixed(1)}px, 0)`
  if (place !== lastPlace) { el.style.transform = place; lastPlace = place }
  if (info.mode !== 'pointer' || !arrowEl.value) return
  const angle = `rotate(${info.angle.toFixed(2)}rad)`
  if (angle !== lastAngle) { arrowEl.value.style.transform = angle; lastAngle = angle }
}
defineExpose({ track })

const accent = computed(() => ({ '--accent': props.goal?.cor || '#ffd166' }))

// O aviso de carga só aparece se a espera passar de 400 ms: carga do cache não pisca na tela.
const loadingShown = shallowRef(false)
let loadingTimer = null
watch(() => !!props.loading, (busy) => {
  clearTimeout(loadingTimer)
  if (busy) loadingTimer = setTimeout(() => { loadingShown.value = true }, 400)
  else loadingShown.value = false
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(loadingTimer))
const loadedFraction = computed(() => {
  const { loaded = 0, total = 0 } = props.loading || {}
  return total > 0 ? Math.min(1, Math.max(0.04, loaded / total)) : 0.04
})
</script>

<template>
  <div class="world-hud" :class="{ 'is-quiet': quiet }" :style="accent">
    <div ref="label" class="world-hud__label" :class="{ 'is-on': goal && mode === 'label' && !labelHidden }" aria-hidden="true">
      <span class="world-hud__tag">{{ goal?.nome }}</span>
    </div>

    <div ref="pointer" class="world-hud__pointer" :class="{ 'is-on': goal && mode === 'pointer' }">
      <button type="button" :tabindex="goal && mode === 'pointer' ? 0 : -1" :aria-label="`Girar o globo até ${goal?.nome}`" @click="emit('focus-goal')">
        <span ref="arrow" class="world-hud__arrow" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="20" height="20"><path d="M4 3.5 17 10 4 16.5 7.2 10z" /></svg>
        </span>
        <span class="world-hud__pointer-name">{{ goal?.nome }}</span>
      </button>
    </div>

    <div class="world-hud__controls" role="group" aria-label="Câmera do mapa">
      <template v-if="zoomButtons">
        <button type="button" aria-label="Aproximar" title="Aproximar (+)" @click="emit('zoom', 0.78)">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
        </button>
        <button type="button" aria-label="Afastar" title="Afastar (−)" @click="emit('zoom', 1.28)">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10h12" /></svg>
        </button>
      </template>
      <transition name="world-hud-pop">
        <button v-if="away" type="button" class="world-hud__home" aria-label="Voltar à visão geral" title="Visão geral (0)" @click="emit('recenter')">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="10" cy="10" r="5.2" /><path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" /><circle class="is-dot" cx="10" cy="10" r="1.6" />
          </svg>
        </button>
      </transition>
    </div>

    <transition name="world-hud-fade">
      <div v-if="loadingShown" class="world-hud__loading" role="status">
        <span>Carregando monumentos</span>
        <span class="world-hud__meter" aria-hidden="true"><i :style="{ transform: `scaleX(${loadedFraction})` }" /></span>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.world-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.2s ease;
  --ink: #f4f7ff;
  --plate: rgba(11, 20, 48, 0.9);
  --edge: rgba(255, 255, 255, 0.16);
}
.world-hud.is-quiet { opacity: 0; }
.world-hud.is-quiet * { pointer-events: none !important; }
.world-hud button { font: inherit; color: var(--ink); cursor: pointer; }
.world-hud button:focus-visible { outline: 2px solid #ffd166; outline-offset: 2px; }

/* Etiqueta do destino: uma plaqueta ao pé do marcador (não cobre o monumento, a estrela nem o cadeado). */
.world-hud__label, .world-hud__pointer {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  visibility: hidden;
  will-change: transform;
  transition: opacity 0.16s ease-out, visibility 0s linear 0.16s;
}
.world-hud__label.is-on, .world-hud__pointer.is-on { opacity: 1; visibility: visible; transition-delay: 0s; }
.world-hud__tag {
  position: absolute;
  left: 0;
  top: 2px;
  transform: translateX(-50%);
  padding: 4px 10px 5px;
  border-radius: 8px;
  background: var(--plate);
  border: 1px solid var(--edge);
  border-top: 2px solid var(--accent);
  color: var(--ink);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(4, 10, 30, 0.35);
}
/* Seta de borda: aponta para onde o destino está e leva até lá. */
.world-hud__pointer button {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  max-width: 172px;
  padding: 0 14px 0 8px;
  border-radius: 12px;
  border: 1px solid var(--edge);
  border-left: 3px solid var(--accent);
  background: var(--plate);
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(4, 10, 30, 0.4);
  pointer-events: auto;
  transition: transform 0.16s ease-out, background 0.16s ease;
}
.world-hud__pointer:not(.is-on) button { pointer-events: none; }
.world-hud__pointer button:active { transform: translate(-50%, -50%) scale(0.97); }
.world-hud__pointer-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.world-hud__arrow { flex: none; display: grid; place-items: center; width: 24px; height: 24px; }
.world-hud__arrow svg { fill: var(--accent); animation: world-hud-nudge 1.4s ease-in-out infinite; }
@keyframes world-hud-nudge {
  0%, 100% { transform: translateX(-1px); }
  50% { transform: translateX(3px); }
}

/* Controles da câmera: coluna no canto, acima da barra do objetivo. */
.world-hud__controls {
  position: absolute;
  right: max(12px, env(safe-area-inset-right));
  bottom: calc(max(14px, env(safe-area-inset-bottom)) + var(--world-map-dock, 72px));
  display: grid;
  gap: 6px;
  justify-items: end;
}
.world-hud__controls button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 13px;
  border: 1px solid var(--edge);
  background: var(--plate);
  box-shadow: 0 8px 20px rgba(4, 10, 30, 0.35);
  pointer-events: auto;
  transition: transform 0.14s ease-out, background 0.14s ease;
}
.world-hud__controls button:active { transform: scale(0.94); }
.world-hud__controls svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.world-hud__controls svg .is-dot { fill: currentColor; stroke: none; }
.world-hud__controls .world-hud__home { color: #ffd166; }
.world-hud-pop-enter-active, .world-hud-pop-leave-active { transition: opacity 0.18s ease-out, transform 0.18s ease-out; }
.world-hud-pop-enter-from, .world-hud-pop-leave-to { opacity: 0; transform: scale(0.9); }

/* Carga dos modelos: discreta, no topo, com uma barra que enche pelo peso dos arquivos. */
.world-hud__loading {
  position: absolute;
  top: calc(max(14px, env(safe-area-inset-top)) + 52px);
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  gap: 5px;
  padding: 7px 12px 8px;
  border-radius: 10px;
  background: var(--plate);
  border: 1px solid var(--edge);
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.world-hud__meter { display: block; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.14); overflow: hidden; }
.world-hud__meter i {
  display: block;
  height: 100%;
  background: #ffd166;
  transform-origin: left center;
  transition: transform 0.3s ease-out;
}
.world-hud-fade-enter-active, .world-hud-fade-leave-active { transition: opacity 0.25s ease; }
.world-hud-fade-enter-from, .world-hud-fade-leave-to { opacity: 0; }

@media (hover: hover) {
  .world-hud__controls button:hover, .world-hud__pointer button:hover { background: rgba(26, 40, 84, 0.96); }
}
@media (prefers-reduced-motion: reduce) {
  .world-hud, .world-hud__label, .world-hud__pointer, .world-hud__controls button, .world-hud__pointer button, .world-hud__meter i { transition: none; }
  .world-hud__arrow svg { animation: none; }
  .world-hud-pop-enter-active, .world-hud-pop-leave-active, .world-hud-fade-enter-active, .world-hud-fade-leave-active { transition: none; }
}
</style>
