// Progresso do mapa-mundo, salvo em localStorage.
// Formato: { versao: 1, epoca: number, desbloqueados: string[], concluidos: string[] }
// Regras: o primeiro espaço está sempre desbloqueado; concluir N desbloqueia N+1;
// concluído implica desbloqueado. As funções puras não tocam em armazenamento.
// `epoca` conta os resets: ao juntar dois progressos de épocas diferentes, vence o mais novo.
import { SPACE_ORDER } from './spaces.js'

export const PROGRESS_STORAGE_KEY = 'buildu:world-progress:v1'

const memoryStorage = (() => {
  const data = new Map()
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: key => { data.delete(key) },
  }
})()

function defaultStorage() {
  try {
    const storage = globalThis.localStorage
    if (storage) return storage
  }
  catch { /* Navegação privada ou cookies bloqueados: usa memória. */ }
  return memoryStorage
}

export function initialProgress(order = SPACE_ORDER) {
  return { versao: 1, epoca: 0, desbloqueados: order.slice(0, 1), concluidos: [] }
}

export function normalizeProgress(raw, order = SPACE_ORDER) {
  const list = value => (Array.isArray(value) ? value : [])
  const concluidos = order.filter(id => list(raw?.concluidos).includes(id))
  const desbloqueados = order.filter((id, i) => i === 0 || list(raw?.desbloqueados).includes(id) || concluidos.includes(id))
  const epoca = Number.isInteger(raw?.epoca) && raw.epoca > 0 ? raw.epoca : 0
  return { versao: 1, epoca, desbloqueados, concluidos }
}

export function unlockSpace(progress, id, order = SPACE_ORDER) {
  const p = normalizeProgress(progress, order)
  if (!order.includes(id)) return p
  return normalizeProgress({ ...p, desbloqueados: [...p.desbloqueados, id] }, order)
}

export function completeSpace(progress, id, order = SPACE_ORDER) {
  const p = normalizeProgress(progress, order)
  const i = order.indexOf(id)
  if (i < 0) return p
  const next = order[i + 1]
  return normalizeProgress({
    epoca: p.epoca,
    desbloqueados: [...p.desbloqueados, id, ...(next ? [next] : [])],
    concluidos: [...p.concluidos, id],
  }, order)
}

/** Recomeça do zero numa época nova, para o progresso antigo não voltar de outro aparelho ou do servidor. */
export function resetProgress(progress, order = SPACE_ORDER) {
  return { ...initialProgress(order), epoca: normalizeProgress(progress, order).epoca + 1 }
}

/** Junta dois progressos. Na mesma época é uma união (só avança); em épocas diferentes vence o mais novo. */
export function mergeProgress(a, b, order = SPACE_ORDER) {
  const x = normalizeProgress(a, order), y = normalizeProgress(b, order)
  if (x.epoca !== y.epoca) return x.epoca > y.epoca ? x : y
  return normalizeProgress({
    epoca: x.epoca,
    desbloqueados: [...x.desbloqueados, ...y.desbloqueados],
    concluidos: [...x.concluidos, ...y.concluidos],
  }, order)
}

export function sameProgress(a, b, order = SPACE_ORDER) {
  const x = normalizeProgress(a, order), y = normalizeProgress(b, order)
  return x.epoca === y.epoca && x.desbloqueados.join() === y.desbloqueados.join() && x.concluidos.join() === y.concluidos.join()
}

/** Espaços com os campos `desbloqueado` e `concluido` preenchidos pelo progresso. */
export function applyProgress(spaces, progress) {
  const p = normalizeProgress(progress, spaces.map(s => s.id))
  return spaces.map(s => ({ ...s, desbloqueado: p.desbloqueados.includes(s.id), concluido: p.concluidos.includes(s.id) }))
}

/** Espaço "atual": o mais avançado já desbloqueado. */
export function currentSpaceId(progress, order = SPACE_ORDER) {
  const p = normalizeProgress(progress, order)
  return p.desbloqueados[p.desbloqueados.length - 1] || order[0]
}

export function loadProgress(storage = defaultStorage()) {
  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY)
    return normalizeProgress(raw ? JSON.parse(raw) : null)
  }
  catch {
    return initialProgress()
  }
}

export function saveProgress(progress, storage = defaultStorage()) {
  const p = normalizeProgress(progress)
  try { storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(p)) }
  catch { /* Armazenamento cheio ou bloqueado: o jogo segue em memória. */ }
  return p
}

export function unlock(id, storage = defaultStorage()) {
  return saveProgress(unlockSpace(loadProgress(storage), id), storage)
}

export function complete(id, storage = defaultStorage()) {
  return saveProgress(completeSpace(loadProgress(storage), id), storage)
}

export function reset(storage = defaultStorage()) {
  return saveProgress(resetProgress(loadProgress(storage)), storage)
}
