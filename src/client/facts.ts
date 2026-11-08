import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatus } from '@deepseek-ai/dsh-client-ui-session/client'
import type { ManualContinueProjection } from '../shared/projection.ts'
import type { ContinuationFacts } from './action.ts'
import { classifyDraft } from './draft.ts'

export type NativeSessionFacts = Pick<
  SessionSnapshot,
  'sessionId' | 'running' | 'removed' | 'openState' | 'subagent' | 'pendingSubmissions'
>

export interface FactsSource {
  readonly sessionId: string
  readonly session: NativeSessionFacts | undefined
  readonly status: SessionStatus | undefined
  readonly projection: ManualContinueProjection | undefined
  readonly input: unknown
  readonly generation: number | undefined
  readonly connected: boolean
  readonly ownerVerified: boolean
  readonly access: boolean
  readonly blocked: boolean
}

export function decodeProjection(value: unknown): ManualContinueProjection | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  if (Object.keys(value).length !== 1 || !('candidate' in value)) return undefined
  if (value.candidate === null) return { candidate: null }
  const candidate = value.candidate
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    Array.isArray(candidate) ||
    Object.keys(candidate).length !== 3 ||
    !('terminalSeq' in candidate) ||
    typeof candidate.terminalSeq !== 'number' ||
    !Number.isSafeInteger(candidate.terminalSeq) ||
    candidate.terminalSeq < 0 ||
    !('turn' in candidate) ||
    typeof candidate.turn !== 'number' ||
    !Number.isSafeInteger(candidate.turn) ||
    candidate.turn < 1 ||
    !('reasonKind' in candidate) ||
    typeof candidate.reasonKind !== 'string'
  )
    return undefined
  return {
    candidate: {
      terminalSeq: candidate.terminalSeq,
      turn: candidate.turn,
      reasonKind: candidate.reasonKind,
    },
  }
}

/** All local facts are display guards only. Host admission repeats its authoritative checks. */
export function continuationFacts(source: FactsSource): ContinuationFacts {
  const hint = source.projection?.candidate
  const candidate =
    hint !== undefined &&
    hint !== null &&
    Number.isSafeInteger(hint.terminalSeq) &&
    hint.terminalSeq >= 0 &&
    Number.isSafeInteger(hint.turn) &&
    hint.turn > 0 &&
    ['error', 'aborted', 'max-tokens', 'interrupted'].includes(hint.reasonKind)
      ? { terminalSeq: hint.terminalSeq, turn: hint.turn }
      : null
  const session = source.session
  const status = source.status
  const generation = source.connected ? source.generation : undefined
  return {
    sessionId: source.sessionId,
    candidate,
    generation,
    eligible:
      source.connected &&
      generation !== undefined &&
      Number.isSafeInteger(generation) &&
      generation >= 0 &&
      source.ownerVerified &&
      source.access &&
      !source.blocked &&
      candidate !== null &&
      session !== undefined &&
      session.sessionId === source.sessionId &&
      session.openState === 'open' &&
      session.removed === false &&
      session.running === false &&
      session.subagent === null &&
      session.pendingSubmissions.length === 0 &&
      status !== undefined &&
      status.running === false &&
      status.pendingInteraction === undefined &&
      classifyDraft(source.input).kind === 'empty',
  }
}
