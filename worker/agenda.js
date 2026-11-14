// Agenda real (etapa 5): compromissos e dias de respiro, guardados em `records` (kind `event`) do Durable Object.
// Sem status e sem atraso: o que passou simplesmente passou. Nada aqui paga moedas ou XP.
import { HttpError, json } from './http.js'
import { MONTH, TIME, atLeastOne, dayOf, exact, text, todayInSaoPaulo } from './records.js'

const FIELDS = ['kind', 'title', 'day', 'start_time', 'end_time', 'firmness', 'place', 'notes']
const EDITABLE = FIELDS.filter(key => key !== 'kind')
export const RESPIRO_TITLE = 'Dia de respiro'

function timeOf(value, label) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !TIME.test(value)) throw new HttpError(422, `Confira ${label} (formato HH:MM).`)
  return value
}

/** Valida o registro inteiro (novo ou já mesclado com a edição) e devolve só os campos que o servidor guarda. */
function normalize(raw) {
  const kind = raw.kind ?? 'compromisso'
  if (!['compromisso', 'respiro'].includes(kind)) throw new HttpError(422, 'Escolha compromisso ou respiro.')
  const day = dayOf(raw.day, 'o dia')
  if (kind === 'respiro') {
    const extras = [raw.start_time, raw.end_time].some(value => value != null) || (raw.notes ?? '') !== '' || (raw.place ?? '') !== ''
    if (extras) throw new HttpError(422, 'Um dia de respiro não tem horário, local nem notas.')
    return { kind, title: RESPIRO_TITLE, day, start_time: null, end_time: null, firmness: 'leve', place: '', notes: '' }
  }
  const start = timeOf(raw.start_time, 'o início')
  const end = timeOf(raw.end_time, 'o fim')
  if (end && !start) throw new HttpError(422, 'Informe o início antes do fim.')
  if (end && end < start) throw new HttpError(422, 'O fim não pode ser antes do início.')
  const firmness = raw.firmness ?? 'firme'
  if (!['firme', 'leve'].includes(firmness)) throw new HttpError(422, 'Escolha firme ou leve (se der).')
  return {
    kind, day, start_time: start, end_time: end, firmness,
    title: text(raw.title, 'título', { min: 1, max: 180 }),
    place: text(raw.place ?? '', 'local', { max: 80 }),
    notes: text(raw.notes ?? '', 'notas', { max: 1000, multiline: true }),
  }
}

export const agendaMethods = {
  eventsOfDay(day) {
    return this.sql.exec("SELECT value FROM records WHERE kind = 'event' AND json_extract(value, '$.day') = ?", day)
      .toArray().map(row => JSON.parse(row.value))
  },

  // Um dia de respiro é um dia sem obrigação: só admite compromisso leve ("se der"), e só um respiro por dia.
  checkRespiro(event, ignoreId = null) {
    const others = this.eventsOfDay(event.day).filter(other => other.id !== ignoreId)
    if (event.kind === 'respiro') {
      if (others.some(other => other.kind === 'respiro')) throw new HttpError(422, 'Este dia já é um dia de respiro.')
      if (others.some(other => other.firmness === 'firme')) throw new HttpError(422, 'Este dia tem um compromisso firme. Torne-o leve (se der) para marcar o respiro.')
    } else if (event.firmness === 'firme' && others.some(other => other.kind === 'respiro')) {
      throw new HttpError(422, 'Este dia é de respiro: só cabe um compromisso leve (se der).')
    }
  },

  monthOf() {
    const month = this.month ?? todayInSaoPaulo().slice(0, 7)
    if (!MONTH.test(month)) throw new HttpError(422, 'Confira o mês (AAAA-MM).')
    return month
  },

  agendaView() {
    const month = this.monthOf()
    const events = this.sql.exec("SELECT value FROM records WHERE kind = 'event' AND substr(json_extract(value, '$.day'), 1, 7) = ?", month)
      .toArray().map(row => JSON.parse(row.value))
      .sort((a, b) => a.day.localeCompare(b.day) || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.created_at.localeCompare(b.created_at))
    return { events, events_month: month }
  },

  addEvent(body) {
    exact(body, FIELDS)
    const event = normalize(body)
    this.checkRespiro(event)
    const { id } = this.add('event', { ...event, updated_at: new Date().toISOString() }, this.cap('event'))
    return json({ ...this.overview(), created_id: id }, 201)
  },

  editEvent(body, id) {
    exact(body, EDITABLE)
    atLeastOne(body)
    const current = this.read('event', id)
    if (!current) throw new HttpError(404, 'Este compromisso não existe.')
    const { id: _id, created_at, updated_at, ...fields } = current
    const event = normalize({ ...fields, ...body })
    this.checkRespiro(event, id)
    this.write('event', id, { ...event, id, created_at, updated_at: new Date().toISOString() })
    return json(this.overview())
  },

  removeEvent(_, id) {
    if (!this.read('event', id)) throw new HttpError(404, 'Este compromisso não existe.')
    this.sql.exec("DELETE FROM records WHERE kind = 'event' AND id = ?", id)
    return json(this.overview())
  },
}
