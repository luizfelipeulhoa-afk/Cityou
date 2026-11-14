// Caminhada procedural para personagens com esqueleto Mixamo (ossos `mixamorig*`), como o Fifo. O GLB vem em T-pose e
// sem nenhuma animação: aqui os ossos são girados por quadro, sem arquivo de animação.
//
// Cada osso recebe uma rotação extra no espaço do modelo (eixos do próprio GLB: +X é a esquerda do personagem, +Y é
// para cima, +Z é a frente), acumulada com a da cadeia de ossos acima dele: o antebraço acompanha o braço e a canela
// acompanha a coxa. Assim as rotações não dependem dos eixos locais de cada osso, que mudam de rig para rig.
import * as THREE from 'three'

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1)
const degrees = value => value * Math.PI / 180
const rotation = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle)
const smooth = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt))

// Rotação do osso `parent` até a raiz do modelo, no estado em que o GLB foi lido (a T-pose).
function bindQuaternion(object, root) {
  const chain = []
  for (let node = object; node && node !== root; node = node.parent) chain.unshift(node.quaternion.clone())
  return chain.reduce((total, local) => total.multiply(local), new THREE.Quaternion())
}

// Os pesos de pele do GLB do Tripo vêm embaralhados (o tronco segue o polegar, as pernas seguem o braço): ficam certos
// na T-pose, que é a única coisa que se vê sem animação, e viram um bagunça assim que um osso gira. Aqui os pesos são
// refeitos a partir da posição de cada vértice na T-pose: cada osso tem um segmento (da sua articulação à próxima) e o
// vértice segue os segmentos mais perto dele, em mistura suave. Como o peso depende só da posição, as nove peças em que
// o Tripo cortou o corpo (tronco, quadril, pernas, braços) continuam emendadas, sem fresta, quando o osso gira.
const SEGMENTS = [
  ['Hips', 'Hips', 'Spine'], ['Spine', 'Spine', 'Spine1'], ['Spine1', 'Spine1', 'Spine2'], ['Spine2', 'Spine2', 'Neck'],
  ['Neck', 'Neck', 'Head'], ['Head', 'Head', 'HeadTop_End'],
  ...['Left', 'Right'].flatMap(side => [
    [`${side}Shoulder`, `${side}Shoulder`, `${side}Arm`], [`${side}Arm`, `${side}Arm`, `${side}ForeArm`],
    [`${side}ForeArm`, `${side}ForeArm`, `${side}Hand`], [`${side}Hand`, `${side}Hand`, `${side}HandMiddle4`],
    [`${side}UpLeg`, `${side}UpLeg`, `${side}Leg`], [`${side}Leg`, `${side}Leg`, `${side}Foot`],
    [`${side}Foot`, `${side}Foot`, `${side}ToeBase`], [`${side}Foot`, `${side}ToeBase`, `${side}Toe_End`],
  ]),
]

function distanceToSegment(point, a, b, scratch) {
  scratch.copy(b).sub(a)
  const length = scratch.lengthSq()
  const t = length > 1e-10 ? Math.min(1, Math.max(0, point.clone().sub(a).dot(scratch) / length)) : 0
  return point.distanceTo(scratch.multiplyScalar(t).add(a))
}

export function skinByProximity(root, bones) {
  const skinned = []
  root.traverse(object => { if (object.isSkinnedMesh) skinned.push(object) })
  const reference = skinned[0]?.skeleton
  if (!reference) return false
  const indexOf = new Map(reference.bones.map((bone, index) => [bone.name.replace(/^mixamorig:?/, ''), index]))
  const world = new Map()
  for (const [name, bone] of bones) world.set(name, bone.getWorldPosition(new THREE.Vector3()))
  const segments = SEGMENTS.filter(([bone, from, to]) => indexOf.has(bone) && world.has(from) && world.has(to))
    .map(([bone, from, to]) => ({ index: indexOf.get(bone), a: world.get(from), b: world.get(to) }))
  const point = new THREE.Vector3(), scratch = new THREE.Vector3()
  for (const mesh of skinned) {
    const position = mesh.geometry.attributes.position
    const indices = new Uint16Array(position.count * 4), weights = new Float32Array(position.count * 4)
    const candidates = segments.map(segment => ({ segment, distance: 0 }))
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      for (const candidate of candidates) candidate.distance = distanceToSegment(point, candidate.segment.a, candidate.segment.b, scratch)
      const near = candidates.slice().sort((x, y) => x.distance - y.distance)
      const nearest = near[0].distance
      // Só entram os segmentos quase tão perto quanto o mais perto: o quadril não puxa a pele do braço.
      const mix = new Map()
      for (const { segment, distance } of near.slice(0, 4)) {
        if (distance > nearest * 1.7 + 0.012) continue
        const weight = 1 / (distance * distance + 0.0004) ** 2
        mix.set(segment.index, (mix.get(segment.index) ?? 0) + weight)
      }
      const total = [...mix.values()].reduce((sum, value) => sum + value, 0)
      let slot = 0
      for (const [index, weight] of mix) { indices[i * 4 + slot] = index; weights[i * 4 + slot] = weight / total; slot++ }
    }
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
  }
  return true
}

/**
 * `root`: a cena do GLB, com o esqueleto dentro. `options.stepLength`: distância, na unidade do modelo, que o pé
 * percorre num passo (o que, junto com a velocidade, define o ritmo da perna). Devolve null sem esqueleto Mixamo.
 */
