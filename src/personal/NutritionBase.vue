<script setup>
// Base calórica da aba Alimentação. Uma etapa por vez: avaliação → triagem → base (ou apoio, ou fora do alcance).
// As contas são do servidor (worker/nutrition.js, shared/game/nutrition.js); aqui só se mostra e se envia.
// Textos de aviso aprovados pelo dono em 14/11/2026; o dono revisa as frases antes de publicar.
import { computed, onMounted, reactive, ref } from 'vue'
import {
  acceptNutritionTarget, loadNutrition, loadScreeningAnswers, removeNutrition, removeNutritionPlan,
  removeScreeningAnswers, saveNutritionPlan, saveNutritionProfile, sendScreening,
} from '../fifones/api.js'

const view = ref(null)
const loadError = ref('')
const busy = ref(false)
const message = ref('')
const editing = ref(false)
const confirmWipe = ref(false)
const answersShown = ref(null)

const year = new Date().getFullYear()
const profileForm = reactive({ height_cm: '', sex: '', birth_year: '', activity: '', goal: '', resistance_training: false, pregnant: false })
const profileErrors = ref({})
const planForm = reactive({ kcal: '', protein_g: '', note: '' })
const planErrors = ref({})
const planOpen = ref(false)
const screening = ref([null, null, null, null, null])
const diagnosis = ref(null)
const introSeen = ref(false)
const screeningError = ref('')

// SCOFF-BR, versão brasileira validada (Teixeira et al., 2021, Brazilian Journal of Psychiatry, doi:10.1590/1516-4446-2020-1667).
// Texto exato da validação: não reescrever, senão o ponto de corte de 2 respostas deixa de valer.
const QUESTIONS = [
  'Você provoca vômito quando está se sentindo desconfortavelmente cheio?',
  'Você se preocupa de ter perdido o controle do quanto você come?',
  'Você perdeu recentemente mais de 5 quilos num período de 3 meses?',
  'Você acredita estar gordo(a), apesar das outras pessoas dizerem que você está muito magro(a)?',
  'Você diria que a comida domina a sua vida?',
]
const ACTIVITIES = [
  ['inactive', 'Inativo', 'Rotina mais sentada, pouco exercício.'],
  ['low', 'Pouco ativo', 'Algum exercício ou caminhada durante a semana.'],
  ['active', 'Ativo', 'Exercício na maior parte dos dias.'],
  ['very', 'Muito ativo', 'Treino intenso ou trabalho físico pesado quase todo dia.'],
]
const GOALS = [
  ['fat_loss', 'Perder gordura'],
  ['lean_preserve', 'Perder gordura preservando músculo'],
  ['maintain', 'Manter o peso'],
  ['muscle_gain', 'Ganhar massa muscular'],
]
const goalName = id => GOALS.find(([key]) => key === id)?.[1] ?? id
const kcal = value => Math.round(value).toLocaleString('pt-BR')
const range = ({ low, high }) => (low === high ? `${kcal(low)} kcal` : `${kcal(low)} a ${kcal(high)} kcal`)
const dateBr = day => (day ? day.split('-').reverse().join('/') : '')

