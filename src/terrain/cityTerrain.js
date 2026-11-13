// O terreno do Rio como cenário da cidade (CityWorld). Carregado sob demanda, já na construção da cidade.
import rioCidade, { CITY_SHIFT, CRISTO_PEAK, CRISTO_SCALE } from './regions/rio-cidade.js'
import { createTerrainObjects, loadTerrain } from './TerrainScene.js'
import { createShoreFoam, shorePointsFromTerrain } from './shoreFoam.js'

/**
 * Baixa o mapa de alturas e devolve `{ group, dispose, landmark, foam }`, com o grupo já na posição da cidade.
 * `landmark` é onde fica o Cristo: o topo do morro do Cristo (x, y, z da cena da cidade) e a escala do monumento.
 * `foam` é a espuma da beira d'água (dentro do corte da região), já no grupo; a cidade chama `foam.update(tempo)`.
 */
export async function loadCityTerrain() {
  const data = await loadTerrain(rioCidade)
  const objects = createTerrainObjects(data)
  objects.group.position.z = CITY_SHIFT
  const { crop } = rioCidade
  const foam = createShoreFoam(shorePointsFromTerrain(data, { cx: crop.x, cz: crop.z, radius: crop.radius }))
  objects.group.add(foam.mesh)
  const y = data.getHeightAt(CRISTO_PEAK.x, CRISTO_PEAK.z - CITY_SHIFT)
  const dispose = () => { foam.dispose(); objects.dispose?.() }
  return { ...objects, dispose, foam, landmark: { x: CRISTO_PEAK.x, y, z: CRISTO_PEAK.z, scale: CRISTO_SCALE } }
}
