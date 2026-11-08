import assert from 'node:assert/strict'
import test from 'node:test'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session/types'
import { CONTINUATION_TEXT, createContinuationMessage } from '../src/host/message.ts'

const terminal = {
  turn: 3,
  seq: SessionSeq(7),
  reason: { kind: 'aborted', reason: { kind: 'user' } },
} as const

// All messages here are detached offline values. No Agent or live Session is used.
test('creates immutable identified user-role input with plugin-owned attribution', () => {
  const message = createContinuationMessage(SessionId('offline'), terminal, 'offline_request_0001')
  assert.equal(message.role, 'user')
  assert.equal(message.source.kind, 'plugin:manual-continue')
  assert.equal(message.source.requestId, 'offline_request_0001')
  assert.equal(message.source.sessionId, 'offline')
  assert.equal(message.source.terminalSeq, 7)
  assert.equal(message.source.turn, 3)
  assert.deepEqual(message.content, [{ type: 'text', text: CONTINUATION_TEXT }])
  assert.ok(message.id)
  assert.ok(Object.isFrozen(message))
  assert.ok(Object.isFrozen(message.source))
  assert.ok(Object.isFrozen(message.content))
})

test('creation is not deduplication or persistence; repeated creation gives different identities', () => {
  const first = createContinuationMessage(SessionId('offline'), terminal, 'offline_request_0001')
  const second = createContinuationMessage(SessionId('offline'), terminal, 'offline_request_0001')
  assert.notEqual(first.id, second.id)
})

test('does not copy historical errors, tool results, credentials, or caller-supplied text', () => {
  const message = createContinuationMessage(SessionId('offline'), terminal, 'offline_request_0001')
  assert.equal(message.content.length, 1)
  assert.match(CONTINUATION_TEXT, /结果未知时先核实/)
  assert.match(CONTINUATION_TEXT, /不是恢复原模型流或执行栈/)
  assert.doesNotMatch(JSON.stringify(message.source), /content|error|tool|principal|authorization/)
})

for (const requestId of [
  '',
  'short',
  'x'.repeat(129),
  'invalid_request_0001\n',
  '../request_00000001',
]) {
  test(`rejects invalid operation identity ${JSON.stringify(requestId)}`, () => {
    assert.throws(
      () => createContinuationMessage(SessionId('offline'), terminal, requestId),
      /Invalid continuation request identity/,
    )
  })
}
