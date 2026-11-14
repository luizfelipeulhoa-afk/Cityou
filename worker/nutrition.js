// Base calórica da aba Alimentação: perfil, triagem SCOFF, meta aceita e dieta própria, no Durable Object da conta.
// As contas vêm de shared/game/nutrition.js; o peso vem das pesagens da aba Fitness (worker/weights.js), sem segunda fonte.
// Decisões do dono (14/11/2026): nada aqui paga moedas ou XP; o app sugere e avisa, nunca impede; a meta só muda quando
// a pessoa aceita; as respostas da triagem só aparecem para a própria pessoa, que pode apagá-las.
// Triagem (decisão do dono, 14/11/2026): explicada e opcional. Uma pergunta direta (diagnóstico ou tratamento de
// transtorno alimentar) e, se a pessoa quiser, as cinco do SCOFF. Sinal de risco não esconde os números: troca a
// sugestão de déficit pelo gasto de manutenção (sem meta de perder peso) e indica um profissional (modo `care`).
import { HttpError, json } from './http.js'
import { exact, text, todayInSaoPaulo } from './records.js'
import { weightDirection, weightTrend } from './weights.js'
import { bodyTrend } from './body.js'
import {
  ACTIVITY_LEVELS, AGE_RANGE, GOALS, SCOFF_QUESTIONS, SOURCES, calorieBase, planWarnings, scoffPositive,
} from '../shared/game/nutrition.js'

const KIND = 'nutrition'
const DAY_MS = 86_400_000
const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
// Pesagem mais antiga que isso não serve para a base: a tela pede uma recente na aba Fitness.
const WEIGHT_MAX_AGE_DAYS = 30
// A comparação entre o previsto e o real só aparece depois de 3 semanas com a meta (decisão 7).
const PROGRESS_AFTER_DAYS = 21
// Diferença a partir da qual a estimativa nova é oferecida no lugar da meta aceita.
const ESTIMATE_CHANGE_KCAL = 50

const hasAnswers = screening => Array.isArray(screening.answers) || typeof screening.diagnosis === 'boolean'

const PROFILE_FIELDS = ['height_cm', 'sex', 'birth_year', 'activity', 'goal', 'resistance_training', 'pregnant']

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
}

/** Valida o perfil inteiro. Erro 422 traz `fields` para a tela marcar cada campo em vermelho. */
export function profileOf(body, year) {
  exact(body, PROFILE_FIELDS)
  const fields = {}
  if (!integer(body.height_cm, 120, 230)) fields.height_cm = 'Informe a altura em centímetros, entre 120 e 230.'
  if (!['f', 'm'].includes(body.sex)) fields.sex = 'Escolha uma opção.'
  if (!integer(body.birth_year, year - 110, year)) fields.birth_year = 'Informe o ano de nascimento.'
  if (!ACTIVITY_LEVELS.includes(body.activity)) fields.activity = 'Escolha o seu nível de atividade.'
  if (!Object.hasOwn(GOALS, body.goal)) fields.goal = 'Escolha uma meta.'
  if (typeof body.resistance_training !== 'boolean') fields.resistance_training = 'Responda sim ou não.'
  if (body.pregnant !== undefined && typeof body.pregnant !== 'boolean') fields.pregnant = 'Responda sim ou não.'
  if (Object.keys(fields).length) throw new HttpError(422, 'Confira os campos marcados.', fields)
  return {
    height_cm: body.height_cm,
    sex: body.sex,
    birth_year: body.birth_year,
    activity: body.activity,
    goal: body.goal,
    resistance_training: body.resistance_training,
    pregnant: body.sex === 'f' && body.pregnant === true,
    updated_at: new Date().toISOString(),
  }
}

function planOf(body) {
  exact(body, ['kcal', 'protein_g', 'note'])
  const fields = {}
  if (!integer(body.kcal, 500, 8000)) fields.kcal = 'Informe as calorias do dia, entre 500 e 8000.'
  const protein = body.protein_g ?? null
  if (protein !== null && !integer(protein, 0, 500)) fields.protein_g = 'Informe a proteína em gramas, entre 0 e 500, ou deixe vazio.'
  if (Object.keys(fields).length) throw new HttpError(422, 'Confira os campos marcados.', fields)
  return { kcal: body.kcal, protein_g: protein, note: text(body.note ?? '', 'observação', { max: 300, multiline: true }), updated_at: new Date().toISOString() }
}

