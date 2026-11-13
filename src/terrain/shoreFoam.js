// Espuma e ondinhas na beira d'água: um quad por ponto da costa, todos numa malha só (1 draw), que sobe da água
// para a areia e some, em ciclos defasados. Serve ao terreno real (shorePointsFromTerrain) e à ilha feita à mão.
import * as THREE from 'three'

const vertexShader = /* glsl */`
  attribute vec2 aDir;
  attribute float aPhase;
  attribute vec2 aCorner;
  uniform float uTime;
  varying vec2 vCorner;
  varying float vLife;
  #include <fog_pars_vertex>
  void main() {
    float life = fract(uTime * 0.2 + aPhase);
    vLife = life;
    vCorner = aCorner;
    vec3 moved = position;
    moved.xz += aDir * (life - 0.35) * 0.8;
    vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`

const fragmentShader = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vCorner;
  varying float vLife;
  #include <fog_pars_fragment>
  void main() {
    float across = 1.0 - smoothstep(0.45, 1.0, abs(vCorner.x));
    float front = 1.0 - smoothstep(0.2, 1.0, abs(vCorner.y));
    float alpha = across * front * sin(3.14159 * vLife) * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <fog_fragment>
  }`

/**
 * `points`: [{ x, y, z, dx, dz }] — posição na água junto à costa e a direção (unitária) para a terra.
 * Devolve { mesh, update(tempo), dispose() }.
 */
export function createShoreFoam(points, { width = 1.2, depth = 0.45, opacity = 0.85, color = 0xffffff } = {}) {
  const count = points.length
  const position = new Float32Array(count * 12), dir = new Float32Array(count * 8)
  const phase = new Float32Array(count * 4), corner = new Float32Array(count * 8)
  const index = new Uint32Array(count * 6)
  points.forEach((point, n) => {
    // Eixo ao longo da costa (perpendicular à direção da terra) e ao longo da onda.
    const sideX = -point.dz * width / 2, sideZ = point.dx * width / 2
    const alongX = point.dx * depth / 2, alongZ = point.dz * depth / 2
    // Fase por posição: vizinhos quase juntos, então a onda chega como uma linha que ondula.
    const wave = (Math.sin(point.x * 0.37) + Math.sin(point.z * 0.29 + 1.3)) * 0.12 + ((n * 0.6180339) % 1) * 0.08
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    corners.forEach(([s, a], k) => {
      const v = n * 4 + k
      position.set([point.x + sideX * s + alongX * a, point.y, point.z + sideZ * s + alongZ * a], v * 3)
      dir.set([point.dx, point.dz], v * 2)
      phase[v] = wave
      corner.set([s, a], v * 2)
    })
    index.set([n * 4, n * 4 + 2, n * 4 + 1, n * 4, n * 4 + 3, n * 4 + 2], n * 6)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dir, 2))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.computeBoundingSphere()
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
    }]),
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Espuma da beira d\'água'
  mesh.renderOrder = 1
  return {
    mesh,
    update(time) { material.uniforms.uTime.value = time },
    dispose() { geometry.dispose(); material.dispose() },
  }
}

/**
 * Pontos da costa do terreno real (dados de createTerrainData): amostras de mar com terra numa das 8 vizinhas,
 * dentro de `radius` de (cx, cz) quando dado. A direção aponta para a média das vizinhas de terra.
 */
export function shorePointsFromTerrain(data, { cx = 0, cz = 0, radius = Infinity } = {}) {
  const { size, spacing, originX, originZ, isSea } = data.grid
  // Um pouco acima do mar: a areia da beira desce devagar até ele e esconderia a espuma rente à água.
  const y = data.seaY + 0.06
  const points = []
  for (let j = 1; j < size - 1; j++) {
    const z = originZ + j * spacing
    for (let i = 1; i < size - 1; i++) {
      if (!isSea[j * size + i]) continue
      const x = originX + i * spacing
      if (Math.hypot(x - cx, z - cz) > radius) continue
      let dx = 0, dz = 0
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        if ((a || b) && !isSea[(j + b) * size + i + a]) { dx += a; dz += b }
      }
      const length = Math.hypot(dx, dz)
      if (!length) continue
      // Meia amostra para o lado do mar, onde a água já está plana.
      points.push({ x: x - dx / length * spacing * 0.5, y, z: z - dz / length * spacing * 0.5, dx: dx / length, dz: dz / length })
    }
  }
  return points
}
