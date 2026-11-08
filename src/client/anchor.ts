import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { TYPERT_REMOTE } from 'dsh-client-manual-continue/remote'
import * as React from 'react'
import { type ContinuationActionSnapshot, ManualContinuationController } from './action.ts'
import type { ContinuationAuthority } from './authority.ts'
import { createDomSeat, type DomSeat } from './dom-seat.ts'
import { continuationFacts, decodeProjection } from './facts.ts'
import { type ContinuationInspection, describeFacts } from './inspection.ts'
import type { localeNamespace } from './locale.ts'

export interface AnchorRuntime {
  readonly ctx: Context
  readonly remote: Context['remote']
  readonly connection: ConnectionHandle
  readonly locale: Context['locale']
  readonly authority: ContinuationAuthority
  readonly inspection: ContinuationInspection
  readonly signal: AbortSignal
  readonly t: TranslateNS<typeof localeNamespace>
}
type Props = PropsRuntime<'conversation.input.right'> & InjectFace<{ runtime: AnchorRuntime }>
const idle: ContinuationActionSnapshot = Object.freeze({ kind: 'idle' })
const readIdle = () => idle
const subscribeNone = (_listener: () => void) => () => {}

function consumed(
  snapshot: ContinuationActionSnapshot,
  terminalSeq: number,
  turn: number,
): boolean {
  return (
    snapshot.kind === 'settled' &&
    snapshot.request.terminalSeq === terminalSeq &&
    snapshot.request.turn === turn &&
    (snapshot.result.kind === 'accepted' || snapshot.result.kind === 'already-accepted')
  )
}

