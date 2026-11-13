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
  assert.throws(() => build('tasks', 16, 16), { status: 422 }) // 2x2 passaria da borda do terreno
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

import { buildSummary } from '../shared/game/summary.js'
import { ProofError, parseProof } from '../shared/game/proof.js'

test('resumo do painel: nível e progresso, tetos do dia e só os 5 últimos lançamentos', () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, amount: i, created_at: `2026-11-11T0${i}:00:00Z`, extra: 'não vai' }))
  const resumo = buildSummary({
    credits: 80, earned: 130, rewardCount: 23,
    paidToday: { habit: 3, task: 1, proof: 2 }, habits: { done: 3, total: 5 }, history,
  })
  assert.equal(resumo.level, 3)
  assert.deepEqual(resumo.level_progress, { within: 3, size: 10 })
  assert.deepEqual(resumo.today.paid.habit, { used: 3, cap: 8 })
  assert.deepEqual(resumo.today.paid.task, { used: 1, cap: 10 })
  assert.deepEqual(resumo.today.paid.proof, { used: 2, cap: 3, bonus: 5 })
  assert.equal(resumo.recent.length, 5)
  assert.deepEqual(Object.keys(resumo.recent[0]), ['label', 'amount', 'created_at'])
  assert.ok(JSON.stringify(resumo).length < 1024, 'o resumo precisa caber em 1 KB')
})

test('comprovação: nota curta, foto falsa e campos extras são recusados; foto e nota válidas passam', () => {
  const jpeg = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 16))
  assert.throws(() => parseProof({ note: 'curta' }), ProofError)
  assert.throws(() => parseProof({}), ProofError)
  assert.throws(() => parseProof(null), ProofError)
  assert.throws(() => parseProof({ note: 'x'.repeat(501) }), ProofError)
  assert.throws(() => parseProof({ photo: 'data:image/png;base64,AAAA' }), ProofError)
  assert.throws(() => parseProof({ photo: 'data:image/jpeg;base64,' + btoa('isso não é uma foto') }), ProofError)
  assert.throws(() => parseProof({ note: 'a'.repeat(30), extra: 1 }), ProofError)
  assert.equal(parseProof({ photo: jpeg }).photo.mime, 'image/jpeg')
  assert.equal(parseProof({ note: '  ' + 'a'.repeat(20) + '  ' }).note, 'a'.repeat(20))
})

import { stageFor, weekKey, kindForDomain, domainForKind } from '../shared/game/buildings.js'

test('semana: segunda a domingo, com a virada de ano da norma ISO', () => {
  assert.equal(weekKey('2026-01-01'), '2026-W01')
  assert.equal(weekKey('2025-12-29'), '2026-W01')
  assert.equal(weekKey('2026-12-31'), '2026-W53')
  assert.equal(weekKey('2026-11-09'), '2026-W46')
  assert.equal(weekKey('2026-11-15'), '2026-W46')
  assert.equal(weekKey('2026-11-16'), '2026-W47')
})

const daysFrom = (start, count, step = 1) => Array.from({ length: count }, (_, i) => {
  const d = new Date(Date.parse(start + 'T00:00:00Z') + i * step * 86400000)
  return d.toISOString().slice(0, 10)
})

