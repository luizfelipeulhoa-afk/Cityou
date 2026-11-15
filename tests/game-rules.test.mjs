import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RULES, applyXp, canMarkDay, dayKey, lastSevenDays, presenceBonus, rewardFor, xpToNext } from '../shared/game/rules.js'
import { getCityLayout, previewBuild, tileKey } from '../shared/game/city-layout.js'
import { applyCityAction, newCity, normalizeAction, snapshot } from '../worker/city.js'

test('cidade: construção usa o catálogo e respeita ocupação, terreno e saldo', () => {
  const city = newCity()
  const build = (kind, x, y) => applyCityAction(city, normalizeAction({
    type: 'build', kind, x, y, request_id: crypto.randomUUID(), expected_revision: city.revision,
  }))
  // Sem praça desde 16/11/2026: a ocupação se confere numa rua de entrada.
  const seed = city.placements.find(item => item.id.startsWith('seed-road-'))
  assert.throws(() => build('home', seed.x, seed.y), { status: 409 })
  assert.throws(() => build('tasks', 16, 16), { status: 422 }) // 2x2 passaria da borda do terreno
  build('home', 5, 5)
  assert.equal(city.credits, 30)
  assert.equal(city.revision, 1)
  assert.throws(() => build('stunt', 6, 5), { status: 422 })
  assert.equal(city.credits, 30)
  assert.equal(city.placements.length, 6) // 5 ruas de entrada + a casa (sem Sede nem praça desde 16/11/2026)
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
  const sizes = { 'island-lighthouse': [3, 3], 'island-cabin': [2, 2], 'island-pier': [3, 3], 'island-hammock': [2, 2], 'island-palms': [2, 2], 'island-bonfire': [1, 1], 'island-statue': [2, 2], 'island-boat-small': [2, 2], 'island-boat-large': [3, 3] }
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
  // A ilha é de cenário (sem ruas nem prédios de atividade), mas oferece só estes prédios e decorações.
  assert.deepEqual(getCityCatalog('ilha-inicial').map(item => item.id).sort(), ['island-boat-large', 'island-boat-small', 'island-bonfire', 'island-cabin', 'island-hammock', 'island-lighthouse', 'island-palms', 'island-pier', 'island-statue'])
})

test('automatic roads stay on open land and reject protected lots and blocked routes', () => {
  const location = 'cristo-redentor'
  const city = snapshot(newCity(location), location)
  const lot = { kind: 'rio-sobrado', x: -2, y: 15 }
  const protectedTiles = new Set(getCityLayout(location).protectedTiles.map(([x, y]) => tileKey(x, y)))
  const quote = previewBuild(city, lot)
  assert.deepEqual([quote.road.tiles.length, quote.road.cost, quote.cost], [10, 20, 40])
  assert.ok(quote.road.tiles.every(({ x, y }) => !protectedTiles.has(tileKey(x, y))))
  assert.equal(previewBuild(city, { ...lot, y: 22 }).status, 422)
  const wall = Array.from({ length: 27 }, (_, index) => ({
    id: 'tree-' + index, kind: 'tree', x: 0, y: index - 4,
  }))
  const blocked = { ...city, placements: [...city.placements, ...wall] }
  assert.match(previewBuild(blocked, lot).error, /caminho livre/)
  const before = structuredClone(blocked)
  assert.throws(() => applyCityAction(blocked, normalizeAction({
    type: 'build', ...lot, expected_revision: blocked.revision, request_id: 'blocked-road',
  }), location), { status: 422 })
  assert.deepEqual(blocked, before)
})

test('automatic roads reject routes beyond 30 tiles and leave the island roadless', () => {
  const location = 'cristo-redentor'
  const city = snapshot(newCity(location), location)
  city.placements = [{ id: 'seed-road-test', kind: 'road', x: 20, y: 15 }]
  assert.match(previewBuild(city, { kind: 'home', x: -7, y: 10 }).error, /longe demais/)
  const island = snapshot(newCity('ilha-inicial'), 'ilha-inicial')
  const quote = previewBuild(island, { kind: 'island-cabin', x: 8, y: 8 })
  assert.deepEqual(quote.road, { tiles: [], cost: 0 })
})

import { newTown, withoutStarterBuildings } from '../worker/city.js'

test('cidade sem prédio inicial (16/11/2026): nem Sede nem praça na cidade nova, e a salva perde os dois na leitura', () => {
  for (const location of ['cristo-redentor', 'petra']) {
    const town = newTown(location)
    assert.equal(town.placements.some(item => ['headquarters', 'plaza'].includes(item.kind)), false, location)
    assert.ok(town.placements.some(item => item.id.startsWith('seed-road-')), `${location} segue com as ruas de entrada`)
  }
  const rio = newTown('cristo-redentor')
  const saved = { ...rio, placements: [...rio.placements,
    { id: 'core-headquarters', kind: 'headquarters', x: 8, y: 7, rotation: 0, level: 1 },
    { id: 'core-plaza', kind: 'plaza', x: 8, y: 8, rotation: 0, level: 1 }] }
  const cleaned = withoutStarterBuildings(saved)
  assert.equal(cleaned.placements.some(item => ['headquarters', 'plaza'].includes(item.kind)), false)
  assert.equal(cleaned.placements.length, rio.placements.length)
  assert.equal(withoutStarterBuildings(rio), rio, 'sem prédio inicial, a cidade volta igual')
})

