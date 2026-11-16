// Guard dependency direction: shared stays pure, worker never imports browser code,
// and src never imports the Worker.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { babelParse as parseJavaScript, parse as parseVueSfc } from 'vue/compiler-sfc'

const ALLOWED = { shared: ['shared'], worker: ['worker', 'shared'], src: ['src', 'shared'] }
const NO_THREE = new Set(['shared', 'worker'])

function literalValue(node) {
  if (node?.type === 'StringLiteral') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked
  return null
}

function moduleSpecifiers(source, filename) {
  const scripts = filename.endsWith('.vue')
    ? (() => {
      const { descriptor, errors } = parseVueSfc(source, { filename })
      if (errors.length) throw errors[0]
      return [descriptor.script, descriptor.scriptSetup].filter(Boolean).map(block => ({ content: block.content, lang: block.lang, src: block.src }))
    })()
    : [{ content: source, lang: path.extname(filename).slice(1) }]
  const found = []
  for (const script of scripts) {
    if (script.src) { found.push(script.src); continue }
    const plugins = ['jsx']
    if (script.lang === 'ts' || script.lang === 'tsx') plugins.push('typescript')
    const ast = parseJavaScript(script.content, { sourceType: 'module', plugins })
    const visit = node => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
        if (node.source?.value) found.push(node.source.value)
      }
      else if (node.type === 'ImportExpression') {
        const spec = literalValue(node.source)
        if (spec !== null) found.push(spec)
      }
      else if (node.type === 'CallExpression' && node.callee.type === 'Import') {
        const spec = literalValue(node.arguments[0])
        if (spec !== null) found.push(spec)
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'comments', 'tokens', 'errors', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue
        if (Array.isArray(value)) value.forEach(visit)
        else if (value && typeof value === 'object') visit(value)
      }
    }
    visit(ast.program)
  }
  return found
}

function files(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(full)
    return /\.(m?js|vue)$/.test(entry.name) ? [full] : []
  })
}

export function violations(root = '.') {
  const found = []
  for (const layer of Object.keys(ALLOWED)) {
    for (const file of files(path.join(root, layer))) {
      const text = fs.readFileSync(file, 'utf8')
      for (const spec of moduleSpecifiers(text, file)) {
        if (NO_THREE.has(layer) && (spec === 'three' || spec.startsWith('three/'))) found.push(`${file} → ${spec}`)
        if (!spec.startsWith('.') && !spec.startsWith('@/')) continue
        const target = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec)
        const relative = path.relative(root, target)
        const top = relative.split(path.sep)[0]
        if (!ALLOWED[layer].includes(top)) found.push(`${file} → ${spec}`)
      }
    }
  }
  return found
}

test('shared, worker and src respect the current dependency boundaries', () => {
  assert.deepEqual(violations(), [], 'unexpected cross-layer import')
})

test('the layer guard detects forbidden imports, including side-effect and dynamic imports', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cityou-layers-'))
  try {
    for (const layer of ['shared', 'worker', 'src']) fs.mkdirSync(path.join(root, layer))
    fs.writeFileSync(path.join(root, 'src', 'ok.js'), 'export const ok = 1\n')
    fs.writeFileSync(path.join(root, 'src', 'ignored.js'), "// import '../worker/commented.js'\n/* export * from '../worker/hidden.js' */\nconst example = \"import '../worker/string.js'\"\nconst template = `import('../worker/template-text.js)`\n")
    fs.writeFileSync(path.join(root, 'shared', 'pure.js'), "import * as THREE from 'three'\n")
    fs.writeFileSync(path.join(root, 'shared', 'side-effect.js'), "import 'three/addons/example.js'\n")
    fs.writeFileSync(path.join(root, 'src', 'widget.vue'), "<template><div /></template><script>import '../worker/vue-import.js'</script>")
    fs.writeFileSync(path.join(root, 'src', 'external.vue'), "<template><div /></template><script src='../worker/external.js'></script>")
    fs.writeFileSync(path.join(root, 'worker', 'route.js'), "import { ok } /* comment */ from /* comment */ '../src/ok.js'\nimport '../src/side.js'\nconst lazy = import('../src/lazy.js')\nconst templated = import(`../src/template.js`)\nconst options = import('../src/options.js', { with: { type: 'json' } })\nconst matcher = /['\\\"]/; import('../src/regex.js')\n")
    fs.writeFileSync(path.join(root, 'worker', 'demo.js'), "import { ok } from '../src/world/progress.js'\n")
    const found = violations(root)
    assert.equal(found.length, 11)
    assert.ok(found.some(item => item.endsWith('→ three')))
    assert.ok(found.some(item => item.endsWith('→ three/addons/example.js')))
    assert.ok(found.some(item => item.includes('route.js')))
  }
  finally { fs.rmSync(root, { recursive: true, force: true }) }
})
