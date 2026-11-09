import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { DomSeat, DomSeatPresentation } from '../../src/client/dom-seat.ts'
import { createDomSeat } from '../../src/client/dom-seat.ts'

const ownedSelector = '[data-dsh-manual-continue-owned]'
const suppressed = 'data-dsh-manual-continue-native'

// Small source-shaped DOM fixtures, not a rendered DSH page or human-click/layout verification.
function fixture(t: TestContext) {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', {
    url: 'https://offline.invalid',
  })
  const doc = dom.window.document
  const controls: DomSeat[] = []
  t.after(() => {
    for (const control of controls) control.dispose()
    dom.window.close()
  })
  const selectedRoot = doc.querySelector('main')
  assert.ok(selectedRoot)
  const root = selectedRoot
  function occurrence(id = 'offline-session', cssPrefix = 'JZLxKW') {
    const section = doc.createElement('section')
    section.setAttribute('data-conversation-content', '')
    section.dataset.conversationSession = id
    const seat = doc.createElement('div')
    seat.setAttribute('data-composer-seat', '')
    seat.dataset.conversationRegion = 'composer'
    const card = doc.createElement('div')
    card.setAttribute('data-composer-card', 'true')
    card.tabIndex = -1
    const editor = doc.createElement('div')
    editor.setAttribute('data-composer-input', 'true')
    editor.setAttribute('role', 'textbox')
    editor.setAttribute('aria-multiline', 'true')
    editor.setAttribute('contenteditable', 'true')
    editor.dataset.phase = 'plain'
    editor.tabIndex = 0
    editor.innerHTML = '<p><br></p>'
    const row = doc.createElement('div')
    row.className = `${cssPrefix}_row`
    const tools = doc.createElement('div')
    tools.className = `${cssPrefix}_tools`
    const trailing = doc.createElement('div')
    trailing.className = `${cssPrefix}_trailing`
    const standard = doc.createElement('div')
    standard.className = `${cssPrefix}_standardControls`
    const anchor = doc.createElement('span')
    anchor.hidden = true
    anchor.setAttribute('aria-hidden', 'true')
    const modelRoot = doc.createElement('div')
    const model = doc.createElement('button')
    model.type = 'button'
    model.className = 'Model_trigger'
    model.setAttribute('aria-busy', 'false')
    model.setAttribute('aria-haspopup', 'menu')
    modelRoot.append(model)
    standard.append(anchor, modelRoot)
    const native = doc.createElement('button')
    native.type = 'button'
    native.className = `${cssPrefix}_primary`
    native.setAttribute('aria-busy', 'false')
    native.setAttribute('aria-label', '原按钮 / native')
    native.disabled = true
    native.textContent = '↑'
    trailing.append(standard, native)
    row.append(tools, trailing)
    card.append(editor, row)
    seat.append(card)
    section.append(seat)
    root.append(section)
    return { section, seat, card, editor, row, trailing, standard, anchor, model, native }
  }
  function connect(anchor: HTMLElement, state: DomSeatPresentation, id = 'offline-session') {
    const control = createDomSeat(anchor, id, () => state)
    controls.push(control)
    return control
  }
  function button(card: HTMLElement) {
    const element = card.querySelector(`${ownedSelector} button`)
    assert.ok(element instanceof dom.window.HTMLButtonElement)
    return element
  }
  const state = {
    visible: true,
    busy: false,
    label: '手动续跑',
    calls: 0,
    activate(_event: MouseEvent) {
      this.calls += 1
    },
  }
  const settle = () => new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0))
  return { dom, doc, root, occurrence, connect, button, state, settle, controls }
}

test('inserts one owned button in the original parent/child seat and hides only native', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const callback = () => {
    throw new Error('Native send must not be called')
  }
  a.native.onclick = callback
  a.native.style.color = 'red'
  const control = f.connect(a.anchor, f.state)
  assert.equal(control.getStatus(), 'attached')
  const owned = f.button(a.card)
  const host = owned.parentElement
  assert.ok(host)
  assert.equal(host.parentElement, a.trailing)
  assert.equal(host.nextElementSibling, a.native)
  assert.equal(host.style.display, 'contents')
  assert.equal(f.dom.window.getComputedStyle(a.native).display, 'none')
  assert.equal(a.native.hidden, false)
  assert.equal(a.native.disabled, true)
  assert.equal(a.native.onclick, callback)
  assert.equal(a.native.style.color, 'red')
  assert.equal(owned.type, 'button')
  assert.equal(owned.className, a.native.className)
  assert.equal(owned.getAttribute('aria-label'), f.state.label)
  assert.equal(owned.querySelector('path')?.getAttribute('fill'), 'currentColor')
  control.dispose()
  assert.equal(a.native.hasAttribute(suppressed), false)
  assert.notEqual(f.dom.window.getComputedStyle(a.native).display, 'none')
  assert.equal(a.card.querySelector(ownedSelector), null)
  assert.equal(a.native.onclick, callback)
})

