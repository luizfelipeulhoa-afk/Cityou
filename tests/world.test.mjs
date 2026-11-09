import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { WORLD_SPACES, SPACE_ORDER, latLonToVector3, previousSpace } from '../src/world/worldSpaces.js'
import { vector3ToLatLon, surfaceQuaternion } from '../src/world/geo.js'
import { isLand, buildGlobeGeometry } from '../src/world/terrain.js'
import {
  applyProgress, complete, completeSpace, currentSpaceId, initialProgress, loadProgress,
  normalizeProgress, reset, unlock, unlockSpace, PROGRESS_STORAGE_KEY,
} from '../src/world/progress.js'

function fakeStorage() {
  const data = new Map()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data }
}

test('os 8 espaços estão na ordem pedida e com o GLB esperado', () => {
  assert.deepEqual(SPACE_ORDER, ['ilha-inicial', 'cristo-redentor', 'machu-picchu', 'chichen-itza', 'coliseu', 'petra', 'taj-mahal', 'grande-muralha'])
  for (const s of WORLD_SPACES) {
    assert.equal(s.glbPath, `/models/world/${s.id}.glb`)
    for (const key of ['id', 'nome', 'lat', 'lon', 'glbPath', 'desbloqueado', 'concluido']) assert.ok(key in s, `${s.id} sem ${key}`)
  }
  assert.equal(WORLD_SPACES[0].desbloqueado, true)
  assert.equal(previousSpace('petra').id, 'coliseu')
})

test('latLonToVector3 posiciona na esfera e ida-e-volta preserva lat/lon', () => {
  const v = latLonToVector3(0, 0, 5)
  assert.ok(v.distanceTo(new THREE.Vector3(0, 0, 5)) < 1e-9)
  assert.ok(latLonToVector3(90, 0, 2).distanceTo(new THREE.Vector3(0, 2, 0)) < 1e-9)
  assert.ok(latLonToVector3(0, 90, 1).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9)
  for (const s of WORLD_SPACES) {
    const p = latLonToVector3(s.lat, s.lon, 5)
    assert.ok(Math.abs(p.length() - 5) < 1e-9)
    const back = vector3ToLatLon(p)
    assert.ok(Math.abs(back.lat - s.lat) < 1e-6 && Math.abs(back.lon - s.lon) < 1e-6)
  }
})

test('o "para cima" do modelo aponta para fora do globo e a frente para o sul', () => {
  const n = latLonToVector3(41.89, 12.49, 1)
  const q = surfaceQuaternion(n)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
  assert.ok(up.distanceTo(n) < 1e-6)
  assert.ok(Math.abs(front.dot(n)) < 1e-6)
  assert.ok(front.y < 0)
})

test('a ilha fica no mar e os monumentos em terra', () => {
  for (const s of WORLD_SPACES) assert.equal(isLand(s.lat, s.lon), s.terreno !== 'oceano', s.id)
  assert.equal(isLand(0, -30), false) // Atlântico
  assert.equal(isLand(-10, -55), true) // Brasil
  assert.equal(isLand(43, 34), false) // Mar Negro
})

test('geometria do globo: low poly, flat (não indexada) e com atributos do shader', () => {
  const { geometry, faces, landRatio } = buildGlobeGeometry({ radius: 5, detail: 12, spaces: WORLD_SPACES })
  assert.equal(geometry.index, null)
  assert.equal(faces, 20 * 13 * 13)
  for (const name of ['position', 'color', 'aVivid', 'aCenter', 'aWave']) assert.ok(geometry.attributes[name], name)
  assert.ok(landRatio > 0.15 && landRatio < 0.5, `landRatio ${landRatio}`)
})

test('progresso: concluir N desbloqueia N+1, sem pular etapas', () => {
  let p = initialProgress()
  assert.deepEqual(p.desbloqueados, ['ilha-inicial'])
  p = completeSpace(p, 'ilha-inicial')
  assert.deepEqual(p.concluidos, ['ilha-inicial'])
  assert.deepEqual(p.desbloqueados, ['ilha-inicial', 'cristo-redentor'])
  assert.equal(currentSpaceId(p), 'cristo-redentor')
  p = completeSpace(p, 'grande-muralha')
  assert.ok(p.desbloqueados.includes('grande-muralha'))
  const spaces = applyProgress(WORLD_SPACES, p)
  assert.equal(spaces.find(s => s.id === 'cristo-redentor').desbloqueado, true)
  assert.equal(spaces.find(s => s.id === 'petra').desbloqueado, false)
})

test('progresso: normalização ignora lixo e mantém o primeiro desbloqueado', () => {
  const p = normalizeProgress({ desbloqueados: ['xyz', 'petra'], concluidos: 'oops' })
  assert.deepEqual(p.desbloqueados, ['ilha-inicial', 'petra'])
  assert.deepEqual(p.concluidos, [])
  assert.deepEqual(unlockSpace(p, 'nao-existe'), p)
})

test('progresso salvo em localStorage com unlock/complete/reset', () => {
  const storage = fakeStorage()
  assert.deepEqual(loadProgress(storage), initialProgress())
  unlock('coliseu', storage)
  complete('ilha-inicial', storage)
  const saved = JSON.parse(storage.getItem(PROGRESS_STORAGE_KEY))
  assert.deepEqual(saved.desbloqueados, ['ilha-inicial', 'cristo-redentor', 'coliseu'])
  assert.deepEqual(loadProgress(storage).concluidos, ['ilha-inicial'])
  storage.setItem(PROGRESS_STORAGE_KEY, '{quebrado')
  assert.deepEqual(loadProgress(storage), initialProgress())
  assert.deepEqual(reset(storage), initialProgress())
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), null)
})
