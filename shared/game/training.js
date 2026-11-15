// Treino de musculação sugerido da aba Fitness (pedido do dono, 15/11/2026). Funções puras, sem banco: o Worker
// (worker/training.js) monta o plano e calcula volume e progressão por aqui, e a tela usa o catálogo para os nomes.
//
// É SUGESTÃO, não prescrição. As regras de séries, repetições, descanso e progressão abaixo são PROVISÓRIAS: o dono
// está reunindo os artigos (hipertrofia, perda de gordura, frequência, volume) e cada número vai ganhar a sua fonte em
// SOURCES, como em shared/game/nutrition.js. Enquanto EVIDENCE_PENDING for true, a tela avisa que o plano é provisório.
// Volume da sessão, melhor série e estimativa de 1RM são contas, não recomendação, e não dependem dos artigos.

export const EVIDENCE_PENDING = true
// Preencher com os artigos: { chave: { ref: 'Autor, ano. Título. Revista.', note: 'o que a regra usa daqui' } }.
export const SOURCES = {
  epley: { ref: 'Epley B, 1985. Poundage chart. Boyd Epley Workout.', note: 'estimativa de 1RM: carga × (1 + repetições / 30), só até 12 repetições' },
}

export const DAYS_RANGE = [1, 6]
export const EXPERIENCE = ['beginner', 'intermediate', 'advanced']
// gym: academia completa; dumbbells: em casa com halteres e banco; bodyweight: só o peso do corpo.
export const EQUIPMENT = ['gym', 'dumbbells', 'bodyweight']

// Catálogo. `pattern` é o movimento que o plano pede; `setups` diz onde o exercício cabe; `compound` muda a faixa
// de repetições e o descanso; `bodyweight` diz que a carga anotada é a carga extra (colete, mochila), e pode ser 0.
const E = (id, name, group, pattern, setups, { compound = false, bodyweight = false } = {}) =>
  ({ id, name, group, pattern, setups, compound, bodyweight })
const ALL = ['gym', 'dumbbells', 'bodyweight']
const GYM = ['gym']
const DB = ['gym', 'dumbbells']
const HOME = ['dumbbells', 'bodyweight']