test('the nested aria-busy model trigger is not a competing primary action', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  assert.equal(a.card.querySelectorAll('button[type="button"][aria-busy]').length, 2)
  assert.equal(a.model.disabled, false)
  const control = f.connect(a.anchor, f.state)
  assert.equal(control.getStatus(), 'attached')
  assert.equal(control.getDiagnostics().mainMatched, true)
  assert.equal(a.model.hasAttribute(suppressed), false)
  assert.equal(a.native.hasAttribute(suppressed), true)
  control.dispose()
  assert.equal(a.model.hasAttribute(suppressed), false)
  assert.equal(a.native.hasAttribute(suppressed), false)
})

test('discovers build prefixes without a platform branch or hash allowlist', async (t) => {
  const f = fixture(t)
  const generated = `build_${f.dom.window.crypto.randomUUID().replaceAll('-', '_')}`
  for (const prefix of ['GRgSLq', 'JZLxKW', 'uV2eYG', '9_build-hash', generated]) {
    await t.test(prefix, (t) => {
      const f = fixture(t)
      const a = f.occurrence('offline-session', prefix)
      a.row.classList.add('layout-row')
      a.trailing.classList.add(`${prefix}_trailingActive`)
      a.standard.classList.add('extra-controls')
      a.native.classList.add('theme-button')
      const control = f.connect(a.anchor, f.state)
      assert.equal(control.getStatus(), 'attached')
      assert.equal(control.getDiagnostics().frameMatched, true)
      assert.equal(f.button(a.card).className, a.native.className)
      control.dispose()
      assert.equal(a.native.hasAttribute(suppressed), false)
      assert.equal(a.card.querySelector(ownedSelector), null)
    })
  }
})

test('discovers separate prefixes in same-Session occurrences independently', (t) => {
  const f = fixture(t)
  const left = f.occurrence('offline-session', 'GRgSLq')
  const right = f.occurrence('offline-session', 'JZLxKW')
  const rightControl = f.connect(right.anchor, f.state)
  const leftControl = f.connect(left.anchor, f.state)
  assert.equal(rightControl.getStatus(), 'attached')
  assert.equal(leftControl.getStatus(), 'attached')
  assert.equal(f.button(left.card).className, 'GRgSLq_primary')
  assert.equal(f.button(right.card).className, 'JZLxKW_primary')
  rightControl.dispose()
  assert.equal(right.native.hasAttribute(suppressed), false)
  assert.equal(left.native.hasAttribute(suppressed), true)
})

test('mixed, ambiguous or missing module tokens never become a dynamic match', async (t) => {
  for (const variant of [
    'mixed-trailing',
    'mixed-row',
    'mixed-primary',
    'ambiguous-controls',
    'ambiguous-trailing',
    'ambiguous-row',
    'ambiguous-primary',
    'nested-controls',
    'missing-controls',
    'missing-primary',
    'empty-prefix',
    'unsafe-prefix',
    'substring-only',
    'foreign-button',
    'classless-button',
  ] as const) {
    await t.test(variant, (t) => {
      const f = fixture(t)
      const a = f.occurrence()
      if (variant === 'mixed-trailing') a.trailing.className = 'Other_trailing'
      if (variant === 'mixed-row') a.row.className = 'Other_row'
      if (variant === 'mixed-primary') a.native.className = 'Other_primary'
      if (variant === 'ambiguous-controls') a.standard.classList.add('Other_standardControls')
      if (variant === 'ambiguous-trailing') a.trailing.classList.add('Other_trailing')
      if (variant === 'ambiguous-row') a.row.classList.add('Other_row')
      if (variant === 'ambiguous-primary') a.native.classList.add('Other_primary')
      if (variant === 'nested-controls') {
        const wrapper = f.doc.createElement('div')
        wrapper.className = 'Other_standardControls'
        a.anchor.before(wrapper)
        wrapper.append(a.anchor)
      }
      if (variant === 'missing-controls') a.standard.className = ''
      if (variant === 'missing-primary') a.native.className = ''
      if (variant === 'empty-prefix') a.standard.className = '_standardControls'
      if (variant === 'unsafe-prefix') a.standard.className = 'bad:hash_standardControls'
      if (variant === 'substring-only') a.standard.className = 'JZLxKW_standardControlsExtra'
      if (variant === 'foreign-button' || variant === 'classless-button') {
        const extra = a.native.cloneNode(true)
        assert.ok(extra instanceof f.dom.window.HTMLButtonElement)
        extra.className = variant === 'foreign-button' ? 'Other_primary' : ''
        a.trailing.append(extra)
      }
      const control = f.connect(a.anchor, f.state)
      assert.equal(control.getStatus(), 'native')
      assert.equal(a.native.hasAttribute(suppressed), false)
      assert.equal(a.card.querySelector(ownedSelector), null)
      assert.equal(f.state.calls, 0)
    })
  }
})

