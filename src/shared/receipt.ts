import type {} from '@deepseek-ai/dsh-agent/types'
import type { MessageId, UserMessage } from '@deepseek-ai/dsh-llm'
import type {
  SessionEvent,
  SessionId,
  SessionSeq,
  SessionSeqCursor,
} from '@deepseek-ai/dsh-session/types'
import { terminalDisposition } from './continuation.ts'
import { isRequestId } from './protocol.ts'

/** Exact operation identity retained by the Host before calling followup. Not authority. */
export interface ReceiptIdentity {
  readonly sessionId: SessionId
  readonly terminalSeq: SessionSeq
  readonly turn: number
  readonly requestId: string
  readonly messageId: MessageId
}

export interface ReceiptEvidence {
  readonly requestId: string
  readonly messageId: MessageId
  readonly inboxSeq: SessionSeq | null
  readonly historySeq: SessionSeq | null
  readonly conflict: boolean
}

/** Only the newest eligible terminal and its single correlated observation are retained. */
export interface ReceiptState {
  readonly sessionId: SessionId
  readonly asOfSeq: SessionSeqCursor
  readonly activeTurn: number | null
  readonly candidate: {
    readonly terminalSeq: SessionSeq
    readonly turn: number
    readonly evidence: ReceiptEvidence | null
  } | null
}

export type ReceiptResult =
  | { readonly kind: 'accepted'; readonly messageId: MessageId; readonly inboxSeq: SessionSeq }
  | {
      readonly kind: 'in-history'
      readonly messageId: MessageId
      readonly inboxSeq: SessionSeq | null
      readonly historySeq: SessionSeq
    }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'stale' }
  | { readonly kind: 'outcome-unknown' }

interface DecodedSource {
  readonly sessionId: string
  readonly terminalSeq: number
  readonly turn: number
  readonly requestId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Restored source data remains untrusted even when its surrounding message is well typed. */
function decodeSource(value: unknown): DecodedSource | null {
  if (
    !isRecord(value) ||
    value.kind !== 'plugin:manual-continue' ||
    typeof value.sessionId !== 'string' ||
    value.sessionId.length === 0 ||
    typeof value.terminalSeq !== 'number' ||
    !Number.isSafeInteger(value.terminalSeq) ||
    value.terminalSeq < 0 ||
    typeof value.turn !== 'number' ||
    !Number.isSafeInteger(value.turn) ||
    value.turn < 1 ||
    !isRequestId(value.requestId)
  ) {
    return null
  }
  return {
    sessionId: value.sessionId,
    terminalSeq: value.terminalSeq,
    turn: value.turn,
    requestId: value.requestId,
  }
}

export function initialReceiptState(sessionId: SessionId): ReceiptState {
  return { sessionId, asOfSeq: -1, activeTurn: null, candidate: null }
}

function observeMessage(
  state: ReceiptState,
  message: UserMessage,
  seq: SessionSeq,
  location: 'inbox' | 'history',
): ReceiptState {
  const source = decodeSource(message.source)
  const candidate = state.candidate
  if (
    source === null ||
    candidate === null ||
    source.sessionId !== state.sessionId ||
    source.terminalSeq !== candidate.terminalSeq ||
    source.turn !== candidate.turn ||
    seq <= candidate.terminalSeq
  ) {
    return state
  }
  const previous = candidate.evidence
  const mismatch =
    previous !== null &&
    (previous.requestId !== source.requestId || previous.messageId !== message.id)
  // A repeated committed insertion is not merely a retried command receipt: it may run twice.
  const repeatedInsertion = location === 'inbox' && previous !== null
  const evidence: ReceiptEvidence = {
    requestId: previous?.requestId ?? source.requestId,
    messageId: previous?.messageId ?? message.id,
    inboxSeq: previous?.inboxSeq ?? (location === 'inbox' ? seq : null),
    historySeq: previous?.historySeq ?? (location === 'history' ? seq : null),
    conflict: previous?.conflict === true || mismatch || repeatedInsertion,
  }
  return { ...state, candidate: { ...candidate, evidence } }
}

/**
 * Incremental committed-log fold; restore a checkpoint then feed its contiguous suffix.
 * This observes acceptance/history only, never authorization, flush, model start or completion.
 * Keep the last candidate through a new turn so an uncertain followup can still be reconciled;
 * a newer eligible terminal replaces it, bounding the state independently of history length.
 */
export function foldReceipt(state: ReceiptState, event: SessionEvent): ReceiptState {
  if (event.seq !== state.asOfSeq + 1) {
    throw new Error('Receipt projection requires contiguous increasing event sequences')
  }
  const next = { ...state, asOfSeq: event.seq }
  switch (event.type) {
    case 'turn/start':
      return { ...next, activeTurn: event.data.turn }
    case 'turn/end': {
      const terminal = terminalDisposition({
        asOfSeq: event.seq,
        activeTurn: null,
        terminal:
          state.activeTurn === event.data.turn
            ? { seq: event.seq, turn: event.data.turn, reason: event.data.reason }
            : null,
        invalidated: false,
      })
      return {
        ...next,
        activeTurn: null,
        candidate:
          terminal.kind === 'candidate'
            ? { terminalSeq: event.seq, turn: event.data.turn, evidence: null }
            : state.candidate,
      }
    }
    case 'agent/inbox/spliced': {
      let observed: ReceiptState = next
      for (const message of event.data.inserted) {
        observed = observeMessage(observed, message, event.seq, 'inbox')
      }
      // Pure removals, including canceled or claimed input, cannot undo prior acceptance.
      return observed
    }
    case 'user/message':
      return observeMessage(next, event.data, event.seq, 'history')
    default:
      return next
  }
}

/**
 * There is deliberately no "not accepted, retry" result. Missing evidence, including after a
 * crash or canceled wait, stays unknown; the Host must not infer that reposting is safe.
 * "accepted" means observed inbox insertion, not that input is still pending or on disk.
 * "in-history" means an observed user/message, not that any model request actually began.
 */
export function reconcileReceipt(state: ReceiptState, expected: ReceiptIdentity): ReceiptResult {
  if (expected.sessionId !== state.sessionId) return { kind: 'stale' }
  const candidate = state.candidate
  if (candidate === null || expected.terminalSeq > state.asOfSeq) {
    return { kind: 'outcome-unknown' }
  }
  if (candidate.terminalSeq !== expected.terminalSeq || candidate.turn !== expected.turn) {
    return { kind: 'stale' }
  }
  const evidence = candidate.evidence
  if (evidence === null) return { kind: 'outcome-unknown' }
  if (
    evidence.conflict ||
    evidence.requestId !== expected.requestId ||
    evidence.messageId !== expected.messageId
  ) {
    return { kind: 'conflict' }
  }
  if (evidence.historySeq !== null) {
    return {
      kind: 'in-history',
      messageId: evidence.messageId,
      inboxSeq: evidence.inboxSeq,
      historySeq: evidence.historySeq,
    }
  }
  if (evidence.inboxSeq !== null) {
    return { kind: 'accepted', messageId: evidence.messageId, inboxSeq: evidence.inboxSeq }
  }
  return { kind: 'outcome-unknown' }
}