export const EXERCISES = [
  E('agachamento-livre', 'Agachamento livre com barra', 'Quadríceps e glúteos', 'squat', GYM, { compound: true }),
  E('leg-press', 'Leg press 45°', 'Quadríceps e glúteos', 'squat', GYM, { compound: true }),
  E('agachamento-goblet', 'Agachamento goblet com halter', 'Quadríceps e glúteos', 'squat', ['dumbbells'], { compound: true }),
  E('agachamento-corpo', 'Agachamento livre (peso do corpo)', 'Quadríceps e glúteos', 'squat', ['bodyweight'], { compound: true, bodyweight: true }),
  E('terra-romeno', 'Levantamento terra romeno com barra', 'Posterior de coxa e glúteos', 'hinge', GYM, { compound: true }),
  E('stiff-halteres', 'Stiff com halteres', 'Posterior de coxa e glúteos', 'hinge', ['dumbbells'], { compound: true }),
  E('ponte-gluteo', 'Ponte de glúteo', 'Glúteos', 'hinge', ['bodyweight'], { compound: true, bodyweight: true }),
  E('afundo-halteres', 'Afundo com halteres', 'Quadríceps e glúteos', 'lunge', DB, { compound: true }),
  E('afundo-corpo', 'Afundo (peso do corpo)', 'Quadríceps e glúteos', 'lunge', ['bodyweight'], { compound: true, bodyweight: true }),
  E('bulgaro', 'Agachamento búlgaro', 'Quadríceps e glúteos', 'lunge', ALL, { compound: true, bodyweight: true }),
  E('cadeira-extensora', 'Cadeira extensora', 'Quadríceps', 'knee_ext', GYM),
  E('mesa-flexora', 'Mesa flexora', 'Posterior de coxa', 'knee_flex', GYM),
  E('stiff-unilateral', 'Stiff unilateral com halter', 'Posterior de coxa', 'knee_flex', ['dumbbells']),
  E('ponte-unilateral', 'Ponte de glúteo unilateral', 'Posterior de coxa e glúteos', 'knee_flex', ['bodyweight'], { bodyweight: true }),
  E('panturrilha-pe', 'Panturrilha em pé', 'Panturrilha', 'calf', ALL, { bodyweight: true }),
  E('supino-reto', 'Supino reto com barra', 'Peito', 'h_push', GYM, { compound: true }),
  E('supino-halteres', 'Supino reto com halteres', 'Peito', 'h_push', ['dumbbells'], { compound: true }),
  E('flexao', 'Flexão de braço', 'Peito', 'h_push', ['bodyweight'], { compound: true, bodyweight: true }),
  E('supino-inclinado-halteres', 'Supino inclinado com halteres', 'Peito', 'incline_push', DB, { compound: true }),
  E('flexao-pes-elevados', 'Flexão com pés elevados', 'Peito', 'incline_push', ['bodyweight'], { compound: true, bodyweight: true }),
  E('desenvolvimento-halteres', 'Desenvolvimento com halteres', 'Ombros', 'v_push', DB, { compound: true }),
  E('flexao-pike', 'Flexão pike', 'Ombros', 'v_push', ['bodyweight'], { compound: true, bodyweight: true }),
  E('puxada-frontal', 'Puxada frontal', 'Costas', 'v_pull', GYM, { compound: true }),
  E('barra-fixa', 'Barra fixa (ou só a descida, devagar)', 'Costas', 'v_pull', HOME, { compound: true, bodyweight: true }),
  E('remada-curvada', 'Remada curvada com barra', 'Costas', 'h_pull', GYM, { compound: true }),
  E('remada-unilateral', 'Remada unilateral com halter', 'Costas', 'h_pull', DB, { compound: true }),
  E('remada-invertida', 'Remada invertida (na mesa ou barra baixa)', 'Costas', 'h_pull', ['bodyweight'], { compound: true, bodyweight: true }),
  E('elevacao-lateral', 'Elevação lateral com halteres', 'Ombros', 'lateral', DB),
  E('rosca-direta', 'Rosca direta', 'Bíceps', 'biceps', DB),
  E('barra-supinada', 'Barra fixa com pegada supinada', 'Bíceps e costas', 'biceps', ['bodyweight'], { compound: true, bodyweight: true }),
  E('triceps-polia', 'Tríceps na polia', 'Tríceps', 'triceps', GYM),
  E('triceps-frances', 'Tríceps francês com halter', 'Tríceps', 'triceps', ['dumbbells']),
  E('mergulho-banco', 'Mergulho no banco', 'Tríceps', 'triceps', ['bodyweight'], { bodyweight: true }),
  E('prancha', 'Prancha (anote segundos como repetições)', 'Abdômen', 'core', ALL, { bodyweight: true }),
]
export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map(exercise => [exercise.id, exercise]))

// Divisão por dias na semana (PROVISÓRIO até os artigos de frequência): 1 a 3 dias, corpo inteiro; 4, superior e
// inferior duas vezes; 5, superior, inferior, empurrar, puxar, pernas; 6, empurrar, puxar e pernas duas vezes.
const DAY_TEMPLATES = {
  fullA: ['Corpo inteiro A', ['squat', 'h_push', 'v_pull', 'hinge', 'lateral', 'core']],
  fullB: ['Corpo inteiro B', ['hinge', 'incline_push', 'h_pull', 'lunge', 'biceps', 'triceps']],
  fullC: ['Corpo inteiro C', ['lunge', 'v_push', 'v_pull', 'knee_flex', 'calf', 'core']],
  upperA: ['Superior A', ['h_push', 'v_pull', 'v_push', 'h_pull', 'biceps', 'triceps']],
  upperB: ['Superior B', ['incline_push', 'h_pull', 'lateral', 'v_pull', 'triceps', 'biceps']],
  lowerA: ['Inferior A', ['squat', 'hinge', 'knee_ext', 'calf', 'core']],
  lowerB: ['Inferior B', ['hinge', 'lunge', 'knee_flex', 'calf', 'core']],
  push: ['Empurrar', ['h_push', 'v_push', 'incline_push', 'lateral', 'triceps']],
  pull: ['Puxar', ['v_pull', 'h_pull', 'h_pull', 'biceps', 'core']],
  legs: ['Pernas', ['squat', 'hinge', 'lunge', 'knee_flex', 'calf']],
}
export const SPLITS = {
  1: ['fullA'], 2: ['fullA', 'fullB'], 3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'], 5: ['upperA', 'lowerA', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
}

