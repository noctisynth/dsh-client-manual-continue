import './sdk.ts'
import type { Context } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from 'dsh-client-manual-continue/remote'
import * as React from 'react'
import { type AnchorRuntime, ContinuationAnchor } from './anchor.ts'
import { ContinuationAuthority } from './authority.ts'
import { dictionaries, localeNamespace } from './locale.ts'

export const inject = [
  'slots',
  'locale',
  'remote',
  'connection',
  'sessions',
  'conversation',
  'uiSession',
  'modules',
]
const targetRelease = '0.2.2-rc.1'

/** Exported by a native lazy-CJS factory; loading the script never calls apply. */
export function apply(ctx: Context): void {
  if (
    [
      React.createElement,
      React.useMemo,
      React.useRef,
      React.useLayoutEffect,
      React.useState,
      React.useSyncExternalStore,
    ].some((method) => typeof method !== 'function')
  ) {
    throw new Error('Manual continuation: missing shared React capability')
  }
  const remote = ctx.get('remote')
  const connection = ctx.get('connection')
  const slots = ctx.get('slots')
  const locale = ctx.get('locale')
  const modules = ctx.get('modules')
  if (
    remote === undefined ||
    connection === undefined ||
    slots === undefined ||
    locale === undefined ||
    modules === undefined ||
    modules.manifest.release?.version !== targetRelease
  )
    throw new Error('Manual continuation: unsupported Client capability or release')
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort())
  ctx.effect(async () => {
    const releaseRemote = await remote.$mount(TYPERT_REMOTE)
    if (lifetime.signal.aborted) {
      await releaseRemote()
      return () => {}
    }
    let releaseLocale: (() => void) | undefined
    let authority: ContinuationAuthority | undefined
    let releaseSlot: (() => void) | undefined
    const dispose = async () => {
      lifetime.abort()
      try {
        releaseSlot?.()
      } finally {
        try {
          authority?.dispose()
        } finally {
          try {
            releaseLocale?.()
          } finally {
            await releaseRemote()
          }
        }
      }
    }
    try {
      releaseLocale = locale.register(localeNamespace, dictionaries)
      const t = locale.bind(localeNamespace)
      authority = new ContinuationAuthority(connection, (signal) =>
        TYPERT_REMOTE.methods['manualContinue/availability'].invoke(remote, {}, signal),
      )
      const runtime: AnchorRuntime = {
        ctx,
        remote,
        connection,
        locale,
        authority,
        signal: lifetime.signal,
        t,
      }
      releaseSlot = slots.inject('conversation.input.right', () =>
        slots.register(
          {
            name: 'conversation.input.right',
            id: 'dsh-client-manual-continue',
            order: 10000,
            label: () => t('meta.title'),
            inject: () => ({ runtime }),
          },
          ContinuationAnchor,
        ),
      )
      return dispose
    } catch (error) {
      await dispose()
      throw error
    }
  })
}
