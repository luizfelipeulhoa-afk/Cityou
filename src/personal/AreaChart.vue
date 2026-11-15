<script setup>
// Gráfico de área de uma série acumulada (`points`: [{ day, value }], uma por dia). Mede a largura do cartão e desenha em
// pixels, para o texto dos eixos não encolher no celular. Passe o mouse ou o dedo para ver o dia e o valor.
// Acessibilidade: o SVG é uma imagem com o resumo em `label`; os valores do dia também vão para `aria-live` ao tocar.
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { niceTicks, smoothPath } from './dashboardData.js'
const props = defineProps({ points: { type: Array, default: () => [] }, label: String, unit: { type: Array, default: () => ['passo', 'passos'] }, emptyText: String })
const id = `area-${useId()}`
const box = ref(null), width = ref(640), hover = ref(-1)
const H = 236, pad = { l: 34, r: 14, t: 16, b: 28 }
let observer
onMounted(() => {
  width.value = Math.max(240, box.value?.clientWidth || 640)
  observer = new ResizeObserver(([entry]) => { width.value = Math.max(240, Math.round(entry.contentRect.width)) })
  observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())

const longDay = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const fmt = day => longDay.format(new Date(`${day}T12:00:00Z`)).replace('.', '')
const plural = n => `${n} ${props.unit[n === 1 ? 0 : 1]}`

const geo = computed(() => {
  const pts = props.points, n = pts.length
  if (!n) return null
  const total = pts.at(-1).value
  const { max, ticks } = niceTicks(Math.max(...pts.map(p => p.value)))
  const iw = width.value - pad.l - pad.r, ih = H - pad.t - pad.b, base = pad.t + ih
  const x = i => pad.l + (n < 2 ? iw / 2 : (i / (n - 1)) * iw)
  const y = v => pad.t + ih - (v / max) * ih
  const xy = pts.map((p, i) => [x(i), y(p.value)])
  const line = smoothPath(xy)
  const area = `${line}L${xy.at(-1)[0].toFixed(1)} ${base}L${xy[0][0].toFixed(1)} ${base}Z`
  const labelCount = width.value < 420 ? 3 : 5
  const marks = Array.from({ length: Math.min(labelCount, n) }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, Math.min(labelCount, n) - 1)))
  return { n, total, xy, line, area, base, iw, x, y, max,
    grid: ticks.map(t => ({ t, y: y(t) })),
    marks: marks.map(i => ({ i, x: x(i), text: fmt(pts[i].day) })) }
})

function track(event) {
  const g = geo.value
  if (!g || g.n < 2) return
  const rect = event.currentTarget.getBoundingClientRect()
  hover.value = Math.min(g.n - 1, Math.max(0, Math.round(((event.clientX - rect.left - pad.l) / g.iw) * (g.n - 1))))
}
const active = computed(() => (hover.value >= 0 && geo.value ? { ...props.points[hover.value], x: geo.value.xy[hover.value][0], y: geo.value.xy[hover.value][1] } : null))
const tipSide = computed(() => (active.value && active.value.x > width.value - 150 ? 'left' : 'right'))
const summary = computed(() => (geo.value ? `${props.label}: ${plural(geo.value.total)} em ${geo.value.n} dias, de ${fmt(props.points[0].day)} a ${fmt(props.points.at(-1).day)}.` : props.label))
</script>
<template>
  <figure ref="box" class="area-chart">
    <svg v-if="geo" :width="width" :height="H" role="img" :aria-label="summary" @pointermove="track" @pointerdown="track" @pointerleave="hover = -1">
      <defs><linearGradient :id="id" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tone)" stop-opacity=".38" /><stop offset=".85" stop-color="var(--tone)" stop-opacity="0" /></linearGradient></defs>
      <g class="ac-grid"><template v-for="g in geo.grid" :key="g.t"><line :x1="pad.l" :x2="width - pad.r" :y1="g.y" :y2="g.y" /><text :x="pad.l - 8" :y="g.y + 3.5" text-anchor="end">{{ g.t }}</text></template></g>
      <g v-if="geo.total > 0" class="ac-draw"><path class="ac-area" :d="geo.area" :fill="`url(#${id})`" /><path class="ac-line" :d="geo.line" /></g>
      <g class="ac-axis"><text v-for="m in geo.marks" :key="m.i" :x="m.x" :y="H - 8" :text-anchor="m.i === 0 ? 'start' : m.i === geo.n - 1 ? 'end' : 'middle'">{{ m.text }}</text></g>
      <circle v-if="geo.total > 0 && !active" class="ac-end" :cx="geo.xy.at(-1)[0]" :cy="geo.xy.at(-1)[1]" r="4" />
      <g v-if="active" class="ac-hover"><line :x1="active.x" :x2="active.x" :y1="pad.t" :y2="geo.base" /><circle :cx="active.x" :cy="active.y" r="4.5" /></g>
      <text v-if="geo.total === 0 && emptyText" class="ac-empty" :x="width / 2" :y="(pad.t + geo.base) / 2" text-anchor="middle">{{ emptyText }}</text>
    </svg>
    <div v-if="active" class="ac-tip" :class="tipSide" :style="{ left: `${active.x}px`, top: `${active.y}px` }"><small>{{ fmt(active.day) }}</small><strong>{{ plural(active.value) }}</strong></div>
    <span class="sr-only" aria-live="polite">{{ active ? `${fmt(active.day)}: ${plural(active.value)}` : '' }}</span>
  </figure>
</template>
