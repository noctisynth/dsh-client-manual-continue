import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ContinueRequest, ContinueResult } from '../shared/protocol.ts'
import { isContinueRequest } from '../shared/protocol.ts'

export interface ContinuationFacts {
  readonly sessionId: string
  readonly candidate: { readonly terminalSeq: number; readonly turn: number } | null
  readonly generation: number | undefined
  readonly eligible: boolean
}

/** The adapter owns the generated SDK namespace; the controller never calls Host services. */
export interface ContinuationTransport {
  submit(request: ContinueRequest, signal: AbortSignal): Promise<RemoteResult<ContinueResult>>
  reconcile(request: ContinueRequest, signal: AbortSignal): Promise<RemoteResult<ContinueResult>>
}

export type ContinuationActionSnapshot =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'pending'
      readonly operation: 'submit' | 'reconcile'
      readonly request: ContinueRequest
    }
  | { readonly kind: 'settled'; readonly request: ContinueRequest; readonly result: ContinueResult }
  | {
      readonly kind: 'unknown'
      readonly request: ContinueRequest
      /** A reconciliation refusal does not establish that the original input was never accepted. */
      readonly lastResult: ContinueResult | null
    }

interface ActionRecord {
  readonly request: ContinueRequest
  state: 'ready' | 'unknown' | 'accepted'
  result: ContinueResult | null
}

interface Binding {
  readonly sessionId: string
  readonly generation: number
}

interface Operation {
  readonly record: ActionRecord
  readonly binding: Binding
  readonly kind: 'submit' | 'reconcile'
  readonly abort: AbortController
}

const idle: ContinuationActionSnapshot = Object.freeze({ kind: 'idle' })

type Response =
  | { readonly kind: 'response'; readonly value: RemoteResult<ContinueResult> }
  | { readonly kind: 'unknown' }

/** Release this wait on cancellation, consuming late transport failures without another request. */
function responseUntilCanceled(
  promise: Promise<RemoteResult<ContinueResult>>,
  signal: AbortSignal,
): Promise<Response> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (response: Response) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', canceled)
      resolve(response)
    }
    const canceled = () => finish({ kind: 'unknown' })
    signal.addEventListener('abort', canceled, { once: true })
    promise.then(
      (value) => finish({ kind: 'response', value }),
      () => finish({ kind: 'unknown' }),
    )
    if (signal.aborted) canceled()
  })
}

function bindingOf(facts: ContinuationFacts | undefined): Binding | undefined {
  if (
    facts === undefined ||
    typeof facts.sessionId !== 'string' ||
    typeof facts.generation !== 'number' ||
    !Number.isSafeInteger(facts.generation) ||
    facts.generation < 0
  ) {
    return undefined
  }
  return { sessionId: facts.sessionId, generation: facts.generation }
}

function sameBinding(left: Binding | undefined, right: Binding | undefined): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.sessionId === right.sessionId &&
    left.generation === right.generation
  )
}

function validCandidate(candidate: NonNullable<ContinuationFacts['candidate']>): boolean {
  return (
    typeof candidate.terminalSeq === 'number' &&
    Number.isSafeInteger(candidate.terminalSeq) &&
    candidate.terminalSeq >= 0 &&
    typeof candidate.turn === 'number' &&
    Number.isSafeInteger(candidate.turn) &&
    candidate.turn > 0
  )
}

function requestKey(sessionId: string, terminalSeq: number, turn: number): string {
  return JSON.stringify([sessionId, terminalSeq, turn])
}

/** Only activate can perform network I/O; synchronization and teardown are local. */
export class ManualContinuationController {
  private readonly transport: ContinuationTransport
  private readonly readFacts: () => ContinuationFacts
  private readonly makeRequestId: () => string
  private readonly records = new Map<string, ActionRecord>()
  private readonly latest = new Map<string, ActionRecord>()
  private readonly listeners = new Set<() => void>()
  private snapshot: ContinuationActionSnapshot = idle
  private binding: Binding | undefined
  private active: Operation | undefined
  private disposed = false

  constructor(
    transport: ContinuationTransport,
    readFacts: () => ContinuationFacts,
    makeRequestId: () => string,
  ) {
    this.transport = transport
    this.readFacts = readFacts
    this.makeRequestId = makeRequestId
    this.binding = bindingOf(this.facts())
  }

  readonly getSnapshot = (): ContinuationActionSnapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private facts(): ContinuationFacts | undefined {
    try {
      const facts = this.readFacts()
      return {
        sessionId: facts.sessionId,
        generation: facts.generation,
        eligible: facts.eligible,
        candidate:
          facts.candidate === null
            ? null
            : { terminalSeq: facts.candidate.terminalSeq, turn: facts.candidate.turn },
      }
    } catch {
      return undefined
    }
  }

  private publish(snapshot: ContinuationActionSnapshot): void {
    const previous = this.snapshot
    if (previous === snapshot) return
    if (
      previous.kind === 'unknown' &&
      snapshot.kind === 'unknown' &&
      previous.request === snapshot.request &&
      previous.lastResult === snapshot.lastResult
    )
      return
    if (
      previous.kind === 'settled' &&
      snapshot.kind === 'settled' &&
      previous.request === snapshot.request &&
      previous.result === snapshot.result
    )
      return
    this.snapshot = Object.freeze(snapshot)
    for (const listener of [...this.listeners]) {
      if (this.listeners.has(listener)) listener()
    }
  }

