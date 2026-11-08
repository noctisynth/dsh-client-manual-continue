import assert from 'node:assert/strict'
import test from 'node:test'
import { Session } from '@deepseek-ai/dsh-session'
import { SessionSeq } from '@deepseek-ai/dsh-session/types'
import * as host from 'dsh-client-manual-continue'
import { createContinuationMessage } from '../src/host/message.ts'
import { deferred, fixture, ordinaryInput } from './host-fixture.ts'

// Offline operation units: real Cordis/Session/Agent registries, a structural Agent and a
// two-read Gateway double. These are not real Loader/Gateway or human-click acceptance tests.

test('owner input uses plugin attribution and reports acceptance only after two barriers', async (t) => {
  const f = await fixture(t)
  const result = await f.receiver('submit').submit(f.request)
  assert.equal(result.kind, 'accepted')
  if (result.kind !== 'accepted') assert.fail('Expected accepted input')
  assert.equal(result.durability, 'confirmed')
  assert.equal(f.agent.followups, 1)
  assert.equal(f.flushes, 2)
  assert.equal(f.agent.maintenanceEntries, 1)
  const message = f.agent.inbox.nextTurn[0]
  assert.ok(message)
  assert.equal(message.id, result.messageId)
  assert.equal(message.role, 'user')
  assert.equal(message.source.kind, 'plugin:manual-continue')
  assert.equal(f.agent.cancels, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
  assert.equal(
    f.session.snapshotEvents().filter((event) => event.type === 'user/message').length,
    0,
  )
  const reconciled = f.receiver('reconcile').reconcile(f.request)
  assert.equal(reconciled.kind, 'already-accepted')
  assert.equal(f.agent.followups, 1)
})

test('missing or non-owner invocation is rejected without creating or resuming an Agent', async (t) => {
  const f = await fixture(t)
  const direct = f.ctx.get('manualContinue')
  assert.ok(direct)
  assert.deepEqual(await direct.submit(f.request), { kind: 'forbidden' })
  const guest = { ...f.peer }
  Object.defineProperty(guest, 'principal', { value: { kind: 'offline-guest' } })
  assert.deepEqual(await f.receiver('submit', undefined, guest).submit(f.request), {
    kind: 'forbidden',
  })
  assert.deepEqual(await f.receiver('reconcile').submit(f.request), { kind: 'forbidden' })
  assert.equal(f.coldCalls, 0)
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.whenIdleCalls, 0)
})

test('invalid JSON shape and unknown exact session cannot trigger cold resume', async (t) => {
  const f = await fixture(t)
  const invalid = { ...f.request, requestedBy: 'human-click' }
  assert.deepEqual(await f.receiver('submit').submit(invalid), { kind: 'invalid-request' })
  assert.deepEqual(await f.receiver('submit').submit({ ...f.request, sessionId: 'not-live' }), {
    kind: 'unavailable',
  })
  assert.equal(f.coldCalls, 0)
  assert.equal(f.agent.followups, 0)
})

test('a registered handle with a different exact Session is unavailable', async (t) => {
  const f = await fixture(t)
  const different = Session.create(f.session.id)
  const replacement = await f.replacement(undefined, different)
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'unavailable' })
  assert.equal(replacement.followups, 0)
})

test('a live child Agent cannot bypass its registered parent ownership', async (t) => {
  const f = await fixture(t)
  const owner = await f.owner()
  const child = await f.replacement(owner)
  assert.ok(f.ctx.agents.isOwnedBy(child.id, owner))
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'unavailable' })
  assert.equal(child.followups, 0)
})

test('a disposed Agent scope cannot retain authority through a live registry entry', async (t) => {
  const f = await fixture(t)
  await f.agent.ctx.fiber.dispose()
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'unavailable' })
  assert.equal(f.agent.followups, 0)
})

test('stale terminal coordinates never submit input', async (t) => {
  const f = await fixture(t)
  assert.deepEqual(await f.receiver('submit').submit({ ...f.request, terminalSeq: 0 }), {
    kind: 'stale',
  })
  assert.equal(f.agent.followups, 0)
})

test('pending inputs and owner interaction requests have priority', async (t) => {
  const f = await fixture(t)
  f.gateway.block(f.session.id)
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'pending-interaction' })
  f.gateway.pending = []
  f.agent.inbox.append('next-step', ordinaryInput())
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'pending-input' })
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
})

test('no live owner Client or no durability listener fails closed before insertion', async (t) => {
  const f = await fixture(t, { flush: false })
  f.gateway.connected = false
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'unavailable' })
  f.gateway.connected = true
  assert.equal(await f.ctx.sessions.flush(f.session), false)
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'unavailable' })
  assert.equal(f.agent.followups, 0)
})

