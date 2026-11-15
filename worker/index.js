// API do Cityou e início da sessão nas páginas do app.
// Contrato em docs/API.md.
import { HttpError, createTiming, errorResponse } from './http.js'
import { health } from './routes/health.js'
import { CSP_REPORT_ONLY, CSP_REPORT_MAX } from './csp.js'
import { accountKey, demoApi, demoKeyOf, sessionCookie, sessionToken } from './demo.js'
import { cachedRead, invalidate, isCacheableRead, markWrite, recentWrite } from './edge-cache.js'
import { accountsEnabled, authApi, sessionTokenOf, sessionUser } from './auth.js'
import { bootEligible, bootEmbedJson, embedBoot } from './boot.js'
export { DemoSession } from './demo.js'

const routes = [
  ['GET', '/api/health', health],
]

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])


/** Relatório de violação do navegador: só registra no log (sem gravar nada), tamanho limitado, sem exigir cabeçalho de escrita. */
async function cspReport(request) {
  if (request.method !== 'POST') throw new HttpError(405, 'Use POST.')
  const text = (await request.text()).slice(0, CSP_REPORT_MAX)
  console.warn(JSON.stringify({ message: 'csp: violação (Report-Only)', report: text }))
  return new Response(null, { status: 204 })
}

/** Escritas precisam vir do próprio site: cabeçalho que um formulário de outro site não envia + mesma origem. */
function guardWrite(request, url) {
  if (!WRITE_METHODS.has(request.method)) return
  if (request.headers.get('X-Cityou-Request') !== '1') throw new HttpError(403, 'A ação exige X-Cityou-Request: 1.')
  const origin = request.headers.get('Origin')
  let sameOrigin = false
  try { sameOrigin = Boolean(origin) && new URL(origin).origin === url.origin } catch { sameOrigin = false }
  if (!sameOrigin) throw new HttpError(403, 'Origem inválida.')
}

/** Cabeçalhos de segurança de toda resposta (páginas e API). Copia a resposta: a do ASSETS pode vir imutável. */
// CSP_ENFORCE="true" troca o Report-Only pelo cabeçalho que bloqueia. Ligar só depois da semana sem violação (etapa 6),
// pelo painel do Cloudflare ou em wrangler.jsonc; para voltar, basta tirar a variável.
const cspHeader = env => env?.CSP_ENFORCE === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'

function securityHeaders(response, env) {
  const copy = new Response(response.body, response)
  copy.headers.set('X-Content-Type-Options', 'nosniff')
  copy.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  copy.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  if ((copy.headers.get('Content-Type') || '').includes('text/html')) copy.headers.set(cspHeader(env), CSP_REPORT_ONLY)
  return copy
}

/** Login obrigatório: só vale com o banco de contas ligado (sem ele ninguém consegue entrar). */
const loginRequired = env => accountsEnabled(env) && env.REQUIRE_LOGIN === 'true'

async function handleApi(request, env, ctx, url, timing) {
  if (url.pathname === '/api/csp-report') return cspReport(request)
  guardWrite(request, url)
  const matches = routes.filter(([, path]) => path === url.pathname)
  if (!matches.length) {
    const account = await authApi({ request, env, url })
    if (account) return account
    const user = await sessionUser(request, env)
    // Com as contas ativas e REQUIRE_LOGIN ligado, não há mais demonstração sem conta: toda rota de dados pede sessão.
    if (!user && loginRequired(env)) throw new HttpError(401, 'Entre na sua conta para continuar.')
    const read = isCacheableRead(request.method, url.pathname)
    if (!read && !WRITE_METHODS.has(request.method)) return demoApi(request, env, url, user, timing)
    // Cache de leitura por sessão (worker/edge-cache.js): a chave é o nome do objeto da sessão, nunca o cookie.
    const key = user ? (user.data_key ?? await accountKey(user.id)) : await demoKeyOf(request, env)
    if (read) return cachedRead({ key, url, ctx, timing, bypass: recentWrite(request), fresh: () => demoApi(request, env, url, user, timing) })
    try { return markWrite(await demoApi(request, env, url, user, timing)) } finally { await invalidate(key).catch(() => {}) }
  }
  const route = matches.find(([method]) => method === request.method)
  if (!route) throw new HttpError(405, 'Método não permitido.')
  return route[2]({ request, env, ctx, url, timing })
}

const APP_PAGES = new Set(['/app', '/app.html', '/city', '/city.html', '/world', '/world.html'])
const LANDING_PAGES = new Set(['/', '/index.html'])

/**
 * Com as contas ativas, as páginas do app pedem login, e quem já entrou pula a página de apresentação.
 * Devolve `{ response }` para redirecionar ou recusar, ou `{ user }` (pode ser null) para seguir: a conta já
 * resolvida aqui é reaproveitada no estado inicial embutido (`worker/boot.js`), sem segunda ida ao banco.
 */
async function pageGate(request, env, url) {
  if (request.method !== 'GET' || !accountsEnabled(env)) return {}
  const app = APP_PAGES.has(url.pathname), landing = LANDING_PAGES.has(url.pathname)
  if (!app && !landing) return {}
  let user = null
  try { user = sessionTokenOf(request) ? await sessionUser(request, env) : null } catch (error) {
    console.error(JSON.stringify({ message: 'pageGate: banco indisponível', error: String(error) }))
    if (app) return { response: new Response('O serviço de contas está indisponível. Tente novamente.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    }) }
    return {}
  }
  const redirect = location => new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'private, no-store' } })
  if (app && !user) return { response: redirect(`/?entrar=1&next=${encodeURIComponent(url.pathname + url.search)}`) }
  if (landing && user && !url.searchParams.has('inicio')) return { response: redirect('/app') }
  return { user }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      const { response: gate, user: gateUser } = await pageGate(request, env, url)
      if (gate) return securityHeaders(gate, env)
      const eligible = bootEligible(request, env, url) && Boolean(gateUser)
      // O estado inicial é pedido ao Durable Object em paralelo com o HTML estático (docs/LATENCIA.md, item 5).
      const [asset, bootText] = await Promise.all([
        env.ASSETS ? env.ASSETS.fetch(request) : Promise.resolve(new Response('Not found', { status: 404 })),
        eligible ? bootEmbedJson(env, gateUser) : Promise.resolve(null),
      ])
      if (request.method !== 'GET' || !asset.ok || !asset.headers.get('Content-Type')?.startsWith('text/html')) return securityHeaders(asset, env)
      if (!sessionToken(request)) {
        const response = new Response(asset.body, asset)
        response.headers.set('Cache-Control', 'private, no-store')
        response.headers.append('Set-Cookie', sessionCookie(url))
        return securityHeaders(response, env)
      }
      if (bootText) {
        const response = new Response(embedBoot(asset, bootText).body, asset)
        response.headers.set('Cache-Control', 'private, no-store')
        response.headers.append('Vary', 'Cookie')
        return securityHeaders(response, env)
      }
      return securityHeaders(asset, env)
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
    response.headers.set('Server-Timing', timing.header())
    return securityHeaders(response, env)
  },
}
