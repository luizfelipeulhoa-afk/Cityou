// Treino sugerido (shared/game/training.js): plano por dias e equipamento, volume, 1RM estimado e próxima carga.
// Rode com: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EQUIPMENT, EXERCISES, EXERCISE_BY_ID, SOURCES, SPLITS, estimatedOneRepMax, nextLoad, sessionVolumeKg, suggestPlan, topSet, weeklySetsByGroup,
} from '../shared/game/training.js'

test('o plano tem um treino por dia escolhido, sem exercício repetido no dia e só com o equipamento escolhido', () => {
  for (let days = 1; days <= 6; days += 1) {
    for (const equipment of EQUIPMENT) {
      const plan = suggestPlan({ days, experience: 'beginner', equipment, goal: 'fat_loss' })
      assert.equal(plan.days.length, days)
      assert.equal(plan.days.length, SPLITS[days].length)
      for (const day of plan.days) {
        assert.ok(day.exercises.length >= 4, `${days} dias, ${equipment}, ${day.label}`)
        const ids = day.exercises.map(item => item.exercise_id)
        assert.equal(new Set(ids).size, ids.length)
        assert.ok(ids.every(id => EXERCISE_BY_ID[id].setups.includes(equipment)))
      }
    }
  }
  assert.throws(() => suggestPlan({ days: 7, experience: 'beginner', equipment: 'gym' }))
  assert.throws(() => suggestPlan({ days: 3, experience: 'pro', equipment: 'gym' }))
})

test('séries, faixa de repetições e descanso seguem experiência e tipo de exercício', () => {
  const beginner = suggestPlan({ days: 3, experience: 'beginner', equipment: 'gym', goal: 'muscle_gain' }).days[0]
  const advanced = suggestPlan({ days: 3, experience: 'advanced', equipment: 'gym', goal: 'muscle_gain' }).days[0]
  assert.ok(beginner.exercises.every(item => item.sets >= 2 && item.sets <= 3))
  assert.ok(advanced.exercises.every(item => item.sets >= 3 && item.sets <= 4))
  const squat = beginner.exercises.find(item => item.exercise_id === 'agachamento-livre')
  const lateral = beginner.exercises.find(item => item.exercise_id === 'elevacao-lateral')
  assert.deepEqual([squat.reps, squat.rest_s], [[6, 12], 120])
  assert.deepEqual([lateral.reps, lateral.rest_s], [[10, 15], 90])
})

test('séries semanais: quem começa chega a 4 por grupo grande com 2 dias ou mais; quem treina chega a ~8 a 10 com 3 dias ou mais', () => {
  const big = ['Peito', 'Costas', 'Quadríceps e glúteos', 'Posterior de coxa e glúteos']
  for (let days = 2; days <= 6; days += 1) {
    const sets = weeklySetsByGroup(suggestPlan({ days, experience: 'beginner', equipment: 'gym', goal: 'maintain' }))
    assert.ok(big.every(group => sets[group] >= 4), `iniciante, ${days} dias`)
  }
  for (let days = 3; days <= 6; days += 1) {
    const sets = weeklySetsByGroup(suggestPlan({ days, experience: 'intermediate', equipment: 'gym', goal: 'maintain' }))
    assert.ok(big.every(group => sets[group] >= 8), `intermediário, ${days} dias`)
  }
})

test('catálogo: mais de 100 exercícios, ids únicos, todos com dica, e todo padrão do plano tem opção na academia', () => {
  assert.ok(EXERCISES.length >= 100)
  assert.equal(new Set(EXERCISES.map(item => item.id)).size, EXERCISES.length)
  assert.ok(EXERCISES.every(item => item.tip.length > 20))
  const plan = suggestPlan({ days: 6, experience: 'intermediate', equipment: 'gym', goal: 'maintain' })
  assert.ok(plan.days.every(day => day.exercises.length === 5))
})

test('volume da sessão é a soma de carga × repetições, inclusive quando faz menos do que o sugerido', () => {
  const exercises = [
    { exercise_id: 'supino-reto', sets: [{ weight_grams: 60_000, reps: 8 }, { weight_grams: 60_000, reps: 6 }] },
    { exercise_id: 'flexao', sets: [{ weight_grams: 0, reps: 15 }] }, // com o corpo: só a carga extra conta
  ]
  assert.equal(sessionVolumeKg(exercises), 840)
  assert.deepEqual(topSet([{ weight_grams: 50_000, reps: 10 }, { weight_grams: 52_500, reps: 6 }, { weight_grams: 52_500, reps: 7 }]), { weight_grams: 52_500, reps: 7 })
})

test('1RM estimado (Epley) só até 12 repetições e com carga', () => {
  assert.equal(estimatedOneRepMax(100_000, 10), 133.3)
  assert.equal(estimatedOneRepMax(100_000, 1), 100)
  assert.equal(estimatedOneRepMax(100_000, 13), null)
  assert.equal(estimatedOneRepMax(0, 10), null)
})

test('próxima carga: sobe quando todas as séries chegam ao topo, mantém abaixo do piso, pede repetições no meio', () => {
  assert.deepEqual(nextLoad([{ weight_grams: 60_000, reps: 10 }, { weight_grams: 60_000, reps: 10 }], [6, 10]), { action: 'increase', weight_grams: 61_500 })
  assert.deepEqual(nextLoad([{ weight_grams: 10_000, reps: 15 }], [10, 15]), { action: 'increase', weight_grams: 10_500 })
  assert.deepEqual(nextLoad([{ weight_grams: 60_000, reps: 8 }, { weight_grams: 60_000, reps: 5 }], [6, 10]), { action: 'hold', weight_grams: 60_000 })
  assert.deepEqual(nextLoad([{ weight_grams: 60_000, reps: 8 }], [6, 10]), { action: 'reps', weight_grams: 60_000 })
  assert.deepEqual(nextLoad([{ weight_grams: 0, reps: 20 }], [6, 10]), { action: 'reps', weight_grams: 0 })
})

test('toda regra cita uma fonte', () => {
  for (const key of ['iversen2021', 'iusca2021', 'refalo2022', 'singer2024', 'plotkin2022', 'evangelista2021', 'who2020', 'deficit', 'acsm2009', 'epley']) {
    assert.ok(SOURCES[key]?.ref && SOURCES[key]?.note, key)
  }
})
