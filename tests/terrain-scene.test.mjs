import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { cameraLimits, constrainCamera, edgeDepth, orbitPosition } from '../src/terrain/camera.js'
import { decodePng } from '../src/terrain/png.js'
import { createTerrainData } from '../src/terrain/terrainData.js'
import { createTerrainObjects, seatBuilding } from '../src/terrain/TerrainScene.js'
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import rio from '../src/terrain/regions/rio.js'

const terrain = createTerrainData(rio, (await decodePng(new Uint8Array(fs.readFileSync(rio.heightmap.url)))).data)


test('câmera: em todos os limites, a borda do cenário fica além da névoa e o alvo fica na zona jogável', () => {
  const limits = cameraLimits(terrain)
  const { size, spacing, originX, originZ, heights: y, isSea } = terrain.grid
  const last = size - 1
  // Pontos de conferência, independentes das paredes usadas no cálculo: cada vértice de terra da borda da grade,
  // no nível do mar e na sua própria altura.
  const border = []
  for (let k = 0; k < size; k++) {
    for (const [i, j] of [[k, 0], [k, last], [0, k], [last, k]]) {
      const index = j * size + i
      if (!isSea[index]) border.push([originX + i * spacing, originZ + j * spacing, y[index]])
    }
  }
  assert.ok(border.length > 500, 'a borda da grade do Rio tem terra em três lados')
  const play = terrain.lots.bounds
  const targets = [
    [play.minX, play.minZ], [play.maxX, play.minZ], [play.minX, play.maxZ], [play.maxX, play.maxZ],
    [(play.minX + play.maxX) / 2, (play.minZ + play.maxZ) / 2], [play.minX, 0], [play.maxX, 0], [0, play.minZ], [0, play.maxZ],
    [900, -900], [-900, 900], // fora de tudo: o alvo tem de voltar
  ]
  const polars = [limits.minPolar, (limits.minPolar + limits.maxPolar) / 2, limits.maxPolar]
  const distances = [limits.minDistance, (limits.minDistance + limits.maxDistance) / 2, limits.maxDistance]
  let poses = 0, checked = 0, nearestFog = Infinity, withEdgeInView = 0
  for (const [tx, tz] of targets) {
    for (let step = 0; step < 24; step++) {
      for (const polar of polars) {
        for (const distance of distances) {
          for (const aspect of [0.45, 1, 16 / 9, 2.4]) {
            const [px, py, pz] = orbitPosition([tx, 0, tz], step * Math.PI / 12, polar, distance)
            const camera = { position: { x: px, y: py, z: pz }, fov: limits.fov, aspect }
            const target = { x: tx, y: 0, z: tz }, fog = { near: 0, far: 0 }
            constrainCamera(terrain, limits, camera, target, fog)
            poses++
            assert.notEqual(terrain.lots.kindAt({ x: Math.round(target.x), z: Math.round(target.z) }), undefined)
            assert.ok(terrain.lots.playable.some(lot => Math.abs(target.x - lot.x) <= 0.5 && Math.abs(target.z - lot.z) <= 0.5), 'o alvo fica num lote jogável')
            const { x, y: cy, z } = camera.position
            assert.ok(cy >= Math.max(terrain.getHeightAt(x, z), terrain.seaY) + limits.clearance - 1e-9, 'a câmera fica acima do terreno')
            assert.ok(x > terrain.bounds.minX && x < terrain.bounds.maxX && z > terrain.bounds.minZ && z < terrain.bounds.maxZ, 'a câmera fica sobre o cenário')
            assert.ok(fog.far <= limits.maxFog && fog.near < fog.far)
            nearestFog = Math.min(nearestFog, fog.far)
            // Base da câmera, refeita aqui sem usar camera.js.
            let fx = target.x - x, fy = -cy, fz = target.z - z
            const length = Math.hypot(fx, fy, fz)
            fx /= length; fy /= length; fz /= length
            const flat = Math.hypot(fx, fz), rx = -fz / flat, rz = fx / flat
            const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy
            const tv = Math.tan(limits.fov * Math.PI / 360), th = tv * aspect
            let inView = false
            for (const [bx, bz, top] of border) {
              for (const by of [terrain.seaY, top]) {
                const dx = bx - x, dy = by - cy, dz = bz - z
                const depth = dx * fx + dy * fy + dz * fz
                if (depth <= 0 || Math.abs(dx * rx + dz * rz) > depth * th || Math.abs(dx * ux + dy * uy + dz * uz) > depth * tv) continue
                inView = true
                checked++
                if (depth < fog.far) assert.fail(`borda visível: ponto (${bx}, ${by.toFixed(1)}, ${bz}) a ${depth.toFixed(1)} com a névoa em ${fog.far.toFixed(1)}; alvo (${tx}, ${tz}), giro ${step}, polar ${polar.toFixed(2)}, distância ${distance}, proporção ${aspect}`)
              }
            }
            if (inView) withEdgeInView++
            // O cálculo usa paredes um pouco maiores que a borda real: nunca pode dar uma distância maior que a conferida aqui.
            assert.ok(fog.far <= Math.max(1, edgeDepth(terrain, { position: [x, cy, z], target: [target.x, 0, target.z], fov: limits.fov, aspect })))
          }
        }
      }
    }
  }
  assert.ok(withEdgeInView > poses / 10, `a borda entrou no campo de visão em ${withEdgeInView} de ${poses} poses`)
  assert.ok(checked > 100000)
  // A névoa nunca fecha: mesmo no pior caso ela só termina bem depois dos marcos.
  assert.ok(nearestFog >= 160, `menor distância final da névoa: ${nearestFog.toFixed(1)}`)
  // O mar além da grade termina muito depois da névoa máxima.
  assert.ok(terrain.seaMargin - limits.maxDistance > limits.maxFog * 2)
  console.log(`    ${poses} poses, ${checked} pontos de borda no campo de visão, névoa final entre ${nearestFog.toFixed(0)} e ${limits.maxFog}`)
})