test('concurrent double clicks are bounded to one native followup', async (t) => {
  const f = await fixture(t)
  const idle = f.gate()
  f.agent.idleGate = idle.promise
  f.agent.phase = 'running'
  const first = f.receiver('submit').submit(f.request)
  await f.agent.idleEntered.promise
  assert.deepEqual(
    await f.receiver('submit').submit({ ...f.request, requestId: 'host_operation_0002' }),
    { kind: 'busy' },
  )
  assert.equal(f.receiver('reconcile').reconcile(f.request).kind, 'outcome-unknown')
  f.agent.phase = 'idle'
  idle.resolve()
  assert.equal((await first).kind, 'accepted')
  assert.equal((await f.receiver('submit').submit(f.request)).kind, 'already-accepted')
  assert.equal(f.agent.followups, 1)
})

test('a new maintenance owner after whenIdle is rejected by native admission', async (t) => {
  const f = await fixture(t)
  f.agent.onBeforeMaintenance = () => {
    f.agent.phase = 'maintenance'
  }
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'busy' })
  assert.equal(f.agent.status, 'idle')
  assert.equal(f.agent.followups, 0)
})

test('competing input arriving while old activity drains is checked after waiting', async (t) => {
  const f = await fixture(t)
  const idle = f.gate()
  f.agent.idleGate = idle.promise
  const result = f.receiver('submit').submit(f.request)
  await f.agent.idleEntered.promise
  const competing = ordinaryInput()
  f.agent.inbox.append('next-turn', competing)
  idle.resolve()
  assert.deepEqual(await result, { kind: 'pending-input' })
  assert.equal(f.agent.inbox.nextTurn[0]?.id, competing.id)
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
})

test('Agent replacement during whenIdle cannot redirect an old operation', async (t) => {
  const f = await fixture(t)
  const idle = f.gate()
  f.agent.idleGate = idle.promise
  const result = f.receiver('submit').submit(f.request)
  await f.agent.idleEntered.promise
  const replacement = await f.replacement()
  idle.resolve()
  assert.deepEqual(await result, { kind: 'unavailable' })
  assert.equal(f.agent.followups, 0)
  assert.equal(replacement.followups, 0)
})

test('terminal durability wait is followed by a fresh competition check', async (t) => {
  const f = await fixture(t)
  const barrier = f.gate()
  const entered = deferred<void>()
  f.setFlushHook((index) => {
    if (index !== 1) return
    entered.resolve()
    return barrier.promise
  })
  const result = f.receiver('submit').submit(f.request)
  await entered.promise
  const competing = ordinaryInput()
  f.agent.inbox.append('next-turn', competing)
  barrier.resolve()
  assert.deepEqual(await result, { kind: 'pending-input' })
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.inbox.nextTurn[0]?.id, competing.id)
})

test('an interaction arriving during the terminal barrier blocks admission', async (t) => {
  const f = await fixture(t)
  f.setFlushHook((index) => {
    if (index === 1) f.gateway.block(f.session.id)
  })
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'pending-interaction' })
  assert.equal(f.agent.followups, 0)
})

test('terminal changes during durability wait invalidate the original candidate', async (t) => {
  const f = await fixture(t)
  f.setFlushHook((index) => {
    if (index !== 1) return
    f.session.append('turn/start', { turn: 2 })
    f.session.append('turn/end', { turn: 2, reason: { kind: 'max-tokens' } })
  })
  assert.deepEqual(await f.receiver('submit').submit(f.request), { kind: 'stale' })
  assert.equal(f.agent.followups, 0)
})

for (const placement of ['before', 'after'] as const) {
  test(`a followup throw ${placement} insertion is reconciled without reposting`, async (t) => {
    const f = await fixture(t)
    f.agent.failFollowup = placement
    assert.equal((await f.receiver('submit').submit(f.request)).kind, 'outcome-unknown')
    const second = await f.receiver('submit').submit(f.request)
    assert.equal(second.kind, placement === 'after' ? 'already-accepted' : 'outcome-unknown')
    assert.equal(f.agent.followups, 1)
    assert.equal(f.agent.inbox.nextTurn.length, placement === 'after' ? 1 : 0)
    assert.equal(f.agent.inbox.clearCalls, 0)
  })
}

test('failed input barrier preserves accepted input and reports unknown durability', async (t) => {
  const f = await fixture(t)
  f.setFlushHook((index) => {
    if (index === 2) throw new Error('Offline checkpoint failure')
  })
  assert.equal((await f.receiver('submit').submit(f.request)).kind, 'outcome-unknown')
  const result = f.receiver('reconcile').reconcile(f.request)
  assert.equal(result.kind, 'already-accepted')
  if (result.kind !== 'already-accepted') assert.fail('Expected log-observed evidence')
  assert.equal(result.durability, 'unknown')
  assert.equal(f.agent.inbox.nextTurn.length, 1)
  assert.equal(f.agent.followups, 1)
  assert.equal(f.agent.inbox.clearCalls, 0)
})