/** A stable module-level component. The Slot injects its run-owned environment, not a new component. */
export function ContinuationAnchor(props: Props): React.ReactElement {
  const { ctx, remote, connection, locale, authority, inspection, signal, t } = props.runtime
  // These public hooks subscribe this occurrence; activation reads their public sources again.
  const inputSnapshot = props.useInput((value) => value)
  props.useSession((value) => value)
  props.useSessionStatus((value) => value.get(props.sessionId))
  props.useProjection('manualContinue')
  const access = props.useRemoteAccess('manualContinue/submit')
  React.useSyncExternalStore(authority.subscribe, authority.getSnapshot, authority.getSnapshot)
  React.useSyncExternalStore(
    (listener) => locale.subscribe(listener),
    () => locale.getSnapshot(),
    () => locale.getSnapshot(),
  )
  const binding = ctx.sessions.binding(props.sessionId)
  const input = React.useMemo(
    () => (binding === undefined ? undefined : ctx.conversation.input.for(binding.ctx)),
    [binding, ctx],
  )
  const blocks = React.useMemo(
    () => ctx.conversation.blocks.storeFor(props.sessionId),
    [ctx, props.sessionId],
  )
  React.useSyncExternalStore(
    (listener) => blocks.subscribe(listener),
    () => blocks.getSnapshot(),
    () => blocks.getSnapshot(),
  )
  const currentAccess = React.useRef(access)
  currentAccess.current = access
  const anchor = React.useRef<HTMLSpanElement>(null)
  const seat = React.useRef<DomSeat | undefined>(undefined)
  const mounted = React.useRef(false)
  const readSource = React.useMemo(
    () => () => {
      const connected = connection.state.getSnapshot() === 'connected'
      const generation = connected ? connection.generation.getSnapshot()?.id : undefined
      const proof = authority.getSnapshot()
      const exact = binding !== undefined && ctx.sessions.binding(props.sessionId) === binding
      return {
        sessionId: props.sessionId,
        session: exact ? binding.session.getSnapshot() : undefined,
        status: ctx.uiSession.sessionStatus.getSnapshot().get(props.sessionId),
        projection: exact
          ? decodeProjection(binding.session.projections.faceOf('manualContinue').getSnapshot())
          : undefined,
        input: exact ? input?.state.getSnapshot() : undefined,
        connected: connected && !signal.aborted,
        generation,
        ownerVerified: proof.kind === 'available' && proof.generation === generation,
        access: currentAccess.current,
        blocked: blocks.getSnapshot() !== undefined,
      }
    },
    [authority, binding, blocks, connection, ctx, input, props.sessionId, signal],
  )
  const readFacts = React.useMemo(() => () => continuationFacts(readSource()), [readSource])
  React.useLayoutEffect(
    () =>
      inspection.register(() => ({
        facts: describeFacts(readSource()),
        authority: authority.getDiagnostics(),
        proofMatchesGeneration: authority.getSnapshot().generation === readSource().generation,
        dom: seat.current?.getDiagnostics() ?? { status: 'unmounted' },
      })),
    [inspection, readSource, authority],
  )
  const active = React.useRef<ManualContinuationController | undefined>(undefined)
  const [controller, setController] = React.useState<ManualContinuationController>()
  React.useSyncExternalStore(
    controller?.subscribe ?? subscribeNone,
    controller?.getSnapshot ?? readIdle,
    controller?.getSnapshot ?? readIdle,
  )
  const notify = (snapshot: ContinuationActionSnapshot, target: SessionInput): void => {
    if (snapshot.kind === 'unknown') target.notify('error', t('unknown'))
    else if (snapshot.kind === 'settled') {
      const result = snapshot.result
      if (result.kind === 'accepted' || result.kind === 'already-accepted') return
      if (result.kind === 'outcome-unknown') target.notify('error', t('unknown'))
      else target.notify('info', t('denied', { reason: t(`reason.${result.kind}`) }))
    }
  }
  const presentation = React.useRef(() => ({
    visible: false,
    busy: false,
    label: '',
    activate: (_event: MouseEvent) => {},
  }))
  presentation.current = () => {
    const facts = readFacts()
    const current = active.current
    if (current === undefined)
      return {
        visible: false,
        busy: false,
        label: '',
        activate: (_event: MouseEvent) => {},
      }
    const snapshot = current.getSnapshot()
    const candidate = facts.candidate
    return {
      visible:
        facts.eligible &&
        candidate !== null &&
        !consumed(snapshot, candidate.terminalSeq, candidate.turn) &&
        typeof globalThis.crypto?.randomUUID === 'function',
      busy: snapshot.kind === 'pending',
      label: t(
        snapshot.kind === 'pending'
          ? 'pending'
          : snapshot.kind === 'unknown'
            ? 'checking'
            : 'continue',
      ),
      activate: (event: MouseEvent) => {
        void current.activate(event).then((outcome) => {
          if (
            !mounted.current ||
            active.current !== current ||
            signal.aborted ||
            input === undefined ||
            binding === undefined ||
            ctx.sessions.binding(props.sessionId) !== binding
          )
            return
          if (outcome === 'invalid') input.notify('error', t('invalid'))
          else if (outcome === 'handled') notify(current.getSnapshot(), input)
        })
      },
    }
  }
  React.useLayoutEffect(() => {
    const current = new ManualContinuationController(
      {
        submit: (request, abort) =>
          TYPERT_REMOTE.methods['manualContinue/submit'].invoke(remote, { input: request }, abort),
        reconcile: (request, abort) =>
          TYPERT_REMOTE.methods['manualContinue/reconcile'].invoke(remote, { request }, abort),
      },
      readFacts,
      () => globalThis.crypto.randomUUID(),
    )
    active.current = current
    setController(current)
    mounted.current = true
    const node = anchor.current
    if (node !== null)
      seat.current = createDomSeat(node, props.sessionId, () => presentation.current())
    return () => {
      mounted.current = false
      seat.current?.dispose()
      seat.current = undefined
      if (active.current === current) active.current = undefined
      current.dispose()
    }
  }, [readFacts, remote, props.sessionId])
  const lastInput = React.useRef<typeof inputSnapshot | undefined>(undefined)
  // The adapter is imperative: every commit rechecks current facts. Only a genuinely new
  // input publication may release its editing latch; locale/probe/RPC completion cannot.
  React.useLayoutEffect(() => {
    const inputPublished = lastInput.current !== inputSnapshot
    lastInput.current = inputSnapshot
    active.current?.synchronize()
    seat.current?.refresh(inputPublished)
  })
  return React.createElement('span', {
    ref: anchor,
    hidden: true,
    'aria-hidden': true,
    'data-dsh-manual-continue-anchor': '',
  })
}
