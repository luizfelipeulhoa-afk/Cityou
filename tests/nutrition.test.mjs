import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calorieBase, planWarnings, proteinTarget, restingMetabolicRate, scoffPositive, totalEnergyExpenditure, validateInput } from '../shared/game/nutrition.js'
import { nutritionState } from '../worker/nutrition.js'

const man = { sex: 'm', weightKg: 80, heightCm: 180, age: 30 }
const woman = { sex: 'f', weightKg: 60, heightCm: 165, age: 30 }

test('TMB segue Mifflin 1990 (homem e mulher)', () => {
  assert.equal(restingMetabolicRate(man), 1780) // 800 + 1125 − 150 + 5
  assert.equal(restingMetabolicRate(woman), 1320) // 600 + 1031,25 − 150 − 161
})

test('gasto total usa a equação de TEE do NASEM 2023 por categoria', () => {
  // homem, inativo: 753,07 − 10,83·30 + 6,50·180 + 14,10·80 = 2726,17
  assert.equal(totalEnergyExpenditure({ ...man, activity: 'inactive' }), 2726)
  assert.ok(totalEnergyExpenditure({ ...man, activity: 'very' }) > totalEnergyExpenditure({ ...man, activity: 'active' }))
})

test('perder gordura: déficit de 500 kcal/dia sobre o gasto', () => {
  const r = calorieBase({ ...man, activity: 'inactive', goal: 'fat_loss' })
  assert.equal(r.ok, true)
  assert.equal(r.target.low, r.tee - 500)
  assert.equal(r.target.high, r.tee - 500)
  assert.equal(r.belowBmr, false)
})

test('manter e ganhar massa: ganho de +360 a +480 kcal/dia', () => {
  const maintain = calorieBase({ ...man, activity: 'active', goal: 'maintain' })
  assert.equal(maintain.target.low, maintain.tee)
  const gain = calorieBase({ ...man, activity: 'active', goal: 'muscle_gain' })
  assert.equal(gain.target.low, gain.tee + 360)
  assert.equal(gain.target.high, gain.tee + 480)
})

test('preservar massa magra: déficit não passa de 500 kcal/dia', () => {
  const r = calorieBase({ ...woman, activity: 'low', goal: 'lean_preserve' })
  assert.equal(r.tee - r.target.low, 500)
})

test('nunca devolve alvo abaixo da TMB, em qualquer combinação válida', () => {
  for (const sex of ['m', 'f']) for (const activity of ['inactive', 'low', 'active', 'very']) for (const goal of ['maintain', 'fat_loss', 'lean_preserve', 'muscle_gain']) {
    for (const [weightKg, heightCm, age] of [[30, 120, 19], [45, 150, 80], [80, 180, 30], [150, 200, 60]]) {
      const r = calorieBase({ sex, weightKg, heightCm, age, activity, goal })
      assert.equal(r.ok, true)
      assert.ok(r.target.low >= r.bmr && r.target.high >= r.bmr, JSON.stringify({ sex, weightKg, heightCm, age, activity, goal, r }))
    }
  }
})

test('proteína por grupo: treino de força 1,6; mais de 65 anos 1,0–1,2; demais adultos 0,8 de adequação', () => {
  assert.deepEqual(proteinTarget({ weightKg: 80, age: 30, resistanceTraining: true }).grams, [128, null])
  assert.deepEqual(proteinTarget({ weightKg: 80, age: 70, resistanceTraining: false }).grams, [80, 96])
  assert.deepEqual(proteinTarget({ weightKg: 80, age: 30, resistanceTraining: false }), { group: 'adult', perKg: [0.8, null], grams: [64, null], notes: [], sources: ['proteinAdult'] })
})

