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
  private lastProbe:
    | 'none'
    | 'business-available'
    | 'business-forbidden'
    | 'business-unavailable'
    | 'business-canceled'
    | 'rpc-failure'
    | 'exception' = 'none'
  private errorCode: string | null = null
  readonly getDiagnostics = () => ({
    kind: this.snapshot.kind,
    lastProbe: this.lastProbe,
    errorCode: this.errorCode,
  })

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
        (result) => {
          if (this.pending !== pending || pending.signal.aborted || this.disposed) return
          this.lastProbe = result.ok ? `business-${result.value.kind}` : 'rpc-failure'
          this.errorCode =
            !result.ok && /^[A-Z0-9_.:-]{1,64}$/i.test(result.error.code) ? result.error.code : null
          finish(
            result.ok && result.value.kind === 'available'
              ? 'available'
              : result.ok && result.value.kind === 'forbidden'
                ? 'forbidden'
                : 'unavailable',
          )
        },
        () => {
          if (this.pending !== pending || pending.signal.aborted || this.disposed) return
          this.lastProbe = 'exception'
          finish('unavailable')
        },
      )
    } catch {
      this.lastProbe = 'exception'
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
