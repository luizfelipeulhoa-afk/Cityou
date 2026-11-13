import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { applyGlbMaterial, applyGlbStyle } from '../src/tres/glbMaterial.js'

test('GLB: material PBR fica com faces planas, sem metal e todo rugoso, e é recompilado', () => {
  const orm = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.3, metalnessMap: orm, roughnessMap: orm })
  const before = material.version
  assert.equal(applyGlbMaterial(material), material)
  assert.equal(material.flatShading, true)
  assert.equal(material.metalness, 0)
  assert.equal(material.roughness, 1)
  // Sem os mapas: com eles, o valor final seria o fator vezes a textura.
  assert.equal(material.metalnessMap, null)
  assert.equal(material.roughnessMap, null)
  assert.equal(material.version, before + 1) // needsUpdate = true
})

test('GLB: material sem metal nem rugosidade só ganha faces planas', () => {
  const material = applyGlbMaterial(new THREE.MeshLambertMaterial())
  assert.equal(material.flatShading, true)
  assert.equal('metalness' in material, false)
  assert.equal('roughness' in material, false)
})

test('GLB: a cena inteira é tratada, uma vez por material, inclusive malhas com vários materiais', () => {
  const shared = new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.2 })
  const extra = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.9 })
  const geometry = new THREE.BoxGeometry()
  const root = new THREE.Group()
  const nested = new THREE.Group()
  nested.add(new THREE.Mesh(geometry, [shared, extra]))
  root.add(new THREE.Mesh(geometry, shared), nested, new THREE.Group())
  const versions = [shared.version, extra.version]
  assert.equal(applyGlbStyle(root), root)
  for (const material of [shared, extra]) {
    assert.deepEqual([material.flatShading, material.metalness, material.roughness], [true, 0, 1])
  }
  assert.deepEqual([shared.version, extra.version], [versions[0] + 1, versions[1] + 1])
})