test('consistent but malformed prefixes are not accepted as module signatures', async (t) => {
  for (const prefix of ['', 'bad:hash', 'bad.hash', 'bad[hash]', '模块']) {
    await t.test(prefix || 'empty', (t) => {
      const f = fixture(t)
      const a = f.occurrence('offline-session', prefix)
      const control = f.connect(a.anchor, f.state)
      assert.equal(control.getDiagnostics().frameMatched, false)
      assert.equal(control.getStatus(), 'native')
      assert.equal(a.native.hasAttribute(suppressed), false)
      assert.equal(f.state.calls, 0)
    })
  }
})

test('a live module-prefix change invalidates the old seat until it is recreated', async (t) => {
  const f = fixture(t)
  const a = f.occurrence('offline-session', 'GRgSLq')
  const control = f.connect(a.anchor, f.state)
  const oldButton = f.button(a.card)
  a.row.className = 'JZLxKW_row'
  a.trailing.className = 'JZLxKW_trailing'
  a.standard.className = 'JZLxKW_standardControls'
  a.native.className = 'JZLxKW_primary'
  await f.settle()
  assert.equal(control.getStatus(), 'native')
  assert.equal(control.getDiagnostics().changedRoot, true)
  assert.equal(a.native.hasAttribute(suppressed), false)
  oldButton.click()
  assert.equal(f.state.calls, 0)
  control.refresh(true)
  assert.equal(control.getStatus(), 'native')
  control.dispose()
  const next = f.connect(a.anchor, f.state)
  assert.equal(next.getStatus(), 'attached')
  assert.equal(f.button(a.card).className, 'JZLxKW_primary')
})

test('an ambiguous live primary class restores native without executing a stale action', async (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  const oldButton = f.button(a.card)
  a.native.classList.add('Other_primary')
  await f.settle()
  assert.equal(control.getStatus(), 'native')
  assert.equal(a.native.hasAttribute(suppressed), false)
  oldButton.click()
  assert.equal(f.state.calls, 0)
})

test('only the anchor ancestor chain and current card contribute dynamic candidates', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const sibling = f.doc.createElement('div')
  sibling.className = 'Other_standardControls'
  a.card.append(sibling)
  const foreign = f.occurrence('foreign-session', 'Other')
  a.trailing.append(foreign.section)
  const control = f.connect(a.anchor, f.state)
  assert.equal(control.getStatus(), 'attached')
  assert.equal(foreign.native.hasAttribute(suppressed), false)
  assert.equal(foreign.card.querySelector(ownedSelector), null)
})

test('unrelated live classes preserve the exact current frame', async (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  const owned = f.button(a.card)
  a.standard.classList.add('utility-controls')
  a.trailing.classList.add('JZLxKW_trailingActive')
  a.row.classList.add('utility-layout')
  await f.settle()
  assert.equal(control.getStatus(), 'attached')
  assert.equal(control.getDiagnostics().changedRoot, false)
  assert.equal(f.button(a.card), owned)
})