export function createWalkRig(root, { stepLength = 0.48 } = {}) {
  root.updateMatrixWorld(true)
  const bones = new Map()
  root.traverse(object => { if (object.isBone) bones.set(object.name.replace(/^mixamorig:?/, ''), object) })
  if (!bones.has('Hips') || !bones.has('LeftUpLeg') || !bones.has('RightUpLeg') || !bones.has('LeftArm')) return null

  skinByProximity(root, bones)

  // Todos os ossos, do quadril para as pontas, com a rotação de repouso e a posição original.
  const entries = []
  const byObject = new Map()
  const visit = bone => {
    const parent = byObject.get(bone.parent) ?? null
    const entry = { name: bone.name.replace(/^mixamorig:?/, ''), bone, parent, bind: bindQuaternion(bone, root), delta: new THREE.Quaternion(), home: bone.position.clone() }
    entries.push(entry)
    byObject.set(bone, entry)
    for (const child of bone.children) if (child.isBone) visit(child)
  }
  visit(bones.get('Hips'))
  const fixedParent = bindQuaternion(bones.get('Hips').parent, root) // o Armature, que não se mexe
  const extras = new Map()
  const hips = byObject.get(bones.get('Hips'))

  const state = { phase: 0, walk: 0, time: 0 }
  const tmp = new THREE.Quaternion(), parentWorld = new THREE.Quaternion(), world = new THREE.Quaternion()

  function applyPose() {
    for (const entry of entries) {
      const extra = extras.get(entry.name)
      entry.delta.copy(extra ?? tmp.identity())
      if (entry.parent) entry.delta.multiply(entry.parent.delta)
      // delta = extra × delta do pai (a do pai vale primeiro): a rotação do osso é no espaço do modelo.
      world.copy(entry.delta).multiply(entry.bind)
      if (entry.parent) parentWorld.copy(entry.parent.delta).multiply(entry.parent.bind)
      else parentWorld.copy(fixedParent)
      entry.bone.quaternion.copy(parentWorld).invert().multiply(world)
    }
    extras.clear()
  }

  const set = (name, quaternion) => extras.set(name, quaternion)

  return {
    /** Fase da passada, de 0 a 2π (uma passada completa, os dois passos). */
    get phase() { return state.phase },
    /**
     * `dt` em segundos; `speed` é a velocidade do passeio na unidade do modelo por segundo (0 parado); `scale`, quanto o
     * modelo foi escalado na cena (para o passo acompanhar o chão e o pé não deslizar).
     */
    update(dt, speed = 0, scale = 1) {
      const moving = speed > 0.001
      state.walk = smooth(state.walk, moving ? 1 : 0, moving ? 9 : 7, dt)
      if (moving) state.phase = (state.phase + dt * Math.PI * (speed / scale) / stepLength) % (Math.PI * 2)
      state.time += dt
      const w = state.walk, phase = state.phase
      const breathe = Math.sin(state.time * 1.6) * (1 - w)

      // Pernas: a esquerda no ritmo da fase, a direita meio ciclo depois.
      for (const [side, offset] of [['Left', 0], ['Right', Math.PI]]) {
        const p = phase + offset
        const swing = degrees(27) * Math.sin(p) * w // + = coxa para a frente
        const knee = (degrees(7) + degrees(48) * Math.max(0, Math.cos(p))) * w // + = canela para trás
        set(`${side}UpLeg`, rotation(X, -swing))
        set(`${side}Leg`, rotation(X, knee))
        // O pé acompanha o chão: desfaz parte do que a coxa e a canela giraram.
        set(`${side}Foot`, rotation(X, (swing - knee) * 0.75 + degrees(8) * Math.sin(p - 0.8) * w))
      }

      // Braços: descem da T-pose (a esquerda do personagem é +X), balançam contra a perna do mesmo lado e dobram o cotovelo.
      for (const [side, sign, offset] of [['Left', -1, Math.PI], ['Right', 1, 0]]) {
        const p = phase + offset
        const forward = Math.sin(p) // + = braço para a frente
        const lower = rotation(Z, sign * degrees(78))
        const swing = rotation(X, -degrees(22) * forward * w)
        set(`${side}Arm`, swing.multiply(lower))
        set(`${side}ForeArm`, rotation(X, -(degrees(8) + degrees(14) * Math.max(0, forward) * w)))
        set(`${side}Hand`, rotation(X, -degrees(6)))
      }

      // Tronco: o quadril gira com a perna que vai à frente e os ombros contra ele; inclina de leve para a frente e respira parado.
      const twist = Math.sin(phase) * degrees(5) * w // + = quadril esquerdo à frente
      set('Hips', rotation(Y, -twist * 0.9).multiply(rotation(Z, Math.sin(phase) * degrees(2.2) * w)))
      set('Spine', rotation(Y, twist * 0.6).multiply(rotation(X, degrees(3.5) * w)))
      set('Spine1', rotation(Y, twist * 0.5))
      set('Spine2', rotation(Y, twist * 0.4).multiply(rotation(X, degrees(1.2) * breathe)))
      set('Head', rotation(Y, -twist * 0.6).multiply(rotation(X, -degrees(2) * w)))

      applyPose()
      // O quadril sobe e desce duas vezes por passada, e dá um leve balanço de lado.
      hips.bone.position.set(hips.home.x + Math.sin(phase) * 0.006 * w, hips.home.y + Math.cos(phase * 2) * 0.011 * w - 0.01 * w, hips.home.z)
    },
  }
}
