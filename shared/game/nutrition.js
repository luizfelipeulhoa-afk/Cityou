// Base calórica da aba Alimentação. Só cálculo puro, sem banco nem rede: roda no Worker e nos testes.
// Regras aprovadas pelo dono em 14/11/2026 (projeto "CityouApp", nutricao/decisoes-2026-11-14.md) e resumidas em
// docs/ideias/alimentacao-base-calorica.md. Não é prescrição: o resultado é uma sugestão com base em estudos.

/** Fontes citadas na tela, uma por regra. Quem mudar uma regra muda a fonte no mesmo commit. */
export const SOURCES = {
  bmr: 'Mifflin et al., 1990, American Journal of Clinical Nutrition (doi:10.1093/ajcn/51.2.241)',
  tee: 'National Academies (NASEM), Dietary Reference Intakes for Energy, 2023',
  deficit: 'Jensen et al., 2014, diretriz AHA/ACC/TOS, Circulation (doi:10.1161/01.cir.0000437739.71477.ee)',
  lean: 'Murphy & Koehler, 2022, Scandinavian Journal of Medicine & Science in Sports (doi:10.1111/sms.14075)',
  surplus: 'Slater et al., 2019, Frontiers in Nutrition (doi:10.3389/fnut.2019.00131)',
  proteinTrained: 'Morton et al., 2018, British Journal of Sports Medicine (doi:10.1136/bjsports-2017-097608)',
  proteinAdult: 'Rand et al., 2003, American Journal of Clinical Nutrition (doi:10.1093/ajcn/77.1.109)',
  proteinOlder: 'Bauer et al., 2013, PROT-AGE, JAMDA (doi:10.1016/j.jamda.2013.05.021)',
  proteinActive: 'Jäger et al., 2017, posição da ISSN sobre proteína e exercício (doi:10.1186/s12970-017-0177-8); Kato et al., 2016, PLOS ONE (doi:10.1371/journal.pone.0157406)',
  proteinDeficit: 'Wycherley et al., 2012, American Journal of Clinical Nutrition (doi:10.3945/ajcn.112.044321)',
  proteinTrainedDeficit: 'Aragon et al., 2017, posição da ISSN sobre dietas (doi:10.1186/s12970-017-0174-y); Refalo, Trexler & Helms, 2025 (doi:10.1519/SSC.0000000000000888)',
  obesity: 'Madden et al., 2016, Journal of Human Nutrition and Dietetics (doi:10.1111/jhn.12355)',
  scoff: 'Morgan et al., 1999, BMJ; versão brasileira SCOFF-BR: Teixeira et al., 2021, Brazilian Journal of Psychiatry (doi:10.1590/1516-4446-2020-1667)',
}

