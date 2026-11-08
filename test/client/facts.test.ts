import assert from 'node:assert/strict'
import test from 'node:test'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { classifyDraft } from '../../src/client/draft.ts'
import { continuationFacts, decodeProjection, type FactsSource } from '../../src/client/facts.ts'

const empty = {
  draft: '',
  attachmentIds: [],
  draftRev: 0,
  phase: 'plain',
  occurrences: [],
  queue: [],
}
const sid = SessionId('client-facts-fixture')
function source(overrides: Partial<FactsSource> = {}): FactsSource {
  return {
    sessionId: sid,
    session: {
      sessionId: sid,
      running: false,
      removed: false,
      openState: 'open',
      subagent: null,
      pendingSubmissions: [],
    },
    status: { running: false, pendingInteraction: undefined, completionUnread: false },
    projection: { candidate: { terminalSeq: 2, turn: 1, reasonKind: 'error' } },
    input: empty,
    generation: 1,
    connected: true,
    ownerVerified: true,
    access: true,
    blocked: false,
    ...overrides,
  }
}

test('only the complete, known plain draft is empty; classification never mutates it', () => {
  const draft = Object.freeze({ ...empty, claim: undefined })
  assert.deepEqual(classifyDraft(draft), { kind: 'empty', revision: 0 })
  assert.equal(draft.draft, '')
  assert.equal(draft.attachmentIds.length, 0)
})

test('whitespace, quotes, references and every attachment id remain real draft content', () => {
  for (const draft of [
    { ...empty, draft: ' ' },
    { ...empty, draft: '\n' },
    { ...empty, draft: '> quote' },
    { ...empty, draft: '\u200b' },
    { ...empty, attachmentIds: ['upload-not-resolved'] },
    { ...empty, occurrences: [{}] },
    { ...empty, queue: [{}] },
  ])
    assert.equal(classifyDraft(draft).kind, 'blocked')
})

test('claimed, adjudicating, submitting and sending never expose a continuation action', () => {
  for (const phase of ['claimed', 'adjudicating', 'submitting', 'sending']) {
    assert.equal(classifyDraft({ ...empty, phase }).kind, 'blocked')
  }
  assert.equal(classifyDraft({ ...empty, claim: { name: 'fixture' } }).kind, 'blocked')
})

test('unknown draft fields and malformed or missing state fail closed', () => {
  for (const draft of [
    undefined,
    null,
    [],
    {},
    { ...empty, draft: null },
    { ...empty, draftRev: -1 },
    { ...empty, draftRev: Number.NaN },
    { ...empty, phase: 'future-phase' },
    { ...empty, attachmentIds: null },
    { ...empty, occurrences: undefined },
    { ...empty, queue: {} },
    { ...empty, uploading: true },
  ])
    assert.equal(classifyDraft(draft).kind, 'unknown')
})

test('projection decoder accepts only the explicit wire hint, not extra authority', () => {
  const view = source().projection
  assert.deepEqual(decodeProjection(view), view)
  assert.deepEqual(decodeProjection({ candidate: null }), { candidate: null })
  for (const value of [
    undefined,
    {},
    { ...view, authorized: true },
    { candidate: [] },
    { candidate: { terminalSeq: -1, turn: 1, reasonKind: 'error' } },
    { candidate: { terminalSeq: 2, turn: 0, reasonKind: 'error' } },
    { candidate: { terminalSeq: 2, turn: 1, reasonKind: 'error', owner: true } },
  ])
    assert.equal(decodeProjection(value), undefined)
})

test('candidate plus ACL is not owner proof; current connection and exact generation are required', () => {
  assert.equal(continuationFacts(source()).eligible, true)
  for (const overrides of [
    { ownerVerified: false },
    { access: false },
    { connected: false },
    { generation: undefined },
    { generation: -1 },
    { generation: Number.NaN },
    { blocked: true },
  ])
    assert.equal(continuationFacts(source(overrides)).eligible, false)
})

test('missing, running or interaction-unknown Session status is not idle', () => {
  assert.equal(continuationFacts(source({ status: undefined })).eligible, false)
  for (const running of [true, undefined]) {
    assert.equal(
      continuationFacts(
        source({
          status: { running, pendingInteraction: undefined, completionUnread: false },
        }),
      ).eligible,
      false,
    )
  }
  assert.equal(
    continuationFacts(
      source({
        status: {
          running: false,
          completionUnread: false,
          pendingInteraction: { key: 'fixture', kind: 'fixture', sessionId: sid },
        },
      }),
    ).eligible,
    false,
  )
})

test('cold, loading, removed, wrong Session and running snapshots retain native UI', () => {
  const original = source().session
  assert.ok(original)
  assert.equal(continuationFacts(source({ session: undefined })).eligible, false)
  for (const session of [
    { ...original, openState: 'cold' as const },
    { ...original, openState: 'loading' as const },
    { ...original, removed: true },
    { ...original, running: true },
    { ...original, sessionId: SessionId('other-client-facts') },
  ])
    assert.equal(continuationFacts(source({ session })).eligible, false)
})

test('unknown projection and normal completion do not become local recovery authority', () => {
  for (const projection of [
    undefined,
    { candidate: null },
    { candidate: { terminalSeq: 2, turn: 1, reasonKind: 'completed' } },
    { candidate: { terminalSeq: 2, turn: 1, reasonKind: 'blocked' } },
  ])
    assert.equal(continuationFacts(source({ projection })).eligible, false)
})
