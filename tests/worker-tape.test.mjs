// Fita do Tempo (etapa 8, worker/tape.js): desfazer e refazer no servidor. Rode com: npm run test:worker
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session, useHarnesses } from './helpers/worker-session.mjs'
import { applyDiff, placementDiff, tapeMethods, TAPE_WINDOW_MS } from '../worker/tape.js'

useHarnesses()

const build = (send, city, x, y, id) => send('/api/city/actions', {
  method: 'POST', body: { type: 'build', kind: 'tree', x, y, expected_revision: city.revision, request_id: id },
})
const tree = (city, x, y) => city.placements.find(item => item.kind === 'tree' && item.x === x && item.y === y)

test('fita: desfazer devolve as moedas e tira a peça; refazer põe de volta', async () => {
  const send = session()
  const start = await send('/api/city')
  assert.deepEqual(start.tape, [])
  const built = await build(send, start, 7, 8, 'fita-arvore-1')
  assert.equal(built.credits, start.credits - 3)
  assert.equal(built.tape.length, 1)
  assert.equal(built.tape[0].action_id, 'fita-arvore-1')
  assert.equal(built.tape[0].state, 'done')
  const undone = await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-arvore-1', expected_revision: built.revision } })
  assert.equal(undone.credits, start.credits)
  assert.equal(tree(undone, 7, 8), undefined)
  assert.equal(undone.tape[0].state, 'undone')
  assert.match(undone.history[0].label, /^Desfez: /)
  const redone = await send('/api/city/redo', { method: 'POST', body: { action_id: 'fita-arvore-1', expected_revision: undone.revision } })
  assert.equal(redone.credits, start.credits - 3)
  assert.ok(tree(redone, 7, 8))
  assert.equal(redone.tape[0].state, 'done')
  // A leitura comum também traz a fita.
  assert.equal((await send('/api/city')).tape.length, 1)
})

test('fita: só o topo, só na revisão certa, e uma ação nova apaga o que estava desfeito', async () => {
  const send = session()
  let city = await send('/api/city')
  city = await build(send, city, 7, 8, 'fita-a')
  city = await build(send, city, 9, 8, 'fita-b')
  await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-a', expected_revision: city.revision }, status: 409 })
  await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-b', expected_revision: city.revision - 1 }, status: 409 })
  await send('/api/city/redo', { method: 'POST', body: { action_id: 'fita-b', expected_revision: city.revision }, status: 409 })
  await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-b', expected_revision: city.revision, extra: 1 }, status: 422 })
  city = await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-b', expected_revision: city.revision } })
  // Agora o topo é a ação "a": dá para desfazer as duas em sequência.
  city = await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-a', expected_revision: city.revision } })
  assert.equal(tree(city, 7, 8), undefined)
  city = await send('/api/city/redo', { method: 'POST', body: { action_id: 'fita-a', expected_revision: city.revision } })
  city = await build(send, city, 11, 8, 'fita-c')
  assert.deepEqual(city.tape.map(entry => entry.action_id), ['fita-c', 'fita-a'])
  await send('/api/city/redo', { method: 'POST', body: { action_id: 'fita-b', expected_revision: city.revision }, status: 409 })
})

test('fita: desfazer uma demolição tira o reembolso e devolve a peça igual', async () => {
  const send = session()
  let city = await build(send, await send('/api/city'), 7, 8, 'fita-d1')
  const placed = tree(city, 7, 8)
  const before = city.credits
  city = await send('/api/city/actions', {
    method: 'POST', body: { type: 'remove', placement_id: placed.id, expected_revision: city.revision, request_id: 'fita-d2' },
  })
  assert.equal(city.credits, before + 1)
  city = await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-d2', expected_revision: city.revision } })
  assert.equal(city.credits, before)
  assert.deepEqual(tree(city, 7, 8), placed)
})

test('fita: mover e girar voltam ao lugar e à orientação de antes; reenviar o request_id não refaz nada', async () => {
  const send = session()
  let city = await build(send, await send('/api/city'), 7, 8, 'fita-m1')
  const placed = tree(city, 7, 8)
  const moveBody = { type: 'move', placement_id: placed.id, x: 9, y: 8, expected_revision: city.revision, request_id: 'fita-m2' }
  city = await send('/api/city/actions', { method: 'POST', body: moveBody })
  assert.ok(tree(city, 9, 8))
  city = await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-m2', expected_revision: city.revision } })
  assert.deepEqual(tree(city, 7, 8), placed)
  assert.equal(tree(city, 9, 8), undefined)
  const credits = city.credits
  // O mesmo request_id da ação desfeita devolve só a leitura: não move de novo nem cobra.
  const replay = await send('/api/city/actions', { method: 'POST', body: moveBody })
  assert.equal(replay.credits, credits)
  assert.equal(tree(replay, 9, 8), undefined)
  city = await send('/api/city/actions', { method: 'POST', body: { type: 'rotate', placement_id: placed.id, rotation: 2, expected_revision: replay.revision, request_id: 'fita-m3' } })
  city = await send('/api/city/undo', { method: 'POST', body: { action_id: 'fita-m3', expected_revision: city.revision } })
  assert.equal(tree(city, 7, 8).rotation, placed.rotation)
})

test('fita: passada a janela de 120 s, desfazer é recusado e a ação some da fita', () => {
  const store = new Map()
  const city = { placements: [], credits: 10, revision: 5, history: [] }
  const fake = Object.assign(Object.create(tapeMethods), {
    read: (kind, id) => store.get(`${kind}:${id}`) ?? null,
    write: (kind, id, value) => store.set(`${kind}:${id}`, value),
    cityState: () => city, regionalCity: () => city, saveCity: () => {}, citySnapshot: () => ({}),
  })
  fake.write('tape', 'rio', [{ action_id: 'velha', label: 'Construiu Árvore', amount: -3, at: Date.now() - TAPE_WINDOW_MS - 1, state: 'done', revision: 5, removed: [], added: [] }])
  assert.throws(() => fake.cityUndo({ action_id: 'velha', expected_revision: 5 }, 'rio'), { status: 409, message: /tempo para desfazer passou/ })
  assert.deepEqual(fake.tapeView('rio'), [])
})

test('fita: a diferença guarda só as peças que mudaram e se desfaz exatamente', () => {
  const a = { id: 'a', kind: 'tree', x: 1, y: 1 }, b = { id: 'b', kind: 'tree', x: 2, y: 2 }, moved = { ...b, x: 3 }
  const diff = placementDiff([a, b], [a, moved])
  assert.deepEqual(diff, { removed: [b], added: [moved] })
  assert.deepEqual(applyDiff([a, moved], diff.added, diff.removed), [a, b])
})
