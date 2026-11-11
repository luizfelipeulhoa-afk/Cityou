// Prédios das atividades: etapa de construção pelo uso real. Funções puras, usadas no servidor e na tela.
// O prédio só avança com dias de prática e semanas com prática; passar o tempo sozinho não faz nada.
// Os limites seguem docs/GAME-DESIGN.md (conclusão em 26 semanas, ou seja, pelo menos seis meses).
import { DOMAINS } from './rules.js'

export const DOMAIN_LABELS = Object.freeze({
  saude: 'Saúde', alimentacao: 'Alimentação', financas: 'Finanças', estudos: 'Estudos', mente: 'Mente', organizacao: 'Organização',
})

// Dias com prática (hábito feito ou passo de meta) e semanas com prática exigidos para cada etapa.
export const STAGES = Object.freeze([
  { stage: 0, nome: 'Terreno', days: 0, weeks: 0 },
  { stage: 1, nome: 'Fundação', days: 8, weeks: 2 },
  { stage: 2, nome: 'Estrutura', days: 30, weeks: 8 },
  { stage: 3, nome: 'Acabamento', days: 70, weeks: 16 },
  { stage: 4, nome: 'Concluído', days: 120, weeks: 26 },
])

/** Tipo de prédio no catálogo para uma área. */
export const kindForDomain = domain => (DOMAINS.includes(domain) ? `dom-${domain}` : null)
export const domainForKind = kind => (typeof kind === 'string' && kind.startsWith('dom-') && DOMAINS.includes(kind.slice(4)) ? kind.slice(4) : null)

/** Semana (segunda a domingo) de um dia 'AAAA-MM-DD', como 'AAAA-Www'. */
export function weekKey(day) {
  const [year, month, date] = day.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, date))
  const weekday = (utc.getUTCDay() + 6) % 7 // segunda = 0
  utc.setUTCDate(utc.getUTCDate() - weekday + 3) // quinta da mesma semana decide o ano
  const firstThursday = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((utc - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Etapa de um prédio a partir dos dias com prática (lista de 'AAAA-MM-DD'). Cada etapa exige dias E semanas. */
export function stageFor(practiceDays) {
  const days = new Set(practiceDays).size
  const weeks = new Set(practiceDays.map(weekKey)).size
  let current = STAGES[0]
  for (const step of STAGES) if (days >= step.days && weeks >= step.weeks) current = step
  const next = STAGES[current.stage + 1] ?? null
  return {
    etapa: current.stage, etapa_nome: current.nome, dias: days, semanas: weeks,
    proxima: next ? { etapa_nome: next.nome, dias: next.days, semanas: next.weeks } : null,
  }
}
