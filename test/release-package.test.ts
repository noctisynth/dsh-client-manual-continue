import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { validatePackage } from '../scripts/check-package.ts'

const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const paths = [
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES',
  'cordis.patch.yml',
  'icon.svg',
  'locale/en.json',
  'locale/zh.json',
  'lib/host/index.js',
  'dist/protocol.js',
  'lib/typert.host.js',
  'lib/typert.host.d.ts',
  'lib/typert.remote-client.js',
  'lib/typert.remote-client.d.ts',
  'lib/typert.remote-client.d.ts.map',
  'lib/client/index.js',
  ...readdirSync(new URL('../src', import.meta.url), { recursive: true })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `src/${path.replaceAll('\\', '/')}`),
]

function packed(files = paths) {
  assert.ok(typeof manifest === 'object' && manifest !== null && 'version' in manifest)
  return [
    {
      name: 'dsh-client-manual-continue',
      version: manifest.version,
      files: files.map((path) => ({ path, size: 1 })),
    },
  ]
}

test('distribution validation accepts a complete planned file list without running npm', () => {
  validatePackage(manifest, packed())
})

test('distribution validation rejects missing Host, Client, codec, and source exports', () => {
  for (const missing of [
    'lib/host/index.js',
    'lib/client/index.js',
    'lib/typert.remote-client.js',
    'src/client/index.ts',
  ]) {
    assert.throws(() => validatePackage(manifest, packed(paths.filter((path) => path !== missing))))
  }
})

test('distribution validation rejects missing licenses and localized display resources', () => {
  for (const missing of ['LICENSE', 'THIRD_PARTY_NOTICES', 'icon.svg', 'locale/zh.json']) {
    assert.throws(() => validatePackage(manifest, packed(paths.filter((path) => path !== missing))))
  }
})

test('distribution validation rejects private packages and incorrect release metadata', () => {
  assert.ok(typeof manifest === 'object' && manifest !== null)
  for (const changed of [
    { ...manifest, private: true },
    { ...manifest, license: 'UNLICENSED' },
    { ...manifest, publishConfig: { access: 'restricted' } },
  ]) {
    assert.throws(() => validatePackage(changed, packed()))
  }
})

test('distribution validation rejects development files, secrets, dependencies, and empty files', () => {
  for (const extra of [
    '.env',
    '.agents/TODO.md',
    '.github/workflows/ci.yml',
    'node_modules/example/index.js',
    'src/.env',
    'test/release-package.test.ts',
  ]) {
    assert.throws(() => validatePackage(manifest, packed([...paths, extra])))
  }
  const empty = packed()
  const first = empty[0]?.files[0]
  assert.ok(first !== undefined)
  first.size = 0
  assert.throws(() => validatePackage(manifest, empty))
})

test('distribution validation rejects inconsistent package identity and malformed npm output', () => {
  assert.throws(() => validatePackage(manifest, []))
  assert.throws(() => validatePackage(manifest, [{ name: 'another-package', files: [] }]))
  assert.throws(() => validatePackage(manifest, [{ files: ['not-a-file-record'] }]))
})
