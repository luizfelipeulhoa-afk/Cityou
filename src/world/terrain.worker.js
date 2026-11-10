// Gera o terreno fora da thread principal e devolve os arrays por transferência (sem cópia).
import { buildGlobeData } from './terrainCore.js'

self.onmessage = (event) => {
  const data = buildGlobeData(event.data)
  self.postMessage(data, [data.position.buffer, data.color.buffer, data.vivid.buffer, data.center.buffer, data.wave.buffer])
}
