<script setup>
// "Ir para…" da barra do topo (a busca com atalho da referência de UI). Não busca dados: leva a uma aba do painel, do
// teclado, em duas teclas (Ctrl ou ⌘ + K). Setas movem, Enter vai, Esc fecha.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'
const props = defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['go'])
const input = ref(null), query = ref(''), open = ref(false), index = ref(0)
const plain = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const shown = computed(() => {
  const q = plain(query.value.trim())
  return (q ? props.items.filter(i => plain(i.label).includes(q) || plain(i.group || '').includes(q)) : props.items).slice(0, 7)
})
const listId = 'jump-list', optionId = i => `jump-option-${i}`
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function show() { open.value = true; index.value = 0 }
function close() { open.value = false; query.value = '' }
function go(item) { if (!item) return; emit('go', item.id); close(); input.value?.blur() }
function key(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) return show()
    index.value = (index.value + (event.key === 'ArrowDown' ? 1 : -1) + shown.value.length) % Math.max(1, shown.value.length)
  } else if (event.key === 'Enter' && open.value) { event.preventDefault(); go(shown.value[index.value]) }
  else if (event.key === 'Escape' && open.value) { event.stopPropagation(); close(); input.value?.blur() }
}
function hotkey(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.value?.focus(); show() }
}
onMounted(() => window.addEventListener('keydown', hotkey))
onBeforeUnmount(() => window.removeEventListener('keydown', hotkey))
</script>
<template>
  <div class="jump" @focusout="e => !e.currentTarget.contains(e.relatedTarget) && (open = false)">
    <Icon name="search" :size="16" />
    <input ref="input" v-model="query" type="search" role="combobox" aria-label="Ir para uma aba" aria-autocomplete="list" :aria-expanded="open && shown.length > 0" :aria-controls="listId" :aria-activedescendant="open && shown.length ? optionId(index) : undefined" placeholder="Ir para…" autocomplete="off" @focus="show" @input="show" @keydown="key" />
    <kbd aria-hidden="true">{{ mac ? '⌘' : 'Ctrl' }} K</kbd>
    <ul v-if="open && shown.length" :id="listId" class="jump-list" role="listbox" aria-label="Abas do painel">
      <li v-for="(item, i) in shown" :id="optionId(i)" :key="item.id" role="option" :aria-selected="i === index" :class="{ on: i === index }" @mousedown.prevent="go(item)" @mousemove="index = i"><Icon :name="item.icon" :size="16" /><span>{{ item.label }}</span><small v-if="item.group">{{ item.group }}</small></li>
    </ul>
  </div>
</template>
