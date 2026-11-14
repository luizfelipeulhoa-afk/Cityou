// Diário alimentar da aba Alimentação (worker/diary.js): busca na base, gramas e unidades, totais por refeição e dia,
// 422 para o que não está na lista e nenhum número vindo do navegador. Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session, useHarnesses, dayFromToday, GHOST_ID } from './helpers/worker-session.mjs'
import { searchFoods, gramsOf } from '../worker/diary.js'

useHarnesses()

// Ovo, de galinha, inteiro, cru (TACO 489): 143 kcal, 13 g de proteína, 8,9 g de gordura, 1,6 g de carboidrato por 100 g.
// A porção "unidade grande" pesa 50 g (USDA, ligada pelo TACO_PORTION_LINKS do script de geração).
const EGG = 'taco-489'
const entry = (extra = {}) => ({ day: dayFromToday(-1), meal: 'almoco', food_id: EGG, quantity: 2, unit: 'unidade grande', ...extra })

test('busca por nome, sem acento, com variantes e unidades', async () => {
  const eggs = searchFoods('ovo')
  assert.ok(eggs.some(food => food.id === EGG))
  assert.ok(eggs.length <= 15)
  assert.ok(eggs.every(food => food.name.toLowerCase().includes('ovo')))
  assert.deepEqual(eggs.find(food => food.id === EGG).portions[0], { label: 'unidade grande', grams: 50 })
  const beans = searchFoods('feijao')
  assert.ok(beans.length > 0)
  assert.ok(beans.every(food => food.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('feijao')))

  const send = session()
  const found = await send('/api/personal/diary/foods?q=ovo%20cru')
  assert.ok(found.foods.some(food => food.id === EGG))
  await send('/api/personal/diary/foods?q=o', { status: 422 })
})

test('converte quantidade em gramas por unidade ou gramas e recusa o que não está na lista', () => {
  assert.equal(gramsOf(EGG, 2, 'unidade grande'), 100)
  assert.equal(gramsOf(EGG, 150, 'g'), 150)
  assert.throws(() => gramsOf(EGG, 1, 'copo'), error => error.status === 422 && Boolean(error.fields.unit))
  assert.throws(() => gramsOf(EGG, 6000, 'g'), error => error.status === 422 && Boolean(error.fields.quantity))
  assert.throws(() => gramsOf(EGG, 0, 'g'), error => error.status === 422 && Boolean(error.fields.quantity))
})

test('registra por unidade, calcula kcal e macros pela base e soma por refeição e dia', async () => {
  const send = session()
  const day = dayFromToday(-1)
  const created = await send('/api/personal/diary', { method: 'POST', body: entry(), status: 201 })
  const item = created.entries.find(row => row.id === created.created_id)
  assert.deepEqual([item.grams, item.kcal, item.protein, item.fat, item.carb], [100, 143, 13, 8.9, 1.6])
  assert.equal(item.food_name, 'Ovo, de galinha, inteiro, cru')

  const second = await send('/api/personal/diary', { method: 'POST', body: entry({ meal: 'cafe', quantity: 150, unit: 'g' }), status: 201 })
  assert.equal(second.entries.find(row => row.id === second.created_id).kcal, 215)
  assert.equal(second.totals.kcal, 358)
  assert.equal(second.meals.find(meal => meal.id === 'almoco').totals.kcal, 143)
  assert.equal(second.meals.find(meal => meal.id === 'cafe').totals.kcal, 215)
  assert.equal(second.meals.find(meal => meal.id === 'lanche').totals.kcal, 0)
  assert.equal(second.day, day)
  assert.equal(second.target, null)

  const view = await send(`/api/personal/diary?day=${day}`)
  assert.equal(view.entries.length, 2)
  assert.equal(view.totals.protein, 13 + 19.5)
  assert.deepEqual((await send('/api/personal/diary?day=' + dayFromToday(-30))).entries, [])
})

test('valida o registro: 422 com campos, nada de valores do navegador, sem dia futuro', async () => {
  const send = session()
  const bad = await send('/api/personal/diary', { method: 'POST', body: entry({ unit: 'copo' }), status: 422 })
  assert.ok(bad.fields.unit)
  await send('/api/personal/diary', { method: 'POST', body: entry({ meal: 'ceia' }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ food_id: 'nao-existe' }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ day: dayFromToday(3) }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ quantity: 0 }), status: 422 })
  for (const field of ['kcal', 'protein', 'name', 'grams', 'xp', 'credits']) {
    await send('/api/personal/diary', { method: 'POST', body: { ...entry(), [field]: 1 }, status: 422 })
  }
  await send(`/api/personal/diary?day=${'2026-13-45'}`, { status: 422 })
})

test('edita quantidade e refeição; apaga; registro que não existe dá 404', async () => {
  const send = session()
  const day = dayFromToday(-2)
  const created = await send('/api/personal/diary', { method: 'POST', body: entry({ day }), status: 201 })
  const id = created.created_id
  const edited = await send(`/api/personal/diary/${id}`, { method: 'PUT', body: { quantity: 1, meal: 'jantar' } })
  const item = edited.entries.find(row => row.id === id)
  assert.deepEqual([item.grams, item.kcal, item.meal], [50, 72, 'jantar'])
  await send(`/api/personal/diary/${id}`, { method: 'PUT', body: { day }, status: 422 })
  await send(`/api/personal/diary/${id}`, { method: 'PUT', body: {}, status: 422 })
  const after = await send(`/api/personal/diary/${id}`, { method: 'DELETE' })
  assert.deepEqual(after.entries, [])
  await send(`/api/personal/diary/${id}`, { method: 'DELETE', status: 404 })
  await send(`/api/personal/diary/${GHOST_ID}`, { method: 'PUT', body: { quantity: 1 }, status: 404 })
})
