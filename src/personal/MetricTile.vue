<script setup>
// Cartão de métrica do "Seu dia": ícone e rótulo, o número grande, uma linha de apoio e o minigráfico. É um link para a
// aba do assunto (o mesmo gesto dos antigos cartões de área). Tom (`mint`, `peach`, `purple`, `blue`) pinta ícone e curva.
import Icon from './Icon.vue'
import Sparkline from './Sparkline.vue'
defineProps({ href: String, icon: String, tone: { type: String, default: 'purple' }, label: String, value: String, detail: String, spark: { type: Array, default: () => [] }, sparkZero: Boolean, sparkSpan: { type: Number, default: 0 } })
</script>
<template>
  <a class="kpi" :class="tone" :href="href">
    <span class="kpi-head"><span class="kpi-icon"><Icon :name="icon" :size="17" /></span><span class="kpi-label">{{ label }}</span><Icon name="arrow" :size="15" class="kpi-arrow" /></span>
    <strong class="kpi-value" :class="{ soft: !/\d/.test(value) }">{{ value }}</strong>
    <span class="kpi-foot"><small>{{ detail }}</small><Sparkline :values="spark" :zero="sparkZero" :min-span="sparkSpan" /></span>
  </a>
</template>
