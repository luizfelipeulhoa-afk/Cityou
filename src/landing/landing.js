// Página de apresentação: animações de entrada, demonstração do ciclo do jogo e a janela de entrar / criar conta.
// Sem framework e sem biblioteca de animação: CSS, IntersectionObserver e um pouco de estado.
import './landing.css'
import { clearCache, safeNext, topWindow } from '../fifones/api.js'

// Sessão vencida com a cidade ou o mapa abertos no painel: o `pageGate` manda o quadro para cá. A entrada abre na
// janela principal e volta depois para a aba do painel em que a pessoa estava (`next` validado por `safeNext`).
const host = topWindow()
if (host !== window) host.location.replace(`/?entrar=1&next=${encodeURIComponent(safeNext(host.location.pathname + host.location.search + host.location.hash))}`)

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

// --- Navegação: fundo ao rolar ---
const nav = $('[data-nav]')
const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 12)
addEventListener('scroll', onScroll, { passive: true })
onScroll()

// --- Entrada das seções ---
const revealed = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    entry.target.classList.add('is-in')
    revealed.unobserve(entry.target)
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
for (const group of new Set($$('[data-reveal]').map(element => element.parentElement))) {
  $$(':scope > [data-reveal]', group).forEach((element, index) => {
    element.style.setProperty('--delay', `${Math.min(index, 5) * 70}ms`)
    revealed.observe(element)
  })
}

// --- Abertura: a moldura e as etiquetas acompanham o ponteiro ---
const stage = $('[data-tilt]')
if (stage && !reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const frame = $('.hero-frame', stage), chips = $$('.chip', stage)
  let pending = 0
  stage.addEventListener('pointermove', (event) => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      const box = stage.getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width - 0.5, y = (event.clientY - box.top) / box.height - 0.5
      frame.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`)
      frame.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`)
      for (const chip of chips) {
        const depth = Number(chip.dataset.depth)
        chip.style.setProperty('--px', `${(x * depth).toFixed(1)}px`)
        chip.style.setProperty('--py', `${(y * depth).toFixed(1)}px`)
      }
    })
  })
  stage.addEventListener('pointerleave', () => {
    for (const element of [frame, ...chips]) for (const name of ['--tilt-x', '--tilt-y', '--px', '--py']) element.style.removeProperty(name)
  })
}

// --- Faixa dos prédios: a lista é duplicada para o movimento não ter emenda ---
const track = $('.marquee-track')
if (track && !reduced) {
  for (const item of [...track.children]) {
    const copy = item.cloneNode(true)
    copy.setAttribute('aria-hidden', 'true')
    track.append(copy)
  }
}

// --- Demonstração do ciclo: concluir, ganhar moedas, construir ---
const demo = $('[data-demo]')
if (demo) {
  const coins = $('[data-demo-coins]', demo), wallet = $('.demo-wallet', demo), label = $('[data-demo-label]', demo)
  const items = $$('[data-demo-item]', demo), steps = $$('[data-step]')
  const COST = 25, START = 5
  let balance = START, timer = 0, running = false
  const setStep = index => steps.forEach((step, i) => step.classList.toggle('is-active', i === index))
  const show = () => {
    coins.textContent = balance
    label.textContent = demo.classList.contains('is-built') ? 'Quiosque de coco construído'
      : balance >= COST ? 'Dá para construir o Quiosque de coco' : `Faltam ${COST - balance} moedas para o Quiosque de coco`
  }
  const earn = (amount) => {
    balance += amount
    wallet.classList.remove('is-bump')
    void wallet.offsetWidth
    wallet.classList.add('is-bump')
    show()
  }
  const script = [
    [900, () => setStep(0)],
    ...items.map(item => [1100, () => { setStep(1); item.classList.add('is-done'); earn(Number(item.dataset.demoItem)) }]),
    [1300, () => { setStep(2); demo.classList.add('is-built'); earn(-COST) }],
    [3200, () => { demo.classList.remove('is-built'); items.forEach(item => item.classList.remove('is-done')); balance = START; show(); setStep(0) }],
  ]
  const play = (index = 0) => {
    if (!running) return
    const [wait, action] = script[index]
    timer = setTimeout(() => { action(); play((index + 1) % script.length) }, wait)
  }
  if (reduced) {
    items.forEach(item => item.classList.add('is-done'))
    demo.classList.add('is-built')
    show()
  } else {
    show()
    setStep(0)
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) { running = true; play() }
      else if (!entry.isIntersecting && running) { running = false; clearTimeout(timer) }
    }, { threshold: 0.35 }).observe(demo)
  }
}

// --- Conta: entrar e criar conta ---
const dialog = $('[data-auth-dialog]'), form = $('[data-auth-form]')
const params = new URLSearchParams(location.search)
// Só páginas do app, com o `#/aba` de antes: nada de endereço completo vindo da URL (`safeNext`).
const nextPath = safeNext(params.get('next') || '', location.hash)
const copy = {
  signup: { title: 'Criar conta', lede: 'Leva um minuto. O que você já fez neste navegador vai junto.', submit: 'Criar conta', busy: 'Criando…', switch: 'Já tem conta?', other: 'Entrar' },
  login: { title: 'Entrar', lede: 'Bom ter você de volta. A sua cidade está esperando.', submit: 'Entrar', busy: 'Entrando…', switch: 'Ainda não tem conta?', other: 'Criar conta' },
}
let mode = 'signup', accounts = true, busy = false

