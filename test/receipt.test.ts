import assert from 'node:assert/strict'
import test from 'node:test'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import type { TurnEndReason } from '@deepseek-ai/dsh-session/types'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session/types'
import { createContinuationMessage } from '../src/host/message.ts'
import type { ReceiptIdentity } from '../src/shared/receipt.ts'
import { foldReceipt, initialReceiptState, reconcileReceipt } from '../src/shared/receipt.ts'

const requestId = 'offline_request_0001'

function fixture(reason: TurnEndReason = { kind: 'aborted', reason: { kind: 'user' } }) {
  const session = Session.create(SessionId('receipt-offline'))
  const start = session.append('turn/start', { turn: 1 })
  const end = session.append('turn/end', { turn: 1, reason })
  const state = foldReceipt(foldReceipt(initialReceiptState(session.id), start), end)
  const terminal = { seq: end.seq, turn: 1, reason }
  const message = createContinuationMessage(session.id, terminal, requestId)
  const expected: ReceiptIdentity = {
    sessionId: session.id,
    terminalSeq: end.seq,
    turn: 1,
    requestId,
    messageId: message.id,
  }
  return { session, state, terminal, message, expected }
}

/** Simulates JSON source data from a previous producer without a type assertion. */
function restoredSource(message: UserMessage, source: unknown): UserMessage {
  const restored = { ...message }
  Object.defineProperty(restored, 'source', { value: source, enumerable: true })
  return restored
}

for (const target of ['next-turn', 'next-step'] as const) {
  test(`correlates a committed ${target} insertion with exact operation identity`, () => {
    const { session, state, message, expected } = fixture()
    const event = session.append('agent/inbox/spliced', { target, start: 0, inserted: [message] })
    const next = foldReceipt(state, event)
    assert.deepEqual(reconcileReceipt(next, expected), {
      kind: 'accepted',
      messageId: message.id,
      inboxSeq: event.seq,
    })
    assert.equal(state.candidate?.evidence, null)
    assert.equal(next.asOfSeq, event.seq)
  })
}

test('unknown command outcome with no input evidence stays unknown, never safe-to-retry', () => {
  const { session, state, expected } = fixture()
  const irrelevant = session.append('step/start', { turn: 1, step: 1 })
  assert.deepEqual(reconcileReceipt(foldReceipt(state, irrelevant), expected), {
    kind: 'outcome-unknown',
  })
})

test('an unrelated source cannot stand in for plugin acceptance', () => {
  const { session, state, expected } = fixture()
  const ordinary = createUserMessage({ content: [], source: { kind: 'user' } })
  const event = session.append('agent/inbox/spliced', {
    target: 'next-turn',
    start: 0,
    inserted: [ordinary],
  })
  assert.equal(reconcileReceipt(foldReceipt(state, event), expected).kind, 'outcome-unknown')
})

for (const source of [
  { kind: 'plugin:someone-else' },
  { kind: 'plugin:manual-continue' },
  {
    kind: 'plugin:manual-continue',
    sessionId: 'receipt-offline',
    terminalSeq: 1,
    turn: 1,
    requestId: 'short',
  },
  {
    kind: 'plugin:manual-continue',
    sessionId: 'receipt-offline',
    terminalSeq: 1.5,
    turn: 1,
    requestId,
  },
  {
    kind: 'plugin:manual-continue',
    sessionId: 'receipt-offline',
    terminalSeq: 1,
    turn: 0,
    requestId,
  },
]) {
  test(`validates untrusted source before using it: ${JSON.stringify(source)}`, () => {
    const { session, state, message, expected } = fixture()
    const event = session.append('agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      inserted: [restoredSource(message, source)],
    })
    assert.equal(reconcileReceipt(foldReceipt(state, event), expected).kind, 'outcome-unknown')
  })
}

