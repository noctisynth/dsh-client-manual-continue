import assert from 'node:assert/strict'
import test from 'node:test'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import {
  type ContinuationFacts,
  type ContinuationTransport,
  ManualContinuationController,
} from '../../src/client/action.ts'
import type { ContinueRequest, ContinueResult } from '../../src/shared/protocol.ts'

type Reply = RemoteResult<ContinueResult>

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred not initialized')
  }
  let reject: (error: unknown) => void = () => {
    throw new Error('Deferred not initialized')
  }
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function trusted() {
  return { isTrusted: true, defaultPrevented: false }
}
function ok(value: ContinueResult): Reply {
  return { ok: true, value }
}
const accepted: ContinueResult = {
  kind: 'accepted',
  messageId: 'offline-message',
  durability: 'confirmed',
}

function fixture() {
  let facts: ContinuationFacts = {
    sessionId: 'offline-session',
    candidate: { terminalSeq: 1, turn: 1 },
    generation: 1,
    eligible: true,
  }
  let ids = 0
  const calls: {
    operation: 'submit' | 'reconcile'
    request: ContinueRequest
    signal: AbortSignal
  }[] = []
  let respond: (operation: 'submit' | 'reconcile', request: ContinueRequest) => Promise<Reply> =
    () => Promise.resolve(ok(accepted))
  const transport: ContinuationTransport = {
    submit(request, signal) {
      calls.push({ operation: 'submit', request, signal })
      return respond('submit', request)
    },
    reconcile(request, signal) {
      calls.push({ operation: 'reconcile', request, signal })
      return respond('reconcile', request)
    },
  }
  const controller = new ManualContinuationController(
    transport,
    () => facts,
    () => {
      ids += 1
      return `offline_request_${String(ids).padStart(4, '0')}`
    },
  )
  return {
    controller,
    calls,
    get facts() {
      return facts
    },
    set facts(value: ContinuationFacts) {
      facts = value
    },
    get ids() {
      return ids
    },
    respond(value: typeof respond) {
      respond = value
    },
  }
}

test('untrusted, prevented, ineligible and unknown-generation activations send nothing', async () => {
  const f = fixture()
  assert.equal(
    await f.controller.activate({ isTrusted: false, defaultPrevented: false }),
    'ignored',
  )
  assert.equal(await f.controller.activate({ isTrusted: true, defaultPrevented: true }), 'ignored')
  f.facts = { ...f.facts, eligible: false }
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  f.facts = { ...f.facts, eligible: true, generation: undefined }
  f.controller.synchronize()
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  assert.equal(f.calls.length, 0)
  assert.equal(f.ids, 0)
  f.controller.dispose()
})

test('protocol bounds reject invalid request values before any transport call', async () => {
  const f = fixture()
  f.facts = { ...f.facts, candidate: { terminalSeq: -1, turn: 0 } }
  assert.equal(await f.controller.activate(trusted()), 'invalid')
  assert.equal(f.calls.length, 0)
  assert.equal(f.ids, 0)
  const transport: ContinuationTransport = {
    submit: () => {
      throw new Error('Unexpected submit')
    },
    reconcile: () => {
      throw new Error('Unexpected reconcile')
    },
  }
  const invalid = new ManualContinuationController(
    transport,
    () => f.facts,
    () => 'short',
  )
  f.facts = { ...f.facts, candidate: { terminalSeq: 1, turn: 1 } }
  assert.equal(await invalid.activate(trusted()), 'invalid')
  invalid.dispose()
  f.controller.dispose()
})

test('one pending gesture owns an immutable request and double click cannot submit twice', async () => {
  const f = fixture()
  const reply = deferred<Reply>()
  f.respond(() => reply.promise)
  const first = f.controller.activate(trusted())
  assert.equal(f.controller.getSnapshot().kind, 'pending')
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  const call = f.calls[0]
  assert.ok(call)
  assert.equal(Object.isFrozen(call.request), true)
  f.facts = { ...f.facts, candidate: { terminalSeq: 99, turn: 2 } }
  assert.equal(call.request.terminalSeq, 1)
  f.facts = { ...f.facts, candidate: { terminalSeq: 1, turn: 1 } }
  reply.resolve(ok(accepted))
  await first
  assert.equal(f.calls.length, 1)
  assert.equal(f.ids, 1)
  assert.equal(f.controller.getSnapshot().kind, 'settled')
  f.controller.dispose()
})