test('live competing buttons restore native even when foreign, hidden or busy', async (t) => {
  for (const variant of ['foreign', 'classless', 'hidden', 'busy'] as const) {
    await t.test(variant, async (t) => {
      const f = fixture(t)
      const a = f.occurrence()
      const control = f.connect(a.anchor, f.state)
      const extra = a.native.cloneNode(true)
      assert.ok(extra instanceof f.dom.window.HTMLButtonElement)
      extra.removeAttribute(suppressed)
      if (variant === 'foreign') extra.className = 'Other_primary'
      if (variant === 'classless') extra.className = ''
      if (variant === 'hidden') extra.hidden = true
      if (variant === 'busy') extra.setAttribute('aria-busy', 'true')
      a.trailing.append(extra)
      await f.settle()
      assert.equal(control.getStatus(), 'native')
      assert.equal(a.native.hasAttribute(suppressed), false)
      assert.equal(extra.hasAttribute(suppressed), false)
      assert.equal(a.card.querySelector(ownedSelector), null)
      assert.equal(f.state.calls, 0)
      extra.remove()
      await f.settle()
      assert.equal(control.getStatus(), 'attached')
    })
  }
})

test('a stale mousedown rechecks a changed prefix before the observer runs', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  const owned = f.button(a.card)
  a.row.className = 'Next_row'
  a.trailing.className = 'Next_trailing'
  a.standard.className = 'Next_standardControls'
  a.native.className = 'Next_primary'
  const event = new f.dom.window.MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
  })
  owned.dispatchEvent(event)
  assert.equal(event.defaultPrevented, false)
  assert.equal(control.getStatus(), 'native')
  assert.equal(a.native.hasAttribute(suppressed), false)
  assert.equal(f.state.calls, 0)
})

test('zero, duplicate, unknown wrapper and wrong Session candidates preserve native', async (t) => {
  for (const variant of ['zero', 'duplicate', 'wrapper', 'session'] as const) {
    await t.test(variant, (t) => {
      const f = fixture(t)
      const a = f.occurrence()
      if (variant === 'zero') a.native.remove()
      if (variant === 'duplicate') a.trailing.append(a.native.cloneNode(true))
      if (variant === 'wrapper') {
        const wrapper = f.doc.createElement('span')
        a.native.before(wrapper)
        wrapper.append(a.native)
      }
      const control = f.connect(
        a.anchor,
        f.state,
        variant === 'session' ? 'another-session' : 'offline-session',
      )
      assert.equal(control.getStatus(), 'native')
      assert.equal(a.card.querySelector(ownedSelector), null)
      assert.equal(a.native.hasAttribute(suppressed), false)
    })
  }
})

test('separate cards, including same-Session occurrences, never use a document-first match', (t) => {
  const f = fixture(t)
  const left = f.occurrence()
  const right = f.occurrence()
  const control = f.connect(right.anchor, f.state)
  assert.equal(control.getStatus(), 'attached')
  assert.equal(left.native.hasAttribute(suppressed), false)
  assert.equal(right.native.hasAttribute(suppressed), true)
  assert.equal(left.card.querySelector(ownedSelector), null)
  const second = f.connect(left.anchor, f.state)
  assert.equal(second.getStatus(), 'attached')
  assert.equal(f.doc.querySelectorAll(ownedSelector).length, 2)
})

test('the independent Stop is not selected or hidden', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const stop = f.doc.createElement('button')
  stop.type = 'button'
  stop.className = a.native.className
  stop.textContent = 'Stop / 停止'
  a.native.before(stop)
  const control = f.connect(a.anchor, f.state)
  assert.equal(control.getStatus(), 'attached')
  assert.equal(stop.hasAttribute(suppressed), false)
  assert.notEqual(f.dom.window.getComputedStyle(stop).display, 'none')
  assert.equal(stop.disabled, false)
})

test('native ownership is exclusive for an exact element and disposal is idempotent', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const first = f.connect(a.anchor, f.state)
  const second = f.connect(a.anchor, f.state)
  assert.equal(first.getStatus(), 'attached')
  assert.equal(second.getStatus(), 'native')
  assert.equal(a.card.querySelectorAll(ownedSelector).length, 1)
  first.dispose()
  first.dispose()
  first.refresh()
  assert.equal(first.getStatus(), 'disposed')
  second.refresh()
  assert.equal(second.getStatus(), 'attached')
})

test('false or failed presentation reads keep the original interface', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  f.state.visible = false
  const control = f.connect(a.anchor, f.state)
  assert.equal(control.getStatus(), 'native')
  control.dispose()
  const failed = createDomSeat(a.anchor, 'offline-session', () => {
    throw new Error('Unavailable facts')
  })
  f.controls.push(failed)
  assert.equal(failed.getStatus(), 'native')
  assert.equal(a.native.hasAttribute(suppressed), false)
})

