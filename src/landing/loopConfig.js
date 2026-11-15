// Configuração da vinheta em laço do topo da landing (src/landing/loop.js), sem GSAP: dá para testar no Node.
// LOOP_CONFIG, em 5 linhas:
//   startBalance: saldo no começo de cada "dia" (o laço volta a ele no reset).
//   rewards: moedas por tarefa, hábito e meta, vindas de RULES.rewards (shared/game/rules.js), as mesmas do servidor.
//   cycles: o que cada ciclo constrói, em ordem; o custo vem do catálogo do Rio (getBuilding), nunca escrito à mão.
//   lotAnchors: onde fica cada lote, em % do render (x, y do pé do prédio), sobre a areia vazia.
//   beat: duração de cada passo, em segundos (veja os comentários de cada passo abaixo).
import { RULES } from '../../shared/game/rules.js'
import { getBuilding } from '../../shared/game/city-layout.js'

export const BUILDINGS = { quiosque: 'rio-quiosque-coco', casarao: 'rio-casarao', artdeco: 'rio-edificio-deco' }
const costOf = name => getBuilding(BUILDINGS[name]).cost

export const LOOP_CONFIG = {
  startBalance: 20,
  rewards: { task: RULES.rewards.task.credits, habit: RULES.rewards.habit.credits, goal: RULES.rewards.goalDone.credits },
  cycles: [
    { builds: 'artdeco', cost: costOf('artdeco') },   // 20 + 40 = 60 → 0
    { builds: 'quiosque', cost: costOf('quiosque') }, // 0 + 40 = 40 → 15
    { builds: 'casarao', cost: costOf('casarao') },   // 15 + 40 = 55 → 5
  ],
  lotAnchors: { 1: { x: '61%', y: '67%' }, 2: { x: '75%', y: '76%' }, 3: { x: '63%', y: '88%' } },
  beat: { check: 0.2, strike: 0.25, chipFly: 0.9, count: 0.4, buildFly: 0.8, pop: 0.45, hold: 1.2, reset: 0.4 },
}

/** A conta dos três ciclos fecha: o saldo nunca fica negativo e sempre cobre o prédio do ciclo. Devolve os saldos. */
export function checkLoopMath(config = LOOP_CONFIG) {
  const earned = config.rewards.task + config.rewards.habit + config.rewards.goal
  let balance = config.startBalance
  const trail = []
  for (const cycle of config.cycles) {
    balance += earned
    if (balance < cycle.cost) throw new Error(`Laço do topo: ${balance} moedas não pagam ${cycle.builds} (${cycle.cost}).`)
    balance -= cycle.cost
    if (balance < 0) throw new Error('Laço do topo: o saldo ficou negativo.')
    trail.push(balance)
  }
  return trail
}

