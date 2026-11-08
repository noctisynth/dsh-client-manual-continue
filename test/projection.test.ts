import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { ProviderRequestId } from '@deepseek-ai/dsh-llm/brand'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session/types'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { createContinuationMessage } from '../src/host/message.ts'
import type { QualificationProjectionState } from '../src/host/projection.ts'
import { qualificationDefinition, receiptDefinition } from '../src/host/projection.ts'
import { reconcileReceipt } from '../src/shared/receipt.ts'

async function fixture(t: TestContext) {
  const ctx = new Context()
  t.after(async () => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  const qualification = await ctx.sessionProjections.register(qualificationDefinition)
  const receipt = await ctx.sessionProjections.register(receiptDefinition)
  return { ctx, qualification, receipt }
}

function failedSession(ctx: Context, id = 'projection-offline') {
  const session = ctx.sessions.create(SessionId(id))
  session.append('turn/start', { turn: 1 })
  const end = session.append('turn/end', {
    turn: 1,
    reason: { kind: 'error', error: { code: 'UNKNOWN', message: 'original private failure' } },
  })
  return { session, end }
}

test('awaited real registry handles expose state; wire contains only a terminal hint', async (t) => {
  const { ctx, qualification, receipt } = await fixture(t)
  const { session, end } = failedSession(ctx)
  const state = qualification.stateOf(session)
  assert.equal(state.sessionId, session.header.id)
  assert.equal(state.inheritedEventCount, session.inheritedEventCount)
  assert.equal(state.asOfSeq, end.seq)
  const snapshot = ctx.sessionProjections.snapshot(session)
  assert.equal(snapshot.asOfSeq, end.seq)
  assert.deepEqual(snapshot.values.manualContinue, {
    candidate: { terminalSeq: end.seq, turn: 1, reasonKind: 'error' },
  })
  assert.equal(Object.hasOwn(snapshot.values, 'manualContinueReceipt'), false)
  assert.equal(JSON.stringify(snapshot).includes('original private failure'), false)
  assert.equal(JSON.stringify(snapshot).includes('eligible'), false)
  assert.equal(JSON.stringify(snapshot).includes('authorized'), false)
  assert.equal(receipt.stateOf(session).candidate?.terminalSeq, end.seq)
})

test('checkpoint validation preserves structured failure facts without modifying original history', async (t) => {
  const { ctx, qualification } = await fixture(t)
  const session = ctx.sessions.create(SessionId('structured-failure'))
  session.append('turn/start', { turn: 1 })
  const failure = {
    code: 'AUTHENTICATION',
    message: 'original provider failure',
    status: 401,
    providerRetryAfterMs: 1000,
    requestId: ProviderRequestId('offline-provider-request'),
    offloadImages: 2,
  }
  session.append('turn/end', { turn: 1, reason: { kind: 'error', error: failure } })
  const before = JSON.stringify(session.snapshotEvents())
  const checkpoint = ctx.sessionProjections.checkpoint(session)
  const parsed = qualificationDefinition.stateSchema.parse(checkpoint.manualContinue?.val)
  assert.deepEqual(parsed, qualification.stateOf(session))
  assert.deepEqual(parsed.terminal?.reason, { kind: 'error', error: failure })
  ctx.sessionProjections.viewCheckpoint(checkpoint)
  assert.equal(JSON.stringify(session.snapshotEvents()), before)
  assert.equal(
    JSON.stringify(ctx.sessionProjections.snapshot(session)).includes(failure.requestId),
    false,
  )
})

test('wire raw references suppress publication when only the internal cursor changes', async (t) => {
  const { ctx, qualification } = await fixture(t)
  const { session } = failedSession(ctx)
  const before = qualificationDefinition.wire.view(qualification.stateOf(session))
  let notifications = 0
  const stop = ctx.sessionProjections.onChanged((_session, key) => {
    if (key === 'manualContinue') notifications += 1
  })
  // The registry's observation cache starts lazily, so establish its first raw view.
  session.append('model/selection', { provider: 'offline-provider', model: 'offline-model-one' })
  const established = notifications
  session.append('model/selection', { provider: 'offline-provider', model: 'offline-model-two' })
  const after = qualificationDefinition.wire.view(qualification.stateOf(session))
  assert.equal(after, before)
  assert.equal(notifications, established)
  stop()
})

test('real fork history cannot become a current qualification or receipt candidate', async (t) => {
  const { ctx, qualification, receipt } = await fixture(t)
  const { session: source } = failedSession(ctx, 'source')
  const child = ctx.sessions.fork(source, undefined, SessionId('child'))
  assert.ok(child.inheritedEventCount > 0)
  assert.deepEqual(ctx.sessionProjections.snapshot(child).values.manualContinue, {
    candidate: null,
  })
  assert.equal(qualification.stateOf(child).terminal, null)
  assert.equal(receipt.stateOf(child).candidate, null)
  assert.equal(receipt.stateOf(child).sessionId, child.id)
  child.append('turn/start', { turn: 2 })
  const ownEnd = child.append('turn/end', {
    turn: 2,
    reason: { kind: 'aborted', reason: { kind: 'user' } },
  })
  assert.equal(qualification.stateOf(child).terminal?.seq, ownEnd.seq)
  assert.equal(receipt.stateOf(child).candidate?.terminalSeq, ownEnd.seq)
  const grandchild = ctx.sessions.fork(child, undefined, SessionId('grandchild'))
  assert.deepEqual(ctx.sessionProjections.snapshot(grandchild).values.manualContinue, {
    candidate: null,
  })
  assert.equal(receipt.stateOf(grandchild).candidate, null)
})

test('an empty inherited fork cut also remains unavailable until own work ends', async (t) => {
  const { ctx, qualification, receipt } = await fixture(t)
  const source = ctx.sessions.create(SessionId('empty-source'))
  const child = ctx.sessions.fork(source, undefined, SessionId('empty-child'))
  assert.equal(child.inheritedEventCount, 0)
  assert.equal(qualification.stateOf(child).terminal, null)
  assert.equal(receipt.stateOf(child).candidate, null)
})

test('receipt definition observes real committed insertions without leaking source to wire', async (t) => {
  const { ctx, qualification, receipt } = await fixture(t)
  const { session, end } = failedSession(ctx)
  const message = createContinuationMessage(
    session.id,
    { seq: end.seq, turn: 1, reason: end.data.reason },
    'offline_projection_001',
  )
  session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] })
  assert.equal(qualification.stateOf(session).terminal, null)
  const evidence = reconcileReceipt(receipt.stateOf(session), {
    sessionId: session.id,
    terminalSeq: end.seq,
    turn: 1,
    requestId: message.source.requestId,
    messageId: message.id,
  })
  assert.equal(evidence.kind, 'accepted')
  const snapshot = ctx.sessionProjections.snapshot(session)
  assert.deepEqual(snapshot.values.manualContinue, { candidate: null })
  assert.equal(JSON.stringify(snapshot).includes(message.source.requestId), false)
  assert.equal(JSON.stringify(snapshot).includes(message.id), false)
})