import { HILL_STEP, hillLevelAt, previewRoadPath, roadPath, startingPromenade, tileHeight, usesAutoRoad } from '../shared/game/city-layout.js'
import { countsForTravel } from '../worker/city.js'

const rioCity = (extra = {}) => ({ ...newCity('cristo-redentor', true), location_id: 'cristo-redentor', unlock_radius: 16, ...extra })

test('Rio: o morro da comunidade tem patamares, fica fora das áreas protegidas e aceita só o que é da comunidade', () => {
  const layout = getCityLayout('cristo-redentor')
  const protectedKeys = new Set(layout.protectedTiles.map(([x, y]) => tileKey(x, y)))
  assert.ok(layout.hillTiles.length > 80)
  assert.deepEqual([...new Set(layout.hillTiles.map(([, , level]) => level))].sort(), [1, 2])
  for (const [x, y, level] of layout.hillTiles) {
    assert.equal(protectedKeys.has(tileKey(x, y)), false, `${x},${y} é protegido`)
    assert.equal(hillLevelAt('cristo-redentor', x, y), level)
    assert.equal(tileHeight('cristo-redentor', x, y), level * HILL_STEP)
  }
  assert.equal(hillLevelAt('cristo-redentor', 0, 8), 0)
  assert.equal(hillLevelAt('ilha-inicial', 13, -8), 0)
  const city = rioCity()
  // Prédio da comunidade num patamar inteiro: sem rua e só o preço dele.
  const house = previewBuild(city, { kind: 'rio-casa', x: 17, y: -8, rotation: 0 })
  assert.equal(house.error, undefined)
  assert.deepEqual(house.road.tiles, [])
  assert.equal(house.cost, getBuilding('rio-casa').cost)
  assert.equal(previewBuild(city, { kind: 'rio-comunidade', x: 13, y: -8, rotation: 0 }).error, undefined) // 3 × 3 num patamar de 3 fileiras
  assert.equal(previewBuild(city, { kind: 'rio-comunidade', x: -8, y: -8, rotation: 0 }).error, undefined)
  // Atravessar dois patamares, prédio de fora da comunidade e rua no morro: recusados.
  assert.match(previewBuild(city, { kind: 'rio-casa', x: 14, y: -6, rotation: 0 }).error, /mesmo patamar/)
  assert.match(previewBuild(city, { kind: 'rio-hospital', x: 17, y: -8, rotation: 0 }).error, /No morro só cabem/)
  const road = previewRoadPath(city, roadPath(16, -3, 16, -4))
  assert.ok(road.error)
  // Fora do morro, na encosta protegida, nada muda.
  assert.match(previewBuild(city, { kind: 'rio-casa', x: 4, y: -8, rotation: 0 }).error, /áreas protegidas/)
})

test('Rio: decoração não pede rua, e a praia aceita o calçadão e o coqueiro, mas não prédios', () => {
  const city = rioCity({ placements: rioCity().placements.filter(item => item.kind !== 'rio-calcadao') })
  // Longe de qualquer rua: a casa pede rua automática (e não acha caminho curto), a árvore e o calçadão não.
  const far = { x: -2, y: 14, rotation: 0 }
  const tree = previewBuild(city, { kind: 'rio-arvore-mangueira', ...far })
  assert.equal(tree.error, undefined)
  assert.deepEqual(tree.road.tiles, [])
  assert.equal(previewBuild(city, { kind: 'rio-calcadao', ...far }).cost, getBuilding('rio-calcadao').cost)
  assert.equal(usesAutoRoad('cristo-redentor', 'rio-calcadao'), false)
  assert.equal(usesAutoRoad('cristo-redentor', 'rio-casa'), true)
  // Areia: as duas últimas fileiras desta coluna são água lisa na grade.
  assert.equal(previewBuild(city, { kind: 'rio-calcadao', x: 0, y: 23, rotation: 0 }).error, undefined)
  assert.equal(previewBuild(city, { kind: 'rio-arvore-coqueiro', x: 0, y: 24, rotation: 0 }).error, undefined)
  assert.ok(previewBuild(city, { kind: 'rio-casa', x: 0, y: 23, rotation: 0 }).error)
  assert.ok(previewBuild(city, { kind: 'rio-arvore-mangueira', x: 0, y: 24, rotation: 0 }).error)
  assert.ok(previewBuild(city, { kind: 'rio-calcadao', x: 0, y: 24, rotation: 0 }).error) // 2 × 2 passaria da grade
})

