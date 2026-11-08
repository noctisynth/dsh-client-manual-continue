import assert from 'node:assert/strict'
import test from 'node:test'
import { isContinueRequest, isRequestId } from '../src/shared/protocol.ts'

const request = { sessionId: 'offline', requestId: 'offline_request_001', terminalSeq: 1, turn: 1 }

test('admits only bounded JSON operation identity, never caller or source authority', () => {
  assert.ok(isContinueRequest(request))
  assert.equal(isContinueRequest({ ...request, requestedBy: 'human-click' }), false)
  assert.equal(isContinueRequest({ ...request, principal: { kind: 'owner' } }), false)
})

for (const value of [
  undefined,
  null,
  [],
  'continue',
  {},
  { ...request, sessionId: '' },
  { ...request, sessionId: 'x'.repeat(257) },
  { ...request, sessionId: 'invalid\n' },
  { ...request, requestId: 'invalid_request_001\n' },
  { ...request, terminalSeq: -1 },
  { ...request, terminalSeq: 1.5 },
  { ...request, terminalSeq: Number.MAX_SAFE_INTEGER + 1 },
  { ...request, terminalSeq: Infinity },
  { ...request, turn: 0 },
  { ...request, turn: NaN },
]) {
  test(`rejects invalid request ${JSON.stringify(value)}`, () => {
    assert.equal(isContinueRequest(value), false)
  })
}

test('request identity bounds also reject final line terminators in restored metadata', () => {
  assert.equal(isRequestId('x'.repeat(16)), true)
  assert.equal(isRequestId('x'.repeat(128)), true)
  for (const value of ['x'.repeat(15), 'x'.repeat(129), `${request.requestId}\n`, 1, null]) {
    assert.equal(isRequestId(value), false)
  }
})
