import { MessageId, ProviderRequestId } from '@deepseek-ai/dsh-llm/brand'
import { SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { ContinuationState, Terminal } from '../shared/continuation.ts'
import { foldEvent, initialState, terminalDisposition } from '../shared/continuation.ts'
import { isRequestId } from '../shared/protocol.ts'
import type { ReceiptState } from '../shared/receipt.ts'
import { foldReceipt, initialReceiptState } from '../shared/receipt.ts'

/** A historical terminal hint, never permission or a promise that input can be sent. */
export interface ManualContinueProjection {
  readonly candidate: {
    readonly terminalSeq: number
    readonly turn: number
    readonly reasonKind: string
  } | null
}

export interface QualificationProjectionState extends ContinuationState {
  readonly sessionId: SessionId
  readonly inheritedEventCount: SessionLogOffset
}

export interface ReceiptProjectionState extends ReceiptState {
  readonly inheritedEventCount: SessionLogOffset
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    manualContinue: ManualContinueProjection
  }
}

const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const seqSchema = safeInteger.transform(SessionSeq)
const cursorSchema = z.union([z.literal(-1), seqSchema])
const offsetSchema = safeInteger.transform(SessionLogOffset)
const turnSchema = safeInteger.min(1)
const sessionIdSchema = z.string().min(1).transform(SessionId)
const messageIdSchema = z.string().min(1).transform(MessageId)

const failureSchema = z
  .strictObject({
    message: z.string(),
    code: z.string(),
    status: z.number().optional(),
    providerRetryAfterMs: z.number().optional(),
    requestId: z.string().transform(ProviderRequestId).optional(),
    offloadImages: z.number().optional(),
  })
  .transform((value) => ({
    message: value.message,
    code: value.code,
    ...(value.status === undefined ? {} : { status: value.status }),
    ...(value.providerRetryAfterMs === undefined
      ? {}
      : { providerRetryAfterMs: value.providerRetryAfterMs }),
    ...(value.requestId === undefined ? {} : { requestId: value.requestId }),
    ...(value.offloadImages === undefined ? {} : { offloadImages: value.offloadImages }),
  }))

const cancelCauseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('user') }),
  z.strictObject({ kind: z.literal('parent') }),
  z.strictObject({ kind: z.literal('hook'), reason: z.string() }),
  z.strictObject({ kind: z.literal('disposed') }),
  z.strictObject({ kind: z.literal('legacy') }),
])
const reasonSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed') }),
  z.strictObject({ kind: z.literal('aborted'), reason: cancelCauseSchema }),
  z.strictObject({ kind: z.literal('blocked') }),
  z.strictObject({ kind: z.literal('error'), error: failureSchema }),
  z.strictObject({ kind: z.literal('max-tokens') }),
  z.strictObject({ kind: z.literal('interrupted') }),
  z.strictObject({ kind: z.literal('forked') }),
])

const qualificationStateSchema: z.ZodType<QualificationProjectionState> = z
  .strictObject({
    sessionId: sessionIdSchema,
    inheritedEventCount: offsetSchema,
    asOfSeq: cursorSchema,
    activeTurn: turnSchema.nullable(),
    terminal: z.strictObject({ turn: turnSchema, seq: seqSchema, reason: reasonSchema }).nullable(),
    invalidated: z.boolean(),
  })
  .refine(
    (state) =>
      state.terminal === null ||
      (state.activeTurn === null &&
        !state.invalidated &&
        state.terminal.seq >= state.inheritedEventCount &&
        state.terminal.seq <= state.asOfSeq),
    'A terminal must belong to an own, ended, non-invalidated event in this cursor',
  )