const state = computed(() => (editing.value ? 'profile' : view.value?.state))
const base = computed(() => view.value?.base)
const suggestion = computed(() => {
  const b = base.value
  if (!b) return ''
  const [low, high] = b.adjustment
  if (low < 0) return `Sugestão de déficit: ${kcal(-low)} kcal por dia, com base em estudos. Vale conversar com um profissional de nutrição para ajustar ao seu caso.`
  if (high > 0) return `Sugestão de superávit: ${kcal(low)} a ${kcal(high)} kcal por dia, com base em estudos. Vale conversar com um profissional de nutrição para ajustar ao seu caso.`
  return 'Sugestão para manter o peso: o seu gasto estimado, com base em estudos. Vale conversar com um profissional de nutrição para ajustar ao seu caso.'
})
const proteinText = computed(() => {
  const p = base.value?.protein
  if (!p) return ''
  if (p.group === 'trained') {
    const deficit = p.notes.includes('trained_deficit')
      ? (p.leanGrams ? ` Em déficit, estudos com pessoas treinadas usaram mais: de ${p.leanGrams[0]} a ${p.leanGrams[1]} g por dia pela sua massa magra.` : ' Em déficit, estudos com pessoas treinadas e magras usaram mais, até 2,3 a 3,1 g por kg de massa magra.')
      : ''
    return `Pelo menos ${p.grams[0]} g por dia (1,6 g por kg), para quem faz treino de força.${deficit}`
  }
  if (p.group === 'active') return `De ${p.grams[0]} a ${p.grams[1]} g por dia (1,4 a 2,0 g por kg), para quem se exercita com frequência.`
  if (p.group === 'older') return `De ${p.grams[0]} a ${p.grams[1]} g por dia (1,0 a 1,2 g por kg), para quem tem mais de 65 anos.`
  const deficit = p.notes.includes('deficit') ? ' Em déficit, comer mais proteína ajuda a preservar músculo.' : ''
  return `Referência de ${p.grams[0]} g por dia (0,8 g por kg), o que cobre a necessidade da maioria dos adultos. Para ganhar músculo, o que mais conta é o treino de força.${deficit}`
})

function apply(next) {
  view.value = next
  editing.value = false
  const p = next.profile
  if (p) Object.assign(profileForm, { ...p, height_cm: String(p.height_cm), birth_year: String(p.birth_year) })
  if (next.plan) Object.assign(planForm, { kcal: String(next.plan.kcal), protein_g: next.plan.protein_g === null ? '' : String(next.plan.protein_g), note: next.plan.note })
}

async function run(task, after) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    apply(await task())
    after?.()
  } catch (error) {
    if (error.status === 422 && error.details?.fields) after?.(error.details.fields)
    else message.value = error.message
  } finally {
    busy.value = false
  }
}

const intOrNull = value => (String(value).trim() === '' ? null : Number(String(value).trim().replace(',', '.')))

function saveProfile() {
  const body = {
    height_cm: intOrNull(profileForm.height_cm), sex: profileForm.sex, birth_year: intOrNull(profileForm.birth_year),
    activity: profileForm.activity, goal: profileForm.goal, resistance_training: Boolean(profileForm.resistance_training),
    pregnant: profileForm.sex === 'f' && Boolean(profileForm.pregnant),
  }
  // Mesma regra do servidor, só para responder na hora e marcar em vermelho.
  const errors = {}
  if (!Number.isInteger(body.height_cm) || body.height_cm < 120 || body.height_cm > 230) errors.height_cm = 'Informe a altura em centímetros, entre 120 e 230.'
  if (!body.sex) errors.sex = 'Escolha uma opção.'
  if (!Number.isInteger(body.birth_year) || body.birth_year < year - 110 || body.birth_year > year) errors.birth_year = 'Informe o ano de nascimento.'
  if (!body.activity) errors.activity = 'Escolha o seu nível de atividade.'
  if (!body.goal) errors.goal = 'Escolha uma meta.'
  profileErrors.value = errors
  if (Object.keys(errors).length) return
  run(() => saveNutritionProfile(body), fields => { profileErrors.value = fields ?? {} })
}

function resetScreening() {
  screening.value = [null, null, null, null, null]
  diagnosis.value = null
  introSeen.value = false
}

// Triagem opcional: a pergunta direta aceita "prefiro não responder" (null); as cinco do SCOFF vão todas ou nenhuma.
function saveScreening(skip = false) {
  let answers = null
  const answered = screening.value.filter(answer => answer !== null).length
  if (!skip && answered) {
    if (answered < screening.value.length) {
      screeningError.value = 'Responda as cinco perguntas do questionário, ou deixe todas sem resposta.'
      return
    }
    answers = screening.value
  }
  screeningError.value = ''
  run(() => sendScreening(skip ? null : diagnosis.value, answers), resetScreening)
}

