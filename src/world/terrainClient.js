import { buildGlobeData } from './terrainCore.js'

/**
 * Pede os dados do globo a um Web Worker. Se o Worker não puder ser criado
 * ou falhar, gera na própria thread (mais lento na abertura, mesmo resultado).
 */
export function loadGlobeData({ radius, detail, spaces }) {
  const options = { radius, detail, spaces: spaces.map(({ id, lat, lon, terreno }) => ({ id, lat, lon, terreno })) }
  return new Promise((resolve) => {
    const fallback = () => resolve(buildGlobeData(options))
    let worker
    try {
      worker = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' })
    }
    catch {
      fallback()
      return
    }
    worker.onmessage = (event) => { worker.terminate(); resolve(event.data) }
    worker.onerror = () => { worker.terminate(); fallback() }
    worker.postMessage(options)
  })
}