for (const changed of [{ sessionId: 'another-session' }, { terminalSeq: 0 }, { turn: 2 }]) {
  test(`does not correlate a different candidate: ${JSON.stringify(changed)}`, () => {
    const { session, state, message, expected } = fixture()
    const event = session.append('agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      inserted: [restoredSource(message, { ...message.source, ...changed })],
    })
    assert.equal(reconcileReceipt(foldReceipt(state, event), expected).kind, 'outcome-unknown')
  })
}

test('same request with two independently generated message identities is a conflict', () => {
  const { session, state, message, terminal, expected } = fixture()
  const another = createContinuationMessage(session.id, terminal, requestId)
  assert.notEqual(another.id, message.id)
  const event = session.append('agent/inbox/spliced', {
    target: 'next-turn',
    start: 0,
    inserted: [message, another],
  })
  const next = foldReceipt(state, event)
  assert.equal(reconcileReceipt(next, expected).kind, 'conflict')
  assert.equal(reconcileReceipt(next, { ...expected, messageId: another.id }).kind, 'conflict')
})

test('a different request consuming the same candidate also fails reconciliation', () => {
  const { session, state, message, expected } = fixture()
  const event = session.append('agent/inbox/spliced', {
    target: 'next-turn',
    start: 0,
    inserted: [message],
  })
  const next = foldReceipt(state, event)
  assert.equal(
    reconcileReceipt(next, { ...expected, requestId: 'offline_request_0002' }).kind,
    'conflict',
  )
})

test('the same MessageId paired with another request is a sticky conflict', () => {
  const { session, state, message, expected } = fixture()
  const insertion = session.append('agent/inbox/spliced', {
    target: 'next-turn',
    start: 0,
    inserted: [message],
  })
  const next = foldReceipt(state, insertion)
  const history = session.append(
    'user/message',
    restoredSource(message, { ...message.source, requestId: 'offline_request_0002' }),
    { surfaceOp: 'append' },
  )
  const conflicted = foldReceipt(next, history)
  assert.equal(reconcileReceipt(conflicted, expected).kind, 'conflict')
  const irrelevant = session.append('step/end', { turn: 2, step: 1 })
  assert.equal(reconcileReceipt(foldReceipt(conflicted, irrelevant), expected).kind, 'conflict')
})

for (const canceled of [false, true]) {
  test(`${canceled ? 'cancel' : 'claim'} is not model start and cannot erase acceptance`, () => {
    const { session, state, message, expected } = fixture()
    const insertion = session.append('agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      inserted: [message],
    })
    const queued = foldReceipt(state, insertion)
    const removal = session.append('agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      removedCount: 1,
      inserted: [],
      ...(canceled ? { outcome: 'canceled' } : {}),
    })
    const removed = foldReceipt(queued, removal)
    assert.deepEqual(reconcileReceipt(removed, expected), {
      kind: 'accepted',
      messageId: message.id,
      inboxSeq: insertion.seq,
    })
    assert.equal(removed.candidate?.evidence?.historySeq, null)
    assert.equal(Object.hasOwn(removed, 'modelStarted'), false)
    assert.equal(Object.hasOwn(removed, 'completed'), false)
    assert.equal(Object.hasOwn(removed, 'persisted'), false)
  })
}

test('a removal without plugin acceptance evidence stays unknown', () => {
  const { session, state, expected } = fixture()
  const unrelated = createUserMessage({ content: [], source: { kind: 'user' } })
  const inserted = foldReceipt(
    state,
    session.append('agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      inserted: [unrelated],
    }),
  )
  const removal = session.append('agent/inbox/spliced', {
    target: 'next-turn',
    start: 0,
    removedCount: 1,
    inserted: [],
    outcome: 'canceled',
  })
  assert.equal(reconcileReceipt(foldReceipt(inserted, removal), expected).kind, 'outcome-unknown')
})

