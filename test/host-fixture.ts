import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  Agent,
  AgentCancelCause,
  AgentOptions,
  AgentStatus,
  CancelOptions,
  Inbox,
  InboxTarget,
  Model,
  ModelSelection,
} from '@deepseek-ai/dsh-agent'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { PendingRemoteEventInfo } from '@deepseek-ai/dsh-api-gateway'
import { isRemoteEventAgentId } from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import type { MessageId, UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Scope } from '@deepseek-ai/dsh-scope'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Session } from '@deepseek-ai/dsh-session'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import type { PeerId, PeerScope, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import * as host from 'dsh-client-manual-continue'
import type { ContinueRequest } from '../src/shared/protocol.ts'

export function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {
    throw new Error('Deferred not initialized')
  }
  let reject: (reason: unknown) => void = () => {
    throw new Error('Deferred not initialized')
  }
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

class TestInbox implements Inbox {
  private readonly turn: UserMessage[] = []
  private readonly step: UserMessage[] = []
  clearCalls = 0

  private readonly session: Session

  constructor(session: Session) {
    this.session = session
  }

  get nextTurn(): readonly UserMessage[] {
    return this.turn
  }
  get nextStep(): readonly UserMessage[] {
    return this.step
  }
  clear(): void {
    this.clearCalls += 1
    this.splice('next-step', 0, Infinity, [])
    this.splice('next-turn', 0, Infinity, [])
  }
  append(target: InboxTarget, message: UserMessage): void {
    this.splice(target, Infinity, 0, [message])
  }
  prepend(target: InboxTarget, message: UserMessage): void {
    this.splice(target, 0, 0, [message])
  }
  replace(messageId: MessageId, replacement: UserMessage): boolean {
    for (const target of ['next-turn', 'next-step'] as const) {
      const list = target === 'next-turn' ? this.turn : this.step
      const index = list.findIndex((message) => message.id === messageId)
      if (index < 0) continue
      this.splice(target, index, 1, [replacement])
      return true
    }
    return false
  }
  remove(messageId: MessageId): boolean {
    for (const target of ['next-turn', 'next-step'] as const) {
      const list = target === 'next-turn' ? this.turn : this.step
      const index = list.findIndex((message) => message.id === messageId)
      if (index < 0) continue
      this.splice(target, index, 1, [])
      return true
    }
    return false
  }
  splice(
    target: InboxTarget,
    start: number,
    count: number,
    inserted: UserMessage[],
  ): UserMessage[] {
    const list = target === 'next-turn' ? this.turn : this.step
    const normalized = start < 0 ? Math.max(0, list.length + start) : Math.min(start, list.length)
    const removedCount = Math.min(Math.max(count, 0), list.length - normalized)
    if (removedCount === 0 && inserted.length === 0) return []
    const removed = list.splice(normalized, removedCount, ...inserted)
    this.session.append('agent/inbox/spliced', {
      target,
      start: normalized,
      removedCount,
      inserted,
      ...(inserted.length === 0 ? { outcome: 'canceled' as const } : {}),
    })
    return removed
  }
}

/** Structural Agent test double: no driver, tools, LLM or automatic inbox consumption. */
export class TestAgent implements Agent {
  readonly id: SessionId
  readonly options: AgentOptions = {}
  readonly inbox: TestInbox
  readonly model: Model
  phase: 'idle' | 'running' | 'maintenance' = 'idle'
  followups = 0
  cancels = 0
  maintenanceEntries = 0
  whenIdleCalls = 0
  failFollowup: 'none' | 'before' | 'after' = 'none'
  idleGate: Promise<void> | undefined
  onBeforeMaintenance: (() => void) | undefined
  readonly idleEntered = deferred<void>()

  readonly session: Session
  readonly ctx: Context

  constructor(session: Session, ctx: Context) {
    this.session = session
    this.ctx = ctx
    this.id = session.id
    this.inbox = new TestInbox(session)
    let selection: ModelSelection = { provider: 'offline', model: 'offline' }
    this.model = {
      current: () => selection,
      select: (next) => {
        selection = { ...next }
        session.append('model/selection', next)
      },
    }
  }
  get status(): AgentStatus {
    return this.phase === 'running' ? 'running' : 'idle'
  }
  cancel(_cause: AgentCancelCause, _options?: CancelOptions): void {
    this.cancels += 1
  }
  async whenIdle(): Promise<void> {
    this.whenIdleCalls += 1
    this.idleEntered.resolve()
    await this.idleGate
  }
  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.onBeforeMaintenance?.()
    if (this.phase !== 'idle') throw new Error('Agent already has activity')
    this.phase = 'maintenance'
    this.maintenanceEntries += 1
    return task(new AbortController().signal).finally(() => {
      this.phase = 'idle'
    })
  }
  send(message: UserMessage, target: InboxTarget, _wakeup: boolean): void {
    this.inbox.append(target, message)
  }
  followup(message: UserMessage): void {
    this.followups += 1
    if (this.failFollowup === 'before') throw new Error('Offline throw before splice')
    this.send(message, 'next-turn', true)
    if (this.failFollowup === 'after') throw new Error('Offline throw after splice')
  }
  steer(message: UserMessage): void {
    this.send(message, 'next-step', true)
  }
  inject(message: UserMessage): void {
    this.send(message, 'next-step', false)
  }
}

