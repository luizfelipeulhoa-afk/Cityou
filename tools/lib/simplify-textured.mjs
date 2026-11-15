// Redutor de malha com textura (colapso de arestas guiado por quádricas), sem dependências.
// Serve aos GLB do Tripo, cujas malhas têm 150 a 190 mil triângulos e muitas costuras de textura.
//
// Como lida com a textura: a decisão de colapsar é tomada na malha soldada por posição (as costuras não viram
// buracos), mas cada canto de triângulo guarda a sua própria coordenada UV. Ao colapsar a aresta u→v, o canto de
// u em cada triângulo que sobra recebe o UV que v tem NA MESMA ILHA de textura (o UV do triângulo removido que
// compartilha o mesmo UV de u). Se alguma ilha não tem esse par (u fica numa junção de ilhas), o canto mantém o
// UV antigo e a aresta paga uma multa proporcional à área afetada, então esses colapsos ficam para o fim.
// Rejeita colapsos que invertem um triângulo no espaço ou no espaço da textura, e os que deixam a malha com estrangulamentos (não manifold).
// A posição final é sempre a de um dos dois extremos (sem posição ótima: ela não teria UV).

const EPS = 1e-9

/**
 * @param positions Float32Array de x,y,z (um vértice por posição, repetido onde há costura)
 * @param uvs Float32Array de u,v, um par por vértice
 * @param indices Uint32Array/Uint16Array com três índices por triângulo
 * @param options.targetTriangles número de triângulos desejado
 * @param options.seamWeight peso da multa de costura (padrão 1)
 * @param options.flipLimit cosseno mínimo entre a normal de um triângulo antes e depois do colapso (padrão 0,2)
 * @param options.keepUvOrientation recusa colapsos que viram o triângulo no espaço da textura (padrão true)
 * @returns { positions, uvs, indices, stats }
 */