test('re-inserting the same identity after removal is a conflict, not a fresh acceptance', () => {
  const { session, state, message, expected } = fixture()
  const inserted = foldReceipt(
    state,
    session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }),
  )
  const removed = foldReceipt(
    inserted,
    session.append('agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      removedCount: 1,
      inserted: [],
      outcome: 'canceled',
    }),
  )
  const repeated = foldReceipt(
    removed,
    session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }),
  )
  assert.equal(reconcileReceipt(repeated, expected).kind, 'conflict')
})

test('observed history advances evidence but still does not assert model execution or durability', () => {
  const { session, state, message, expected } = fixture()
  const insertion = session.append('agent/inbox/spliced', {
    target: 'next-turn',
    start: 0,
    inserted: [message],
  })
  const queued = foldReceipt(state, insertion)
  const start = session.append('turn/start', { turn: 2 })
  const startedTurn = foldReceipt(queued, start)
  assert.equal(reconcileReceipt(startedTurn, expected).kind, 'accepted')
  const history = session.append('user/message', message, { surfaceOp: 'append' })
  assert.deepEqual(reconcileReceipt(foldReceipt(startedTurn, history), expected), {
    kind: 'in-history',
    messageId: message.id,
    inboxSeq: insertion.seq,
    historySeq: history.seq,
  })
})

test('an exact user/message is independently sufficient history evidence', () => {
  const { session, state, message, expected } = fixture()
  const history = session.append('user/message', message, { surfaceOp: 'append' })
  assert.deepEqual(reconcileReceipt(foldReceipt(state, history), expected), {
    kind: 'in-history',
    messageId: message.id,
    inboxSeq: null,
    historySeq: history.seq,
  })
})

test('only the newest eligible candidate is retained; previous operations become stale', () => {
  const { session, state, message, expected } = fixture()
  let next = foldReceipt(
    state,
    session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }),
  )
  next = foldReceipt(next, session.append('turn/start', { turn: 2 }))
  const end = session.append('turn/end', { turn: 2, reason: { kind: 'max-tokens' } })
  next = foldReceipt(next, end)
  assert.equal(next.candidate?.terminalSeq, end.seq)
  assert.equal(next.candidate?.evidence, null)
  assert.equal(reconcileReceipt(next, expected).kind, 'stale')
  assert.equal(Object.hasOwn(next, 'history'), false)
  assert.equal(Object.hasOwn(next, 'receipts'), false)
})

test('normal completion does not become a new candidate or erase the most recent receipt', () => {
  const { session, state, message, expected } = fixture()
  let next = foldReceipt(
    state,
    session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }),
  )
  next = foldReceipt(next, session.append('turn/start', { turn: 2 }))
  next = foldReceipt(next, session.append('turn/end', { turn: 2, reason: { kind: 'completed' } }))
  assert.equal(next.candidate?.terminalSeq, expected.terminalSeq)
  assert.equal(reconcileReceipt(next, expected).kind, 'accepted')
})

test('rejects duplicate, out-of-order and missing event sequences', () => {
  const { session, state } = fixture()
  const old = session.eventAt(SessionSeq(1))
  assert.ok(old)
  assert.throws(() => foldReceipt(state, old), /contiguous increasing/)
  const skipped = session.append('step/start', { turn: 2, step: 1 })
  const later = session.append('step/end', { turn: 2, step: 1 })
  assert.throws(() => foldReceipt(state, later), /contiguous increasing/)
  assert.equal(foldReceipt(state, skipped).asOfSeq, skipped.seq)
})

test('future candidate evidence or another Session cannot satisfy this operation', () => {
  const { state, expected } = fixture()
  assert.equal(
    reconcileReceipt(state, { ...expected, terminalSeq: SessionSeq(100) }).kind,
    'outcome-unknown',
  )
  assert.equal(
    reconcileReceipt(state, { ...expected, sessionId: SessionId('other-session') }).kind,
    'stale',
  )
})

test('unmatched terminal cannot invent a candidate', () => {
  const session = Session.create(SessionId('receipt-incomplete'))
  const end = session.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
  const state = foldReceipt(initialReceiptState(session.id), end)
  assert.equal(state.candidate, null)
})