test('accepted input consumes a candidate and candidate invalidation does not cancel its response', async () => {
  const f = fixture()
  const reply = deferred<Reply>()
  f.respond(() => reply.promise)
  const first = f.controller.activate(trusted())
  f.facts = { ...f.facts, candidate: null, eligible: false }
  f.controller.synchronize()
  assert.equal(f.controller.getSnapshot().kind, 'pending')
  assert.equal(f.calls[0]?.signal.aborted, false)
  reply.resolve(ok(accepted))
  await first
  f.facts = { ...f.facts, candidate: { terminalSeq: 1, turn: 1 }, eligible: true }
  f.controller.synchronize()
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  assert.equal(f.calls.length, 1)
  f.controller.dispose()
})

test('a fresh terminal gets a new operation id, not the old accepted request', async () => {
  const f = fixture()
  await f.controller.activate(trusted())
  f.facts = { ...f.facts, candidate: { terminalSeq: 10, turn: 2 } }
  f.controller.synchronize()
  await f.controller.activate(trusted())
  assert.equal(f.calls.length, 2)
  assert.notEqual(f.calls[0]?.request.requestId, f.calls[1]?.request.requestId)
  f.facts = { ...f.facts, candidate: { terminalSeq: 1, turn: 1 } }
  f.controller.synchronize()
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  assert.equal(f.ids, 2)
  f.controller.dispose()
})

test('known submission rejection permits a later human click with stable request identity', async () => {
  const f = fixture()
  f.respond(() => Promise.resolve(ok({ kind: 'busy' })))
  await f.controller.activate(trusted())
  assert.equal(f.controller.getSnapshot().kind, 'settled')
  f.respond(() => Promise.resolve(ok(accepted)))
  await f.controller.activate(trusted())
  assert.deepEqual(
    f.calls.map((call) => call.operation),
    ['submit', 'submit'],
  )
  assert.equal(f.calls[0]?.request, f.calls[1]?.request)
  assert.equal(f.ids, 1)
  f.controller.dispose()
})

test('a thrown assembly or transport failure is unknown and only a new click can reconcile', async () => {
  const f = fixture()
  f.respond(() => {
    throw new Error('Offline assembly failed')
  })
  await f.controller.activate(trusted())
  assert.equal(f.controller.getSnapshot().kind, 'unknown')
  f.controller.synchronize()
  assert.equal(f.calls.length, 1)
  f.respond((_operation, request) =>
    Promise.resolve(
      ok({
        kind: 'outcome-unknown',
        requestId: request.requestId,
      }),
    ),
  )
  await f.controller.activate(trusted())
  assert.deepEqual(
    f.calls.map((call) => call.operation),
    ['submit', 'reconcile'],
  )
  assert.equal(f.calls[0]?.request, f.calls[1]?.request)
  assert.equal(f.ids, 1)
  f.controller.dispose()
})

test('a structured RPC failure cannot authorize a second submission', async () => {
  const f = fixture()
  f.respond(() =>
    Promise.resolve({
      ok: false,
      error: new RemoteError('gateway/cancelled', 'Offline cancellation', {}),
    }),
  )
  await f.controller.activate(trusted())
  assert.equal(f.controller.getSnapshot().kind, 'unknown')
  f.respond(() => Promise.resolve(ok(accepted)))
  await f.controller.activate(trusted())
  assert.deepEqual(
    f.calls.map((call) => call.operation),
    ['submit', 'reconcile'],
  )
  assert.equal(f.ids, 1)
  f.controller.dispose()
})

test('a rejected transport promise stays unknown without a background retry', async () => {
  const f = fixture()
  f.respond(() => Promise.reject(new Error('Offline transport failed')))
  await f.controller.activate(trusted())
  assert.equal(f.controller.getSnapshot().kind, 'unknown')
  f.controller.synchronize()
  await Promise.resolve()
  assert.equal(f.calls.length, 1)
  f.controller.dispose()
})

test('reconciliation refusal cannot make an uncertain submission safe to repost', async () => {
  const f = fixture()
  f.respond((_operation, request) =>
    Promise.resolve(
      ok({
        kind: 'outcome-unknown',
        requestId: request.requestId,
      }),
    ),
  )
  await f.controller.activate(trusted())
  f.respond(() => Promise.resolve(ok({ kind: 'forbidden' })))
  await f.controller.activate(trusted())
  const refused = f.controller.getSnapshot()
  assert.equal(refused.kind, 'unknown')
  if (refused.kind === 'unknown') assert.equal(refused.lastResult?.kind, 'forbidden')
  f.respond(() => Promise.resolve(ok({ ...accepted, kind: 'already-accepted' })))
  await f.controller.activate(trusted())
  assert.deepEqual(
    f.calls.map((call) => call.operation),
    ['submit', 'reconcile', 'reconcile'],
  )
  assert.equal(f.controller.getSnapshot().kind, 'settled')
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  f.controller.dispose()
})

