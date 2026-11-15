import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, areaBreakdown, cumulativeSeries, dayOf, dayRange, monthBalance, niceTicks, smoothPath, sparkGeometry } from '../src/personal/dashboardData.js'

test('addDays e dayRange atravessam mês e ano sem depender do fuso', () => {
  assert.equal(addDays('2026-11-15', -15), '2026-10-31')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.deepEqual(dayRange('2026-03-02', 4), ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
})

test('dayOf usa o dia de Brasília e ignora o que não é data', () => {
  assert.equal(dayOf('2026-11-15T01:30:00.000Z'), '2026-11-14') // 22h30 do dia 14 em Brasília
  assert.equal(dayOf('2026-11-15T12:00:00.000Z'), '2026-11-15')
  assert.equal(dayOf(null), '')
  assert.equal(dayOf('não é data'), '')
})

test('a série acumulada só sobe: dia parado fica no mesmo valor e o que está fora da janela não conta', () => {
  const days = dayRange('2026-11-10', 5)
  const series = cumulativeSeries(days, ['2026-11-06', '2026-11-06', '2026-11-08', '2026-11-10', '2026-11-01', '2026-11-11'])
  assert.deepEqual(series.map(p => p.value), [2, 2, 3, 3, 4])
  for (let i = 1; i < series.length; i++) assert.ok(series[i].value >= series[i - 1].value)
  assert.deepEqual(cumulativeSeries(days, []).map(p => p.value), [0, 0, 0, 0, 0])
})

test('tarefas por área: só as abertas, da maior para a menor, e área desconhecida cai em Organização', () => {
  const areas = [['saude', 'Saúde'], ['estudos', 'Estudos'], ['organizacao', 'Organização']]
  const rows = areaBreakdown([
    { status: 'todo', domain: 'estudos' }, { status: 'todo', domain: 'estudos' }, { status: 'todo', domain: 'saude' },
    { status: 'done', domain: 'saude' }, { status: 'todo', completed_at: '2026-11-01T00:00:00Z', domain: 'saude' }, { status: 'todo', domain: 'xyz' },
  ], areas)
  assert.deepEqual(rows, [{ id: 'estudos', label: 'Estudos', count: 2 }, { id: 'organizacao', label: 'Organização', count: 1 }, { id: 'saude', label: 'Saúde', count: 1 }])
  assert.deepEqual(areaBreakdown([], areas), [])
})

test('saldo do mês: acumula entradas e saídas do mês de hoje, dia a dia', () => {
  const series = monthBalance([
    { day: '2026-11-02', direction: 'income', amount_cents: 10000 },
    { day: '2026-11-03', direction: 'expense', amount_cents: 2500 },
    { day: '2026-10-30', direction: 'income', amount_cents: 99999 },
  ], '2026-11-04')
  assert.deepEqual(series, [
    { day: '2026-11-01', value: 0 }, { day: '2026-11-02', value: 10000 }, { day: '2026-11-03', value: 7500 }, { day: '2026-11-04', value: 7500 },
  ])
})

test('marcas do eixo: teto redondo, começa em zero e sempre cobre o máximo', () => {
  assert.deepEqual(niceTicks(0), { max: 1, ticks: [0, 1] })
  assert.deepEqual(niceTicks(3).ticks, [0, 1, 2, 3])
  assert.deepEqual(niceTicks(37).ticks, [0, 10, 20, 30, 40])
  for (const max of [1, 3, 7, 12, 99, 101, 480, 5000]) {
    const { max: top, ticks } = niceTicks(max)
    assert.ok(top >= max && ticks[0] === 0 && ticks.at(-1) === top && ticks.length <= 6, `max ${max}`)
  }
})

test('a curva suave não passa por cima nem por baixo dos pontos vizinhos', () => {
  const points = [[0, 100], [10, 100], [20, 60], [30, 60], [40, 20]]
  const path = smoothPath(points)
  assert.ok(path.startsWith('M0 100'))
  const controls = [...path.matchAll(/C([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)]
  assert.equal(controls.length, points.length - 1)
  controls.forEach((m, i) => {
    const lo = Math.min(points[i][1], points[i + 1][1]), hi = Math.max(points[i][1], points[i + 1][1])
    for (const y of [Number(m[2]), Number(m[4])]) assert.ok(y >= lo - 0.11 && y <= hi + 0.11, `segmento ${i}: ${y} fora de ${lo}..${hi}`)
  })
  assert.equal(smoothPath([]), '')
  assert.equal(smoothPath([[5, 5]]), 'M5 5')
})

test('minigráfico: curva, área fechada e ponto final; série parada vira linha reta', () => {
  const geo = sparkGeometry([1, 3, 2, 8], 100, 40)
  assert.equal(geo.points.length, 4)
  assert.ok(geo.area.endsWith('Z') && geo.line.startsWith('M'))
  assert.equal(geo.last.x, 97)
  assert.ok(geo.last.y < geo.points[0][1], 'o valor maior fica mais alto na tela')
  const flat = sparkGeometry([5, 5, 5], 100, 40)
  assert.equal(flat.flat, true)
  assert.ok(flat.points.every(p => p[1] === 20))
  // Escala honesta: com `zero`, uma queda pequena de um saldo grande fica pequena; com `minSpan`, oscilação miúda fica rasa.
  const balance = [450000, 450000, 431210]
  const dropRange = g => Math.max(...g.points.map(p => p[1])) - Math.min(...g.points.map(p => p[1]))
  assert.ok(dropRange(sparkGeometry(balance, 100, 40)) > 30, 'sem zero a queda ocupa a altura toda')
  assert.ok(dropRange(sparkGeometry(balance, 100, 40, { zero: true })) < 3, 'com zero a queda de 4% é quase plana')
  const kilos = [78000, 78600, 77900, 78300]
  assert.ok(dropRange(sparkGeometry(kilos, 100, 40, { minSpan: 2000 })) < 15, 'com faixa mínima de 2 kg a ondinha é rasa')
  assert.equal(sparkGeometry([1], 100, 40), null)
  assert.equal(sparkGeometry([], 100, 40), null)
})
