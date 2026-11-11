import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function matches(pattern: string, paths: ReadonlySet<string>): boolean {
  if (!pattern.includes('*')) return paths.has(pattern)
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(`^${escaped.replaceAll('**', '*').replaceAll('*', '.*')}$`)
  return [...paths].some((path) => expression.test(path))
}

export function validatePackage(manifest: unknown, packed: unknown): void {
  assert.ok(isRecord(manifest), 'Package manifest must be an object')
  assert.equal(manifest.name, 'dsh-client-manual-continue')
  assert.notEqual(manifest.private, true, 'Public npm releases must not be private')
  assert.equal(manifest.license, 'MIT')
  assert.ok(isRecord(manifest.publishConfig))
  assert.equal(manifest.publishConfig.access, 'public')
  assert.equal(manifest.publishConfig.registry, 'https://registry.npmjs.org/')
  assert.ok(Array.isArray(packed) && packed.length === 1, 'Expected one npm package')
  const entry: unknown = packed[0]
  assert.ok(isRecord(entry) && Array.isArray(entry.files))
  assert.equal(entry.name, manifest.name)
  assert.equal(entry.version, manifest.version)
  const paths = new Set<string>()
  const files: readonly unknown[] = entry.files
  for (const file of files) {
    assert.ok(isRecord(file) && typeof file.path === 'string')
    assert.ok(typeof file.size === 'number' && file.size > 0, `Empty file: ${file.path}`)
    assert.match(
      file.path,
      /^(?:package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES|icon\.svg|cordis\.patch\.yml|(?:lib|dist|src|locale)\/.+)$/,
      `Unexpected distribution file: ${file.path}`,
    )
    assert.doesNotMatch(file.path, /(?:^|\/)(?:\.[^/]+|node_modules|test|scripts)(?:\/|$)/)
    paths.add(file.path)
  }
  for (const path of [
    'package.json',
    'README.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES',
    'cordis.patch.yml',
    'icon.svg',
    'locale/en.json',
    'locale/zh.json',
  ]) {
    assert.ok(paths.has(path), `Missing package resource: ${path}`)
  }
  assert.ok(Array.isArray(manifest.files))
  const declarations: readonly unknown[] = manifest.files
  for (const pattern of declarations) {
    assert.ok(typeof pattern === 'string')
    assert.ok(matches(pattern, paths), `Missing declared package file: ${pattern}`)
  }
  function checkExports(value: unknown): void {
    if (typeof value === 'string') {
      assert.ok(value.startsWith('./'), `Invalid export target: ${value}`)
      assert.ok(matches(value.slice(2), paths), `Missing exported file: ${value}`)
    } else {
      assert.ok(isRecord(value), 'Expected export target or conditional exports')
      for (const target of Object.values(value)) checkExports(target)
    }
  }
  checkExports(manifest.exports)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const packed: unknown = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        '--dry-run',
        '--ignore-scripts',
        '--json',
        '--cache',
        join(root, '.inspection/npm-cache'),
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  )
  validatePackage(manifest, packed)
  console.log('Package metadata, declared files, exports, resources, and licenses are present')
}