/** Only the two Gateway reads used by the operation; not a real RPC/Loader validation. */
class TestGateway extends Service {
  connected = true
  clientReads = 0
  pendingReads = 0
  pending: readonly PendingRemoteEventInfo[] = []
  constructor(ctx: Context) {
    super(ctx, 'typertGateway')
  }
  hasLiveClient(): boolean {
    this.clientReads += 1
    return this.connected
  }
  getPendingRemoteEvents(): readonly PendingRemoteEventInfo[] {
    this.pendingReads += 1
    return this.pending
  }
  block(sessionId: SessionId): void {
    const agentId: unknown = String(sessionId)
    assert.ok(isRemoteEventAgentId(agentId))
    this.pending = [{ event: 'approval/request', agentId }]
  }
}

export async function fixture(t: TestContext, options: { flush?: boolean } = {}) {
  const ctx = new Context()
  const scopes: Scope[] = []
  const releases: Array<() => void> = []
  t.after(async () => {
    for (const release of releases) release()
    for (const scope of scopes) await scope.dispose()
    await ctx.fiber.dispose()
  })
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  const gateway = new TestGateway(ctx)
  let coldCalls = 0
  ctx.agents.setFactory({
    async createAgent() {
      coldCalls += 1
      throw new Error('No real agent creation allowed')
    },
    async resume() {
      coldCalls += 1
      throw new Error('No real agent resume allowed')
    },
  })
  const session = ctx.sessions.create(SessionId('host-offline'))
  session.append('turn/start', { turn: 1 })
  const end = session.append('turn/end', {
    turn: 1,
    reason: { kind: 'error', error: { code: 'UNKNOWN', message: 'offline failure' } },
  })
  const agentScope = createScope(ctx, {})
  scopes.push(agentScope)
  const agent = new TestAgent(session, agentScope.ctx)
  const registration = ctx.agents.register(agent)
  await registration
  let flushes = 0
  let flushHook: ((index: number) => void | Promise<void>) | undefined
  if (options.flush !== false) {
    ctx.on('session/flush', async (flushed) => {
      assert.equal(flushed, session)
      flushes += 1
      await flushHook?.(flushes)
    })
  }
  const hostFiber = ctx.plugin(host)
  await hostFiber
  const peerScope = createScope(ctx, {})
  scopes.push(peerScope)
  const peerAbort = new AbortController()
  releases.push(() => peerAbort.abort())
  const peer: PeerScope = {
    id: 'offline-peer' as PeerId,
    ctx: peerScope.ctx,
    principal: { kind: 'owner' },
    signal: peerAbort.signal,
    interactions: 'answer',
    dispose: async () => {
      peerAbort.abort()
      await peerScope.dispose()
    },
  }
  const request: ContinueRequest = {
    sessionId: session.id,
    terminalSeq: end.seq,
    turn: 1,
    requestId: 'host_operation_0001',
  }
  function receiver(
    method: 'availability' | 'submit' | 'reconcile',
    signal = peerAbort.signal,
    caller = peer,
  ) {
    const invocation: RemoteInvocation = {
      request: {
        namespace: 'manualContinue',
        method,
        args:
          method === 'availability' ? {} : method === 'submit' ? { input: request } : { request },
      },
      service: 'manualContinue',
      peer: caller,
      signal,
      async *uplink<In>(): AsyncIterable<In> {},
    }
    const service = ctx.extend({ invocation }).get('manualContinue')
    assert.ok(service)
    return service
  }
  function gate() {
    const value = deferred<void>()
    releases.push(() => value.resolve())
    return value
  }
  return {
    ctx,
    gateway,
    session,
    agent,
    registration,
    peer,
    peerAbort,
    request,
    hostFiber,
    receiver,
    gate,
    get flushes() {
      return flushes
    },
    get coldCalls() {
      return coldCalls
    },
    setFlushHook(hook: (index: number) => void | Promise<void>) {
      flushHook = hook
    },
    async owner() {
      const ownerSession = ctx.sessions.create(SessionId('offline-owner'))
      const scope = createScope(ctx, {})
      scopes.push(scope)
      const parent = new TestAgent(ownerSession, scope.ctx)
      await ctx.agents.register(parent)
      return parent
    },
    async replacement(owner?: Agent, agentSession: Session = session) {
      await registration()
      const scope = createScope(ctx, {})
      scopes.push(scope)
      const next = new TestAgent(agentSession, scope.ctx)
      if (owner === undefined) await ctx.agents.register(next)
      else {
        const detach = ctx.agents.enter(next, owner)
        releases.push(detach)
        await ctx.agents.announce(next, 'startup')
      }
      return next
    },
  }
}

export function ordinaryInput(): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: 'competing user input' }],
    source: { kind: 'user' },
  })
}
