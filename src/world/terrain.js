import * as THREE from 'three'
import { buildGlobeData } from './terrainCore.js'

export { buildGlobeData, fbm, isLand } from './terrainCore.js'

/** Monta a BufferGeometry do globo a partir dos arrays do núcleo (vindos ou não do Worker). */
export function geometryFromGlobeData(data) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3))
  geometry.setAttribute('aVivid', new THREE.BufferAttribute(data.vivid, 3))
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(data.center, 3))
  geometry.setAttribute('aWave', new THREE.BufferAttribute(data.wave, 1))
  // Sem normais: o flat shading as calcula no fragment shader. O relevo chega a ~7% do raio.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), data.radius * 1.1)
  return geometry
}

/** Versão síncrona (testes e reserva quando não há Worker). */
export function buildGlobeGeometry(options) {
  const data = buildGlobeData(options)
  return { geometry: geometryFromGlobeData(data), faces: data.faces, landRatio: data.landRatio, surface: data.surface }
}
