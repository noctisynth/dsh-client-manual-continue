import type { CordisInspectProviderManifest } from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { classifyDraft } from './draft.ts'
import { continuationFacts, type FactsSource } from './facts.ts'

type InspectValue = JsonValue
type Reader = () => InspectValue

/** Anonymous, read-only diagnostics. Readers never activate, refresh, probe or transport input. */
export class ContinuationInspection {
  private readonly readers = new Set<Reader>()
  private disposed = false

  register(reader: Reader): () => void {
    if (this.disposed) return () => {}
    this.readers.add(reader)
    return () => {
      this.readers.delete(reader)
    }
  }

  // The minimal browser seam is checked against the full published registry type in tests;
  // its runner entry also imports Node-only loader declarations and cannot enter this program.
  readonly provider: {
    manifest: CordisInspectProviderManifest
    query(
      method: string,
      input: JsonValue | undefined,
      context: { readonly signal: AbortSignal },
    ): Promise<JsonValue>
  } = {
    manifest: {
      id: 'ManualContinue',
      description:
        'Read-only anonymous display gates for the manual continuation plugin; no input or execution actions.',
      methods: [
        {
          name: 'snapshot',
          description:
            'Read mounted occurrence gate summaries without Session ids, draft content, DOM strings or business calls.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          outputSchema: { type: 'object' },
        },
      ],
    },
    query: async (method, input, context) => {
      if (method !== 'snapshot') throw new Error('Unknown manual continuation inspection method')
      if (
        input !== undefined &&
        (typeof input !== 'object' ||
          input === null ||
          Array.isArray(input) ||
          Object.keys(input).length !== 0)
      )
        throw new Error('Manual continuation inspection expects an empty object')
      if (context.signal.aborted || this.disposed) return { available: false, occurrences: [] }
      const occurrences: InspectValue[] = []
      let ordinal = 0
      for (const read of this.readers) {
        try {
          occurrences.push({ ordinal, gates: read() })
        } catch {
          occurrences.push({ ordinal, gates: { available: false } })
        }
        ordinal += 1
      }
      return { available: true, occurrences }
    },
  }

  dispose(): void {
    this.disposed = true
    this.readers.clear()
  }
}

export function describeFacts(source: FactsSource): InspectValue {
  const facts = continuationFacts(source)
  const draft = classifyDraft(source.input)
  const session = source.session
  const status = source.status
  const candidate = source.projection?.candidate
  return {
    eligible: facts.eligible,
    connected: source.connected,
    generationPresent: source.generation !== undefined,
    ownerVerified: source.ownerVerified,
    access: source.access,
    blocked: source.blocked,
    projectionPresent: source.projection !== undefined,
    candidatePresent: candidate !== undefined && candidate !== null,
    candidateKind:
      candidate !== undefined &&
      candidate !== null &&
      ['error', 'aborted', 'max-tokens', 'interrupted'].includes(candidate.reasonKind)
        ? candidate.reasonKind
        : 'none-or-unknown',
    sessionPresent: session !== undefined,
    bindingIdentityMatches: session !== undefined && session.sessionId === source.sessionId,
    sessionOpen: session?.openState === 'open',
    sessionRemoved: session?.removed ?? null,
    sessionRunning: session?.running ?? null,
    rootSession: session?.subagent === null,
    pendingSubmissions: session?.pendingSubmissions.length ?? null,
    statusPresent: status !== undefined,
    statusRunning: status?.running ?? null,
    pendingInteraction: status?.pendingInteraction !== undefined,
    draft:
      draft.kind === 'blocked' ? { kind: draft.kind, reason: draft.reason } : { kind: draft.kind },
  }
}
