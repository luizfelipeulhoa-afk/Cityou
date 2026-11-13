// Cliente único da API, usado pelo painel (src/App.vue), pela cidade (src/CityApp.vue) e pelo mapa.
// Etapa 2 de docs/PLANO-PROXIMOS-PASSOS.md: um só `api()`, que trata o 401 levando a pessoa para entrar
// (`/?entrar=1&next=…`) e não deixa sair nenhum pedido depois disso; `goToPanel(aba)` abre uma aba do painel.
export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

// Abas do painel (`/app#/<aba>`). Lista fechada: destino fora dela não navega.
export const PANEL_TABS = ['inicio', 'tarefas', 'agenda', 'habitos', 'metas', 'fitness', 'nutricao', 'autoconhecimento',
  'estudos', 'financas', 'projetos', 'biblioteca', 'memorias', 'cidade', 'mundo']

// A janela que navega: dentro do painel (iframe da mesma origem) é a do painel; aberta sozinha, a própria.
function topWindow() {
  try {
    if (window.parent !== window && window.parent.location.origin === window.location.origin) return window.parent
  } catch { /* Outra origem: navega só esta janela. */ }
  return window
}

/** Abre uma aba do painel, na página avulsa ou dentro do painel. Devolve false se a aba não existe. */
export function goToPanel(tab) {
  if (!PANEL_TABS.includes(tab)) return false
  topWindow().location.assign(`/app#/${tab}`)
  return true
}

const LOGIN_MESSAGE = 'Entre na sua conta para continuar.'
let signedOut = false

// Sessão vencida ou sem conta: uma única ida à entrada, voltando depois para onde a pessoa estava.
function goToLogin() {
  if (signedOut) return
  signedOut = true
  const top = topWindow()
  const next = top.location.pathname + top.location.search + top.location.hash
  top.location.assign(`/?entrar=1&next=${encodeURIComponent(next)}`)
}

/**
 * Pedido à API do Cityou. Escritas levam o cabeçalho exigido pelo Worker. Erro vira ApiError com a mensagem do
 * servidor. `retry` repete uma vez em falha de rede (só para ações com request_id, que o servidor não repete).
 */
export async function api(path, method = 'GET', body, { retry = false, keepalive = false } = {}) {
  if (signedOut) throw new ApiError(LOGIN_MESSAGE, 401)
  let lastError
  for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 14000)
    try {
      const response = await fetch(path, {
        method,
        signal: controller.signal,
        cache: 'no-store',
        keepalive,
        headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Fifones-City': '1' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 401) {
        goToLogin()
        throw new ApiError(data?.message || LOGIN_MESSAGE, 401, data)
      }
      if (!response.ok) {
        throw new ApiError(data?.message || (typeof data?.detail === 'string' ? data.detail : null) || data?.error || `Não foi possível salvar (${response.status}).`, response.status, data)
      }
      if (!data) throw new ApiError('O servidor retornou uma resposta vazia.', response.status)
      return data
    }
    catch (error) {
      if (error instanceof ApiError) throw error
      lastError = new ApiError(error.name === 'AbortError' ? 'A conexão demorou. Tente novamente.' : 'Sem conexão com o servidor. Tente novamente.')
    }
    finally { clearTimeout(timer) }
  }
  throw lastError
}

const cityLocation = new URLSearchParams(globalThis.location?.search).get('local')
const cityQuery = cityLocation ? '?' + new URLSearchParams({ local: cityLocation }) : ''

export const loadCity = async () => {
  const city = await api('/api/city' + cityQuery)
  if (cityLocation && city.location_id !== cityLocation) {
    throw new ApiError('Este servidor ainda não oferece cidades regionais.')
  }
  return city
}
// Tarefas reais, guardadas no Durable Object da pessoa (etapa 2).
export const loadTasks = () => api('/api/personal/tasks')
export const completeTask = id => api(`/api/personal/tasks/${encodeURIComponent(id)}/complete`, 'POST', {})
export const loadProjects = () => api('/api/personal/projects')
// Agenda real (etapa 5). Toda escrita devolve o estado novo de /api/personal (do mês pedido): a tela não faz GET depois.
const monthQuery = month => month ? '?month=' + encodeURIComponent(month) : ''
export const loadPersonal = month => api('/api/personal' + monthQuery(month))
export const addEvent = (body, month) => api('/api/personal/events' + monthQuery(month), 'POST', body)
export const editEvent = (id, body, month) => api(`/api/personal/events/${encodeURIComponent(id)}` + monthQuery(month), 'PUT', body)
export const removeEvent = (id, month) => api(`/api/personal/events/${encodeURIComponent(id)}` + monthQuery(month), 'DELETE')
// Peso real: uma pesagem por dia, em gramas. A tendência (média de 7 dias) vem pronta do servidor.
export const loadWeights = () => api('/api/personal/weights')
export const addWeight = body => api('/api/personal/weights', 'POST', body)
export const editWeight = (id, body) => api(`/api/personal/weights/${encodeURIComponent(id)}`, 'PUT', body)
export const removeWeight = id => api(`/api/personal/weights/${encodeURIComponent(id)}`, 'DELETE')
// Projetos reais: um nome e um próximo passo. `stepDone` só o servidor conta.
const projectPath = id => `/api/personal/projects/${encodeURIComponent(id)}`
export const addProject = body => api('/api/personal/projects', 'POST', body)
export const editProject = (id, body) => api(projectPath(id), 'PUT', body)
export const removeProject = id => api(projectPath(id), 'DELETE')
export const stepDone = id => api(projectPath(id) + '/step-done', 'POST', {})
export const syncRewards = () => api('/api/rewards/sync' + cityQuery, 'POST', {})
export const cityAction = action => api('/api/city/actions' + cityQuery, 'POST',
  { ...action, request_id: action.request_id || crypto.randomUUID() }, { retry: true })
export const loadWorldProgress = () => api('/api/world/progress')
export const travelTo = local => api('/api/world/travel', 'POST', { local, request_id: crypto.randomUUID() }, { retry: true })
// O servidor junta o progresso enviado ao guardado e devolve o resultado (idempotente).
export const saveWorldProgress = (progress, { keepalive = false } = {}) => api('/api/world/progress', 'PUT', progress, { keepalive })
