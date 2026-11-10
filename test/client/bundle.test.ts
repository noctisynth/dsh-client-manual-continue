import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createContext, Script } from 'node:vm'
import type {
  ClientBundleRegistration,
  ClientModuleLoaderTarget,
} from '@deepseek-ai/dsh-client-modules/client'

// Artifact/metadata units only: no real Loader, page, installed profile, or human-click claim.
const packageId = 'dsh-client-manual-continue'
const source = readFileSync(new URL('../../lib/client/index.js', import.meta.url), 'utf8')
const nodeRequire = createRequire(import.meta.url)
type NativeRequire = Parameters<ClientBundleRegistration['factory']>[0]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonResource(relative: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8'),
  )
  assert.ok(isRecord(parsed), `Expected an object resource: ${relative}`)
  return parsed
}

function capture() {
  const submitted: unknown[] = []
  const accesses: string[] = []
  const loader: Pick<ClientModuleLoaderTarget, 'load'> = Object.freeze({
    load(value: unknown): void {
      submitted.push(value)
    },
  })
  const windowObject: Record<string, unknown> = { __ModuleLoader__: loader }
  const sandbox: Record<string, unknown> = {
    window: windowObject,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
  }
  for (const property of [
    'document',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'requestIdleCallback',
    'MutationObserver',
    'ResizeObserver',
    'getComputedStyle',
    'localStorage',
    'sessionStorage',
    'navigator',
    'location',
    'process',
    'Buffer',
    'require',
    'module',
    'exports',
    'console',
  ]) {
    for (const target of [sandbox, windowObject]) {
      Object.defineProperty(target, property, {
        enumerable: true,
        get() {
          accesses.push(property)
          throw new Error(`Client bundle accessed an unavailable capability: ${property}`)
        },
      })
    }
  }
  Object.freeze(windowObject)
  const originalGlobals = Reflect.ownKeys(sandbox)
  new Script(source, { filename: 'manual-continue-client.js' }).runInContext(
    createContext(sandbox),
    {
      timeout: 1000,
    },
  )
  assert.deepEqual(Reflect.ownKeys(sandbox), originalGlobals)
  assert.equal(submitted.length, 1, 'One script execution must register exactly one package entry')
  const raw = submitted[0]
  assert.ok(isRecord(raw))
  assert.deepEqual(Object.keys(raw).sort(), ['factory', 'id'])
  assert.equal(raw.id, packageId)
  assert.ok(typeof raw.id === 'string')
  assert.ok(typeof raw.factory === 'function')
  const factory = raw.factory
  // Validate the foreign result when it is materialized, not while the script registers it.
  const registration: ClientBundleRegistration = {
    id: raw.id,
    factory(require: NativeRequire): Record<string, unknown> {
      const value: unknown = Reflect.apply(factory, undefined, [require])
      assert.ok(isRecord(value), 'Native factory must return the exports record')
      return value
    },
  }
  return {
    registration,
    accesses,
    count: () => submitted.length,
    originalGlobals,
    globalKeys: () => Reflect.ownKeys(sandbox),
  }
}

test('native script only registers one lazy SDK-shaped contribution without body side effects', () => {
  const loaded = capture()
  assert.equal(loaded.registration.id, packageId)
  assert.equal(loaded.registration.chunk, undefined)
  assert.deepEqual(loaded.accesses, [])
})

test('materialization shares real React, imports no Host/Node runtime, and does not activate apply', () => {
  const loaded = capture()
  const sharedReact: unknown = nodeRequire('react')
  assert.ok(isRecord(sharedReact) && typeof sharedReact.createElement === 'function')
  const requested: string[] = []
  const unexpected: string[] = []
  const require: NativeRequire = Object.assign(
    (specifier: string): unknown => {
      requested.push(specifier)
      assert.equal(specifier, 'react', 'Only the page-shared React module may remain external')
      return sharedReact
    },
    {
      async(specifier: string): Promise<unknown> {
        unexpected.push(`async:${specifier}`)
        throw new Error('A single-file factory must not load chunks during materialization')
      },
      asset(reference: string): string {
        unexpected.push(`asset:${reference}`)
        throw new Error('A pure factory must not allocate or resolve page assets')
      },
    },
  )
  const exports = loaded.registration.factory(require)
  assert.deepEqual(requested, ['react'])
  assert.deepEqual(unexpected, [])
  assert.deepEqual(loaded.accesses, [])
  assert.equal(loaded.count(), 1)
  // The bundled Zod version intentionally initializes exactly these realm-local metadata caches.
  assert.deepEqual(
    loaded
      .globalKeys()
      .filter((key) => key !== '__zod_globalConfig' && key !== '__zod_globalRegistry'),
    loaded.originalGlobals,
  )
  assert.deepEqual(Object.keys(exports).sort(), ['apply', 'inject'])
  assert.equal(typeof exports.apply, 'function')
  const rawInject: unknown = exports.inject
  assert.ok(Array.isArray(rawInject) && rawInject.length > 0)
  const inject: string[] = []
  const entries: readonly unknown[] = rawInject
  for (const entry of entries) {
    assert.ok(typeof entry === 'string' && entry.length > 0)
    inject.push(entry)
  }
  assert.equal(new Set(inject).size, inject.length)
  assert.ok(inject.includes('remote') && inject.includes('slots') && inject.includes('connection'))
  assert.equal(inject.includes('agents'), false)
  // Also reject dormant literal Host/Node imports that a future activation could otherwise reach.
  const externalCalls = Array.from(source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g))
  assert.deepEqual(
    externalCalls.map((match) => match[1]),
    ['react'],
  )
})