test('synchronous subscriber changes before transport cannot redirect the clicked request', async () => {
  const f = fixture()
  const stop = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().kind !== 'pending') return
    f.facts = { ...f.facts, sessionId: 'different-session' }
    f.controller.synchronize()
  })
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  assert.equal(f.calls.length, 0)
  assert.equal(f.controller.getSnapshot().kind, 'idle')
  stop()
  f.controller.dispose()
})

for (const change of ['session', 'generation'] as const) {
  test(`${change} changes cancel the old carrier and isolate its late reply`, async () => {
    const f = fixture()
    const old = deferred<Reply>()
    f.respond(() => old.promise)
    const first = f.controller.activate(trusted())
    f.facts =
      change === 'session'
        ? { ...f.facts, sessionId: 'new-session' }
        : { ...f.facts, generation: 2 }
    f.controller.synchronize()
    assert.equal(f.calls[0]?.signal.aborted, true)
    await first
    const snapshot = f.controller.getSnapshot()
    old.resolve(ok(accepted))
    await Promise.resolve()
    assert.equal(f.controller.getSnapshot(), snapshot)
    f.respond(() => Promise.resolve(ok(accepted)))
    await f.controller.activate(trusted())
    assert.equal(f.calls[1]?.operation, change === 'session' ? 'submit' : 'reconcile')
    f.controller.dispose()
  })
}

test('a newer terminal does not cancel input but keeps its own current view unconsumed', async () => {
  const f = fixture()
  const reply = deferred<Reply>()
  f.respond(() => reply.promise)
  const first = f.controller.activate(trusted())
  f.facts = { ...f.facts, candidate: { terminalSeq: 9, turn: 2 } }
  f.controller.synchronize()
  assert.equal(f.calls[0]?.signal.aborted, false)
  reply.resolve(ok(accepted))
  await first
  assert.equal(f.controller.getSnapshot().kind, 'idle')
  f.respond(() => Promise.resolve(ok(accepted)))
  await f.controller.activate(trusted())
  assert.equal(f.calls[1]?.request.terminalSeq, 9)
  assert.notEqual(f.calls[0]?.request.requestId, f.calls[1]?.request.requestId)
  f.controller.dispose()
})

test('binding changes at response time are checked even before synchronize runs', async () => {
  const f = fixture()
  const reply = deferred<Reply>()
  f.respond(() => reply.promise)
  const first = f.controller.activate(trusted())
  f.facts = { ...f.facts, sessionId: 'new-session' }
  reply.resolve(ok(accepted))
  await first
  assert.equal(f.controller.getSnapshot().kind, 'idle')
  assert.equal(f.calls[0]?.signal.aborted, true)
  f.controller.dispose()
})

test('explicit cancel settles only this wait and the next click reconciles', async () => {
  const f = fixture()
  const reply = deferred<Reply>()
  f.respond(() => reply.promise)
  const first = f.controller.activate(trusted())
  f.controller.cancel()
  await first
  assert.equal(f.calls[0]?.signal.aborted, true)
  assert.equal(f.controller.getSnapshot().kind, 'unknown')
  f.respond(() => Promise.resolve(ok(accepted)))
  await f.controller.activate(trusted())
  assert.equal(f.calls[1]?.operation, 'reconcile')
  reply.reject(new Error('Late canceled carrier failure'))
  await Promise.resolve()
  f.controller.dispose()
})

test('dispose releases subscribers, stops its wait and ignores all future activations', async () => {
  const f = fixture()
  const reply = deferred<Reply>()
  f.respond(() => reply.promise)
  let notices = 0
  const stop = f.controller.subscribe(() => {
    notices += 1
  })
  const first = f.controller.activate(trusted())
  assert.equal(notices, 1)
  f.controller.dispose()
  await first
  stop()
  const never = f.controller.subscribe(() => {
    assert.fail('Disposed subscriber')
  })
  assert.equal(await f.controller.activate(trusted()), 'ignored')
  f.controller.synchronize()
  f.controller.cancel()
  reply.resolve(ok(accepted))
  await Promise.resolve()
  assert.equal(f.controller.getSnapshot().kind, 'idle')
  assert.equal(notices, 1)
  assert.equal(f.calls.length, 1)
  never()
})

test('external-store snapshots are stable under unchanged synchronization and unsubscribe', async () => {
  const f = fixture()
  let notices = 0
  const stop = f.controller.subscribe(() => {
    notices += 1
  })
  await f.controller.activate(trusted())
  const settled = f.controller.getSnapshot()
  const notified = notices
  f.controller.synchronize()
  f.controller.synchronize()
  assert.equal(f.controller.getSnapshot(), settled)
  assert.equal(notices, notified)
  stop()
  f.facts = { ...f.facts, candidate: { terminalSeq: 5, turn: 2 } }
  f.controller.synchronize()
  assert.equal(notices, notified)
  f.controller.dispose()
})
