// Alimentação: base calórica (worker/nutrition.js). Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session, useHarnesses, dayFromToday } from './helpers/worker-session.mjs'
import { calorieBase } from '../shared/game/nutrition.js'

useHarnesses()

const year = Number(dayFromToday().slice(0, 4))
const profile = (extra = {}) => ({
  height_cm: 175, sex: 'm', birth_year: year - 30, activity: 'low', goal: 'fat_loss', resistance_training: false, ...extra,
})
const NO = [false, false, false, false, false]

async function ready(send, extra) {
  await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile(extra) })
  await send('/api/personal/nutrition/screening', { method: 'POST', body: { answers: NO } })
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(), grams: 80_000 }, status: 201 })
  return send('/api/personal/nutrition')
}

test('sem nada: a primeira etapa é o perfil', async () => {
  const view = await session()('/api/personal/nutrition')
  assert.equal(view.state, 'profile')
  assert.equal(view.base, null)
  assert.deepEqual(view.screening, { done: false, positive: false, skipped: false, day: null, has_answers: false })
})

test('perfil: 422 com os campos marcados e para campo extra; nada é gravado', async () => {
  const send = session()
  const { height_cm: _, ...noHeight } = profile()
  const error = await send('/api/personal/nutrition/profile', { method: 'PUT', body: noHeight, status: 422 })
  assert.ok(error.fields.height_cm)
  const many = await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ sex: 'x', activity: 'sofa', height_cm: 300 }), status: 422 })
  assert.deepEqual(Object.keys(many.fields).sort(), ['activity', 'height_cm', 'sex'])
  for (const field of ['credits', 'xp', 'weight_kg', 'kcal']) {
    await send('/api/personal/nutrition/profile', { method: 'PUT', body: { ...profile(), [field]: 1 }, status: 422 })
  }
  assert.equal((await send('/api/personal/nutrition')).profile, null)
})

test('fluxo: perfil → triagem → falta pesagem → base pronta, com as mesmas contas do módulo compartilhado', async () => {
  const send = session()
  assert.equal((await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile() })).state, 'screening')
  const afterScreening = await send('/api/personal/nutrition/screening', { method: 'POST', body: { answers: NO } })
  assert.equal(afterScreening.state, 'incomplete')
  assert.deepEqual(afterScreening.missing, ['weight'])
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(), grams: 80_000 }, status: 201 })
  const view = await send('/api/personal/nutrition')
  assert.equal(view.state, 'ready')
  const expected = calorieBase({ sex: 'm', weightKg: 80, heightCm: 175, age: 30, activity: 'low', goal: 'fat_loss', resistanceTraining: false })
  assert.deepEqual([view.base.bmr, view.base.tee, view.base.estimate], [expected.bmr, expected.tee, expected.target])
  assert.equal(view.base.estimate.low, view.base.tee - 500)
  assert.deepEqual(view.base.protein.perKg, [0.8, null])
  assert.ok(view.base.sources.every(source => source.text.length > 10))
  assert.deepEqual(view.base.notes, [])
})

test('triagem com sinal de risco: mostra manutenção em vez de déficit; respostas só para a pessoa e apagáveis', async () => {
  const send = session()
  await send('/api/personal/nutrition/screening', { method: 'POST', body: { answers: NO }, status: 422 }) // sem perfil
  await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile() })
  await send('/api/personal/nutrition/screening', { method: 'POST', body: { answers: [true, false] }, status: 422 })
  await send('/api/personal/nutrition/screening', { method: 'POST', body: { answers: [1, 0, 0, 0, 0] }, status: 422 })
  await send('/api/personal/nutrition/screening', { method: 'POST', body: { diagnosis: 'sim' }, status: 422 })
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(), grams: 80_000 }, status: 201 })
  const answers = [true, true, false, false, false]
  const view = await send('/api/personal/nutrition/screening', { method: 'POST', body: { diagnosis: false, answers } })
  assert.deepEqual([view.state, view.screening.positive, view.base.care, view.base.goal, view.base.goal_changed], ['ready', true, true, 'maintain', true])
  assert.deepEqual(view.base.estimate, { low: view.base.tee, high: view.base.tee })
  assert.equal(JSON.stringify(view).includes('"answers"'), false)
  const accepted = await send('/api/personal/nutrition/target', { method: 'POST', body: {} })
  assert.equal(accepted.target.goal, 'maintain')
  assert.deepEqual(await send('/api/personal/nutrition/screening').then(r => [r.diagnosis, r.answers]), [false, answers])
  // Outra sessão não vê nada.
  assert.equal((await session()('/api/personal/nutrition/screening')).answers, null)
  const cleared = await send('/api/personal/nutrition/screening/answers', { method: 'DELETE' })
  assert.deepEqual([cleared.base.care, cleared.screening.positive, cleared.screening.has_answers], [true, true, false])
  assert.deepEqual(await send('/api/personal/nutrition/screening').then(r => [r.diagnosis, r.answers]), [null, null])
})

