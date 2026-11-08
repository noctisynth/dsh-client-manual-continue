import type {} from '@deepseek-ai/dsh-session-projection/types'

/** A historical terminal hint, never authorization or permission to enqueue input. */
export interface ManualContinueProjection {
  readonly candidate: {
    readonly terminalSeq: number
    readonly turn: number
    readonly reasonKind: string
  } | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    manualContinue: ManualContinueProjection
  }
}
