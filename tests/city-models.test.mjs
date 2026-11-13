// Prédios do Rio com GLB próprio: o orçamento de cada arquivo, a altura do catálogo e o redutor de malha.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getCityCatalog } from '../shared/game/city-layout.js'
import { readGlb } from '../tools/optimize-city-models.mjs'
import { simplifyTextured } from '../tools/lib/simplify-textured.mjs'

const PUBLIC = path.resolve('public-fifones')
const MAX_TRIANGLES = 8000, MAX_KB = 500, MAX_TEXTURE = 1024
const withModel = getCityCatalog('cristo-redentor').filter(item => item.model?.startsWith('/models/rio/'))

function boundsOf({ json }) {
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  let triangles = 0
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const position = json.accessors[primitive.attributes.POSITION]
    for (let c = 0; c < 3; c++) { box.min[c] = Math.min(box.min[c], position.min[c]); box.max[c] = Math.max(box.max[c], position.max[c]) }
    triangles += json.accessors[primitive.indices].count / 3
  }
  return { ...box, triangles }
}

test('catálogo do Rio: os 9 prédios com GLB existem e cabem no orçamento', () => {
  assert.equal(withModel.length, 9)
  for (const item of withModel) {
    const file = path.join(PUBLIC, item.model)
    assert.ok(fs.existsSync(file), `${item.id}: falta ${item.model}`)
    assert.ok(fs.existsSync(path.join(PUBLIC, item.preview)), `${item.id}: falta ${item.preview}`)
    const bytes = fs.readFileSync(file)
    assert.ok(bytes.length <= MAX_KB * 1024, `${item.id}: ${Math.round(bytes.length / 1024)} KB (máx. ${MAX_KB})`)
    const glb = readGlb(bytes)
    const { triangles } = boundsOf(glb)
    assert.ok(triangles <= MAX_TRIANGLES, `${item.id}: ${triangles} triângulos (máx. ${MAX_TRIANGLES})`)
    // Sem Draco nem meshopt: o carregador da cidade não tem decodificador.
    assert.deepEqual((glb.json.extensionsRequired || []).filter(name => name !== 'EXT_texture_webp'), [], item.id)
    assert.equal(glb.json.images.length, 1, `${item.id}: uma textura só`)
  }
})

test('catálogo do Rio: a altura de cada prédio com GLB não encolhe o modelo', () => {
  for (const item of withModel) {
    const glb = readGlb(fs.readFileSync(path.join(PUBLIC, item.model)))
    const { min, max } = boundsOf(glb)
    const size = [0, 1, 2].map(c => max[c] - min[c])
    // Mesma conta de CityWorld.loadModel: a base ocupa 90% da área e a altura segue a escala.
    const scale = Math.min(item.width * 0.9 / size[0], item.depth * 0.9 / size[2])
    assert.ok(item.height + 1e-6 >= size[1] * scale, `${item.id}: altura ${item.height} < ${(size[1] * scale).toFixed(2)}`)
    assert.ok(item.height - size[1] * scale < 0.3, `${item.id}: altura ${item.height} folgada demais (${(size[1] * scale).toFixed(2)})`)
    assert.ok(Math.abs(min[1]) < 0.01, `${item.id}: a base deve ficar em y = 0`)
  }
})

// A ilha é só cenário (getCityCatalog devolve vazio para ela), então os itens island-* são lidos do arquivo do catálogo.
const islandModels = JSON.parse(fs.readFileSync('shared/game/city-catalog.json', 'utf8')).filter(item => item.model?.startsWith('/models/island/'))

