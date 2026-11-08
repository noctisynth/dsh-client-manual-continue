import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type { Session } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type { RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ContinuationState } from '../shared/continuation.ts'
import { terminalDisposition } from '../shared/continuation.ts'
import type { ContinueAvailability, ContinueRequest, ContinueResult } from '../shared/protocol.ts'
import { isContinueRequest } from '../shared/protocol.ts'
import type { ReceiptIdentity, ReceiptState } from '../shared/receipt.ts'
import { reconcileReceipt } from '../shared/receipt.ts'
import { createContinuationMessage } from './message.ts'
import { qualificationDefinition, receiptDefinition } from './projection.ts'

export type { ContinueAvailability, ContinueRequest, ContinueResult } from '../shared/protocol.ts'

export const inject: readonly string[] = [
  'agents',
  'sessions',
  'sessionProjections',
  'typertGateway',
]

// Cordis 4.1.0 publishes FiberState as an erased const enum; its inspected ACTIVE value is 2.
const ACTIVE_FIBER_STATE: Fiber['state'] = 2

interface Attempt {
  readonly agent: Agent
  readonly identity: ReceiptIdentity
  durability: 'confirmed' | 'unknown'
}

type WaitResult<T> =
  | { readonly kind: 'settled'; readonly value: T }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'failed' }

/** Cancels only this plugin's wait, never the Agent or the shared underlying operation. */
function waitFor<T>(operation: Promise<T>, signal: AbortSignal): Promise<WaitResult<T>> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: WaitResult<T>) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', canceled)
      resolve(result)
    }
    const canceled = () => finish({ kind: 'canceled' })
    signal.addEventListener('abort', canceled, { once: true })
    operation.then(
      (value) => finish({ kind: 'settled', value }),
      () => finish({ kind: 'failed' }),
    )
    if (signal.aborted) canceled()
  })
}

/** The public business surface deliberately excludes implementation and framework internals. */
export interface ManualContinueOperations {
  availability(signal?: AbortSignal): ContinueAvailability
  submit(input: ContinueRequest, signal?: AbortSignal): Promise<ContinueResult>
  reconcile(request: ContinueRequest, signal?: AbortSignal): ContinueResult
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    manualContinue: ManualContinueOperations
  }
}

/** User-only Host operation. Source attribution and JSON fields never grant authority. */
class ManualContinueService extends TypertRemoteService implements ManualContinueOperations {
  private readonly lifetime = new AbortController()
  private readonly active = new Map<SessionId, Agent>()
  private readonly attempts = new Map<SessionId, Attempt>()

  constructor(
    ctx: Context,
    private readonly qualification: ProjectionHandle<ContinuationState>,
    private readonly receipts: ProjectionHandle<ReceiptState>,
  ) {
    super(ctx, 'manualContinue')
    ctx.on('agent/disposed', ({ agent }) => {
      if (this.active.get(agent.id) === agent) this.active.delete(agent.id)
      if (this.attempts.get(agent.id)?.agent === agent) this.attempts.delete(agent.id)
    })
    ctx.effect(() => () => {
      this.lifetime.abort()
      this.active.clear()
      this.attempts.clear()
    })
  }

  private caller(method: string): RemoteInvocation | undefined {
    const invocation = this.ctx.invocation
    if (
      this.lifetime.signal.aborted ||
      this.ctx.fiber.state !== ACTIVE_FIBER_STATE ||
      invocation === undefined ||
      invocation.service !== 'manualContinue' ||
      invocation.request.namespace !== 'manualContinue' ||
      invocation.request.method !== method ||
      invocation.peer.principal.kind !== 'owner'
    ) {
      return undefined
    }
    return invocation
  }

  private exactAgent(sessionId: SessionId): Agent | undefined {
    const agent = this.ctx.agents.get(sessionId)
    if (
      agent === undefined ||
      agent.id !== sessionId ||
      agent.ctx.fiber.state !== ACTIVE_FIBER_STATE ||
      this.ctx.sessions.get(sessionId) !== agent.session ||
      !this.ctx.agents.roots().includes(agent)
    ) {
      return undefined
    }
    return agent
  }

