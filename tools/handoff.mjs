// Monta o texto de continuidade para colar em outro chat de IA: o documento docs/HANDOFF-CONTEXTO.md
// mais o estado do git de agora (branch, últimos commits, o que ainda não foi commitado).
//
// Uso: node tools/handoff.mjs            imprime o texto
//      node tools/handoff.mjs --copy     também tenta copiar para a área de transferência (pbcopy, wl-copy, xclip, clip)
//      node tools/handoff.mjs > texto.md salva num arquivo para anexar
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
const text = body + live
process.stdout.write(text)

if (process.argv.includes('--copy')) {
  const tools = [['pbcopy'], ['wl-copy'], ['xclip', '-selection', 'clipboard'], ['clip']]
  const ok = tools.some(([cmd, ...rest]) => spawnSync(cmd, rest, { input: text }).status === 0)
  process.stderr.write(ok ? '\nCopiado para a área de transferência.\n' : '\nNão achei comando de cópia: use node tools/handoff.mjs > texto.md e anexe o arquivo.\n')
}
