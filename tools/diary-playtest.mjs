// Conferência do diário alimentar (aba Alimentação) no navegador, com conta sintética e Worker local com contas.
// Uso: node tools/diary-playtest.mjs http://127.0.0.1:8787 (Worker com wrangler.test-session.jsonc; roteiro em docs/CHECKPOINT.md)
// Confere: escolha de quantas refeições por dia na primeira vez, busca com variantes, medida caseira do IBGE
// (arroz cozido: colher de sopa cheia, 25 g), número da tela igual ao do servidor, editar, apagar, mudar a quantidade
// de refeições e o celular (390 px) sem rolagem lateral. Grava imagens em .verification/diary-*.png.
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
const diary = page.locator('.food-diary')

try {
  await page.goto(BASE + '/')
  const signup = await call('/api/auth/signup', 'POST', { email: `diario-${Date.now()}@example.test`, display_name: 'Pessoa Sintética', password: 'senha-sintetica-123' })
  check('cadastro sintético', [200, 201].includes(signup.status), `status ${signup.status}`)

  await page.goto(BASE + '/app#/nutricao')
  await diary.getByRole('heading', { name: 'Quantas refeições você faz por dia?' }).waitFor({ timeout: 15000 })
  check('primeira vez: pergunta quantas refeições por dia', true)
  check('sem programação não mostra o formulário de alimento', await diary.getByPlaceholder('Digite, por exemplo: ovo, arroz, banana').count() === 0)
  await diary.getByLabel('Refeições por dia').selectOption('4')
  await page.screenshot({ path: '.verification/diary-1-programacao.png' })
  await diary.getByRole('button', { name: 'Salvar refeições' }).click()
  await diary.getByRole('heading', { name: 'Café da manhã' }).waitFor()
  const meals = await diary.locator('.fd-meal h3').allInnerTexts()
  check('o dia já vem com as 4 refeições', JSON.stringify(meals) === JSON.stringify(['Café da manhã', 'Almoço', 'Lanche', 'Jantar']), meals.join(', '))

  // Busca: "arroz" mostra variantes; escolhe o cozido e a colher de sopa cheia do IBGE.
  await diary.getByLabel('Refeição').selectOption({ label: 'Almoço' })
  await diary.getByPlaceholder('Digite, por exemplo: ovo, arroz, banana').fill('arroz cozido')
  const option = diary.getByRole('option', { name: /Arroz, tipo 1, cozido/ })
  await option.waitFor({ timeout: 10000 })
  check('busca acha o arroz cozido da TACO', true, await diary.getByRole('option').count() + ' resultados')
  await page.screenshot({ path: '.verification/diary-2-busca.png' })
  // Pelo teclado: seta para baixo entra na lista e Enter escolhe (o arroz cozido é o primeiro).
  await diary.getByPlaceholder('Digite, por exemplo: ovo, arroz, banana').press('ArrowDown')
  check('seta para baixo entra na lista', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'option'))
  await page.keyboard.press('Enter')
  const units = await diary.getByLabel('Unidade').locator('option').allInnerTexts()
  check('unidade em medida caseira brasileira', units.includes('colher de sopa cheia (25 g)'), units.slice(0, 4).join(' | '))
  await diary.getByLabel('Unidade').selectOption({ label: 'colher de sopa cheia (25 g)' })
  await diary.getByLabel('Quantidade').fill('4')
  await diary.getByRole('button', { name: 'Adicionar ao dia' }).click()
  await diary.locator('.fd-meal li', { hasText: 'Arroz, tipo 1, cozido' }).waitFor()
  const server = (await call('/api/personal/diary')).data
  const entry = server.entries.find(e => e.food_id === 'taco-3')
  check('servidor gravou 100 g (4 colheres de 25 g)', entry?.grams === 100, JSON.stringify(entry && { grams: entry.grams, kcal: entry.kcal }))
  const shown = await diary.locator('.fd-totals strong').innerText()
  check('total da tela é o do servidor', shown.replace(/\D/g, '') === String(server.totals.kcal), `${shown} x ${server.totals.kcal}`)

  // Ovo por unidade.
  await diary.getByLabel('Refeição').selectOption({ label: 'Café da manhã' })
  await diary.getByPlaceholder('Digite, por exemplo: ovo, arroz, banana').fill('ovo')
  await diary.getByRole('option', { name: /Ovo, de galinha, inteiro, cozido/ }).click()
  await diary.getByLabel('Unidade').selectOption({ label: 'unidade média (45 g)' })
  await diary.getByLabel('Quantidade').fill('2')
  await diary.getByRole('button', { name: 'Adicionar ao dia' }).click()
  await diary.locator('.fd-meal li', { hasText: 'Ovo, de galinha, inteiro, cozido' }).waitFor()
  check('ovo cozido por unidade (2 × 45 g)', (await call('/api/personal/diary')).data.entries.some(e => e.food_id === 'taco-488' && e.grams === 90))
  await page.screenshot({ path: '.verification/diary-3-dia.png', fullPage: true })

  // Editar a quantidade do arroz: 4 → 6 colheres.
  await diary.getByRole('button', { name: 'Editar Arroz, tipo 1, cozido' }).click()
  await diary.getByText('Editando um alimento.').waitFor()
  await diary.getByLabel('Quantidade').fill('6')
  await diary.getByRole('button', { name: 'Salvar alteração' }).click()
  await diary.getByText('Editando um alimento.').waitFor({ state: 'detached' })
  const edited = (await call('/api/personal/diary')).data.entries.find(e => e.food_id === 'taco-3')
  check('editar muda a quantidade (150 g)', edited?.grams === 150 && edited.quantity === 6, JSON.stringify(edited && { quantity: edited.quantity, grams: edited.grams }))
  check('editar não cria registro novo', (await call('/api/personal/diary')).data.entries.filter(e => e.food_id === 'taco-3').length === 1)

  // Apagar o ovo.
  await diary.getByRole('button', { name: /^Apagar Ovo, de galinha, inteiro, cozido/ }).click()
  await diary.locator('.fd-meal li', { hasText: 'Ovo, de galinha' }).waitFor({ state: 'detached' })
  check('apagar tira o registro', !(await call('/api/personal/diary')).data.entries.some(e => e.food_id === 'taco-488'))

  // Quem registra em gramas começa em gramas no próximo alimento (pedido do dono).
  await diary.getByPlaceholder('Digite, por exemplo: ovo, arroz, banana').fill('feijao carioca cozido')
  await diary.getByRole('option', { name: /Feijão, carioca, cozido/ }).click()
  check('depois de medida caseira, o próximo começa na medida', (await diary.getByLabel('Unidade').inputValue()) !== 'g')
  await diary.getByLabel('Unidade').selectOption('g')
  await diary.getByLabel('Quantidade').fill('100')
  await diary.getByRole('button', { name: 'Adicionar ao dia' }).click()
  await diary.locator('.fd-meal li', { hasText: 'Feijão, carioca, cozido' }).waitFor()
  const pick = async (text, name) => {
    await diary.getByPlaceholder('Digite, por exemplo: ovo, arroz, banana').fill(text)
    await diary.getByRole('option', { name }).click()
    return diary.getByLabel('Unidade').inputValue()
  }
  // Alimento que se conta começa em unidade mesmo para quem pesa o resto (o dono come 4 ovos, não 200 g).
  check('banana começa em unidade mesmo depois de gramas', (await pick('banana prata', /Banana, prata, crua/)) === 'unidade')
  check('ovo frito começa em unidade mesmo depois de gramas', (await pick('ovo frito', /Ovo, de galinha, inteiro, frito/)) === 'unidade média')
  // Quem pesa o ovo uma vez continua pesando o ovo.
  await diary.getByLabel('Unidade').selectOption('g')
  await diary.getByLabel('Quantidade').fill('50')
  await diary.getByRole('button', { name: 'Adicionar ao dia' }).click()
  await diary.locator('.fd-meal li', { hasText: 'Ovo, de galinha, inteiro, frito' }).waitFor()
  await page.reload()
  check('a última unidade do mesmo alimento vale depois de recarregar (ovo em gramas)', (await pick('ovo frito', /Ovo, de galinha, inteiro, frito/)) === 'g')
  check('alimento sem unidade segue a preferência por gramas', (await pick('arroz integral cozido', /Arroz, integral, cozido/)) === 'g')
  check('alimento já registrado volta na medida usada (arroz em colher)', (await pick('arroz tipo 1 cozido', /Arroz, tipo 1, cozido/)) === 'colher de sopa cheia')
  await diary.getByRole('button', { name: 'Trocar' }).click()

  // Mudar a quantidade de refeições: 3 por dia.
  await diary.getByRole('button', { name: 'Mudar refeições' }).click()
  await diary.getByLabel('Refeições por dia').selectOption('3')
  await diary.getByRole('button', { name: 'Salvar refeições' }).click()
  await diary.getByRole('button', { name: 'Mudar refeições' }).waitFor()
  const three = await diary.locator('.fd-meal h3').allInnerTexts()
  check('mudar para 3 refeições', JSON.stringify(three) === JSON.stringify(['Café da manhã', 'Almoço', 'Jantar']), three.join(', '))

  // Celular.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await diary.getByRole('button', { name: 'Mudar refeições' }).waitFor({ timeout: 15000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('390 px sem rolagem lateral', overflow <= 0, `excesso ${overflow}px`)
  await diary.screenshot({ path: '.verification/diary-4-celular.png' })

  check('sem erro de página', errors.length === 0, errors.join(' | '))
} catch (error) {
  check('roteiro terminou', false, String(error).split('\n')[0])
  await page.screenshot({ path: '.verification/diary-erro.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}
const failed = results.filter(ok => !ok).length
console.log(`${results.length - failed}/${results.length} conferências passaram`)
process.exit(failed ? 1 : 0)
