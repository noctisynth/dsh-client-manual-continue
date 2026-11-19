import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'
import { satisfies } from 'semver'

const manifest: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
assert.ok(typeof manifest === 'object' && manifest !== null)
assert.ok('engines' in manifest && typeof manifest.engines === 'object')
assert.ok(manifest.engines !== null && 'dsh' in manifest.engines)
const range = manifest.engines.dsh
assert.ok(typeof range === 'string')
assert.ok('peerDependencies' in manifest && typeof manifest.peerDependencies === 'object')
assert.ok(manifest.peerDependencies !== null)
assert.ok('devDependencies' in manifest && typeof manifest.devDependencies === 'object')
assert.ok(manifest.devDependencies !== null)
const peers = manifest.peerDependencies
const development = manifest.devDependencies

// DSH's published compatibility evaluator opts into prereleases for both engines and peers.
// This is not a claim about npm's default node-semver peer interpretation.
test('DSH engine range covers the entire current series including prereleases', () => {
  for (const version of [
    '0.2.0-alpha.1',
    '0.2.0',
    '0.2.1-rc.5',
    '0.2.2-alpha.3',
    '0.2.2-rc.1',
    '0.2.2-rc.5',
    '0.2.2',
    '0.2.3-rc.1',
    '0.2.99',
  ]) {
    assert.ok(satisfies(version, range, { includePrerelease: true }), version)
  }
  for (const version of ['0.1.99', '0.3.0-alpha.1', '0.3.0', '1.0.0']) {
    assert.equal(satisfies(version, range, { includePrerelease: true }), false, version)
  }
})

test('published DSH evaluator accepts the series through engines and peer fallback without exemptions', () => {
  const peerOnly = {
    name: 'dsh-client-manual-continue',
    version: '0.0.0',
    peerDependencies: peers,
  }
  for (const version of ['0.2.0-0', '0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.5+build', '0.2.99']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version)
    assert.equal(evaluatePluginCompatibility(peerOnly, {}, version), undefined, version)
  }
  for (const version of ['0.1.99', '0.3.0-0', '0.3.0-rc.1', '0.3.0', '1.0.0']) {
    for (const candidate of [manifest, peerOnly]) {
      const mismatch = evaluatePluginCompatibility(candidate, {}, version)
      assert.ok(mismatch !== undefined, version)
      assert.equal(mismatch.exempted, false)
      assert.ok(Object.keys(mismatch.requirements).length > 0)
    }
  }
})

test('DSH peers share the engine range while development SDKs use one reproducible release', () => {
  const baseline: unknown = Reflect.get(development, '@deepseek-ai/dsh-agent')
  assert.ok(typeof baseline === 'string')
  assert.ok(satisfies(baseline, range, { includePrerelease: true }))
  for (const [name, version] of Object.entries(development)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, baseline, name)
  }
  for (const [name, peerRange] of Object.entries(peers)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(peerRange, range, name)
  }
  const cordisRange: unknown = Reflect.get(peers, '@deepseek-ai/cordis')
  const cordisBaseline: unknown = Reflect.get(development, '@deepseek-ai/cordis')
  assert.ok(typeof cordisRange === 'string' && typeof cordisBaseline === 'string')
  assert.ok(satisfies(cordisBaseline, cordisRange))
  assert.ok(satisfies('4.2.0', cordisRange))
  assert.equal(satisfies('5.0.0', cordisRange), false)
})