test('busy presentation disables only the owned control; programmatic clicks never activate', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  const owned = f.button(a.card)
  owned.click()
  owned.dispatchEvent(new f.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  assert.equal(f.state.calls, 0)
  f.state.busy = true
  f.state.label = '等待核对'
  control.refresh()
  assert.equal(owned.disabled, true)
  assert.equal(owned.getAttribute('aria-busy'), 'true')
  assert.equal(owned.getAttribute('aria-label'), '等待核对')
  assert.equal(a.native.disabled, true)
})

test('local composition/input invalidate stale controls until fresh explicit facts', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  let inputSnapshot = { draftRev: 0, draft: '' }
  const publishInput = (draft: string) => {
    const previous = inputSnapshot
    inputSnapshot = { draftRev: previous.draftRev + 1, draft }
    assert.notEqual(inputSnapshot, previous)
    control.refresh(true)
  }
  a.editor.dispatchEvent(new f.dom.window.CompositionEvent('compositionstart', { bubbles: true }))
  assert.equal(control.getStatus(), 'native')
  control.refresh()
  assert.equal(control.getStatus(), 'native')
  a.editor.dispatchEvent(new f.dom.window.CompositionEvent('compositionend', { bubbles: true }))
  assert.equal(control.getStatus(), 'native')
  f.state.label = 'New locale / updated owner facts'
  f.state.busy = true
  control.refresh()
  f.state.busy = false
  control.refresh(false)
  assert.equal(control.getStatus(), 'native')
  publishInput('')
  assert.equal(control.getStatus(), 'attached')
  a.editor.dispatchEvent(
    new f.dom.window.InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }),
  )
  assert.equal(control.getStatus(), 'native')
  a.editor.textContent = 'x'
  f.state.visible = false
  publishInput('x')
  assert.equal(control.getStatus(), 'native')
  a.editor.innerHTML = '<p><br></p>'
  f.state.visible = true
  publishInput('')
  assert.equal(control.getStatus(), 'attached')
  assert.equal(a.editor.innerHTML, '<p><br></p>')
})

test('native IME, sending and disabled-state changes cannot retain the replacement', async (t) => {
  for (const variant of [
    'composition',
    'sending',
    'enabled',
    'read-only',
    'claimed',
    'wrong-type',
  ] as const) {
    await t.test(variant, async (t) => {
      const f = fixture(t)
      const a = f.occurrence()
      const control = f.connect(a.anchor, f.state)
      if (variant === 'composition') a.editor.setAttribute('data-composer-composing', '')
      if (variant === 'sending') a.native.setAttribute('aria-busy', 'true')
      if (variant === 'enabled') a.native.disabled = false
      if (variant === 'read-only') a.editor.setAttribute('contenteditable', 'false')
      if (variant === 'claimed') a.editor.dataset.phase = 'claimed'
      if (variant === 'wrong-type') a.native.type = 'submit'
      await f.settle()
      assert.equal(control.getStatus(), 'native')
      assert.equal(a.native.hasAttribute(suppressed), false)
    })
  }
})

test('activity, ancestor hidden/inert and takeover aria-hidden restore native', async (t) => {
  for (const variant of ['activity', 'hidden', 'inert', 'aria-hidden'] as const) {
    await t.test(variant, async (t) => {
      const f = fixture(t)
      const a = f.occurrence()
      const control = f.connect(a.anchor, f.state)
      if (variant === 'activity') a.standard.hidden = true
      else if (variant === 'hidden') a.section.hidden = true
      else if (variant === 'inert') a.seat.setAttribute('inert', '')
      else a.section.setAttribute('aria-hidden', 'true')
      await f.settle()
      assert.equal(control.getStatus(), 'native')
      assert.equal(a.native.hasAttribute(suppressed), false)
      assert.equal(a.card.querySelector(ownedSelector), null)
    })
  }
})

test('React-like primary replacement releases the old node without reinserting it', async (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  const next = a.native.cloneNode(true)
  assert.ok(next instanceof f.dom.window.HTMLButtonElement)
  next.removeAttribute(suppressed)
  a.native.replaceWith(next)
  await f.settle()
  assert.equal(control.getStatus(), 'attached')
  assert.equal(a.native.isConnected, false)
  assert.equal(a.native.hasAttribute(suppressed), false)
  assert.equal(next.hasAttribute(suppressed), true)
  assert.equal(a.card.querySelectorAll(ownedSelector).length, 1)
})

