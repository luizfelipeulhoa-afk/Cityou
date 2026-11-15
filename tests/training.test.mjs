// Treino sugerido (shared/game/training.js): plano por dias e equipamento, volume, 1RM estimado e próxima carga.
// Rode com: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EQUIPMENT, EXERCISES, EXERCISE_BY_ID, EXTRAS, SOURCES, SPLITS, loadStep, estimatedOneRepMax, nextLoad, sessionVolumeKg, suggestPlan, topSet, weeklySetsByGroup,
} from '../shared/game/training.js'

test('o plano tem um treino por dia escolhido, sem exercício repetido e só com o que a pessoa tem', () => {
  const kits = [[], ['bench'], ['pullup_bar'], Object.keys(EXTRAS)]
  for (let days = 1; days <= 6; days += 1) {
    for (const equipment of EQUIPMENT) {
      for (const extras of kits) {
        const plan = suggestPlan({ days, experience: 'beginner', equipment, goal: 'fat_loss', extras })
        assert.equal(plan.days.length, SPLITS[days].length)
        for (const day of plan.days) {
          const where = `${days} dias, ${equipment}, ${extras.join('+') || 'sem itens'}, ${day.label}`
          assert.ok(day.exercises.length >= 3, where)
          const ids = day.exercises.map(item => item.exercise_id)
          assert.equal(new Set(ids).size, ids.length)
          for (const id of ids) {
            const exercise = EXERCISE_BY_ID[id]
            assert.ok(exercise.setups.includes(equipment), `${where}: ${id}`)
            if (equipment !== 'gym') assert.ok(exercise.needs.every(item => extras.includes(item)), `${where}: ${id} precisa de ${exercise.needs}`)
          }
        }
      }
    }
  }
  // Os casos da revisão: só o corpo sem nada não recebe barra fixa, remada sob mesa nem mergulho no banco; halteres sem
  // banco não recebem barra fixa nem supino inclinado.
  const bare = suggestPlan({ days: 4, experience: 'beginner', equipment: 'bodyweight', goal: 'lean_preserve' }).days.flatMap(day => day.exercises.map(item => item.exercise_id))
  assert.ok(!bare.some(id => ['barra-fixa', 'remada-invertida', 'mergulho-banco', 'barra-supinada'].includes(id)))
  const dumbbells = suggestPlan({ days: 4, experience: 'intermediate', equipment: 'dumbbells', goal: 'muscle_gain' }).days.flatMap(day => day.exercises.map(item => item.exercise_id))
  assert.ok(!dumbbells.some(id => ['barra-fixa', 'supino-inclinado-halteres', 'supino-halteres'].includes(id)))
  assert.throws(() => suggestPlan({ days: 7, experience: 'beginner', equipment: 'gym' }))
  assert.throws(() => suggestPlan({ days: 3, experience: 'pro', equipment: 'gym' }))
})

