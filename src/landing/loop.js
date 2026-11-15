// Vinheta em laço do diagrama do topo (16/11/2026): concluir → a moeda voa pelo caminho → o saldo sobe → o prédio sai
// do cartão e pousa num lote na areia do render → o saldo desce. Carregado à parte por landing.js depois da página
// pronta (não pesa no LCP) e só sem movimento reduzido. Só transform e opacity; nada de layout por quadro.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { BUILDINGS, LOOP_CONFIG, checkLoopMath } from './loopConfig.js'

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)
// LOOP_CONFIG (saldo inicial, recompensas, ciclos, lotes e durações) está em src/landing/loopConfig.js.

export function startLoop(diagram, { toggle } = {}) {
  checkLoopMath()
  const { beat, rewards, cycles, startBalance } = LOOP_CONFIG
  const $ = selector => diagram.querySelector(selector)
  const sources = Object.fromEntries(['task', 'habit', 'goal'].map(name => [name, $(`[data-loop-source="${name}"]`)]))
  const paths = Object.fromEntries([...diagram.querySelectorAll('[data-loop-path]')].map(path => [path.dataset.loopPath, path]))
  const cards = Object.fromEntries(Object.keys(BUILDINGS).map(name => [name, $(`[data-loop-card="${name}"]`)]))
  const lots = [1, 2, 3].map(n => $(`[data-loop-lot="${n}"]`))
  const balanceEl = $('[data-loop-balance]'), walletCoin = $('.core-wallet .coin'), dayChip = $('[data-loop-day]')

  // Preços na tela iguais aos do catálogo; lotes nas âncoras do config; prédios dos lotes na ordem dos ciclos.
  for (const cycle of cycles) cards[cycle.builds].querySelector('[data-loop-price]').textContent = cycle.cost
  lots.forEach((lot, index) => {
    const anchor = LOOP_CONFIG.lotAnchors[index + 1]
    lot.style.setProperty('--lx', anchor.x); lot.style.setProperty('--ly', anchor.y)
    lot.querySelector('img').src = cards[cycles[index].builds].querySelector('img').src
  })

  // Peças que o laço acrescenta (o resto do diagrama fica como está): o preenchimento roxo de cada caixinha, o risco
  // sobre o texto, o anel e o selo "construído" de cada prédio, e a camada dos itens que voam.
  for (const node of Object.values(sources)) {
    node.querySelector('.node-icon').append(Object.assign(document.createElement('i'), { className: 'check-fill' }))
    node.querySelector('.loop-label').append(Object.assign(document.createElement('i'), { className: 'strike' }))
  }
  for (const card of Object.values(cards)) {
    card.append(Object.assign(document.createElement('i'), { className: 'loop-ring' }))
    card.append(Object.assign(document.createElement('span'), { className: 'built-chip', textContent: 'construído ✓' }))
  }
  const layer = Object.assign(document.createElement('div'), { className: 'loop-layer' })
  diagram.append(layer)
  const coinMarkup = '<svg class="coin" aria-hidden="true"><use href="#coin"/></svg>'
  const chips = Object.fromEntries(Object.entries(rewards).map(([name, amount]) => {
    const chip = Object.assign(document.createElement('span'), { className: 'fly-chip', innerHTML: `${coinMarkup}+${amount}` })
    layer.append(chip)
    return [name, chip]
  }))
  const pulse = Object.assign(document.createElement('span'), { className: 'fly-pulse' })
  const flyer = Object.assign(document.createElement('img'), { className: 'fly-building', alt: '' })
  layer.append(pulse, flyer)
  // Os três PNGs do laço já ficam na memória antes do primeiro voo.
  for (const cycle of cycles) new Image().src = cards[cycle.builds].querySelector('img').src

  const counter = { value: startBalance }
  const showBalance = () => { balanceEl.textContent = Math.round(counter.value) }

  // Estado do começo de um "dia": saldo 20, caixinhas vazias, lotes vazios, o contorno no lote 1.
  function resetState() {
    counter.value = startBalance; showBalance()
    gsap.set(diagram.querySelectorAll('.check-fill'), { autoAlpha: 0, scale: 0.6 })
    gsap.set(diagram.querySelectorAll('.strike'), { scaleX: 0 })
    gsap.set(diagram.querySelectorAll('.loop-ring, .built-chip'), { autoAlpha: 0 })
    lots.forEach((lot, index) => {
      lot.classList.remove('is-built')
      gsap.set(lot.querySelector('img'), { scale: 0, autoAlpha: 1, transformOrigin: '50% 100%' })
      gsap.set(lot.querySelector('.lot-shadow'), { scaleX: 0, autoAlpha: 1 })
      gsap.set(lot.querySelector('[data-loop-lot-outline]'), { autoAlpha: index === 0 ? 1 : 0 })
    })
    gsap.set([...Object.values(chips), pulse, flyer, dayChip], { autoAlpha: 0 })
  }

  // Centro de um elemento em coordenadas do diagrama (o que o voo do prédio precisa; refeito a cada montagem).
  const centerIn = (element) => {
    const box = element.getBoundingClientRect(), origin = diagram.getBoundingClientRect()
    return { x: box.left - origin.left + box.width / 2, y: box.top - origin.top + box.height / 2 }
  }
  const countTo = (tl, value, at) => {
    tl.to(counter, { value, duration: beat.count, ease: 'power1.out', snap: { value: 1 }, onUpdate: showBalance }, at)
      // A moeda do contador dá um pulinho junto (1 → 1,15 → 1, 0,25 s).
      .to(walletCoin, { scale: 1.15, duration: 0.125, yoyo: true, repeat: 1, ease: 'power1.out' }, at)
  }

  function buildTimeline() {
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: resetState })
    tl.call(resetState)
    let balance = startBalance
    cycles.forEach((cycle, index) => {
      // BEATS de tarefa, hábito e meta: sempre um depois do outro, nunca juntos.
      for (const name of ['task', 'habit', 'goal']) {
        const node = sources[name], chip = chips[name]
        // a. A caixinha enche de roxo e assenta (escala 0,9 → 1, 0,2 s, Back.easeOut(2)).
        tl.to(node.querySelector('.check-fill'), { autoAlpha: 1, scale: 1, duration: beat.check, ease: 'back.out(2)' })
        // b. O risco atravessa o texto (scaleX 0 → 1, 0,25 s, power2.out), como no passo 02 da página.
        tl.to(node.querySelector('.strike'), { scaleX: 1, duration: beat.strike, ease: 'power2.out' })
        // c. Um chip "+N" (cópia; o cartão não se mexe) aparece em 0,15 s e voa pelo caminho até o centro (0,9 s,
        //    power2.inOut, encolhendo para 0,85); ao chegar, some em 0,15 s.
        tl.set(chip, { scale: 1 })
        tl.to(chip, { autoAlpha: 1, duration: 0.15 })
        tl.to(chip, { duration: beat.chipFly, ease: 'power2.inOut', scale: 0.85,
          motionPath: { path: paths[name], align: paths[name], alignOrigin: [0.5, 0.5], autoRotate: false } }, '<')
        tl.to(chip, { scale: 0, autoAlpha: 0, duration: 0.15 })
        // d. O saldo sobe com o valor da recompensa (0,4 s, inteiro a cada passo).
        balance += rewards[name]
        countTo(tl, balance, '<')
        // e. Respiro de 0,15 s antes do próximo.
        tl.to({}, { duration: 0.15 })
      }
      // BEAT de construção.
      const card = cards[cycle.builds], lot = lots[index]
      // a. O cartão do prédio ganha o anel roxo (0,2 s) e o preço pulsa (1 → 1,06 → 1).
      tl.to(card.querySelector('.loop-ring'), { autoAlpha: 1, duration: 0.2 })
      tl.to(card.querySelector('small'), { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1, transformOrigin: '0 50%' }, '<')
      // b. Um pulso roxo vai do centro ao cartão pelo caminho (0,7 s, power2.inOut).
      tl.set(pulse, { autoAlpha: 1 })
      tl.to(pulse, { duration: 0.7, ease: 'power2.inOut', motionPath: { path: paths[cycle.builds], align: paths[cycle.builds], alignOrigin: [0.5, 0.5] } })
      tl.set(pulse, { autoAlpha: 0 })
      // c. Uma cópia do prédio voa em arco do cartão até o lote (0,8 s, power2.inOut).
      const from = centerIn(card.querySelector('img')), to = centerIn(lot.querySelector('img'))
      const top = Math.min(from.y, to.y) - diagram.clientHeight * 0.18
      tl.set(flyer, { attr: { src: card.querySelector('img').src }, x: from.x, y: from.y, xPercent: -50, yPercent: -50, scale: 1, autoAlpha: 1 })
      tl.to(flyer, { duration: beat.buildFly, ease: 'power2.inOut', scale: 0.7,
        motionPath: { path: [{ x: from.x, y: from.y }, { x: (from.x + to.x) / 2, y: top }, { x: to.x, y: to.y }], curviness: 1.2 } })
      tl.set(flyer, { autoAlpha: 0 })
      // d. O prédio pousa: escala 0 → 1 (0,45 s, Back.easeOut 1,4), a sombra abre (0,3 s) e o contorno some (0,2 s).
      tl.to(lot.querySelector('img'), { scale: 1, duration: beat.pop, ease: 'back.out(1.4)' }, '<')
      tl.to(lot.querySelector('.lot-shadow'), { scaleX: 1, duration: 0.3, ease: 'power2.out' }, '<')
      tl.to(lot.querySelector('[data-loop-lot-outline]'), { autoAlpha: 0, duration: 0.2 }, '<')
      // e. O saldo desce o preço (0,4 s) e o cartão ganha "construído ✓" (0,2 s); o próximo lote acende o contorno.
      balance -= cycle.cost
      countTo(tl, balance, '>-0.1')
      tl.to(card.querySelector('.built-chip'), { autoAlpha: 1, duration: 0.2 }, '<')
      if (lots[index + 1]) tl.to(lots[index + 1].querySelector('[data-loop-lot-outline]'), { autoAlpha: 1, duration: 0.2 }, '<')
      // f. Pausa para respirar (1,2 s; mais 1,5 s depois do terceiro ciclo, com a mini-cidade completa).
      tl.to({}, { duration: beat.hold + (index === cycles.length - 1 ? 1.5 : 0) })
      tl.to([card.querySelector('.loop-ring'), card.querySelector('.built-chip')], { autoAlpha: 0, duration: 0.2 })
      // Entre um ciclo e outro as caixinhas desmarcam (0,2 s), para cada ciclo mostrar as três conclusões de novo.
      if (index < cycles.length - 1) {
        tl.to(diagram.querySelectorAll('.check-fill'), { autoAlpha: 0, scale: 0.6, duration: 0.2 }, '<')
        tl.to(diagram.querySelectorAll('.strike'), { scaleX: 0, duration: 0.2 }, '<')
      }
    })
    // Emenda do laço: "Novo dia" aparece (0,3 s), tudo volta ao começo num esmaecer (0,4 s) e o chip sai.
    tl.to(dayChip, { autoAlpha: 1, duration: 0.3 })
    tl.to(lots.map(lot => lot.querySelector('img')).concat(lots.map(lot => lot.querySelector('.lot-shadow'))), { autoAlpha: 0, duration: beat.reset })
    tl.to(diagram.querySelectorAll('.check-fill, .strike'), { autoAlpha: 0, duration: beat.reset }, '<')
    tl.to(counter, { value: startBalance, duration: beat.reset, snap: { value: 1 }, onUpdate: showBalance }, '<')
    tl.to(dayChip, { autoAlpha: 0, duration: 0.3 })
    return tl
  }

  resetState()
  diagram.classList.add('loop-armed')
  let tl = buildTimeline()
  let visible = false, userPaused = false
  const sync = () => (visible && !userPaused && !document.hidden ? tl.play() : tl.pause())

  // Começa quando o diagrama entra na tela (top 75%), uma vez; depois só pausa fora da tela ou com a aba escondida.
  ScrollTrigger.create({ trigger: diagram, start: 'top 75%', end: 'bottom top', onToggle: self => { visible = self.isActive; sync() } })
  document.addEventListener('visibilitychange', sync)
  // Redimensionou: refaz a linha do tempo (o voo do prédio depende das caixas) no mesmo ponto em que estava.
  let resizeTimer = 0
  addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const time = tl.time()
      tl.kill(); resetState(); tl = buildTimeline(); tl.time(time); sync()
      ScrollTrigger.refresh()
    }, 150)
  })
  if (toggle) {
    toggle.classList.add('is-ready'); toggle.removeAttribute('tabindex')
    toggle.addEventListener('click', () => {
      userPaused = !userPaused
      toggle.setAttribute('aria-pressed', String(userPaused))
      toggle.textContent = userPaused ? 'Retomar animação' : 'Pausar animação'
      sync()
    })
  }
  return { get timeline() { return tl } }
}