function savePlan() {
  const body = { kcal: intOrNull(planForm.kcal), protein_g: intOrNull(planForm.protein_g), note: planForm.note }
  const errors = {}
  if (!Number.isInteger(body.kcal) || body.kcal < 500 || body.kcal > 8000) errors.kcal = 'Informe as calorias do dia, entre 500 e 8000.'
  if (body.protein_g !== null && (!Number.isInteger(body.protein_g) || body.protein_g < 0 || body.protein_g > 500)) errors.protein_g = 'Informe a proteína em gramas, entre 0 e 500, ou deixe vazio.'
  planErrors.value = errors
  if (Object.keys(errors).length) return
  run(() => saveNutritionPlan(body), fields => { planErrors.value = fields ?? {}; if (!fields) planOpen.value = false })
}

function dropPlan() {
  run(removeNutritionPlan, () => Object.assign(planForm, { kcal: '', protein_g: '', note: '' }))
}

function redoScreening() {
  resetScreening()
  if (view.value) view.value = { ...view.value, state: 'screening' }
}

async function showAnswers() {
  if (busy.value) return
  busy.value = true
  try { answersShown.value = await loadScreeningAnswers() } catch (error) { message.value = error.message } finally { busy.value = false }
}

function dropAnswers() {
  run(removeScreeningAnswers, () => { answersShown.value = null })
}

function wipe() {
  if (!confirmWipe.value) { confirmWipe.value = true; return }
  run(removeNutrition, () => {
    confirmWipe.value = false
    Object.assign(profileForm, { height_cm: '', sex: '', birth_year: '', activity: '', goal: '', resistance_training: false, pregnant: false })
    Object.assign(planForm, { kcal: '', protein_g: '', note: '' })
  })
}

async function load() {
  loadError.value = ''
  try { apply(await loadNutrition()) } catch (error) { loadError.value = error.message }
}
onMounted(load)
</script>

