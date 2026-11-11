import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const expectedScripts = {
  changeset: 'semifold commit',
  'release:check': 'semifold config sync --check',
  'release:status': 'semifold status',
  'release:version': 'semifold version',
  'release:publish': 'semifold publish',
  'release:ci': 'semifold ci',
}

test('release scripts use the executable provided by the official binary installer', () => {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  )
  assert.ok(typeof manifest === 'object' && manifest !== null && 'scripts' in manifest)
  const scripts = manifest.scripts
  assert.ok(typeof scripts === 'object' && scripts !== null)
  for (const [name, command] of Object.entries(expectedScripts)) {
    assert.equal(Reflect.get(scripts, name), command, `Incorrect release entry: ${name}`)
  }
})

test('CI verifies the installed Semifold executable before installing project dependencies', () => {
  const setup = readFileSync(new URL('../.github/actions/setup/action.yml', import.meta.url), 'utf8')
  const verify = setup.indexOf('run: semifold --version')
  const install = setup.indexOf('run: pnpm install --frozen-lockfile')
  assert.ok(verify >= 0, 'CI must check the executable actually invoked by release scripts')
  assert.ok(install > verify, 'Executable verification must precede dependency installation')
})
