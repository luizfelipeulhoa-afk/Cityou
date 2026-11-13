// Malha de triângulos retângulos por bisseção (RTIN) sobre uma grade quadrada de 2^n + 1 amostras.
//
// Todo triângulo é retângulo e isósceles. Dividir um triângulo é ligar o vértice do ângulo reto ao meio da
// hipotenusa. Cada vértice da grade, menos os quatro cantos, é o meio da hipotenusa de até dois triângulos, e
// entra na malha quando o seu erro passa do limite. O erro de um vértice nunca é menor que o dos vértices que
// só existem se ele existir, então a malha sai sem frestas para qualquer limite.
//
// Dois tipos de vértice, por nível (`half` = 1, 2, 4...):
// - "aresta": no meio de uma hipotenusa paralela a um eixo, de comprimento 2·half. Depende dos centros de half/2.
// - "centro": no meio da diagonal de um quadrado de lado 2·half. Depende das arestas de half.

/**
 * Calcula o erro de cada vértice.
 * `ownError(index, x, y, a, b, half, diagonal)` devolve o erro do próprio vértice: `a` e `b` são os índices das
 * pontas da hipotenusa. Devolva Infinity para forçar o vértice.
 */
export function computeErrors(size, ownError) {
  const last = size - 1
  if (last < 2 || (last & (last - 1)) !== 0) throw new Error(`A grade precisa ter 2^n + 1 amostras por lado; tem ${size}.`)
  const errors = new Float32Array(size * size)
  const at = (x, y) => (x < 0 || y < 0 || x > last || y > last ? 0 : errors[y * size + x])
  for (let half = 1; half < last; half *= 2) {
    const step = half * 2, child = half / 2
    const edge = (x, y, a, b) => {
      const index = y * size + x
      let error = ownError(index, x, y, a, b, half, false)
      if (child >= 1) error = Math.max(error, at(x - child, y - child), at(x + child, y - child), at(x - child, y + child), at(x + child, y + child))
      errors[index] = error
    }
    for (let y = 0; y <= last; y += step) for (let x = half; x < last; x += step) edge(x, y, y * size + x - half, y * size + x + half)
    for (let y = half; y < last; y += step) for (let x = 0; x <= last; x += step) edge(x, y, (y - half) * size + x, (y + half) * size + x)
    for (let y = half; y < last; y += step) {
      for (let x = half; x < last; x += step) {
        // A diagonal que vale é a que passa pelo centro do quadrado maior (o canto em múltiplo ímpar de 2·half).
        const sx = ((x + half) / step) % 2 === 1 ? half : -half, sy = ((y + half) / step) % 2 === 1 ? half : -half
        const index = y * size + x
        const own = ownError(index, x, y, (y + sy) * size + x + sx, (y - sy) * size + x - sx, half, true)
        errors[index] = Math.max(own, at(x - half, y), at(x + half, y), at(x, y - half), at(x, y + half))
      }
    }
  }
  return errors
}

// Um triângulo (a, b, c) tem a hipotenusa em a–b e o ângulo reto em c. Divide enquanto o meio da hipotenusa
// tiver erro acima do limite; os menores triângulos têm catetos de uma amostra.
const splits = (errors, size, threshold, ax, ay, bx, by, cx, cy) =>
  Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[((ay + by) >> 1) * size + ((ax + bx) >> 1)] > threshold

/** Chama `emit(ax, ay, bx, by, cx, cy)` para cada triângulo da malha, com a face para cima (+Y) em (x, z). */
export function forEachTriangle(errors, size, threshold, emit) {
  const last = size - 1
  const visit = (ax, ay, bx, by, cx, cy) => {
    if (splits(errors, size, threshold, ax, ay, bx, by, cx, cy)) {
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1
      visit(cx, cy, ax, ay, mx, my)
      visit(bx, by, cx, cy, mx, my)
    }
    else emit(ax, ay, bx, by, cx, cy)
  }
  visit(0, 0, last, last, last, 0)
  visit(last, last, 0, 0, 0, last)
}

export function countTriangles(errors, size, threshold) {
  let count = 0
  forEachTriangle(errors, size, threshold, () => { count++ })
  return count
}

/** Triângulo da malha que contém o ponto (gx, gy), em coordenadas da grade: [ax, ay, bx, by, cx, cy]. */
export function locateTriangle(errors, size, threshold, gx, gy) {
  const last = size - 1
  let ax = 0, ay = 0, bx = last, by = last, cx = last, cy = 0
  if (gx < gy) { ax = last; ay = last; bx = 0; by = 0; cx = 0; cy = last }
  while (splits(errors, size, threshold, ax, ay, bx, by, cx, cy)) {
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1
    // A divisão é a reta c–m: o ponto fica no filho do lado de `a` ou no do lado de `b`.
    const side = (mx - cx) * (gy - cy) - (my - cy) * (gx - cx)
    const sideOfA = (mx - cx) * (ay - cy) - (my - cy) * (ax - cx)
    if (side * sideOfA >= 0) { const tx = ax, ty = ay; ax = cx; ay = cy; bx = tx; by = ty }
    else { ax = bx; ay = by; bx = cx; by = cy }
    cx = mx; cy = my
  }
  return [ax, ay, bx, by, cx, cy]
}
