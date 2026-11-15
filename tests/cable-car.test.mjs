import assert from 'node:assert/strict'
import test from 'node:test'
import { createCableCar } from '../src/terrain/cableCar.js'

// Relevo de teste: dois morros (um baixo e um alto), como a Urca e o Pão de Açúcar.
const heightAt = (x, z) => 6 * Math.exp(-((x - 19) ** 2 + (z + 23) ** 2) / 8) + 12 * Math.exp(-((x - 10) ** 2 + (z + 25) ** 2) / 6)
const from = { x: 19, z: -23 }, to = { x: 10.5, z: -25.5 }

test('bondinho: estações nascem da rocha, sem flutuar e sem o chão furar o piso', () => {
  const car = createCableCar(heightAt, from, to)
  const stations = car.group.children.filter(child => child.isGroup && child.children.length >= 5)
  assert.equal(stations.length, 2)
  for (const station of stations) {
    const { x, y, z } = station.position
    for (const ox of [-0.55, 0, 0.55]) for (const oz of [-0.55, 0, 0.55]) assert.ok(y >= heightAt(x + ox, z + oz), 'o piso fica acima do chão')
    const plinth = station.children[0]
    const bottom = y + plinth.position.y - plinth.geometry.parameters.height / 2
    assert.ok(bottom < heightAt(x, z) - 0.5, 'o pedestal entra na rocha')
  }
  car.dispose()
})

test('bondinho: as duas cabines andam pelo cabo, em sentidos opostos, e param nas estações', () => {
  const car = createCableCar(heightAt, from, to)
  const cabins = car.group.children.filter(child => child.isGroup && child.children.length === 4)
  assert.equal(cabins.length, 2)
  car.update(0.5) // parada inicial: cada cabine numa ponta
  const dist = (a, p) => Math.hypot(a.position.x - p.x, a.position.z - p.z)
  assert.ok(dist(cabins[0], from) < 0.6 && dist(cabins[1], to) < 0.6)
  car.update(9) // no meio da viagem: as duas se cruzam perto do centro
  const middle = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }
  assert.ok(dist(cabins[0], middle) < 2.5 && dist(cabins[1], middle) < 2.5)
  for (const cabin of cabins) assert.ok(cabin.position.y > heightAt(cabin.position.x, cabin.position.z), 'a cabine passa acima do chão')
  car.dispose()
})
