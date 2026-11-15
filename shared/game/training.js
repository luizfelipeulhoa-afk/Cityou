// Treino de musculação sugerido da aba Fitness (pedido do dono, 15/11/2026). Funções puras, sem banco: o Worker
// (worker/training.js) monta o plano e calcula volume e progressão por aqui, e a tela usa o catálogo para os nomes.
//
// É SUGESTÃO, não prescrição. Cada regra cita a fonte em SOURCES (artigos do pacote "Cityou - Evidências científicas
// de musculação", 15/11/2026, guardado no projeto do claude.ai "CityouApp", pasta treino/). O que é escolha de produto e
// não vem de estudo está marcado como tal: a escolha dos exercícios de cada dia (o catálogo).

export const EVIDENCE_PENDING = false
export const SOURCES = {
  iversen2021: { ref: 'Iversen VM et al., 2021. No Time to Lift? Designing Time-Efficient Training Programs for Strength and Hypertrophy. Sports Med 51:2079-95 (PMC8449772).', note: 'mínimo de 4 séries semanais por grupo muscular, faixa de 6 a 15 RM; diretrizes: 2 a 4 séries por grupo, 2 a 3 vezes por semana (4 a 12 séries semanais) para quem não treina ou treina há pouco' },
  iusca2021: { ref: 'Schoenfeld BJ et al., 2021. Resistance Training Recommendations to Maximize Muscle Hypertrophy in an Athletic Population: Position Stand of the IUSCA. Int J Strength Cond 1(1).', note: 'cerca de 10 séries por músculo por semana como mínimo geral para otimizar a hipertrofia em quem treina; até ~10 por sessão; hipertrofia parecida numa faixa ampla de cargas; uma vez por semana basta em volume baixo a moderado; descanso de pelo menos 2 min nos multiarticulares e de 60 a 90 s nos uniarticulares' },
  acsm2009: { ref: 'Ratamess NA et al., 2009. American College of Sports Medicine position stand. Progression models in resistance training for healthy adults. Med Sci Sports Exerc 41:687-708.', note: 'subir a carga de 2% a 10% quando a pessoa passa uma ou duas repetições do alvo' },
  refalo2022: { ref: 'Refalo MC et al., 2022. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy. Sports Med 53:649-65 (PMC9935748).', note: 'treinar até a falha teve vantagem trivial sobre não ir à falha: parar com repetições sobrando é aceitável' },
  singer2024: { ref: 'Singer A et al., 2024. Give it a rest: inter-set rest interval duration and muscle hypertrophy. Front Sports Act Living 6:1429789 (PMC11349676).', note: 'pequeno benefício com descanso acima de 60 s; sem diferença perceptível acima de 90 s' },
  plotkin2022: { ref: 'Plotkin D et al., 2022. Progressive overload without progressing load? PeerJ 10:e14142 (PMC9528903).', note: 'progredir por repetições ou por carga são estratégias viáveis (dupla progressão)' },
  evangelista2021: { ref: 'Evangelista AL et al., 2021. Split or full-body workout routine: which is best to increase muscle strength and hypertrophy? Einstein (São Paulo) 19:eAO5781 (PMC8372753).', note: 'treinar 2 ou 4 vezes por semana com o mesmo volume semanal dá adaptações parecidas: a divisão pode seguir os dias disponíveis' },
  who2020: { ref: 'Bull FC et al., 2020. WHO guidelines on physical activity and sedentary behaviour. Br J Sports Med 54:1451-62 (PMC7719906).', note: 'adultos: fortalecimento de todos os grandes grupos musculares em 2 ou mais dias por semana' },
  equipment: { ref: 'Haugen ME et al., 2023. Free-weight vs. machine-based strength training. BMC Sports Sci Med Rehabil 15:103 (PMC10426227); Ogawa M et al., 2023. Free weight and body mass-based resistance training. Exp Physiol 108:975-85 (PMC10988481).', note: 'peso livre e máquina sem diferença de hipertrofia; treino com o peso do corpo comparável ao peso livre em jovens e adultos de meia-idade' },
  deficit: { ref: 'Deller M et al., 2026. Effects of Calorie Restriction With and Without Strength, Endurance or Mixed Training on Fat-Free and Skeletal Muscle Mass. Diabetes Obes Metab 28:6810-23 (PMC13341414).', note: 'na restrição calórica, o treino de força e o misto preservaram a massa livre de gordura melhor que só a dieta' },
  concurrent: { ref: 'Schumann M et al., 2021. Compatibility of Concurrent Aerobic and Strength Training. Sports Med 52:601-12 (PMC8891239).', note: 'aeróbio junto com musculação não compromete a hipertrofia nem a força máxima' },
  epley: { ref: 'Epley B, 1985. Poundage chart. Boyd Epley Workout.', note: 'estimativa de 1RM: carga × (1 + repetições / 30), só até 12 repetições (fórmula de uso comum, não está no pacote)' },
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

// Divisão por dias na semana (evangelista2021 e iusca2021: com o mesmo volume semanal, a frequência muda pouco, então
// a divisão acompanha os dias disponíveis e o teto de ~10 séries por músculo por sessão): 1 a 3 dias, corpo inteiro; 4, superior e inferior duas vezes; 5, superior, inferior, empurrar, puxar,
// pernas; 6, empurrar, puxar e pernas duas vezes. Com 1 dia, a tela lembra que a OMS recomenda 2 ou mais (who2020).
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

// Séries, repetições, esforço e descanso. A meta vem da base calórica: o treino de força é o mesmo para ganhar massa e
// para perder gordura (na perda, ele preserva a massa livre de gordura: deficit); quem muda é a alimentação.
// Séries por exercício (iversen2021, iusca2021): quem começa fica perto do mínimo de 4 séries semanais por grupo; quem já
// treina sobe em direção às ~10 do IUSCA, conforme os dias. Repetições dentro dos 6 a 15 RM (iversen2021, iusca2021).
// Descanso: 2 min nos multiarticulares e 90 s nos uniarticulares (iusca2021; singer2024: acima de 90 s, pouca diferença).
// Parar com 1 a 3 repetições sobrando (refalo2022).
const SETS = { beginner: [2, 3], intermediate: [3, 4], advanced: [3, 4] } // piso e teto de séries por exercício
const REPS = { compound: [6, 12], isolation: [10, 15] }
const REST_SECONDS = { compound: 120, isolation: 90 }
export const RIR = [1, 3] // repetições que ainda daria para fazer ao fim da série
// Séries semanais por grupo que o plano mira (iversen2021 para quem começa; iusca2021 para quem já treina).
export const WEEKLY_SETS_TARGET = { beginner: 4, intermediate: 10, advanced: 10 }

function pick(pattern, equipment, used) {
  const options = EXERCISES.filter(exercise => exercise.pattern === pattern && exercise.setups.includes(equipment))
  return options.find(exercise => !used.has(exercise.id)) ?? null
}

/**
 * Plano sugerido: um treino por dia escolhido, cada um com exercícios, séries, faixa de repetições e descanso. As séries
 * de cada exercício saem do alvo semanal do grupo dividido pelas vezes que ele aparece na semana, entre o piso e o teto
 * da experiência (quem começa: 2 a 3; quem já treina: 3 a 4).
 */
export function suggestPlan({ days, experience, equipment, goal }) {
  if (!Number.isInteger(days) || days < DAYS_RANGE[0] || days > DAYS_RANGE[1]) throw new RangeError('days')
  if (!EXPERIENCE.includes(experience) || !EQUIPMENT.includes(equipment)) throw new RangeError('setup')
  const chosen = SPLITS[days].map(key => {
    const [label, patterns] = DAY_TEMPLATES[key]
    const used = new Set()
    const exercises = []
    for (const pattern of patterns) {
      const exercise = pick(pattern, equipment, used)
      if (!exercise) continue // sem opção para esse equipamento (por exemplo, elevação lateral só com o corpo)
      used.add(exercise.id)
      exercises.push(exercise)
    }
    return { label, exercises }
  })
  const times = {}
  for (const day of chosen) for (const exercise of day.exercises) times[exercise.group] = (times[exercise.group] ?? 0) + 1
  const [low, high] = SETS[experience]
  const target = WEEKLY_SETS_TARGET[experience]
  return {
    goal, provisional: EVIDENCE_PENDING, rir: RIR, weekly_sets_target: target,
    days: chosen.map(({ label, exercises }, index) => ({
      index: index + 1, label,
      exercises: exercises.map(exercise => {
        const kind = exercise.compound ? 'compound' : 'isolation'
        const sets = Math.min(high, Math.max(low, Math.ceil(target / times[exercise.group])))
        return { exercise_id: exercise.id, name: exercise.name, group: exercise.group, sets, reps: REPS[kind], rest_s: REST_SECONDS[kind] }
      }),
    })),
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
 * Próxima carga sugerida (dupla progressão: plotkin2022, repetições e carga são caminhos viáveis): se todas as séries
 * chegaram ao topo da faixa, sobe cerca de 2,5% (o passo menor da faixa de 2% a 10% do acsm2009, arredondado a 0,5 kg, no mínimo 0,5 kg); se alguma
 * ficou abaixo do piso, mantém; senão mantém e busca mais repetições. Sem carga (exercício com o corpo), mais repetições.
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

/** Séries por semana de cada grupo muscular no plano (para mostrar e para os testes conferirem o alvo). */
export function weeklySetsByGroup(plan) {
  const totals = {}
  for (const day of plan.days) for (const item of day.exercises) totals[item.group] = (totals[item.group] ?? 0) + item.sets
  return totals
}

// Triagem de esforço antes de sugerir treino (guia do pacote de evidências, seção 1). Decisão do dono (15/11/2026): o
// plano sai mesmo com "sim", junto com o aviso para procurar um médico antes de começar. Texto a revisar pelo dono.
export const READINESS_QUESTIONS = {
  exertion_symptoms: 'Ao fazer esforço, você sente dor ou aperto no peito, tontura forte, desmaio ou falta de ar fora do comum?',
  medical_restriction: 'Algum médico já disse para você não fazer exercício ou só fazer com acompanhamento?',
  recent_injury: 'Você tem uma lesão recente ou uma dor que piora quando faz exercício?',
}

// Aviso fixo da tela (decisão do dono, 15/11/2026).
export const DISCLAIMER = 'Tudo aqui é sugestão com base em estudos científicos, não orientação profissional. Antes de começar, o ideal é passar por um médico; se sentir dor, pare.'