test('cena: um draw para o terreno e o mar, vegetação em duas malhas instanciadas e um material só', () => {
  const objects = createTerrainObjects(terrain)
  const [ground, trees, palms] = objects.group.children
  assert.equal(objects.group.children.length, 3)
  assert.equal(ground.geometry.attributes.position.count, terrain.triangles * 3)
  assert.equal(ground.geometry.index, null)
  assert.ok(trees.isInstancedMesh && palms.isInstancedMesh)
  assert.equal(trees.count, terrain.stats.trees)
  assert.equal(palms.count, terrain.stats.palms)
  assert.ok(ground.material === trees.material && trees.material === palms.material, 'o mesmo material nos três')
  assert.ok(ground.material.flatShading && ground.material.vertexColors)
  assert.ok(objects.stats.terrainTriangles <= 60000)
  // A sobreposição só existe depois de pedida, com dois triângulos por lote bloqueado.
  objects.setBlockedOverlay(true)
  const overlay = objects.group.children[3]
  const blocked = rio.lots.rows.join('').split('#').length - 1
  assert.equal(overlay.geometry.attributes.position.count, blocked * 6)
  assert.equal(overlay.visible, true)
  objects.setBlockedOverlay(false)
  assert.equal(overlay.visible, false)
  objects.dispose()
})

test('prédios: assentam no lote sobre o disco de 10 lados, sem flutuar; lote bloqueado recusa', () => {
  const model = () => {
    // Um GLB fora de escala e fora do centro: a função precisa encaixar a base na área.
    const mesh = new Mesh(new BoxGeometry(6, 9, 3), new MeshBasicMaterial())
    mesh.position.set(4, 2, -1)
    const group = new Group()
    group.add(mesh)
    return group
  }
  const anchor = size => terrain.lots.playable.find(lot => terrain.isBuildable(lot, size))
  for (const size of [1, 2, 3, 4]) {
    const lot = anchor(size)
    const seat = seatBuilding(terrain, model(), lot, size, { rotation: size % 4 })
    assert.ok(seat, `área ${size}×${size} livre aceita o prédio`)
    const center = terrain.lots.footprintCenter(lot, size)
    assert.deepEqual([seat.position.x, seat.position.z], [center.x, center.z])
    assert.equal(seat.position.y, terrain.getHeightAt(center.x, center.z))
    assert.equal(seat.position.y, 0, 'o platô fica em y = 0')
    seat.updateWorldMatrix(true, true)
    const [pedestal, holder] = seat.children
    assert.equal(pedestal.geometry.parameters.radialSegments, 10)
    const disc = new Box3().setFromObject(pedestal), building = new Box3().setFromObject(holder)
    assert.ok(Math.abs(disc.min.y - seat.position.y) < 1e-9, 'o disco encosta no terreno')
    assert.ok(Math.abs(building.min.y - disc.max.y) < 1e-6, `o prédio encosta no disco (${building.min.y} e ${disc.max.y})`)
    const half = size / 2 + 1e-6
    for (const box of [disc, building]) {
      assert.ok(box.min.x >= center.x - half && box.max.x <= center.x + half && box.min.z >= center.z - half && box.max.z <= center.z + half, `área ${size}×${size}: nada passa do lote`)
    }
    assert.ok(Math.max(building.max.x - building.min.x, building.max.z - building.min.z) > size * 0.89, 'a base ocupa 90% da área')
  }
  const decorative = terrain.lots.playable.find(lot => terrain.lots.kindAt(lot) === 'decorative')
  assert.equal(seatBuilding(terrain, model(), decorative, 1), null)
  assert.equal(seatBuilding(terrain, model(), { x: rio.lots.x0, z: rio.lots.z0 }, 1), null, 'lote bloqueado recusa a construção')
  assert.equal(seatBuilding(terrain, model(), { x: 0, z: 70 }, 2), null, 'o mar recusa a construção')
})
