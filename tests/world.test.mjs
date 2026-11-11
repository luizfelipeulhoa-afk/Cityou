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
import { buildGlobeData } from '../src/world/terrainCore.js'
import { fitModel, measureBase } from '../src/world/SpaceMarker.js'
import { resolveModelSources } from '../src/world/models.js'
import { glbTriangles, publishWorldModels, worldModelsIndex } from '../tools/world-models-manifest.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

test('assento dos monumentos: plano, do tamanho da base e todo em terra', () => {
  const radius = 5, markerSize = 0.13
  const data = buildGlobeData({ radius, detail: 20, spaces: WORLD_SPACES, markerSize })
  for (const s of WORLD_SPACES.filter(space => space.terreno !== 'oceano')) {
    const normal = latLonToVector3(s.lat, s.lon, 1)
    const half = markerSize * s.escala / 2 // meia base, em radianos
    const height = data.surface[s.id]
    assert.ok(height > radius * 1.01 && height <= radius * 1.03, `${s.id}: altura do assento ${height}`)
    let seated = 0
    const p = new THREE.Vector3()
    for (let i = 0; i < data.position.length; i += 3) {
      p.fromArray(data.position, i)
      if (p.angleTo(normal) > half * 1.45) continue
      seated++
      // No plano tangente: a base plana do GLB encosta inteira, sem vão nas bordas.
      assert.ok(Math.abs(p.dot(normal) - height) < 1e-3, `${s.id}: vértice fora do plano (${p.dot(normal) - height})`)
      assert.equal(data.wave[i / 3], 0, `${s.id}: mar sob a base`)
    }
    assert.ok(seated >= 9, `${s.id}: só ${seated} vértices no assento`)
  }
  // A ilha continua cercada de mar.
  const island = WORLD_SPACES[0]
  assert.equal(data.surface[island.id], radius)
})

test('base do modelo: mede o que encosta no chão, não a parte mais larga', () => {
  // Um "Cristo": pedestal estreito e braços abertos lá em cima.
  const statue = new THREE.Group()
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 24))
  pedestal.position.y = 0.1
  const arms = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1))
  arms.position.y = 0.9
  statue.add(pedestal, arms)
  const fitted = fitModel(statue, 1, 1.05)
  assert.ok(Math.abs(fitted.userData.fittedHeight - 0.95) < 1e-6)
  assert.ok(Math.abs(measureBase(fitted) - 0.2) < 0.01, `raio medido ${measureBase(fitted)}`)
  // Os monumentos em código têm a base larga: o raio fica perto da meia largura.
  for (const kind of MONUMENT_KINDS) {
    const r = measureBase(fitModel(buildPlaceholder(kind), 1, 1.05))
    assert.ok(r > 0.3 && r < 0.75, `${kind}: raio da base ${r}`)
  }
  assert.equal(measureBase(fitModel(new THREE.Group(), 1, 1)), 0)
})

test('modelos: models.json aponta para o arquivo com hash; sem ele vale o manifest.json', () => {
  const index = {
    coliseu: { arquivo: 'v/coliseu.0123456789.glb', kb: 316, triangulos: 23226 },
    petra: { arquivo: '../../segredo.glb', kb: 10 }, // caminho que sai da pasta: ignorado
    atlantida: { arquivo: 'v/atlantida.abc.glb', kb: 10 }, // não é um dos 8 espaços
  }
  const versioned = resolveModelSources(WORLD_SPACES, { index })
  assert.deepEqual([...versioned.keys()], ['coliseu'])
  assert.deepEqual(versioned.get('coliseu'), { url: '/models/world/v/coliseu.0123456789.glb', fallbackUrl: '/models/world/coliseu.glb', kb: 316 })
  // Servidor de desenvolvimento: o models.json aponta para o próprio arquivo de origem.
  assert.deepEqual(resolveModelSources(WORLD_SPACES, { index: { coliseu: { arquivo: 'coliseu.glb', kb: 316 } } }).get('coliseu'),
    { url: '/models/world/coliseu.glb', fallbackUrl: null, kb: 316 })
  const listed = resolveModelSources(WORLD_SPACES, { manifest: ['taj-mahal', 'desconhecido'] })
  assert.deepEqual([...listed.entries()], [['taj-mahal', { url: '/models/world/taj-mahal.glb', fallbackUrl: null, kb: 1 }]])
  assert.equal(resolveModelSources(WORLD_SPACES, {}).size, 0)
  assert.equal(resolveModelSources(WORLD_SPACES, { index: ['coliseu'] }).size, 0)
})

test('publicação dos modelos: cópia com o hash no nome, models.json e triângulos', () => {
  const glb = (json) => {
    const body = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4))
    const head = Buffer.alloc(20)
    head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + body.length, 8)
    head.writeUInt32LE(body.length, 12); head.writeUInt32LE(0x4e4f534a, 16)
    return Buffer.concat([head, body])
  }
  const model = glb({ accessors: [{ count: 300 }, { count: 90 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }, { attributes: { POSITION: 0 } }] }] })
  assert.equal(glbTriangles(model), 30 + 100)
  assert.equal(glbTriangles(Buffer.from('não é um glb, mas não pode derrubar o build')), 0)

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cityou-models-'))
  try {
    const source = path.join(temp, 'origem'), out = path.join(temp, 'dist')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'coliseu.glb'), model)
    fs.writeFileSync(path.join(source, 'LEIA-ME.txt'), 'não é modelo')
    const index = publishWorldModels(out, source)
    assert.deepEqual(Object.keys(index), ['coliseu'])
    assert.match(index.coliseu.arquivo, /^v\/coliseu\.[0-9a-f]{10}\.glb$/)
    assert.equal(index.coliseu.triangulos, 130)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'models/world/models.json'), 'utf8')), index)
    assert.ok(fs.readFileSync(path.join(out, 'models/world', index.coliseu.arquivo)).equals(model))
    // Conteúdo novo, nome novo; a cópia antiga some da pasta publicada.
    fs.writeFileSync(path.join(source, 'coliseu.glb'), glb({ meshes: [] }))
    const next = publishWorldModels(out, source)
    assert.notEqual(next.coliseu.arquivo, index.coliseu.arquivo)
    assert.deepEqual(fs.readdirSync(path.join(out, 'models/world/v')), [path.basename(next.coliseu.arquivo)])
    assert.equal(worldModelsIndex(source).coliseu.arquivo, 'coliseu.glb')
  }
  finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('gestos de seleção cancelam arraste de ida e volta, pinça e troca de alvo', async () => {
  const { createTapGesture } = await import('../src/interaction/tapGesture.js')
  const taps = createTapGesture(() => 10)
  const event = (pointerId, clientX = 100, clientY = 100) => ({ pointerId, clientX, clientY })
  taps.down(event(1), 'rio')
  taps.move(event(1, 109))
  assert.equal(taps.up(event(1), 'rio'), false)
  assert.equal(taps.active, false)

  taps.down(event(1), 'rio')
  taps.down(event(2), 'rio')
  taps.up(event(2), 'rio')
  assert.equal(taps.up(event(1), 'rio'), false)

  taps.down(event(1), 'rio')
  assert.equal(taps.up(event(1), 'ilha'), false)
  taps.down(event(1), 'ilha')
  taps.cancel(event(1))
  assert.equal(taps.up(event(1), 'ilha'), false)
  taps.down(event(1), 'ilha')
  assert.equal(taps.up(event(1, 105), 'ilha'), true)
})
