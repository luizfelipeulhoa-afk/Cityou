export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function request(path, { method = 'GET', body, retry = false } = {}) {
  let lastError
  for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 14000)
    try {
      const response = await fetch(path, {
        method,
        signal: controller.signal,
        cache: 'no-store',
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

export const loadCity = () => request('/api/city')
export const loadTasks = () => request('/api/workspace/tasks')
export const loadProjects = () => request('/api/workspace/projects')
export const loadActivity = () => request('/api/workspace/activity')
export const syncRewards = () => request('/api/rewards/sync', { method: 'POST', body: {} })
export const completeTask = id => request(`/api/workspace/tasks/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} })
export const cityAction = action => request('/api/city/actions', {
  method: 'POST',
  body: { ...action, request_id: action.request_id || crypto.randomUUID() },
  retry: true,
})
