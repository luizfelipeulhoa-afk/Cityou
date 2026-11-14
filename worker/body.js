// Composição corporal da aba Fitness (decisão do dono, 14/11/2026; ideia em docs/ideias, pesquisa no projeto
// "CityouApp", nutricao/atualizacao-2026-11-14-f-composicao-corporal.md). Registro manual: percentual de gordura,
// massa magra opcional, método e dia. Nada é 100%: bioimpedância e dobras cutâneas erram vários pontos numa medida
// isolada, então a tela e a base calórica usam a média das últimas medidas, não um valor solto. Nada paga moedas ou XP.
import { HttpError, json } from './http.js'
import { atLeastOne, dayOf, exact, text, todayInSaoPaulo } from './records.js'

const KIND = 'bodycomp'
export const BODY_METHODS = ['bia', 'skinfold', 'dexa', 'other']
const DAY_MS = 86_400_000
const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
// Quantas medidas entram na média e até quantos dias atrás elas valem para a base calórica.
export const TREND_COUNT = 3
export const TREND_MAX_AGE_DAYS = 60

function fatOf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 2 || value > 70) {
    throw new HttpError(422, 'Informe o percentual de gordura entre 2 e 70.', { fat_pct: 'Informe o percentual de gordura entre 2 e 70.' })
  }
  return Math.round(value * 10) / 10
}

function leanOf(value) {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value) || value < 15_000 || value > 200_000) {
    throw new HttpError(422, 'A massa magra precisa ficar entre 15 e 200 kg (em gramas, número inteiro), ou vazia.', { lean_grams: 'Informe a massa magra entre 15 e 200 kg, ou deixe vazia.' })
  }
  return value
}

function methodOf(value) {
  if (!BODY_METHODS.includes(value)) throw new HttpError(422, 'Escolha o método da medida.', { method: 'Escolha o método da medida.' })
  return value
}

/**
 * Média das últimas medidas (até 3, dos últimos 60 dias até `today`): percentual de gordura e, se todas tiverem,
 * massa magra. null sem medidas recentes.
 */
export function bodyTrend(items, today) {
  const since = shiftDay(today, -TREND_MAX_AGE_DAYS)
  const recent = items.filter(item => item.day >= since && item.day <= today)
    .sort((a, b) => b.day.localeCompare(a.day)).slice(0, TREND_COUNT)
  if (!recent.length) return null
  const fat = Math.round(recent.reduce((sum, item) => sum + item.fat_pct, 0) / recent.length * 10) / 10
  const leans = recent.map(item => item.lean_grams).filter(Number.isInteger)
  return {
    fat_pct: fat,
    lean_grams: leans.length === recent.length ? Math.round(leans.reduce((a, b) => a + b, 0) / leans.length) : null,
    count: recent.length, from: recent.at(-1).day, to: recent[0].day,
  }
}

export const bodyMethods = {
  allBodyComposition() {
    return this.sql.exec("SELECT value FROM records WHERE kind = 'bodycomp'").toArray().map(row => JSON.parse(row.value))
  },

  bodyView() {
    const items = this.allBodyComposition().sort((a, b) => b.day.localeCompare(a.day))
    return { body_composition: items, body_trend: bodyTrend(items, todayInSaoPaulo()) }
  },

  bodyComposition() { return json(this.bodyView()) },

  addBodyComposition(body) {
    exact(body, ['day', 'fat_pct', 'lean_grams', 'method', 'note'])
    const day = dayOf(body.day, 'o dia')
    if (day > todayInSaoPaulo()) throw new HttpError(422, 'Registre uma medida de hoje ou de um dia que já passou.')
    const record = {
      day, fat_pct: fatOf(body.fat_pct), lean_grams: leanOf(body.lean_grams), method: methodOf(body.method),
      note: text(body.note ?? '', 'nota', { max: 200 }), updated_at: new Date().toISOString(),
    }
    if (this.sql.exec("SELECT 1 FROM records WHERE kind = 'bodycomp' AND json_extract(value, '$.day') = ?", day).toArray().length) {
      throw new HttpError(422, 'Já existe uma medida neste dia; edite-a.')
    }
    const { id } = this.add(KIND, record, this.cap(KIND))
    return json({ ...this.bodyView(), created_id: id }, 201)
  },

  editBodyComposition(body, id) {
    exact(body, ['fat_pct', 'lean_grams', 'method', 'note'])
    atLeastOne(body)
    const current = this.read(KIND, id)
    if (!current) throw new HttpError(404, 'Esta medida não existe.')
    const next = { ...current, updated_at: new Date().toISOString() }
    if (body.fat_pct !== undefined) next.fat_pct = fatOf(body.fat_pct)
    if (body.lean_grams !== undefined) next.lean_grams = leanOf(body.lean_grams)
    if (body.method !== undefined) next.method = methodOf(body.method)
    if (body.note !== undefined) next.note = text(body.note, 'nota', { max: 200 })
    this.write(KIND, id, next)
    return json(this.bodyView())
  },

  removeBodyComposition(_, id) {
    if (!this.read(KIND, id)) throw new HttpError(404, 'Esta medida não existe.')
    this.sql.exec("DELETE FROM records WHERE kind = 'bodycomp' AND id = ?", id)
    return json(this.bodyView())
  },
}
