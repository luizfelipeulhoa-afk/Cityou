<script setup>
// Um GLB na cena, de forma declarativa: <GlbModel url="/models/world/coliseu.glb" />.
// Enquanto o arquivo não chega (ou se ele faltar), mostra o conteúdo do slot, por exemplo o monumento em código.
import { watch } from 'vue'
import { useTres } from '@tresjs/core'
import { useGlb } from './useGlb.js'

const props = defineProps({ url: { type: String, default: '' } })
const emit = defineEmits(['ready', 'error'])

const { scene, status } = useGlb(() => props.url)
const { invalidate } = useTres()

watch(status, (value) => {
  invalidate() // com render-mode="on-demand", pede o quadro em que o modelo aparece
  if (value === 'ready') emit('ready', scene.value)
  else if (value === 'error') emit('error')
})
</script>

<template>
  <primitive v-if="scene" :object="scene" />
  <slot v-else />
</template>
