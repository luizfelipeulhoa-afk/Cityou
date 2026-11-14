// Base de alimentos (shared/game/foods-base.js): integridade dos dados. Rode com: node --test tests/foods-base.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FOOD_BASE } from '../shared/game/foods-base.js'
import { FOOD_PORTIONS } from '../shared/game/foods-portions.js'
import { readFileSync } from 'node:fs'

const FIELDS = ['id', 'name', 'group', 'source', 'ref', 'kcal', 'protein', 'fat', 'carb', 'fiber', 'originalName']
const SOURCES = ['taco', 'usda-fnd', 'usda-sr']
const foods = FOOD_BASE.map(row => Object.fromEntries(FIELDS.map((key, i) => [key, row[i]])))

test('cada alimento tem nome, fonte e referência na fonte', () => {
  for (const food of foods) {
    assert.ok(food.name, food.id)
    assert.ok(SOURCES.includes(food.source), `${food.id} fonte desconhecida`)
    assert.ok(food.ref, `${food.id} sem referência`)
  }
})

test('ids e nomes não se repetem', () => {
  assert.equal(new Set(foods.map(food => food.id)).size, foods.length)
  assert.equal(new Set(foods.map(food => food.name.toLowerCase())).size, foods.length)
})

test('valores por 100 g são números não negativos e a soma dos macros não passa de 100 g', () => {
  for (const food of foods) {
    for (const key of ['kcal', 'protein', 'fat', 'carb']) {
      assert.ok(Number.isFinite(food[key]) && food[key] >= 0, `${food.id} ${key}=${food[key]}`)
    }
    assert.ok(food.protein + food.fat + food.carb <= 101, `${food.name}: macros somam mais de 100 g`)
  }
})

// Exceções esperadas: bebidas alcoólicas (álcool tem 7 kcal/g), sucos ácidos e alimentos com fibra ou açúcares
// de conta diferente. Até 2% da base pode ficar fora da conta 4-4-9 com folga de 35%.
test('energia bate com os macronutrientes (4-4-9) na maior parte da base', () => {
  const withEnergy = foods.filter(food => food.kcal > 0)
  const outside = withEnergy.filter(food => {
    const estimate = 4 * food.protein + 4 * food.carb + 9 * food.fat
    return Math.abs(estimate - food.kcal) / food.kcal > 0.35
  })
  assert.ok(outside.length / withEnergy.length <= 0.02, `${outside.length} fora da conta, ex.: ${outside.slice(0, 3).map(f => f.name).join('; ')}`)
})

test('nome original em inglês existe para toda linha USDA e é vazio para a TACO', () => {
  for (const food of foods) {
    if (food.source === 'taco') assert.equal(food.originalName, '', food.id)
    else assert.ok(food.originalName, `${food.id} sem nome original`)
  }
})

test('porções em unidade apontam para alimentos existentes e têm peso positivo', () => {
  const ids = new Set(foods.map(food => food.id))
  for (const [id, portions] of Object.entries(FOOD_PORTIONS)) {
    assert.ok(ids.has(id), `${id} não existe na base`)
    assert.ok(portions.length > 0, `${id} sem porções`)
    for (const [label, grams] of portions) {
      assert.ok(label && typeof label === 'string', `${id} porção sem nome`)
      assert.ok(Number.isFinite(grams) && grams > 0, `${id} ${label}=${grams}`)
    }
  }
})

test('ovo inteiro cru tem a unidade grande de 50 g (ovo não se pesa em gramas por padrão)', () => {
  assert.deepEqual(FOOD_PORTIONS['taco-489'].find(([label]) => label === 'unidade grande'), ['unidade grande', 50])
})

test('a TACO e a USDA estão representadas', () => {
  const count = source => foods.filter(food => food.source === source).length
  assert.ok(count('taco') > 500)
  assert.ok(count('usda-sr') > 7000)
  assert.ok(count('usda-fnd') > 0)
})

// Medidas caseiras brasileiras (IBGE, Tabela de Medidas Referidas, POF 2008-2009), ligadas em tools/medidas-taco-ibge.json.
const IBGE_LINKS = JSON.parse(readFileSync(new URL('../tools/medidas-taco-ibge.json', import.meta.url), 'utf8'))
const portionOf = (id, label) => FOOD_PORTIONS[id]?.find(([name]) => name === label)?.[1]

test('arroz e feijão cozidos têm as medidas do IBGE (colher e concha)', () => {
  assert.equal(portionOf('taco-3', 'colher de sopa cheia'), 25)
  assert.equal(portionOf('taco-3', 'escumadeira média cheia'), 85)
  assert.equal(portionOf('taco-561', 'concha média cheia'), 140)
  assert.equal(portionOf('taco-53', 'unidade'), 50)
  assert.equal(portionOf('taco-488', 'unidade média'), 45)
  assert.equal(portionOf('usda-sr-172217', 'copo americano'), 150)
})

test('medida de alimento cozido não vai para o alimento cru', () => {
  assert.equal(FOOD_PORTIONS['taco-4'], undefined) // arroz cru: as medidas do IBGE são do arroz cozido
  assert.equal(FOOD_PORTIONS['taco-562'], undefined) // feijão carioca cru
})

test('fruta crua com medida do IBGE não tem copo nem prato (no inquérito eram suco ou fruta picada)', () => {
  const mapped = new Set(Object.keys(IBGE_LINKS.map))
  for (const food of foods.filter(f => mapped.has(f.id) && f.group === 'Frutas e derivados' && /, crua?$/.test(f.name))) {
    for (const [label] of FOOD_PORTIONS[food.id] ?? []) assert.ok(!/^(copo|taça|xícara|prato|pires)/.test(label), `${food.name}: ${label}`)
  }
})

test('nomes da TACO corrigidos e linhas que o xlsx marca como NA presentes', () => {
  const name = id => foods.find(food => food.id === id)?.name
  assert.equal(name('taco-540'), 'Feijoada')
  assert.equal(name('taco-474'), 'Cerveja, pilsen')
  assert.equal(name('taco-357'), 'Carne, bovina, filé mignon, sem gordura, cru')
  assert.equal(name('taco-272'), 'Óleo, de soja')
  assert.ok(!foods.some(food => food.source === 'taco' && /ü|Pêra|Geléia|,\S|\s\s| \d$/.test(food.name)))
})

test('medida emprestada de outro alimento ou preparo não entra (revisão do PR #48)', () => {
  assert.equal(FOOD_PORTIONS['taco-44'], undefined) // milho cru: as colheres do IBGE são do milho enlatado
  assert.deepEqual(FOOD_PORTIONS['taco-484'], [['unidade pequena com 1 ovo', 65]]) // omelete: sem colher de ovo mexido
  assert.ok(!FOOD_PORTIONS['taco-45'].some(([label]) => label.startsWith('colher de arroz'))) // milho enlatado: sem a da ervilha
})
