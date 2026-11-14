// Cache de leitura na borda (Cache API do ponto de presença), por sessão.
// Objetivo: o Durable Object da prévia custa ~120 ms por chamada (docs/BENCHMARKS.md); a leitura repetida responde do cache
// e se revalida em segundo plano. Só GET /api/personal e GET /api/city, só respostas 200 sem Set-Cookie.
// Segurança: a chave leva o nome do objeto da sessão (hash do cookie ou id da conta), nunca o cookie; entradas de sessões
// diferentes nunca se misturam. Invalidação: toda escrita que passa por este Worker troca a "versão" da sessão, e as entradas
// antigas deixam de ser alcançáveis. Escritas por outro ponto de presença só aparecem aqui depois de MAX_AGE_MS.
const CACHEABLE = new Set(['/api/personal', '/api/city'])
const ORIGIN = 'https://cityou.cache'
export const REFRESH_AFTER_MS = 1_000 // a partir daqui a resposta do cache vem junto com uma revalidação em segundo plano
export const MAX_AGE_MS = 30_000 // acima disto a resposta do cache não vale: espera o servidor

// Ler o que acabou de escrever: a Cache API não garante que a troca de versão apareça na leitura seguinte (medido na prévia:
// 12 de 14 leituras logo depois de uma escrita vieram velhas). Por isso toda escrita devolve um cookie curto com a hora, e uma
// leitura com esse cookie recente ignora o cache e vai ao objeto: o navegador que escreveu sempre lê o que escreveu.
export const WRITE_COOKIE = 'cityou_w'
export const recentWrite = (request, now = Date.now()) => {
  const stamp = Number(request.headers.get('Cookie')?.match(/(?:^|;\s*)cityou_w=(\d+)/)?.[1])
  return Number.isFinite(stamp) && now - stamp <= MAX_AGE_MS + 5_000
}
export function markWrite(response, now = Date.now()) {
  const marked = new Response(response.body, response)
  marked.headers.append('Set-Cookie', `${WRITE_COOKIE}=${now}; Path=/api; Max-Age=60; HttpOnly; Secure; SameSite=Lax`)
  return marked
}

export const isCacheableRead = (method, pathname) => method === 'GET' && CACHEABLE.has(pathname)

const versionUrl = key => `${ORIGIN}/v/${key}`
const entryUrl = (key, version, url) => `${ORIGIN}/e/${key}/${version}${url.pathname}${url.search}`

async function versionOf(cache, key) {
  const hit = await cache.match(versionUrl(key))
  return hit ? await hit.text() : '0'
}

/** Chame depois de qualquer escrita (qualquer status) da sessão `key`: as leituras guardadas deixam de valer. */
export async function invalidate(key, cache = globalThis.caches?.default) {
  if (!cache || !key) return
  await cache.put(versionUrl(key), new Response(crypto.randomUUID(), { headers: { 'Cache-Control': 'max-age=86400' } }))
}

/**
 * `fresh()` busca a resposta no Durable Object. Devolve a resposta do cache (com `X-Cityou-Cache: hit`) ou a nova (`miss`).
 * `ctx` é o contexto do Worker (waitUntil). Sem Cache API (ambiente sem `caches`), passa direto.
 */
export async function cachedRead({ key, url, ctx, fresh, timing, bypass = false, cache = globalThis.caches?.default }) {
  if (!cache || !key) return fresh()
  const look = () => (async () => {
    const version = await versionOf(cache, key)
    return { version, hit: await cache.match(entryUrl(key, version, url)) }
  })()
  const { version, hit } = timing ? await timing.measure('cache', look) : await look()
  const store = async response => {
    if (response.status !== 200 || response.headers.has('Set-Cookie')) return
    const copy = new Response(response.clone().body, response)
    copy.headers.set('Cache-Control', 'max-age=300')
    copy.headers.set('X-Cached-At', String(Date.now()))
    await cache.put(entryUrl(key, version, url), copy)
  }
  if (hit && !bypass) {
    const age = Date.now() - Number(hit.headers.get('X-Cached-At'))
    if (age >= 0 && age <= MAX_AGE_MS) {
      if (age >= REFRESH_AFTER_MS) {
        ctx.waitUntil(fresh().then(store).catch(error => {
          console.error(JSON.stringify({ message: 'revalidação do cache falhou', error: String(error) }))
        }))
      }
      const result = new Response(hit.body, hit)
      result.headers.set('X-Cityou-Cache', 'hit')
      return result
    }
  }
  const response = await fresh()
  ctx.waitUntil(store(response).catch(() => {}))
  const result = new Response(response.body, response)
  result.headers.set('X-Cityou-Cache', 'miss')
  return result
}
