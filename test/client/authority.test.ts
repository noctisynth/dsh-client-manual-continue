import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ConnectionGeneration,
  ConnectionState,
} from '@deepseek-ai/dsh-client-connection/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { ContinuationAuthority } from '../../src/client/authority.ts'
import type { ContinueAvailability } from '../../src/shared/protocol.ts'

function observable<T>(initial: T) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next: T) => {
      current = next
      for (const listener of listeners) listener()
    },
    count: () => listeners.size,
  }
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred not initialized')
  }
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const available: RemoteResult<ContinueAvailability> = { ok: true, value: { kind: 'available' } }
const forbidden: RemoteResult<ContinueAvailability> = { ok: true, value: { kind: 'forbidden' } }
function generation(id: number): ConnectionGeneration {
  return {
    id,
    host: {
      get home(): string {
        throw new Error('Host home is not authority')
      },
    },
  }
}
function connection() {
  return {
    state: observable<ConnectionState | undefined>(undefined),
    generation: observable<ConnectionGeneration | undefined>(undefined),
  }
}

test('authority does not query without both connected state and a ready generation', async () => {
  const conn = connection()
  let queries = 0
  const authority = new ContinuationAuthority(conn, async () => {
    queries += 1
    return available
  })
  assert.equal(queries, 0)
  conn.state.set('connected')
  assert.equal(queries, 0)
  conn.generation.set(generation(1))
  await Promise.resolve()
  assert.equal(queries, 1)
  assert.equal(authority.getSnapshot().kind, 'available')
  conn.state.set('connected')
  conn.generation.set(generation(1))
  assert.equal(queries, 1)
  authority.dispose()
})

test('grant-like connectivity never overrides the owner-guarded refusal', async () => {
  const conn = connection()
  conn.state.set('connected')
  conn.generation.set(generation(1))
  const authority = new ContinuationAuthority(conn, async () => forbidden)
  await Promise.resolve()
  assert.equal(authority.getSnapshot().kind, 'forbidden')
  authority.dispose()
})

test('connection loss aborts only the probe and never reuses late authority on a new generation', async () => {
  const conn = connection()
  const old = deferred<RemoteResult<ContinueAvailability>>()
  let oldSignal: AbortSignal | undefined
  let count = 0
  const authority = new ContinuationAuthority(conn, (signal) => {
    count += 1
    if (count === 1) {
      oldSignal = signal
      return old.promise
    }
    return Promise.resolve(forbidden)
  })
  conn.state.set('connected')
  conn.generation.set(generation(1))
  conn.state.set('disconnected')
  assert.equal(oldSignal?.aborted, true)
  assert.equal(authority.getSnapshot().kind, 'unavailable')
  conn.generation.set(undefined)
  conn.state.set('connected')
  conn.generation.set(generation(2))
  await Promise.resolve()
  old.resolve(available)
  await Promise.resolve()
  assert.deepEqual(authority.getSnapshot(), { generation: 2, kind: 'forbidden' })
  authority.dispose()
})

test('probe exceptions and rejections have explicit unavailable snapshots without loops', async () => {
  for (const probe of [
    () => {
      throw new Error('assembly fixture')
    },
    () => Promise.reject(new Error('carrier fixture')),
  ]) {
    const conn = connection()
    conn.state.set('connected')
    conn.generation.set(generation(1))
    const authority = new ContinuationAuthority(conn, probe)
    await Promise.resolve()
    assert.equal(authority.getSnapshot().kind, 'unavailable')
    authority.dispose()
  }
})

test('disposal releases subscriptions and own wait; late replies cannot restore authority', async () => {
  const conn = connection()
  const pending = deferred<RemoteResult<ContinueAvailability>>()
  let signal: AbortSignal | undefined
  const authority = new ContinuationAuthority(conn, (current) => {
    signal = current
    return pending.promise
  })
  conn.state.set('connected')
  conn.generation.set(generation(1))
  let updates = 0
  const release = authority.subscribe(() => {
    updates += 1
  })
  release()
  authority.dispose()
  authority.dispose()
  assert.equal(signal?.aborted, true)
  assert.equal(conn.state.count(), 0)
  assert.equal(conn.generation.count(), 0)
  pending.resolve(available)
  await Promise.resolve()
  assert.equal(authority.getSnapshot().kind, 'unavailable')
  assert.equal(updates, 0)
})
