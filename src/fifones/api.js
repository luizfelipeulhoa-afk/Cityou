export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function request(path, { method = 'GET', body, retry = false, keepalive = false } = {}) {
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
  const city = await request('/api/city' + cityQuery)
  if (cityLocation && city.location_id !== cityLocation) {
    throw new ApiError('Este servidor ainda não oferece cidades regionais.')
  }
  return city
}
export const loadTasks = () => request('/api/workspace/tasks')
export const loadProjects = () => request('/api/workspace/projects')
export const loadActivity = () => request('/api/workspace/activity')
export const syncRewards = () => request('/api/rewards/sync' + cityQuery, { method: 'POST', body: {} })
export const completeTask = id => request(`/api/workspace/tasks/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} })
export const cityAction = action => request('/api/city/actions' + cityQuery, {
  method: 'POST',
  body: { ...action, request_id: action.request_id || crypto.randomUUID() },
  retry: true,
})
export const loadWorldProgress = () => request('/api/world/progress')
export const travelTo = local => request('/api/world/travel', {
  method: 'POST',
  body: { local, request_id: crypto.randomUUID() },
  retry: true,
})
// O servidor junta o progresso enviado ao guardado e devolve o resultado (idempotente).
export const saveWorldProgress = (progress, { keepalive = false } = {}) => request('/api/world/progress', { method: 'PUT', body: progress, keepalive })
