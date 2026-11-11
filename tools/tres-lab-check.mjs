// Confere o laboratório da migração para TresJS (/tres-lab.html), servido pelo dev server do Vite:
// as duas peças montam sem erro, o GLB chega com faces planas e material fosco, e a cena é desenhada.
// Uso: node tools/tres-lab-check.mjs
// Em sessão na nuvem: CITYOU_CHROME=/opt/pw-browsers/chromium node tools/tres-lab-check.mjs
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium, browserOptions } from './runtime.mjs'

const PORT = 5187
const BASE = `http://127.0.0.1:${PORT}`
const OUT = '.verification'
fs.mkdirSync(OUT, { recursive: true })

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: PORT, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ ...browserOptions, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = []

// Materiais das malhas com textura (o GLB) e os triângulos do último quadro desenhado.
const inspect = () => {
  const { context } = window.__tresLab
  const materials = new Set()
  context.scene.value.traverse((child) => {
    if (!child.isMesh || !child.material) return
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) if (material.map) materials.add(material)
  })
  return {
    triangles: context.renderer.instance.info.render.triangles,
    materials: [...materials].map(m => ({
      type: m.type, flatShading: m.flatShading, metalness: m.metalness ?? null, roughness: m.roughness ?? null,
      maps: [m.metalnessMap, m.roughnessMap].filter(Boolean).length,
    })),
  }
}

async function check(name, query, expected, steps = async () => {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${BASE}/tres-lab.html?${query}`)
  const ready = () => page.waitForFunction(() => window.__tresLab?.status.value === 'pronto', null, { timeout: 120000 })
  await ready()
  await steps(page, ready)
  await page.waitForTimeout(700) // deixa o pulso de entrada do modelo terminar antes da foto
  const info = await page.evaluate(inspect)
  await page.screenshot({ path: `${OUT}/tres-lab-${name}.png` })
  await page.close()
  assert.deepEqual(errors, [], `${name}: erros no console`)
  assert.ok(info.triangles > 0, `${name}: nenhum triângulo desenhado`)
  assert.ok(info.materials.length > 0, `${name}: nenhum material de GLB na cena`)
  for (const material of info.materials) assert.deepEqual(material, expected, `${name}: material fora da regra`)
  results.push(`${name}: ${info.triangles} triângulos, ${info.materials.length} material(is) ${expected.type} com faces planas`)
}

try {
  // No marcador, o GLB vira Lambert (sem metal nem rugosidade); no GLB puro, continua PBR, fosco e sem metal.
  await check('marcador', 'modo=marcador&espaco=cristo-redentor', { type: 'MeshLambertMaterial', flatShading: true, metalness: null, roughness: null, maps: 0 })
  await check('glb', 'modo=glb&espaco=coliseu', { type: 'MeshStandardMaterial', flatShading: true, metalness: 0, roughness: 1, maps: 0 })
  // Na mesma página: troca o espaço (desmonta um marcador e monta outro) e depois a peça (marcador sai, GLB puro entra).
  await check('troca', 'modo=marcador&espaco=cristo-redentor', { type: 'MeshStandardMaterial', flatShading: true, metalness: 0, roughness: 1, maps: 0 }, async (page, ready) => {
    await page.getByLabel('Espaço').selectOption('taj-mahal')
    await ready()
    await page.getByLabel('Peça').selectOption('glb')
    await ready()
  })
  console.log(results.map(line => `✓ ${line}`).join('\n'))
  console.log(`Imagens em ${OUT}/tres-lab-*.png`)
}
finally {
  await browser.close()
  await server.close()
}
