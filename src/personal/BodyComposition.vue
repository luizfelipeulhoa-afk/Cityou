<script setup>
// Composição corporal na aba Fitness: registro manual (percentual de gordura, massa magra opcional, método e dia).
// Nada é 100%: a tela destaca a média das últimas medidas, e a base calórica usa a massa magra só para a proteína.
import { onMounted, reactive, ref } from 'vue'
import { addBodyComposition, loadBodyComposition, removeBodyComposition } from '../fifones/api.js'

const METHODS = { bia: 'Balança de bioimpedância', skinfold: 'Dobras cutâneas', dexa: 'DEXA', other: 'Outro' }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const items = ref([])
const trend = ref(null)
const open = ref(false)
const busy = ref(false)
const message = ref('')
const errors = ref({})
const confirmId = ref('')
const form = reactive({ day: today(), fat_pct: '', lean_kg: '', method: 'bia', note: '' })
const num = value => (String(value).trim() === '' ? null : Number(String(value).trim().replace(',', '.')))
const pct = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const kg = grams => (grams / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const dateBr = day => day.split('-').reverse().join('/')

function apply(view) {
  items.value = view.body_composition
  trend.value = view.body_trend
}

async function load() {
  try { apply(await loadBodyComposition()) } catch (error) { message.value = error.message }
}

async function save() {
  const fat = num(form.fat_pct)
  const lean = num(form.lean_kg)
  const next = {}
  if (fat === null || !Number.isFinite(fat) || fat < 2 || fat > 70) next.fat_pct = 'Informe o percentual de gordura entre 2 e 70.'
  if (lean !== null && (!Number.isFinite(lean) || lean < 15 || lean > 200)) next.lean_grams = 'Informe a massa magra entre 15 e 200 kg, ou deixe vazia.'
  if (!form.day || form.day > today()) next.day = 'Escolha hoje ou um dia que já passou.'
  errors.value = next
  if (Object.keys(next).length || busy.value) return
  busy.value = true
  message.value = ''
  try {
    apply(await addBodyComposition({ day: form.day, fat_pct: fat, lean_grams: lean === null ? null : Math.round(lean * 1000), method: form.method, note: form.note.trim() }))
    Object.assign(form, { day: today(), fat_pct: '', lean_kg: '', note: '' })
    open.value = false
  } catch (error) {
    if (error.details?.fields) errors.value = error.details.fields
    else message.value = error.message
  } finally { busy.value = false }
}

async function drop(item) {
  if (busy.value) return
  if (confirmId.value !== item.id) { confirmId.value = item.id; return }
  busy.value = true
  try { apply(await removeBodyComposition(item.id)); confirmId.value = '' } catch (error) { message.value = error.message } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <section class="surface bc" aria-labelledby="bc-title">
    <div class="surface-heading">
      <h2 id="bc-title">Composição corporal</h2>
      <button v-if="!open" class="quiet-button" @click="open = true">Registrar medida</button>
    </div>
    <p class="bc-muted">Balanças e dobras cutâneas acertam bem a tendência, mas um valor isolado pode variar alguns pontos. Meça sempre do mesmo jeito: mesmo aparelho, mesmo horário, em jejum e depois de ir ao banheiro.</p>
    <p v-if="message" class="bc-alert" role="alert">{{ message }}</p>

    <div v-if="trend" class="bc-trend">
      <div><span>Gordura (média de {{ trend.count }} {{ trend.count === 1 ? 'medida' : 'medidas' }})</span><strong>{{ pct(trend.fat_pct) }}%</strong></div>
      <div v-if="trend.lean_grams"><span>Massa magra (média)</span><strong>{{ kg(trend.lean_grams) }} kg</strong></div>
      <small>De {{ dateBr(trend.from) }} a {{ dateBr(trend.to) }}. A aba Alimentação usa a massa magra para sugerir a proteína.</small>
    </div>

    <form v-if="open" class="bc-form" novalidate @submit.prevent="save">
      <div class="bc-columns">
        <label :class="{ 'bc-invalid': errors.day }">Dia<input v-model="form.day" type="date" :max="today()" /><small v-if="errors.day">{{ errors.day }}</small></label>
        <label :class="{ 'bc-invalid': errors.fat_pct }">Gordura (%)<input v-model="form.fat_pct" inputmode="decimal" placeholder="Ex.: 22,5" :aria-invalid="Boolean(errors.fat_pct)" /><small v-if="errors.fat_pct">{{ errors.fat_pct }}</small></label>
        <label :class="{ 'bc-invalid': errors.lean_grams }">Massa magra (kg, opcional)<input v-model="form.lean_kg" inputmode="decimal" placeholder="Ex.: 58,4" :aria-invalid="Boolean(errors.lean_grams)" /><small v-if="errors.lean_grams">{{ errors.lean_grams }}</small></label>
        <label :class="{ 'bc-invalid': errors.method }">Método<select v-model="form.method"><option v-for="(name, id) in METHODS" :key="id" :value="id">{{ name }}</option></select></label>
      </div>
      <label>Nota (opcional)<input v-model="form.note" maxlength="200" placeholder="Ex.: medida na academia" /></label>
      <footer class="bc-actions">
        <button type="button" class="quiet-button" :disabled="busy" @click="open = false">Cancelar</button>
        <button class="primary-btn" :disabled="busy">{{ busy ? 'Salvando…' : 'Salvar medida' }}</button>
      </footer>
    </form>

    <ul v-if="items.length" class="bc-list">
      <li v-for="item in items" :key="item.id">
        <time>{{ dateBr(item.day) }}</time>
        <strong>{{ pct(item.fat_pct) }}%</strong>
        <span v-if="item.lean_grams">{{ kg(item.lean_grams) }} kg de massa magra</span>
        <small>{{ METHODS[item.method] }}<template v-if="item.note"> · {{ item.note }}</template></small>
        <button class="quiet-button" :disabled="busy" :aria-label="`Apagar a medida de ${dateBr(item.day)}`" @click="drop(item)">{{ confirmId === item.id ? 'Apagar mesmo?' : 'Apagar' }}</button>
      </li>
    </ul>
    <p v-else-if="!open" class="bc-muted">Sem medidas ainda. Se você tem uma balança de bioimpedância ou mediu as dobras cutâneas, registre aqui.</p>
  </section>
</template>

<style scoped>
.bc{display:flex;flex-direction:column;gap:14px;margin-top:18px}
.bc-muted{font-size:12px;line-height:1.7;color:#9399ae;max-width:680px}
.bc-alert{font-size:12px;color:#ffb0b0;background:#ff8a8a14;border:1px solid #ff8a8a33;border-radius:10px;padding:10px 12px}
.bc-trend{display:flex;flex-wrap:wrap;gap:12px 28px;align-items:flex-end}
.bc-trend div{display:flex;flex-direction:column;gap:4px}
.bc-trend span{font-size:10px;color:#9399ae}
.bc-trend strong{font-size:24px;font-weight:500;color:var(--peach)}
.bc-trend small{flex-basis:100%;font-size:11px;color:#9399ae}
.bc-form{display:flex;flex-direction:column;gap:12px;max-width:680px}
.bc-form label{display:flex;flex-direction:column;gap:8px;font-size:11px;color:#9da1b5}
.bc-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.bc-invalid input{border-color:#ff8a8a}
.bc-invalid small{color:#ffb0b0}
.bc-actions{display:flex;justify-content:flex-end;gap:12px}
.bc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.bc-list li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:10px 0;border-top:1px solid #ffffff0a;font-size:12px}
.bc-list time{color:#9399ae;min-width:80px}
.bc-list small{color:#9399ae;flex:1}
@media (max-width:640px){.bc-columns{grid-template-columns:1fr}}
</style>