  private check(
    agent: Agent,
    session: Session,
    request: ContinueRequest,
    signal: AbortSignal,
  ): ContinueResult | null {
    if (signal.aborted) return { kind: 'canceled' }
    if (
      this.exactAgent(session.id) !== agent ||
      agent.session !== session ||
      !this.ctx.typertGateway.hasLiveClient()
    ) {
      return { kind: 'unavailable' }
    }
    if (agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) {
      return { kind: 'pending-input' }
    }
    if (
      this.ctx.typertGateway
        .getPendingRemoteEvents()
        .some((pending) => String(pending.agentId) === session.id)
    ) {
      return { kind: 'pending-interaction' }
    }
    const disposition = terminalDisposition(this.qualification.stateOf(session))
    if (
      disposition.kind !== 'candidate' ||
      disposition.terminal.seq !== request.terminalSeq ||
      disposition.terminal.turn !== request.turn ||
      !session.isOwnSeq(disposition.terminal.seq)
    ) {
      return { kind: 'stale' }
    }
    return null
  }

  private known(session: Session, request: ContinueRequest): ContinueResult | null {
    const state = this.receipts.stateOf(session)
    const candidate = state.candidate
    const previous = this.attempts.get(session.id)
    if (
      candidate?.terminalSeq === request.terminalSeq &&
      candidate.turn === request.turn &&
      candidate.evidence !== null
    ) {
      const identity: ReceiptIdentity = {
        sessionId: session.id,
        terminalSeq: candidate.terminalSeq,
        turn: candidate.turn,
        requestId: candidate.evidence.requestId,
        messageId: candidate.evidence.messageId,
      }
      const result = reconcileReceipt(state, identity)
      if (result.kind === 'accepted' || result.kind === 'in-history') {
        return {
          kind: 'already-accepted',
          messageId: result.messageId,
          durability:
            previous?.identity.messageId === result.messageId ? previous.durability : 'unknown',
        }
      }
      return { kind: 'outcome-unknown', requestId: request.requestId }
    }
    // A thrown/uncertain followup must not be retried merely because its evidence is absent.
    if (
      previous?.identity.terminalSeq === request.terminalSeq &&
      previous.identity.turn === request.turn
    ) {
      return { kind: 'outcome-unknown', requestId: request.requestId }
    }
    return null
  }

