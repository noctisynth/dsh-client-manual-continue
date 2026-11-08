/** JSON request; no Agent lookup can run before the Host's owner guard. */
export interface ContinueRequest {
  readonly sessionId: string
  readonly requestId: string
  readonly terminalSeq: number
  readonly turn: number
}

export type ContinueResult =
  | {
      readonly kind: 'accepted' | 'already-accepted'
      readonly messageId: string
      readonly durability: 'confirmed' | 'unknown'
    }
  | {
      readonly kind:
        | 'forbidden'
        | 'invalid-request'
        | 'unavailable'
        | 'stale'
        | 'busy'
        | 'pending-input'
        | 'pending-interaction'
        | 'canceled'
    }
  | { readonly kind: 'outcome-unknown'; readonly requestId: string }

export function isRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 128 &&
    !/[^a-zA-Z0-9_-]/.test(value)
  )
}

/** Wire JSON is not authoritative. Semantic bounds are checked again on the Host. */
export function isContinueRequest(value: unknown): value is ContinueRequest {
  if (value === null || typeof value !== 'object') return false
  if (!('sessionId' in value) || !('requestId' in value)) return false
  if (!('terminalSeq' in value) || !('turn' in value)) return false
  return (
    Object.keys(value).length === 4 &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= 256 &&
    ![...value.sessionId].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    isRequestId(value.requestId) &&
    typeof value.terminalSeq === 'number' &&
    Number.isSafeInteger(value.terminalSeq) &&
    value.terminalSeq >= 0 &&
    typeof value.turn === 'number' &&
    Number.isSafeInteger(value.turn) &&
    value.turn > 0
  )
}
