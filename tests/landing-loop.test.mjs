import assert from 'node:assert/strict'
import test from 'node:test'
import { LOOP_CONFIG, checkLoopMath } from '../src/landing/loopConfig.js'
import { RULES } from '../shared/game/rules.js'
import { getBuilding } from '../shared/game/city-layout.js'

test('laço da landing: recompensas e preços são os do jogo, sem número escrito à mão', () => {
  assert.deepEqual(LOOP_CONFIG.rewards, { task: RULES.rewards.task.credits, habit: RULES.rewards.habit.credits, goal: RULES.rewards.goalDone.credits })
  assert.deepEqual(LOOP_CONFIG.cycles.map(c => c.cost), [getBuilding('rio-edificio-deco').cost, getBuilding('rio-quiosque-coco').cost, getBuilding('rio-casarao').cost])
})

test('laço da landing: a conta dos três ciclos fecha (saldo nunca negativo e sempre paga o prédio)', () => {
  assert.deepEqual(checkLoopMath(), [0, 15, 5])
  assert.throws(() => checkLoopMath({ ...LOOP_CONFIG, startBalance: 0 }), /não pagam/)
})