/** Ponto de peso usado na base: a média de 7 dias da pesagem mais recente, se ela tiver até 30 dias. */
function currentWeight(weights, today) {
  const latest = weightTrend(weights).at(-1)
  if (!latest || latest.day < shiftDay(today, -WEIGHT_MAX_AGE_DAYS)) return null
  return { kg: latest.avg_grams / 1000, day: latest.day }
}

/**
 * Estado da aba (a tela mostra uma etapa por vez):
 * profile → screening → not_available (`minor` abaixo de 18, `age` acima de 80, `pregnancy`) | incomplete (falta pesagem recente) | ready.
 * Com sinal de risco na triagem, `ready` vem com `base.care = true` e meta de perda trocada por manutenção.
 */
export function nutritionState({ profile, screening, plan, target, weights, today, body = [] }) {
  const year = Number(today.slice(0, 4))
  const view = {
    state: 'profile', reason: null, missing: [], profile, plan,
    screening: screening
      ? { done: true, positive: screening.positive, skipped: Boolean(screening.skipped), day: screening.day, has_answers: hasAnswers(screening) }
      : { done: false, positive: false, skipped: false, day: null, has_answers: false },
    base: null, target, estimate_changed: false, progress: null, plan_warnings: [],
  }
  if (!profile) return view
  if (!screening) return { ...view, state: 'screening' }
  const age = year - profile.birth_year
  if (age < AGE_RANGE[0]) return { ...view, state: 'not_available', reason: 'minor' }
  if (age > AGE_RANGE[1]) return { ...view, state: 'not_available', reason: 'age' }
  if (profile.pregnant) return { ...view, state: 'not_available', reason: 'pregnancy' }
  const weight = currentWeight(weights, today)
  if (!weight) return { ...view, state: 'incomplete', missing: ['weight'] }

  // Sinal de risco: sem sugestão de déficit. Ganhar massa e manter seguem iguais.
  const care = screening.positive
  const goal = care && GOALS[profile.goal].adjustment[0] < 0 ? 'maintain' : profile.goal
  // Massa magra (aba Fitness): só para a proteína, nunca para a TMB (Kfir 2023: Cunningham errou mais que Mifflin).
  // Média das últimas medidas; sem massa magra medida, estima pelo peso usado e o percentual de gordura.
  const composition = bodyTrend(body, today)
  const leanKg = composition ? (composition.lean_grams ?? weight.kg * 1000 * (1 - composition.fat_pct / 100)) / 1000 : null
  const result = calorieBase({
    sex: profile.sex, weightKg: weight.kg, heightCm: profile.height_cm, age,
    activity: profile.activity, goal, resistanceTraining: profile.resistance_training, fatFreeMassKg: leanKg,
  })
  if (!result.ok) return { ...view, state: 'incomplete', missing: result.errors }
  const base = {
    bmr: result.bmr, tee: result.tee, estimate: result.target, adjustment: result.adjustment, below_bmr: result.belowBmr,
    bmi: result.bmi, protein: result.protein, notes: result.notes, age, weight_kg: weight.kg, weight_day: weight.day,
    goal, care, goal_changed: goal !== profile.goal,
    composition: composition ? { ...composition, lean_kg: Math.round(leanKg * 10) / 10 } : null,
    sources: [...result.sources, ...result.protein.sources, ...(result.notes.includes('precision') ? ['obesity'] : [])]
      .map(key => ({ key, text: SOURCES[key] })),
  }
  const ready = { ...view, state: 'ready', base, plan_warnings: planWarnings(plan, result) }
  if (!target) return ready
  ready.estimate_changed = target.goal !== goal ||
    Math.abs(target.low - base.estimate.low) >= ESTIMATE_CHANGE_KCAL || Math.abs(target.high - base.estimate.high) >= ESTIMATE_CHANGE_KCAL
  if (target.day > shiftDay(today, -PROGRESS_AFTER_DAYS)) {
    ready.progress = { status: 'waiting', direction: null, since: target.day }
  } else {
    const direction = weightDirection(weightTrend(weights), today)
    const status = direction === null ? 'waiting' : direction === GOALS[target.goal].expect ? 'on_track' : 'off_track'
    ready.progress = { status, direction, since: target.day }
  }
  return ready
}

