// Etapa 3 de docs/PLANO-PROXIMOS-PASSOS.md: as peças de IA e StuntSync saíram do catálogo. Uma cidade guardada com
// elas precisa carregar, receber o reembolso exato uma só vez e aceitar nova construção. Roda no Node, sem o Worker:
// o Durable Object recebe um SQLite em memória no lugar do `ctx.storage.sql`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { DemoSession } from '../worker/demo.js'
import { RETIRED_KINDS, withoutRetired, newCity, newTown } from '../worker/city.js'
import { getBuilding, getCityCatalog } from '../shared/game/city-layout.js'

const RIO = 'cristo-redentor'

function fakeContext(db) {
  const sql = {
    exec(query, ...bindings) {
      const statement = db.prepare(query)
      const rows = /^\s*select/i.test(query) ? statement.all(...bindings) : (statement.run(...bindings), [])
      return { toArray: () => rows, [Symbol.iterator]: () => rows[Symbol.iterator]() }
    },
  }
  return { storage: { sql, deleteAlarm: async () => {} }, id: { name: 'teste' } }
}

// Uma sessão "antiga": grava o estado de antes da etapa 3 e apaga a marca, como se o deploy ainda não tivesse rodado.
function legacySession({ home, rio }) {
  const db = new DatabaseSync(':memory:')
  const first = new DemoSession(fakeContext(db), {})
  first.write('city', 'state', home)
  if (rio) first.write('regional-city', RIO, rio)
  db.prepare("DELETE FROM records WHERE kind = 'migration'").run()
  return db
}

const legacyHome = placements => ({ ...newCity('ilha-inicial'), credits: 100, placements })
const piece = (id, kind, level = 1, x = 0, y = 0) => ({ id, kind, x, y, rotation: 0, level })

test('o catálogo não oferece mais IA nem StuntSync, e a Sede é da Cityou', () => {
  for (const kind of Object.keys(RETIRED_KINDS)) {
    assert.equal(getBuilding(kind), undefined, kind)
    assert.ok(!getCityCatalog(RIO).some(item => item.id === kind), kind)
  }
  assert.equal(getBuilding('headquarters').label, 'Sede Cityou')
  for (const item of getCityCatalog(RIO)) assert.ok(!String(item.destination ?? '').includes('#/'), `${item.id}: ${item.destination}`)
})

test('reembolso = custo + melhorias, por nível', () => {
  const refund = level => withoutRetired([piece('a', 'stunt', level)]).refund
  assert.deepEqual([1, 2, 3].map(refund), [80, 160, 320])
  assert.equal(withoutRetired([piece('a', 'tasks', 3)]).refund, 0)
})

test('cidade guardada com stunt nível 3 carrega, credita o valor exato uma só vez e aceita nova construção', () => {
  const base = newTown(RIO)
  const rio = { ...base, revision: 4, placements: [...base.placements, piece('s', 'stunt', 3, 14, 12), piece('g', 'grok', 1, 16, 12)] }
  const db = legacySession({ home: legacyHome([piece('i', 'chatgpt', 2)]), rio })

  const session = new DemoSession(fakeContext(db), {})
  // stunt 3 = 320, grok 1 = 50, chatgpt 2 = 70 + 70 = 140
  const home = session.read('city', 'state')
  assert.equal(home.credits, 100 + 320 + 50 + 140)
  assert.equal(home.placements.length, 0)
  assert.equal(home.history[0].amount, 510)
  const region = session.read('regional-city', RIO)
  assert.deepEqual(region.placements.map(item => item.kind), base.placements.map(item => item.kind))
  assert.equal(region.revision, 5)

  // Carregar a cidade não quebra e ela não oferece mais as peças.
  const snapshot = session.citySnapshot(RIO)
  assert.ok(!snapshot.catalog.some(item => item.id in RETIRED_KINDS))

  // Uma segunda leitura (o Durable Object acordando de novo) não paga outra vez.
  const again = new DemoSession(fakeContext(db), {})
  assert.equal(again.read('city', 'state').credits, 610)
  assert.equal(again.read('migration', 'catalog-3').refund, 510)

  // E a cidade aceita uma construção nova depois da migração, sem erro.
  const action = { type: 'build', expected_revision: snapshot.revision, request_id: 'depois-da-migracao', kind: 'rio-sobrado', x: -2, y: 15 }
  const response = again.cityAction(action, RIO)
  assert.equal(response.status, 200)
})

test('sem peças aposentadas, a migração não credita nada nem mexe na cidade', () => {
  const db = legacySession({ home: legacyHome([piece('c', 'tasks')]), rio: { revision: 2, started_at: 'x', placements: [piece('c', 'tasks')] } })
  const session = new DemoSession(fakeContext(db), {})
  assert.equal(session.read('city', 'state').credits, 100)
  assert.equal(session.read('regional-city', RIO).revision, 2)
  assert.equal(session.read('migration', 'catalog-3').refund, 0)
})