test('séries, faixa de repetições e descanso seguem experiência e tipo de exercício', () => {
  const beginner = suggestPlan({ days: 3, experience: 'beginner', equipment: 'gym', goal: 'muscle_gain' }).days[0]
  const advanced = suggestPlan({ days: 3, experience: 'advanced', equipment: 'gym', goal: 'muscle_gain' }).days[0]
  assert.ok(beginner.exercises.every(item => item.sets >= 1 && item.sets <= 3))
  assert.ok(advanced.exercises.every(item => item.sets >= 1 && item.sets <= 4))
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

test('mais dias espalham a dose semanal em vez de aumentá-la', () => {
  const total = (days, experience) => Object.values(weeklySetsByGroup(suggestPlan({ days, experience, equipment: 'gym', goal: 'maintain' }))).reduce((a, b) => a + b, 0)
  const beginner = [2, 3, 4, 5, 6].map(days => total(days, 'beginner'))
  assert.ok(Math.max(...beginner) <= 35 && Math.max(...beginner) - Math.min(...beginner) <= 8, beginner.join(', '))
  const intermediate = [3, 4, 5, 6].map(days => total(days, 'intermediate'))
  assert.ok(Math.max(...intermediate) - Math.min(...intermediate) <= 12, intermediate.join(', '))
  for (let days = 2; days <= 6; days += 1) {
    const sets = weeklySetsByGroup(suggestPlan({ days, experience: 'beginner', equipment: 'gym', goal: 'maintain' }))
    assert.ok(Object.values(sets).every(n => n <= 5), `iniciante, ${days} dias: ${JSON.stringify(sets)}`)
  }
})

test('catálogo: mais de 100 exercícios, ids únicos, todos com dica, e todo padrão do plano tem opção na academia', () => {
  assert.ok(EXERCISES.length >= 100)
  assert.equal(new Set(EXERCISES.map(item => item.id)).size, EXERCISES.length)
  assert.ok(EXERCISES.every(item => item.tip.length > 20))
  assert.ok(EXERCISES.every(item => item.needs.every(need => Object.hasOwn(EXTRAS, need))))
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

const S = (kg, ...reps) => reps.map(r => ({ weight_grams: kg * 1000, reps: r }))
const H = (...sessions) => sessions.map(sets => ({ sets, pain: false }))
const BENCH = EXERCISE_BY_ID['supino-reto']
const LATERAL = EXERCISE_BY_ID['elevacao-lateral']

test('próxima carga: sobe só com todas as séries na mesma carga e no topo, no passo do equipamento e até 10%', () => {
  assert.deepEqual(nextLoad(H(S(60, 12, 12)), [6, 12], BENCH), { action: 'increase', weight_grams: 62_000 }) // barra: 2 kg
  assert.deepEqual(nextLoad(H(S(10, 15, 15)), [10, 15], LATERAL), { action: 'increase', weight_grams: 11_000 }) // halter: 1 kg
  // Revisão: 60 × 12 seguido de 40 × 12 não sobe (só uma série no topo com 60 kg).
  assert.equal(nextLoad(H([...S(60, 12), ...S(40, 12)]), [6, 12], BENCH).action, 'reps')
  // Revisão: 2 kg × 15 não vira 2,5 kg (seria 25%): o certo é ganhar repetições antes.
  assert.deepEqual(nextLoad(H(S(2, 15, 15)), [10, 15], LATERAL), { action: 'reps', weight_grams: 2000, reason: 'small_load' })
  assert.deepEqual(nextLoad(H(S(60, 8)), [6, 12], BENCH), { action: 'reps', weight_grams: 60_000 })
  assert.deepEqual(nextLoad(H(S(0, 20)), [6, 12], EXERCISE_BY_ID.flexao), { action: 'reps', weight_grams: 0 })
  assert.equal(loadStep(EXERCISE_BY_ID['leg-press']), 2500)
})

test('próxima carga: abaixo do piso mantém; duas sessões seguidas abaixo sugere reduzir; dor pausa a progressão', () => {
  assert.deepEqual(nextLoad(H(S(60, 8, 5)), [6, 12], BENCH), { action: 'hold', weight_grams: 60_000 })
  assert.deepEqual(nextLoad(H(S(60, 7, 5), S(60, 6, 4)), [6, 12], BENCH), { action: 'reduce', weight_grams: 54_000 })
  assert.equal(nextLoad(H(S(55, 9, 8), S(60, 6, 4)), [6, 12], BENCH).action, 'hold') // a sessão anterior foi com outra carga
  assert.deepEqual(nextLoad([{ sets: S(60, 12, 12), pain: true }], [6, 12], BENCH), { action: 'pain', weight_grams: 60_000 })
})

test('toda regra cita uma fonte', () => {
  for (const key of ['iversen2021', 'iusca2021', 'refalo2022', 'singer2024', 'plotkin2022', 'evangelista2021', 'who2020', 'deficit', 'acsm2009', 'epley']) {
    assert.ok(SOURCES[key]?.ref && SOURCES[key]?.note, key)
  }
})
