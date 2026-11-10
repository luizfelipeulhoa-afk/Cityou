import * as THREE from 'three'

export const DEG = Math.PI / 180

/**
 * Converte latitude/longitude (graus) em um ponto na esfera.
 * Convenção: lon 0 aponta para +Z, leste para +X e norte para +Y.
 * Olhando o globo a partir de +Z, as longitudes crescem para a direita.
 */
export function latLonToVector3(lat, lon, raio = 1, target = new THREE.Vector3()) {
  const phi = lat * DEG
  const lambda = lon * DEG
  const c = Math.cos(phi)
  return target.set(raio * c * Math.sin(lambda), raio * Math.sin(phi), raio * c * Math.cos(lambda))
}

export function vector3ToLatLon(v) {
  const r = v.length() || 1
  return {
    lat: Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG,
    lon: Math.atan2(v.x, v.z) / DEG,
  }
}

/**
 * Base local de um ponto da superfície: "up" sai do globo, "south" aponta para o
 * sul geográfico (tangente) e "east" completa a base destra (east = up × south).
 */
export function surfaceFrame(normal) {
  const up = normal.clone().normalize()
  const south = new THREE.Vector3(0, -1, 0).addScaledVector(up, up.y)
  if (south.lengthSq() < 1e-8) south.set(0, 0, 1).addScaledVector(up, -up.z)
  south.normalize()
  const east = new THREE.Vector3().crossVectors(up, south).normalize()
  return { up, south, east }
}

/**
 * Orientação de um modelo na superfície: +Y do modelo para fora do globo e
 * +Z (frente do GLB) para o sul, que é de onde a câmera de foco olha.
 */
export function surfaceQuaternion(normal, target = new THREE.Quaternion()) {
  const { up, south, east } = surfaceFrame(normal)
  return target.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, south))
}

/** Distância angular, em radianos, entre duas direções. */
export function angularDistance(a, b) {
  const d = a.dot(b) / ((a.length() * b.length()) || 1)
  return Math.acos(THREE.MathUtils.clamp(d, -1, 1))
}

/** Interpolação esférica entre duas direções unitárias. */
export function slerpDirections(a, b, t, target = new THREE.Vector3()) {
  const omega = angularDistance(a, b)
  if (omega < 1e-6) return target.copy(a)
  const s = Math.sin(omega)
  const wa = Math.sin((1 - t) * omega) / s
  const wb = Math.sin(t * omega) / s
  return target.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb)
}
