<script setup>
// Fase 1 da migração: o SpaceMarker de hoje, inteiro, dentro de uma cena TresJS.
// O componente cuida do ciclo de vida (criar, atualizar por quadro, liberar) e recebe o estado por props;
// o desenho, os shaders e as animações continuam em src/world/SpaceMarker.js, sem mudança.
// O marcador assume que o pai não tem transformação (ele se posiciona sozinho sobre o globo).
import { markRaw, onUnmounted, watch } from 'vue'
import { useLoop, useTres } from '@tresjs/core'
import SpaceMarker from '../world/SpaceMarker.js'
import { getGlbLoader } from './glbLoader.js'

const props = defineProps({
  space: { type: Object, required: true },
  index: { type: Number, default: 0 },
  surfaceRadius: { type: Number, default: 5 },
  size: { type: Number, default: 0.6 },
  desbloqueado: { type: Boolean, default: false },
  concluido: { type: Boolean, default: false },
  hovered: { type: Boolean, default: false },
  // Endereço do GLB (de resolveModelSources). Vazio: fica o monumento em código.
  modelUrl: { type: String, default: '' },
})
const emit = defineEmits(['model'])

const { invalidate } = useTres()
const marker = markRaw(new SpaceMarker(props.space, { index: props.index, surfaceRadius: props.surfaceRadius, size: props.size }))

watch(() => [props.desbloqueado, props.concluido], ([desbloqueado, concluido]) => {
  marker.setState({ desbloqueado, concluido })
  invalidate()
}, { immediate: true })

watch(() => props.hovered, value => marker.setHovered(value), { immediate: true })

watch(() => props.modelUrl, async (url) => {
  if (!url) return
  const loaded = await marker.loadModel(await getGlbLoader(), url)
  if (!loaded) return
  invalidate()
  emit('model', marker.modelSource)
}, { immediate: true })

useLoop().onBeforeRender(({ elapsed, delta }) => marker.update(elapsed, delta))

// Depois que o TresJS tira o objeto da cena; o <primitive> não libera nada sozinho.
onUnmounted(() => marker.dispose())

defineExpose({ marker })
</script>

<template>
  <primitive :object="marker.root" />
</template>
