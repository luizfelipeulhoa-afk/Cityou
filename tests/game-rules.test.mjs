import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RULES, applyXp, canMarkDay, dayKey, lastSevenDays, presenceBonus, rewardFor, xpToNext } from '../shared/game/rules.js'
import { applyCityAction, newCity, normalizeAction } from '../worker/city.js'

test('cidade: construção usa o catálogo e respeita ocupação, terreno e saldo', () => {
  const city = newCity()
  const build = (kind, x, y) => applyCityAction(city, normalizeAction({
    type: 'build', kind, x, y, request_id: crypto.randomUUID(), expected_revision: city.revision,
  }))
  assert.throws(() => build('home', 8, 8), { status: 409 })
  assert.throws(() => build('tasks', 11, 11), { status: 422 })
  build('home', 5, 5)
  assert.equal(city.credits, 30)
  assert.equal(city.revision, 1)
  assert.throws(() => build('stunt', 6, 5), { status: 422 })
  assert.equal(city.credits, 30)
  assert.equal(city.placements.length, 8)
})

test('nível: XP acumulado bate com a tabela de docs/GAME-DESIGN.md', () => {
  const total = level => Array.from({ length: level - 1 }, (_, i) => xpToNext(i + 1)).reduce((a, b) => a + b, 0)
  assert.deepEqual([2, 3, 5, 10, 15, 20].map(total), [100, 250, 700, 2700, 5950, 10450])
})

test('applyXp: uma recompensa grande sobe vários níveis e guarda a sobra', () => {
  const { player, events } = applyXp({ level: 1, xp: 90, lifetimeXp: 90 }, 300)
  assert.deepEqual(player, { level: 3, xp: 140, lifetimeXp: 390 })
  assert.deepEqual(events.map(e => e.level), [2, 3])
})

test('applyXp: XP nunca diminui; valor negativo ou quebrado não tira nada', () => {
  assert.deepEqual(applyXp({ level: 4, xp: 10, lifetimeXp: 460 }, -500).player, { level: 4, xp: 10, lifetimeXp: 460 })
  assert.equal(applyXp({ level: 1, xp: 0 }, 9.9).player.xp, 9)
})

test('applyXp: o nível 5 libera a viagem e o teto de nível segura', () => {
  const { events } = applyXp({ level: 4, xp: 0 }, xpToNext(4))
  assert.deepEqual(events, [{ type: 'level_up', level: 5, unlocks: ['travel'] }])
  const capped = applyXp({ level: RULES.levelCap, xp: 0 }, 10 ** 9)
  assert.equal(capped.player.level, RULES.levelCap)
  assert.equal(capped.events.length, 0)
})

test('presença: degraus de 0 a 7 dias, sem nunca ficar abaixo do normal', () => {
  const tiers = [0, 1, 2, 3, 4, 5, 6, 7].map(d => presenceBonus(d)).map(b => [b.xp, b.credits])
  assert.deepEqual(tiers, [[100, 100], [100, 100], [100, 100], [125, 100], [125, 100], [150, 110], [150, 110], [200, 125]])
  assert.deepEqual(presenceBonus(99), presenceBonus(7))
  assert.deepEqual(presenceBonus(-3), presenceBonus(0))
})

test('recompensa: tarefa com 7 dias ativos vale XP em dobro e +25% de créditos', () => {
  assert.deepEqual(rewardFor('task', { activeDaysLast7: 7 }), { xp: 20, credits: 12, multiplier: { xp: 200, credits: 125 }, reason: null })
  assert.deepEqual(rewardFor('habit', { activeDaysLast7: 0 }), { xp: 5, credits: 5, multiplier: { xp: 100, credits: 100 }, reason: null })
})

test('recompensa: teto de 8 hábitos e 10 tarefas pagos por dia', () => {
  assert.equal(rewardFor('habit', { paidToday: 7 }).xp, 5)
  assert.deepEqual(rewardFor('habit', { paidToday: 8 }), { xp: 0, credits: 0, multiplier: { xp: 100, credits: 100 }, reason: 'daily_cap' })
  assert.equal(rewardFor('task', { paidToday: 9 }).credits, 10)
  assert.equal(rewardFor('task', { paidToday: 10 }).reason, 'daily_cap')
  assert.equal(rewardFor('goalStep', { paidToday: 500 }).xp, 5)
})

test('recompensa: dia passado é aceito sem pagar; boas-vindas e retorno não levam bônus', () => {
  assert.equal(rewardFor('habit', { day: '2026-11-09', today: '2026-11-11', activeDaysLast7: 7 }).reason, 'past_day')
  assert.deepEqual(rewardFor('welcome', { activeDaysLast7: 7 }), { xp: 0, credits: 50, multiplier: { xp: 100, credits: 100 }, reason: null })
  assert.equal(rewardFor('comeback', { activeDaysLast7: 7 }).credits, 20)
  assert.throws(() => rewardFor('inexistente'))
})

test('dias: o dia vem do fuso da pessoa, não do relógio do aparelho', () => {
  const instant = new Date('2026-11-11T02:30:00Z')
  assert.equal(dayKey(instant, 'America/Sao_Paulo'), '2026-11-10')
  assert.equal(dayKey(instant, 'Asia/Tokyo'), '2026-11-11')
  assert.deepEqual(lastSevenDays('2026-03-02'), ['2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
})

test('dias: não se marca o futuro nem mais de 7 dias para trás', () => {
  assert.equal(canMarkDay('2026-11-12', '2026-11-11'), false)
  assert.equal(canMarkDay('2026-11-11', '2026-11-11'), true)
  assert.equal(canMarkDay('2026-11-04', '2026-11-11'), true)
  assert.equal(canMarkDay('2026-11-03', '2026-11-11'), false)
})
