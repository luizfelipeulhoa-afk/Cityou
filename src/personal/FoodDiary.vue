<script setup>
// Diário alimentar da aba Alimentação (worker/diary.js). Primeiro a pessoa escolhe quantas refeições faz por dia (igual
// todos os dias ou uma quantidade para cada dia da semana); depois, em cada dia, só adiciona os alimentos. Busca o
// alimento pela lista da base (variantes como cru, cozido, frito), escolhe a unidade ou gramas e a quantidade, e pode
// editar ou apagar. Não há texto livre: o servidor só aceita um alimento da base e calcula calorias e macros.
import { computed, onMounted, ref, watch } from 'vue'
import {
  addDiaryEntry, editDiaryEntry, loadDiary, removeDiaryEntry, saveDiarySchedule, searchFoods,
} from '../fifones/api.js'

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const MEAL_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8]

const view = ref(null)
const busy = ref(false)
const message = ref('')
const errors = ref({})

// Programação de refeições.
const scheduleOpen = ref(false)
const scheduleDaily = ref(true)
const scheduleMeals = ref(3)
const scheduleWeek = ref(Array(7).fill(3))

// Registro: refeição (número da posição no dia), busca, alimento escolhido, quantidade e unidade.
const slot = ref(1)
const query = ref('')
const results = ref([])
const searching = ref(false)
const searchError = ref('')
const food = ref(null)
const quantity = ref('1')
const unit = ref('g')
const editingId = ref(null)

let searchTimer = null
let searchToken = 0
let editToken = 0
const optionsList = ref(null)

