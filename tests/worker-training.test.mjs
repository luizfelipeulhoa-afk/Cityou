// Treino de musculação da aba Fitness (worker/training.js): plano pela meta da base calórica, sessões com carga e
// repetições, volume e progressão calculados no servidor. Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session, useHarnesses, dayFromToday, GHOST_ID } from './helpers/worker-session.mjs'
import { trainingStats } from '../worker/training.js'

useHarnesses()

const year = Number(dayFromToday().slice(0, 4))
const profile = (extra = {}) => ({ height_cm: 175, sex: 'm', birth_year: year - 30, activity: 'low', goal: 'fat_loss', resistance_training: true, ...extra })
const OK = { exertion_symptoms: false, medical_restriction: false, recent_injury: false }
const SETUP = { days_per_week: 3, experience: 'beginner', equipment: 'gym', readiness: OK }
const bench = (reps = [8, 6], kg = 60) => ({ exercise_id: 'supino-reto', sets: reps.map(r => ({ weight_grams: kg * 1000, reps: r })) })
const workout = (extra = {}) => ({ day: dayFromToday(-1), plan_day: 1, exercises: [bench()], note: '', ...extra })
async function ready(send, extra = {}, answers = [false, false, false, false, false]) {
  await send('/api/personal/nutrition/profile', { method: 'PUT', body: profile(extra) })
  await send('/api/personal/nutrition/screening', { method: 'POST', body: { answers } })
}

test('sem base calórica não há plano; com ela, o plano segue a meta e os dias escolhidos', async () => {
  const send = session()
  const empty = await send('/api/personal/training')
  assert.deepEqual([empty.gate.state, empty.plan, empty.setup, empty.provisional], ['profile', null, null, false])
  await send('/api/personal/training/setup', { method: 'PUT', body: SETUP })
  assert.equal((await send('/api/personal/training')).plan, null)

  await ready(send)
  const view = await send('/api/personal/training')
  assert.deepEqual([view.gate.state, view.gate.goal, view.plan.goal, view.plan.days.length], ['ok', 'fat_loss', 'fat_loss', 3])
  assert.ok(view.weekly_sets.Peito >= 4)
  const four = await send('/api/personal/training/setup', { method: 'PUT', body: { ...SETUP, days_per_week: 4, equipment: 'bodyweight' } })
  assert.deepEqual(four.plan.days.map(day => day.label), ['Superior A', 'Inferior A', 'Superior B', 'Inferior B'])

  for (const body of [{ ...SETUP, days_per_week: 7 }, { ...SETUP, experience: 'pro' }, { ...SETUP, equipment: 'rua' }, { ...SETUP, xp: 1 }, { ...SETUP, readiness: undefined }, { ...SETUP, readiness: { ...OK, recent_injury: 'sim' } }, { ...SETUP, readiness: { ...OK, extra: false } }, { ...SETUP, extras: ['halteres'] }, { ...SETUP, extras: 'bench' }]) {
    await send('/api/personal/training/setup', { method: 'PUT', body, status: 422 })
  }
})

test('triagem de esforço com algum sim: o plano sai igual, com o aviso de procurar um médico', async () => {
  const send = session()
  await ready(send)
  const view = await send('/api/personal/training/setup', { method: 'PUT', body: { ...SETUP, readiness: { ...OK, exertion_symptoms: true } } })
  assert.deepEqual([view.gate.state, view.gate.caution, view.plan.days.length], ['ok', true, 3])
  const back = await send('/api/personal/training/setup', { method: 'PUT', body: SETUP })
  assert.equal(back.gate.caution, false)
})

test('menor de 18 e gestante não recebem plano; sinal de risco troca perda por manutenção e pede cuidado', async () => {
  const minor = session()
  await ready(minor, { birth_year: year - 16 })
  await minor('/api/personal/training/setup', { method: 'PUT', body: SETUP })
  const blocked = await minor('/api/personal/training')
  assert.deepEqual([blocked.gate.state, blocked.gate.reason, blocked.plan], ['not_available', 'minor', null])

  const care = session()
  await ready(care, {}, [true, true, false, false, false])
  const view = await care('/api/personal/training/setup', { method: 'PUT', body: SETUP })
  assert.deepEqual([view.gate.care, view.gate.goal, view.plan.goal], [true, 'maintain', 'maintain'])
})

