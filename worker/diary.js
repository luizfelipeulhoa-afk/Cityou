// Diário alimentar da aba Alimentação: a pessoa escolhe quantas refeições faz por dia (igual todos os dias da semana ou
// uma quantidade por dia da semana), busca um alimento pelo nome (lista fechada da base TACO e USDA), escolhe uma
// unidade ou gramas, informa a quantidade e pode editar ou apagar. Não há texto livre de refeição: o servidor só aceita
// um `food_id` da base e calcula as calorias e os macronutrientes a partir dela (`shared/game/foods-base.js`), então o
// mesmo alimento dá o mesmo número para todo mundo. Nada aqui paga moedas ou XP.
import { HttpError, json } from './http.js'
import { exact, dayOf, todayInSaoPaulo } from './records.js'
import { FOOD_BASE } from '../shared/game/foods-base.js'
import { FOOD_PORTIONS } from '../shared/game/foods-portions.js'

const KIND = 'diary'
const SCHEDULE_KIND = 'diary_schedule'
const SCHEDULE_ID = 'schedule'
export const MAX_MEALS = 8
export const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
// Nomes para 2 a 5 refeições; a partir de 6, ou quando não há nome para a posição, vale "Refeição N".
const SLOT_NAMES = {
  2: ['Café da manhã', 'Jantar'],
  3: ['Café da manhã', 'Almoço', 'Jantar'],
  4: ['Café da manhã', 'Almoço', 'Lanche', 'Jantar'],
  5: ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar'],
}
const MAX_GRAMS = 5000
const MAX_QUANTITY = 1000
const SEARCH_LIMIT = 20
const NUTRIENTS = ['kcal', 'protein', 'fat', 'carb', 'fiber']

// Sem acento, minúsculo e sem pontuação: "arroz,integral" acha "Arroz, integral, cozido".
const normalize = value => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9%]+/g, ' ').trim()

// Índice de busca: uma vez por processo. Cada linha de FOOD_BASE é
// [id, nome, grupo, fonte, referência, kcal, proteína, gordura, carboidrato, fibra, nome original].
const FOODS = new Map(FOOD_BASE.map(row => [row[0], row]))
const INDEX = FOOD_BASE.map(row => ({ row, norm: normalize(row[1]) }))

const round1 = value => Math.round(value * 10) / 10
const per100g = (row, grams) => ({
  kcal: Math.round(row[5] * grams / 100),
  protein: round1(row[6] * grams / 100),
  fat: round1(row[7] * grams / 100),
  carb: round1(row[8] * grams / 100),
  // A fonte nem sempre traz fibra (838 linhas): fica null, e o total soma só os alimentos que têm o valor.
  fiber: row[9] === null ? null : round1(row[9] * grams / 100),
})

function sumOf(entries) {
  const totals = Object.fromEntries(NUTRIENTS.map(key => [key, 0]))
  for (const entry of entries) for (const key of NUTRIENTS) totals[key] += entry[key] ?? 0
  return Object.fromEntries(NUTRIENTS.map(key => [key, key === 'kcal' ? Math.round(totals[key]) : round1(totals[key])]))
}

function portionsOf(id) {
  return (FOOD_PORTIONS[id] ?? []).map(([label, grams]) => ({ label, grams }))
}

/** Dia da semana (0 = domingo) de um dia AAAA-MM-DD. */
export const weekdayOf = day => new Date(`${day}T12:00:00Z`).getUTCDay()

/** Nome da refeição na posição `slot` (1 a MAX_MEALS) de um dia com `count` refeições. */
export function slotLabel(slot, count) {
  return SLOT_NAMES[count]?.[slot - 1] ?? `Refeição ${slot}`
}

