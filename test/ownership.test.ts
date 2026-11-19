import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyRootCheck } from '../src/host/ownership.ts'

test('absent legacy roots selects the formally injected ownership path', () => {
  for (const registry of [undefined, null, false, 1, 'registry', {}, { roots: undefined }]) {
    assert.equal(legacyRootCheck(registry), undefined)
  }
})

test('legacy roots preserves its registry receiver and requires exact Agent inclusion', () => {
  const agent = { id: 'root' }
  const other = { id: 'root' }
  const registry = {
    current: [agent],
    roots() {
      return this.current
    },
  }
  const check = legacyRootCheck(registry)
  assert.ok(check)
  assert.equal(check(agent), true)
  assert.equal(check(other), false)
  registry.current = [other]
  assert.equal(check(agent), false)
  assert.equal(check(other), true)
})

test('legacy roots rejection, malformed return and getter failure never grant authority', () => {
  const agent = { id: 'root' }
  const brokenGetter = Object.defineProperty({}, 'roots', {
    get() {
      throw new Error('Registry released')
    },
  })
  for (const registry of [
    { roots: null },
    { roots: true },
    { roots: [] },
    { roots: () => undefined },
    { roots: () => new Set([agent]) },
    { roots: () => ({ includes: () => true }) },
    {
      roots() {
        throw new Error('Registry released')
      },
    },
    brokenGetter,
  ]) {
    const check = legacyRootCheck(registry)
    assert.ok(check)
    assert.equal(check(agent), false)
  }
})

test('legacy roots checks current ownership on every admission instead of caching roots', () => {
  const agent = { id: 'root' }
  let released = false
  let reads = 0
  const check = legacyRootCheck({
    roots() {
      reads += 1
      if (released) throw new Error('Registry released')
      return [agent]
    },
  })
  assert.ok(check)
  assert.equal(check(agent), true)
  released = true
  assert.equal(check(agent), false)
  assert.equal(reads, 2)
})
