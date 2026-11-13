// O CLAUDE.md é o que cada IA lê primeiro: se ele cita um comando ou um arquivo que não existe mais, a próxima sessão trabalha
// em cima de uma informação falsa. Este teste confere só o que dá para conferir sem opinião: scripts do npm e caminhos do repositório.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const text = fs.readFileSync('CLAUDE.md', 'utf8')
const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts

test('CLAUDE.md: todo `npm run X` citado existe no package.json', () => {
  const cited = [...new Set([...text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)].map(match => match[1]))]
  assert.ok(cited.length >= 8, 'o teste deveria achar os comandos citados')
  assert.deepEqual(cited.filter(name => !(name in scripts)), [], 'comando citado que não existe em package.json')
})

test('CLAUDE.md: todo caminho citado de docs/, src/, tools/, tests/, worker/, shared/, backend/ e .claude/ existe', () => {
  const roots = /^(docs|src|tools|tests|worker|shared|backend|\.claude|council)\//
  const pieces = [...text.matchAll(/`([^`\n]+)`/g)].flatMap(match => match[1].split(/\s+/))
  const paths = [...new Set(pieces
    .map(piece => piece.replace(/[,.;:)]+$/, '').replace(/^\(/, '').replace(/#.*$/, ''))
    .filter(piece => roots.test(piece) && !/[<>*…{}$]/.test(piece)))]
  assert.ok(paths.length >= 40, `o teste deveria achar muitos caminhos (achou ${paths.length})`)
  assert.deepEqual(paths.filter(path => !fs.existsSync(path.replace(/\/$/, ''))), [], 'caminho citado que não existe no repositório')
})
