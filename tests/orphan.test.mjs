// Keep every test file reachable from the two suites run by CI: test and test:worker.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function listedTests(scripts) {
  return new Set([...scripts.matchAll(/(?:^|\s)(tests\/[^\s]+\.test\.mjs)(?=\s|$)/g)].map(match => match[1]))
}

test('every tests/*.test.mjs file is referenced by an npm script', () => {
  const { test, 'test:worker': worker } = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts
  const scripts = listedTests(`${test} ${worker}`)
  const files = fs.readdirSync('tests').filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`)
  assert.deepEqual(files.filter(file => !scripts.has(file)), [], 'unreferenced test file')
})

test('the script list requires an exact .test.mjs filename', () => {
  assert.deepEqual([...listedTests('node --test tests/a.test.mjs.disabled tests/b.test.mjs')], ['tests/b.test.mjs'])
})