// Séries, repetições, esforço e descanso (PROVISÓRIO até os artigos de hipertrofia e de perda de gordura). A meta vem da
// base calórica: o treino de força é o mesmo para ganhar massa e para perder gordura (na perda, ele segura a massa
// magra); quem muda é a alimentação.
const SETS = { beginner: 2, intermediate: 3, advanced: 3 }
const REPS = { compound: [6, 10], isolation: [10, 15] }
const REST_SECONDS = { compound: 120, isolation: 75 }
export const RIR = [1, 3] // repetições que ainda daria para fazer ao fim da série

function pick(pattern, equipment, used) {
  const options = EXERCISES.filter(exercise => exercise.pattern === pattern && exercise.setups.includes(equipment))
  return options.find(exercise => !used.has(exercise.id)) ?? null
}

/** Plano sugerido: um dia de treino por dia da semana escolhido, cada um com exercícios, séries, faixa de repetições e descanso. */
export function suggestPlan({ days, experience, equipment, goal }) {
  if (!Number.isInteger(days) || days < DAYS_RANGE[0] || days > DAYS_RANGE[1]) throw new RangeError('days')
  if (!EXPERIENCE.includes(experience) || !EQUIPMENT.includes(equipment)) throw new RangeError('setup')
  return {
    goal, provisional: EVIDENCE_PENDING, rir: RIR,
    days: SPLITS[days].map((key, index) => {
      const [label, patterns] = DAY_TEMPLATES[key]
      const used = new Set()
      const exercises = []
      for (const pattern of patterns) {
        const exercise = pick(pattern, equipment, used)
        if (!exercise) continue // sem opção para esse equipamento (por exemplo, elevação lateral só com o corpo)
        used.add(exercise.id)
        const kind = exercise.compound ? 'compound' : 'isolation'
        const sets = SETS[experience] + (experience === 'advanced' && exercises.length === 0 ? 1 : 0)
        exercises.push({ exercise_id: exercise.id, name: exercise.name, group: exercise.group, sets, reps: REPS[kind], rest_s: REST_SECONDS[kind] })
      }
      return { index: index + 1, label, exercises }
    }),
  }
}

/** Volume da sessão em kg: soma de carga × repetições de todas as séries (no exercício com o corpo, só a carga extra). */
export const setVolumeKg = set => set.weight_grams * set.reps / 1000
export const exerciseVolumeKg = exercise => round1(exercise.sets.reduce((sum, set) => sum + setVolumeKg(set), 0))
export const sessionVolumeKg = exercises => round1(exercises.reduce((sum, exercise) => sum + exerciseVolumeKg(exercise), 0))
export const totalReps = exercises => exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((s, set) => s + set.reps, 0), 0)
const round1 = value => Math.round(value * 10) / 10

/** 1RM estimado (Epley), em kg; null acima de 12 repetições, sem carga ou sem repetição. */
export function estimatedOneRepMax(weightGrams, reps) {
  if (!weightGrams || reps < 1 || reps > 12) return null
  return round1(weightGrams / 1000 * (1 + (reps === 1 ? 0 : reps / 30)))
}

/** Melhor série do exercício na sessão: a de maior carga e, no empate, a de mais repetições. */
export function topSet(sets) {
  return sets.reduce((best, set) => (!best || set.weight_grams > best.weight_grams ||
    (set.weight_grams === best.weight_grams && set.reps > best.reps) ? set : best), null)
}

/**
 * Próxima carga sugerida (dupla progressão, PROVISÓRIO até os artigos de progressão): se todas as séries chegaram ao
 * topo da faixa, sobe cerca de 2,5% (arredondado a 0,5 kg, no mínimo 0,5 kg); se alguma ficou abaixo do piso, mantém;
 * senão mantém e busca mais repetições. Sem carga (exercício com o corpo), pede mais repetições.
 */
export function nextLoad(sets, [low, high]) {
  const top = topSet(sets)
  if (!top) return null
  if (!top.weight_grams) return { action: 'reps', weight_grams: 0 }
  if (sets.every(set => set.reps >= high)) {
    const step = Math.max(500, Math.round(top.weight_grams * 0.025 / 500) * 500)
    return { action: 'increase', weight_grams: top.weight_grams + step }
  }
  if (sets.some(set => set.reps < low)) return { action: 'hold', weight_grams: top.weight_grams }
  return { action: 'reps', weight_grams: top.weight_grams }
}

/** Faixa de repetições que o plano usa para o exercício (a do plano, se estiver nele; senão pela categoria). */
export const repRangeOf = exerciseId => REPS[EXERCISE_BY_ID[exerciseId]?.compound ? 'compound' : 'isolation']