test('proteína pela meta e pela atividade: ativo 1,4–2,0; déficit traz nota; massa magra vira gramas', () => {
  assert.deepEqual(proteinTarget({ weightKg: 80, age: 30, resistanceTraining: false, activity: 'very' }).grams, [112, 160])
  assert.deepEqual(proteinTarget({ weightKg: 80, age: 70, resistanceTraining: false, activity: 'active' }).group, 'active')
  assert.deepEqual(proteinTarget({ weightKg: 80, age: 30, resistanceTraining: false, deficit: true }).notes, ['deficit'])
  const trained = proteinTarget({ weightKg: 80, age: 30, resistanceTraining: true, deficit: true })
  assert.deepEqual([trained.grams, trained.notes, trained.leanGrams], [[128, null], ['trained_deficit'], undefined])
  assert.deepEqual(proteinTarget({ weightKg: 80, age: 30, resistanceTraining: true, deficit: true, fatFreeMassKg: 60 }).leanGrams, [138, 186])
  assert.deepEqual(calorieBase({ ...man, activity: 'low', goal: 'fat_loss' }).protein.notes, ['deficit'])
  assert.deepEqual(calorieBase({ ...man, activity: 'low', goal: 'maintain' }).protein.notes, [])
})

test('IMC 30 ou mais traz o aviso de precisão; abaixo, não', () => {
  const base = { sex: 'f', heightCm: 160, age: 40, activity: 'low', goal: 'maintain' }
  assert.deepEqual(calorieBase({ ...base, weightKg: 60 }).notes, [])
  assert.deepEqual(calorieBase({ ...base, weightKg: 80 }).notes, ['precision'])
})

test('avisos da dieta própria: abaixo da TMB e proteína abaixo do piso; nunca impede', () => {
  const base = calorieBase({ ...man, activity: 'low', goal: 'maintain', resistanceTraining: true })
  assert.deepEqual(planWarnings({ kcal: base.bmr - 1, protein_g: 100 }, base), ['below_bmr', 'low_protein'])
  assert.deepEqual(planWarnings({ kcal: base.tee, protein_g: null }, base), [])
  assert.deepEqual(planWarnings(null, base), [])
})

test('SCOFF: duas ou mais respostas sim é positivo', () => {
  assert.equal(scoffPositive([true, false, false, false, false]), false)
  assert.equal(scoffPositive([true, true, false, false, false]), true)
})

const day = offset => new Date(Date.parse('2026-11-14T00:00:00Z') + offset * 86_400_000).toISOString().slice(0, 10)
const weighIns = grams => grams.map((g, i) => ({ day: day(i - grams.length + 1), grams: g }))
const state = extra => nutritionState({
  profile: { height_cm: 180, sex: 'm', birth_year: 1996, activity: 'low', goal: 'muscle_gain', resistance_training: true, pregnant: false },
  screening: { answers: [false, false, false, false, false], positive: false, day: day(-40) },
  plan: null, target: null, weights: weighIns(Array(30).fill(80_000)), today: day(0), ...extra,
})

test('progresso: espera 3 semanas com a meta; depois compara a direção do peso com a meta', () => {
  const target = since => ({ low: 3000, high: 3100, goal: 'muscle_gain', day: day(-since) })
  assert.equal(state({ target: target(10) }).progress.status, 'waiting')
  assert.equal(state({ target: target(25) }).progress.status, 'off_track') // meta de ganho, peso estável
  const rising = weighIns(Array.from({ length: 30 }, (_, i) => 78_000 + i * 100))
  assert.equal(state({ target: target(25), weights: rising }).progress.status, 'on_track')
})

test('estado: sem pesagem recente fica incompleto; pesagem de 31 dias atrás não serve', () => {
  assert.deepEqual(state({ weights: [] }).missing, ['weight'])
  assert.equal(state({ weights: [{ day: day(-31), grams: 80_000 }] }).state, 'incomplete')
  assert.equal(state({ weights: [{ day: day(-30), grams: 80_000 }] }).state, 'ready')
})

test('entrada inválida é recusada com os campos que falharam', () => {
  assert.deepEqual(validateInput({ ...man, age: 15, goal: 'x', activity: 'inactive' }).sort(), ['age', 'goal'])
  assert.equal(calorieBase({ ...man, sex: 'x', activity: 'inactive', goal: 'maintain' }).ok, false)
})
