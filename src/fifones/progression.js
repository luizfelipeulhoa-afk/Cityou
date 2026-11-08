// Progress is derived from the server ledger; UI goals never grant currency.
export function progression(city = {}, goalId = 'stunt') {
  const count = Math.max(0, Math.floor(Number(city.reward_count) || 0))
  const catalog = city.catalog || []
  const goal = catalog.find(item => item.id === goalId && item.cost > 0) || catalog.find(item => item.id === 'stunt') || catalog.find(item => item.cost > 0)
  const credits = Math.max(0, Number(city.credits) || 0)
  const missing = goal ? Math.max(0, goal.cost - credits) : 0
  const spaces = (city.placements || []).filter(item => catalog.find(def => def.id === item.kind)?.destination && item.kind !== 'headquarters')
  return {
    count, withinLevel: count % 10, remaining: 10 - count % 10,
    level: 1 + Math.floor(count / 10), goal, missing,
    goalPercent: goal ? Math.min(100, credits / goal.cost * 100) : 0,
    taskEquivalent: Math.ceil(missing / 10),
    milestones: [
      { id: 'first', icon: 'check', label: 'Primeiro passo', detail: 'Conclua uma tarefa ou registre seu hábito.', value: Math.min(count, 1), total: 1 },
      { id: 'space', icon: 'city', label: 'Um espaço seu', detail: 'Construa seu primeiro espaço de trabalho.', value: Math.min(spaces.length, 1), total: 1 },
      { id: 'district', icon: 'expand', label: 'Além do quarteirão', detail: 'Complete 10 ações recompensadas para ampliar a cidade.', value: Math.min(count, 10), total: 10 },
    ],
  }
}
