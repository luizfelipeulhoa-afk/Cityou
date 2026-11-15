// Treino de musculação da aba Fitness (pedido do dono, 15/11/2026): plano sugerido pela meta da base calórica e pelos
// dias de treino que a pessoa escolhe, registro de cada sessão (carga e repetições de cada série, mesmo abaixo do que o
// plano sugeriu) e estatísticas calculadas aqui: volume total da sessão em kg, melhor série, 1RM estimado e próxima
// carga sugerida. As regras do plano estão em shared/game/training.js, provisórias até os artigos. Nada paga moedas ou XP.
import { HttpError, json } from './http.js'
import { atLeastOne, dayOf, exact, text, todayInSaoPaulo } from './records.js'
import { GOALS } from '../shared/game/nutrition.js'
import {
  DAYS_RANGE, EQUIPMENT, EVIDENCE_PENDING, EXERCISE_BY_ID, EXPERIENCE, EXTRAS, READINESS_QUESTIONS, weeklySetsByGroup, estimatedOneRepMax, exerciseVolumeKg,
  nextLoad, repRangeOf, sessionVolumeKg, suggestPlan, topSet, totalReps,
} from '../shared/game/training.js'

const SETUP = 'trainingsetup'
const KIND = 'workout'
const DAY_MS = 86_400_000
const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
export const HISTORY_DAYS = 120
export const MAX_EXERCISES = 20
export const MAX_SETS = 12
export const MAX_WEIGHT_GRAMS = 500_000
export const MAX_REPS = 300 // a prancha anota segundos como repetições

/**
 * Para quem o plano pode ser sugerido, a partir da base calórica (a triagem e a meta ficam lá, sem segunda fonte):
 * profile (falta preencher a Alimentação) | not_available (menor de 18, acima de 80, gestante: procurar um profissional) | ok.
 * Depois, `trainingView` acrescenta `caution` quando a triagem de esforço do setup tem algum "sim" (o plano sai igual).
 * Com sinal de risco na triagem, a meta de perda vira manutenção, como na base calórica, e `care` pede um aviso na tela.
 */
export function trainingGate(nutrition) {
  if (nutrition.state === 'profile' || nutrition.state === 'screening') return { state: 'profile', reason: null, goal: null, care: false }
  if (nutrition.state === 'not_available') return { state: 'not_available', reason: nutrition.reason, goal: null, care: false }
  const care = Boolean(nutrition.screening?.positive)
  const goal = nutrition.base?.goal ?? (care && GOALS[nutrition.profile.goal].adjustment[0] < 0 ? 'maintain' : nutrition.profile.goal)
  return { state: 'ok', reason: null, goal, care }
}

function setupOf(body) {
  exact(body, ['days_per_week', 'experience', 'equipment', 'readiness', 'extras'])
  const fields = {}
  const readiness = body.readiness
  const keys = Object.keys(READINESS_QUESTIONS)
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness) ||
      Object.keys(readiness).length !== keys.length || !keys.every(key => typeof readiness[key] === 'boolean')) {
    fields.readiness = 'Responda às três perguntas sobre esforço e saúde.'
  }
  if (!Number.isInteger(body.days_per_week) || body.days_per_week < DAYS_RANGE[0] || body.days_per_week > DAYS_RANGE[1]) {
    fields.days_per_week = `Escolha de ${DAYS_RANGE[0]} a ${DAYS_RANGE[1]} dias.`
  }
  if (!EXPERIENCE.includes(body.experience)) fields.experience = 'Escolha a sua experiência.'
  if (!EQUIPMENT.includes(body.equipment)) fields.equipment = 'Escolha onde você treina.'
  const extras = body.extras ?? []
  if (!Array.isArray(extras) || extras.some(item => !Object.hasOwn(EXTRAS, item)) || new Set(extras).size !== extras.length) {
    fields.extras = 'Marque só os itens da lista.'
  }
  if (Object.keys(fields).length) throw new HttpError(422, 'Confira os campos.', fields)
  return {
    days_per_week: body.days_per_week, experience: body.experience, equipment: body.equipment,
    readiness: Object.fromEntries(keys.map(key => [key, readiness[key]])),
    extras: Object.keys(EXTRAS).filter(item => extras.includes(item)), updated_at: new Date().toISOString(),
  }
}

