// Luz única por região, Lambert nos GLB e degradê de base: as peças da etapa 7a (prédio e terreno como uma coisa só).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HAND_MADE, LIGHTING, TERRAIN, lightingFor } from '../src/terrain/lighting.js'
import { PALETTE } from '../src/terrain/terrainData.js'
import { toLambert, toLambertScene } from '../src/tres/lambert.js'
import { applyGroundBlend, applyGroundBlendTo } from '../src/tres/groundBlend.js'
import { buildRioFallback } from '../src/fifones/sceneEnvironment.js'
import { getCityLayout } from '../shared/game/city-layout.js'

test('reserva do Rio: recria a baía junto com o cenário de terra', () => {
  const group = new THREE.Group()
  const backdrop = buildRioFallback(group, getCityLayout('cristo-redentor'))
  const bay = backdrop.find(object => object.name === 'Baía')
  assert.ok(bay?.isMesh)
  assert.equal(bay.parent, group)
  assert.ok(backdrop.length > 1)
})

test('luz: o Rio usa a luz do terreno, o céu da paleta e nenhum tone mapping', () => {
  assert.equal(lightingFor('cristo-redentor'), TERRAIN)
  assert.equal(TERRAIN.sky, parseInt(PALETTE.sky.slice(1), 16))
  assert.equal(TERRAIN.toneMapping, 'none')
  assert.equal(TERRAIN.ground, 0x6eba74) // mistura de grassLight e grassDark a 30%, como o platô do Rio
  assert.ok(TERRAIN.groundFade.from < TERRAIN.groundFade.to)
})

test('luz: região sem terreno mantém o cenário feito à mão, sem degradê de base', () => {
  assert.equal(lightingFor('ilha-inicial'), HAND_MADE)
  assert.equal(lightingFor(undefined), HAND_MADE)
  assert.equal(HAND_MADE.ground, null)
  assert.equal(HAND_MADE.toneMapping, 'aces')
})

test('luz: toda entrada da tabela tem valores válidos e a tabela não muda em tempo de execução', () => {
  for (const look of [...Object.values(LIGHTING), HAND_MADE]) {
    assert.ok(['none', 'aces'].includes(look.toneMapping))
    for (const value of [look.sky, look.hemisphere.sky, look.hemisphere.ground, look.sun.color, look.contact.color]) {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff)
    }
    assert.ok(look.sun.intensity > 0 && look.hemisphere.intensity > 0 && look.exposure > 0)
    assert.ok(look.fog.near < look.fog.far)
    assert.equal(look.sun.direction.length, 3)
    assert.ok(look.contact.opacity > 0 && look.contact.opacity < 1 && look.contact.scale >= 1)
  }
  assert.throws(() => { 'use strict'; TERRAIN.sky = 0 }, TypeError)
})

test('Lambert: troca o Standard preservando textura, cor, faces planas e emissivo; o que já é Lambert passa direto', () => {
  const map = new THREE.Texture()
  const standard = new THREE.MeshStandardMaterial({ map, color: 0x336699, flatShading: true, emissive: 0x221100, emissiveIntensity: 0.5, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  const lambert = toLambert(standard)
  assert.equal(lambert.isMeshLambertMaterial, true)
  assert.equal(lambert.map, map)
  assert.equal(lambert.color.getHex(), standard.color.getHex())
  assert.equal(lambert.flatShading, true)
  assert.equal(lambert.emissiveIntensity, 0.5)
  assert.equal(lambert.transparent, true)
  assert.equal(lambert.opacity, 0.8)
  assert.equal(lambert.side, THREE.DoubleSide)
  const already = new THREE.MeshLambertMaterial()
  assert.equal(toLambert(already), already)
})

test('Lambert: a cena é convertida uma vez por material de origem, inclusive com vários materiais por malha', () => {
  const shared = new THREE.MeshStandardMaterial({ color: 0xff0000 })
  const other = new THREE.MeshStandardMaterial({ color: 0x00ff00 })
  const geometry = new THREE.BoxGeometry()
  const root = new THREE.Group()
  const a = new THREE.Mesh(geometry, shared), b = new THREE.Mesh(geometry, [shared, other])
  root.add(a, b)
  toLambertScene(root)
  assert.equal(a.material.isMeshLambertMaterial, true)
  assert.equal(b.material[0], a.material) // o compartilhado continua compartilhado
  assert.equal(b.material[1].isMeshLambertMaterial, true)
  assert.equal(b.material[1].color.getHex(), 0x00ff00)
})

test('degradê de base: mexe só no shader do Lambert, uma vez, e o programa é o mesmo para todos', () => {
  const ground = new THREE.Color(TERRAIN.ground)
  const options = { ground, range: TERRAIN.groundFade, baseY: 0.065 }
  const one = applyGroundBlend(new THREE.MeshLambertMaterial(), options)
  const two = applyGroundBlend(new THREE.MeshLambertMaterial(), options)
  assert.equal(one.customProgramCacheKey(), two.customProgramCacheKey())
  const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <begin_vertex>\n}', fragmentShader: 'void main() {\n#include <map_fragment>\n}' }
  one.onBeforeCompile(shader)
  assert.match(shader.vertexShader, /vGroundY = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.y/)
  assert.match(shader.fragmentShader, /mix\(uGroundColor, diffuseColor\.rgb, smoothstep\(uGroundRange\.x, uGroundRange\.y, vGroundY\)\)/)
  assert.equal(shader.uniforms.uGroundColor.value, ground) // cor compartilhada: mudar uma vez vale para todos
  assert.deepEqual(shader.uniforms.uGroundRange.value, [0.065 + TERRAIN.groundFade.from, 0.065 + TERRAIN.groundFade.to])
  const hook = one.onBeforeCompile
  applyGroundBlend(one, options)
  assert.equal(one.onBeforeCompile, hook) // aplicar de novo não reescreve
})

test('degradê de base: sem cor de chão (região sem terreno) o material fica intacto', () => {
  const material = new THREE.MeshLambertMaterial()
  const hook = material.onBeforeCompile
  applyGroundBlend(material, { ground: null, range: { from: 0, to: 1 } })
  assert.equal(material.onBeforeCompile, hook)
  const root = new THREE.Group()
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial()]))
  applyGroundBlendTo(root, { ground: new THREE.Color(0x00ff00), range: { from: 0, to: 1 } })
  assert.ok(root.children[0].material.every(item => item.userData.__groundBlend))
})
