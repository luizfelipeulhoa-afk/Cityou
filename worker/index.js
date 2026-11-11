// API do Cityou e início da sessão nas páginas do app.
// Contrato em docs/API.md.
import { HttpError, createTiming, errorResponse } from './http.js'
import { health } from './routes/health.js'
import { demoApi, sessionCookie, sessionToken } from './demo.js'
export { DemoSession } from './demo.js'

const routes = [
  ['GET', '/api/health', health],
]

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Escritas precisam vir do próprio site: cabeçalho que um formulário de outro site não envia + mesma origem. */
function guardWrite(request, url) {
  if (!WRITE_METHODS.has(request.method)) return
  if (request.headers.get('X-Fifones-City') !== '1') throw new HttpError(403, 'A ação exige X-Fifones-City: 1.')
  const origin = request.headers.get('Origin')
  let sameOrigin = false
  try { sameOrigin = Boolean(origin) && new URL(origin).origin === url.origin } catch { sameOrigin = false }
  if (!sameOrigin) throw new HttpError(403, 'Origem inválida.')
}

async function handleApi(request, env, ctx, url, timing) {
  guardWrite(request, url)
  const matches = routes.filter(([, path]) => path === url.pathname)
  if (!matches.length) return demoApi(request, env, url)
  const route = matches.find(([method]) => method === request.method)
  if (!route) throw new HttpError(405, 'Método não permitido.')
  return route[2]({ request, env, ctx, url, timing })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      const asset = env.ASSETS ? await env.ASSETS.fetch(request) : new Response('Not found', { status: 404 })
      if (request.method !== 'GET' || !asset.ok || !asset.headers.get('Content-Type')?.startsWith('text/html') || sessionToken(request)) return asset
      const response = new Response(asset.body, asset)
      response.headers.set('Cache-Control', 'private, no-store')
      response.headers.append('Set-Cookie', sessionCookie(url))
      return response
    }
    const timing = createTiming()
    let response
    try {
      response = await handleApi(request, env, ctx, url, timing)
    } catch (error) {
      if (error instanceof HttpError) {
        response = errorResponse(error.status, error.message, error.fields)
      } else {
        console.error(JSON.stringify({ message: 'erro não tratado', path: url.pathname, error: String(error), stack: error?.stack }))
        response = errorResponse(500, 'Algo deu errado do nosso lado. Tente de novo.')
      }
    }
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Server-Timing', timing.header())
    return response
  },
}
