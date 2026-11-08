import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { RemoteResult, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import { TYPERT_REMOTE } from 'dsh-client-manual-continue/remote'
import { TYPERT } from 'dsh-client-manual-continue/typert'
import type { ContinueAvailability, ContinueResult } from '../src/shared/protocol.ts'
import { isContinueRequest } from '../src/shared/protocol.ts'

const request = { sessionId: 'offline', requestId: 'offline_request_001', terminalSeq: 1, turn: 1 }
const availability = TYPERT_REMOTE.methods['manualContinue/availability']
const submit = TYPERT_REMOTE.methods['manualContinue/submit']
const reconcile = TYPERT_REMOTE.methods['manualContinue/reconcile']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

test('official artifacts publish three direct operations with zero JSON fields for availability', () => {
  assert.equal(TYPERT_REMOTE.package, 'dsh-client-manual-continue')
  assert.deepEqual(Object.keys(TYPERT_REMOTE.methods).sort(), [
    'manualContinue/availability',
    'manualContinue/reconcile',
    'manualContinue/submit',
  ])
  assert.equal(TYPERT_REMOTE.descriptors.length, 3)
  for (const descriptor of TYPERT_REMOTE.descriptors) {
    assert.equal(descriptor.invocation.kind, 'direct')
    assert.equal(descriptor.cancellation?.parameter, 'signal')
    if (descriptor.id === availability.id) {
      assert.equal(descriptor.parameters.length, 0)
      continue
    }
    assert.equal(descriptor.parameters.length, 1)
    const parameter = descriptor.parameters[0]
    assert.ok(parameter)
    assert.equal(parameter.source, 'json')
    assert.equal(parameter.codec.mode, 'strict')
  }
})

test('consumer methods share the actual generated descriptors and cached strict parser', () => {
  assert.equal(
    submit,
    TYPERT_REMOTE.descriptors.find((entry) => entry.id === submit.id),
  )
  assert.equal(submit.input({ strict: true }), submit.input({ strict: true }))
  assert.deepEqual(submit.input({ strict: true }).create().parse({ input: request }), {
    input: request,
  })
  assert.deepEqual(reconcile.input({ strict: true }).create().parse({ request }), { request })
})

test('generated invocation forwards cancellation outside JSON to all three Client methods', async () => {
  const controller = new AbortController()
  const seen: (AbortSignal | undefined)[] = []
  const result: RemoteResult<ContinueResult> = { ok: true, value: { kind: 'canceled' } }
  const availabilityResult: RemoteResult<ContinueAvailability> = {
    ok: true,
    value: { kind: 'available' },
  }
  const remote: TypertClientRemote = {
    $mount() {
      return Promise.resolve(() => Promise.resolve())
    },
    $on() {
      return () => {}
    },
    manualContinue: {
      availability(signal) {
        seen.push(signal)
        return Promise.resolve(availabilityResult)
      },
      submit(input, signal) {
        assert.deepEqual(input, request)
        seen.push(signal)
        return Promise.resolve(result)
      },
      reconcile(input, signal) {
        assert.deepEqual(input, request)
        seen.push(signal)
        return Promise.resolve(result)
      },
    },
  }
  assert.deepEqual(await availability.invoke(remote, {}, controller.signal), availabilityResult)
  assert.deepEqual(await submit.invoke(remote, { input: request }, controller.signal), result)
  assert.deepEqual(await reconcile.invoke(remote, { request }, controller.signal), result)
  assert.deepEqual(seen, [controller.signal, controller.signal, controller.signal])
})

test('availability has an empty strict input and no session admission or completion result', () => {
  const input = availability.input({ strict: true }).create()
  assert.deepEqual(input.parse({}), {})
  for (const value of [
    { sessionId: 'offline' },
    { principal: { kind: 'owner' } },
    { signal: {} },
  ]) {
    assert.throws(() => input.parse(value))
  }
  const result = availability.result.create()
  for (const kind of ['available', 'forbidden', 'unavailable', 'canceled'] as const) {
    assert.deepEqual(result.parse({ kind }), { kind })
  }
  for (const kind of [
    'accepted',
    'already-accepted',
    'model-started',
    'completed',
    'outcome-unknown',
  ]) {
    assert.throws(() => result.parse({ kind }))
  }
})

test('strict Client codec rejects untrusted extra authority and malformed JSON field types', () => {
  const parser = submit.input({ strict: true }).create()
  for (const input of [
    { input: { ...request, principal: { kind: 'owner' } } },
    { input: request, human: true },
    { input: request, signal: { aborted: false } },
    { input: { ...request, sessionId: 1 } },
    { input: { ...request, terminalSeq: '1' } },
  ]) {
    assert.throws(() => parser.parse(input))
  }
})

test('wire shape parsing never replaces Host semantic bounds or authorization', () => {
  const parsed = submit
    .input({ strict: true })
    .create()
    .parse({
      input: { ...request, terminalSeq: -1, turn: 0 },
    })
  assert.equal(isContinueRequest(parsed.input), false)
})

test('result codec distinguishes accepted and unknown, never inventing model completion', () => {
  const parser = submit.result.create()
  assert.deepEqual(
    parser.parse({ kind: 'accepted', messageId: 'offline-message', durability: 'confirmed' }),
    { kind: 'accepted', messageId: 'offline-message', durability: 'confirmed' },
  )
  assert.deepEqual(parser.parse({ kind: 'outcome-unknown', requestId: request.requestId }), {
    kind: 'outcome-unknown',
    requestId: request.requestId,
  })
  for (const result of [
    { kind: 'accepted' },
    { kind: 'accepted', messageId: 'offline-message', durability: 'assumed' },
    { kind: 'model-started' },
    { kind: 'completed' },
  ]) {
    assert.throws(() => parser.parse(result))
  }
})

test('Host contribution and consumer artifact expose matching endpoint identities', () => {
  assert.ok(isRecord(TYPERT))
  assert.equal(TYPERT.package, TYPERT_REMOTE.package)
  assert.equal(TYPERT.face, 'host')
  assert.ok(Array.isArray(TYPERT.invocations))
  const ids: string[] = []
  for (const value of TYPERT.invocations) {
    const entry: unknown = value
    assert.ok(isRecord(entry) && typeof entry.id === 'string')
    ids.push(entry.id)
  }
  assert.deepEqual(ids.sort(), TYPERT_REMOTE.descriptors.map((entry) => entry.id).sort())
})

test('generated artifacts contain no machine-specific workspace or staging location', () => {
  for (const file of [
    'typert.host.js',
    'typert.remote-client.js',
    'typert.remote-client.d.ts.map',
  ]) {
    const content = readFileSync(new URL(`../lib/${file}`, import.meta.url), 'utf8')
    assert.equal(content.includes(process.cwd()), false)
    assert.equal(content.includes(process.cwd().replaceAll('\\', '/')), false)
    assert.equal(content.includes('.inspection'), false)
  }
})