function clearErrors() {
  $$('[data-field]', form).forEach((field) => { field.classList.remove('has-error'); $('.field-error', field).textContent = ''; $('input', field).removeAttribute('aria-invalid') })
  const box = $('[data-form-error]', form)
  box.hidden = true
  box.textContent = ''
}
function fieldError(name, message) {
  const field = $(`[data-field="${name}"]`, form)
  if (!field || field.hidden) return false
  field.classList.add('has-error')
  $('.field-error', field).textContent = message
  $('input', field).setAttribute('aria-invalid', 'true')
  return true
}
function setMode(next) {
  mode = next
  const text = copy[mode]
  $('[data-auth-title]').textContent = text.title
  $('[data-auth-lede]').textContent = text.lede
  $('[data-auth-submit]').textContent = text.submit
  $$('[data-auth-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.authTab === mode)))
  const name = $('[data-field="display_name"]', form)
  name.hidden = mode === 'login'
  $('input', name).disabled = mode === 'login'
  form.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password'
  $('[data-password-hint]').hidden = mode === 'login'
  const footer = $('[data-auth-switch]')
  footer.replaceChildren(`${text.switch} `, Object.assign(document.createElement('button'), { type: 'button', textContent: text.other, onclick: () => setMode(mode === 'login' ? 'signup' : 'login') }))
  clearErrors()
}
function openAuth(next) {
  if (!accounts) { location.assign(nextPath); return }
  setMode(next)
  if (!dialog.open) dialog.showModal()
  ;(mode === 'login' ? form.email : form.display_name).focus()
}

$$('[data-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.auth)))
$$('[data-auth-tab]').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.authTab)))
$('[data-auth-close]').addEventListener('click', () => dialog.close())
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })
$('[data-password-toggle]').addEventListener('click', (event) => {
  const visible = form.password.type === 'password'
  form.password.type = visible ? 'text' : 'password'
  event.currentTarget.textContent = visible ? 'Ocultar' : 'Mostrar'
  event.currentTarget.setAttribute('aria-pressed', String(visible))
  event.currentTarget.setAttribute('aria-label', visible ? 'Ocultar a senha' : 'Mostrar a senha')
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (busy) return
  clearErrors()
  const data = { email: form.email.value.trim(), password: form.password.value }
  if (mode === 'signup') data.display_name = form.display_name.value.trim()
  // Confere aqui o mesmo que o servidor confere, para a resposta ser imediata.
  const problems = []
  if (mode === 'signup' && !data.display_name) problems.push(['display_name', 'Diga como podemos chamar você.'])
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) problems.push(['email', 'Digite um e-mail válido, como nome@exemplo.com.'])
  if (mode === 'signup' && data.password.length < 10) problems.push(['password', `A senha precisa de 10 caracteres ou mais (faltam ${10 - data.password.length}).`])
  if (mode === 'login' && !data.password) problems.push(['password', 'Digite a sua senha.'])
  if (problems.length) {
    problems.forEach(([name, message]) => fieldError(name, message))
    form[problems[0][0]].focus()
    return
  }
  const submit = $('[data-auth-submit]')
  busy = true
  submit.disabled = true
  submit.textContent = copy[mode].busy
  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fifones-City': '1' }, body: JSON.stringify(data),
    })
    const result = await response.json().catch(() => ({}))
    if (response.ok) { clearCache(); location.assign(nextPath); return }
    let placed = false
    for (const [name, message] of Object.entries(result.fields || {})) placed = fieldError(name, message) || placed
    if (!placed || response.status === 409) {
      const box = $('[data-form-error]', form)
      box.textContent = result.message || 'Não deu certo agora. Tente de novo em instantes.'
      box.hidden = false
    }
    const first = $('.has-error input', form)
    if (first) first.focus()
  } catch {
    const box = $('[data-form-error]', form)
    box.textContent = 'Sem conexão com o servidor. Confira a internet e tente de novo.'
    box.hidden = false
  } finally {
    busy = false
    submit.disabled = false
    if (dialog.open) submit.textContent = copy[mode].submit
  }
})

// Estado das contas: sem banco ligado (ou sem resposta), os botões levam à demonstração; com sessão aberta, ao app.
function applyStatus(status) {
  accounts = status.accounts === true && !status.user
  if (accounts) { if (params.has('entrar')) openAuth('login'); return }
  $$('[data-auth="signup"]').forEach((button) => { button.textContent = status.user ? 'Abrir meu Cityou' : 'Abrir a demonstração' })
  $$('[data-auth="login"]').forEach((button) => { button.hidden = true })
  if (!status.user) $('.hero-note').textContent = 'As contas ainda não estão ativas: por enquanto o que você fizer fica guardado neste navegador.'
}
fetch('/api/auth/status', { headers: { Accept: 'application/json' } })
  .then(response => (response.ok ? response.json() : {}))
  .then(applyStatus, () => applyStatus({}))
