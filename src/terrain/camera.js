// Limites da câmera sobre o terreno e a névoa que esconde a borda do cenário. Sem three: só contas, para o
// teste percorrer os limites no Node com as mesmas funções que a página usa.
//
// A borda do cenário nunca aparece porque a névoa tem a cor do céu e chega a 100% antes dela. A distância
// final da névoa é calculada, não estimada: é a menor profundidade (a mesma medida que o three usa na névoa)
// dos trechos de borda com terra que estão dentro do campo de visão.

const RAD = Math.PI / 180

export const CAMERA_DEFAULTS = {
  fov: 35, // vertical, em graus: o mesmo da cidade
  minDistance: 12,
  maxDistance: 90,
  minPolar: 0.2, // radianos a partir da vertical
  maxPolar: 78 * RAD,
  clearance: 1.2, // altura mínima da câmera sobre o terreno
  fogStart: 0.55, // a névoa começa nesta fração da distância final
  maxFog: 300, // distância final quando nenhuma borda com terra está à vista
  near: 0.5,
  far: 2400,
}

export function cameraLimits(data) {
  return { ...CAMERA_DEFAULTS, ...data.region.camera }
}

// Recorta um polígono convexo, em coordenadas da câmera [a, b, c] (direita, cima, profundidade), por g(p) >= 0.
function clip(polygon, g) {
  const out = []
  for (let k = 0; k < polygon.length; k++) {
    const current = polygon[k], next = polygon[(k + 1) % polygon.length]
    const gc = g(current), gn = g(next)
    if (gc >= 0) out.push(current)
    if ((gc >= 0) !== (gn >= 0)) {
      const t = gc / (gc - gn)
      out.push([current[0] + (next[0] - current[0]) * t, current[1] + (next[1] - current[1]) * t, current[2] + (next[2] - current[2]) * t])
    }
  }
  return out
}

/** Base da câmera: frente, direita e cima, para uma câmera em `position` olhando para `target`. */
function basis(position, target) {
  let fx = target[0] - position[0], fy = target[1] - position[1], fz = target[2] - position[2]
  const length = Math.hypot(fx, fy, fz) || 1
  fx /= length; fy /= length; fz /= length
  let rx = -fz, rz = fx // frente × (0, 1, 0)
  const flat = Math.hypot(rx, rz)
  if (flat < 1e-9) { rx = 1; rz = 0 }
  else { rx /= flat; rz /= flat }
  // cima = direita × frente
  return { f: [fx, fy, fz], r: [rx, 0, rz], u: [-rz * fy, rz * fx - rx * fz, rx * fy] }
}

/**
 * Menor profundidade, dentro do campo de visão, dos trechos de borda do cenário que têm terra.
 * Infinity quando nenhum está à vista. `pose` = { position: [x, y, z], target: [x, y, z], fov, aspect }.
 */
export function edgeDepth(data, pose) {
  const { f, r, u } = basis(pose.position, pose.target)
  const tv = Math.tan(pose.fov * RAD / 2), th = tv * pose.aspect
  const toCamera = (x, y, z) => {
    const dx = x - pose.position[0], dy = y - pose.position[1], dz = z - pose.position[2]
    return [dx * r[0] + dz * r[2], dx * u[0] + dy * u[1] + dz * u[2], dx * f[0] + dy * f[1] + dz * f[2]]
  }
  let nearest = Infinity
  for (const wall of data.walls) {
    let polygon = [
      toCamera(wall.x1, data.seaY, wall.z1), toCamera(wall.x2, data.seaY, wall.z2),
      toCamera(wall.x2, wall.top, wall.z2), toCamera(wall.x1, wall.top, wall.z1),
    ]
    polygon = clip(polygon, p => p[2] - 1e-3)
    polygon = clip(polygon, p => p[2] * th - p[0])
    polygon = clip(polygon, p => p[2] * th + p[0])
    polygon = clip(polygon, p => p[2] * tv - p[1])
    polygon = clip(polygon, p => p[2] * tv + p[1])
    for (const point of polygon) if (point[2] < nearest) nearest = point[2]
  }
  return nearest
}

/** Névoa para uma pose: `{ near, far }`. Além de `far` tudo tem a cor do céu, e a borda fica sempre além. */
export function fogFor(data, limits, pose) {
  const far = Math.max(1, Math.min(limits.maxFog, edgeDepth(data, pose) - 0.5))
  return { near: far * limits.fogStart, far }
}

/**
 * Aplica os limites a uma câmera de órbita, depois de controls.update(): o alvo fica na zona jogável (e a câmera
 * acompanha), a câmera fica acima do terreno e a névoa é ajustada. `camera.position`, `target` e `fog` só
 * precisam ter x/y/z e near/far: servem os objetos do three.
 */
export function constrainCamera(data, limits, camera, target, fog) {
  const allowed = data.lots.clampToPlayable(target.x, target.z)
  const dx = allowed.x - target.x, dz = allowed.z - target.z
  if (dx || dz || target.y) {
    camera.position.x += dx
    camera.position.z += dz
    camera.position.y -= target.y
    target.x = allowed.x
    target.z = allowed.z
    target.y = 0
  }
  const floor = Math.max(data.getHeightAt(camera.position.x, camera.position.z), data.seaY) + limits.clearance
  if (camera.position.y < floor) camera.position.y = floor
  if (fog) {
    const { near, far } = fogFor(data, limits, {
      position: [camera.position.x, camera.position.y, camera.position.z], target: [target.x, target.y, target.z],
      fov: camera.fov, aspect: camera.aspect,
    })
    fog.near = near
    fog.far = far
  }
}

/** Posição da câmera de órbita para um alvo, um azimute, um ângulo polar (a partir da vertical) e uma distância. */
export function orbitPosition(target, azimuth, polar, distance) {
  return [
    target[0] + distance * Math.sin(polar) * Math.sin(azimuth),
    target[1] + distance * Math.cos(polar),
    target[2] + distance * Math.sin(polar) * Math.cos(azimuth),
  ]
}