test('production adapter contains semantic tokens but no build-specific CSS hashes', () => {
  assert.doesNotMatch(source, /GRgSLq_|JZLxKW_|uV2eYG_/)
  assert.match(source, /standardControls/)
  assert.match(source, /cssPrefix/)
})

test('package metadata exports and includes the native Client and required display resources', () => {
  const manifest = jsonResource('package.json')
  assert.equal(manifest.name, packageId)
  assert.notEqual(manifest.private, true)
  assert.equal(manifest.license, 'MIT')
  assert.ok(isRecord(manifest.exports))
  const client = manifest.exports['./client']
  assert.ok(isRecord(client))
  assert.equal(client.default, './lib/client/index.js')
  assert.equal(client.types, './src/client/index.ts')
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
  assert.equal(manifest.exports['./icon'], './icon.svg')
  assert.ok(Array.isArray(manifest.files))
  const files = new Set<string>()
  const fileEntries: readonly unknown[] = manifest.files
  for (const value of fileEntries) {
    assert.ok(typeof value === 'string' && value.length > 0)
    files.add(value)
  }
  for (const file of [
    'lib/client/index.js',
    'lib/typert.remote-client.js',
    'lib/typert.remote-client.d.ts',
    'src/**/*.ts',
    'cordis.patch.yml',
    'locale/*.json',
    'icon.svg',
    'LICENSE',
    'THIRD_PARTY_NOTICES',
  ]) {
    assert.ok(files.has(file), `Publication metadata must include ${file}`)
  }
  assert.ok(isRecord(manifest.dsh) && isRecord(manifest.dsh.client))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.immediately, true)
})

function localeLeaves(value: Record<string, unknown>, prefix = ''): Map<string, string> {
  const leaves = new Map<string, string>()
  for (const [key, child] of Object.entries(value)) {
    const name = prefix.length === 0 ? key : `${prefix}.${key}`
    if (isRecord(child)) {
      for (const [nested, text] of localeLeaves(child, name)) leaves.set(nested, text)
    } else {
      assert.ok(typeof child === 'string' && child.trim().length > 0, `Empty locale key: ${name}`)
      leaves.set(name, child)
    }
  }
  return leaves
}

test('English and Chinese resources provide nonempty matching keys and localized metadata', () => {
  const en = localeLeaves(jsonResource('locale/en.json'))
  const zh = localeLeaves(jsonResource('locale/zh.json'))
  assert.deepEqual([...en.keys()].sort(), [...zh.keys()].sort())
  assert.equal(en.get('meta.title'), 'Manual continuation')
  assert.equal(zh.get('meta.title'), '手动续跑')
  for (const key of ['meta.description', 'continue', 'unknown']) {
    assert.ok(en.has(key) && zh.has(key))
    assert.notEqual(en.get(key), zh.get(key))
  }
  for (const [key, text] of en) {
    const translated = zh.get(key)
    assert.ok(translated !== undefined)
    const placeholders = (value: string) =>
      Array.from(value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_.-]*)\}/g), (match) => match[1]).sort()
    assert.deepEqual(placeholders(text), placeholders(translated), `Placeholder mismatch: ${key}`)
  }
})

test('successful continuation adds no acceptance banner or acceptance copy', () => {
  for (const locale of ['en', 'zh']) {
    const resource = jsonResource(`locale/${locale}.json`)
    assert.equal(Object.hasOwn(resource, 'accepted'), false)
    assert.equal(Object.hasOwn(resource, 'acceptedUnconfirmed'), false)
  }
  assert.doesNotMatch(
    source,
    /续跑输入已接受|Continuation input accepted|持久化 checkpoint 尚未确认/,
  )
})

test('original SVG resource is bounded and structurally self-contained, without a rendering claim', () => {
  const svg = readFileSync(new URL('../../icon.svg', import.meta.url))
  assert.ok(svg.byteLength > 0 && svg.byteLength <= 256 * 1024)
  const text = svg.toString('utf8').trim()
  assert.match(text, /^<svg\b/)
  assert.match(text, /<\/svg>$/)
  assert.match(text, /\bxmlns=['"]http:\/\/www\.w3\.org\/2000\/svg['"]/)
  assert.match(text, /\bviewBox=['"]0 0 40 40['"]/)
  assert.doesNotMatch(text, /<script\b|<foreignObject\b|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=/i)
  for (const match of text.matchAll(/\b(?:xlink:)?href\s*=\s*(['"])(.*?)\1/gi)) {
    assert.ok(match[2]?.startsWith('#'), 'SVG references must remain inside this image')
  }
  assert.doesNotMatch(text, /\burl\(\s*['"]?(?:https?:|\/\/)/i)
})

test('redistribution notices identify the actual bundled protocol and Zod dependencies', () => {
  const notices = readFileSync(new URL('../../THIRD_PARTY_NOTICES', import.meta.url), 'utf8')
  for (const name of ['@deepseek-ai/dsh-typert-protocol', 'zod']) {
    const metadata: unknown = JSON.parse(
      readFileSync(nodeRequire.resolve(`${name}/package.json`), 'utf8'),
    )
    assert.ok(isRecord(metadata) && typeof metadata.version === 'string')
    assert.ok(notices.includes(`${name} ${metadata.version}`))
  }
  assert.match(source, /createTypertRemoteInfo/)
  assert.match(source, /__zod_globalConfig/)
  assert.match(notices, /MIT License/)
  assert.match(notices, /Permission is hereby granted/)
  assert.match(notices, /THE SOFTWARE IS PROVIDED "AS IS"/)
  assert.match(notices, /React and the DSH UI runtime are supplied by the host, not bundled/)
})
