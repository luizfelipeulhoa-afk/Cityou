import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { WORLD_SPACES, SPACE_ORDER, latLonToVector3, previousSpace } from '../src/world/worldSpaces.js'
import { vector3ToLatLon, surfaceQuaternion } from '../src/world/geo.js'
import { isLand, buildGlobeGeometry } from '../src/world/terrain.js'
import {
  applyProgress, complete, completeSpace, currentSpaceId, initialProgress, loadProgress, mergeProgress,
  normalizeProgress, reset, resetProgress, sameProgress, unlock, unlockSpace, PROGRESS_STORAGE_KEY,
} from '../src/world/progress.js'
import { createProgressSync, hasLocalBackend } from '../src/world/progressSync.js'
import { buildPlaceholder, MONUMENT_KINDS } from '../src/world/monuments.js'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

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
  complete('ilha-inicial', storage)
  // O reset recomeça numa época nova, para o progresso antigo não voltar na sincronização.
  assert.deepEqual(reset(storage), { ...initialProgress(), epoca: 1 })
  assert.deepEqual(loadProgress(storage), { ...initialProgress(), epoca: 1 })
})

test('fusão de progresso: união na mesma época, o mais novo vence entre épocas', () => {
  const a = completeSpace(initialProgress(), 'ilha-inicial')
  const b = unlockSpace(initialProgress(), 'petra')
  const merged = mergeProgress(a, b)
  assert.deepEqual(merged.desbloqueados, ['ilha-inicial', 'cristo-redentor', 'petra'])
  assert.deepEqual(merged.concluidos, ['ilha-inicial'])
  assert.ok(sameProgress(mergeProgress(b, a), merged))
  const wiped = resetProgress(a)
  assert.deepEqual(wiped, { ...initialProgress(), epoca: 1 })
  assert.ok(sameProgress(mergeProgress(a, wiped), wiped))
  assert.ok(sameProgress(mergeProgress(wiped, a), wiped))
  assert.equal(completeSpace(wiped, 'ilha-inicial').epoca, 1)
})

test('sincronização local-first: envia o local, recebe o fundido e não repete à toa', async () => {
  let local = completeSpace(initialProgress(), 'ilha-inicial')
  let server = unlockSpace(initialProgress(), 'petra')
  const calls = []
  const sync = createProgressSync({
    getProgress: () => local,
    applyProgress: (p) => { local = p },
    save: async (p) => { calls.push(p); server = mergeProgress(server, p); return { ...server, atualizado_em: 'agora' } },
    debounceMs: 0,
  })
  sync.start()
  await wait(30)
  assert.equal(calls.length, 1)
  assert.ok(local.desbloqueados.includes('petra'), 'o avanço do servidor chegou ao navegador')
  assert.ok(server.concluidos.includes('ilha-inicial'), 'o avanço local chegou ao servidor')
  sync.push()
  await wait(30)
  assert.equal(calls.length, 1, 'sem mudança, sem requisição')
  local = completeSpace(local, 'cristo-redentor')
  sync.push()
  await wait(30)
  assert.equal(calls.length, 2)
  assert.ok(sameProgress(local, server))
  sync.stop()
})

test('sincronização: sem backend desliga em silêncio; reset em outro aparelho vence', async () => {
  const statuses = []
  let local = initialProgress()
  const offline = createProgressSync({
    getProgress: () => local, applyProgress: () => {}, debounceMs: 0, onStatus: s => statuses.push(s),
    save: async () => { throw Object.assign(new Error('não existe'), { status: 404 }) },
  })
  assert.equal(hasLocalBackend('127.0.0.1'), true)
  assert.equal(hasLocalBackend('cityou.example.com'), false)
  offline.start()
  await wait(30)
  assert.equal(offline.state.available, false)
  assert.equal(statuses.at(-1), 'local')

  local = completeSpace(initialProgress(), 'ilha-inicial')
  const newer = { ...initialProgress(), epoca: 3 }
  const sync = createProgressSync({ getProgress: () => local, applyProgress: (p) => { local = p }, save: async () => newer, debounceMs: 0 })
  sync.start()
  await wait(30)
  assert.deepEqual(local, newer)
  sync.stop()
})

test('monumentos em código: um por espaço, com a base em Y=0 e dentro do orçamento de triângulos', () => {
  for (const s of WORLD_SPACES) assert.ok(MONUMENT_KINDS.includes(s.placeholder), `${s.id} sem monumento '${s.placeholder}'`)
  for (const kind of MONUMENT_KINDS) {
    const model = buildPlaceholder(kind)
    const box = new THREE.Box3().setFromObject(model)
    let tris = 0
    model.traverse(o => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3 })
    assert.ok(tris > 200 && tris <= 4000, `${kind}: ${tris} triângulos`)
    assert.ok(Math.abs(box.min.y) < 0.02, `${kind}: base em Y=${box.min.y}`)
    assert.ok(box.max.y > 0.4 && Math.max(box.max.x - box.min.x, box.max.z - box.min.z) < 1.2, `${kind}: tamanho fora do esperado`)
  }
})