test('catálogo da ilha: prédios e decorações da ilha têm GLB dentro do orçamento e com a altura certa', () => {
  assert.deepEqual(islandModels.map(item => item.id).sort(), ['island-boat-large', 'island-boat-small', 'island-bonfire', 'island-cabin', 'island-hammock', 'island-lighthouse', 'island-palms', 'island-pier', 'island-statue'])
  for (const item of islandModels) {
    const bytes = fs.readFileSync(path.join(PUBLIC, item.model))
    assert.ok(bytes.length <= MAX_KB * 1024, `${item.id}: ${Math.round(bytes.length / 1024)} KB (máx. ${MAX_KB})`)
    const glb = readGlb(bytes)
    const { min, max, triangles } = boundsOf(glb)
    assert.ok(triangles <= MAX_TRIANGLES, `${item.id}: ${triangles} triângulos (máx. ${MAX_TRIANGLES})`)
    assert.deepEqual((glb.json.extensionsRequired || []).filter(name => name !== 'EXT_texture_webp'), [], item.id)
    assert.equal(glb.json.images.length, 1, `${item.id}: uma textura só`)
    const size = [0, 1, 2].map(c => max[c] - min[c])
    const scale = Math.min(item.width * 0.9 / size[0], item.depth * 0.9 / size[2])
    assert.ok(item.height + 1e-6 >= size[1] * scale, `${item.id}: altura ${item.height} < ${(size[1] * scale).toFixed(2)}`)
    assert.ok(item.height - size[1] * scale < 0.3, `${item.id}: altura ${item.height} folgada demais (${(size[1] * scale).toFixed(2)})`)
    assert.ok(Math.abs(min[1]) < 0.01, `${item.id}: a base deve ficar em y = 0`)
  }
})

// Malha de teste: uma grade ondulada de 40 × 40 com uma costura de textura no meio (vértices repetidos, UV descontínuo).
function bumpyGrid(n = 40) {
  const positions = [], uvs = [], indices = []
  const seam = n >> 1
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      for (const half of [0, 1]) { // cada vértice existe em duas cópias: a da esquerda e a da direita da costura
        positions.push(i / n, Math.sin(i * 0.4) * Math.cos(j * 0.3) * 0.05, j / n)
        uvs.push(half && i >= seam ? 0.5 + (i - seam) / n * 0.5 : i / n * 0.5, j / n)
      }
    }
  }
  const id = (i, j, half) => (j * (n + 1) + i) * 2 + half
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const half = i >= seam ? 1 : 0
      const a = id(i, j, half), b = id(i + 1, j, half), c = id(i, j + 1, half), d = id(i + 1, j + 1, half)
      indices.push(a, c, b, b, c, d)
    }
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices) }
}

test('redutor: chega perto da meta sem estragar a forma, o UV nem os índices', () => {
  const mesh = bumpyGrid()
  const before = mesh.indices.length / 3
  const out = simplifyTextured(mesh.positions, mesh.uvs, mesh.indices, { targetTriangles: 400 })
  const after = out.indices.length / 3
  assert.ok(after <= 420 && after >= 300, `triângulos: ${after}`)
  assert.ok(after < before / 3)
  const vertices = out.positions.length / 3
  assert.equal(out.uvs.length / 2, vertices)
  for (const index of out.indices) assert.ok(index >= 0 && index < vertices)
  assert.ok(out.positions.every(Number.isFinite) && out.uvs.every(Number.isFinite))
  // A grade continua ocupando o mesmo quadrado (o contorno é preservado) e o UV segue dentro de [0, 1].
  const x = Array.from({ length: vertices }, (_, v) => out.positions[v * 3]), z = Array.from({ length: vertices }, (_, v) => out.positions[v * 3 + 2])
  for (const axis of [x, z]) { assert.ok(Math.min(...axis) < 1e-6); assert.ok(Math.max(...axis) > 1 - 1e-6) }
  assert.ok(out.uvs.every(value => value >= -1e-6 && value <= 1 + 1e-6))
  // Nenhum triângulo degenerado nem invertido no plano XZ (todos com o mesmo sentido da malha original).
  for (let t = 0; t < out.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map(k => out.indices[t + k] * 3)
    const area = (out.positions[b] - out.positions[a]) * (out.positions[c + 2] - out.positions[a + 2]) - (out.positions[b + 2] - out.positions[a + 2]) * (out.positions[c] - out.positions[a])
    assert.ok(area < 0, `triângulo ${t / 3} invertido ou degenerado (${area})`)
  }
})
