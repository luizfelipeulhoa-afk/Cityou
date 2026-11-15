// Estado inicial embutido no HTML de /app (etapa de latência, item 5 de docs/LATENCIA.md): o Worker pede
// GET /api/personal ao mesmo Durable Object em paralelo com a página, e a primeira leitura do painel usa
// esse estado sem ida à rede. Só com conta (nunca na demonstração sem login), nunca com `?local=` e dentro
// de um orçamento de tempo e tamanho: estourou, a página sai sem o script e o cliente busca como sempre.
import { demoApi } from './demo.js'
import { todayInSaoPaulo } from './records.js'

export const BOOT_PAGES = new Set(['/app', '/app.html'])
const BOOT_BUDGET_MS = 400
const BOOT_MAX_BYTES = 200_000

export const bootEmbedEnabled = env => env?.BOOT_EMBED !== 'false'

/** Só a aba do painel, sem `?local=` (cidade de teste) e com a chave ligada. Quem decide se há conta é o chamador. */
export function bootEligible(request, env, url) {
  return request.method === 'GET' && BOOT_PAGES.has(url.pathname) && !url.searchParams.has('local') && bootEmbedEnabled(env)
}

/** Texto do JSON de `GET /api/personal` do mês de hoje para `user`, ou null (sem conta, estourou o orçamento, ou falhou). */
export async function bootEmbedJson(env, user) {
  if (!user) return null
  const month = todayInSaoPaulo().slice(0, 7)
  const bootUrl = new URL(`https://cityou.internal/api/personal?month=${month}`)
  const bootRequest = new Request(bootUrl, { method: 'GET' })
  const budget = new Promise(resolve => setTimeout(() => resolve(null), BOOT_BUDGET_MS))
  const call = demoApi(bootRequest, env, bootUrl, user).then(async response => {
    if (!response.ok) return null
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength <= BOOT_MAX_BYTES ? text : null
  }).catch(() => null)
  return Promise.race([call, budget])
}

/** Escapa só o bastante para o JSON não fechar a tag `<script>` cedo. */
const escapeForScript = text => text.replace(/</g, '\\u003c')

/** Injeta `<script type="application/json" id="cityou-boot">` antes de `</body>`, se a página tiver um. */
export function embedBoot(asset, bootText) {
  const script = `<script type="application/json" id="cityou-boot">${escapeForScript(bootText)}</script>`
  const rewriter = new HTMLRewriter().on('body', { element: element => element.append(script, { html: true }) })
  return rewriter.transform(asset)
}