test('identity conflicts arising during the input barrier remain unknown and cannot be reposted', async (t) => {
  const f = await fixture(t)
  const end = f.session.eventAt(SessionSeq(f.request.terminalSeq))
  assert.ok(end?.type === 'turn/end')
  f.setFlushHook((index) => {
    if (index !== 2) return
    const conflicting = createContinuationMessage(
      f.session.id,
      { seq: end.seq, turn: end.data.turn, reason: end.data.reason },
      f.request.requestId,
    )
    f.agent.inbox.append('next-turn', conflicting)
  })
  assert.equal((await f.receiver('submit').submit(f.request)).kind, 'outcome-unknown')
  assert.equal(f.receiver('reconcile').reconcile(f.request).kind, 'outcome-unknown')
  assert.equal((await f.receiver('submit').submit(f.request)).kind, 'outcome-unknown')
  assert.equal(f.agent.followups, 1)
  assert.equal(f.agent.inbox.nextTurn.length, 2)
  assert.equal(f.agent.inbox.clearCalls, 0)
})

test('canceling the wait after accepted insertion neither unqueues nor repeats it', async (t) => {
  const f = await fixture(t)
  const inputBarrier = f.gate()
  const entered = deferred<void>()
  f.setFlushHook((index) => {
    if (index !== 2) return
    entered.resolve()
    return inputBarrier.promise
  })
  const canceled = new AbortController()
  const result = f.receiver('submit', canceled.signal).submit(f.request)
  await entered.promise
  canceled.abort()
  assert.equal((await result).kind, 'outcome-unknown')
  assert.equal(f.agent.inbox.nextTurn.length, 1)
  assert.equal(f.agent.cancels, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
  assert.equal(f.receiver('reconcile').reconcile(f.request).kind, 'already-accepted')
  assert.equal(f.agent.followups, 1)
})

test('cancellation during terminal durability waiting admits no model input', async (t) => {
  const f = await fixture(t)
  const terminalBarrier = f.gate()
  const entered = deferred<void>()
  f.setFlushHook((index) => {
    if (index !== 1) return
    entered.resolve()
    return terminalBarrier.promise
  })
  const canceled = new AbortController()
  const result = f.receiver('submit', canceled.signal).submit(f.request)
  await entered.promise
  canceled.abort()
  assert.deepEqual(await result, { kind: 'canceled' })
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.cancels, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
})

test('signal cancellation while draining aborts only this plugin wait', async (t) => {
  const f = await fixture(t)
  f.agent.idleGate = f.gate().promise
  const canceled = new AbortController()
  const result = f.receiver('submit', canceled.signal).submit(f.request)
  await f.agent.idleEntered.promise
  canceled.abort()
  assert.deepEqual(await result, { kind: 'canceled' })
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.cancels, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
})

test('the explicit Client transport signal cancels only its own operation', async (t) => {
  const f = await fixture(t)
  f.agent.idleGate = f.gate().promise
  const canceled = new AbortController()
  const result = f.receiver('submit').submit(f.request, canceled.signal)
  await f.agent.idleEntered.promise
  canceled.abort()
  assert.deepEqual(await result, { kind: 'canceled' })
  assert.deepEqual(f.receiver('reconcile').reconcile(f.request, canceled.signal), {
    kind: 'canceled',
  })
  assert.equal(f.peerAbort.signal.aborted, false)
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.cancels, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
})

test('plugin reload reconciles committed insertion rather than reposting it', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.receiver('submit').submit(f.request)).kind, 'accepted')
  await f.hostFiber.dispose()
  await f.ctx.plugin(host)
  const result = await f.receiver('submit').submit(f.request)
  assert.equal(result.kind, 'already-accepted')
  if (result.kind !== 'already-accepted') assert.fail('Expected observed insertion after reload')
  assert.equal(result.durability, 'unknown')
  assert.equal(f.agent.followups, 1)
})

test('plugin unload aborts its wait and retained service references cannot restart it', async (t) => {
  const f = await fixture(t)
  f.agent.idleGate = f.gate().promise
  const retained = f.receiver('submit')
  const result = retained.submit(f.request)
  await f.agent.idleEntered.promise
  await f.hostFiber.dispose()
  assert.deepEqual(await result, { kind: 'canceled' })
  assert.deepEqual(await retained.submit(f.request), { kind: 'forbidden' })
  assert.equal(f.agent.followups, 0)
  assert.equal(f.agent.cancels, 0)
  assert.equal(f.agent.inbox.clearCalls, 0)
})