test('etapa do prédio: exige dias E semanas com prática, e o tempo parado não avança nada', () => {
  assert.equal(stageFor([]).etapa_nome, 'Terreno')
  // 8 dias seguidos caem em só 2 semanas: Fundação.
  assert.equal(stageFor(daysFrom('2026-11-02', 8)).etapa_nome, 'Fundação')
  // 7 dias numa semana só: ainda Terreno.
  assert.equal(stageFor(daysFrom('2026-11-02', 7)).etapa, 0)
  // 30 dias seguidos têm só 5 semanas: faltam semanas para a Estrutura.
  assert.equal(stageFor(daysFrom('2026-11-02', 30)).etapa_nome, 'Fundação')
  // Um dia a cada 3 dias por 90 dias cobre 13 semanas e 30 dias: Estrutura.
  const spaced = stageFor(daysFrom('2026-01-05', 30, 3))
  assert.equal(spaced.etapa_nome, 'Estrutura')
  assert.deepEqual(spaced.proxima, { etapa_nome: 'Acabamento', dias: 70, semanas: 16 })
  // Dias repetidos contam uma vez.
  assert.equal(stageFor([...daysFrom('2026-11-02', 8), ...daysFrom('2026-11-02', 8)]).dias, 8)
  // Concluído só com 120 dias em 26 semanas ou mais; não há próxima etapa.
  const done = stageFor(daysFrom('2026-01-05', 120, 2))
  assert.equal(done.etapa_nome, 'Concluído')
  assert.equal(done.proxima, null)
  assert.ok(done.semanas >= 26)
})

test('prédio da atividade: a área escolhe o tipo, e tipo inventado não vira área', () => {
  assert.equal(kindForDomain('saude'), 'dom-saude')
  assert.equal(kindForDomain('jogos'), null)
  assert.equal(domainForKind('dom-financas'), 'financas')
  assert.equal(domainForKind('home'), null)
  assert.equal(domainForKind('dom-jogos'), null)
})

import { snapshot as citySnapshotOf } from '../worker/city.js'

test('terreno: todo o mapa é construível desde o começo, até perto das bordas', () => {
  const legacy = newCity('petra')
  assert.equal(citySnapshotOf(legacy, 'petra').unlock_radius, 8)
  const pilot = newCity('cristo-redentor')
  assert.equal(citySnapshotOf(pilot, 'cristo-redentor').unlock_radius, 16)
  // Uma construção 1x1 nos quatro cantos do terreno de 17x17 é aceita; uma 2x2 que passe da borda, não.
  const corner = (x, y) => applyCityAction(legacy, normalizeAction({
    type: 'build', kind: 'home', x, y, request_id: crypto.randomUUID(), expected_revision: legacy.revision,
  }), 'petra')
  legacy.credits = 500
  for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) corner(x, y)
  assert.equal(legacy.placements.filter(item => item.kind === 'home').length, 4)
  assert.throws(() => applyCityAction(legacy, normalizeAction({
    type: 'build', kind: 'tasks', x: 16, y: 8, request_id: crypto.randomUUID(), expected_revision: legacy.revision,
  }), 'petra'), { status: 422 })
})

import { getBuilding, getCityCatalog } from '../shared/game/city-layout.js'

test('catálogo: os prédios island-* do JSON são da Ilha Inicial e não aparecem nas outras cidades', () => {
  const sizes = { 'island-lighthouse': [3, 3], 'island-cabin': [2, 2], 'island-pier': [3, 3] }
  for (const [id, [width, depth]] of Object.entries(sizes)) {
    const item = getBuilding(id)
    assert.deepEqual([item.width, item.depth, item.model, item.destination], [width, depth, `/models/island/${id}.glb`, null])
    assert.ok(item.cost > 0 && item.height > 0 && /^#[0-9a-f]{6}$/.test(item.color))
  }
  assert.equal(getBuilding('island-lighthouse').label, 'Farol da Percepção')
  assert.equal(getBuilding('island-cabin').label, 'Cabana do Primeiro Passo')
  assert.equal(getBuilding('island-pier').label, 'Píer da Jornada')
  // Rio (cidade piloto) e Petra (cidade comum) seguem sem nenhum prédio da ilha no catálogo.
  for (const location of ['cristo-redentor', 'petra']) {
    assert.equal(getCityCatalog(location).some(item => item.id.startsWith('island-')), false)
  }
  // A ilha é de cenário (sem ruas nem prédios de atividade), mas oferece só estes três prédios.
  assert.deepEqual(getCityCatalog('ilha-inicial').map(item => item.id).sort(), ['island-cabin', 'island-lighthouse', 'island-pier'])
})
