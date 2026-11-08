import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import type { TurnEndReason } from '@deepseek-ai/dsh-session/types'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session/types'
import { foldEvent, initialState, terminalDisposition } from '../src/shared/continuation.ts'

function terminal(reason: TurnEndReason) {
  const session = Session.create(SessionId('offline-test'))
  const start = session.append('turn/start', { turn: 1 })
  const end = session.append('turn/end', { turn: 1, reason })
  return { session, state: foldEvent(foldEvent(initialState(), start), end) }
}

test('an explicit user stop is a confirmed terminal candidate', () => {
  const { state } = terminal({ kind: 'aborted', reason: { kind: 'user' } })
  assert.equal(terminalDisposition(state).kind, 'candidate')
  assert.equal(state.terminal?.seq, 1)
})

for (const reason of [
  { kind: 'completed' },
  { kind: 'blocked' },
  { kind: 'forked' },
  { kind: 'aborted', reason: { kind: 'parent' } },
  { kind: 'aborted', reason: { kind: 'hook', reason: 'external hook' } },
  { kind: 'aborted', reason: { kind: 'disposed' } },
  { kind: 'aborted', reason: { kind: 'legacy' } },
] satisfies TurnEndReason[]) {
  test(`does not offer ${JSON.stringify(reason)}`, () => {
    assert.equal(terminalDisposition(terminal(reason).state).kind, 'unavailable')
  })
}

for (const reason of [
  { kind: 'error', error: { code: 'RATE_LIMIT', message: 'rate limit' } },
  { kind: 'error', error: { code: 'SERVER', message: 'server failure' } },
  { kind: 'error', error: { code: 'TIMEOUT', message: 'timeout' } },
  { kind: 'error', error: { code: 'TRANSPORT', message: 'transport failure' } },
  { kind: 'error', error: { code: 'EMPTY_RESPONSE', message: 'empty response' } },
  { kind: 'error', error: { code: 'STREAM_CLOSED', message: 'stream closed' } },
  { kind: 'error', error: { code: 'UNKNOWN', message: 'unknown failure' } },
  { kind: 'error', error: { code: 'AUTHENTICATION', message: 'credentials must be fixed' } },
  { kind: 'error', error: { code: 'MODEL_NOT_FOUND', message: 'user may change the model' } },
  { kind: 'error', error: { code: 'INSUFFICIENT_BALANCE', message: 'insufficient balance' } },
  { kind: 'max-tokens' },
  { kind: 'interrupted' },
] satisfies TurnEndReason[]) {
  test(`offers a manual terminal candidate for ${JSON.stringify(reason)}`, () => {
    const { state } = terminal(reason)
    assert.equal(terminalDisposition(state).kind, 'candidate')
    assert.deepEqual(state.terminal?.reason, reason)
  })
}

test('a new turn makes the old candidate stale even before its terminal arrives', () => {
  const { session, state } = terminal({ kind: 'aborted', reason: { kind: 'user' } })
  const next = foldEvent(state, session.append('turn/start', { turn: 2 }))
  assert.equal(terminalDisposition(next).kind, 'unavailable')
  assert.equal(next.activeTurn, 2)
})

test('does not infer interruption from missing or mismatched terminal/start pairs', () => {
  const session = Session.create(SessionId('incomplete-test'))
  const end = session.append('turn/end', { turn: 7, reason: { kind: 'interrupted' } })
  const unmatched = foldEvent(initialState(), end)
  assert.equal(terminalDisposition(unmatched).kind, 'unavailable')
  const start = session.append('turn/start', { turn: 8 })
  assert.equal(terminalDisposition(foldEvent(unmatched, start)).kind, 'unavailable')
})

test('rejects replayed or out-of-order sequences instead of reviving a candidate', () => {
  const { session, state } = terminal({ kind: 'aborted', reason: { kind: 'user' } })
  const event = session.eventAt(state.terminal?.seq ?? SessionSeq(0))
  assert.ok(event)
  assert.throws(() => foldEvent(state, event), /strictly increasing/)
})

test('missing a committed competing input cannot leave an apparently valid old candidate', () => {
  const { session, state } = terminal({ kind: 'aborted', reason: { kind: 'user' } })
  const message = createUserMessage({ content: [], source: { kind: 'user' } })
  session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] })
  const later = session.append('step/end', { turn: 1, step: 1 })
  assert.throws(() => foldEvent(state, later), /contiguous/)
})

test('folding does not mutate committed session history or its original error', () => {
  const reason = { kind: 'error', error: { code: 'SERVER', message: 'original failure' } } as const
  const { session, state } = terminal(reason)
  const before = JSON.stringify(session.snapshotEvents())
  terminalDisposition(state)
  assert.equal(JSON.stringify(session.snapshotEvents()), before)
})

for (const target of ['next-turn', 'next-step'] as const) {
  test(`competing ${target} input invalidates a candidate, even if later canceled`, () => {
    const { session, state } = terminal({ kind: 'aborted', reason: { kind: 'user' } })
    const message = createUserMessage({
      content: [{ type: 'text', text: 'new input' }],
      source: { kind: 'user' },
    })
    const insertion = session.append('agent/inbox/spliced', {
      target,
      start: 0,
      inserted: [message],
    })
    const queued = foldEvent(state, insertion)
    assert.equal(terminalDisposition(queued).kind, 'unavailable')
    const removal = session.append('agent/inbox/spliced', {
      target,
      start: 0,
      removedCount: 1,
      inserted: [],
      outcome: 'canceled',
    })
    assert.equal(terminalDisposition(foldEvent(queued, removal)).kind, 'unavailable')
  })
}

test('committed user input invalidates the previous candidate without rewriting history', () => {
  const { session, state } = terminal({ kind: 'aborted', reason: { kind: 'user' } })
  const message = createUserMessage({
    content: [{ type: 'text', text: 'new input' }],
    source: { kind: 'user' },
  })
  const event = session.append('user/message', message, { surfaceOp: 'append' })
  const next = foldEvent(state, event)
  assert.equal(terminalDisposition(next).kind, 'unavailable')
  assert.equal(terminalDisposition(state).kind, 'candidate')
  assert.equal(session.eventAt(SessionSeq(1))?.type, 'turn/end')
})