<template>
  <section class="nutrition-base surface" aria-labelledby="nutrition-base-title">
    <header class="nb-head">
      <span class="eyebrow">BASE CALÓRICA</span>
      <h2 id="nutrition-base-title">Uma sugestão para a sua meta, com base em estudos.</h2>
      <p class="nb-muted">Não é dieta nem prescrição: não somos nutricionistas. Os números são estimativas e as fontes estão abaixo de cada resultado.</p>
    </header>

    <p v-if="loadError" class="nb-alert" role="alert">{{ loadError }} <button class="quiet-button" @click="load">Tentar de novo</button></p>
    <p v-else-if="!view" class="nb-muted">Carregando…</p>

    <template v-else>
      <p v-if="message" class="nb-alert" role="alert">{{ message }}</p>

      <!-- Avaliação -->
      <form v-if="state === 'profile'" class="nb-form" novalidate @submit.prevent="saveProfile">
        <h3>Sua avaliação</h3>
        <p class="nb-muted">O peso vem da sua pesagem mais recente na aba <a href="#/fitness">Fitness</a>.</p>
        <div class="nb-columns">
          <label :class="{ 'nb-invalid': profileErrors.height_cm }">Altura (cm)
            <input v-model="profileForm.height_cm" inputmode="numeric" autocomplete="off" placeholder="Ex.: 170" :aria-invalid="Boolean(profileErrors.height_cm)" />
            <small v-if="profileErrors.height_cm">{{ profileErrors.height_cm }}</small>
          </label>
          <label :class="{ 'nb-invalid': profileErrors.birth_year }">Ano de nascimento
            <input v-model="profileForm.birth_year" inputmode="numeric" autocomplete="bday-year" placeholder="Ex.: 1995" :aria-invalid="Boolean(profileErrors.birth_year)" />
            <small v-if="profileErrors.birth_year">{{ profileErrors.birth_year }}</small>
          </label>
        </div>
        <fieldset :class="{ 'nb-invalid': profileErrors.sex }">
          <legend>Sexo (usado nas equações)</legend>
          <label class="nb-choice"><input v-model="profileForm.sex" type="radio" value="f" /> Feminino</label>
          <label class="nb-choice"><input v-model="profileForm.sex" type="radio" value="m" /> Masculino</label>
          <small v-if="profileErrors.sex">{{ profileErrors.sex }}</small>
        </fieldset>
        <fieldset :class="{ 'nb-invalid': profileErrors.activity }">
          <legend>Nível de atividade</legend>
          <label v-for="[id, name, hint] in ACTIVITIES" :key="id" class="nb-choice"><input v-model="profileForm.activity" type="radio" :value="id" /> <span><strong>{{ name }}</strong> {{ hint }}</span></label>
          <small v-if="profileErrors.activity">{{ profileErrors.activity }}</small>
        </fieldset>
        <fieldset :class="{ 'nb-invalid': profileErrors.goal }">
          <legend>Meta</legend>
          <label v-for="[id, name] in GOALS" :key="id" class="nb-choice"><input v-model="profileForm.goal" type="radio" :value="id" /> {{ name }}</label>
          <small v-if="profileErrors.goal">{{ profileErrors.goal }}</small>
        </fieldset>
        <label class="nb-choice"><input v-model="profileForm.resistance_training" type="checkbox" /> Faço treino de força (musculação) com regularidade</label>
        <label v-if="profileForm.sex === 'f'" class="nb-choice"><input v-model="profileForm.pregnant" type="checkbox" /> Estou grávida ou amamentando</label>
        <footer class="nb-actions">
          <button v-if="editing" type="button" class="quiet-button" :disabled="busy" @click="editing = false">Cancelar</button>
          <button class="primary-btn" :disabled="busy">{{ busy ? 'Salvando…' : 'Salvar avaliação' }}</button>
        </footer>
      </form>

      <!-- Triagem, parte 1: aviso antes das perguntas (pedido do dono, 14/11/2026) -->
      <div v-else-if="state === 'screening' && !introSeen" class="nb-intro">
        <span class="eyebrow">ANTES DOS NÚMEROS</span>
        <h3>Algumas perguntas sobre a sua relação com a comida</h3>
        <p>As próximas perguntas falam de transtornos alimentares, como anorexia, bulimia e compulsão. Sabemos que é um assunto delicado, por isso explicamos antes.</p>
        <ul class="nb-intro-points">
          <li><strong>Por que perguntamos.</strong> Para algumas pessoas, uma meta de comer menos pode fazer mal. Com as suas respostas, o cálculo fica mais adequado para você.</li>
          <li><strong>É importante, mas não é obrigatório.</strong> Você pode pular e ver a sugestão mesmo assim.</li>
          <li><strong>Só você vê.</strong> As respostas ficam na sua conta, e você pode apagá-las quando quiser.</li>
          <li><strong>Não é um diagnóstico.</strong> Ninguém vai julgar o que você responder.</li>
        </ul>
        <footer class="nb-actions">
          <button type="button" class="quiet-button" :disabled="busy" @click="saveScreening(true)">Pular por agora</button>
          <button type="button" class="primary-btn" @click="introSeen = true">Responder as perguntas</button>
        </footer>
      </div>

      <!-- Triagem, parte 2: as perguntas -->
      <form v-else-if="state === 'screening'" class="nb-form" novalidate @submit.prevent="saveScreening()">
        <h3>Sua relação com a comida</h3>
        <p class="nb-muted">Responda o que se aplica a você agora. Qualquer pergunta pode ficar sem resposta.</p>
        <fieldset class="nb-question">
          <legend>Você tem ou já teve diagnóstico de transtorno alimentar, ou está em tratamento para isso?</legend>
          <label class="nb-choice"><input v-model="diagnosis" type="radio" name="diagnosis" :value="true" /> Sim</label>
          <label class="nb-choice"><input v-model="diagnosis" type="radio" name="diagnosis" :value="false" /> Não</label>
          <label class="nb-choice"><input v-model="diagnosis" type="radio" name="diagnosis" :value="null" /> Prefiro não responder</label>
        </fieldset>
        <p class="nb-muted">As próximas cinco fazem parte de um questionário usado por profissionais de saúde (SCOFF) para perceber sinais que muita gente não nota em si.</p>
        <fieldset v-for="(question, index) in QUESTIONS" :key="index" class="nb-question">
          <legend>{{ question }}</legend>
          <label class="nb-choice"><input v-model="screening[index]" type="radio" :name="`scoff-${index}`" :value="true" /> Sim</label>
          <label class="nb-choice"><input v-model="screening[index]" type="radio" :name="`scoff-${index}`" :value="false" /> Não</label>
        </fieldset>
        <p v-if="screeningError" class="nb-alert" role="alert">{{ screeningError }}</p>
        <footer class="nb-actions">
          <button type="button" class="quiet-button" :disabled="busy" @click="introSeen = false">Voltar</button>
          <button class="primary-btn" :disabled="busy">{{ busy ? 'Enviando…' : 'Continuar' }}</button>
        </footer>
      </form>

      <!-- Fora do alcance das equações -->
      <div v-else-if="state === 'not_available'" class="nb-panel">
        <template v-if="view.reason === 'pregnancy'">
          <h3>Na gestação e na amamentação, a necessidade aumenta</h3>
          <p>Nessas fases o corpo precisa de mais energia, e o app não recomenda déficit. As equações que usamos não incluem esse acréscimo, então preferimos não mostrar um número que ficaria abaixo do que você precisa. Converse com seu médico ou nutricionista para chegar ao valor certo para você.</p>
        </template>
        <template v-else-if="view.reason === 'minor'">
          <h3>Antes dos 18, a conta é outra</h3>
          <p>Nessa fase o corpo ainda está crescendo, e as equações que usamos são feitas para adultos. Por isso não mostramos metas de calorias. Se você quer mudar algo na alimentação, vale conversar com a sua família e com um profissional de saúde, como médico ou nutricionista. Você continua podendo registrar suas refeições aqui embaixo.</p>
        </template>
        <template v-else>
          <h3>A base calórica é para adultos de 18 a 80 anos</h3>
          <p>É a faixa de idade das equações que usamos. Fora dela, vale conversar com um profissional de saúde.</p>
        </template>
      </div>

      <!-- Dados incompletos -->
      <div v-else-if="state === 'incomplete'" class="nb-panel">
        <h3>Dados incompletos</h3>
        <ul class="nb-fields">
          <li :class="{ 'nb-invalid': view.missing.includes('weight') }">
            <strong>Peso</strong>
            <span v-if="view.missing.includes('weight')">Registre uma pesagem na aba <a href="#/fitness">Fitness</a> (dos últimos 30 dias).</span>
            <span v-else>Ok</span>
          </li>
          <li :class="{ 'nb-invalid': view.missing.includes('heightCm') }">
            <strong>Altura</strong>
            <span>{{ view.profile?.height_cm ? `${view.profile.height_cm} cm` : 'Informe na sua avaliação.' }}</span>
          </li>
        </ul>
      </div>

      <!-- Base pronta -->
      <div v-else-if="state === 'ready'" class="nb-result">
        <div class="nb-figure">
          <span class="eyebrow">{{ goalName(base.goal).toUpperCase() }}</span>
          <strong>{{ range(base.estimate) }}</strong>
          <span>por dia, estimativa</span>
        </div>
        <p v-if="base.goal_changed" class="nb-note">Pelas suas respostas na triagem, mostramos o gasto para manter o peso, sem sugestão de déficit. Para perder peso com segurança, vale conversar com um profissional de saúde, como médico ou nutricionista. Pelo SUS, a Unidade Básica de Saúde é um bom começo.</p>
        <p class="nb-suggestion">{{ suggestion }}</p>
        <p v-if="base.below_bmr" class="nb-note">A estimativa foi ajustada para não ficar abaixo da sua taxa metabólica basal.</p>
        <p v-if="base.notes.includes('precision')" class="nb-note">Essa estimativa é menos precisa para corpos com mais gordura. Se quiser, um profissional pode medir com mais precisão.</p>
        <dl class="nb-details">
          <div><dt>Gasto estimado do dia</dt><dd>{{ kcal(base.tee) }} kcal</dd></div>
          <div><dt>Taxa metabólica basal</dt><dd>{{ kcal(base.bmr) }} kcal</dd></div>
          <div><dt>Proteína</dt><dd>{{ proteinText }} <span class="nb-small">Se você tem doença nos rins, converse com seu médico antes de aumentar a proteína.</span></dd></div>
          <div v-if="base.composition"><dt>Massa magra usada</dt><dd>{{ base.composition.lean_kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) }} kg (média de {{ base.composition.count }} {{ base.composition.count === 1 ? 'medida' : 'medidas' }} da aba Fitness). Entra só na sugestão de proteína.</dd></div>
          <div><dt>Peso usado</dt><dd>{{ base.weight_kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) }} kg (média de 7 dias até {{ dateBr(base.weight_day) }})</dd></div>
        </dl>

        <div class="nb-target">
          <template v-if="!view.target">
            <p>Quer usar essa estimativa como a sua meta? Você pode mudar depois.</p>
            <button class="primary-btn" :disabled="busy" @click="run(acceptNutritionTarget)">Usar como minha meta</button>
          </template>
          <template v-else>
            <p>Sua meta: <strong>{{ range(view.target) }}</strong> por dia, desde {{ dateBr(view.target.day) }} ({{ goalName(view.target.goal).toLowerCase() }}).</p>
            <template v-if="view.estimate_changed">
              <p class="nb-muted">A estimativa mudou com o seu peso ou a sua meta. A sua meta só muda se você quiser.</p>
              <button class="quiet-button" :disabled="busy" @click="run(acceptNutritionTarget)">Usar a estimativa nova</button>
            </template>
            <p v-if="view.progress?.status === 'waiting'" class="nb-muted">Com 3 semanas de pesagens, comparamos o previsto com o real.</p>
            <p v-else-if="view.progress?.status === 'on_track'" class="nb-muted">Seu peso está andando na direção da sua meta.</p>
            <p v-else-if="view.progress?.status === 'off_track'" class="nb-note">Seu peso não está andando como a estimativa previa. Isso é comum: horário da pesagem, água e o dia a dia mudam o número. Vale conversar com um profissional de nutrição.</p>
          </template>
        </div>

        <details class="nb-sources">
          <summary>Fontes</summary>
          <ul><li v-for="source in base.sources" :key="source.key">{{ source.text }}</li></ul>
        </details>
      </div>

      <!-- Dieta própria: aparece depois da avaliação -->
      <section v-if="view.profile && !editing && state !== 'profile' && state !== 'screening'" class="nb-plan" aria-labelledby="nb-plan-title">
        <h3 id="nb-plan-title">Minha dieta</h3>
        <p class="nb-muted">Se você já segue um plano, registre aqui para acompanhar pelo app. O plano é seu: o app não o valida como prescrição.</p>
        <div v-if="view.plan && !planOpen" class="nb-plan-card">
          <p><strong>{{ kcal(view.plan.kcal) }} kcal</strong> por dia<span v-if="view.plan.protein_g !== null">, {{ view.plan.protein_g }} g de proteína</span></p>
          <p v-if="view.plan.note" class="nb-muted">{{ view.plan.note }}</p>
          <p v-if="view.plan_warnings.includes('below_bmr')" class="nb-note">Este número está abaixo da sua taxa metabólica basal, e isso pode fazer mal à saúde. Vale conversar com um profissional antes de continuar. Você pode seguir se quiser, a decisão é sua.</p>
          <p v-if="view.plan_warnings.includes('low_protein')" class="nb-note">A proteína está abaixo da referência para o seu grupo ({{ base?.protein.grams[0] }} g por dia). Vale conferir com um profissional.</p>
          <footer class="nb-actions">
            <button class="quiet-button" :disabled="busy" @click="planOpen = true">Editar</button>
            <button class="quiet-button" :disabled="busy" @click="dropPlan">Apagar</button>
          </footer>
        </div>
        <form v-else-if="planOpen" class="nb-form" novalidate @submit.prevent="savePlan">
          <div class="nb-columns">
            <label :class="{ 'nb-invalid': planErrors.kcal }">Calorias por dia
              <input v-model="planForm.kcal" inputmode="numeric" placeholder="Ex.: 2000" :aria-invalid="Boolean(planErrors.kcal)" />
              <small v-if="planErrors.kcal">{{ planErrors.kcal }}</small>
            </label>
            <label :class="{ 'nb-invalid': planErrors.protein_g }">Proteína por dia (g, opcional)
              <input v-model="planForm.protein_g" inputmode="numeric" placeholder="Ex.: 120" :aria-invalid="Boolean(planErrors.protein_g)" />
              <small v-if="planErrors.protein_g">{{ planErrors.protein_g }}</small>
            </label>
          </div>
          <label>Observação (opcional)<textarea v-model="planForm.note" rows="2" maxlength="300" placeholder="Ex.: plano da minha nutricionista" /></label>
          <footer class="nb-actions">
            <button type="button" class="quiet-button" :disabled="busy" @click="planOpen = false">Cancelar</button>
            <button class="primary-btn" :disabled="busy">{{ busy ? 'Salvando…' : 'Salvar dieta' }}</button>
          </footer>
        </form>
        <button v-else class="quiet-button" :disabled="busy" @click="planOpen = true">Registrar minha dieta</button>
      </section>

      <!-- Meus dados -->
      <footer v-if="view.profile && !editing && state !== 'profile' && state !== 'screening'" class="nb-manage">
        <button class="quiet-button" :disabled="busy" @click="editing = true">Editar avaliação</button>
        <button class="quiet-button" :disabled="busy" @click="redoScreening">Refazer a triagem</button>
        <template v-if="view.screening.done">
          <button v-if="view.screening.has_answers" class="quiet-button" :disabled="busy" @click="answersShown ? (answersShown = null) : showAnswers()">{{ answersShown ? 'Esconder minhas respostas' : 'Ver minhas respostas da triagem' }}</button>
          <button v-if="view.screening.has_answers" class="quiet-button" :disabled="busy" @click="dropAnswers">Apagar minhas respostas</button>
        </template>
        <button class="quiet-button" :disabled="busy" @click="wipe">{{ confirmWipe ? 'Confirmar: apagar tudo da alimentação' : 'Apagar meus dados de alimentação' }}</button>
      </footer>
      <ol v-if="answersShown" class="nb-answers" aria-label="Suas respostas da triagem">
        <li>Diagnóstico ou tratamento de transtorno alimentar: <strong>{{ answersShown.diagnosis === null ? 'Sem resposta' : answersShown.diagnosis ? 'Sim' : 'Não' }}</strong></li>
        <template v-if="answersShown.answers">
          <li v-for="(question, index) in QUESTIONS" :key="index">{{ question }} <strong>{{ answersShown.answers[index] ? 'Sim' : 'Não' }}</strong></li>
        </template>
        <li v-else>As cinco perguntas: não respondidas.</li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.nutrition-base{margin-bottom:26px;display:flex;flex-direction:column;gap:18px}
