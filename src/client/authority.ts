import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ContinueAvailability } from '../shared/protocol.ts'

type ConnectionFacts = Pick<ConnectionHandle, 'generation' | 'state'>
export interface AuthoritySnapshot {
  readonly generation: number | undefined
  readonly kind: 'unavailable' | 'checking' | 'available' | 'forbidden'
}

/** Read-only owner proof, scoped to one ready connection generation. Never admits model input. */
export class ContinuationAuthority {
  private readonly connection: ConnectionFacts
  private readonly probe: (signal: AbortSignal) => Promise<RemoteResult<ContinueAvailability>>
  private readonly listeners = new Set<() => void>()
  private readonly releases: Array<() => void>
  private snapshot: AuthoritySnapshot = Object.freeze({
    generation: undefined,
    kind: 'unavailable',
  })
  private pending: AbortController | undefined
  private disposed = false

  constructor(
    connection: ConnectionFacts,
    probe: (signal: AbortSignal) => Promise<RemoteResult<ContinueAvailability>>,
  ) {
    this.connection = connection
    this.probe = probe
    this.releases = [
      connection.state.subscribe(() => this.synchronize()),
      connection.generation.subscribe(() => this.synchronize()),
    ]
    this.synchronize()
  }

  readonly getSnapshot = (): AuthoritySnapshot => this.snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private generation(): number | undefined {
    if (this.connection.state.getSnapshot() !== 'connected') return undefined
    const id = this.connection.generation.getSnapshot()?.id
    return id !== undefined && Number.isSafeInteger(id) && id >= 0 ? id : undefined
  }

  private publish(generation: number | undefined, kind: AuthoritySnapshot['kind']): void {
    if (this.snapshot.generation === generation && this.snapshot.kind === kind) return
    this.snapshot = Object.freeze({ generation, kind })
    for (const listener of this.listeners) listener()
  }

  private synchronize(): void {
    if (this.disposed) return
    const generation = this.generation()
    if (generation === this.snapshot.generation) return
    this.pending?.abort()
    this.pending = undefined
    if (generation === undefined) {
      this.publish(undefined, 'unavailable')
      return
    }
    const pending = new AbortController()
    this.pending = pending
    this.publish(generation, 'checking')
    const finish = (kind: AuthoritySnapshot['kind']) => {
      if (
        this.disposed ||
        pending.signal.aborted ||
        this.pending !== pending ||
        this.generation() !== generation
      )
        return
      this.pending = undefined
      this.publish(generation, kind)
    }
    try {
      this.probe(pending.signal).then(
        (result) =>
          finish(
            result.ok && result.value.kind === 'available'
              ? 'available'
              : result.ok && result.value.kind === 'forbidden'
                ? 'forbidden'
                : 'unavailable',
          ),
        () => finish('unavailable'),
      )
    } catch {
      finish('unavailable')
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pending?.abort()
    this.pending = undefined
    for (const release of this.releases) release()
    this.publish(undefined, 'unavailable')
    this.listeners.clear()
  }
}
