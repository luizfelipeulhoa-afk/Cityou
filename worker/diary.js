// Diário alimentar da aba Alimentação: a pessoa busca um alimento pelo nome (lista fechada da base TACO e USDA),
// escolhe uma unidade ou gramas e informa a quantidade. Não há texto livre de refeição: o servidor só aceita um
// `food_id` da base e calcula as calorias e os macronutrientes a partir dela (`shared/game/foods-base.js`), então
// o mesmo alimento dá o mesmo número para todo mundo. Nada aqui paga moedas ou XP.
import { HttpError, json } from './http.js'
import { exact, dayOf, todayInSaoPaulo } from './records.js'
import { FOOD_BASE } from '../shared/game/foods-base.js'
import { FOOD_PORTIONS } from '../shared/game/foods-portions.js'

const KIND = 'diary'
export const MEALS = [['cafe', 'Café da manhã'], ['almoco', 'Almoço'], ['lanche', 'Lanche'], ['jantar', 'Jantar'], ['outros', 'Outros']]
const MEAL_IDS = MEALS.map(([id]) => id)
const MAX_GRAMS = 5000
const MAX_QUANTITY = 1000
const SEARCH_LIMIT = 15
const NUTRIENTS = ['kcal', 'protein', 'fat', 'carb', 'fiber']

const normalize = value => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

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
  fiber: round1(row[9] * grams / 100),
})

function sumOf(entries) {
  const totals = Object.fromEntries(NUTRIENTS.map(key => [key, 0]))
  for (const entry of entries) for (const key of NUTRIENTS) totals[key] += entry[key]
  return Object.fromEntries(NUTRIENTS.map(key => [key, key === 'kcal' ? Math.round(totals[key]) : round1(totals[key])]))
}

function portionsOf(id) {
  return (FOOD_PORTIONS[id] ?? []).map(([label, grams]) => ({ label, grams }))
}

/** Busca por nome, sem acento e sem distinguir maiúsculas. Todas as palavras precisam aparecer no nome. */
export function searchFoods(query) {
  const clean = normalize(query ?? '')
  const tokens = clean.split(/\s+/).filter(Boolean).slice(0, 6)
  if (clean.length < 2 || !tokens.length) throw new HttpError(422, 'Digite pelo menos 2 letras do alimento.')
  const matches = INDEX.filter(entry => tokens.every(token => entry.norm.includes(token)))
  matches.sort((a, b) => {
    const rank = (x, y) => Number(!x.norm.startsWith(clean)) - Number(!y.norm.startsWith(clean))
    return rank(a, b) || a.norm.length - b.norm.length || a.norm.localeCompare(b.norm)
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

function mealOf(value) {
  if (!MEAL_IDS.includes(value)) throw new HttpError(422, 'Escolha a refeição.', { meal: 'Escolha a refeição.' })
  return value
}

function foodOf(id) {
  const row = typeof id === 'string' ? FOODS.get(id) : undefined
  if (!row) throw new HttpError(422, 'Escolha um alimento da lista.', { food_id: 'Escolha um alimento da lista.' })
  return row
}

export const diaryMethods = {
  diaryEntries(day) {
    return this.sql.exec("SELECT value FROM records WHERE kind = 'diary' AND json_extract(value, '$.day') = ?", day)
      .toArray().map(row => JSON.parse(row.value))
  },

  /** Dia pedido (padrão: hoje, em São Paulo): registros, totais por refeição e do dia, e a meta aceita, se houver. */
  diaryView(chosen) {
    const day = chosen ?? (this.day ? dayOf(this.day, 'o dia') : todayInSaoPaulo())
    const entries = this.diaryEntries(day).sort((a, b) =>
      MEAL_IDS.indexOf(a.meal) - MEAL_IDS.indexOf(b.meal) || a.created_at.localeCompare(b.created_at))
    const target = this.nutritionRecord('target')
    return {
      day,
      entries,
      meals: MEALS.map(([id, label]) => ({ id, label, totals: sumOf(entries.filter(entry => entry.meal === id)) })),
      totals: sumOf(entries),
      target: target ? { low: target.low, high: target.high } : null,
    }
  },

  diary() { return json(this.diaryView()) },

  diaryFoods() { return json({ foods: searchFoods(this.query) }) },

  addDiary(body) {
    exact(body, ['day', 'meal', 'food_id', 'quantity', 'unit'])
    const day = dayOf(body.day, 'o dia')
    if (day > todayInSaoPaulo()) throw new HttpError(422, 'Registre o que comeu hoje ou em um dia que já passou.', { day: 'Registre o que comeu hoje ou em um dia que já passou.' })
    const meal = mealOf(body.meal)
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
    if (body.meal !== undefined) next.meal = mealOf(body.meal)
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
