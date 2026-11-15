// Pílula do menu lateral: um único indicador que desliza até o item ativo e estica no caminho (a borda da frente anda
// rápido, a de trás vai atrás mais devagar). Mesma ideia do `slidePill` da referência de UI (clip-path com as quatro
// bordas animadas em separado), mas sem biblioteca: as bordas são variáveis CSS registradas com `@property`
// (`--pill-t/r/b/l`, em personal.css) e quem anima é uma `transition` do navegador. Aqui só se mede o item e se
// diz a direção; navegador sem `@property` apenas troca de lugar sem esticar.
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'

export function useNavPill(track, pill, trigger) {
  let observer, previous = null

  function place(animate) {
    const box = track.value, el = pill.value
    if (!box || !el) return
    const target = box.querySelector('.personal-nav-item.active')
    // Rota fora do menu (Conta, cidade, mapa) ou menu escondido: a pílula some e volta de onde parou.
    if (!target || !target.offsetHeight) { el.classList.remove('on'); return }
    const to = {
      l: target.offsetLeft, t: target.offsetTop,
      r: box.offsetWidth - (target.offsetLeft + target.offsetWidth), b: box.offsetHeight - (target.offsetTop + target.offsetHeight),
    }
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    const slide = animate && previous && el.classList.contains('on') && !calm
    el.dataset.dir = previous && to.t < previous.t ? 'up' : 'down'
    if (!slide) el.classList.add('snap')
    for (const edge of ['t', 'r', 'b', 'l']) el.style.setProperty(`--pill-${edge}`, `${to[edge]}px`)
    el.classList.add('on')
    if (!slide) { void el.offsetWidth; el.classList.remove('snap') }
    previous = to
  }

  onMounted(() => {
    place(false)
    // Mudou o tamanho do menu (recolher, girar o aparelho, fonte que chegou): reposiciona na hora, sem esticar.
    observer = new ResizeObserver(() => place(false))
    observer.observe(track.value)
    document.fonts?.ready.then(() => place(false))
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(trigger, () => nextTick(() => place(true)))
  return { place }
}