test('triagem opcional: pular mostra a sugestão normal; diagnóstico sim ativa o cuidado; ganho de massa segue igual', async () => {
  const send = session()
  const skipped = await ready(send)
  const skip = await send('/api/personal/nutrition/screening', { method: 'POST', body: {} })
  assert.deepEqual([skip.screening.skipped, skip.screening.positive, skip.base.care], [true, false, false])
  assert.equal(skip.base.estimate.low, skipped.base.tee - 500)
  const diagnosed = await send('/api/personal/nutrition/screening', { method: 'POST', body: { diagnosis: true, answers: null } })
  assert.deepEqual([diagnosed.base.care, diagnosed.base.goal], [true, 'maintain'])
  const gain = await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ goal: 'muscle_gain' }) })
  assert.deepEqual([gain.base.care, gain.base.goal, gain.base.goal_changed], [true, 'muscle_gain', false])
  assert.equal(gain.base.estimate.low, gain.base.tee + 360)
})

test('fora do alcance: menor de 18 anos, mais de 80 e gestação não recebem números; gestação não vale para sexo m', async () => {
  const send = session()
  assert.deepEqual(await ready(send, { birth_year: year - 17 }).then(v => [v.state, v.reason]), ['not_available', 'minor'])
  assert.equal((await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ birth_year: year - 18 }) })).state, 'ready')
  assert.deepEqual(await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ birth_year: year - 81 }) }).then(v => [v.state, v.reason]), ['not_available', 'age'])
  const pregnant = await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ birth_year: year - 30, sex: 'f', pregnant: true }) })
  assert.deepEqual([pregnant.state, pregnant.reason], ['not_available', 'pregnancy'])
  const man = await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ pregnant: true }) })
  assert.deepEqual([man.state, man.profile.pregnant], ['ready', false])
})

test('meta: só muda quando a pessoa aceita; mudar a meta do perfil oferece a estimativa nova', async () => {
  const send = session()
  await send('/api/personal/nutrition/target', { method: 'POST', body: {}, status: 422 })
  const view = await ready(send)
  assert.equal(view.target, null)
  const accepted = await send('/api/personal/nutrition/target', { method: 'POST', body: {} })
  assert.deepEqual([accepted.target.low, accepted.target.high, accepted.target.goal], [view.base.estimate.low, view.base.estimate.high, 'fat_loss'])
  assert.equal(accepted.estimate_changed, false)
  assert.equal(accepted.progress.status, 'waiting')
  await send('/api/personal/nutrition/target', { method: 'POST', body: { low: 1000 }, status: 422 })
  const gain = await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ goal: 'muscle_gain' }) })
  assert.equal(gain.target.goal, 'fat_loss')
  assert.equal(gain.estimate_changed, true)
  assert.deepEqual([gain.base.estimate.low - gain.base.tee, gain.base.estimate.high - gain.base.tee], [360, 480])
})

test('dieta própria: abaixo da TMB avisa e grava; limites e apagar', async () => {
  const send = session()
  const view = await ready(send, { resistance_training: true })
  const low = await send('/api/personal/nutrition/plan', { method: 'PUT', body: { kcal: view.base.bmr - 100, protein_g: 60, note: 'Plano da nutricionista' } })
  assert.deepEqual(low.plan_warnings, ['below_bmr', 'low_protein'])
  assert.equal(low.plan.kcal, view.base.bmr - 100)
  const fine = await send('/api/personal/nutrition/plan', { method: 'PUT', body: { kcal: view.base.tee, protein_g: null } })
  assert.deepEqual(fine.plan_warnings, [])
  const bad = await send('/api/personal/nutrition/plan', { method: 'PUT', body: { kcal: 100, protein_g: -1 }, status: 422 })
  assert.deepEqual(Object.keys(bad.fields).sort(), ['kcal', 'protein_g'])
  await send('/api/personal/nutrition/plan', { method: 'PUT', body: { kcal: 2000, credits: 5 }, status: 422 })
  assert.equal((await send('/api/personal/nutrition/plan', { method: 'DELETE' })).plan, null)
  await send('/api/personal/nutrition/plan', { method: 'DELETE', status: 404 })
})

test('IMC 30 ou mais: aviso neutro de precisão, sem bloquear', async () => {
  const send = session()
  await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile({ height_cm: 160 }) })
  await send('/api/personal/nutrition/screening', { method: 'POST', body: { answers: NO } })
  await send('/api/personal/weights', { method: 'POST', body: { day: dayFromToday(), grams: 95_000 }, status: 201 })
  const view = await send('/api/personal/nutrition')
  assert.equal(view.state, 'ready')
  assert.deepEqual(view.base.notes, ['precision'])
  assert.ok(view.base.sources.some(source => source.key === 'obesity'))
})

test('apagar tudo da alimentação: perfil, triagem, meta e dieta somem; as pesagens ficam', async () => {
  const send = session()
  await ready(send)
  await send('/api/personal/nutrition/plan', { method: 'PUT', body: { kcal: 2000 } })
  const cleared = await send('/api/personal/nutrition', { method: 'DELETE' })
  assert.deepEqual([cleared.state, cleared.profile, cleared.plan, cleared.screening.done], ['profile', null, null, false])
  assert.equal((await send('/api/personal')).weights.length, 1)
})