.nb-head h2{font-size:22px;letter-spacing:-.5px;font-weight:500;margin:10px 0 8px}
.nb-muted{font-size:12px;line-height:1.7;color:#9399ae}
.nb-muted a,.nb-panel a,.nb-fields a{color:var(--accent);text-decoration:underline}
h3{font-size:16px;font-weight:550;letter-spacing:-.2px}
.nb-form{display:flex;flex-direction:column;gap:14px;max-width:620px}
.nb-form label{display:flex;flex-direction:column;gap:8px;font-size:11px;color:#9da1b5}
.nb-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}
fieldset{border:1px solid #ffffff10;border-radius:12px;padding:12px 14px;margin:0;display:flex;flex-direction:column;gap:8px}
legend{font-size:12px;color:#c9cbe0;padding:0 6px;line-height:1.6}
.nb-form .nb-choice,.nb-choice{flex-direction:row;align-items:flex-start;gap:10px;font-size:12px;color:#d6d8e6;line-height:1.5}
.nb-choice input{margin-top:2px;accent-color:var(--accent)}
.nb-choice strong{font-weight:600;margin-right:4px}
.nb-question legend{color:#e2e3ef}
.nb-question{flex-direction:row;flex-wrap:wrap;gap:18px}
.nb-question legend{width:100%}
.nb-intro{display:flex;flex-direction:column;gap:12px;max-width:640px;border:1px solid #a1ddc522;background:linear-gradient(120deg,#a1ddc50d,#bcafff0a);border-radius:14px;padding:22px}
.nb-intro h3{font-size:18px}
.nb-intro>p{font-size:13px;line-height:1.75;color:#c9cbe0}
.nb-intro-points{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.nb-intro-points li{font-size:12px;line-height:1.7;color:#aeb2c6;padding-left:16px;position:relative}
.nb-intro-points li::before{content:'';position:absolute;left:0;top:.62em;width:6px;height:6px;border-radius:50%;background:var(--mint)}
.nb-intro-points strong{color:#e2e3ef;font-weight:600}
.nb-invalid input,.nb-invalid textarea{border-color:#ff8a8a}
fieldset.nb-invalid,li.nb-invalid{border-color:#ff8a8a66}
.nb-invalid small,.nb-invalid>span{color:#ffb0b0}
small{font-size:11px;line-height:1.5}
.nb-actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-end}
.nb-alert{font-size:12px;color:#ffb0b0;background:#ff8a8a14;border:1px solid #ff8a8a33;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.nb-panel{display:flex;flex-direction:column;gap:10px;max-width:640px}
.nb-panel p{font-size:13px;line-height:1.75;color:#c9cbe0}
.nb-fields{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.nb-fields li{display:flex;gap:14px;align-items:baseline;border:1px solid #ffffff10;border-radius:10px;padding:10px 12px;font-size:12px}
.nb-fields strong{min-width:52px}
.nb-result{display:flex;flex-direction:column;gap:14px}
.nb-figure{display:flex;flex-direction:column;gap:6px}
.nb-figure strong{font-size:34px;font-weight:500;letter-spacing:-1px;color:var(--mint)}
.nb-figure>span:last-child{font-size:11px;color:#9399ae}
.nb-suggestion{font-size:13px;line-height:1.75;color:#d6d8e6;max-width:640px}
.nb-note{font-size:12px;line-height:1.7;color:#f1d3b8;background:#e8b5a012;border:1px solid #e8b5a033;border-radius:10px;padding:10px 12px;max-width:640px}
.nb-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}
.nb-details div{border:1px solid #ffffff0d;border-radius:10px;padding:12px}
.nb-details dt{font-size:10px;color:#9399ae;letter-spacing:.3px}
.nb-details dd{margin:6px 0 0;font-size:13px;line-height:1.6}
.nb-target{display:flex;flex-direction:column;gap:10px;align-items:flex-start;font-size:13px;line-height:1.7}
.nb-sources summary{cursor:pointer;font-size:11px;color:#a5a0ba}
.nb-sources ul{margin:10px 0 0;padding-left:18px;font-size:11px;line-height:1.8;color:#9399ae}
.nb-plan{border-top:1px solid #ffffff0d;padding-top:18px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.nb-plan-card{display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:1.7}
.nb-manage{display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid #ffffff0d;padding-top:16px}
.nb-small{display:block;margin-top:6px;font-size:11px;color:#9399ae}
.nb-answers{margin:0;padding-left:20px;font-size:12px;line-height:1.9;color:#c9cbe0}
@media (max-width:640px){.nb-columns,.nb-details{grid-template-columns:1fr}.nb-figure strong{font-size:28px}}
</style>
