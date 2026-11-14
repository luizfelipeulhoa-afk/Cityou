// Diário alimentar da aba Alimentação (worker/diary.js): programação de refeições por dia da semana, busca na base,
// gramas e unidades, edição, totais por refeição e dia, 422 para o que não está na lista e nenhum número vindo do
// navegador. Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session, useHarnesses, dayFromToday, GHOST_ID } from './helpers/worker-session.mjs'
import { searchFoods, gramsOf, weekdayOf, slotLabel } from '../worker/diary.js'

useHarnesses()

// Ovo, de galinha, inteiro, cru (TACO 489): 143 kcal, 13 g de proteína, 8,9 g de gordura, 1,6 g de carboidrato por 100 g.
// A porção "unidade grande" pesa 50 g (USDA, ligada pelo TACO_PORTION_LINKS do script de geração).
const EGG = 'taco-489'
const entry = (extra = {}) => ({ day: dayFromToday(-1), meal: 1, food_id: EGG, quantity: 2, unit: 'unidade grande', ...extra })
const DAILY_THREE = { daily: true, meals: 3 }
// Cada teste monta a sua programação: o armazenamento local não garante o estado entre testes do mesmo arquivo.
const withDailyThree = send => send('/api/personal/diary/schedule', { method: 'PUT', body: DAILY_THREE })

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

test('nomes das refeições seguem a quantidade do dia', () => {
  assert.deepEqual([1, 2, 3].map(slot => slotLabel(slot, 3)), ['Café da manhã', 'Almoço', 'Jantar'])
  assert.equal(slotLabel(7, 3), 'Refeição 7')
  assert.equal(slotLabel(1, 1), 'Refeição 1')
  assert.equal(weekdayOf('2026-11-15'), 0)
})

test('sem programação não registra; a programação vale para todos os dias ou para cada dia da semana', async () => {
  const send = session()
  const day = dayFromToday(-1)
  const none = await send(`/api/personal/diary?day=${day}`)
  assert.equal(none.schedule, null)
  assert.equal(none.meals.length, 0)
  await send('/api/personal/diary', { method: 'POST', body: entry(), status: 422 })

  const daily = await send('/api/personal/diary/schedule', { method: 'PUT', body: DAILY_THREE })
  assert.deepEqual(daily.schedule, { daily: true, meals: 3, by_weekday: [3, 3, 3, 3, 3, 3, 3] })
  assert.deepEqual(daily.meals.map(meal => meal.label), ['Café da manhã', 'Almoço', 'Jantar'])

  const byDay = [2, 2, 2, 2, 2, 2, 4]
  const weekly = await send('/api/personal/diary/schedule', { method: 'PUT', body: { daily: false, by_weekday: byDay } })
  assert.equal(weekly.schedule.daily, false)
  assert.equal((await send(`/api/personal/diary?day=${day}`)).meals.length, byDay[weekdayOf(day)])

  for (const body of [{ daily: true }, { daily: true, meals: 9 }, { daily: false, by_weekday: [1, 2] }, { daily: true, meals: 2, kcal: 1 }]) {
    await send('/api/personal/diary/schedule', { method: 'PUT', body, status: 422 })
  }
  await withDailyThree(send)
})

test('registra por refeição, calcula kcal e macros pela base e soma por refeição e dia', async () => {
  const send = session()
  await withDailyThree(send)
  const day = dayFromToday(-1)
  const created = await send('/api/personal/diary', { method: 'POST', body: entry({ meal: 2 }), status: 201 })
  const item = created.entries.find(row => row.id === created.created_id)
  assert.deepEqual([item.grams, item.kcal, item.protein, item.fat, item.carb], [100, 143, 13, 8.9, 1.6])
  assert.equal(item.food_name, 'Ovo, de galinha, inteiro, cru')

  const second = await send('/api/personal/diary', { method: 'POST', body: entry({ meal: 1, quantity: 150, unit: 'g' }), status: 201 })
  assert.equal(second.entries.find(row => row.id === second.created_id).kcal, 215)
  assert.equal(second.totals.kcal, 358)
  assert.deepEqual(second.meals.map(meal => meal.totals.kcal), [215, 143, 0])
  assert.equal(second.day, day)
  assert.equal(second.target, null)

  const view = await send(`/api/personal/diary?day=${day}`)
  assert.equal(view.entries.length, 2)
  assert.equal(view.totals.protein, 13 + 19.5)
  assert.deepEqual((await send('/api/personal/diary?day=' + dayFromToday(-30))).entries, [])
})

test('valida o registro: refeição dentro da programação, 422 com campos, sem dia futuro', async () => {
  const send = session()
  await withDailyThree(send)
  const bad = await send('/api/personal/diary', { method: 'POST', body: entry({ unit: 'copo' }), status: 422 })
  assert.ok(bad.fields.unit)
  await send('/api/personal/diary', { method: 'POST', body: entry({ meal: 4 }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ meal: 0 }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ meal: 'ceia' }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ food_id: 'nao-existe' }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ day: dayFromToday(3) }), status: 422 })
  await send('/api/personal/diary', { method: 'POST', body: entry({ quantity: 0 }), status: 422 })
  for (const field of ['kcal', 'protein', 'name', 'grams', 'xp', 'credits']) {
    await send('/api/personal/diary', { method: 'POST', body: { ...entry(), [field]: 1 }, status: 422 })
  }
  await send(`/api/personal/diary?day=${'2026-13-45'}`, { status: 422 })
})

test('edita quantidade e refeição (dentro da programação); apaga; registro que não existe dá 404', async () => {
  const send = session()
  await withDailyThree(send)
  const day = dayFromToday(-2)
  const created = await send('/api/personal/diary', { method: 'POST', body: entry({ day }), status: 201 })
  const id = created.created_id
  const edited = await send(`/api/personal/diary/${id}`, { method: 'PUT', body: { quantity: 1, meal: 3 } })
  const item = edited.entries.find(row => row.id === id)
  assert.deepEqual([item.grams, item.kcal, item.meal], [50, 72, 3])
  await send(`/api/personal/diary/${id}`, { method: 'PUT', body: { meal: 4 }, status: 422 })
  await send(`/api/personal/diary/${id}`, { method: 'PUT', body: { day }, status: 422 })
  await send(`/api/personal/diary/${id}`, { method: 'PUT', body: {}, status: 422 })
  const after = await send(`/api/personal/diary/${id}`, { method: 'DELETE' })
  assert.deepEqual(after.entries, [])
  await send(`/api/personal/diary/${id}`, { method: 'DELETE', status: 404 })
  await send(`/api/personal/diary/${GHOST_ID}`, { method: 'PUT', body: { quantity: 1 }, status: 404 })
})
