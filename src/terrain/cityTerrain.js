// O terreno do Rio como cenário da cidade (CityWorld). Carregado sob demanda, já na construção da cidade.
import rioCidade, { CABLE_CAR, CITY_SHIFT, CRISTO_SCALE, CRISTO_SITE } from './regions/rio-cidade.js'
import { createCableCar } from './cableCar.js'
import { createTerrainObjects, loadTerrain } from './TerrainScene.js'
import { createShoreFoam, shorePointsFromTerrain } from './shoreFoam.js'

/**
 * Baixa o mapa de alturas e devolve `{ group, dispose, landmark, foam }`, com o grupo já na posição da cidade.
 * `landmark` é onde fica o Cristo: o pico da montanha da esquerda (x, y, z da cena da cidade) e a escala do monumento.
 * `cableCar` é o bondinho da Urca ao Pão de Açúcar, já no grupo; a cidade chama `cableCar.update(tempo)`.
 * `foam` é a espuma da beira d'água (dentro do corte da região), já no grupo; a cidade chama `foam.update(tempo)`.
 */
export async function loadCityTerrain() {
  const data = await loadTerrain(rioCidade)
  const objects = createTerrainObjects(data)
  objects.group.position.z = CITY_SHIFT
  const { crop } = rioCidade
  const foam = createShoreFoam(shorePointsFromTerrain(data, { cx: crop.x, cz: crop.z, radius: crop.radius }), { heightAt: (x, z) => data.getHeightAt(x, z) })
  objects.group.add(foam.mesh)
  // Base do Cristo no ponto mais baixo do topo, num raio de 1 lote: a rocha do pico atravessa a base (fica cravada), em
  // vez de a base ficar no alto e sobrar vão embaixo dela.
  const ring = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]
  const y = Math.min(...ring.map(([ox, oz]) => data.getHeightAt(CRISTO_SITE.x + ox, CRISTO_SITE.z + oz - CITY_SHIFT))) - 0.12
  const terrainPoint = point => ({ x: point.x, z: point.z - CITY_SHIFT })
  const cableCar = createCableCar((x, z) => data.getHeightAt(x, z), terrainPoint(CABLE_CAR.from), terrainPoint(CABLE_CAR.to))
  objects.group.add(cableCar.group)
  const dispose = () => { foam.dispose(); cableCar.dispose(); objects.dispose?.() }
  return { ...objects, dispose, foam, cableCar, landmark: { x: CRISTO_SITE.x, y, z: CRISTO_SITE.z, scale: CRISTO_SCALE } }
}
