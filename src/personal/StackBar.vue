<script setup>
// Barra empilhada com legenda ("Tarefas por área"). A barra é só visual; quem lê com leitor de tela usa a lista abaixo.
// Cada segmento tem a largura proporcional à contagem e um respiro entre eles; a cor vem de `--series-N` (personal.css).
defineProps({ segments: { type: Array, default: () => [] }, empty: { type: String, default: '' } })
</script>
<template>
  <div class="stack">
    <div v-if="segments.length" class="stack-bar" aria-hidden="true"><i v-for="(s, i) in segments" :key="s.id" :style="{ flexGrow: s.count, '--c': `var(--series-${i % 6})` }" /></div>
    <div v-else class="stack-bar empty" aria-hidden="true"><i /></div>
    <ul v-if="segments.length" class="stack-legend"><li v-for="(s, i) in segments" :key="s.id"><span class="stack-dot" :style="{ '--c': `var(--series-${i % 6})` }" /><span>{{ s.label }}</span><b>{{ s.count }}</b></li></ul>
    <p v-else class="stack-empty">{{ empty }}</p>
  </div>
</template>