test('Rio: o calçadão já vem posto na orla, é decoração e não conta para viajar', () => {
  const modules = startingPromenade('cristo-redentor')
  assert.equal(modules.length, 16)
  const water = new Set(getCityLayout('cristo-redentor').waterTiles.map(([x, y]) => tileKey(x, y)))
  const seen = new Set()
  for (const { x, y } of modules) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    assert.ok(water.has(tileKey(x + dx, y + dy)), `${x + dx},${y + dy} não é praia`)
    assert.equal(seen.has(tileKey(x + dx, y + dy)), false, 'módulos sobrepostos')
    seen.add(tileKey(x + dx, y + dy))
  }
  assert.deepEqual(startingPromenade('ilha-inicial'), [])
  const town = newTown('cristo-redentor')
  const pieces = town.placements.filter(item => item.kind === 'rio-calcadao')
  assert.equal(pieces.length, 16)
  assert.equal(countsForTravel(pieces[0]), false)
  assert.equal(countsForTravel({ kind: 'rio-casa' }), true)
  // A pessoa tira o calçadão e recebe metade do preço de volta.
  const city = { ...newCity('cristo-redentor', true), revision: 0 }
  const before = city.credits
  applyCityAction(city, { type: 'remove', kind: null, x: null, y: null, rotation: null, placement_id: pieces[0].id, expected_revision: 0, request_id: 'tirar-1' }, 'cristo-redentor', true)
  assert.equal(city.placements.some(item => item.id === pieces[0].id), false)
  assert.equal(city.credits, before + getBuilding('rio-calcadao').cost / 2)
})

import { FRONT_STEP, facingRotation } from '../shared/game/city-layout.js'

test('o prédio nasce virado para a rua: gira para o lado da rua, sem trocar a pegada, e deixa em paz o que já olha para ela', () => {
  assert.deepEqual(FRONT_STEP, [[0, 1], [-1, 0], [0, -1], [1, 0]])
  const key = (x, y) => tileKey(x, y)
  const road = (...tiles) => new Set(tiles.map(([x, y]) => key(x, y)))
  const house = (rotation, x = 5, y = 5) => ({ kind: 'rio-casa', x, y, rotation }) // 2 × 2: ocupa (5..6, 5..6)
  // Rua em frente (rotação 0 olha para +y): nada muda.
  assert.equal(facingRotation(house(0), road([5, 7])), 0)
  // Rua a oeste (x = 4): a frente tem de ir para −x (rotação 1).
  assert.equal(facingRotation(house(0), road([4, 5])), 1)
  // Rua ao norte (y = 4): rotação 2. Rua a leste (x = 7): rotação 3.
  assert.equal(facingRotation(house(0), road([5, 4])), 2)
  assert.equal(facingRotation(house(0), road([7, 6])), 3)
  // Sem rua encostada, ou rua só na diagonal: fica como veio.
  assert.equal(facingRotation(house(2), road([8, 8], [4, 4])), 2)
  // Se a frente já dá numa rua, mesmo havendo outras, a escolha da pessoa vale.
  assert.equal(facingRotation(house(3), road([7, 5], [4, 5])), 3)
  // Prédio 3 × 2 (largura 3, profundidade 2): só troca entre rotações da mesma pegada (0 ↔ 2, 1 ↔ 3).
  const wide = rotation => ({ kind: 'rio-kiosk', x: 5, y: 5, rotation })
  assert.equal(facingRotation(wide(0), road([5, 4])), 2)
  assert.equal(facingRotation(wide(0), road([4, 5])), 0)
  // Decoração e árvore não giram.
  assert.equal(facingRotation({ kind: 'rio-calcadao', x: 5, y: 5, rotation: 0 }, road([4, 5])), 0)
  assert.equal(facingRotation({ kind: 'tree', x: 5, y: 5, rotation: 0 }, road([4, 5])), 0)
})

test('Rio: o servidor vira o prédio novo para a rua que o liga à cidade', () => {
  const city = { ...newCity('cristo-redentor', true), revision: 0 }
  // A rua semente corre em y = 9 (x de 6 a 10): uma casa logo ao norte dela, com a frente para o norte (rotação 2), vira para o sul.
  const build = (kind, x, y, rotation, revision) => applyCityAction(city, {
    type: 'build', kind, x, y, rotation, placement_id: null, expected_revision: revision, request_id: `vira-${revision}`,
  }, 'cristo-redentor', true)
  build('rio-casa', 9, 7, 2, 0) // ocupa (9..10, 7..8); a rua está em y = 9, ao sul: rotação 0
  const placed = city.placements.find(item => item.kind === 'rio-casa')
  assert.equal(placed.rotation, 0)
})
