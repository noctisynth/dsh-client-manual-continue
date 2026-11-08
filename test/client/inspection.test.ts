import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClientCordisInspectProviderRegistration } from '@deepseek-ai/dsh-cordis-client-runner/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FactsSource } from '../../src/client/facts.ts'
import { ContinuationInspection, describeFacts } from '../../src/client/inspection.ts'

const context = {
  signal: new AbortController().signal,
  sessionId: SessionId('not-the-viewed-session'),
}
function facts(): FactsSource {
  return {
    sessionId: 'private-fixture-session',
    session: {
      sessionId: SessionId('private-fixture-session'),
      running: false,
      removed: false,
      openState: 'open',
      subagent: null,
      pendingSubmissions: [],
    },
    status: { running: false, pendingInteraction: undefined, completionUnread: false },
    projection: { candidate: { terminalSeq: 2, turn: 1, reasonKind: 'aborted' } },
    input: {
      draft: 'private-fixture-draft',
      attachmentIds: [],
      draftRev: 1,
      phase: 'plain',
      occurrences: [],
      queue: [],
    },
    generation: 1,
    connected: true,
    ownerVerified: true,
    access: true,
    blocked: false,
  }
}

test('the browser-safe provider seam satisfies the complete published registry contract', () => {
  const registration: ClientCordisInspectProviderRegistration = new ContinuationInspection()
    .provider
  assert.equal(registration.manifest.id, 'ManualContinue')
})

test('inspection returns anonymous gate values without identity, input or terminal coordinates', async () => {
  const inspection = new ContinuationInspection()
  let reads = 0
  inspection.register(() => {
    reads += 1
    return describeFacts(facts())
  })
  assert.equal(reads, 0)
  const result = await inspection.provider.query('snapshot', {}, context)
  assert.equal(reads, 1)
  const json = JSON.stringify(result)
  for (const forbidden of [
    'private-fixture-session',
    'private-fixture-draft',
    'terminalSeq',
    'draftRev',
  ]) {
    assert.equal(json.includes(forbidden), false)
  }
  assert.deepEqual(result, {
    available: true,
    occurrences: [{ ordinal: 0, gates: describeFacts(facts()) }],
  })
  assert.equal(json.includes('"reason":"text"'), true)
})

test('snapshot never registers or retains an occurrence after its lifecycle ends', async () => {
  const inspection = new ContinuationInspection()
  const release = inspection.register(() => ({ present: true }))
  release()
  release()
  assert.deepEqual(await inspection.provider.query('snapshot', {}, context), {
    available: true,
    occurrences: [],
  })
  inspection.register(() => ({ present: true }))
  inspection.dispose()
  inspection.dispose()
  inspection.register(() => {
    throw new Error('Disposed readers must not be retained')
  })
  assert.deepEqual(await inspection.provider.query('snapshot', {}, context), {
    available: false,
    occurrences: [],
  })
})

test('canceled queries do not invoke readers', async () => {
  const inspection = new ContinuationInspection()
  inspection.register(() => {
    throw new Error('Canceled query read a live gate')
  })
  const abort = new AbortController()
  abort.abort()
  assert.deepEqual(
    await inspection.provider.query('snapshot', {}, { ...context, signal: abort.signal }),
    {
      available: false,
      occurrences: [],
    },
  )
})

test('only the declared empty read-only query is accepted', async () => {
  const inspection = new ContinuationInspection()
  await assert.rejects(inspection.provider.query('activate', {}, context))
  for (const input of [null, [], { sessionId: 'must-not-select' }, 'refresh']) {
    await assert.rejects(inspection.provider.query('snapshot', input, context))
  }
  assert.deepEqual(
    inspection.provider.manifest.methods.map((method) => method.name),
    ['snapshot'],
  )
})

test('a failed reader reveals no exception, stack, draft or account information', async () => {
  const inspection = new ContinuationInspection()
  inspection.register(() => {
    throw new Error('private-fixture-draft')
  })
  assert.deepEqual(await inspection.provider.query('snapshot', {}, context), {
    available: true,
    occurrences: [{ ordinal: 0, gates: { available: false } }],
  })
})
