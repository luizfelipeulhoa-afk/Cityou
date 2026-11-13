import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeNext } from '../src/fifones/api.js'

test('next só aceita páginas do app e mantém a aba', () => {
  assert.equal(safeNext('/app', '#/habitos'), '/app#/habitos')
  assert.equal(safeNext('/app#/metas', '#/habitos'), '/app#/metas')
  assert.equal(safeNext('/city.html?local=ilha-inicial'), '/city.html?local=ilha-inicial')
  assert.equal(safeNext('/world'), '/world')
})
test('next fora do app ou com hash estranho vira /app', () => {
  for (const bad of ['', null, '//evil.com', 'https://evil.com', '/admin', '/api/city', '/app/../x', '/app x']) assert.equal(safeNext(bad, '#/x'), '/app')
  assert.equal(safeNext('/app', '#<script>'), '/app')
})