  /** Prove only this caller's permission/connection; never inspect or admit session work. */
  @Remote
  availability(signal?: AbortSignal): ContinueAvailability {
    const invocation = this.caller('availability')
    if (invocation === undefined) return { kind: 'forbidden' }
    if (signal?.aborted || invocation.signal.aborted || invocation.peer.signal.aborted) {
      return { kind: 'canceled' }
    }
    try {
      return { kind: this.ctx.typertGateway.hasLiveClient() ? 'available' : 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  /** Reconcile observed input only. This never enqueues or wakes an Agent. */
  @Remote
  reconcile(request: ContinueRequest, signal?: AbortSignal): ContinueResult {
    const invocation = this.caller('reconcile')
    if (invocation === undefined) return { kind: 'forbidden' }
    if (!isContinueRequest(request)) return { kind: 'invalid-request' }
    if (signal?.aborted || invocation.signal.aborted || invocation.peer.signal.aborted) {
      return { kind: 'canceled' }
    }
    const agent = this.exactAgent(SessionId(request.sessionId))
    if (agent === undefined) return { kind: 'unavailable' }
    return (
      this.known(agent.session, request) ?? {
        kind: 'outcome-unknown',
        requestId: request.requestId,
      }
    )
  }

  /** Admit one human UI operation; acceptance is not model start or task completion. */
  @Remote
  async submit(input: ContinueRequest, signal?: AbortSignal): Promise<ContinueResult> {
    const invocation = this.caller('submit')
    if (invocation === undefined) return { kind: 'forbidden' }
    if (!isContinueRequest(input)) return { kind: 'invalid-request' }
    const request: ContinueRequest = { ...input }
    const callSignal = AbortSignal.any([
      invocation.signal,
      invocation.peer.signal,
      this.lifetime.signal,
      ...(signal === undefined ? [] : [signal]),
    ])
    if (callSignal.aborted) return { kind: 'canceled' }
    const sessionId = SessionId(request.sessionId)
    const agent = this.exactAgent(sessionId)
    if (agent === undefined) return { kind: 'unavailable' }
    const session = agent.session
    const known = this.known(session, request)
    if (known !== null) return known
    if (this.active.has(sessionId)) return { kind: 'busy' }
    const rejected = this.check(agent, session, request, callSignal)
    if (rejected !== null) return rejected
    this.active.set(sessionId, agent)
    try {
      const idle = await waitFor(agent.whenIdle(), callSignal)
      if (idle.kind !== 'settled') {
        return { kind: idle.kind === 'canceled' ? 'canceled' : 'unavailable' }
      }
      const afterIdle = this.check(agent, session, request, callSignal)
      if (afterIdle !== null) return afterIdle
      let entered = false
      try {
        return await agent.runMaintenance(async (maintenanceSignal): Promise<ContinueResult> => {
          entered = true
          const operationSignal = AbortSignal.any([callSignal, maintenanceSignal])
          const beforeBarrier = this.check(agent, session, request, operationSignal)
          if (beforeBarrier !== null) return beforeBarrier
          // Confirm the terminal log and attached writer before adding new model input.
          const terminalBarrier = await waitFor(this.ctx.sessions.flush(session), operationSignal)
          if (terminalBarrier.kind === 'canceled') return { kind: 'canceled' }
          if (terminalBarrier.kind !== 'settled' || !terminalBarrier.value) {
            return { kind: 'unavailable' }
          }
          const finalCheck = this.check(agent, session, request, operationSignal)
          if (finalCheck !== null) return finalCheck
          const again = this.known(session, request)
          if (again !== null) return again
          const disposition = terminalDisposition(this.qualification.stateOf(session))
          if (disposition.kind !== 'candidate') return { kind: 'stale' }
          const message = createContinuationMessage(
            session.id,
            disposition.terminal,
            request.requestId,
          )
          const attempt: Attempt = {
            agent,
            identity: {
              sessionId: session.id,
              terminalSeq: disposition.terminal.seq,
              turn: disposition.terminal.turn,
              requestId: request.requestId,
              messageId: message.id,
            },
            durability: 'unknown',
          }
          this.attempts.set(session.id, attempt)
          try {
            // No await from the final state check through this native enqueue.
            agent.followup(message)
          } catch {
            return { kind: 'outcome-unknown', requestId: request.requestId }
          }
          const observed = reconcileReceipt(this.receipts.stateOf(session), attempt.identity)
          if (observed.kind !== 'accepted' && observed.kind !== 'in-history') {
            return { kind: 'outcome-unknown', requestId: request.requestId }
          }
          const inputBarrier = await waitFor(this.ctx.sessions.flush(session), operationSignal)
          if (
            inputBarrier.kind !== 'settled' ||
            !inputBarrier.value ||
            this.exactAgent(session.id) !== agent ||
            agent.session !== session
          ) {
            return { kind: 'outcome-unknown', requestId: request.requestId }
          }
          const afterBarrier = reconcileReceipt(this.receipts.stateOf(session), attempt.identity)
          if (afterBarrier.kind !== 'accepted' && afterBarrier.kind !== 'in-history') {
            return { kind: 'outcome-unknown', requestId: request.requestId }
          }
          attempt.durability = 'confirmed'
          return { kind: 'accepted', messageId: message.id, durability: 'confirmed' }
        })
      } catch {
        return this.attempts.get(sessionId)?.identity.terminalSeq === request.terminalSeq
          ? { kind: 'outcome-unknown', requestId: request.requestId }
          : { kind: entered ? 'unavailable' : 'busy' }
      }
    } catch {
      return this.attempts.get(sessionId)?.identity.terminalSeq === request.terminalSeq
        ? { kind: 'outcome-unknown', requestId: request.requestId }
        : { kind: 'unavailable' }
    } finally {
      if (this.active.get(sessionId) === agent) this.active.delete(sessionId)
    }
  }
}

/** Projection readiness precedes publishing any service operation. */
export async function apply(ctx: Context): Promise<void> {
  const qualification = await ctx.sessionProjections.register(qualificationDefinition)
  const receipts = await ctx.sessionProjections.register(receiptDefinition)
  new ManualContinueService(ctx, qualification, receipts)
}
