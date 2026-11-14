<script setup>
// Diário alimentar da aba Alimentação (worker/diary.js). A pessoa digita o nome do alimento, escolhe na lista
// (variantes como cru, cozido, frito), depois a unidade (ou gramas) e a quantidade. Não há texto livre: o servidor
// só aceita um alimento da base e calcula as calorias e os macros. Nada aqui calcula nutriente.
import { computed, onMounted, ref, watch } from 'vue'
import { addDiaryEntry, loadDiary, removeDiaryEntry, searchFoods } from '../fifones/api.js'

const MEAL_OPTIONS = [['cafe', 'Café da manhã'], ['almoco', 'Almoço'], ['lanche', 'Lanche'], ['jantar', 'Jantar'], ['outros', 'Outros']]

const view = ref(null)
const busy = ref(false)
const message = ref('')
const errors = ref({})

const meal = ref('almoco')
const query = ref('')
const results = ref([])
const searching = ref(false)
const searchError = ref('')
const food = ref(null)
const quantity = ref('1')
const unit = ref('g')

let searchTimer = null
let searchToken = 0

const kcal = value => Math.round(value).toLocaleString('pt-BR')
const grams = value => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g`
const dateBr = day => (day ? day.split('-').reverse().join('/') : '')
const shiftDay = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10)
const nowDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const isToday = computed(() => view.value?.day === nowDay())

const portions = computed(() => food.value?.portions ?? [])
const unitLabel = entry => (entry.unit === 'g' ? `${entry.quantity.toLocaleString('pt-BR')} g` : `${entry.quantity.toLocaleString('pt-BR')} × ${entry.unit}`)
const targetText = computed(() => {
  const target = view.value?.target
  if (!target) return ''
  return target.low === target.high ? `${kcal(target.low)} kcal` : `${kcal(target.low)} a ${kcal(target.high)} kcal`
})

function apply(next) {
  view.value = next
  message.value = ''
}

async function run(task, after) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    apply(await task())
    after?.()
  } catch (error) {
    if (error.status === 422 && error.details?.fields) {
      errors.value = error.details.fields
      message.value = error.message
    } else {
      message.value = error.message
    }
  } finally {
    busy.value = false
  }
}

async function goTo(day) {
  await run(() => loadDiary(day))
}

function chooseFood(item) {
  food.value = item
  query.value = item.name
  results.value = []
  unit.value = item.portions[0]?.label ?? 'g'
  errors.value = {}
}

function clearFood() {
  food.value = null
  query.value = ''
  results.value = []
  errors.value = {}
}

// Busca com atraso: a resposta de uma consulta antiga é descartada.
watch(query, text => {
  if (food.value && text === food.value.name) return
  food.value = null
  clearTimeout(searchTimer)
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

function add() {
  const body = { day: view.value.day, meal: meal.value, food_id: food.value?.id, quantity: Number(String(quantity.value).replace(',', '.')), unit: unit.value }
  if (!food.value) {
    errors.value = { food_id: 'Escolha um alimento da lista.' }
    return
  }
  run(() => addDiaryEntry(body), () => {
    query.value = ''
    food.value = null
    quantity.value = '1'
    errors.value = {}
  })
}

function remove(entry) {
  run(() => removeDiaryEntry(entry.id))
}

onMounted(() => goTo())
</script>

<template>
  <section class="food-diary surface" aria-labelledby="food-diary-title">
    <header class="fd-head">
      <span class="eyebrow">DIÁRIO DO DIA</span>
      <h2 id="food-diary-title">O que você comeu</h2>
      <p class="fd-muted">Escolha o alimento da lista. Os números vêm da Tabela Brasileira de Composição de Alimentos (TACO, Unicamp) e da base do USDA FoodData Central, iguais para todo mundo.</p>
    </header>

    <div v-if="view" class="fd-day">
      <button type="button" class="quiet-button" :disabled="busy" aria-label="Dia anterior" @click="goTo(shiftDay(view.day, -1))">‹</button>
      <label class="fd-date">
        <span>{{ isToday ? 'Hoje' : dateBr(view.day) }}</span>
        <input type="date" :value="view.day" :max="nowDay()" aria-label="Escolher o dia" @change="goTo($event.target.value)" />
      </label>
      <button type="button" class="quiet-button" :disabled="busy || isToday" aria-label="Dia seguinte" @click="goTo(shiftDay(view.day, 1))">›</button>
    </div>

    <form v-if="view" class="fd-form" @submit.prevent="add">
      <label>Refeição
        <select v-model="meal" aria-label="Refeição">
          <option v-for="[id, label] in MEAL_OPTIONS" :key="id" :value="id">{{ label }}</option>
        </select>
      </label>

      <label class="fd-search">Alimento
        <input v-model="query" type="search" autocomplete="off" role="combobox" aria-autocomplete="list"
          :aria-expanded="results.length > 0" aria-controls="fd-options" maxlength="80"
          placeholder="Digite, por exemplo: ovo, arroz, banana" :aria-invalid="Boolean(errors.food_id)" />
        <span v-if="errors.food_id" class="fd-field-error">{{ errors.food_id }}</span>
        <ul v-if="results.length" id="fd-options" class="fd-options" role="listbox" aria-label="Alimentos encontrados">
          <li v-for="item in results" :key="item.id" role="option" tabindex="0" :aria-selected="false"
            @click="chooseFood(item)" @keydown.enter.prevent="chooseFood(item)">
            <strong>{{ item.name }}</strong>
            <span>{{ kcal(item.per_100g.kcal) }} kcal por 100 g · {{ item.source === 'taco' ? 'TACO' : 'USDA' }}</span>
          </li>
        </ul>
        <span v-else-if="searching" class="fd-muted">Buscando…</span>
        <span v-else-if="searchError" class="fd-muted">{{ searchError }}</span>
      </label>

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
        <button class="primary-btn" :disabled="busy">Adicionar ao dia</button>
      </div>
    </form>

    <p v-if="message" class="fd-error" role="status">{{ message }}</p>

    <div v-if="view" class="fd-totals">
      <div><span class="eyebrow">DIA</span><strong>{{ kcal(view.totals.kcal) }} kcal</strong>
        <span>Proteína {{ view.totals.protein.toLocaleString('pt-BR') }} g · Carboidrato {{ view.totals.carb.toLocaleString('pt-BR') }} g · Gordura {{ view.totals.fat.toLocaleString('pt-BR') }} g</span>
        <span v-if="targetText" class="fd-muted">Meta aceita na aba: {{ targetText }}</span>
      </div>
    </div>

    <div v-if="view" class="fd-meals">
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
            <button type="button" class="quiet-button" :disabled="busy" :aria-label="`Apagar ${entry.food_name}`" @click="remove(entry)">Apagar</button>
          </li>
        </ul>
        <p v-else class="fd-muted">Nada registrado.</p>
      </section>
    </div>

    <p class="fd-source fd-muted">Fontes: TACO, 4ª edição (Unicamp, 2011) e USDA FoodData Central (SR Legacy e Foundation Foods). Valores aproximados, por 100 g do alimento cru ou como listado.</p>
  </section>
</template>

<style scoped>
.food-diary{margin-bottom:26px;display:flex;flex-direction:column;gap:16px}
.fd-head h2{font-size:22px;letter-spacing:-.5px;font-weight:500;margin:10px 0 8px}
.fd-muted{font-size:12px;line-height:1.6;color:#9399ae}
.fd-error{color:#c0392b;font-size:13px;margin:0}
.fd-field-error{color:#c0392b;font-size:12px}
.fd-day{display:flex;align-items:center;gap:12px;justify-content:center}
.fd-date{display:flex;flex-direction:column;align-items:center;font-size:14px}
.fd-date input{border:0;background:transparent;color:inherit;font:inherit}
.fd-form{display:grid;gap:12px;grid-template-columns:1fr 2fr;align-items:start}
.fd-form label{display:flex;flex-direction:column;gap:6px;font-size:13px}
.fd-form input,.fd-form select{font:inherit;padding:9px 10px;border-radius:10px;border:1px solid #d8dbe5;background:#fff;color:inherit;min-width:0}
.fd-search{position:relative}
.fd-options{position:absolute;top:100%;left:0;right:0;z-index:5;margin:4px 0 0;padding:4px;list-style:none;background:#fff;border:1px solid #d8dbe5;border-radius:12px;max-height:280px;overflow:auto;box-shadow:0 10px 30px rgba(20,24,40,.15)}
.fd-options li{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:14px}
.fd-options li:hover,.fd-options li:focus{background:#eef2fb;outline:none}
.fd-options li span{font-size:12px;color:#6b7290}
.fd-chosen{grid-column:1/-1;display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:12px;background:#f5f7fc}
.fd-qty{display:grid;grid-template-columns:1fr 2fr;gap:12px}
.fd-qty label{display:flex;flex-direction:column;gap:6px;font-size:13px}
.fd-qty input,.fd-qty select{font:inherit;padding:9px 10px;border-radius:10px;border:1px solid #d8dbe5;background:#fff;min-width:0}
.fd-form .primary-btn{justify-self:start}
.fd-totals > div{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:14px;background:#f5f7fc}
.fd-totals strong{font-size:24px;font-weight:500}
.fd-totals span{font-size:13px}
.fd-meals{display:grid;gap:12px}
.fd-meal header{display:flex;justify-content:space-between;align-items:baseline}
.fd-meal h3{font-size:15px;font-weight:500;margin:0}
.fd-meal ul{list-style:none;padding:0;margin:6px 0 0;display:grid;gap:6px}
.fd-meal li{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;font-size:14px;padding:8px 0;border-bottom:1px solid #eceef5}
.fd-item{display:flex;flex-direction:column;gap:2px;min-width:0}
.fd-nums{font-size:12px;color:#6b7290;text-align:right}
.fd-source{margin:0}
@media (max-width:640px){
  .fd-form,.fd-qty{grid-template-columns:1fr}
  .fd-meal li{grid-template-columns:1fr auto}
  .fd-nums{grid-column:1/-1;text-align:left}
}
</style>
