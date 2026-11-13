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
  'estudos', 'financas', 'projetos', 'biblioteca', 'memorias', 'conta', 'cidade', 'mundo']

// A janela que navega: dentro do painel (iframe da mesma origem) é a do painel; aberta sozinha, a própria.
export function topWindow() {
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

// Páginas do app que aceitam voltar depois de entrar (a mesma lista de `APP_PAGES` em worker/index.js).
export const APP_PAGES = ['/app', '/app.html', '/city', '/city.html', '/world', '/world.html']

/** `next` vindo da URL: só página do app; o `#/aba` de onde a pessoa estava é mantido. Qualquer outra coisa vira `/app`. */
export function safeNext(raw, hash = '') {
  if (typeof raw !== 'string' || !/^\/(?!\/)[\w\-./?=&%#]*$/.test(raw) || !APP_PAGES.includes(raw.split(/[?#]/)[0])) return '/app'
  return raw.includes('#') || !/^#[\w\-/]*$/.test(hash) ? raw : raw + hash
}

/** Sair da conta: só vai para a página inicial se o servidor confirmou; senão lança erro e a pessoa continua dentro. */
export async function signOut() {
  let response
  try {
    response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fifones-City': '1' }, body: '{}' })
  } catch { throw new ApiError('Sem conexão. Você continua dentro da conta.', 0) }
  if (!response.ok) throw new ApiError('Não foi possível sair agora. Tente de novo.', response.status)
  topWindow().location.assign('/')
}

/** Conta da sessão, ou null (demonstração, sem rede). Só a página avulsa mostra o Sair; dentro do painel ele já está lá. */
export async function loadAccount() {
  if (window.parent !== window) return null
  try { return (await (await fetch('/api/auth/status', { headers: { Accept: 'application/json' } })).json()).user || null } catch { return null }
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
// Projetos ainda chegam vazios: ficam reais na etapa 5.
export const loadProjects = () => api('/api/workspace/projects')
export const syncRewards = () => api('/api/rewards/sync' + cityQuery, 'POST', {})
export const cityAction = action => api('/api/city/actions' + cityQuery, 'POST',
  { ...action, request_id: action.request_id || crypto.randomUUID() }, { retry: true })
export const loadWorldProgress = () => api('/api/world/progress')
export const travelTo = local => api('/api/world/travel', 'POST', { local, request_id: crypto.randomUUID() }, { retry: true })
// O servidor junta o progresso enviado ao guardado e devolve o resultado (idempotente).
export const saveWorldProgress = (progress, { keepalive = false } = {}) => api('/api/world/progress', 'PUT', progress, { keepalive })