const receiptStateSchema: z.ZodType<ReceiptProjectionState> = z
  .strictObject({
    sessionId: sessionIdSchema,
    inheritedEventCount: offsetSchema,
    asOfSeq: cursorSchema,
    activeTurn: turnSchema.nullable(),
    candidate: z
      .strictObject({
        terminalSeq: seqSchema,
        turn: turnSchema,
        evidence: z
          .strictObject({
            requestId: z.string().refine(isRequestId),
            messageId: messageIdSchema,
            inboxSeq: seqSchema.nullable(),
            historySeq: seqSchema.nullable(),
            conflict: z.boolean(),
          })
          .nullable(),
      })
      .nullable(),
  })
  .refine((state) => {
    const candidate = state.candidate
    if (candidate === null) return true
    if (
      candidate.terminalSeq < state.inheritedEventCount ||
      candidate.terminalSeq > state.asOfSeq
    ) {
      return false
    }
    const evidence = candidate.evidence
    if (evidence === null) return true
    if (evidence.inboxSeq === null && evidence.historySeq === null) return false
    return [evidence.inboxSeq, evidence.historySeq].every(
      (seq) => seq === null || (seq > candidate.terminalSeq && seq <= state.asOfSeq),
    )
  }, 'Receipt evidence must belong after an own terminal and within the observed cursor')

const emptyView: ManualContinueProjection = Object.freeze({ candidate: null })
const terminalViews = new WeakMap<Terminal, ManualContinueProjection>()

function viewQualification(state: QualificationProjectionState): ManualContinueProjection {
  const disposition = terminalDisposition(state)
  if (disposition.kind !== 'candidate') return emptyView
  const terminal = disposition.terminal
  const previous = terminalViews.get(terminal)
  if (previous !== undefined) return previous
  const view: ManualContinueProjection = Object.freeze({
    candidate: Object.freeze({
      terminalSeq: terminal.seq,
      turn: terminal.turn,
      reasonKind: terminal.reason.kind,
    }),
  })
  terminalViews.set(terminal, view)
  return view
}

type QualificationDefinition = ProjectionDefinition<
  'manualContinue',
  QualificationProjectionState
> & {
  readonly wire: NonNullable<
    ProjectionDefinition<'manualContinue', QualificationProjectionState>['wire']
  >
}

/** The inherited prefix is walked for continuity, never interpreted as work owned by this Session. */
export const qualificationDefinition: QualificationDefinition = {
  key: 'manualContinue',
  stateVersion: 1,
  stateSchema: qualificationStateSchema,
  init(header, inheritedEventCount) {
    return {
      ...initialState(),
      sessionId: SessionId(header.id),
      inheritedEventCount: SessionLogOffset(inheritedEventCount),
    }
  },
  apply(state, event) {
    if (event.seq < state.inheritedEventCount) {
      if (event.seq !== state.asOfSeq + 1) {
        throw new Error('Inherited qualification events must be contiguous')
      }
      return { ...state, asOfSeq: event.seq }
    }
    return {
      ...foldEvent(state, event),
      sessionId: state.sessionId,
      inheritedEventCount: state.inheritedEventCount,
    }
  },
  wire: {
    viewSchema: z.strictObject({
      candidate: z
        .strictObject({ terminalSeq: safeInteger, turn: turnSchema, reasonKind: z.string() })
        .nullable(),
    }),
    view: viewQualification,
  },
}

/** Host-only evidence: not an authorization token, a durability barrier, or model-start proof. */
export const receiptDefinition: ProjectionDefinition<
  'manualContinueReceipt',
  ReceiptProjectionState
> = {
  key: 'manualContinueReceipt',
  stateVersion: 1,
  stateSchema: receiptStateSchema,
  init(header, inheritedEventCount) {
    return {
      ...initialReceiptState(SessionId(header.id)),
      inheritedEventCount: SessionLogOffset(inheritedEventCount),
    }
  },
  apply(state, event) {
    if (event.seq < state.inheritedEventCount) {
      if (event.seq !== state.asOfSeq + 1) {
        throw new Error('Inherited receipt events must be contiguous')
      }
      return { ...state, asOfSeq: event.seq }
    }
    return { ...foldReceipt(state, event), inheritedEventCount: state.inheritedEventCount }
  },
}