export function simplifyTextured(positions, uvs, indices, { targetTriangles, seamWeight = 1, flipLimit = 0.2, keepUvOrientation = true } = {}) {
  // 1. Solda por posição exata.
  const weldKey = new Map()
  const toWelded = new Int32Array(positions.length / 3)
  const pos = []
  for (let i = 0; i < toWelded.length; i++) {
    const key = `${positions[i * 3]},${positions[i * 3 + 1]},${positions[i * 3 + 2]}`
    let id = weldKey.get(key)
    if (id === undefined) { id = pos.length / 3; weldKey.set(key, id); pos.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) }
    toWelded[i] = id
  }
  const vertexCount = pos.length / 3
  const P = Float64Array.from(pos)

  // 2. Triângulos: vértices soldados e UV de cada canto. Descarta os degenerados.
  const fv = [], fuv = []
  for (let t = 0; t < indices.length; t += 3) {
    const a = toWelded[indices[t]], b = toWelded[indices[t + 1]], c = toWelded[indices[t + 2]]
    if (a === b || b === c || a === c) continue
    fv.push(a, b, c)
    for (let k = 0; k < 3; k++) fuv.push(uvs[indices[t + k] * 2], uvs[indices[t + k] * 2 + 1])
  }
  const faceCount = fv.length / 3
  const FV = Int32Array.from(fv), FUV = Float64Array.from(fuv)
  const alive = new Uint8Array(faceCount).fill(1)
  const vertexAlive = new Uint8Array(vertexCount).fill(1)
  const vfaces = Array.from({ length: vertexCount }, () => [])
  for (let f = 0; f < faceCount; f++) for (let k = 0; k < 3; k++) vfaces[FV[f * 3 + k]].push(f)

  const faceNormal = (f, out) => { // normal não unitária (2 × área) com os vértices atuais
    const a = FV[f * 3] * 3, b = FV[f * 3 + 1] * 3, c = FV[f * 3 + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx
    return out
  }

  // 3. Quádricas por vértice (10 coeficientes da matriz simétrica 4 × 4), com peso pela área.
  const Q = new Float64Array(vertexCount * 10)
  const addPlane = (v, nx, ny, nz, d, weight) => {
    const o = v * 10
    Q[o] += weight * nx * nx; Q[o + 1] += weight * nx * ny; Q[o + 2] += weight * nx * nz; Q[o + 3] += weight * nx * d
    Q[o + 4] += weight * ny * ny; Q[o + 5] += weight * ny * nz; Q[o + 6] += weight * ny * d
    Q[o + 7] += weight * nz * nz; Q[o + 8] += weight * nz * d; Q[o + 9] += weight * d * d
  }
  const normal = [0, 0, 0]
  const edgeFaces = new Map()
  const edgeKey = (a, b) => (a < b ? a * vertexCount + b : b * vertexCount + a)
  for (let f = 0; f < faceCount; f++) {
    faceNormal(f, normal)
    const twice = Math.hypot(normal[0], normal[1], normal[2])
    if (twice < EPS) continue
    const nx = normal[0] / twice, ny = normal[1] / twice, nz = normal[2] / twice
    const a = FV[f * 3] * 3
    const d = -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2])
    for (let k = 0; k < 3; k++) addPlane(FV[f * 3 + k], nx, ny, nz, d, twice / 2)
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(FV[f * 3 + k], FV[f * 3 + (k + 1) % 3])
      edgeFaces.set(key, (edgeFaces.get(key) || 0) + 1)
    }
  }
  // Arestas de borda (uma só face): plano perpendicular que as segura no lugar.
  const boundary = new Uint8Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    faceNormal(f, normal)
    const twice = Math.hypot(normal[0], normal[1], normal[2])
    if (twice < EPS) continue
    for (let k = 0; k < 3; k++) {
      const a = FV[f * 3 + k], b = FV[f * 3 + (k + 1) % 3]
      if (edgeFaces.get(edgeKey(a, b)) !== 1) continue
      boundary[a] = boundary[b] = 1
      const ex = P[b * 3] - P[a * 3], ey = P[b * 3 + 1] - P[a * 3 + 1], ez = P[b * 3 + 2] - P[a * 3 + 2]
      const length = Math.hypot(ex, ey, ez)
      let px = ey * normal[2] - ez * normal[1], py = ez * normal[0] - ex * normal[2], pz = ex * normal[1] - ey * normal[0]
      const plength = Math.hypot(px, py, pz)
      if (plength < EPS) continue
      px /= plength; py /= plength; pz /= plength
      const d = -(px * P[a * 3] + py * P[a * 3 + 1] + pz * P[a * 3 + 2])
      addPlane(a, px, py, pz, d, length * length * 10)
      addPlane(b, px, py, pz, d, length * length * 10)
    }
  }

  const quadricError = (u, v, x, y, z) => {
    const o = u * 10, w = v * 10
    const q = i => Q[o + i] + Q[w + i]
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x
      + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y
      + q(7) * z * z + 2 * q(8) * z + q(9)
  }

  // 4. Avaliação de um colapso u → v. Devolve null se for inválido; senão { cost, updates: [face, canto, u, v] }.
  const stamp = new Int32Array(vertexCount)
  let stampValue = 0
  const normalBefore = [0, 0, 0], normalAfter = [0, 0, 0]
  const uvOf = (f, k, axis) => FUV[f * 6 + k * 2 + axis]
  const cornerOf = (f, vertex) => (FV[f * 3] === vertex ? 0 : FV[f * 3 + 1] === vertex ? 1 : 2)
  const hasVertex = (f, vertex) => FV[f * 3] === vertex || FV[f * 3 + 1] === vertex || FV[f * 3 + 2] === vertex

  function evaluate(u, v) {
    const shared = []
    for (const f of vfaces[u]) if (alive[f] && hasVertex(f, v)) shared.push(f)
    if (shared.length === 0 || shared.length > 2) return null
    if (boundary[u] && boundary[v] && shared.length === 2) return null // criaria um estrangulamento

    // Condição de elo: os vizinhos comuns de u e v são só os terceiros vértices dos triângulos removidos.
    stampValue += 2
    const markedByV = stampValue - 1, counted = stampValue
    for (const f of vfaces[v]) if (alive[f]) for (let k = 0; k < 3; k++) stamp[FV[f * 3 + k]] = markedByV
    let common = 0
    for (const f of vfaces[u]) {
      if (!alive[f]) continue
      for (let k = 0; k < 3; k++) {
        const w = FV[f * 3 + k]
        if (w === u || w === v || stamp[w] !== markedByV) continue
        stamp[w] = counted // conta cada vizinho comum uma vez só
        common++
      }
    }
    if (common !== shared.length) return null

    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]
    const length2 = (P[u * 3] - x) ** 2 + (P[u * 3 + 1] - y) ** 2 + (P[u * 3 + 2] - z) ** 2
    const updates = []
    let penalty = 0
    for (const f of vfaces[u]) {
      if (!alive[f] || shared.includes(f)) continue
      const k = cornerOf(f, u)
      faceNormal(f, normalBefore)
      const before = Math.hypot(normalBefore[0], normalBefore[1], normalBefore[2])
      const saved0 = FV[f * 3 + k]
      FV[f * 3 + k] = v
      faceNormal(f, normalAfter)
      FV[f * 3 + k] = saved0
      const after = Math.hypot(normalAfter[0], normalAfter[1], normalAfter[2])
      if (before > EPS) {
        if (after < before * 1e-3) return null
        const dot = (normalBefore[0] * normalAfter[0] + normalBefore[1] * normalAfter[1] + normalBefore[2] * normalAfter[2]) / (before * after)
        if (dot < flipLimit) return null
      }
      // UV novo do canto: o de v na mesma ilha (par u,v de um triângulo removido com o mesmo UV de u).
      const cu = uvOf(f, k, 0), cv = uvOf(f, k, 1)
      let nu = cu, nv = cv, matched = false
      for (const s of shared) {
        const su = cornerOf(s, u), sv = cornerOf(s, v)
        if (Math.abs(uvOf(s, su, 0) - cu) < 1e-7 && Math.abs(uvOf(s, su, 1) - cv) < 1e-7) {
          nu = uvOf(s, sv, 0); nv = uvOf(s, sv, 1); matched = true
          break
        }
      }
      if (!matched) penalty += before / 2
      // Não deixa a textura dobrar: o sentido do triângulo no espaço UV se mantém.
      const k1 = (k + 1) % 3, k2 = (k + 2) % 3
      const area = (au, av, bu, bv, du, dv) => (bu - au) * (dv - av) - (bv - av) * (du - au)
      const oldArea = area(cu, cv, uvOf(f, k1, 0), uvOf(f, k1, 1), uvOf(f, k2, 0), uvOf(f, k2, 1))
      const newArea = area(nu, nv, uvOf(f, k1, 0), uvOf(f, k1, 1), uvOf(f, k2, 0), uvOf(f, k2, 1))
      if (keepUvOrientation && oldArea * newArea < 0 && Math.abs(oldArea) > 1e-12) return null
      updates.push(f, k, nu, nv)
    }
    const cost = Math.max(0, quadricError(u, v, x, y, z)) + seamWeight * penalty * length2
    return { cost, updates, shared }
  }

  // 5. Fila de prioridade (heap binário) com entradas invalidadas por versão.
  const version = new Int32Array(vertexCount)
  const heap = []
  const less = (a, b) => a.cost < b.cost
  const push = (entry) => {
    heap.push(entry)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!less(heap[i], heap[parent])) break
      ;[heap[i], heap[parent]] = [heap[parent], heap[i]]
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0], last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1
        let m = i
        if (l < heap.length && less(heap[l], heap[m])) m = l
        if (r < heap.length && less(heap[r], heap[m])) m = r
        if (m === i) break
        ;[heap[i], heap[m]] = [heap[m], heap[i]]
        i = m
      }
    }
    return top
  }
  const consider = (a, b) => {
    const forward = evaluate(a, b), backward = evaluate(b, a)
    const best = !forward ? (backward && { u: b, v: a, ...backward }) : (!backward || forward.cost <= backward.cost ? { u: a, v: b, ...forward } : { u: b, v: a, ...backward })
    if (best) push({ cost: best.cost, u: best.u, v: best.v, vu: version[best.u], vv: version[best.v] })
  }

  const seenEdges = new Set()
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const a = FV[f * 3 + k], b = FV[f * 3 + (k + 1) % 3]
      const key = edgeKey(a, b)
      if (seenEdges.has(key)) continue
      seenEdges.add(key)
      consider(a, b)
    }
  }
  seenEdges.clear()

  let alivePolygons = faceCount, collapses = 0, rejected = 0
  const neighbors = new Set()
  while (alivePolygons > targetTriangles && heap.length) {
    const entry = pop()
    const { u, v } = entry
    if (!vertexAlive[u] || !vertexAlive[v] || entry.vu !== version[u] || entry.vv !== version[v]) continue
    const result = evaluate(u, v) // as vizinhanças podem ter mudado sem mexer nas versões de u e v
    if (!result) { rejected++; continue }
    if (result.cost > entry.cost * 1.0001 + 1e-12) { push({ ...entry, cost: result.cost }); continue }

    for (const f of result.shared) alive[f] = 0
    for (let i = 0; i < result.updates.length; i += 4) {
      const f = result.updates[i], k = result.updates[i + 1]
      FV[f * 3 + k] = v
      FUV[f * 6 + k * 2] = result.updates[i + 2]
      FUV[f * 6 + k * 2 + 1] = result.updates[i + 3]
      vfaces[v].push(f)
    }
    vfaces[v] = vfaces[v].filter(f => alive[f])
    vfaces[u] = []
    vertexAlive[u] = 0
    for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k]
    boundary[v] = boundary[v] | boundary[u]
    version[v]++
    alivePolygons -= result.shared.length
    collapses++

    neighbors.clear()
    for (const f of vfaces[v]) for (let k = 0; k < 3; k++) if (FV[f * 3 + k] !== v) neighbors.add(FV[f * 3 + k])
    for (const n of neighbors) consider(v, n)
  }

  // 6. Reconstrói a malha com a costura de volta: um vértice por par (posição, UV).
  const outIndex = new Map()
  const outPositions = [], outUvs = [], outIndices = []
  for (let f = 0; f < faceCount; f++) {
    if (!alive[f]) continue
    for (let k = 0; k < 3; k++) {
      const w = FV[f * 3 + k], uu = FUV[f * 6 + k * 2], vv = FUV[f * 6 + k * 2 + 1]
      const key = `${w}|${Math.fround(uu)}|${Math.fround(vv)}`
      let id = outIndex.get(key)
      if (id === undefined) {
        id = outPositions.length / 3
        outIndex.set(key, id)
        outPositions.push(P[w * 3], P[w * 3 + 1], P[w * 3 + 2])
        outUvs.push(uu, vv)
      }
      outIndices.push(id)
    }
  }
  return {
    positions: Float32Array.from(outPositions),
    uvs: Float32Array.from(outUvs),
    indices: outPositions.length / 3 > 65535 ? Uint32Array.from(outIndices) : Uint16Array.from(outIndices),
    stats: { before: faceCount, after: alivePolygons, collapses, rejected, vertices: outPositions.length / 3 },
  }
}
