// Resumo para o painel (créditos, nível, bônus do dia, últimos ganhos). Função pura: o servidor calcula e manda junto
// das respostas que já existem, para a tela atualizar sem pedir nada a mais. Contrato em docs/DASHBOARD.md.
import { RULES } from './rules.js'

const LEVEL_SIZE = 10 // recompensas por nível na demonstração (1 + recompensas ÷ 10)

/**
 * @param {object} facts
 * @param {number} facts.credits saldo atual
 * @param {number} facts.earned total ganho até hoje
 * @param {number} facts.rewardCount recompensas recebidas (define o nível na demonstração)
 * @param {{habit:number, task:number, proof:number}} facts.paidToday recompensas pagas hoje
 * @param {{done:number, total:number}} facts.habits hábitos feitos hoje e total
 * @param {{label:string, amount:number, created_at:string}[]} facts.history últimos lançamentos, do mais novo
 */
export function buildSummary({ credits, earned, rewardCount, paidToday, habits, history }, rules = RULES) {
  const level = 1 + Math.floor(rewardCount / LEVEL_SIZE)
  return {
    credits,
    earned,
    level,
    level_progress: { within: rewardCount % LEVEL_SIZE, size: LEVEL_SIZE },
    today: {
      habits: { done: habits.done, total: habits.total },
      paid: {
        habit: { used: paidToday.habit, cap: rules.paidHabitsPerDay },
        task: { used: paidToday.task, cap: rules.paidTasksPerDay },
        proof: { used: paidToday.proof, cap: rules.proof.maxBonusPerDay, bonus: rules.proof.bonusCredits },
      },
    },
    recent: history.slice(0, 5).map(({ label, amount, created_at }) => ({ label, amount, created_at })),
  }
}
