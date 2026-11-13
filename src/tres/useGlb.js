import { onScopeDispose, shallowRef, toValue, watch } from 'vue'
import { disposeGlb, loadGlb } from './glbLoader.js'

/**
 * Carrega o GLB de `url` (texto, ref ou função) e o troca quando o endereço muda.
 * `scene` fica em shallowRef: um objeto do three nunca deve virar reativo por dentro.
 * @returns {{ scene: import('vue').ShallowRef<import('three').Object3D|null>, status: import('vue').ShallowRef<'idle'|'loading'|'ready'|'error'> }}
 */
export function useGlb(url) {
  const scene = shallowRef(null)
  const status = shallowRef('idle')
  let request = 0

  function release() {
    if (!scene.value) return
    disposeGlb(scene.value)
    scene.value = null
  }

  watch(() => toValue(url), async (next) => {
    const mine = ++request
    release()
    if (!next) { status.value = 'idle'; return }
    status.value = 'loading'
    try {
      const loaded = await loadGlb(next)
      // Outro endereço foi pedido (ou o componente saiu) enquanto este baixava.
      if (mine !== request) { disposeGlb(loaded); return }
      scene.value = loaded
      status.value = 'ready'
    }
    catch (error) {
      if (mine !== request) return
      console.warn(`[BuildU] Não foi possível carregar ${next}.`, error)
      status.value = 'error'
    }
  }, { immediate: true })

  onScopeDispose(() => { request++; release() })
  return { scene, status }
}
