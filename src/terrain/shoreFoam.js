// Ondas que chegam na beira d'água: uma malha só (1 draw) com um quad por ponto da costa, sobre a água e a areia
// molhada, desenhados por um fragment shader. Cada onda vem de dentro do mar com uma crista fina de espuma de borda
// irregular (ruído em coordenadas do mundo) e um rastro rendado atrás dela, sobe na areia como uma lâmina de água
// que avança, para e recua, e deixa a areia molhada (mais escura) que seca até a próxima onda. A fase varia
// devagar ao longo da costa: as ondas chegam em frentes paralelas à praia, não todas ao mesmo tempo.
// Serve ao terreno real (shorePointsFromTerrain) e à ilha feita à mão.
import * as THREE from 'three'

// Distâncias, em unidades da cena, na direção da terra (s > 0): quanto do mar o quad cobre e quanto da areia.
const SEA_SIDE = 1.5
const LAND_SIDE = 0.8

const vertexShader = /* glsl */`
  attribute float aPhase;
  attribute vec2 aCorner; // x: ao longo da costa (-1 a 1), y: s, distância à linha da costa na direção da terra
  uniform float uTime;
  varying float vLife;
  varying vec2 vCorner;
  varying vec2 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vLife = fract(uTime * 0.16 + aPhase);
    vCorner = aCorner;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`

const fragmentShader = /* glsl */`
  uniform vec3 uFoam;
  uniform vec3 uSheet;
  uniform vec3 uWet;
  uniform float uOpacity;
  varying float vLife;
  varying vec2 vCorner;
  varying vec2 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float easeOut(float t) { return 1.0 - (1.0 - t) * (1.0 - t); }

  // Posição da frente da onda na direção da terra: chega do mar, quebra na linha da costa, sobe na areia e recua.
  float front(float life) {
    if (life < 0.55) return mix(-1.2, 0.0, easeOut(life / 0.55));
    if (life < 0.8) return mix(0.0, 0.5, easeOut((life - 0.55) / 0.25));
    float t = (life - 0.8) / 0.2;
    return mix(0.5, -0.04, t * t);
  }
  // Areia molhada: some devagar entre uma onda e a seguinte (contínua na virada do ciclo).
  float wetness(float life) {
    if (life < 0.4) return 0.14 * (1.0 - life / 0.4);
    if (life < 0.55) return 0.0;
    if (life < 0.8) return 0.4 * easeOut((life - 0.55) / 0.25);
    return mix(0.4, 0.14, (life - 0.8) / 0.2);
  }

  void main() {
    float s = vCorner.y;
    float life = vLife;
    float f = front(life);
    // Borda irregular: o ruído estica a frente para um lado e para o outro, e anda devagar com a onda.
    float ragged = (noise(vWorld * 2.6 + vec2(life * 1.5, 0.0)) - 0.5) * 0.22;
    float dist = s - f + ragged;

    // Crista: uma linha fina e clara na frente, mais forte quando a onda quebra.
    float grow = smoothstep(0.0, 0.35, life) * (1.0 - smoothstep(0.82, 1.0, life));
    float crest = (1.0 - smoothstep(0.0, 0.085, abs(dist + 0.02))) * grow;
    // Rastro de espuma atrás da crista, rendado, que se alarga ao quebrar.
    float trailLength = mix(0.25, 0.7, smoothstep(0.25, 0.6, life));
    float lace = noise(vWorld * 5.5 + vec2(0.0, life * 0.8)) * 0.65 + noise(vWorld * 11.0 - 7.3) * 0.35;
    float trail = smoothstep(-trailLength, -0.03, dist) * (1.0 - smoothstep(-0.03, 0.0, dist));
    trail *= smoothstep(0.42, 0.7, lace + (trail - 0.5) * 0.35) * grow * 0.85;
    float foam = clamp(crest + trail, 0.0, 1.0);

    // Lâmina de água sobre a areia: da linha da costa até a frente, enquanto a onda sobe e recua.
    float sheetOn = smoothstep(0.52, 0.62, life) * (1.0 - smoothstep(0.88, 1.0, life));
    float sheet = sheetOn * step(dist, 0.0) * step(-0.04, s) * (0.3 - 0.12 * clamp(s / max(f, 0.05), 0.0, 1.0));
    // Areia molhada: faixa escura entre a costa e o alcance máximo da onda.
    float wet = wetness(life) * smoothstep(-0.06, 0.02, s) * (1.0 - smoothstep(0.42, 0.7, s));

    float across = 1.0 - smoothstep(0.55, 1.0, abs(vCorner.x));
    float alphaWet = wet * 0.55 * across;
    float alphaSheet = sheet * across;
    float alphaFoam = foam * across * uOpacity;
    float alpha = 1.0 - (1.0 - alphaFoam) * (1.0 - alphaSheet) * (1.0 - alphaWet);
    if (alpha < 0.01) discard;
    vec3 under = mix(uWet, uSheet, alphaSheet / max(alphaSheet + alphaWet, 0.001));
    vec3 color = mix(under, uFoam, alphaFoam / max(alpha, 0.001));
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
  }`

/**
 * `points`: [{ x, y, z, dx, dz }] — posição na água junto à costa e a direção (unitária) para a terra.
 * `heightAt(x, z)` (opcional): altura do chão; o quad acompanha a areia, que desce até o mar, para a água subir nela.
 * Devolve { mesh, update(tempo), dispose() }.
 */
export function createShoreFoam(points, { width = 1.5, opacity = 0.9, heightAt } = {}) {
  const count = points.length
  const position = new Float32Array(count * 12), phase = new Float32Array(count * 4), corner = new Float32Array(count * 8)
  const index = new Uint32Array(count * 6)
  points.forEach((point, n) => {
    // Fase suave ao longo da costa: a frente da onda é uma linha só, que ondula, e cada ponto adianta ou atrasa um pouco.
    const wave = (Math.sin(point.x * 0.21 + point.z * 0.13) + 1) * 0.07 + (Math.sin(point.x * 0.9 - point.z * 0.7) + 1) * 0.015
    const sideX = -point.dz * width / 2, sideZ = point.dx * width / 2
    ;[[-1, -SEA_SIDE], [1, -SEA_SIDE], [1, LAND_SIDE], [-1, LAND_SIDE]].forEach(([side, s], k) => {
      const x = point.x + sideX * side + point.dx * s, z = point.z + sideZ * side + point.dz * s
      const floor = heightAt ? heightAt(x, z) + 0.025 : -Infinity
      position.set([x, Math.max(point.y, floor), z], (n * 4 + k) * 3)
      phase[n * 4 + k] = wave
      corner.set([side, s], (n * 4 + k) * 2)
    })
    index.set([n * 4, n * 4 + 2, n * 4 + 1, n * 4, n * 4 + 3, n * 4 + 2], n * 6)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.computeBoundingSphere()
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uOpacity: { value: opacity },
      uFoam: { value: new THREE.Color(0xffffff) }, uSheet: { value: new THREE.Color(0xd9f3ee) }, uWet: { value: new THREE.Color(0xa88a5c) },
    }]),
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Ondas da beira d\'água'
  mesh.renderOrder = 1
  mesh.frustumCulled = false
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
  // Um pouco acima do mar: a areia da beira desce devagar até ele e esconderia a onda rente à água.
  const y = data.seaY + 0.05
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
      // A linha da costa é a última fileira de amostras de mar: dali para a terra a areia sobe devagar.
      points.push({ x, y, z, dx: dx / length, dz: dz / length })
    }
  }
  return points
}
