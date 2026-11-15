// Contas puras do "Seu dia" (sem Vue, sem DOM): as séries dos minigráficos e do gráfico de área.
// Regra do painel (docs/DASHBOARD.md, "Linguagem e ética"): só ganho. Por isso as séries são acumuladas (nunca caem) e
// um dia sem registro não vira buraco no gráfico; a pessoa que volta depois de uma pausa vê o que já tem.

const DAY = 86400000
const SP = 'America/Sao_Paulo'
const spDay = new Intl.DateTimeFormat('en-CA', { timeZone: SP, year: 'numeric', month: '2-digit', day: '2-digit' })

const toTime = day => Date.parse(`${day}T12:00:00Z`)
const toDay = time => new Date(time).toISOString().slice(0, 10)

// 'YYYY-MM-DD' somado de n dias (n pode ser negativo), sem depender do fuso do aparelho.
export const addDays = (day, n) => toDay(toTime(day) + n * DAY)

// Os `days` dias que terminam em `today`, do mais antigo ao de hoje.
export const dayRange = (today, days) => Array.from({ length: days }, (_, i) => addDays(today, i - days + 1))

// Dia civil de Brasília de um instante ISO (`completed_at` das tarefas vem em UTC). Vazio ou inválido: ''.
export function dayOf(iso) {
  const time = Date.parse(iso)
  return Number.isFinite(time) ? spDay.format(time) : ''
}

// Quantos eventos aconteceram da primeira data da janela até cada dia dela. `events` é uma lista de 'YYYY-MM-DD'.
// Evento antes da janela não conta; depois dela, também não. Nunca diminui.
export function cumulativeSeries(days, events) {
  const first = days[0], last = days.at(-1)
  const perDay = new Map()
  for (const day of events) if (day >= first && day <= last) perDay.set(day, (perDay.get(day) || 0) + 1)
  let total = 0
  return days.map(day => ({ day, value: (total += perDay.get(day) || 0) }))
}

// Tarefas ainda abertas, por área, da maior para a menor; área sem tarefa não aparece. `areas` é [[id, nome], …].
export function areaBreakdown(tasks, areas) {
  const names = new Map(areas)
  const counts = new Map()
  for (const task of tasks) {
    if (task.status === 'done' || task.completed_at) continue
    const id = names.has(task.domain) ? task.domain : 'organizacao'
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return [...counts].map(([id, count]) => ({ id, label: names.get(id) || id, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
}

// Saldo acumulado dia a dia, do primeiro dia do mês de `today` até hoje, em centavos.
export function monthBalance(transactions, today) {
  const month = today.slice(0, 7)
  const delta = new Map()
  for (const t of transactions) {
    if (t.day?.slice(0, 7) !== month) continue
    delta.set(t.day, (delta.get(t.day) || 0) + (t.direction === 'income' ? t.amount_cents : -t.amount_cents))
  }
  const days = dayRange(today, Number(today.slice(8, 10)))
  let total = 0
  return days.map(day => ({ day, value: (total += delta.get(day) || 0) }))
}

// Marcas do eixo vertical: um teto "redondo" (1, 2, 5, 10, 20, 50…) com no máximo `count` divisões, sempre com 0 embaixo.
export function niceTicks(max, count = 4) {
  const top = Math.max(1, Math.ceil(max))
  const rough = top / count
  const base = 10 ** Math.floor(Math.log10(rough))
  // Contagens são inteiras: a divisão nunca é menor que 1.
  const step = Math.max(1, [1, 2, 5, 10].map(m => m * base).find(s => s >= rough) || 10 * base)
  const ceiling = Math.ceil(top / step) * step
  return { max: ceiling, ticks: Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => i * step) }
}

// Curva suave que passa pelos pontos sem passar por baixo nem por cima deles (spline cúbica monótona, Fritsch-Carlson):
// uma série acumulada que fica parada não ganha ondas. `points` é [[x, y], …] com x crescente.
export function smoothPath(points) {
  const n = points.length
  const f = v => +v.toFixed(1)
  if (!n) return ''
  if (n === 1) return `M${f(points[0][0])} ${f(points[0][1])}`
  const dx = [], slope = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0]
    slope[i] = dx[i] ? (points[i + 1][1] - points[i][1]) / dx[i] : 0
  }
  const tan = [slope[0]]
  for (let i = 1; i < n - 1; i++) tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  tan[n - 1] = slope[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tan[i] = 0; tan[i + 1] = 0; continue }
    const a = tan[i] / slope[i], b = tan[i + 1] / slope[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); tan[i] = k * a * slope[i]; tan[i + 1] = k * b * slope[i] }
  }
  let path = `M${f(points[0][0])} ${f(points[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = dx[i] / 3
    path += `C${f(x0 + h)} ${f(y0 + tan[i] * h)} ${f(x1 - h)} ${f(y1 - tan[i + 1] * h)} ${f(x1)} ${f(y1)}`
  }
  return path
}

// Geometria de um minigráfico: pontos em px, curva, área fechada na base e a última posição (o ponto do fim da linha).
// Série sem variação (ou com menos de 2 valores) vira uma linha reta no meio, nunca uma divisão por zero.
// A escala não exagera: `zero` inclui o 0 na faixa (um saldo que cai 4% não vira um penhasco) e `minSpan` é a menor faixa
// que o gráfico mostra (meio quilo de oscilação no peso fica uma ondinha, não uma montanha).
export function sparkGeometry(values, width, height, { pad = 3, zero = false, minSpan = 0 } = {}) {
  const n = values.length
  if (n < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  let lo = zero ? Math.min(min, 0) : min, hi = zero ? Math.max(max, 0) : max
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2 }
  const span = hi - lo
  const x = i => pad + (i / (n - 1)) * (width - pad * 2)
  const y = v => (span ? height - pad - ((v - lo) / span) * (height - pad * 2) : height / 2)
  const points = values.map((v, i) => [x(i), y(v)])
  const line = smoothPath(points)
  const last = points.at(-1)
  return { points, line, area: `${line}L${last[0].toFixed(1)} ${height}L${points[0][0].toFixed(1)} ${height}Z`, last: { x: last[0], y: last[1] }, flat: min === max }
}
