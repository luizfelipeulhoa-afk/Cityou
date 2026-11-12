// O terreno do Rio como cenário da cidade (CityWorld). Carregado sob demanda, depois da primeira imagem.
import rioCidade, { CITY_SHIFT } from './regions/rio-cidade.js'
import { createTerrainObjects, loadTerrain } from './TerrainScene.js'

/** Baixa o mapa de alturas e devolve `{ group, dispose }`, com o grupo já na posição da cidade. */
export async function loadCityTerrain() {
  const objects = createTerrainObjects(await loadTerrain(rioCidade))
  objects.group.position.z = CITY_SHIFT
  return objects
}
