import { test } from 'node:test'
import assert from 'node:assert/strict'
import { progression } from '../src/fifones/progression.js'
const catalog = [{id: 'tasks', cost: 80, destination: 'tarefas'}, {id: 'tree', cost: 3}]
test('Welcome gift and historical tasks do not complete a milestone', () => {
  const p = progression({ credits: 50, earned: 0, reward_count: 0, catalog, placements: [{kind: 'headquarters'}] })
  assert.equal(p.missing, 30); assert.equal(p.taskEquivalent, 3); assert.equal(p.withinLevel, 0)
  assert.ok(p.milestones.every(m => m.value === 0))
})
test('Verified actions drive levels, not credits or refunds', () => {
  const p = progression({credits: 999, earned: 150, reward_count: 11, catalog})
  assert.equal(p.level, 2); assert.equal(p.withinLevel, 1); assert.equal(p.remaining, 9)
  assert.equal(p.milestones[0].value, 1); assert.equal(p.milestones[2].value, 10)
})
test('Only a functional space satisfies the construction milestone', () => {
  const p = progression({catalog, placements: [{kind: 'tree'}, {kind: 'tasks'}]})
  assert.equal(p.milestones[1].value, 1)
})
test('Goals handle sufficient balance, invalid saved IDs, and empty state', () => {
  const p = progression({credits: 85, catalog}, 'invalid')
  assert.equal(p.goal.id, 'tasks'); assert.equal(p.goalPercent, 100); assert.equal(p.missing, 0)
  assert.equal(progression().goal, undefined)
})
test('Reopening at ten actions keeps the correct next milestone', () => {
  const p = progression({reward_count: 10, catalog}, 'tasks')
  assert.equal(p.goal.id, 'tasks'); assert.equal(p.level, 2); assert.equal(p.withinLevel, 0); assert.equal(p.remaining, 10)
})