/** Busca por nome, sem acento e sem distinguir maiúsculas. Todas as palavras precisam aparecer no nome. */
export function searchFoods(query) {
  const clean = normalize(query ?? '')
  const tokens = clean.split(/\s+/).filter(Boolean).slice(0, 6)
  if (clean.length < 2 || !tokens.length) throw new HttpError(422, 'Digite pelo menos 2 letras do alimento.')
  const matches = INDEX.filter(entry => tokens.every(token => entry.norm.includes(token)))
  // Ordem (o app sai primeiro no Brasil): nome que começa com a primeira palavra buscada, depois alimento da TACO, depois o que tem medida
  // caseira (colher, unidade...), depois o nome mais curto.
  const score = entry => [
    Number(!entry.norm.startsWith(tokens[0])), Number(entry.row[3] !== 'taco'), Number(!FOOD_PORTIONS[entry.row[0]]),
  ]
  matches.sort((a, b) => {
    const [x, y] = [score(a), score(b)]
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.norm.length - b.norm.length || a.norm.localeCompare(b.norm)
  })
  return matches.slice(0, SEARCH_LIMIT).map(({ row }) => ({
    id: row[0], name: row[1], group: row[2], source: row[3], ref: row[4],
    per_100g: { kcal: row[5], protein: row[6], fat: row[7], carb: row[8], fiber: row[9] },
    portions: portionsOf(row[0]),
  }))
}

/** Converte a quantidade informada em gramas. A unidade é 'g' ou o nome de uma porção do alimento. */
export function gramsOf(foodId, quantity, unit) {
  const fields = {}
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    fields.quantity = `Informe a quantidade entre 0 e ${MAX_QUANTITY}.`
  }
  let grams = null
  if (!fields.quantity) {
    if (unit === 'g') {
      grams = quantity
    } else {
      const portion = portionsOf(foodId).find(item => item.label === unit)
      if (!portion) fields.unit = 'Escolha uma unidade da lista deste alimento.'
      else grams = quantity * portion.grams
    }
    if (grams !== null && (Math.round(grams) < 1 || Math.round(grams) > MAX_GRAMS)) {
      fields.quantity = `A quantidade precisa dar de 1 g a ${MAX_GRAMS} g.`
    }
  }
  if (Object.keys(fields).length) throw new HttpError(422, 'Confira os campos marcados.', fields)
  return Math.round(grams)
}

function foodOf(id) {
  const row = typeof id === 'string' ? FOODS.get(id) : undefined
  if (!row) throw new HttpError(422, 'Escolha um alimento da lista.', { food_id: 'Escolha um alimento da lista.' })
  return row
}

/** Número de refeições de um dia pela programação (0 se a pessoa ainda não escolheu). */
function countFor(schedule, day) {
  return schedule ? schedule.by_weekday[weekdayOf(day)] : 0
}

function mealOf(value, count) {
  const fields = {}
  if (!Number.isInteger(value) || value < 1 || value > MAX_MEALS) fields.meal = 'Escolha a refeição.'
  else if (value > count) fields.meal = count ? `Este dia tem ${count} refeições. Escolha uma delas.` : 'Escolha quantas refeições você faz por dia antes de registrar.'
  if (Object.keys(fields).length) throw new HttpError(422, 'Confira os campos marcados.', fields)
  return value
}

function scheduleOf(body) {
  exact(body, ['daily', 'meals', 'by_weekday'])
  const fields = {}
  const valid = n => Number.isInteger(n) && n >= 1 && n <= MAX_MEALS
  if (typeof body.daily !== 'boolean') fields.daily = 'Escolha se é igual todos os dias.'
  else if (body.daily) {
    if (!valid(body.meals)) fields.meals = `Informe de 1 a ${MAX_MEALS} refeições por dia.`
  } else if (!Array.isArray(body.by_weekday) || body.by_weekday.length !== 7 || !body.by_weekday.every(valid)) {
    fields.by_weekday = `Informe de 1 a ${MAX_MEALS} refeições para cada dia da semana.`
  }
  if (Object.keys(fields).length) throw new HttpError(422, 'Confira os campos marcados.', fields)
  const by_weekday = body.daily ? Array(7).fill(body.meals) : body.by_weekday.slice()
  return { daily: body.daily, meals: body.daily ? body.meals : null, by_weekday, updated_at: new Date().toISOString() }
}

