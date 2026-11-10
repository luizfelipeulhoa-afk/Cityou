// Sincronização local-first do progresso com o backend.
// A tela usa o progresso local na hora; a rede roda em segundo plano e nunca bloqueia.
// Um único PUT envia o estado local e recebe o estado já fundido pelo servidor.
import { saveWorldProgress } from '../fifones/api.js'
import { mergeProgress, normalizeProgress, sameProgress } from './progress.js'

const MAX_RETRIES = 3
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** O backend do Cityou só aceita acesso local; fora disso (site publicado) não há com quem sincronizar. */
export function hasLocalBackend(hostname = globalThis.location?.hostname) {
  return LOCAL_HOSTS.includes(hostname)
}

/**
 * @param {object} options
 * @param {() => object} options.getProgress lê o progresso atual
 * @param {(progress: object) => void} options.applyProgress recebe o progresso fundido quando ele muda
 * @param {(progress: object, options?: object) => Promise<object>} [options.save] chamada de rede (padrão: PUT /api/world/progress)
 * @param {(status: 'sincronizando'|'sincronizado'|'offline'|'local') => void} [options.onStatus]
 */
export function createProgressSync({ getProgress, applyProgress, save = saveWorldProgress, onStatus = () => {}, debounceMs = 400 }) {
  let timer = null
  let stopped = false
  let inFlight = false
  let queued = false
  let failures = 0
  let available = true // vira false quando não há backend (site estático): fica só local, em silêncio
  let synced = null // último estado confirmado pelo servidor

  function schedule(ms) {
    clearTimeout(timer)
    if (!stopped && available) timer = setTimeout(flush, ms)
  }

  async function flush() {
    if (stopped || !available) return
    if (inFlight) { queued = true; return }
    inFlight = true
    onStatus('sincronizando')
    try {
      const remote = await save(normalizeProgress(getProgress()))
      failures = 0
      synced = normalizeProgress(remote)
      const merged = mergeProgress(getProgress(), synced)
      if (!sameProgress(merged, getProgress())) applyProgress(merged)
      if (!sameProgress(merged, synced)) queued = true // mudou enquanto a requisição estava no ar
      onStatus('sincronizado')
    }
    catch (error) {
      if (error?.status === 404 || error?.status === 405 || error?.status === 501) {
        available = false
        onStatus('local')
      }
      else {
        failures += 1
        onStatus('offline')
        if (failures <= MAX_RETRIES) schedule(Math.min(1000 * 2 ** failures, 60000))
      }
    }
    finally {
      inFlight = false
      if (queued) { queued = false; schedule(0) }
    }
  }

  return {
    /** Primeira troca com o servidor: envia o local e recebe o fundido. */
    start() { schedule(0) },
    /** Avisa que o progresso local mudou. Envia depois de uma pausa curta (debounce). */
    push() {
      if (synced && sameProgress(getProgress(), synced)) return
      failures = 0
      schedule(debounceMs)
    },
    /** Ao sair da página: envia o que falta numa requisição que sobrevive ao fechamento. */
    flushOnExit() {
      if (stopped || !available || (synced && sameProgress(getProgress(), synced))) return
      clearTimeout(timer)
      save(normalizeProgress(getProgress()), { keepalive: true }).catch(() => {})
    },
    stop() { stopped = true; clearTimeout(timer) },
    /** Para testes e depuração. */
    get state() { return { available, failures, inFlight, synced } },
  }
}
