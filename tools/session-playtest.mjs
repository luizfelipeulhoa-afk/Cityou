// Conferência da etapa 2 no navegador, com dados sintéticos: tarefas e moedas (painel e Missões), menu da cidade
// avulsa e embutida, "Em breve" da etapa 4 e sessão vencida com o painel aberto (entrada na janela principal,
// voltando para a aba). Precisa de um Worker com contas e login obrigatório (roteiro em docs/CHECKPOINT.md).
// Uso: node tools/session-playtest.mjs http://127.0.0.1:8787
import { chromium, browserOptions } from './runtime.mjs'
const BASE = process.argv[2] || 'http://127.0.0.1:8787'
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK ' : 'FALHOU'} ${name}${detail ? ' — ' + detail : ''}`) }
const email = `e2e-${Date.now()}@example.test`, password = 'senha-sintetica-123'

;(async () => {
  const browser = await chromium.launch(browserOptions)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  const call = (path, method = 'GET', body) => page.evaluate(async ([p, m, b]) => {
    const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Fifones-City': '1' }, ...(b ? { body: JSON.stringify(b) } : {}) })
    return { status: r.status, data: await r.json().catch(() => null) }
  }, [path, method, body])
  const credits = async () => (await call('/api/city')).data.credits
  const tasks = async () => (await call('/api/personal/tasks')).data.tasks

  await page.goto(BASE + '/')
  const signup = await call('/api/auth/signup', 'POST', { email, display_name: 'Pessoa Sintética', password })
  check('cadastro sintético', signup.status === 201 || signup.status === 200, `status ${signup.status}`)

  // Duas tarefas criadas pelo painel.
  await page.goto(BASE + '/app#/tarefas')
  for (const title of ['Tarefa sintética A', 'Tarefa sintética B']) {
    await page.getByRole('button', { name: 'Nova tarefa' }).click()
    await page.locator('.entry-dialog input').first().fill(title)
    await page.locator('.entry-dialog input').first().press('Enter')
    await page.getByText(title).first().waitFor()
  }
  let list = await tasks()
  check('duas tarefas criadas pelo painel', list.filter(t => t.title.startsWith('Tarefa sintética')).length === 2)
  const c0 = await credits()

  // Concluir A no painel.
  await page.getByRole('button', { name: 'Concluir Tarefa sintética A' }).click()
  await page.waitForFunction(() => ![...document.querySelectorAll('.round-check')].some(b => b.getAttribute('aria-label') === 'Concluir Tarefa sintética A' && !b.disabled), null, { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(800)
  const c1 = await credits()
  check('concluir no painel dá +10', c1 === c0 + 10, `${c0} → ${c1}`)

  // Concluir B em Missões (cidade avulsa).
  await page.goto(BASE + '/city.html')
  const missionB = page.getByRole('button', { name: 'Concluir Tarefa sintética B' })
  await missionB.waitFor({ timeout: 30000 })
  check('Missões lista a tarefa real', true)
  await missionB.click()
  await page.waitForTimeout(1500)
  const c2 = await credits()
  check('concluir em Missões dá +10', c2 === c1 + 10, `${c1} → ${c2}`)
  check('cidade sem "Vamos reconectar"', !(await page.getByText('Vamos reconectar').count()))

  // Persistência e reenvio.
  await page.reload()
  list = await tasks()
  const a = list.find(t => t.title === 'Tarefa sintética A'), b = list.find(t => t.title === 'Tarefa sintética B')
  check('as duas seguem concluídas depois de recarregar', a?.status === 'done' && b?.status === 'done')
  check('saldo mantido depois de recarregar', (await credits()) === c2)
  const again = [await call(`/api/personal/tasks/${a.id}/complete`, 'POST', {}), await call(`/api/personal/tasks/${b.id}/complete`, 'POST', {})]
  check('reenviar a conclusão não credita de novo', (await credits()) === c2, `status ${again.map(r => r.status).join(', ')}`)

  // Menu da cidade avulsa e embutida.
  const menu = { Tarefas: 'tarefas', Agenda: 'agenda', Projetos: 'projetos', Biblioteca: 'biblioteca', Fitness: 'fitness' }
  for (const [label, tab] of Object.entries(menu)) {
    await page.goto(BASE + '/city.html')
    await page.getByRole('button', { name: label, exact: true }).first().click()
    await page.waitForURL(`**/app#/${tab}`, { timeout: 10000 }).catch(() => {})
    check(`cidade avulsa: ${label} → /app#/${tab}`, page.url().endsWith(`/app#/${tab}`), page.url())
    // Etapa 5 (na main): Agenda, Projetos e Fitness são reais; Biblioteca segue "Em breve" até a etapa 4 ligar os materiais.
    const soon = await page.locator('section.soon h2', { hasText: /em breve/i }).first().waitFor({ timeout: 4000 }).then(() => true, () => false)
    const expectSoon = tab === 'biblioteca'
    check(`${label} ${expectSoon ? 'mostra "Em breve"' : 'é real (sem "Em breve")'}`, soon === expectSoon)
  }
  for (const [label, tab] of Object.entries(menu)) {
    await page.goto(BASE + '/app#/cidade')
    const frame = page.frameLocator('iframe[title="Minha cidade Cityou"]')
    await frame.getByRole('button', { name: label, exact: true }).first().click({ timeout: 30000 })
    await page.waitForURL(`**/app#/${tab}`, { timeout: 10000 }).catch(() => {})
    const framed = await page.locator('iframe').count()
    check(`cidade embutida: ${label} abre /app#/${tab} na janela principal`, page.url().endsWith(`/app#/${tab}`) && framed === 0, `${page.url()} iframes=${framed}`)
  }
  await page.goto(BASE + '/app#/cidade')
  await page.frameLocator('iframe').getByRole('button', { name: 'Tarefas', exact: true }).first().waitFor({ timeout: 30000 })
  check('cidade embutida sem "Vamos reconectar"', !(await page.frameLocator('iframe').getByText('Vamos reconectar').count()))

  // Sessão vence com o painel aberto e a pessoa entra em Minha cidade / Mapa-mundo.
  for (const [link, tab] of [['Minha cidade', 'cidade'], ['Mapa-mundo', 'mundo']]) {
    await page.goto(BASE + '/app#/inicio')
    await page.getByText('Pessoa Sintética').first().waitFor()
    await call('/api/auth/logout', 'POST', {})
    await page.locator('a.city-link', { hasText: link }).click()
    await page.waitForURL(/\/\?entrar=1/, { timeout: 15000 }).catch(() => {})
    const expected = `/?entrar=1&next=${encodeURIComponent('/app#/' + tab)}`
    check(`sessão vencida em ${link}: entrada na janela principal`, page.url().endsWith(expected), page.url())
    check(`sessão vencida em ${link}: nenhuma página de entrada no quadro`, (await page.locator('iframe').count()) === 0)
    const form = page.locator('[data-auth-form]')
    await form.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 10000 })
    await form.locator('input[name="email"]').fill(email)
    await form.locator('input[name="password"]').fill(password)
    await form.locator('[data-auth-submit]').click()
    await page.waitForURL(`**/app#/${tab}`, { timeout: 15000 }).catch(() => {})
    check(`depois de entrar volta para /app#/${tab}`, page.url().endsWith(`/app#/${tab}`), page.url())
  }

  
  check('sem erro de página', errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} conferências passaram`)
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
