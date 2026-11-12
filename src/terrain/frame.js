// Converte entre latitude/longitude e as coordenadas do mundo de uma região de terreno.
// No mundo, +Y é para cima e o fundo do mapa (−Z) aponta para `bearing` (graus a partir do norte, sentido horário);
// +X fica 90° à direita dele. Com bearing 0: −Z = norte e +X = leste.
const RAD = Math.PI / 180

export function createFrame({ origin, bearing = 0, metersPerUnit = 1 }) {
  const lat = origin.lat * RAD
  // Metros por grau na latitude da origem (elipsoide WGS84). Numa região de poucas dezenas de km o erro é desprezível.
  const metersPerLat = 111132.92 - 559.82 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat) - 0.0023 * Math.cos(6 * lat)
  const metersPerLon = 111412.84 * Math.cos(lat) - 93.5 * Math.cos(3 * lat) + 0.118 * Math.cos(5 * lat)
  const cos = Math.cos(bearing * RAD), sin = Math.sin(bearing * RAD)
  return {
    metersPerUnit,
    /** Latitude e longitude → posição no mundo, em unidades. */
    toWorld(latitude, longitude) {
      const east = (longitude - origin.lon) * metersPerLon, north = (latitude - origin.lat) * metersPerLat
      return { x: (east * cos - north * sin) / metersPerUnit, z: (-east * sin - north * cos) / metersPerUnit }
    },
    /** Posição no mundo → latitude e longitude. */
    toGeo(x, z) {
      const east = (x * cos - z * sin) * metersPerUnit, north = (-x * sin - z * cos) * metersPerUnit
      return { lat: origin.lat + north / metersPerLat, lon: origin.lon + east / metersPerLon }
    },
  }
}
