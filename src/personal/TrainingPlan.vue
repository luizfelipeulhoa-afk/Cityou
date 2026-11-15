<script setup>
// Treino de musculação na aba Fitness: a pessoa diz quantos dias treina, onde e há quanto tempo, e recebe um plano
// sugerido pela meta da base calórica. Em cada sessão anota a carga e as repetições que fez de verdade (mesmo menos do
// que o sugerido); o servidor calcula o volume total, a melhor série, o 1RM estimado e a próxima carga sugerida.
import { computed, onMounted, reactive, ref } from 'vue'
import { addWorkout, editWorkout, loadTraining, removeWorkout, saveTrainingSetup } from '../fifones/api.js'
import { CARDIO_TYPES, DISCLAIMER, EXERCISES, EXERCISE_BY_ID, EXTRAS, READINESS_QUESTIONS, SOURCES, available } from '../../shared/game/training.js'

const GOAL_NAMES = { maintain: 'manter o peso', fat_loss: 'perder gordura', lean_preserve: 'perder gordura mantendo músculo', muscle_gain: 'ganhar massa' }
const EXPERIENCE = { beginner: 'Começando agora (menos de 6 meses)', intermediate: 'Treino há 6 meses a 2 anos', advanced: 'Treino há mais de 2 anos' }
const EQUIPMENT = { gym: 'Academia', dumbbells: 'Em casa, com halteres', bodyweight: 'Em casa, só com o corpo' }
const NOT_AVAILABLE = {
  minor: 'Para menores de 18 anos o app não sugere treino: procure um professor de educação física.',
  age: 'Acima de 80 anos o app não sugere treino: procure um professor de educação física ou o seu médico.',
  pregnancy: 'Na gestação o app não sugere treino: combine os exercícios com quem acompanha o seu pré-natal.',
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const num = value => Number(String(value).trim().replace(',', '.'))
const kg = grams => (grams / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const n1 = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const dateBr = day => day.split('-').reverse().join('/')
const rest = seconds => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`)

const view = ref(null)
const busy = ref(false)
const message = ref('')
const editingSetup = ref(false)
const setupForm = reactive({ days_per_week: 3, experience: 'beginner', equipment: 'gym', extras: [], readiness: { exertion_symptoms: null, medical_restriction: null, recent_injury: null } })
const GOAL_NOTES = {
  fat_loss: 'Na perda de gordura, manter a musculação ajuda a preservar a massa magra enquanto a alimentação faz o déficit.',
  lean_preserve: 'Na perda de gordura, manter a musculação ajuda a preservar a massa magra enquanto a alimentação faz o déficit.',
  muscle_gain: 'Para ganhar massa, o que mais conta é a constância e ir aumentando repetições ou carga aos poucos.',
  maintain: 'Para manter, o treino segura a força e a massa magra; vá aumentando repetições ou carga quando ficar fácil.',
}
const log = ref(null) // { id, day, plan_day, note, exercises: [{ exercise_id, reps, sets: [{ kg, reps }] }] }
const addPick = ref('')
const confirmId = ref('')

const gate = computed(() => view.value?.gate)
const plan = computed(() => view.value?.plan)
const stats = computed(() => view.value?.stats)
const sessions = computed(() => view.value?.sessions ?? [])
const weekMax = computed(() => Math.max(1, ...(stats.value?.weeks ?? []).map(week => week.volume_kg)))
// Lista para acrescentar, agrupada por músculo; trocar oferece o mesmo movimento, primeiro os do lugar onde a pessoa treina.
const byGroup = computed(() => {
  const groups = {}
  for (const item of EXERCISES) (groups[item.group] ??= []).push(item)
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
})
const swapOptions = id => {
  const current = EXERCISE_BY_ID[id]
  const where = view.value?.setup?.equipment ?? 'gym'
  const extras = view.value?.setup?.extras ?? []
  return EXERCISES.filter(item => item.pattern === current.pattern && item.id !== id)
    .sort((a, b) => Number(available(b, where, extras)) - Number(available(a, where, extras)))
}
function swap(exercise, id) {
  if (!id) return
  exercise.exercise_id = id
  exercise.sets = exercise.sets.map(() => blankSet(id))
}
const nextOf = id => stats.value?.exercises.find(item => item.exercise_id === id)
const thisWeekCardio = computed(() => stats.value?.weeks.at(-1)?.cardio_min ?? 0)
const planDayLabel = index => plan.value?.days.find(day => day.index === index)?.label ?? 'Treino livre'
const sessionLabel = session => (session.exercises.length || session.plan_day ? planDayLabel(session.plan_day) : 'Aeróbio')
const preview = computed(() => !log.value ? 0 : log.value.exercises.reduce((sum, exercise) =>
  sum + exercise.sets.reduce((s, set) => s + (num(set.kg) || 0) * (Number(set.reps) || 0), 0), 0))

function apply(next) {
  view.value = next
  if (next.setup) Object.assign(setupForm, { ...next.setup, extras: [...(next.setup.extras ?? [])], readiness: { ...next.setup.readiness } })
}
const readinessDone = computed(() => Object.values(setupForm.readiness).every(value => typeof value === 'boolean'))

async function run(action) {
  busy.value = true
  message.value = ''
  try { apply(await action()); return true } catch (error) {
    message.value = error?.message || 'Não deu para salvar agora. Tente de novo.'
    return false
  } finally { busy.value = false }
}

async function saveSetup() {
  if (!readinessDone.value) { message.value = 'Responda às três perguntas sobre esforço e saúde.'; return }
  const { days_per_week, experience, equipment, readiness } = setupForm
  const extras = equipment === 'gym' ? [] : [...setupForm.extras]
  if (await run(() => saveTrainingSetup({ days_per_week, experience, equipment, extras, readiness: { ...readiness } }))) editingSetup.value = false
}

function nextText(item) {
  const next = item.next
  if (!next) return ''
  if (next.action === 'pain') return 'Pausado: você anotou dor. Troque por uma variação ou procure um profissional'
  if (next.action === 'increase') return `Subir para ${kg(next.weight_grams)} kg`
  if (next.action === 'reduce') return `Reduzir para ${kg(next.weight_grams)} kg, ou fazer menos séries, ou uma variação mais fácil`
  if (next.action === 'hold') return `Manter ${kg(next.weight_grams)} kg`
  if (next.reason === 'small_load') return `${kg(next.weight_grams)} kg: mais repetições antes de subir (o próximo peso seria um salto grande)`
  return next.weight_grams ? `${kg(next.weight_grams)} kg, buscar mais repetições` : 'Buscar mais repetições'
}

const blankSet = id => ({ kg: nextOf(id)?.next?.weight_grams ? kg(nextOf(id).next.weight_grams) : '', reps: '' })

function startLog(day = null, withCardio = false) {
  log.value = {
    id: null, day: today(), plan_day: day?.index ?? null, note: '', cardio: withCardio ? [{ type: 'walk', minutes: '' }] : [],
    exercises: (day?.exercises ?? []).map(item => ({ exercise_id: item.exercise_id, reps: item.reps, warmup: item.warmup_sets, pain: false, sets: Array.from({ length: item.sets }, () => blankSet(item.exercise_id)) })),
  }
}

function editLog(session) {
  log.value = {
    id: session.id, day: session.day, plan_day: session.plan_day, note: session.note,
    cardio: (session.cardio ?? []).map(item => ({ type: item.type, minutes: String(item.minutes) })),
    exercises: session.exercises.map(item => ({ exercise_id: item.exercise_id, reps: null, pain: Boolean(item.pain), sets: item.sets.map(set => ({ kg: kg(set.weight_grams), reps: String(set.reps) })) })),
  }
}

function addExercise() {
  if (!addPick.value) return
  log.value.exercises.push({ exercise_id: addPick.value, reps: null, pain: false, sets: [blankSet(addPick.value)] })
  addPick.value = ''
}

async function saveLog() {
  const exercises = log.value.exercises.map(item => ({
    exercise_id: item.exercise_id, pain: item.pain,
    sets: item.sets.filter(set => String(set.reps).trim() !== '')
      .map(set => ({ weight_grams: Math.round((num(set.kg) || 0) * 1000), reps: Number(set.reps) })),
  })).filter(item => item.sets.length)
  const cardio = log.value.cardio.filter(item => String(item.minutes).trim() !== '').map(item => ({ type: item.type, minutes: Number(item.minutes) }))
  if (!exercises.length && !cardio.length) { message.value = 'Anote ao menos uma série com as repetições ou os minutos de aeróbio.'; return }
  const body = { day: log.value.day, plan_day: log.value.plan_day, exercises, cardio, note: log.value.note }
  const id = log.value.id
  if (await run(() => (id ? editWorkout(id, body) : addWorkout(body)))) log.value = null
}

async function drop(session) {
  if (confirmId.value !== session.id) { confirmId.value = session.id; return }
  confirmId.value = ''
  await run(() => removeWorkout(session.id))
}

onMounted(() => run(loadTraining))
</script>

<template>
  <section class="surface tp" aria-labelledby="tp-title">
    <div class="surface-heading">
      <h2 id="tp-title">Seu treino</h2>
      <span v-if="view && !log" class="tp-head-actions"><button class="quiet-button" @click="startLog(null, true)">Registrar aeróbio</button><button class="quiet-button" @click="startLog()">Registrar treino livre</button></span>
    </div>
    <p v-if="message" class="tp-alert" role="alert">{{ message }}</p>
    <p v-if="!view" class="tp-muted">Carregando…</p>

    <template v-else-if="!log">
      <p v-if="gate.state === 'profile'" class="tp-muted">Para o app sugerir um treino, preencha a sua base na aba <a href="#/nutricao">Alimentação</a>: o plano segue a meta que você escolher lá. Você já pode registrar treinos livres.</p>
      <p v-else-if="gate.state === 'not_available'" class="tp-muted">{{ NOT_AVAILABLE[gate.reason] }} Você ainda pode registrar os seus treinos aqui.</p>
      <template v-else>
        <p v-if="gate.care" class="tp-note">O treino é para fazer bem, não para compensar o que você comeu. Se ele estiver virando obrigação ou castigo, vale conversar com um profissional de saúde.</p>
        <form v-if="!view.setup || editingSetup" class="tp-form" @submit.prevent="saveSetup">
          <p class="tp-muted">Sua meta na Alimentação é <strong>{{ GOAL_NAMES[gate.goal] }}</strong>. Conte como você treina:</p>
          <div class="tp-columns">
            <label>Dias de treino por semana<select v-model.number="setupForm.days_per_week"><option v-for="d in 6" :key="d" :value="d">{{ d }} {{ d === 1 ? 'dia' : 'dias' }}</option></select></label>
            <label>Experiência<select v-model="setupForm.experience"><option v-for="(name, id) in EXPERIENCE" :key="id" :value="id">{{ name }}</option></select></label>
            <label>Onde você treina<select v-model="setupForm.equipment"><option v-for="(name, id) in EQUIPMENT" :key="id" :value="id">{{ name }}</option></select></label>
          </div>
          <fieldset v-if="setupForm.equipment !== 'gym'" class="tp-ready"><legend>O que você tem em casa? (o treino só usa o que estiver marcado)</legend>
            <label v-for="(name, id) in EXTRAS" :key="id" class="tp-check"><input v-model="setupForm.extras" type="checkbox" :value="id" />{{ name }}</label>
          </fieldset>
          <fieldset class="tp-ready"><legend>Antes de montar, três perguntas rápidas</legend>
            <div v-for="(question, key) in READINESS_QUESTIONS" :key="key" class="tp-question" role="radiogroup" :aria-label="question">
              <span>{{ question }}</span>
              <label><input v-model="setupForm.readiness[key]" type="radio" :value="true" :name="key" />Sim</label>
              <label><input v-model="setupForm.readiness[key]" type="radio" :value="false" :name="key" />Não</label>
            </div>
          </fieldset>
          <footer class="tp-actions">
            <button v-if="view.setup" type="button" class="quiet-button" :disabled="busy" @click="editingSetup = false">Cancelar</button>
            <button class="primary-btn" :disabled="busy">{{ busy ? 'Salvando…' : 'Montar meu treino' }}</button>
          </footer>
        </form>
        <template v-else-if="plan">
          <p class="tp-muted">{{ view.setup.days_per_week }} {{ view.setup.days_per_week === 1 ? 'dia' : 'dias' }} por semana · {{ EQUIPMENT[view.setup.equipment] }} · meta: {{ GOAL_NAMES[plan.goal] }}. Pare cada série com {{ plan.rir[0] }} a {{ plan.rir[1] }} repetições ainda sobrando. <button class="tp-link" @click="editingSetup = true">Mudar</button></p>
          <p v-if="gate.caution" class="tp-caution" role="note"><strong>Procure um médico antes de começar.</strong> Pelas suas respostas sobre esforço e saúde, vale uma avaliação antes de seguir este treino. <button class="tp-link" @click="editingSetup = true">Rever respostas</button></p>
          <p class="tp-note">{{ DISCLAIMER }}</p>
          <p class="tp-note">{{ GOAL_NOTES[plan.goal] }}<template v-if="view.setup.days_per_week === 1"> A recomendação da OMS é fortalecer os músculos em 2 ou mais dias por semana: se der, acrescente um dia.</template></p>
          <p class="tp-muted">Séries por semana: <span v-for="(sets, group, i) in view.weekly_sets" :key="group">{{ i ? ' · ' : '' }}{{ group }} {{ sets }}</span></p>
          <div class="tp-days">
            <article v-for="day in plan.days" :key="day.index" class="tp-day">
              <header><h3>Dia {{ day.index }} · {{ day.label }}</h3><button class="quiet-button" @click="startLog(day)">Registrar</button></header>
              <ul><li v-for="item in day.exercises" :key="item.exercise_id" :title="EXERCISE_BY_ID[item.exercise_id].tip"><span>{{ item.name }}</span><small><template v-if="item.warmup_sets">antes, {{ item.warmup_sets }} séries leves de aquecimento · </template>{{ item.sets }} × {{ item.reps[0] }}–{{ item.reps[1] }} · descanso {{ rest(item.rest_s) }}<template v-if="nextOf(item.exercise_id)"> · {{ nextText(nextOf(item.exercise_id)) }}</template></small></li></ul>
            </article>
          </div>
          <article class="tp-cardio">
            <header><h3>Aeróbio na semana</h3><button class="quiet-button" @click="startLog(null, true)">Registrar</button></header>
            <p><strong>{{ thisWeekCardio }} de {{ plan.cardio.minutes_week[0] }}<template v-if="plan.cardio.minutes_week[1] > plan.cardio.minutes_week[0]"> a {{ plan.cardio.minutes_week[1] }}</template> minutos</strong> nesta semana, em intensidade {{ plan.cardio.intensity }}. {{ plan.cardio.examples.join(', ') }}.</p>
            <p class="tp-muted">{{ plan.cardio.note }}<template v-if="plan.cardio.start"> {{ plan.cardio.start }}</template> Aquecimento: antes dos exercícios principais, faça séries leves do próprio exercício; o aquecimento geral (bicicleta, esteira) é opcional.</p>
          </article>
        </template>
      </template>

      <details class="tp-sources"><summary>De onde vêm esses números</summary><ul><li v-for="(source, key) in SOURCES" :key="key"><strong>{{ source.note }}</strong><small>{{ source.ref }}</small></li></ul></details>
      <template v-if="sessions.length">
        <h3 class="tp-sub">Volume por semana (kg levantados)</h3>
        <div class="tp-weeks" role="img" :aria-label="`Volume das últimas 8 semanas: ${stats.weeks.map(w => n1(w.volume_kg)).join(', ')} kg`">
          <div v-for="week in stats.weeks" :key="week.week" class="tp-week"><i :style="{ height: `${week.volume_kg / weekMax * 100}%` }" /><small>{{ dateBr(week.week).slice(0, 5) }}</small></div>
        </div>
        <h3 class="tp-sub">Progressão por exercício</h3>
        <div class="tp-table-wrap"><table class="tp-table">
          <thead><tr><th>Exercício</th><th>Última melhor série</th><th>1RM estimado</th><th>Recorde</th><th>Próxima vez</th></tr></thead>
          <tbody><tr v-for="item in stats.exercises" :key="item.exercise_id"><td>{{ item.name }}</td><td>{{ kg(item.last.top_weight_grams) }} kg × {{ item.last.top_reps }}</td><td>{{ item.last.e1rm_kg ? `${n1(item.last.e1rm_kg)} kg` : '—' }}</td><td>{{ item.best_e1rm_kg ? `${n1(item.best_e1rm_kg)} kg` : '—' }}</td><td>{{ nextText(item) }}</td></tr></tbody>
        </table></div>
        <h3 class="tp-sub">Sessões</h3>
        <ul class="tp-list">
          <li v-for="session in sessions" :key="session.id">
            <time>{{ dateBr(session.day) }}</time><span>{{ sessionLabel(session) }}</span>
            <strong v-if="session.exercises.length">{{ n1(session.volume_kg) }} kg</strong><small><template v-if="session.exercises.length">{{ session.sets }} séries · {{ session.reps }} repetições</template><template v-if="session.exercises.length && session.cardio_min"> · </template><template v-if="session.cardio_min">{{ session.cardio_min }} min de aeróbio</template></small>
            <button class="quiet-button" :disabled="busy" @click="editLog(session)">Editar</button>
            <button class="quiet-button" :disabled="busy" :aria-label="`Apagar o treino de ${dateBr(session.day)}`" @click="drop(session)">{{ confirmId === session.id ? 'Apagar mesmo?' : 'Apagar' }}</button>
          </li>
        </ul>
      </template>
      <p v-else class="tp-muted">Nenhum treino registrado ainda. Anote a carga e as repetições de cada série: o app soma o volume e acompanha a sua evolução.</p>
    </template>

    <form v-else class="tp-form" novalidate @submit.prevent="saveLog">
      <div class="tp-columns">
        <label>Dia<input v-model="log.day" type="date" :max="today()" /></label>
        <label>Treino<input :value="planDayLabel(log.plan_day)" disabled /></label>
      </div>
      <p class="tp-muted">Anote o que você fez de verdade, mesmo que tenha sido menos do que o sugerido. Série sem repetições não entra. Exercício com o corpo: anote só a carga extra (0 se não usou).</p>
      <fieldset v-for="(exercise, e) in log.exercises" :key="e" class="tp-exercise">
        <legend>{{ EXERCISE_BY_ID[exercise.exercise_id].name }}<small v-if="exercise.reps"> · sugerido {{ exercise.reps[0] }}–{{ exercise.reps[1] }} repetições</small></legend>
        <p v-if="exercise.warmup" class="tp-tip">Aquecimento: {{ exercise.warmup }} séries leves antes (cerca de metade da carga, 8 a 10 repetições). Não precisa anotar.</p>
        <p class="tp-tip">{{ EXERCISE_BY_ID[exercise.exercise_id].tip }}</p>
        <div v-for="(set, s) in exercise.sets" :key="s" class="tp-set">
          <span>Série {{ s + 1 }}</span>
          <label>kg<input v-model="set.kg" inputmode="decimal" placeholder="0" :aria-label="`Carga da série ${s + 1}, em kg`" /></label>
          <label>repetições<input v-model="set.reps" inputmode="numeric" :placeholder="exercise.reps ? `${exercise.reps[0]}–${exercise.reps[1]}` : ''" :aria-label="`Repetições da série ${s + 1}`" /></label>
          <button type="button" class="tp-link" :aria-label="`Tirar a série ${s + 1}`" @click="exercise.sets.splice(s, 1)">Tirar</button>
        </div>
        <div class="tp-row-actions">
          <button type="button" class="tp-link" :disabled="exercise.sets.length >= 12" @click="exercise.sets.push({ ...exercise.sets.at(-1) ?? blankSet(exercise.exercise_id), reps: '' })">+ Série</button>
          <label class="tp-check"><input v-model="exercise.pain" type="checkbox" />Senti dor neste exercício</label>
          <button type="button" class="tp-link" @click="log.exercises.splice(e, 1)">Tirar exercício</button>
          <select v-if="swapOptions(exercise.exercise_id).length" class="tp-swap" :aria-label="`Trocar ${EXERCISE_BY_ID[exercise.exercise_id].name} por outro do mesmo movimento`" value="" @change="swap(exercise, $event.target.value); $event.target.value = ''"><option value="">Trocar por…</option><option v-for="item in swapOptions(exercise.exercise_id)" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        </div>
      </fieldset>
      <div class="tp-add">
        <select v-model="addPick" aria-label="Acrescentar exercício"><option value="">Acrescentar exercício…</option><optgroup v-for="[group, items] in byGroup" :key="group" :label="group"><option v-for="item in items" :key="item.id" :value="item.id">{{ item.name }}</option></optgroup></select>
        <button type="button" class="quiet-button" :disabled="!addPick || log.exercises.length >= 20" @click="addExercise">Acrescentar</button>
      </div>
      <fieldset class="tp-exercise"><legend>Aeróbio (caminhada, corrida, bicicleta)</legend>
        <div v-for="(item, c) in log.cardio" :key="c" class="tp-set">
          <span>Atividade</span>
          <label>tipo<select v-model="item.type" :aria-label="`Tipo do aeróbio ${c + 1}`"><option v-for="(name, id) in CARDIO_TYPES" :key="id" :value="id">{{ name }}</option></select></label>
          <label>minutos<input v-model="item.minutes" inputmode="numeric" placeholder="30" :aria-label="`Minutos do aeróbio ${c + 1}`" /></label>
          <button type="button" class="tp-link" @click="log.cardio.splice(c, 1)">Tirar</button>
        </div>
        <button type="button" class="tp-link" :disabled="log.cardio.length >= 3" @click="log.cardio.push({ type: 'walk', minutes: '' })">+ Aeróbio</button>
      </fieldset>
      <label class="tp-note-field">Nota, se quiser<input v-model="log.note" maxlength="300" placeholder="Ex.: dormi mal, cansado" /></label>
      <p class="tp-total">Volume desta sessão: <strong>{{ n1(preview) }} kg</strong> <small>(o número salvo é o calculado pelo servidor)</small></p>
      <footer class="tp-actions">
        <button type="button" class="quiet-button" :disabled="busy" @click="log = null">Cancelar</button>
        <button class="primary-btn" :disabled="busy">{{ busy ? 'Salvando…' : log.id ? 'Salvar alteração' : 'Salvar treino' }}</button>
      </footer>
    </form>
  </section>
</template>

<style scoped>
.tp{display:flex;flex-direction:column;gap:14px;margin-top:18px}
.tp-muted{font-size:12px;line-height:1.7;color:#9399ae;max-width:720px}
.tp-muted a{color:var(--mint)}
.tp-note{font-size:12px;line-height:1.6;color:#EFEBE2;background:#ffffff08;border:1px solid #ffffff14;border-radius:10px;padding:10px 12px;max-width:720px}
.tp-alert{font-size:12px;color:#ffb0b0;background:#ff8a8a14;border:1px solid #ff8a8a33;border-radius:10px;padding:10px 12px}
.tp-link{background:none;border:0;padding:0;color:var(--mint);font:inherit;font-size:12px;cursor:pointer}
.tp-link:disabled{opacity:.4;cursor:default}
.tp-form{display:flex;flex-direction:column;gap:12px}
.tp-form label{display:flex;flex-direction:column;gap:8px;font-size:11px;color:#9da1b5}
.tp-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.tp-actions{display:flex;justify-content:flex-end;gap:12px}
.tp-days{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.tp-day{border:1px solid #ffffff12;border-radius:12px;padding:12px 14px}
.tp-day header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.tp-day h3{font-size:13px;font-weight:500;margin:0}
.tp-day ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.tp-day li{display:flex;flex-direction:column;gap:2px;font-size:12px}
.tp-day small{color:#9399ae;font-size:11px}
.tp-sub{font-size:13px;font-weight:500;margin:8px 0 0}
.tp-weeks{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;height:120px;align-items:end}
.tp-week{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;height:100%}
.tp-week i{display:block;width:100%;min-height:2px;border-radius:6px 6px 2px 2px;background:var(--peach)}
.tp-week small{font-size:10px;color:#9399ae}
.tp-table-wrap{overflow-x:auto}
.tp-table{width:100%;border-collapse:collapse;font-size:12px}
.tp-table th{text-align:left;font-weight:500;color:#9399ae;font-size:11px;padding:6px 8px}
.tp-table td{padding:8px;border-top:1px solid #ffffff0a;white-space:nowrap}
.tp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.tp-list li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:10px 0;border-top:1px solid #ffffff0a;font-size:12px}
.tp-list time{color:#9399ae;min-width:80px}
.tp-list strong{color:var(--peach);font-weight:500}
.tp-list small{color:#9399ae;flex:1}
.tp-exercise{border:1px solid #ffffff12;border-radius:12px;padding:10px 14px;margin:0;display:flex;flex-direction:column;gap:8px}
.tp-exercise legend{font-size:13px;padding:0 6px}
.tp-exercise legend small{color:#9399ae;font-size:11px}
.tp-set{display:grid;grid-template-columns:64px 1fr 1fr auto;gap:10px;align-items:end;font-size:12px}
.tp-set > span{color:#9399ae;padding-bottom:10px}
.tp-row-actions,.tp-add{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.tp-add select{flex:1;min-width:0}
.tp-total{font-size:13px}
.tp-total strong{color:var(--peach);font-weight:500}
.tp-total small{color:#9399ae;font-size:11px}
.tp-caution{font-size:12px;line-height:1.6;color:#FFD9C9;background:#FF9C7A12;border:1px solid #FF9C7A33;border-radius:10px;padding:10px 12px;max-width:720px}
.tp-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.tp-cardio{border:1px solid #ffffff12;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:1.6}
.tp-cardio header{display:flex;justify-content:space-between;align-items:center}
.tp-cardio h3{font-size:13px;font-weight:500;margin:0}
.tp-cardio p{margin:0}
.tp-cardio strong{color:var(--peach);font-weight:500}
.tp-check{flex-direction:row !important;align-items:center;gap:8px !important;font-size:12px !important;color:#EFEBE2 !important}
.tp-tip{margin:0;font-size:11px;line-height:1.6;color:#9399ae}
.tp-swap{max-width:260px;font-size:12px}
.tp-ready{border:1px solid #ffffff12;border-radius:12px;padding:10px 14px;margin:0;display:flex;flex-direction:column;gap:10px}
.tp-ready legend{font-size:12px;padding:0 6px}
.tp-question{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;font-size:12px}
.tp-question > span{flex:1 1 320px;color:#EFEBE2;line-height:1.5}
.tp-question label{flex-direction:row;align-items:center;gap:6px;font-size:12px;color:#EFEBE2}
.tp-sources{font-size:12px;color:#9399ae}
.tp-sources summary{cursor:pointer;color:var(--mint)}
.tp-sources ul{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.tp-sources li{display:flex;flex-direction:column;gap:2px}
.tp-sources strong{font-weight:400;color:#EFEBE2}
.tp-sources small{font-size:11px}
@media (max-width:640px){.tp-columns{grid-template-columns:1fr}.tp-set{grid-template-columns:1fr 1fr auto}.tp-set > span{grid-column:1 / -1;padding:0}}
</style>