test('card or anchor scope replacement does not follow another occurrence', async (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const b = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  b.standard.append(a.anchor)
  await f.settle()
  assert.equal(control.getStatus(), 'native')
  assert.equal(a.native.hasAttribute(suppressed), false)
  assert.equal(b.native.hasAttribute(suppressed), false)
  control.refresh()
  assert.equal(control.getStatus(), 'native')
})

test('disconnect and Session changes restore state on the original exact node', async (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  a.card.remove()
  await f.settle()
  assert.equal(control.getStatus(), 'native')
  assert.equal(a.native.hasAttribute(suppressed), false)
  const b = f.occurrence()
  const next = f.connect(b.anchor, f.state)
  b.section.dataset.conversationSession = 'switched-session'
  await f.settle()
  assert.equal(next.getStatus(), 'native')
  assert.equal(b.native.hasAttribute(suppressed), false)
})

test('unexpected owned-node removal or hiding restores native rather than ignoring it as self-mutation', async (t) => {
  for (const variant of ['host', 'button', 'hidden'] as const) {
    await t.test(variant, async (t) => {
      const f = fixture(t)
      const a = f.occurrence()
      const control = f.connect(a.anchor, f.state)
      const button = f.button(a.card)
      if (variant === 'host') button.parentElement?.remove()
      else if (variant === 'button') button.remove()
      else button.style.visibility = 'hidden'
      await f.settle()
      assert.equal(control.getStatus(), 'native')
      assert.equal(a.native.hasAttribute(suppressed), false)
      assert.equal(a.card.querySelector(ownedSelector), null)
      assert.equal(f.state.calls, 0)
    })
  }
})

test('foreign attribute replacement is not overwritten during conditional cleanup', async (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  a.native.setAttribute(suppressed, 'foreign-owner')
  await f.settle()
  assert.equal(control.getStatus(), 'native')
  assert.equal(a.native.getAttribute(suppressed), 'foreign-owner')
  control.dispose()
  assert.equal(a.native.getAttribute(suppressed), 'foreign-owner')
  assert.equal(a.card.querySelector(ownedSelector), null)
})

test('cleanup returns only its own focus, never an editor or overlay focus', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  const owned = f.button(a.card)
  owned.focus()
  assert.equal(f.doc.activeElement, owned)
  f.state.visible = false
  control.refresh()
  assert.equal(f.doc.activeElement, a.card)
  f.state.visible = true
  control.refresh()
  a.editor.focus()
  f.state.visible = false
  control.refresh()
  assert.equal(f.doc.activeElement, a.editor)
  f.state.visible = true
  control.refresh()
  const overlay = f.doc.createElement('button')
  f.doc.body.append(overlay)
  overlay.focus()
  control.dispose()
  assert.equal(f.doc.activeElement, overlay)
})

test('focus handoff never follows a switched Session or a moved native node', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  const control = f.connect(a.anchor, f.state)
  f.button(a.card).focus()
  a.section.dataset.conversationSession = 'switched'
  a.native.disabled = false
  control.refresh()
  assert.notEqual(f.doc.activeElement, a.native)
  assert.notEqual(f.doc.activeElement, a.card)
  const b = f.occurrence()
  const c = f.occurrence('other-session')
  const next = f.connect(b.anchor, f.state)
  f.button(b.card).focus()
  c.trailing.append(b.native)
  b.native.disabled = false
  next.refresh()
  assert.notEqual(f.doc.activeElement, b.native)
  assert.equal(f.doc.activeElement, b.card)
})

test('mousedown retains native editor-focus semantics without touching draft or handlers', (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  f.connect(a.anchor, f.state)
  const event = new f.dom.window.MouseEvent('mousedown', {
    button: 0,
    bubbles: true,
    cancelable: true,
  })
  f.button(a.card).dispatchEvent(event)
  assert.equal(event.defaultPrevented, true)
  assert.equal(f.doc.activeElement, a.editor)
  assert.equal(a.editor.innerHTML, '<p><br></p>')
  assert.equal(f.state.calls, 0)
})

test('owned mutations do not create an observer/revalidation loop', async (t) => {
  const f = fixture(t)
  const a = f.occurrence()
  let reads = 0
  const control = createDomSeat(a.anchor, 'offline-session', () => {
    reads += 1
    return f.state
  })
  f.controls.push(control)
  await f.settle()
  const first = reads
  await f.settle()
  assert.equal(reads, first)
  control.refresh()
  await f.settle()
  const refreshed = reads
  await f.settle()
  assert.equal(reads, refreshed)
  assert.equal(control.getStatus(), 'attached')
  assert.equal(f.state.calls, 0)
})