export const diaryMethods = {
  diaryEntries(day) {
    return this.sql.exec("SELECT value FROM records WHERE kind = 'diary' AND json_extract(value, '$.day') = ?", day)
      .toArray().map(row => JSON.parse(row.value))
  },

  /** Dia pedido (padrão: hoje, em São Paulo): programação de refeições, registros, totais por refeição e do dia, e a meta aceita. */
  diaryView(chosen) {
    const day = chosen ?? (this.day ? dayOf(this.day, 'o dia') : todayInSaoPaulo())
    const schedule = this.read(SCHEDULE_KIND, SCHEDULE_ID)
    const count = countFor(schedule, day)
    const entries = this.diaryEntries(day).sort((a, b) =>
      a.meal - b.meal || a.created_at.localeCompare(b.created_at))
    // Registros de um dia com mais refeições (antes de a pessoa reduzir a programação) aparecem como refeições extras.
    const shown = Math.max(count, ...entries.map(entry => entry.meal), 0)
    const target = this.nutritionRecord('target')
    return {
      day,
      weekday: weekdayOf(day),
      weekday_name: WEEKDAYS[weekdayOf(day)],
      schedule: schedule ? { daily: schedule.daily, meals: schedule.meals, by_weekday: schedule.by_weekday } : null,
      entries,
      meals: Array.from({ length: shown }, (_, index) => {
        const slot = index + 1
        return { id: slot, label: slotLabel(slot, count), totals: sumOf(entries.filter(entry => entry.meal === slot)) }
      }),
      totals: sumOf(entries),
      target: target ? { low: target.low, high: target.high } : null,
    }
  },

  diary() { return json(this.diaryView()) },

  diaryFoods() { return json({ foods: searchFoods(this.query) }) },

  /** Programação: `daily` true com `meals` (igual todo dia) ou `daily` false com `by_weekday` (sete números, domingo primeiro). */
  setDiarySchedule(body) {
    const schedule = scheduleOf(body)
    this.write(SCHEDULE_KIND, SCHEDULE_ID, schedule)
    return json(this.diaryView())
  },

  addDiary(body) {
    exact(body, ['day', 'meal', 'food_id', 'quantity', 'unit'])
    const day = dayOf(body.day, 'o dia')
    if (day > todayInSaoPaulo()) throw new HttpError(422, 'Registre o que comeu hoje ou em um dia que já passou.', { day: 'Registre o que comeu hoje ou em um dia que já passou.' })
    const count = countFor(this.read(SCHEDULE_KIND, SCHEDULE_ID), day)
    const meal = mealOf(body.meal, count)
    const row = foodOf(body.food_id)
    const grams = gramsOf(row[0], body.quantity, body.unit)
    const record = {
      day, meal, food_id: row[0], food_name: row[1], quantity: body.quantity, unit: body.unit, grams,
      ...per100g(row, grams), updated_at: new Date().toISOString(),
    }
    const { id } = this.add(KIND, record, this.cap(KIND))
    return json({ ...this.diaryView(day), created_id: id }, 201)
  },

  editDiary(body, id) {
    exact(body, ['meal', 'quantity', 'unit'])
    if (!Object.keys(body).length) throw new HttpError(422, 'Envie ao menos um campo para alterar.')
    const current = this.read(KIND, id)
    if (!current) throw new HttpError(404, 'Este registro não existe.')
    const next = { ...current, updated_at: new Date().toISOString() }
    if (body.meal !== undefined) {
      next.meal = mealOf(body.meal, countFor(this.read(SCHEDULE_KIND, SCHEDULE_ID), current.day))
    }
    if (body.quantity !== undefined || body.unit !== undefined) {
      const quantity = body.quantity ?? current.quantity
      const unit = body.unit ?? current.unit
      const row = foodOf(current.food_id)
      next.grams = gramsOf(row[0], quantity, unit)
      Object.assign(next, { quantity, unit, ...per100g(row, next.grams) })
    }
    this.write(KIND, id, next)
    return json(this.diaryView(next.day))
  },

  removeDiary(_, id) {
    const current = this.read(KIND, id)
    if (!current) throw new HttpError(404, 'Este registro não existe.')
    this.sql.exec("DELETE FROM records WHERE kind = 'diary' AND id = ?", id)
    return json(this.diaryView(current.day))
  },
}