const kcal = value => Math.round(value).toLocaleString('pt-BR')
const grams = value => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g`
const dateBr = day => (day ? day.split('-').reverse().join('/') : '')
const shiftDay = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10)
const nowDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const isToday = computed(() => view.value?.day === nowDay())
const needsSchedule = computed(() => Boolean(view.value) && !view.value.schedule)
const showSchedule = computed(() => needsSchedule.value || scheduleOpen.value)
const portions = computed(() => food.value?.portions ?? [])
const unitLabel = entry => (entry.unit === 'g' ? `${entry.quantity.toLocaleString('pt-BR')} g` : `${entry.quantity.toLocaleString('pt-BR')} × ${entry.unit}`)
const canAdd = computed(() => Boolean(view.value?.meals.length) && !needsSchedule.value)
const targetText = computed(() => {
  const target = view.value?.target
  if (!target) return ''
  return target.low === target.high ? `${kcal(target.low)} kcal` : `${kcal(target.low)} a ${kcal(target.high)} kcal`
})
const scheduleText = computed(() => {
  const schedule = view.value?.schedule
  if (!schedule) return ''
  if (schedule.daily) return `${schedule.meals} ${schedule.meals === 1 ? 'refeição' : 'refeições'} por dia, todos os dias`
  return 'Quantidade de refeições diferente em cada dia da semana'
})

function apply(next) {
  view.value = next
  message.value = ''
  // Se a refeição escolhida deixou de existir neste dia, volta para a primeira.
  if (slot.value > next.meals.length) slot.value = 1
}

async function run(task, after) {
  if (busy.value) return false
  busy.value = true
  message.value = ''
  errors.value = {}
  try {
    apply(await task())
    after?.()
    return true
  } catch (error) {
    if (error.status === 422 && error.details?.fields) errors.value = error.details.fields
    message.value = error.message
    return false
  } finally {
    busy.value = false
  }
}

async function goTo(day) {
  await run(() => loadDiary(day))
}

function openSchedule() {
  scheduleDaily.value = view.value.schedule?.daily ?? true
  scheduleMeals.value = view.value.schedule?.meals ?? 3
  scheduleWeek.value = view.value.schedule?.by_weekday.slice() ?? Array(7).fill(3)
  errors.value = {}
  scheduleOpen.value = true
}

function saveSchedule() {
  const body = scheduleDaily.value
    ? { daily: true, meals: Number(scheduleMeals.value) }
    : { daily: false, by_weekday: scheduleWeek.value.map(Number) }
  run(() => saveDiarySchedule(body), () => { scheduleOpen.value = false })
}

// Unidade que já vem marcada (pedido do dono, 14/11/2026), nesta ordem:
//   1. a última unidade usada para o mesmo alimento (quem pesa o ovo uma vez continua pesando o ovo);
//   2. "unidade" quando o alimento se conta (ovo, fruta, pão francês): quem pesa tudo ainda come 4 ovos, não 200 g;
//   3. gramas, se o último registro foi em gramas; senão a primeira medida caseira.
// Fica no navegador (comodidade por aparelho); sem acesso ao armazenamento, vale a ordem sem os itens 1 e 3.
const UNIT_KEY = 'cityou.diario.unidade'
const FOOD_UNITS_KEY = 'cityou.diario.unidades'
const FOOD_UNITS_MAX = 300
function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sem armazenamento: só não lembra */ }
}
function defaultUnit(item) {
  const labels = item.portions.map(portion => portion.label)
  const last = readStore(FOOD_UNITS_KEY, {})[item.id]
  if (last === 'g' || labels.includes(last)) return last
  const countable = labels.find(label => label.startsWith('unidade'))
  if (countable) return countable
  if (readStore(UNIT_KEY, null) === 'g' || !labels.length) return 'g'
  return labels[0]
}
function rememberUnit(foodId, chosen) {
  writeStore(UNIT_KEY, chosen === 'g' ? 'g' : 'medida')
  const perFood = readStore(FOOD_UNITS_KEY, {})
  delete perFood[foodId] // reinsere no fim: a ordem das chaves guarda o uso mais recente
  perFood[foodId] = chosen
  const ids = Object.keys(perFood)
  for (const old of ids.slice(0, Math.max(0, ids.length - FOOD_UNITS_MAX))) delete perFood[old]
  writeStore(FOOD_UNITS_KEY, perFood)
}

function chooseFood(item) {
  searchToken++ // resposta de busca ainda em voo não repõe a lista depois da escolha
  food.value = item
  query.value = item.name
  results.value = []
  unit.value = defaultUnit(item)
  errors.value = {}
}

function clearFood() {
  searchToken++
  food.value = null
  query.value = ''
  results.value = []
  errors.value = {}
}

function cancelEdit() {
  editToken++
  editingId.value = null
  quantity.value = '1'
  clearFood()
}

// Busca com atraso: qualquer mudança no texto invalida a resposta que ainda está em voo.
watch(query, text => {
  if (food.value && text === food.value.name) return
  food.value = null
  clearTimeout(searchTimer)
  searchToken++
  const clean = text.trim()
  if (clean.length < 2) {
    results.value = []
    searchError.value = ''
    return
  }
  searchTimer = setTimeout(async () => {
    const token = ++searchToken
    searching.value = true
    try {
      const response = await searchFoods(clean)
      if (token === searchToken) {
        results.value = response.foods
        searchError.value = response.foods.length ? '' : 'Nenhum alimento com esse nome. Tente outra palavra.'
      }
    } catch (error) {
      if (token === searchToken) {
        results.value = []
        searchError.value = error.message
      }
    } finally {
      if (token === searchToken) searching.value = false
    }
  }, 250)
})

// Editar: a pessoa pode trocar a refeição, o alimento, a quantidade e a unidade. O alimento atual volta da busca pelo nome.
async function startEdit(entry) {
  const token = ++editToken // clicar em "Editar" de outro registro cancela este
  editingId.value = entry.id
  slot.value = entry.meal
  quantity.value = String(entry.quantity).replace('.', ',')
  errors.value = {}
  message.value = ''
  try {
    const { foods } = await searchFoods(entry.food_name)
    if (token !== editToken) return
    const found = foods.find(item => item.id === entry.food_id)
    if (!found) {
      message.value = 'Não achamos este alimento na busca. Apague o registro e adicione de novo.'
      cancelEdit()
      return
    }
    food.value = found
    query.value = found.name
    results.value = []
    unit.value = entry.unit
  } catch (error) {
    if (token !== editToken) return
    message.value = error.message
    cancelEdit()
  }
}

// Teclado na lista: seta para baixo entra na lista, setas andam entre as opções, Esc fecha e volta ao campo.
function focusOption(index) {
  const items = optionsList.value?.querySelectorAll('[role="option"]')
  if (!items?.length) return
  items[(index + items.length) % items.length].focus()
}
function optionKey(event, index) {
  if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(index + 1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); index === 0 ? document.getElementById('fd-food')?.focus() : focusOption(index - 1) }
  else if (event.key === 'Escape') { results.value = []; document.getElementById('fd-food')?.focus() }
}

function saveEntry() {
  const number = Number(String(quantity.value).replace(',', '.'))
  if (!food.value) {
    errors.value = { food_id: 'Escolha um alimento da lista.' }
    return
  }
  const [chosen, foodId] = [unit.value, food.value.id]
  if (editingId.value) {
    run(() => editDiaryEntry(editingId.value, { meal: slot.value, food_id: foodId, quantity: number, unit: chosen }), () => { rememberUnit(foodId, chosen); cancelEdit() })
    return
  }
  run(
    () => addDiaryEntry({ day: view.value.day, meal: slot.value, food_id: foodId, quantity: number, unit: chosen }),
    () => { rememberUnit(foodId, chosen); cancelEdit() },
  )
}

function remove(entry) {
  if (editingId.value === entry.id) cancelEdit()
  run(() => removeDiaryEntry(entry.id))
}

onMounted(() => goTo())
</script>

<template>
  <section class="food-diary surface" aria-labelledby="food-diary-title">
    <header class="fd-head">
      <span class="eyebrow">DIÁRIO DO DIA</span>
      <h2 id="food-diary-title">O que você comeu</h2>
      <p class="fd-muted">Os números vêm da Tabela Brasileira de Composição de Alimentos (TACO, Unicamp) e da base do USDA FoodData Central, iguais para todo mundo.</p>
    </header>

    <div v-if="view" class="fd-day">
      <button type="button" class="quiet-button" :disabled="busy" aria-label="Dia anterior" @click="goTo(shiftDay(view.day, -1))">‹</button>
      <label class="fd-date">
        <span>{{ isToday ? 'Hoje' : dateBr(view.day) }} · {{ view.weekday_name }}</span>
        <input type="date" :value="view.day" :max="nowDay()" aria-label="Escolher o dia" @change="goTo($event.target.value)" />
      </label>
      <button type="button" class="quiet-button" :disabled="busy || isToday" aria-label="Dia seguinte" @click="goTo(shiftDay(view.day, 1))">›</button>
    </div>

    <!-- Programação de refeições: aparece na primeira vez e quando a pessoa quer mudar. -->
    <form v-if="view && showSchedule" class="fd-schedule" @submit.prevent="saveSchedule">
      <h3>{{ needsSchedule ? 'Quantas refeições você faz por dia?' : 'Mudar as refeições' }}</h3>
      <p class="fd-muted">Escolha uma vez. Depois, cada dia já mostra essas refeições e você só adiciona os alimentos. Pode mudar quando quiser.</p>
      <label>Refeições por dia
        <select v-model.number="scheduleMeals" :disabled="!scheduleDaily" aria-label="Refeições por dia" :aria-invalid="Boolean(errors.meals)">
          <option v-for="count in MEAL_COUNTS" :key="count" :value="count">{{ count }} {{ count === 1 ? 'refeição' : 'refeições' }}</option>
        </select>
      </label>
      <label class="fd-check"><input v-model="scheduleDaily" type="checkbox" /> Igual todos os dias da semana</label>
      <div v-if="!scheduleDaily" class="fd-week">
        <label v-for="(name, index) in WEEKDAYS" :key="name">{{ name }}
          <select v-model.number="scheduleWeek[index]" :aria-label="`Refeições na ${name}`">
            <option v-for="count in MEAL_COUNTS" :key="count" :value="count">{{ count }}</option>
          </select>
        </label>
      </div>
      <p v-if="errors.meals || errors.by_weekday" class="fd-field-error">{{ errors.meals || errors.by_weekday }}</p>
      <footer>
        <button v-if="!needsSchedule" type="button" class="quiet-button" :disabled="busy" @click="scheduleOpen = false">Cancelar</button>
        <button class="primary-btn" :disabled="busy">Salvar refeições</button>
      </footer>
    </form>

    <template v-if="view && !showSchedule">
      <div class="fd-schedule-line">
        <span class="fd-muted">{{ scheduleText }}</span>
        <button type="button" class="quiet-button" :disabled="busy" @click="openSchedule">Mudar refeições</button>
      </div>

      <form class="fd-form" @submit.prevent="saveEntry">
        <p v-if="editingId" class="fd-editing"><strong>Editando um alimento.</strong> Troque a refeição, o alimento, a quantidade ou a unidade.</p>
        <label>Refeição
          <select v-model.number="slot" aria-label="Refeição">
            <option v-for="section in view.meals" :key="section.id" :value="section.id">{{ section.label }}</option>
          </select>
        </label>

        <div class="fd-search">
          <label for="fd-food">Alimento</label>
          <input id="fd-food" v-model="query" type="search" autocomplete="off" role="combobox" aria-autocomplete="list"
            :aria-expanded="results.length > 0" :aria-controls="results.length ? 'fd-options' : undefined" maxlength="80"
            placeholder="Digite, por exemplo: ovo, arroz, banana"
            :aria-invalid="Boolean(errors.food_id)" @keydown.down.prevent="focusOption(0)" @keydown.esc="results = []" />
          <span v-if="errors.food_id" class="fd-field-error">{{ errors.food_id }}</span>
          <ul v-if="results.length" id="fd-options" ref="optionsList" class="fd-options" role="listbox" aria-label="Alimentos encontrados">
            <li v-for="(item, index) in results" :key="item.id" role="option" tabindex="-1" aria-selected="false"
              @click="chooseFood(item)" @keydown.enter.prevent="chooseFood(item)" @keydown="optionKey($event, index)">
              <strong>{{ item.name }}</strong>
              <span>{{ kcal(item.per_100g.kcal) }} kcal por 100 g · {{ item.source === 'taco' ? 'TACO' : 'USDA' }}</span>
            </li>
          </ul>
          <span v-else-if="searching" class="fd-muted" role="status">Buscando…</span>
          <span v-else-if="searchError" class="fd-muted" role="status">{{ searchError }}</span>
        </div>

        <div v-if="food" class="fd-chosen">
          <span>{{ food.name }} <button type="button" class="quiet-button" @click="clearFood">Trocar</button></span>
          <div class="fd-qty">
            <label>Quantidade
              <input v-model="quantity" type="text" inputmode="decimal" aria-label="Quantidade" :aria-invalid="Boolean(errors.quantity)" />
            </label>
            <label>Unidade
              <select v-model="unit" aria-label="Unidade">
                <option v-for="portion in portions" :key="portion.label" :value="portion.label">{{ portion.label }} ({{ grams(portion.grams) }})</option>
                <option value="g">gramas</option>
              </select>
            </label>
          </div>
          <span v-if="errors.quantity" class="fd-field-error">{{ errors.quantity }}</span>
          <span v-if="errors.unit" class="fd-field-error">{{ errors.unit }}</span>
          <span v-if="errors.meal" class="fd-field-error">{{ errors.meal }}</span>
        </div>
        <div v-if="canAdd" class="fd-actions">
          <button class="primary-btn" :disabled="busy || !food">{{ editingId ? 'Salvar alteração' : 'Adicionar ao dia' }}</button>
          <button v-if="editingId" type="button" class="quiet-button" :disabled="busy" @click="cancelEdit">Cancelar edição</button>
        </div>
      </form>
    </template>

    <p v-if="message" class="fd-error" role="status">{{ message }}</p>

    <div v-if="view && !needsSchedule" class="fd-totals">
      <div><span class="eyebrow">DIA</span><strong>{{ kcal(view.totals.kcal) }} kcal</strong>
        <span>Proteína {{ view.totals.protein.toLocaleString('pt-BR') }} g · Carboidrato {{ view.totals.carb.toLocaleString('pt-BR') }} g · Gordura {{ view.totals.fat.toLocaleString('pt-BR') }} g</span>
        <span v-if="targetText" class="fd-muted">Meta aceita na aba: {{ targetText }}</span>
      </div>
    </div>

    <div v-if="view && !needsSchedule" class="fd-meals">
      <section v-for="section in view.meals" :key="section.id" class="fd-meal" :aria-label="section.label">
        <header>
          <h3>{{ section.label }}</h3>
          <span>{{ kcal(section.totals.kcal) }} kcal</span>
        </header>
        <ul v-if="view.entries.some(entry => entry.meal === section.id)">
          <li v-for="entry in view.entries.filter(item => item.meal === section.id)" :key="entry.id">
            <span class="fd-item">
              <strong>{{ entry.food_name }}</strong>
              <span class="fd-muted">{{ unitLabel(entry) }} · {{ grams(entry.grams) }}</span>
            </span>
            <span class="fd-nums">{{ kcal(entry.kcal) }} kcal · P {{ entry.protein.toLocaleString('pt-BR') }} · C {{ entry.carb.toLocaleString('pt-BR') }} · G {{ entry.fat.toLocaleString('pt-BR') }}</span>
            <span class="fd-entry-actions">
              <button type="button" class="quiet-button" :disabled="busy" :aria-label="`Editar ${entry.food_name}`" @click="startEdit(entry)">Editar</button>
              <button type="button" class="quiet-button" :disabled="busy" :aria-label="`Apagar ${entry.food_name}`" @click="remove(entry)">Apagar</button>
            </span>
          </li>
        </ul>
        <p v-else class="fd-muted">Nada registrado.</p>
      </section>
    </div>

    <p class="fd-source fd-muted">Fontes: TACO, 4ª edição (Unicamp, 2011) e USDA FoodData Central (SR Legacy e Foundation Foods). Valores aproximados, por 100 g do alimento cru ou como listado.</p>
  </section>
</template>

<style scoped>
/* Mesmo visual do cartão da base calórica (NutritionBase.vue): tema escuro, campos com o estilo global do app. */
.food-diary{margin-bottom:26px;display:flex;flex-direction:column;gap:16px}
.fd-head h2{font-size:22px;letter-spacing:-.5px;font-weight:500;margin:10px 0 8px}
.fd-muted{font-size:12px;line-height:1.7;color:#9399ae}
.fd-error{font-size:12px;color:#ffb0b0;background:#ff8a8a14;border:1px solid #ff8a8a33;border-radius:10px;padding:10px 12px;margin:0}
.fd-field-error{color:#ffb0b0;font-size:11px}
h3{font-size:16px;font-weight:550;letter-spacing:-.2px;margin:0}
.fd-day{display:flex;align-items:center;gap:12px;justify-content:center}
.fd-date{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px;color:#d6d8e6}
.fd-date input{border:0;background:transparent;color:inherit;font:inherit;color-scheme:dark}
.fd-schedule{display:flex;flex-direction:column;gap:14px;max-width:640px;border:1px solid #a1ddc522;background:linear-gradient(120deg,#a1ddc50d,#bcafff0a);border-radius:14px;padding:20px}
.fd-schedule label,.fd-week label,.fd-form label,.fd-qty label{display:flex;flex-direction:column;gap:8px;font-size:11px;color:#9da1b5}
.fd-schedule label.fd-check{flex-direction:row;align-items:center;gap:10px;font-size:12px;color:#d6d8e6}
.fd-check input{accent-color:var(--accent)}
.fd-schedule footer{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.fd-week{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.fd-schedule-line{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.fd-form{display:grid;gap:14px;grid-template-columns:minmax(0,1fr) minmax(0,2fr);align-items:start}
.fd-form select,.fd-form input,.fd-schedule select,.fd-week select{min-width:0;width:100%}
.fd-editing{grid-column:1/-1;margin:0;font-size:12px;line-height:1.7;color:#f1d3b8;background:#e8b5a012;border:1px solid #e8b5a033;border-radius:10px;padding:10px 12px}
.fd-search{position:relative;display:flex;flex-direction:column;gap:8px}
.fd-search>label{font-size:11px;color:#9da1b5}
.fd-options{position:absolute;top:100%;left:0;right:0;z-index:5;margin:6px 0 0;padding:6px;list-style:none;background:#1c1f2b;border:1px solid #ffffff1a;border-radius:12px;max-height:300px;overflow:auto;box-shadow:0 14px 40px #0008}
.fd-options li{display:flex;flex-direction:column;gap:3px;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:13px;color:#e2e3ef}
.fd-options li:hover,.fd-options li:focus{background:#ffffff0f;outline:none}
.fd-options li:focus-visible{box-shadow:inset 0 0 0 1px var(--accent)}
.fd-options li span{font-size:11px;color:#9399ae}
.fd-chosen{grid-column:1/-1;display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:12px;border:1px solid #ffffff10;font-size:13px;color:#e2e3ef}
.fd-qty{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:14px}
.fd-qty input,.fd-qty select{min-width:0;width:100%}
.fd-actions{grid-column:1/-1;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.fd-totals>div{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:12px;border:1px solid #ffffff10}
.fd-totals strong{font-size:30px;font-weight:500;letter-spacing:-1px;color:var(--mint)}
.fd-totals span{font-size:12px;color:#d6d8e6}
.fd-totals span.fd-muted{color:#9399ae}
.fd-meals{display:grid;gap:14px}
.fd-meal{border-top:1px solid #ffffff0d;padding-top:12px}
.fd-meal header{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:#d6d8e6}
.fd-meal ul{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:6px}
.fd-meal li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;font-size:13px;padding:8px 0;border-bottom:1px solid #ffffff08}
.fd-meal li:last-child{border-bottom:0}
.fd-item{display:flex;flex-direction:column;gap:2px;min-width:0;color:#e2e3ef}
.fd-item strong{font-weight:550}
.fd-nums{font-size:11px;color:#9399ae;text-align:right}
.fd-entry-actions{display:flex;gap:6px}
.fd-source{margin:0}
@media (max-width:640px){
  .fd-form,.fd-qty{grid-template-columns:1fr}
  .fd-meal li{grid-template-columns:minmax(0,1fr)}
  .fd-nums{text-align:left}
}
</style>
