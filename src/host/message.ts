import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId, SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { Terminal } from '../shared/continuation.ts'
import { isRequestId } from '../shared/protocol.ts'

export interface ManualContinueSource {
  readonly kind: 'plugin:manual-continue'
  readonly requestId: string
  readonly sessionId: SessionId
  readonly terminalSeq: SessionSeq
  readonly turn: number
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'plugin:manual-continue': ManualContinueSource
  }
}

export const CONTINUATION_TEXT =
  '请继续处理本会话中尚未完成的工作。复用已提交的工具结果，不重放已经完成的工具；' +
  '外部副作用结果未知时先核实，再决定下一步。保留现有审批、沙箱和暂停目标状态。' +
  '这是一次由人类请求的新输入和后续轮次，不是恢复原模型流或执行栈。'

/** Builds only; does not authorize, enqueue, wake an Agent, or persist anything. */
export function createContinuationMessage(
  sessionId: SessionId,
  terminal: Terminal,
  requestId: string,
) {
  if (!isRequestId(requestId)) {
    throw new Error('Invalid continuation request identity')
  }
  const source: ManualContinueSource = {
    kind: 'plugin:manual-continue',
    sessionId,
    terminalSeq: terminal.seq,
    turn: terminal.turn,
    requestId,
  }
  return createUserMessage({ content: [{ type: 'text', text: CONTINUATION_TEXT }], source })
}