test('registra a sessão com o que a pessoa fez de verdade e o servidor calcula o volume; edita e apaga', async () => {
  const send = session()
  const created = await send('/api/personal/training/sessions', { method: 'POST', body: workout(), status: 201 })
  const item = created.sessions.find(row => row.id === created.created_id)
  assert.deepEqual([item.volume_kg, item.reps, item.sets, item.exercises[0].name], [840, 14, 2, 'Supino reto com barra'])
  assert.equal(created.stats.exercises[0].best_e1rm_kg, 76)

  const edited = await send(`/api/personal/training/sessions/${item.id}`, { method: 'PUT', body: { exercises: [bench([12, 12], 62.5)] } })
  assert.equal(edited.sessions[0].volume_kg, 1500)
  assert.deepEqual(edited.stats.exercises[0].next, { action: 'increase', weight_grams: 64_500 })
  await send(`/api/personal/training/sessions/${item.id}`, { method: 'PUT', body: {}, status: 422 })
  assert.deepEqual((await send(`/api/personal/training/sessions/${item.id}`, { method: 'DELETE' })).sessions, [])
  await send(`/api/personal/training/sessions/${item.id}`, { method: 'DELETE', status: 404 })
  await send(`/api/personal/training/sessions/${GHOST_ID}`, { method: 'PUT', body: { note: 'x' }, status: 404 })
})

test('equipamento de casa: só entra o que a pessoa marcou', async () => {
  const send = session()
  await ready(send)
  const bare = await send('/api/personal/training/setup', { method: 'PUT', body: { ...SETUP, equipment: 'bodyweight', days_per_week: 4 } })
  const ids = bare.plan.days.flatMap(day => day.exercises.map(item => item.exercise_id))
  assert.ok(!ids.includes('barra-fixa') && !ids.includes('mergulho-banco'))
  assert.deepEqual(bare.setup.extras, [])
  const kit = await send('/api/personal/training/setup', { method: 'PUT', body: { ...SETUP, equipment: 'bodyweight', days_per_week: 4, extras: ['bench', 'pullup_bar'] } })
  assert.deepEqual(kit.setup.extras, ['pullup_bar', 'bench'])
  assert.ok(kit.plan.days.flatMap(day => day.exercises.map(item => item.exercise_id)).includes('barra-fixa'))
})

test('dor anotada pausa a progressão; duas sessões no mesmo dia seguem a ordem de registro', async () => {
  const send = session()
  const day = dayFromToday(-1)
  await send('/api/personal/training/sessions', { method: 'POST', body: workout({ day, exercises: [bench([12, 12], 60)] }), status: 201 })
  const second = await send('/api/personal/training/sessions', { method: 'POST', body: workout({ day, exercises: [bench([7, 5], 60)] }), status: 201 })
  assert.deepEqual(second.stats.exercises[0].next, { action: 'hold', weight_grams: 60_000 }) // vale a mais nova
  assert.equal(second.sessions[0].id, second.created_id)
  const sore = await send('/api/personal/training/sessions', { method: 'POST', body: workout({ day, exercises: [{ ...bench([12, 12], 60), pain: true }] }), status: 201 })
  assert.equal(sore.stats.exercises[0].next.action, 'pain')
  await send('/api/personal/training/sessions', { method: 'POST', body: workout({ exercises: [{ ...bench(), pain: 'sim' }] }), status: 422 })
})

