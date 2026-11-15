// Conferência da aba Alimentação (base calórica) no navegador, com conta sintética e Worker local com contas.
// Uso: node tools/nutrition-playtest.mjs http://127.0.0.1:8787 (Worker com wrangler.test-session.jsonc; roteiro em docs/CHECKPOINT.md)
// Grava imagens em .verification/nutrition-*.png.
import { mkdirSync } from 'node:fs'
import { chromium, browserOptions } from './runtime.mjs'

const BASE = process.argv[2] || 'http://127.0.0.1:8787'
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK ' : 'FALHOU'} ${name}${detail ? ' — ' + detail : ''}`) }
mkdirSync('.verification', { recursive: true })

const browser = await chromium.launch(browserOptions)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const call = (path, method = 'GET', body) => page.evaluate(async ([p, m, b]) => {
  const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Cityou-Request': '1' }, ...(b ? { body: JSON.stringify(b) } : {}) })
  return { status: r.status, data: await r.json().catch(() => null) }
}, [path, method, body])
const base = page.locator('.nutrition-base')

try {
  await page.goto(BASE + '/')
  const signup = await call('/api/auth/signup', 'POST', { email: `nutri-${Date.now()}@example.test`, display_name: 'Pessoa Sintética', password: 'senha-sintetica-123' })
  check('cadastro sintético', [200, 201].includes(signup.status), `status ${signup.status}`)

  await page.goto(BASE + '/app#/nutricao')
  await base.getByRole('heading', { name: 'Sua avaliação' }).waitFor({ timeout: 15000 })
  check('primeira etapa é a avaliação', true)

  // Altura vazia: marca em vermelho e não envia.
  await base.getByPlaceholder('Ex.: 1995').fill('1994')
  await base.getByLabel('Masculino').check()
  await base.getByText('Pouco ativo').click()
  await base.getByText('Perder gordura', { exact: true }).click()
  await base.getByRole('button', { name: 'Salvar avaliação' }).click()
  check('altura vazia fica em vermelho', await base.locator('label.nb-invalid', { hasText: 'Altura' }).count() === 1)
  await page.screenshot({ path: '.verification/nutrition-1-avaliacao.png', fullPage: false })

  await base.getByPlaceholder('Ex.: 170').fill('178')
  await base.getByRole('button', { name: 'Salvar avaliação' }).click()
  await base.getByRole('heading', { name: 'Algumas perguntas sobre a sua relação com a comida' }).waitFor()
  check('antes das perguntas vem o aviso, com opção de pular', await base.getByRole('button', { name: 'Pular por agora' }).count() === 1)
  await page.screenshot({ path: '.verification/nutrition-2a-aviso.png' })
  await base.getByRole('button', { name: 'Responder as perguntas' }).click()
  await base.locator('input[name="diagnosis"]').nth(1).check()
  for (let i = 0; i < 5; i++) await base.locator(`input[name="scoff-${i}"][value="false"]`).check()
  await base.getByRole('button', { name: 'Continuar' }).click()
  await base.getByRole('heading', { name: 'Dados incompletos' }).waitFor()
  check('sem pesagem: "Dados incompletos" com o peso em vermelho', await base.locator('li.nb-invalid', { hasText: 'Peso' }).count() === 1)
  await page.screenshot({ path: '.verification/nutrition-2-incompleto.png' })

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  check('pesagem pela aba Fitness (API)', (await call('/api/personal/weights', 'POST', { day: today, grams: 82_000 })).status === 201)
  await page.reload()
  await base.getByText('Sugestão de déficit: 500 kcal por dia').waitFor({ timeout: 15000 })
  check('base pronta com o texto aprovado', true)
  const api = (await call('/api/personal/nutrition')).data
  check('número da tela é o do servidor', (await base.locator('.nb-figure strong').innerText()).includes(api.base.estimate.low.toLocaleString('pt-BR')), JSON.stringify(api.base.estimate))
  await base.getByRole('button', { name: 'Usar como minha meta' }).click()
  await base.getByText('Sua meta:').waitFor()
  check('meta aceita', (await call('/api/personal/nutrition')).data.target?.low === api.base.estimate.low)
  await page.screenshot({ path: '.verification/nutrition-3-base.png', fullPage: true })

  // Dieta própria abaixo da TMB: avisa e grava.
  await base.getByRole('button', { name: 'Registrar minha dieta' }).click()
  await base.getByPlaceholder('Ex.: 2000').fill(String(api.base.bmr - 200))
  await base.getByRole('button', { name: 'Salvar dieta' }).click()
  await base.getByText('abaixo da sua taxa metabólica basal, e isso pode fazer mal').waitFor()
  check('dieta abaixo da TMB: avisa e grava', (await call('/api/personal/nutrition')).data.plan?.kcal === api.base.bmr - 200)

  // Respostas da triagem: ver e apagar.
  await base.getByRole('button', { name: 'Ver minhas respostas da triagem' }).click()
  await page.locator('.nb-answers li').first().waitFor()
  check('a pessoa vê as próprias respostas', await page.locator('.nb-answers li').count() === 6)
  await base.getByRole('button', { name: 'Apagar minhas respostas' }).click()
  await page.waitForFunction(() => !document.querySelector('.nb-answers'))
  check('respostas apagadas no servidor', (await call('/api/personal/nutrition/screening')).data.answers === null)

  // Triagem positiva: sem números.
  const care = (await call('/api/personal/nutrition/screening', 'POST', { diagnosis: false, answers: [true, true, false, false, false] })).data
  check('sinal de risco: manutenção no lugar do déficit', care.base?.care === true && care.base.goal === 'maintain', JSON.stringify(care.base?.estimate))
  await page.reload()
  await base.getByText('Pelas suas respostas na triagem').waitFor({ timeout: 15000 })
  check('tela sem sugestão de déficit', await base.getByText(/^Sugestão de déficit/).count() === 0)
  await page.screenshot({ path: '.verification/nutrition-5-cuidado.png', fullPage: false })

  // Composição corporal na aba Fitness: registra pela tela e a massa magra aparece na Alimentação.
  await page.goto(BASE + '/app#/fitness')
  const body = page.locator('.bc')
  await body.getByRole('button', { name: 'Registrar medida' }).click()
  await body.getByPlaceholder('Ex.: 22,5').fill('25')
  await body.getByRole('button', { name: 'Salvar medida' }).click()
  await body.getByText('Gordura (média de 1 medida)').waitFor({ timeout: 10000 })
  check('composição corporal registrada na aba Fitness', (await call('/api/personal/body-composition')).data.body_composition.length === 1)
  await page.screenshot({ path: '.verification/nutrition-6-composicao.png' })
  await page.goto(BASE + '/app#/nutricao')
  await base.getByText('Massa magra usada').waitFor({ timeout: 15000 })
  check('massa magra aparece na base, só para a proteína', true)

  // Celular.
  await page.setViewportSize({ width: 390, height: 844 })
  await call('/api/personal/nutrition/screening', 'POST', { answers: [false, false, false, false, false] })
  await page.reload()
  await base.getByText('Sugestão de déficit').waitFor({ timeout: 15000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('celular sem rolagem lateral', overflow <= 0, `excesso ${overflow}px`)
  await page.screenshot({ path: '.verification/nutrition-4-celular.png', fullPage: true })
} catch (error) {
  check('roteiro terminou sem exceção', false, String(error).slice(0, 300))
}
check('sem erro de página', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
const failed = results.filter(ok => !ok).length
console.log(`\n${results.length - failed}/${results.length} conferências passaram`)
process.exit(failed ? 1 : 0)