test('strict state schemas reject malformed checkpoints and keep valid state plain JSON', async (t) => {
  const { ctx, qualification, receipt } = await fixture(t)
  const { session } = failedSession(ctx)
  const qualificationState = qualification.stateOf(session)
  const receiptState = receipt.stateOf(session)
  assert.deepEqual(
    qualificationDefinition.stateSchema.parse(JSON.parse(JSON.stringify(qualificationState))),
    qualificationState,
  )
  assert.deepEqual(
    receiptDefinition.stateSchema.parse(JSON.parse(JSON.stringify(receiptState))),
    receiptState,
  )
  for (const malformed of [
    { ...qualificationState, sessionId: 1 },
    { ...qualificationState, inheritedEventCount: -1 },
    { ...qualificationState, extraAuthority: true },
    { ...qualificationState, terminal: { turn: 1, seq: 999, reason: { kind: 'max-tokens' } } },
    {
      ...qualificationState,
      terminal: { turn: 1, seq: 1, reason: { kind: 'error', error: { code: 1, message: 'bad' } } },
    },
  ]) {
    assert.equal(qualificationDefinition.stateSchema.safeParse(malformed).success, false)
  }
  assert.equal(
    receiptDefinition.stateSchema.safeParse({
      ...receiptState,
      candidate: {
        terminalSeq: 1,
        turn: 1,
        evidence: {
          requestId: 'offline_projection_001',
          messageId: 'message',
          inboxSeq: 0,
          historySeq: null,
          conflict: false,
        },
      },
    }).success,
    false,
  )
  assert.equal(
    qualificationDefinition.wire.viewSchema.safeParse({
      candidate: { terminalSeq: 1, turn: 1, reasonKind: 'error', source: 'not-public' },
    }).success,
    false,
  )
})

test('registry rejects invalid cached wire state and can restore a valid fork checkpoint', async (t) => {
  const { ctx, qualification } = await fixture(t)
  const { session: source } = failedSession(ctx, 'restore-source')
  const child = ctx.sessions.fork(source, undefined, SessionId('restore-child'))
  const checkpoint = ctx.sessionProjections.checkpoint(child)
  const row = checkpoint.manualContinue
  assert.ok(row)
  assert.deepEqual(ctx.sessionProjections.viewCheckpoint(checkpoint), {
    manualContinue: { candidate: null },
  })
  const invalid = {
    ...checkpoint,
    manualContinue: { ...row, val: { sessionId: child.id, eligible: true } },
  }
  assert.equal(
    Object.hasOwn(ctx.sessionProjections.viewCheckpoint(invalid), 'manualContinue'),
    false,
  )
  const restored = ctx.sessionProjections.restore(
    checkpoint,
    child.snapshotEvents(),
    SessionLogOffset(0),
    child.header,
    child.inheritedEventCount,
  )
  assert.deepEqual(restored.snapshot.values.manualContinue, { candidate: null })
  assert.deepEqual(
    qualificationDefinition.stateSchema.parse(restored.checkpoint.manualContinue?.val),
    qualification.stateOf(child),
  )
})

test('exact handle disposal removes wire only after its final registration reference', async (t) => {
  const { ctx, qualification } = await fixture(t)
  const duplicate = await ctx.sessionProjections.register(qualificationDefinition)
  const { session } = failedSession(ctx)
  await qualification.dispose()
  assert.ok(ctx.sessionProjections.snapshot(session).values.manualContinue?.candidate)
  await duplicate.dispose()
  assert.equal(
    Object.hasOwn(ctx.sessionProjections.snapshot(session).values, 'manualContinue'),
    false,
  )
  // SDK retained handles remain readable; an operation owner must independently stop using them.
  assert.ok(qualification.stateOf(session).terminal)
})

test('consumer fiber disposal withdraws its projection registration', async (t) => {
  const ctx = new Context()
  t.after(async () => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  let handle: ProjectionHandle<QualificationProjectionState> | undefined
  const owner = await ctx.plugin({
    inject: ['sessionProjections'],
    async apply(child: Context) {
      handle = await child.sessionProjections.register(qualificationDefinition)
    },
  })
  assert.ok(handle)
  const { session } = failedSession(ctx)
  assert.ok(handle.stateOf(session).terminal)
  await owner.dispose()
  assert.equal(
    Object.hasOwn(ctx.sessionProjections.snapshot(session).values, 'manualContinue'),
    false,
  )
})