test('aeróbio: meta semanal pela meta da pessoa, registro sozinho ou junto da musculação, minutos na semana', async () => {
  const send = session()
  await ready(send)
  const view = await send('/api/personal/training/setup', { method: 'PUT', body: SETUP })
  assert.deepEqual(view.plan.cardio.minutes_week, [150, 300]) // perder gordura
  assert.ok(view.plan.days[0].exercises[0].warmup_sets === 2)
  const walk = await send('/api/personal/training/sessions', { method: 'POST', body: workout({ exercises: [], cardio: [{ type: 'walk', minutes: 40 }] }), status: 201 })
  const item = walk.sessions.find(row => row.id === walk.created_id)
  assert.deepEqual([item.cardio_min, item.volume_kg, item.exercises.length], [40, 0, 0])
  await send('/api/personal/training/sessions', { method: 'POST', body: workout({ cardio: [{ type: 'bike', minutes: 20 }] }), status: 201 })
  assert.equal((await send('/api/personal/training')).stats.weeks.reduce((sum, w) => sum + w.cardio_min, 0), 60)
  for (const cardio of [[{ type: 'nado', minutes: 10 }], [{ type: 'walk', minutes: 0 }], [{ type: 'walk', minutes: 10, kcal: 1 }]]) {
    await send('/api/personal/training/sessions', { method: 'POST', body: workout({ cardio }), status: 422 })
  }
  await send('/api/personal/training/sessions', { method: 'POST', body: workout({ exercises: [], cardio: [] }), status: 422 })

  const gain = session()
  await ready(gain, { goal: 'muscle_gain' })
  assert.deepEqual((await gain('/api/personal/training/setup', { method: 'PUT', body: SETUP })).plan.cardio.minutes_week, [150, 150])
})

test('recusa o que não está na lista e números vindos do navegador', async () => {
  const send = session()
  const post = (body, status = 422) => send('/api/personal/training/sessions', { method: 'POST', body, status })
  await post(workout({ day: dayFromToday(2) }))
  await post(workout({ exercises: [] }))
  await post(workout({ exercises: [{ exercise_id: 'nao-existe', sets: [{ weight_grams: 1000, reps: 5 }] }] }))
  await post(workout({ exercises: [{ exercise_id: 'supino-reto', sets: [] }] }))
  await post(workout({ exercises: [{ exercise_id: 'supino-reto', sets: [{ weight_grams: 600_000, reps: 5 }] }] }))
  await post(workout({ exercises: [{ exercise_id: 'supino-reto', sets: [{ weight_grams: 60_000, reps: 2.5 }] }] }))
  await post(workout({ exercises: [{ exercise_id: 'supino-reto', sets: [{ weight_grams: 60_000, reps: 8, volume: 1 }] }] }))
  await post(workout({ plan_day: 9 }))
  for (const field of ['volume_kg', 'xp', 'credits']) await post({ ...workout(), [field]: 1 })
})

test('estatísticas: volume por semana e progressão por exercício', () => {
  const today = '2026-11-15' // domingo
  const sessions = [
    { day: '2026-11-10', volume_kg: 480, exercises: [{ exercise_id: 'supino-reto', volume_kg: 480, sets: [{ weight_grams: 60_000, reps: 8 }] }] },
    { day: '2026-11-13', volume_kg: 780, exercises: [{ exercise_id: 'supino-reto', volume_kg: 780, sets: [{ weight_grams: 65_000, reps: 12 }] }] },
    { day: '2026-11-03', volume_kg: 400, exercises: [{ exercise_id: 'supino-reto', volume_kg: 400, sets: [{ weight_grams: 50_000, reps: 8 }] }] },
  ]
  const stats = trainingStats(sessions, today)
  assert.equal(stats.weeks.length, 8)
  assert.deepEqual(stats.weeks.at(-1), { week: '2026-11-09', volume_kg: 1260, sessions: 2, cardio_min: 0 })
  assert.deepEqual(stats.weeks.at(-2), { week: '2026-11-02', volume_kg: 400, sessions: 1, cardio_min: 0 })
  const bench = stats.exercises[0]
  assert.deepEqual([bench.sessions, bench.last.day, bench.best_e1rm_kg, bench.history.map(item => item.top_weight_grams)], [3, '2026-11-13', 91, [50_000, 60_000, 65_000]])
  assert.equal(bench.next.action, 'increase')
})