export const nutritionMethods = {
  nutritionRecord(id) { return this.read(KIND, id) },

  nutritionView() {
    return nutritionState({
      profile: this.nutritionRecord('profile'),
      screening: this.nutritionRecord('screening'),
      plan: this.nutritionRecord('plan'),
      target: this.nutritionRecord('target'),
      weights: this.allWeights(),
      body: this.allBodyComposition(),
      today: todayInSaoPaulo(),
    })
  },

  nutrition() { return json(this.nutritionView()) },

  saveNutritionProfile(body) {
    const profile = profileOf(body, Number(todayInSaoPaulo().slice(0, 4)))
    this.write(KIND, 'profile', profile)
    return json(this.nutritionView())
  },

  // Corpo: `diagnosis` (true, false ou null = prefere não responder) e `answers` (5 booleanos do SCOFF ou null = pulou).
  // Os dois nulos = pulou a triagem. Sinal de risco: diagnóstico sim ou SCOFF com 2 ou mais "sim".
  sendScreening(body) {
    exact(body, ['diagnosis', 'answers'])
    const diagnosis = body.diagnosis ?? null
    const answers = body.answers ?? null
    if (diagnosis !== null && typeof diagnosis !== 'boolean') throw new HttpError(422, 'Responda sim, não ou prefiro não responder.')
    if (answers !== null && (!Array.isArray(answers) || answers.length !== SCOFF_QUESTIONS || !answers.every(item => typeof item === 'boolean'))) {
      throw new HttpError(422, 'Responda as cinco perguntas com sim ou não, ou pule esta parte.')
    }
    if (!this.nutritionRecord('profile')) throw new HttpError(422, 'Preencha a sua avaliação antes da triagem.')
    this.write(KIND, 'screening', {
      diagnosis, answers, skipped: diagnosis === null && answers === null,
      positive: diagnosis === true || (answers !== null && scoffPositive(answers)),
      day: todayInSaoPaulo(), updated_at: new Date().toISOString(),
    })
    return json(this.nutritionView())
  },

  // Só a própria pessoa chega aqui: o objeto é da conta dela.
  screeningAnswers() {
    const screening = this.nutritionRecord('screening')
    return json({ diagnosis: screening?.diagnosis ?? null, answers: screening?.answers ?? null, day: screening?.day ?? null })
  },

  // Apaga as respostas e mantém o resultado e a data, que decidem se a base aparece.
  removeScreeningAnswers() {
    const screening = this.nutritionRecord('screening')
    if (!screening) throw new HttpError(404, 'Você ainda não fez a triagem.')
    this.write(KIND, 'screening', { ...screening, diagnosis: null, answers: null, updated_at: new Date().toISOString() })
    return json(this.nutritionView())
  },

  acceptNutritionTarget(body) {
    exact(body, [])
    const view = this.nutritionView()
    if (view.state !== 'ready') throw new HttpError(422, 'A estimativa ainda não está pronta.')
    const { low, high } = view.base.estimate
    this.write(KIND, 'target', { low, high, goal: view.base.goal, day: todayInSaoPaulo(), updated_at: new Date().toISOString() })
    return json(this.nutritionView())
  },

  saveNutritionPlan(body) {
    this.write(KIND, 'plan', planOf(body))
    return json(this.nutritionView())
  },

  removeNutritionPlan() {
    if (!this.nutritionRecord('plan')) throw new HttpError(404, 'Você não tem uma dieta registrada.')
    this.sql.exec("DELETE FROM records WHERE kind = ? AND id = 'plan'", KIND)
    return json(this.nutritionView())
  },

  // Apaga tudo da alimentação (perfil, triagem, meta e dieta). As pesagens ficam: são da aba Fitness.
  removeNutrition() {
    this.sql.exec('DELETE FROM records WHERE kind = ?', KIND)
    return json(this.nutritionView())
  },
}
