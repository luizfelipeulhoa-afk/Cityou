<script setup>
// Minigráfico de um cartão de métrica: curva suave, área em degradê e um ponto no fim. Decorativo (o número ao lado diz o
// mesmo em texto), por isso `aria-hidden`. Série curta demais ou parada vira uma linha de base tracejada.
import { computed, useId } from 'vue'
import { sparkGeometry } from './dashboardData.js'
const props = defineProps({ values: { type: Array, default: () => [] }, width: { type: Number, default: 104 }, height: { type: Number, default: 38 }, zero: Boolean, minSpan: { type: Number, default: 0 } })
const id = `spark-${useId()}`
const geo = computed(() => sparkGeometry(props.values, props.width, props.height, { zero: props.zero, minSpan: props.minSpan }))
</script>
<template>
  <svg class="spark" :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" aria-hidden="true" focusable="false">
    <defs><linearGradient :id="id" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tone)" stop-opacity=".34" /><stop offset="1" stop-color="var(--tone)" stop-opacity="0" /></linearGradient></defs>
    <template v-if="geo && !geo.flat">
      <path class="spark-area" :d="geo.area" :fill="`url(#${id})`" />
      <path class="spark-line" :d="geo.line" />
      <circle class="spark-dot" :cx="geo.last.x" :cy="geo.last.y" r="2.6" />
    </template>
    <line v-else class="spark-base" x1="3" :x2="width - 3" :y1="height / 2" :y2="height / 2" />
  </svg>
</template>