// TMB: Mifflin et al. 1990. Equação de Anjos (brasileiros) entra só depois de conferir os coeficientes.
export function restingMetabolicRate({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(sex === 'm' ? base + 5 : base - 161)
}

// Gasto total por categoria de atividade: equações de TEE do NASEM 2023 (tabela 5-5, água duplamente marcada).
// Categorias do PAL: inativo 1,00–1,53; pouco ativo 1,53–1,68; ativo 1,68–1,85; muito ativo 1,85–2,50.
const TEE = {
  m: {
    inactive: [753.07, -10.83, 6.5, 14.1],
    low: [581.47, -10.83, 8.3, 14.94],
    active: [1004.82, -10.83, 6.52, 15.91],
    very: [-517.88, -10.83, 15.61, 19.11],
  },
  f: {
    inactive: [584.9, -7.01, 5.72, 11.71],
    low: [575.77, -7.01, 6.6, 12.14],
    active: [710.25, -7.01, 6.54, 12.34],
    very: [511.83, -7.01, 9.07, 12.56],
  },
}
export const ACTIVITY_LEVELS = ['inactive', 'low', 'active', 'very']

export function totalEnergyExpenditure({ sex, weightKg, heightCm, age, activity }) {
  const [c, a, h, w] = TEE[sex][activity]
  return Math.round(c + a * age + h * heightCm + w * weightKg)
}

// Metas. Perder gordura: −500 kcal/dia (Jensen 2014). Preservar massa magra: no máximo −500 (Murphy & Koehler 2022).
// Ganhar massa: +360 a +480 kcal/dia (Slater 2019; o valor exato é desconhecido). Manter: o gasto total.
export const GOALS = {
  maintain: { adjustment: [0, 0], source: 'tee', expect: 'estavel' },
  fat_loss: { adjustment: [-500, -500], source: 'deficit', expect: 'descendo' },
  lean_preserve: { adjustment: [-500, -500], source: 'lean', expect: 'descendo' },
  muscle_gain: { adjustment: [360, 480], source: 'surplus', expect: 'subindo' },
}

// 18 a 80 anos (decisão do dono, 14/11/2026): as equações são de adultos a partir de 19, e 18 fica perto o suficiente
// (o SCOFF-BR foi validado a partir dos 18). Menores de 18 não recebem números: o corpo ainda está crescendo.
export const AGE_RANGE = [18, 80]

/**
 * Proteína por grupo, meta e atividade (regra aprovada pelo dono em 14/11/2026, projeto "CityouApp",
 * nutricao/atualizacao-2026-11-14-e-proteina.md). Nada é 100%: são sugestões com base em estudos.
 * - Treino de força: pelo menos 1,6 g/kg/dia (Morton 2018). Em déficit, nota de que estudos com pessoas treinadas e
 *   magras usaram 2,3 a 3,1 g por kg de massa magra (Aragon 2017, Refalo 2025); com `fatFreeMassKg` a faixa vira gramas.
 * - Ativo ou muito ativo sem treino de força: 1,4 a 2,0 g/kg/dia (Jäger 2017; Kato 2016).
 * - Mais de 65 anos: 1,0 a 1,2 g/kg/dia (Bauer 2013).
 * - Demais adultos: 0,8 g/kg/dia de adequação (Rand 2003); em déficit, nota de que mais proteína ajuda a preservar
 *   músculo (Wycherley 2012), sem dose no número.
 * O valor alto do déficit nunca vira meta por peso total: é por massa magra, que o app ainda não mede.
 */
export function proteinTarget({ weightKg, age, resistanceTraining, activity = 'inactive', deficit = false, fatFreeMassKg = null }) {
  const grams = (perKg, kg = weightKg) => Math.round(perKg * kg)
  const lean = Number.isFinite(fatFreeMassKg) && fatFreeMassKg > 0 ? fatFreeMassKg : null
  if (resistanceTraining) {
    const result = { group: 'trained', perKg: [1.6, null], grams: [grams(1.6), null], notes: [], sources: ['proteinTrained'] }
    if (deficit) {
      result.notes.push('trained_deficit')
      result.sources.push('proteinTrainedDeficit')
      if (lean) result.leanGrams = [grams(2.3, lean), grams(3.1, lean)]
    }
    return result
  }
  if (['active', 'very'].includes(activity)) {
    return { group: 'active', perKg: [1.4, 2.0], grams: [grams(1.4), grams(2.0)], notes: [], sources: ['proteinActive'] }
  }
  if (age >= 65) return { group: 'older', perKg: [1.0, 1.2], grams: [grams(1.0), grams(1.2)], notes: [], sources: ['proteinOlder'] }
  return deficit
    ? { group: 'adult', perKg: [0.8, null], grams: [grams(0.8), null], notes: ['deficit'], sources: ['proteinAdult', 'proteinDeficit'] }
    : { group: 'adult', perKg: [0.8, null], grams: [grams(0.8), null], notes: [], sources: ['proteinAdult'] }
}

export const bodyMassIndex = ({ weightKg, heightCm }) => Math.round(weightKg / (heightCm / 100) ** 2 * 10) / 10

const RANGES = { age: AGE_RANGE, weightKg: [20, 400], heightCm: [120, 230] }

export function validateInput(input) {
  const errors = []
  if (!['m', 'f'].includes(input.sex)) errors.push('sex')
  if (!Object.hasOwn(GOALS, input.goal)) errors.push('goal')
  if (!ACTIVITY_LEVELS.includes(input.activity)) errors.push('activity')
  for (const [field, [min, max]] of Object.entries(RANGES)) {
    const v = input[field]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) errors.push(field)
  }
  return errors
}

/**
 * Calcula a base. Nunca devolve alvo abaixo da TMB: se a meta pedir isso, o alvo fica na TMB e `belowBmr` sinaliza.
 * `notes` traz avisos neutros para a tela (`precision` quando o IMC é 30 ou mais: Madden 2016 mostra erro de mais de
 * 10% em cerca de um quarto das pessoas com obesidade).
 */
export function calorieBase(input) {
  const errors = validateInput(input)
  if (errors.length) return { ok: false, errors }
  const bmr = restingMetabolicRate(input)
  const tee = totalEnergyExpenditure(input)
  const { adjustment, source } = GOALS[input.goal]
  const [low, high] = adjustment
  const bmi = bodyMassIndex(input)
  return {
    ok: true,
    bmr,
    tee,
    adjustment,
    target: { low: Math.max(bmr, tee + low), high: Math.max(bmr, tee + high) },
    belowBmr: tee + low < bmr || tee + high < bmr,
    bmi,
    protein: proteinTarget({ ...input, deficit: low < 0 }),
    notes: bmi >= 30 ? ['precision'] : [],
    sources: ['bmr', 'tee', source].filter((key, index, list) => list.indexOf(key) === index),
  }
}

/** Avisos do plano que a própria pessoa registrou. Avisa, nunca impede (decisão do dono). */
export function planWarnings(plan, base) {
  if (!plan || !base?.ok) return []
  const warnings = []
  if (plan.kcal < base.bmr) warnings.push('below_bmr')
  if (plan.protein_g !== null && plan.protein_g < base.protein.grams[0]) warnings.push('low_protein')
  return warnings
}

// SCOFF (Morgan 1999): duas ou mais respostas "sim" indicam possível transtorno alimentar.
export const SCOFF_QUESTIONS = 5
export const scoffPositive = answers => answers.filter(Boolean).length >= 2
