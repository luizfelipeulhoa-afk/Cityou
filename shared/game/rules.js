// Regras puras do jogo, usadas pelo servidor (autoridade) e pela tela (pré-visualização).
// Sem banco, sem rede, sem relógio próprio: tudo entra por parâmetro.
// Os números são propostas de docs/GAME-DESIGN.md e mudam aqui, num lugar só.

// Áreas da vida. Cada atividade pertence a uma; é o que dá nome e tipo ao prédio dela na cidade.
export const DOMAINS = Object.freeze(['saude', 'alimentacao', 'financas', 'estudos', 'mente', 'organizacao'])

export const RULES = Object.freeze({
  levelCap: 60,
  xpBase: 100,       // XP do nível 1 para o 2
  xpStep: 50,        // quanto cada nível seguinte pede a mais
  paidHabitsPerDay: 8,
  paidTasksPerDay: 10,
  backfillDays: 7,   // marcar dias passados: permitido, sem recompensa
  returnAfterDays: 7,
  rewards: Object.freeze({
    welcome: { xp: 0, credits: 50 },
    task: { xp: 10, credits: 10 },
    habit: { xp: 5, credits: 5 },
    goalStep: { xp: 5, credits: 0 },
    goalDone: { xp: 50, credits: 25 },
    record: { xp: 2, credits: 0 },
    comeback: { xp: 0, credits: 20 },
  }),
  // Dias ativos nos últimos 7 (hoje incluído) -> bônus em centésimos (100 = normal).
  presenceTiers: Object.freeze([
    { minDays: 7, xp: 200, credits: 125 },
    { minDays: 5, xp: 150, credits: 110 },
    { minDays: 3, xp: 125, credits: 100 },
    { minDays: 0, xp: 100, credits: 100 },
  ]),
  // O que cada nível libera. Nível é porta, não poder.
  unlocks: Object.freeze({ 5: ['travel'] }),
  // Comprovação opcional: foto ou texto anexados a uma atividade feita. Rende um bônus em créditos, com teto diário.
  // O app não consegue provar que a atividade aconteceu; a comprovação só eleva o esforço de quem quiser o bônus.
  proof: Object.freeze({ bonusCredits: 5, maxBonusPerDay: 3, noteMinChars: 20, noteMaxChars: 500, photoMaxBytes: 250_000, maxStored: 100 }),
})

/** XP para ir do nível `level` ao seguinte. */
export function xpToNext(level, rules = RULES) {
  return rules.xpBase + rules.xpStep * (level - 1)
}

/**
 * Soma XP e sobe quantos níveis couberem. XP nunca diminui.
 * `while`, não `if`: uma recompensa grande pode valer mais de um nível.
 */
export function applyXp(player, amount, rules = RULES) {
  const gained = Math.max(0, Math.floor(amount))
  let { level, xp } = player
  const lifetimeXp = (player.lifetimeXp ?? 0) + gained
  xp += gained
  const events = []
  while (level < rules.levelCap && xp >= xpToNext(level, rules)) {
    xp -= xpToNext(level, rules)
    level += 1
    events.push({ type: 'level_up', level, unlocks: rules.unlocks[level] ?? [] })
  }
  return { player: { ...player, level, xp, lifetimeXp }, events }
}

/** Bônus de presença a partir dos dias ativos nos últimos 7. */
export function presenceBonus(activeDays, rules = RULES) {
  const days = Math.max(0, Math.min(7, Math.floor(activeDays)))
  const tier = rules.presenceTiers.find(entry => days >= entry.minDays)
  return { activeDays: days, xp: tier.xp, credits: tier.credits }
}

/** Aplica o bônus, arredondando para baixo. Nunca devolve menos que a base. */
export function withBonus(base, bonus) {
  return {
    xp: Math.floor((base.xp * bonus.xp) / 100),
    credits: Math.floor((base.credits * bonus.credits) / 100),
  }
}

/** Dia local 'AAAA-MM-DD' de um instante, no fuso da pessoa. O servidor é o relógio. */
export function dayKey(instant, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

/** Os 7 dias que terminam em `today` (inclusive), do mais antigo ao mais novo. */
export function lastSevenDays(today) {
  const [year, month, day] = today.split('-').map(Number)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - (6 - index)))
    return date.toISOString().slice(0, 10)
  })
}

/**
 * Recompensa de uma ação. `kind` é uma chave de RULES.rewards.
 * `context`: { day, today, paidToday, activeDaysLast7 }.
 * - dia passado (até backfillDays) é aceito, sem recompensa;
 * - hábitos e tarefas têm teto diário de recompensas pagas;
 * - o bônus de presença só vale para o que a pessoa ganha fazendo.
 */
export function rewardFor(kind, context = {}, rules = RULES) {
  const base = rules.rewards[kind]
  if (!base) throw new Error(`Recompensa desconhecida: ${kind}`)
  const none = { xp: 0, credits: 0, multiplier: { xp: 100, credits: 100 }, reason: null }
  if (context.day && context.today && context.day !== context.today) return { ...none, reason: 'past_day' }
  const cap = kind === 'habit' ? rules.paidHabitsPerDay : kind === 'task' ? rules.paidTasksPerDay : Infinity
  if ((context.paidToday ?? 0) >= cap) return { ...none, reason: 'daily_cap' }
  if (kind === 'welcome' || kind === 'comeback') return { ...base, multiplier: { xp: 100, credits: 100 }, reason: null }
  const bonus = presenceBonus(context.activeDaysLast7 ?? 0, rules)
  return { ...withBonus(base, bonus), multiplier: { xp: bonus.xp, credits: bonus.credits }, reason: null }
}

/** Um dia `day` pode ser marcado hoje? Nunca no futuro, e até backfillDays para trás. */
export function canMarkDay(day, today, rules = RULES) {
  if (day > today) return false
  const diff = (Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000
  return diff <= rules.backfillDays
}