function setOf(set, where) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) throw new HttpError(422, `Confira a série ${where}.`)
  exact(set, ['weight_grams', 'reps'])
  if (!Number.isInteger(set.weight_grams) || set.weight_grams < 0 || set.weight_grams > MAX_WEIGHT_GRAMS) {
    throw new HttpError(422, `A carga da série ${where} precisa ficar entre 0 e 500 kg.`, { exercises: `Carga da série ${where} entre 0 e 500 kg.` })
  }
  if (!Number.isInteger(set.reps) || set.reps < 0 || set.reps > MAX_REPS) {
    throw new HttpError(422, `As repetições da série ${where} precisam ficar entre 0 e ${MAX_REPS}.`, { exercises: `Repetições da série ${where} entre 0 e ${MAX_REPS}.` })
  }
  return { weight_grams: set.weight_grams, reps: set.reps }
}

function exercisesOf(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EXERCISES) {
    throw new HttpError(422, `Registre de 1 a ${MAX_EXERCISES} exercícios.`, { exercises: `Registre de 1 a ${MAX_EXERCISES} exercícios.` })
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(422, 'Confira os exercícios.')
    exact(item, ['exercise_id', 'sets', 'pain'])
    if (item.pain !== undefined && typeof item.pain !== 'boolean') throw new HttpError(422, 'Confira se sentiu dor.', { exercises: 'Confira se sentiu dor.' })
    if (!EXERCISE_BY_ID[item.exercise_id]) throw new HttpError(422, 'Escolha um exercício da lista.', { exercises: 'Escolha um exercício da lista.' })
    if (!Array.isArray(item.sets) || !item.sets.length || item.sets.length > MAX_SETS) {
      throw new HttpError(422, `Cada exercício tem de 1 a ${MAX_SETS} séries.`, { exercises: `Cada exercício tem de 1 a ${MAX_SETS} séries.` })
    }
    return { exercise_id: item.exercise_id, sets: item.sets.map((set, s) => setOf(set, `${s + 1} do exercício ${index + 1}`)), pain: item.pain === true }
  })
}

function planDayOf(value) {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value) || value < 1 || value > DAYS_RANGE[1]) throw new HttpError(422, 'Confira o dia do plano.', { plan_day: 'Confira o dia do plano.' })
  return value
}

/** O que o servidor guarda e devolve de uma sessão: os números vêm daqui, nunca do navegador. */
function withTotals(record) {
  return {
    ...record,
    volume_kg: sessionVolumeKg(record.exercises),
    reps: totalReps(record.exercises),
    sets: record.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    exercises: record.exercises.map(exercise => ({
      ...exercise, name: EXERCISE_BY_ID[exercise.exercise_id].name, volume_kg: exerciseVolumeKg(exercise),
    })),
  }
}

/**
 * Estatísticas: volume por semana (8 semanas, segunda a domingo) e, por exercício, a série das sessões (carga da melhor
 * série, 1RM estimado, volume), o recorde de 1RM estimado e a próxima carga sugerida pela última sessão.
 */
export function trainingStats(sessions, today, plan = null) {
  const monday = day => shiftDay(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
  const thisWeek = monday(today)
  const weeks = Array.from({ length: 8 }, (_, i) => ({ week: shiftDay(thisWeek, -7 * (7 - i)), volume_kg: 0, sessions: 0 }))
  const byExercise = new Map()
  const planRange = new Map((plan?.days ?? []).flatMap(day => day.exercises.map(item => [item.exercise_id, item.reps])))
  // Do mais antigo para o mais novo; no mesmo dia, pela ordem em que foi registrado (created_at).
  for (const session of [...sessions].sort((a, b) => a.day.localeCompare(b.day) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))) {
    const week = weeks.find(item => item.week === monday(session.day))
    if (week) { week.volume_kg = Math.round((week.volume_kg + session.volume_kg) * 10) / 10; week.sessions += 1 }
    for (const exercise of session.exercises) {
      const top = topSet(exercise.sets)
      const best = Math.max(0, ...exercise.sets.map(set => estimatedOneRepMax(set.weight_grams, set.reps) ?? 0)) || null
      const list = byExercise.get(exercise.exercise_id) ?? []
      list.push({ day: session.day, top_weight_grams: top.weight_grams, top_reps: top.reps, e1rm_kg: best, volume_kg: exercise.volume_kg, pain: Boolean(exercise.pain), sets: exercise.sets })
      byExercise.set(exercise.exercise_id, list)
    }
  }
  const exercises = [...byExercise].map(([id, history]) => {
    const last = history.at(-1)
    const range = planRange.get(id) ?? repRangeOf(id)
    return {
      exercise_id: id, name: EXERCISE_BY_ID[id].name, sessions: history.length,
      best_e1rm_kg: Math.max(0, ...history.map(item => item.e1rm_kg ?? 0)) || null,
      last: { day: last.day, top_weight_grams: last.top_weight_grams, top_reps: last.top_reps, e1rm_kg: last.e1rm_kg, volume_kg: last.volume_kg },
      history: history.slice(-12).map(({ sets, ...item }) => item),
      rep_range: range, next: nextLoad(history, range, EXERCISE_BY_ID[id]),
    }
  }).sort((a, b) => b.last.day.localeCompare(a.last.day) || a.name.localeCompare(b.name))
  return { weeks, exercises }
}

