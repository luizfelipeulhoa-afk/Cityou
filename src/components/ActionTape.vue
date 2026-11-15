<script setup>
// Fita do Tempo (docs/PLANO-PROXIMOS-PASSOS.md, etapa 8): os cartões das ações recentes da cidade, no topo.
// A fita chega do servidor, da mais nova para a mais antiga. Desfazer vai no cartão feito mais novo; refazer, no
// cartão desfeito mais antigo (o que fica logo acima do primeiro feito). Os alvos são calculados sobre a fita inteira,
// como no servidor; a janela de 120 s só decide o que aparece, então um botão nunca fica num cartão que seria recusado.
// Sem contador na tela (decisão do dono).
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  tape: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['undo', 'redo'])

const WINDOW_MS = 120_000
const now = ref(Date.now())
let timer = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 5000) })
onUnmounted(() => { clearInterval(timer); timer = null })

const undoId = computed(() => props.tape.find(entry => entry.state === 'done')?.action_id ?? null)
const redoId = computed(() => props.tape.findLast(entry => entry.state === 'undone')?.action_id ?? null)
const shown = computed(() => props.tape.filter(entry => now.value - entry.at <= WINDOW_MS))

function amountText(amount) {
  const value = Number(amount || 0)
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return sign + Math.abs(value).toLocaleString('pt-BR')
}
</script>

<template>
  <ol v-if="shown.length" class="action-tape" aria-label="Ações recentes">
    <li v-for="entry in shown" :key="entry.action_id" class="tape-card" :class="entry.state">
      <span class="tape-text"><span class="tape-label">{{ entry.label }}</span> <span class="tape-amount" :class="{ negative: entry.amount < 0 }">{{ amountText(entry.amount) }}</span></span>
      <button
        v-if="entry.state === 'done' && entry.action_id === undoId"
        type="button"
        class="tape-button"
        :aria-label="`Desfazer: ${entry.label}`"
        :disabled="busy"
        @click="emit('undo', entry.action_id)"
      >Desfazer</button>
      <button
        v-else-if="entry.state === 'undone' && entry.action_id === redoId"
        type="button"
        class="tape-button"
        :aria-label="`Refazer: ${entry.label}`"
        :disabled="busy"
        @click="emit('redo', entry.action_id)"
      >Refazer</button>
    </li>
  </ol>
</template>

<style scoped>
.action-tape {
  position: absolute;
  z-index: 4;
  top: 92px;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: min(calc(100% - 24px), 380px);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  list-style: none;
  animation: pop-in .25s ease-out;
}
.tape-card {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px 6px 4px 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, #fbf6eaf5, #edf4e4ed);
  box-shadow: 0 6px 20px #143a3912;
  color: var(--ink);
  font-size: 12px;
}
.tape-card.undone { color: var(--muted); }
.tape-card.undone .tape-label { text-decoration: line-through; }
.tape-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tape-amount { font-weight: 650; font-variant-numeric: tabular-nums; }
.tape-amount.negative { color: var(--coral); }
.tape-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--sand);
  font-size: 12px;
  font-weight: 650;
  flex-shrink: 0;
}
.tape-button:hover:not(:disabled) { background: var(--teal); }
.tape-button:disabled { opacity: .5; cursor: default; }
.tape-button:focus-visible { outline: 2px solid #ffd166; outline-offset: 2px; }
/* Celular: no topo ela cobriria o cartão da próxima construção; vai para a esquerda, acima do catálogo e longe dos controles da câmera. */
@media (max-width: 600px) {
  .action-tape { top: auto; bottom: 250px; left: 11px; right: auto; margin: 0; max-width: calc(100% - 200px); }
}
@media (prefers-reduced-motion: reduce) {
  .action-tape { animation: none; }
  .tape-button { transition: none; }
}
</style>
