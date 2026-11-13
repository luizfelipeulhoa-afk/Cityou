// O terreno do Rio como cenário da cidade (CityWorld). Carregado sob demanda, depois da primeira imagem.
import rioCidade, { CITY_SHIFT, CRISTO_PEAK, CRISTO_SCALE } from './regions/rio-cidade.js'
import { createTerrainObjects, loadTerrain } from './TerrainScene.js'

/**
 * Baixa o mapa de alturas e devolve `{ group, dispose, landmark }`, com o grupo já na posição da cidade.
 * `landmark` é onde fica o Cristo: o topo do morro do Cristo (x, y, z da cena da cidade) e a escala do monumento.
 */
export async function loadCityTerrain() {
  const data = await loadTerrain(rioCidade)
  const objects = createTerrainObjects(data)
  objects.group.position.z = CITY_SHIFT
  const y = data.getHeightAt(CRISTO_PEAK.x, CRISTO_PEAK.z - CITY_SHIFT)
  return { ...objects, landmark: { x: CRISTO_PEAK.x, y, z: CRISTO_PEAK.z, scale: CRISTO_SCALE } }
}