export const trainingMethods = {
  allWorkouts() {
    return this.sql.exec(`SELECT id, value FROM records WHERE kind = '${KIND}'`).toArray()
      .map(row => ({ ...JSON.parse(row.value), id: row.id }))
  },

  trainingView() {
    const today = todayInSaoPaulo()
    const setup = this.read(SETUP, 'setup')
    let gate = trainingGate(this.nutritionView())
    // Triagem de esforço com algum "sim": o plano sai igual, com o aviso para procurar um médico antes (decisão do dono).
    gate = { ...gate, caution: Boolean(setup && Object.values(setup.readiness ?? {}).some(Boolean)) }
    const plan = gate.state === 'ok' && setup
      ? suggestPlan({ days: setup.days_per_week, experience: setup.experience, equipment: setup.equipment, extras: setup.extras ?? [], goal: gate.goal })
      : null
    const since = shiftDay(today, -HISTORY_DAYS)
    const sessions = this.allWorkouts().filter(item => item.day >= since).map(withTotals)
      .sort((a, b) => b.day.localeCompare(a.day) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    const weeklySets = plan ? weeklySetsByGroup(plan) : null
    return { gate, setup, plan, weekly_sets: weeklySets, provisional: EVIDENCE_PENDING, sessions, stats: trainingStats(sessions, today, plan) }
  },

  training() { return json(this.trainingView()) },

  saveTrainingSetup(body) {
    this.write(SETUP, 'setup', setupOf(body))
    return json(this.trainingView())
  },

  addWorkout(body) {
    exact(body, ['day', 'plan_day', 'exercises', 'note'])
    const day = dayOf(body.day, 'o dia')
    if (day > todayInSaoPaulo()) throw new HttpError(422, 'Registre um treino de hoje ou de um dia que já passou.', { day: 'Escolha hoje ou um dia que já passou.' })
    const record = {
      day, plan_day: planDayOf(body.plan_day), exercises: exercisesOf(body.exercises),
      note: text(body.note ?? '', 'nota', { max: 300 }), updated_at: new Date().toISOString(),
    }
    const { id } = this.add(KIND, record, this.cap(KIND))
    return json({ ...this.trainingView(), created_id: id }, 201)
  },

  editWorkout(body, id) {
    exact(body, ['day', 'plan_day', 'exercises', 'note'])
    atLeastOne(body)
    const current = this.read(KIND, id)
    if (!current) throw new HttpError(404, 'Este treino não existe.')
    const next = { ...current, updated_at: new Date().toISOString() }
    if (body.day !== undefined) {
      next.day = dayOf(body.day, 'o dia')
      if (next.day > todayInSaoPaulo()) throw new HttpError(422, 'Escolha hoje ou um dia que já passou.', { day: 'Escolha hoje ou um dia que já passou.' })
    }
    if (body.plan_day !== undefined) next.plan_day = planDayOf(body.plan_day)
    if (body.exercises !== undefined) next.exercises = exercisesOf(body.exercises)
    if (body.note !== undefined) next.note = text(body.note, 'nota', { max: 300 })
    this.write(KIND, id, next)
    return json(this.trainingView())
  },

  removeWorkout(_, id) {
    if (!this.read(KIND, id)) throw new HttpError(404, 'Este treino não existe.')
    this.sql.exec(`DELETE FROM records WHERE kind = '${KIND}' AND id = ?`, id)
    return json(this.trainingView())
  },
}
