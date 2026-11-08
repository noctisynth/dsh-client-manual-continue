import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  RemoteResult,
  TypertClientRemote,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import { TYPERT_REMOTE } from 'dsh-client-manual-continue/remote'
import type {
  ContinueAvailability,
  ContinueRequest,
  ContinueResult,
} from '../../src/shared/protocol.ts'

// A namespace-resolution regression unit, not a Gateway, Loader, page, or human-click test.
// Cordis owns all association/trace/injection semantics. The test namespace replaces only
// the network carrier; it implements the generated public business face and sends no RPC.
interface CarrierCall {
  readonly endpoint: 'manualContinue/availability'
  readonly json: { readonly args: Readonly<Record<string, never>> }
  readonly signal: AbortSignal | undefined
}
type Carrier = (call: CarrierCall) => Promise<RemoteResult<ContinueAvailability>>

type NamespacePort = TypertClientRemote['manualContinue']

class Namespace extends Service implements NamespacePort {
  private readonly carrier: Carrier

  constructor(ctx: Context, carrier: Carrier) {
    super(ctx, 'remote.manualContinue')
    this.carrier = carrier
  }

  availability(signal?: AbortSignal): Promise<RemoteResult<ContinueAvailability>> {
    return this.carrier({ endpoint: 'manualContinue/availability', json: { args: {} }, signal })
  }

  submit(_request: ContinueRequest, _signal?: AbortSignal): Promise<RemoteResult<ContinueResult>> {
    throw new Error('This fixture must never submit model input')
  }

  reconcile(
    _request: ContinueRequest,
    _signal?: AbortSignal,
  ): Promise<RemoteResult<ContinueResult>> {
    throw new Error('This fixture exercises only read-only availability')
  }
}

class RootRemote extends Service implements Pick<TypertClientRemote, '$mount'> {
  private readonly owner: Context
  private readonly carrier: Carrier

  constructor(ctx: Context, carrier: Carrier) {
    super(ctx, 'remote')
    this.owner = ctx
    this.carrier = carrier
  }

  async $mount(contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
    assert.equal(contribution.package, 'dsh-client-manual-continue')
    assert.ok(
      contribution.descriptors.some(
        (descriptor) =>
          descriptor.namespace === 'manualContinue' && descriptor.method === 'availability',
      ),
    )
    const namespace = this.owner.plugin({
      apply: (ctx: Context) => {
        new Namespace(ctx, this.carrier)
      },
    })
    await namespace
    return () => namespace.dispose()
  }
}

async function fixture(t: TestContext) {
  const ctx = new Context()
  t.after(async () => ctx.fiber.dispose())
  const calls: CarrierCall[] = []
  await ctx.plugin({
    apply(owner: Context) {
      new RootRemote(owner, async (call) => {
        calls.push(call)
        return { ok: true, value: { kind: 'available' } }
      })
    },
  })
  return { ctx, calls }
}

const availability = TYPERT_REMOTE.methods['manualContinue/availability']
const notInjected = /cannot get (?:property|required service) "remote\.manualContinue"/

test('mounting a namespace does not authorize a caller that injected only root remote', async (t) => {
  const { ctx, calls } = await fixture(t)
  await ctx.plugin({
    inject: ['remote'],
    async apply(parent: Context) {
      const remote = parent.get('remote')
      assert.ok(remote)
      const unmount = await remote.$mount(TYPERT_REMOTE)
      parent.effect(() => unmount)
      assert.ok(parent.get('remote.manualContinue'))
      const signal = new AbortController().signal
      assert.throws(() => availability.invoke(remote, {}, signal), notInjected)
      assert.throws(() => availability.invoke(parent.remote, {}, signal), notInjected)
      assert.equal(calls.length, 0)
    },
  })
})

test('post-mount child injection gives generated invocation the correct traced caller', async (t) => {
  const { ctx, calls } = await fixture(t)
  await ctx.plugin({
    inject: ['remote'],
    async apply(parent: Context) {
      const remote = parent.get('remote')
      assert.ok(remote)
      const unmount = await remote.$mount(TYPERT_REMOTE)
      parent.effect(() => unmount)
      const signal = new AbortController().signal
      await parent.inject(['remote.manualContinue'], async (scope) => {
        const scopedRemote = scope.get('remote')
        assert.ok(scopedRemote)
        const result = await availability.invoke(scopedRemote, {}, signal)
        assert.deepEqual(result, { ok: true, value: { kind: 'available' } })
        assert.equal(calls.length, 1)
        const call = calls[0]
        assert.ok(call)
        assert.equal(call.endpoint, 'manualContinue/availability')
        assert.equal(call.signal, signal)
        assert.deepEqual(call.json, { args: {} })
        assert.equal(JSON.stringify(call.json), '{"args":{}}')
        assert.equal(Object.hasOwn(call.json.args, 'signal'), false)
        // Keeping the parent's old Remote would retain the same missing-injection defect.
        assert.throws(() => availability.invoke(remote, {}, signal), notInjected)
        assert.equal(calls.length, 1)
      })
    },
  })
})

test('a namespace dependency cannot be supplied by an apply body parked on that dependency', async (t) => {
  const { ctx, calls } = await fixture(t)
  let entered = false
  const parked = ctx.plugin({
    inject: ['remote', 'remote.manualContinue'],
    apply() {
      entered = true
    },
  })
  await Promise.resolve()
  assert.equal(entered, false)
  assert.equal(calls.length, 0)
  await parked.dispose()
  assert.equal(entered, false)
})
