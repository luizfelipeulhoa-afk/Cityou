// Ajudantes dos registros da Agenda, dos Projetos e do Peso (etapa 5): validação estrita e tetos por conta.
// Nada aqui vem do navegador além de texto, datas e números do próprio registro: moedas, XP, nível e desbloqueio
// nunca são aceitos (`exact` recusa qualquer campo fora da lista).
import { HttpError } from './http.js'

export const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
export const todayInSaoPaulo = (date = new Date()) => dateFormatter.format(date)

export function isDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && !value.startsWith('0000')
}

// Tetos por conta: um tipo que cresce todo dia (peso) precisa de mais espaço que um cadastro (projetos).
export const RECORD_CAPS = { project: 100, event: 1000, weight: 1500 }

/** Teto do tipo. `CITYOU_TEST_CAPS` (JSON) só existe nas configurações de teste e baixa o teto para os testes. */
export function capOf(env, kind) {
  try {
    const override = JSON.parse(env?.CITYOU_TEST_CAPS ?? '{}')[kind]
    if (Number.isInteger(override) && override > 0) return override
  } catch { /* Valor inválido: vale o teto de produção. */ }
  return RECORD_CAPS[kind]
}

export const capMessage = cap => `Você chegou ao limite de ${cap} registros deste tipo. Apague algum para continuar.`

/** Só aceita as chaves listadas: qualquer outra (credits, xp, goal...) é 422. */
export function exact(body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new HttpError(422, `Campo não aceito: ${key}`)
  }
  return body
}

/** Edição parcial: pelo menos um campo. */
export function atLeastOne(body) {
  if (!Object.keys(body).length) throw new HttpError(422, 'Envie ao menos um campo para alterar.')
}

/** Texto limpo: string, sem espaços nas pontas, sem caracteres de controle (quebra de linha só se `multiline`). */
export function text(value, label, { min = 0, max, multiline = false } = {}) {
  const bad = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/
  if (typeof value !== 'string' || bad.test(value)) throw new HttpError(422, `Confira o campo ${label}.`)
  const clean = value.trim()
  if (clean.length < min || clean.length > max) {
    throw new HttpError(422, min > 0 ? `${label}: escreva de ${min} a ${max} caracteres.` : `${label}: aceita até ${max} caracteres.`)
  }
  return clean
}

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
export const DAY_MIN = '2000-01-01'
export const DAY_MAX = '2100-12-31'

export function dayOf(value, label = 'a data') {
  if (!isDate(value) || value < DAY_MIN || value > DAY_MAX) throw new HttpError(422, `Confira ${label}.`)
  return value
}

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
