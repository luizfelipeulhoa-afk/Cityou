// Peso real (etapa 5): uma pesagem por dia, em gramas, e a média móvel de 7 dias. Sem meta, sem "bom" ou "ruim":
// a tendência só descreve (estável, subindo, descendo) e nada aqui paga moedas ou XP.
import { HttpError, json } from './http.js'
import { atLeastOne, dayOf, exact, text, todayInSaoPaulo } from './records.js'

const DAY_MS = 86_400_000
const VISIBLE_DAYS = 120
const DEAD_BAND = 0.005
const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

function gramsOf(value) {
  if (!Number.isInteger(value) || value < 20_000 || value > 400_000) throw new HttpError(422, 'O peso precisa ficar entre 20 e 400 kg (em gramas, número inteiro).')
  return value
}

/** Pontos {day, grams, avg_grams} em ordem de dia: avg_grams é a média das pesagens dos 7 dias que terminam naquele dia. */
export function weightTrend(weights) {
  const sorted = [...weights].sort((a, b) => a.day.localeCompare(b.day))
  const prefix = [0]
  for (const weight of sorted) prefix.push(prefix[prefix.length - 1] + weight.grams)
  let from = 0
  return sorted.map((weight, index) => {
    const lowest = shiftDay(weight.day, -6)
    while (sorted[from].day < lowest) from++
    return { day: weight.day, grams: weight.grams, avg_grams: Math.round((prefix[index + 1] - prefix[from]) / (index + 1 - from)) }
  })
}

/** 'estavel', 'subindo', 'descendo' ou null (sem pesagem recente ou sem uma média de 2 semanas antes). Banda morta de ±0,5%. */
export function weightDirection(points, today) {
  const latest = points.at(-1)
  if (!latest || latest.day < shiftDay(today, -14)) return null
  const limit = shiftDay(latest.day, -14)
  const reference = points.findLast(point => point.day <= limit)
  if (!reference) return null
  const change = (latest.avg_grams - reference.avg_grams) / reference.avg_grams
  return change > DEAD_BAND ? 'subindo' : change < -DEAD_BAND ? 'descendo' : 'estavel'
}

export const weightMethods = {
  allWeights() {
    return this.sql.exec("SELECT value FROM records WHERE kind = 'weight'").toArray().map(row => JSON.parse(row.value))
  },

  weightView(days = VISIBLE_DAYS) {
    const today = todayInSaoPaulo()
    const all = this.allWeights()
    const points = weightTrend(all)
    const since = days ? shiftDay(today, -days) : ''
    return {
      weights: all.filter(item => item.day >= since).sort((a, b) => b.day.localeCompare(a.day)),
      weight_trend: points.filter(point => point.day >= since),
      weight_direction: weightDirection(points, today),
    }
  },

  weightsHistory() { return json(this.weightView(0)) },

  addWeight(body) {
    exact(body, ['day', 'grams', 'note'])
    const day = dayOf(body.day, 'o dia')
    if (day > todayInSaoPaulo()) throw new HttpError(422, 'Registre uma pesagem de hoje ou de um dia que já passou.')
    const grams = gramsOf(body.grams)
    const note = text(body.note ?? '', 'nota', { max: 200 })
    if (this.sql.exec("SELECT 1 FROM records WHERE kind = 'weight' AND json_extract(value, '$.day') = ?", day).toArray().length) {
      throw new HttpError(422, 'Já existe uma pesagem neste dia; edite-a.')
    }
    const { id } = this.add('weight', { day, grams, note, updated_at: new Date().toISOString() }, this.cap('weight'))
    return json({ ...this.overview(), created_id: id }, 201)
  },

  // O dia não muda: para outro dia, apague e registre de novo.
  editWeight(body, id) {
    exact(body, ['grams', 'note'])
    atLeastOne(body)
    const current = this.read('weight', id)
    if (!current) throw new HttpError(404, 'Esta pesagem não existe.')
    const next = { ...current, updated_at: new Date().toISOString() }
    if (body.grams !== undefined) next.grams = gramsOf(body.grams)
    if (body.note !== undefined) next.note = text(body.note, 'nota', { max: 200 })
    this.write('weight', id, next)
    return json(this.overview())
  },

  removeWeight(_, id) {
    if (!this.read('weight', id)) throw new HttpError(404, 'Esta pesagem não existe.')
    this.sql.exec("DELETE FROM records WHERE kind = 'weight' AND id = ?", id)
    return json(this.overview())
  },
}
