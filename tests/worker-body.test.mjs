// Composição corporal da aba Fitness (worker/body.js) e o uso da massa magra na proteína. Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session, useHarnesses, dayFromToday, GHOST_ID } from './helpers/worker-session.mjs'
import { bodyTrend } from '../worker/body.js'

useHarnesses()

const make = (extra = {}) => ({ day: dayFromToday(-1), fat_pct: 22.5, lean_grams: null, method: 'bia', note: '', ...extra })

test('criar, listar, editar e apagar; um registro por dia; 422 com campos', async () => {
  const send = session()
  const created = await send('/api/personal/body-composition', { method: 'POST', body: make(), status: 201 })
  const item = created.body_composition.find(row => row.id === created.created_id)
  assert.deepEqual([item.fat_pct, item.method, item.lean_grams], [22.5, 'bia', null])
  await send('/api/personal/body-composition', { method: 'POST', body: make(), status: 422 })
  const bad = await send('/api/personal/body-composition', { method: 'POST', body: make({ day: dayFromToday(-2), fat_pct: 90 }), status: 422 })
  assert.ok(bad.fields.fat_pct)
  for (const field of ['credits', 'xp', 'weight']) await send('/api/personal/body-composition', { method: 'POST', body: { ...make({ day: dayFromToday(-3) }), [field]: 1 }, status: 422 })
  await send('/api/personal/body-composition', { method: 'POST', body: make({ day: dayFromToday(1) }), status: 422 })
  await send('/api/personal/body-composition', { method: 'POST', body: make({ day: dayFromToday(-4), method: 'olho' }), status: 422 })
  const edited = await send(`/api/personal/body-composition/${item.id}`, { method: 'PUT', body: { lean_grams: 58_000 } })
  assert.equal(edited.body_composition[0].lean_grams, 58_000)
  assert.equal((await send('/api/personal/body-composition')).body_composition.length, 1)
  assert.deepEqual((await send(`/api/personal/body-composition/${item.id}`, { method: 'DELETE' })).body_composition, [])
  await send(`/api/personal/body-composition/${item.id}`, { method: 'DELETE', status: 404 })
  await send(`/api/personal/body-composition/${GHOST_ID}`, { method: 'PUT', body: { fat_pct: 20 }, status: 404 })
})

test('a média usa as 3 medidas mais recentes dos últimos 60 dias', () => {
  const today = '2026-11-14'
  const items = [
    { day: '2026-11-10', fat_pct: 20, lean_grams: 60_000 },
    { day: '2026-11-01', fat_pct: 22, lean_grams: 59_000 },
    { day: '2026-10-20', fat_pct: 24, lean_grams: 58_000 },
    { day: '2026-10-01', fat_pct: 40, lean_grams: 40_000 },
    { day: '2026-08-01', fat_pct: 50, lean_grams: 30_000 },
  ]
  assert.deepEqual(bodyTrend(items, today), { fat_pct: 22, lean_grams: 59_000, count: 3, from: '2026-10-20', to: '2026-11-10' })
  assert.equal(bodyTrend([{ day: '2026-09-01', fat_pct: 20, lean_grams: null }], today), null)
  assert.equal(bodyTrend([{ day: '2026-11-10', fat_pct: 20, lean_grams: null }], today).lean_grams, null)
})

test('massa magra entra só na proteína: treino de força em déficit ganha as gramas por massa magra; TMB não muda', async () => {
  const send = session()
  const year = Number(dayFromToday().slice(0, 4))
  await send('/api/personal/nutrition/profile', { method: 'PUT', body: { height_cm: 175, sex: 'm', birth_year: year - 30, activity: 'low', goal: 'fat_loss', resistance_training: true } })
  await send('/api/personal/nutrition/screening', { method: 'POST', body: {} })
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(), grams: 80_000 }, status: 201 })
  const before = await send('/api/personal/nutrition')
  assert.equal(before.base.protein.leanGrams, undefined)
  assert.equal(before.base.composition, null)
  // Só percentual: massa magra estimada pelo peso usado (80 kg × 75% = 60 kg).
  await send('/api/personal/body-composition', { method: 'POST', body: make({ day: dayFromToday(), fat_pct: 25 }), status: 201 })
  const after = await send('/api/personal/nutrition')
  assert.equal(after.base.composition.lean_kg, 60)
  assert.deepEqual(after.base.protein.leanGrams, [138, 186])
  assert.equal(after.base.bmr, before.base.bmr)
  assert.ok(after.base.sources.some(source => source.key === 'proteinTrainedDeficit'))
})
