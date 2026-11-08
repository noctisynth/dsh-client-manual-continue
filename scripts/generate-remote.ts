import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator, writePackageArtifacts } from '@deepseek-ai/dsh-typert-generator'

const root = fileURLToPath(new URL('../', import.meta.url))
const cache = resolve(root, '.inspection')
mkdirSync(cache, { recursive: true })
const staging = mkdtempSync(join(cache, 'typert-'))
const packageDirectory = join(staging, 'packages', 'manual-continue')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

try {
  const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.ok(isRecord(manifest) && manifest.name === 'dsh-client-manual-continue')
  mkdirSync(packageDirectory, { recursive: true })
  cpSync(join(root, 'src'), join(packageDirectory, 'src'), { recursive: true })
  writeJson(join(packageDirectory, 'package.json'), manifest)
  // The official analyzer recognizes Remote symbols only in registered protocol projects.
  // Stage the installed SDK declarations byte-for-byte; never invent or patch their contracts.
  const require = createRequire(import.meta.url)
  const protocolRoot = dirname(require.resolve('@deepseek-ai/dsh-typert-protocol/package.json'))
  const protocolManifest: unknown = JSON.parse(
    readFileSync(join(protocolRoot, 'package.json'), 'utf8'),
  )
  assert.ok(
    isRecord(protocolManifest) && protocolManifest.name === '@deepseek-ai/dsh-typert-protocol',
  )
  assert.equal(protocolManifest.version, '0.2.2-rc.1')
  const protocolDirectory = join(staging, 'packages', 'typert-protocol')
  mkdirSync(protocolDirectory, { recursive: true })
  cpSync(join(protocolRoot, 'lib', 'types'), join(protocolDirectory, 'declarations'), {
    recursive: true,
  })
  writeJson(join(protocolDirectory, 'package.json'), protocolManifest)
  writeJson(join(protocolDirectory, 'tsconfig.json'), {
    extends: relative(protocolDirectory, join(root, 'tsconfig.host.json')).replaceAll('\\', '/'),
    include: ['declarations/**/*.d.ts'],
    compilerOptions: { composite: true },
  })
  writeJson(join(packageDirectory, 'tsconfig.json'), {
    extends: relative(packageDirectory, join(root, 'tsconfig.host.json')).replaceAll('\\', '/'),
    include: ['src/host/**/*.ts', 'src/shared/**/*.ts'],
    compilerOptions: {
      composite: true,
      paths: { '@deepseek-ai/dsh-typert-protocol': ['../typert-protocol/declarations/index.d.ts'] },
    },
  })
  writeJson(join(staging, 'tsconfig.host.json'), {
    extends: relative(staging, join(root, 'tsconfig.host.json')).replaceAll('\\', '/'),
    files: [],
    include: [],
    compilerOptions: {
      // This generator recognizes cancellation only from a TypeScript standard-library symbol.
      // It is extraction-only: the real Host tsrs project remains Node-only.
      lib: ['ES2023', 'ESNext.Disposable', 'DOM'],
      paths: {
        '@deepseek-ai/dsh-typert-protocol': ['./packages/typert-protocol/declarations/index.d.ts'],
      },
    },
    references: [
      { path: './packages/typert-protocol/tsconfig.json' },
      { path: './packages/manual-continue/tsconfig.json' },
    ],
  })
  const generator = new WorkspaceTypertGenerator(staging, { rejectBuildOutputs: true })
  const artifacts = generator.generate(['dsh-client-manual-continue'], ['host'])
  assert.equal(artifacts.length, 1, 'Generation must not silently succeed with no contribution')
  const artifact = artifacts[0]
  assert.ok(artifact !== undefined)
  assert.equal(artifact.package, 'dsh-client-manual-continue')
  assert.equal(artifact.face, 'host')
  assert.ok(artifact.remote !== undefined, 'The Remote methods require generated strict codecs')
  for (const output of [artifact.js, artifact.dts, artifact.remote.js, artifact.remote.dts]) {
    assert.ok(!output.includes(staging), 'Generated artifacts must not contain a staging location')
  }
  writePackageArtifacts(root, artifacts)
  console.log('Generated one Host contribution and its strict Remote contract')
} finally {
  const target = resolve(staging)
  const ownedName = relative(cache, target)
  assert.ok(
    ownedName.startsWith('typert-') && !ownedName.includes('/') && !ownedName.includes('\\'),
  )
  assert.equal(resolve(cache, ownedName), target)
  rmSync(target, { recursive: true, force: true })
}
