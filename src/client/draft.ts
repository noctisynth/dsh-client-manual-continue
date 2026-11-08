import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'

export type DraftReadiness =
  | { readonly kind: 'empty'; readonly revision: number }
  | {
      readonly kind: 'blocked'
      readonly reason: 'text' | 'attachments' | 'references' | 'claim' | 'phase' | 'queue'
    }
  | { readonly kind: 'unknown' }

const fields = new Set<string>([
  'draft',
  'attachmentIds',
  'draftRev',
  'phase',
  'claim',
  'occurrences',
  'queue',
] satisfies readonly (keyof InputState)[])
const phases = new Set(['plain', 'adjudicating', 'claimed', 'submitting', 'sending'])

/** Native canSend/trimmed emptiness is insufficient: never erase unsent or structured content. */
export function classifyDraft(value: unknown): DraftReadiness {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'unknown' }
  }
  if (Object.keys(value).some((key) => !fields.has(key))) return { kind: 'unknown' }
  if (
    !('draft' in value) ||
    typeof value.draft !== 'string' ||
    !('draftRev' in value) ||
    typeof value.draftRev !== 'number' ||
    !Number.isSafeInteger(value.draftRev) ||
    value.draftRev < 0 ||
    !('phase' in value) ||
    typeof value.phase !== 'string' ||
    !phases.has(value.phase) ||
    !('attachmentIds' in value) ||
    !Array.isArray(value.attachmentIds) ||
    !('occurrences' in value) ||
    !Array.isArray(value.occurrences) ||
    !('queue' in value) ||
    !Array.isArray(value.queue)
  ) {
    return { kind: 'unknown' }
  }
  if (value.draft.length !== 0) return { kind: 'blocked', reason: 'text' }
  if (value.attachmentIds.length !== 0) return { kind: 'blocked', reason: 'attachments' }
  if (value.occurrences.length !== 0) return { kind: 'blocked', reason: 'references' }
  if ('claim' in value && value.claim !== undefined) return { kind: 'blocked', reason: 'claim' }
  if (value.phase !== 'plain') return { kind: 'blocked', reason: 'phase' }
  if (value.queue.length !== 0) return { kind: 'blocked', reason: 'queue' }
  return { kind: 'empty', revision: value.draftRev }
}