  private recordFor(facts: ContinuationFacts): ActionRecord | undefined {
    if (facts.candidate === null) return this.latest.get(facts.sessionId)
    if (!validCandidate(facts.candidate)) return undefined
    return this.records.get(
      requestKey(facts.sessionId, facts.candidate.terminalSeq, facts.candidate.turn),
    )
  }

  private show(record: ActionRecord | undefined): void {
    if (record?.state === 'unknown') {
      this.publish({ kind: 'unknown', request: record.request, lastResult: record.result })
    } else if (record?.result !== null && record?.result !== undefined) {
      this.publish({ kind: 'settled', request: record.request, result: record.result })
    } else {
      this.publish(idle)
    }
  }

  private synchronizeFacts(facts: ContinuationFacts | undefined): boolean {
    const next = bindingOf(facts)
    const unchanged = sameBinding(this.binding, next)
    if (!unchanged) {
      const active = this.active
      this.active = undefined
      active?.abort.abort()
      this.binding = next
    }
    if (this.active === undefined)
      this.show(facts === undefined ? undefined : this.recordFor(facts))
    return unchanged
  }

  /** Read-only local synchronization. A candidate disappearing may be this request's own input. */
  synchronize(): void {
    if (!this.disposed) this.synchronizeFacts(this.facts())
  }

  /** Cancel only this controller's wait/carrier, never an Agent, inbox, or draft. */
  cancel(): void {
    if (this.disposed) return
    const active = this.active
    this.active = undefined
    active?.abort.abort()
    const facts = this.facts()
    this.binding = bindingOf(facts)
    this.show(facts === undefined ? undefined : this.recordFor(facts))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const active = this.active
    this.active = undefined
    active?.abort.abort()
    this.records.clear()
    this.latest.clear()
    this.listeners.clear()
    this.snapshot = idle
    this.binding = undefined
  }

  /** The return value describes event handling only, not model execution or task completion. */
  async activate(
    event: Pick<Event, 'isTrusted' | 'defaultPrevented'>,
  ): Promise<'ignored' | 'invalid' | 'handled'> {
    if (this.disposed || event.isTrusted !== true || event.defaultPrevented) return 'ignored'
    const facts = this.facts()
    if (!this.synchronizeFacts(facts)) return 'ignored'
    if (this.active !== undefined || facts?.eligible !== true || this.binding === undefined) {
      return 'ignored'
    }
    if (facts.candidate !== null && !validCandidate(facts.candidate)) return 'invalid'
    let record = this.recordFor(facts)
    if (facts.candidate === null && record?.state !== 'unknown') return 'ignored'
    if (record?.state === 'accepted') return 'ignored'
    if (record === undefined) {
      if (facts.candidate === null) return 'ignored'
      let request: ContinueRequest
      try {
        request = Object.freeze({
          sessionId: facts.sessionId,
          terminalSeq: facts.candidate.terminalSeq,
          turn: facts.candidate.turn,
          requestId: this.makeRequestId(),
        })
      } catch {
        return 'invalid'
      }
      if (!isContinueRequest(request)) return 'invalid'
      record = { request, state: 'ready', result: null }
      this.records.set(requestKey(request.sessionId, request.terminalSeq, request.turn), record)
      this.latest.set(request.sessionId, record)
    }
    const operation: Operation = {
      record,
      binding: this.binding,
      kind: record.state === 'unknown' ? 'reconcile' : 'submit',
      abort: new AbortController(),
    }
    this.active = operation
    this.publish({ kind: 'pending', operation: operation.kind, request: record.request })
    const beforeCall = this.facts()
    if (
      this.active !== operation ||
      !sameBinding(operation.binding, bindingOf(beforeCall)) ||
      beforeCall?.eligible !== true ||
      (operation.kind === 'submit' &&
        (beforeCall.candidate?.terminalSeq !== record.request.terminalSeq ||
          beforeCall.candidate.turn !== record.request.turn))
    ) {
      this.synchronizeFacts(beforeCall)
      if (this.active === operation) this.cancel()
      return 'ignored'
    }
    // From this point any exception/cancellation is uncertain: no subsequent click may repost it.
    record.state = 'unknown'
    record.result = null
    let response: Response
    try {
      response = await responseUntilCanceled(
        this.transport[operation.kind](record.request, operation.abort.signal),
        operation.abort.signal,
      )
    } catch {
      response = { kind: 'unknown' }
    }
    if (this.disposed || this.active !== operation) return 'handled'
    const afterCall = this.facts()
    if (!sameBinding(operation.binding, bindingOf(afterCall))) {
      this.synchronizeFacts(afterCall)
      return 'handled'
    }
    this.active = undefined
    if (response.kind === 'response' && response.value.ok) {
      const result = response.value.value
      record.result = result
      if (result.kind === 'accepted' || result.kind === 'already-accepted') {
        record.state = 'accepted'
      } else if (result.kind !== 'outcome-unknown' && operation.kind === 'submit') {
        record.state = 'ready'
      }
    }
    this.show(afterCall === undefined ? undefined : this.recordFor(afterCall))
    return 'handled'
  }
}
