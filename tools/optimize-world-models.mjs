// Reduz um GLB exportado do Tripo para o orçamento do mapa-mundo e o grava na pasta pública.
// Uso: node tools/optimize-world-models.mjs <entrada.glb> <id-do-espaco> [--ratio 0.25] [--error 0.01] [--out pasta]
// --ratio é a fração de triângulos desejada; --error é quanto a forma pode mudar (fração do tamanho do modelo).
// Limite conhecido: a simplificação preserva as costuras de textura. Em malhas geradas por IA ela costuma
// parar perto da metade dos triângulos, qualquer que seja o --ratio (testado: 184 mil → 88 mil). Para caber
// no orçamento, gere o modelo no Tripo já com o limite de faces; use esta ferramenta para compactar.
// Usa @gltf-transform/cli (baixado pelo npx): simplifica a malha, comprime com meshopt e
// converte as texturas para WebP de até 1024 px. O mapa já decodifica meshopt e WebP.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback }
const ratio = flag('ratio', '0.25')
const error = flag('error', '0.01')
const outDir = path.resolve(flag('out', 'public-fifones/models/world'))
const [input, id] = args
if (!input || !id) { console.error('Uso: node tools/optimize-world-models.mjs <entrada.glb> <id-do-espaco> [--ratio 0.25] [--error 0.01] [--out pasta]'); process.exit(2) }

fs.mkdirSync(outDir, { recursive: true })
const output = path.join(outDir, `${id}.glb`)
const run = spawnSync('npx', ['--yes', '@gltf-transform/cli@4', 'optimize', path.resolve(input), output,
  '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024',
  '--simplify-ratio', ratio, '--simplify-error', error], { stdio: 'inherit' })
if (run.status !== 0) process.exit(run.status ?? 1)
const kb = file => Math.round(fs.statSync(file).size / 1024)
console.log(`\n${path.basename(input)}: ${kb(input)} KB → ${path.relative('.', output)}: ${kb(output)} KB`)
console.log('Confira com: node tools/check-world-models.mjs')
