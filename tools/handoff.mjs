// Monta o texto de continuidade para colar em outro chat de IA: o documento docs/HANDOFF-CONTEXTO.md
// mais o estado do git de agora (branch, últimos commits, o que ainda não foi commitado).
//
// Uso: node tools/handoff.mjs            imprime o texto
//      node tools/handoff.mjs --copy     também tenta copiar para a área de transferência (pbcopy, wl-copy, xclip, clip)
//      node tools/handoff.mjs --full     inclui também docs/CHECKPOINT.md, docs/PLANO-PROXIMOS-PASSOS.md e docs/known-issues.md: um arquivo só, para quem não vê o repositório
//      node tools/handoff.mjs --full --out contexto.md   grava direto num arquivo (em vez de imprimir)
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'

const git = (...args) => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim() } catch { return '(git indisponível)' } }
const body = fs.readFileSync(new URL('../docs/HANDOFF-CONTEXTO.md', import.meta.url), 'utf8')
const live = [
  '\n---\n\n## Estado do git no momento da exportação\n',
  '```',
  git('status', '-sb'),
  '',
  git('log', '--oneline', '-8'),
  '```',
  '',
  'Alterações ainda não commitadas (resumo):',
  '```',
  git('diff', '--stat', 'HEAD') || '(nenhuma)',
  '```',
  '',
].join('\n')
const read = name => fs.readFileSync(new URL(`../docs/${name}`, import.meta.url), 'utf8')
const full = process.argv.includes('--full')
  ? `\n\n---\n\n# Anexo 1: checkpoint (estado de cada etapa)\n\n${read('CHECKPOINT.md')}\n\n---\n\n# Anexo 2: plano completo\n\n${read('PLANO-PROXIMOS-PASSOS.md')}\n\n---\n\n# Anexo 3: tropeços conhecidos\n\n${read('known-issues.md')}\n`
  : ''
const text = body + live + full
const outAt = process.argv.indexOf('--out')
if (outAt > 0) { fs.writeFileSync(process.argv[outAt + 1], text); process.stderr.write(`Gravado em ${process.argv[outAt + 1]} (${text.length} caracteres).\n`) }
else process.stdout.write(text)

if (process.argv.includes('--copy')) {
  const tools = [['pbcopy'], ['wl-copy'], ['xclip', '-selection', 'clipboard'], ['clip']]
  const ok = tools.some(([cmd, ...rest]) => spawnSync(cmd, rest, { input: text }).status === 0)
  process.stderr.write(ok ? '\nCopiado para a área de transferência.\n' : '\nNão achei comando de cópia: use node tools/handoff.mjs > texto.md e anexe o arquivo.\n')
}
