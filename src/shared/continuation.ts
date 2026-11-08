import type {} from '@deepseek-ai/dsh-agent/types'
import type {
  SessionEvent,
  SessionSeq,
  SessionSeqCursor,
  TurnEndReason,
} from '@deepseek-ai/dsh-session/types'

/** Facts only: an abnormal terminal is not itself authorization to run a model. */
export interface Terminal {
  readonly turn: number
  readonly seq: SessionSeq
  readonly reason: TurnEndReason
}

export interface ContinuationState {
  readonly asOfSeq: SessionSeqCursor
  readonly activeTurn: number | null
  readonly terminal: Terminal | null
  readonly invalidated: boolean
}

export type TerminalDisposition =
  | { readonly kind: 'candidate'; readonly terminal: Terminal }
  | { readonly kind: 'unavailable' }

export function initialState(): ContinuationState {
  return { asOfSeq: -1, activeTurn: null, terminal: null, invalidated: false }
}

/**
 * Called in committed log order by the Host projection, never on live token frames.
 * A later user message or turn start invalidates the previous terminal permanently.
 */
export function foldEvent(state: ContinuationState, event: SessionEvent): ContinuationState {
  if (event.seq !== state.asOfSeq + 1) {
    throw new Error(
      'Continuation projection requires contiguous strictly increasing event sequences',
    )
  }
  switch (event.type) {
    case 'turn/start':
      return { asOfSeq: event.seq, activeTurn: event.data.turn, terminal: null, invalidated: true }
    case 'turn/end':
      // An unmatched end may be an incomplete replay window; it cannot establish eligibility.
      if (state.activeTurn !== event.data.turn) {
        return { asOfSeq: event.seq, activeTurn: null, terminal: null, invalidated: true }
      }
      return {
        asOfSeq: event.seq,
        activeTurn: null,
        terminal: { turn: event.data.turn, seq: event.seq, reason: event.data.reason },
        invalidated: false,
      }
    case 'user/message':
      return { ...state, asOfSeq: event.seq, terminal: null, invalidated: true }
    case 'agent/inbox/spliced':
      // Even a subsequently canceled competing insertion consumes this candidate.
      return event.data.inserted.length > 0
        ? { ...state, asOfSeq: event.seq, terminal: null, invalidated: true }
        : { ...state, asOfSeq: event.seq }
    default:
      return { ...state, asOfSeq: event.seq }
  }
}

/** RFC-001's fixed policy; a candidate still requires trusted Host admission. */
export function terminalDisposition(state: ContinuationState): TerminalDisposition {
  const terminal = state.terminal
  if (state.activeTurn !== null || state.invalidated || terminal === null) {
    return { kind: 'unavailable' }
  }
  switch (terminal.reason.kind) {
    case 'aborted':
      return terminal.reason.reason.kind === 'user'
        ? { kind: 'candidate', terminal }
        : { kind: 'unavailable' }
    case 'error':
    case 'max-tokens':
    case 'interrupted':
      return { kind: 'candidate', terminal }
    default:
      return { kind: 'unavailable' }
  }
}
