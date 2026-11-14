// A caminhada procedural (src/fifones/characterRig.js) num esqueleto Mixamo mínimo montado aqui: pesos de pele refeitos
// por proximidade, pernas e braços em oposição, braços fora da T-pose, pé parado quando a velocidade é zero.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createWalkRig } from '../src/fifones/characterRig.js'

// Um boneco de pé, olhando para +Z, com os braços abertos em T (a esquerda do personagem é +X), no formato do GLB do Fifo.
function humanoid() {
  const make = (name, x, y, z, parent) => {
    const bone = new THREE.Bone()
    bone.name = `mixamorig${name}`
    bone.position.set(x, y, z)
    if (parent) parent.add(bone)
    return bone
  }
  const world = new Map()
  const bone = (name, x, y, z, parent) => {
    const created = make(name, x - (parent ? world.get(parent).x : 0), y - (parent ? world.get(parent).y : 0), z - (parent ? world.get(parent).z : 0), parent)
    world.set(created, new THREE.Vector3(x, y, z))
    return created
  }
  const hips = bone('Hips', 0, 0.52, 0)
  const spine = bone('Spine', 0, 0.55, 0, hips), spine1 = bone('Spine1', 0, 0.6, 0, spine), spine2 = bone('Spine2', 0, 0.66, 0, spine1)
  const neck = bone('Neck', 0, 0.81, 0, spine2), head = bone('Head', 0, 0.87, 0, neck)
  bone('HeadTop_End', 0, 1, 0, head)
  const chain = []
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    const shoulder = bone(`${side}Shoulder`, sign * 0.03, 0.775, 0, spine2)
    const arm = bone(`${side}Arm`, sign * 0.11, 0.767, 0, shoulder)
    const forearm = bone(`${side}ForeArm`, sign * 0.25, 0.756, 0, arm)
    const hand = bone(`${side}Hand`, sign * 0.37, 0.748, 0, forearm)
    bone(`${side}HandMiddle4`, sign * 0.49, 0.74, 0, hand)
    const upLeg = bone(`${side}UpLeg`, sign * 0.055, 0.494, 0, hips)
    const leg = bone(`${side}Leg`, sign * 0.085, 0.278, 0, upLeg)
    const foot = bone(`${side}Foot`, sign * 0.11, 0.06, 0, leg)
    const toe = bone(`${side}ToeBase`, sign * 0.13, 0.016, 0.06, foot)
    bone(`${side}Toe_End`, sign * 0.14, 0.016, 0.09, toe)
    chain.push(arm, upLeg)
  }
  const bones = []
  hips.traverse(object => { if (object.isBone) bones.push(object) })
  const armature = new THREE.Object3D()
  armature.add(hips)
  const root = new THREE.Group()
  root.add(armature)
  root.updateMatrixWorld(true)
  // Uma peça de pele: um vértice na coxa esquerda, outro na direita, outro na ponta da mão esquerda e outro no peito.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0.06, 0.4, 0, -0.06, 0.4, 0, 0.45, 0.745, 0, 0, 0.7, 0.06], 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(16), 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4))
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
  mesh.bind(new THREE.Skeleton(bones))
  root.add(mesh)
  root.updateMatrixWorld(true)
  return { root, mesh, bones, find: name => bones.find(object => object.name === `mixamorig${name}`) }
}

const worldPosition = object => object.getWorldPosition(new THREE.Vector3())

test('sem esqueleto Mixamo não há caminhada', () => {
  assert.equal(createWalkRig(new THREE.Group()), null)
})

test('pele: os pesos são refeitos por proximidade e cada vértice segue o osso do lugar onde está', () => {
  const { root, mesh, bones } = humanoid()
  createWalkRig(root)
  const index = mesh.geometry.attributes.skinIndex, weight = mesh.geometry.attributes.skinWeight
  const dominant = vertex => {
    let best = 0
    for (let k = 1; k < 4; k++) if (weight.getComponent(vertex, k) > weight.getComponent(vertex, best)) best = k
    return bones[index.getComponent(vertex, best)].name.replace('mixamorig', '')
  }
  for (let v = 0; v < 4; v++) {
    const sum = [0, 1, 2, 3].reduce((total, k) => total + weight.getComponent(v, k), 0)
    assert.ok(Math.abs(sum - 1) < 1e-5, `vértice ${v}: pesos somam ${sum}`)
  }
  assert.equal(dominant(0), 'LeftUpLeg')
  assert.equal(dominant(1), 'RightUpLeg')
  assert.equal(dominant(2), 'LeftHand')
  assert.match(dominant(3), /^Spine/)
})

test('parado, os braços descem da T-pose e as pernas ficam quietas; andando, pernas e braços alternam', () => {
  const { root, find } = humanoid()
  const rig = createWalkRig(root, { stepLength: 0.48 })
  const handY = () => { root.updateMatrixWorld(true); return worldPosition(find('LeftHand')).y }
  const tall = handY()
  for (let i = 0; i < 30; i++) rig.update(1 / 30, 0, 1)
  assert.ok(handY() < tall - 0.2, 'a mão não desceu da altura do ombro')
  const footZ = () => { root.updateMatrixWorld(true); return [worldPosition(find('LeftFoot')).z, worldPosition(find('RightFoot')).z] }
  const [leftStill, rightStill] = footZ()
  rig.update(1 / 30, 0, 1)
  assert.ok(Math.abs(footZ()[0] - leftStill) < 1e-4 && Math.abs(footZ()[1] - rightStill) < 1e-4, 'parado, o pé mexeu')
  // Andando: ao longo de uma passada cada pé vai e volta, e quando um está à frente o outro está atrás.
  const left = [], right = [], handsLeft = [], handsRight = []
  for (let i = 0; i < 240; i++) {
    rig.update(1 / 60, 0.55, 1)
    root.updateMatrixWorld(true)
    left.push(worldPosition(find('LeftFoot')).z)
    right.push(worldPosition(find('RightFoot')).z)
    handsLeft.push(worldPosition(find('LeftHand')).z)
    handsRight.push(worldPosition(find('RightHand')).z)
  }
  const span = values => Math.max(...values) - Math.min(...values)
  assert.ok(span(left) > 0.12 && span(right) > 0.12, `passo curto: ${span(left).toFixed(3)}`)
  assert.ok(span(handsLeft) > 0.05 && span(handsRight) > 0.05, 'braços parados')
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length
  const covariance = (a, b) => mean(a.map((value, i) => (value - mean(a)) * (b[i] - mean(b))))
  assert.ok(covariance(left, right) < 0, 'as pernas deviam estar em oposição')
  assert.ok(covariance(left, handsLeft) < 0, 'o braço devia ir contra a perna do mesmo lado')
  // O pé acompanha o chão: o ritmo da passada segue a velocidade (mais lento, menos passos).
  const slow = createWalkRig(humanoid().root, { stepLength: 0.48 })
  const fast = createWalkRig(humanoid().root, { stepLength: 0.48 })
  for (let i = 0; i < 30; i++) { slow.update(1 / 30, 0.2, 1); fast.update(1 / 30, 0.6, 1) }
  assert.ok(fast.phase !== slow.phase)
})
