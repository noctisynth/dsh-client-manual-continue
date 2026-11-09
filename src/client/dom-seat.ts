export interface DomSeatPresentation {
  readonly visible: boolean
  readonly busy: boolean
  readonly label: string
  activate(event: MouseEvent): void
}

export interface DomSeat {
  /** Re-evaluate; only true acknowledges a newly published InputState snapshot. */
  refresh(inputPublished?: boolean): void
  getStatus(): 'native' | 'attached' | 'disposed'
  getDiagnostics(): {
    status: 'native' | 'attached' | 'disposed'
    frameMatched: boolean
    mainMatched: boolean
    changedRoot: boolean
    inputDirty: boolean
    composing: boolean
    tokenPresent: boolean
  }
  dispose(): void
}

const OWNED = 'data-dsh-manual-continue-owned'
const SUPPRESSED = 'data-dsh-manual-continue-native'
const owners = new WeakMap<HTMLButtonElement, object>()

interface Frame {
  readonly card: HTMLElement
  readonly seat: HTMLElement
  readonly occurrence: HTMLElement
  readonly controls: HTMLElement
  readonly trailing: HTMLElement
  readonly row: HTMLElement
  readonly editor: HTMLElement
  readonly cssPrefix: string
}

/** Read whole CSS-module tokens, never interpolate untrusted classes into a selector. */
function modulePrefix(
  element: Element,
  part: 'standardControls' | 'trailing' | 'row' | 'primary',
): string | undefined {
  const suffix = `_${part}`
  const tokens = [...element.classList].filter((token) => token.endsWith(suffix))
  const token = tokens[0]
  if (tokens.length !== 1 || token === undefined) return undefined
  const prefix = token.slice(0, -suffix.length)
  return /^[A-Za-z0-9_-]+$/.test(prefix) ? prefix : undefined
}

interface Attachment {
  readonly native: HTMLButtonElement
  readonly host: HTMLSpanElement
  readonly button: HTMLButtonElement
}

/** A structure-limited compatibility adapter, not a public DSH extension point or RPC caller. */
export function createDomSeat(
  anchor: HTMLElement,
  sessionId: string,
  read: () => DomSeatPresentation,
): DomSeat {
  const doc = anchor.ownerDocument
  const view = doc.defaultView
  const owner = {}
  function ownershipToken(): string | undefined {
    if (view === null) return undefined
    try {
      const bytes = view.crypto.getRandomValues(new Uint8Array(16))
      return `mc-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
    } catch {
      return undefined
    }
  }
  const token = ownershipToken()
  const ownedRoots = new WeakSet<Node>()
  const suppressedNodes = new WeakSet<Node>()
  let frame: Frame | undefined
  let attachment: Attachment | undefined
  let observer: MutationObserver | undefined
  let disposed = false
  let changedRoot = false
  let inputDirty = false
  let composing = false
  let activated = false
  let offInput: (() => void) | undefined

  const element = (value: Element | null): value is HTMLElement =>
    view !== null && value instanceof view.HTMLElement

  function visibleFrom(start: HTMLElement): boolean {
    if (view === null || !start.isConnected) return false
    for (
      let current: HTMLElement | null = start;
      current !== null;
      current = current.parentElement
    ) {
      if (
        current.hidden ||
        current.hasAttribute('inert') ||
        current.getAttribute('aria-hidden') === 'true'
      )
        return false
      const style = view.getComputedStyle(current)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse'
      ) {
        return false
      }
    }
    return true
  }

  function findFrame(): Frame | undefined {
    if (view === null || !anchor.isConnected || anchor.getRootNode() !== doc) return undefined
    const card = anchor.closest('[data-composer-card]')
    if (!element(card)) return undefined
    const seat = card.closest('[data-composer-seat][data-conversation-region="composer"]')
    const occurrence =
      seat?.closest('[data-conversation-content][data-conversation-session]') ?? null
    const controlCandidates: Array<{ node: HTMLElement; prefix: string }> = []
    for (
      let ancestor = anchor.parentElement;
      ancestor !== null && ancestor !== card;
      ancestor = ancestor.parentElement
    ) {
      if (![...ancestor.classList].some((token) => token.endsWith('_standardControls'))) continue
      const prefix = modulePrefix(ancestor, 'standardControls')
      if (prefix === undefined) return undefined
      controlCandidates.push({ node: ancestor, prefix })
    }
    if (controlCandidates.length !== 1) return undefined
    const control = controlCandidates[0]
    if (control === undefined) return undefined
    const controls = control.node
    const cssPrefix = control.prefix
    const trailing = controls.parentElement
    const row = trailing?.parentElement ?? null
    if (
      !element(card) ||
      !element(seat) ||
      !element(occurrence) ||
      !element(controls) ||
      !element(trailing) ||
      !element(row) ||
      occurrence.dataset.conversationSession !== sessionId ||
      modulePrefix(trailing, 'trailing') !== cssPrefix ||
      modulePrefix(row, 'row') !== cssPrefix ||
      controls.closest('[data-composer-card]') !== card ||
      !card.contains(row) ||
      !seat.contains(card) ||
      !occurrence.contains(seat)
    )
      return undefined
    const editors = [...card.querySelectorAll('[data-composer-input][role="textbox"]')].filter(
      (candidate) => candidate.closest('[data-composer-card]') === card,
    )
    const editor = editors[0] ?? null
    if (editors.length !== 1 || !element(editor)) return undefined
    return { card, seat, occurrence, controls, trailing, row, editor, cssPrefix }
  }

  function sameFrame(left: Frame, right: Frame): boolean {
    return (
      left.card === right.card &&
      left.seat === right.seat &&
      left.occurrence === right.occurrence &&
      left.controls === right.controls &&
      left.trailing === right.trailing &&
      left.row === right.row &&
      left.editor === right.editor &&
      left.cssPrefix === right.cssPrefix
    )
  }

  function release(): void {
    const previous = attachment
    attachment = undefined
    if (previous === undefined) return
    const hadFocus = doc.activeElement === previous.button
    previous.host.remove()
    if (previous.native.getAttribute(SUPPRESSED) === token)
      previous.native.removeAttribute(SUPPRESSED)
    if (owners.get(previous.native) === owner) owners.delete(previous.native)
    if (
      hadFocus &&
      frame !== undefined &&
      frame.occurrence.dataset.conversationSession === sessionId
    ) {
      if (
        previous.native.parentElement === frame.trailing &&
        previous.native.closest('[data-composer-card]') === frame.card &&
        previous.native.isConnected &&
        !previous.native.disabled &&
        visibleFrom(previous.native)
      ) {
        previous.native.focus({ preventScroll: true })
      } else if (visibleFrom(frame.card)) {
        frame.card.focus({ preventScroll: true })
      }
    }
  }

  function owned(node: Node): boolean {
    for (let current: Node | null = node; current !== null; current = current.parentNode) {
      if (ownedRoots.has(current)) return true
    }
    return false
  }

  function ownMutation(record: MutationRecord): boolean {
    if (
      attachment !== undefined &&
      (!attachment.host.isConnected ||
        attachment.host.parentElement !== frame?.trailing ||
        attachment.host.nextElementSibling !== attachment.native ||
        attachment.button.parentElement !== attachment.host ||
        !attachment.button.isConnected ||
        !visibleFrom(attachment.button))
    )
      return false
    if (owned(record.target)) return true
    if (record.type === 'childList') {
      const changed = [...record.addedNodes, ...record.removedNodes]
      return changed.length > 0 && changed.every(owned)
    }
    return (
      record.type === 'attributes' &&
      record.attributeName === SUPPRESSED &&
      suppressedNodes.has(record.target) &&
      view !== null &&
      record.target instanceof view.HTMLElement &&
      (record.target.getAttribute(SUPPRESSED) === token ||
        (attachment?.native !== record.target && record.target.getAttribute(SUPPRESSED) === null))
    )
  }

  function observe(current: Frame): void {
    if (view === null) return
    observer = new view.MutationObserver((records) => {
      if (records.some((record) => !ownMutation(record))) reconcile()
    })
    const attributes = [
      'class',
      'style',
      'hidden',
      'inert',
      'aria-hidden',
      'aria-busy',
      'disabled',
      'contenteditable',
      'data-phase',
      'data-conversation-session',
      'data-composer-composing',
      'data-sending',
      'type',
      'role',
      'data-composer-card',
      'data-composer-seat',
      'data-composer-input',
      'data-conversation-content',
      'data-conversation-region',
      SUPPRESSED,
    ]
    // Observe only this occurrence's seat and exact ancestor path, never a document subtree.
    for (
      let ancestor = anchor.parentElement;
      ancestor !== null;
      ancestor = ancestor.parentElement
    ) {
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: attributes,
        childList: current.occurrence.contains(ancestor),
      })
    }
    observer.observe(current.seat, {
      attributes: true,
      attributeFilter: attributes,
      childList: true,
      subtree: true,
    })
    const edited = () => {
      inputDirty = true
      release()
    }
    const compositionStarted = () => {
      composing = true
      edited()
    }
    const compositionEnded = () => {
      composing = false
      edited()
    }
    for (const name of ['beforeinput', 'input', 'paste', 'drop'])
      current.editor.addEventListener(name, edited, true)
    current.editor.addEventListener('compositionstart', compositionStarted, true)
    current.editor.addEventListener('compositionend', compositionEnded, true)
    offInput = () => {
      for (const name of ['beforeinput', 'input', 'paste', 'drop'])
        current.editor.removeEventListener(name, edited, true)
      current.editor.removeEventListener('compositionstart', compositionStarted, true)
      current.editor.removeEventListener('compositionend', compositionEnded, true)
    }
  }

  function nativeButton(current: Frame): HTMLButtonElement | undefined {
    if (
      view === null ||
      !visibleFrom(current.card) ||
      !visibleFrom(current.controls) ||
      !visibleFrom(current.editor) ||
      current.editor.getAttribute('contenteditable') !== 'true' ||
      current.editor.getAttribute('data-phase') !== 'plain' ||
      current.editor.hasAttribute('data-composer-composing') ||
      composing ||
      inputDirty
    )
      return undefined
    // Model-selection controls also publish aria-busy, but belong to the auxiliary subtree.
    // Keep unknown wrappers outside it in the count: only a unique direct primary may be owned.
    const candidates = [
      ...current.trailing.querySelectorAll('button[type="button"][aria-busy]'),
    ].filter(
      (candidate) =>
        !owned(candidate) &&
        !current.controls.contains(candidate) &&
        candidate.closest('[data-composer-card]') === current.card,
    )
    const candidate = candidates[0]
    if (
      candidates.length !== 1 ||
      !(candidate instanceof view.HTMLButtonElement) ||
      modulePrefix(candidate, 'primary') !== current.cssPrefix ||
      candidate.parentElement !== current.trailing ||
      candidate.getAttribute('aria-busy') !== 'false' ||
      candidate.hasAttribute('data-sending') ||
      !candidate.disabled ||
      candidate.hidden ||
      candidate.getAttribute('aria-hidden') === 'true' ||
      candidate.hasAttribute('inert') ||
      (owners.has(candidate) && owners.get(candidate) !== owner) ||
      (candidate.hasAttribute(SUPPRESSED) && candidate.getAttribute(SUPPRESSED) !== token)
    )
      return undefined
    if (attachment?.native !== candidate && !visibleFrom(candidate)) return undefined
    return candidate
  }

  function presentation(): DomSeatPresentation | undefined {
    try {
      const value = read()
      return value.visible === true &&
        typeof value.busy === 'boolean' &&
        typeof value.label === 'string' &&
        value.label.trim() !== '' &&
        typeof value.activate === 'function'
        ? value
        : undefined
    } catch {
      // Unavailable read facts are an explicit native fallback, never permission to act.
      return undefined
    }
  }

  function update(target: Attachment, value: DomSeatPresentation): void {
    target.button.setAttribute('aria-label', value.label)
    target.button.setAttribute('aria-busy', String(value.busy || activated))
    target.button.disabled = value.busy || activated
  }

  function attach(current: Frame, native: HTMLButtonElement, value: DomSeatPresentation): void {
    if (view === null || token === undefined) return
    const host = doc.createElement('span')
    host.setAttribute(OWNED, token)
    host.style.display = 'contents'
    ownedRoots.add(host)
    const style = doc.createElement('style')
    style.textContent = `button[${SUPPRESSED}="${token}"]{display:none!important}`
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = native.className
    button.style.visibility = 'hidden'
    button.style.pointerEvents = 'none'
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('width', '16')
    svg.setAttribute('height', '16')
    svg.setAttribute('aria-hidden', 'true')
    const triangle = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    triangle.setAttribute('d', 'M5 2.5 13 8 5 13.5Z')
    triangle.setAttribute('fill', 'currentColor')
    svg.append(triangle)
    button.append(svg)
    host.append(style, button)
    const target: Attachment = { native, host, button }
    update(target, value)
    button.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.defaultPrevented || attachment !== target) return
      const latest = presentation()
      const resolved = findFrame()
      if (
        latest === undefined ||
        resolved === undefined ||
        !sameFrame(current, resolved) ||
        nativeButton(current) !== native ||
        native.getAttribute(SUPPRESSED) !== token ||
        !host.isConnected ||
        view.getComputedStyle(native).display !== 'none'
      ) {
        release()
        return
      }
      if (latest.busy || activated) return
      event.preventDefault()
      current.editor.focus({ preventScroll: true })
    })
    button.addEventListener('click', (event) => {
      if (
        !event.isTrusted ||
        event.defaultPrevented ||
        event.currentTarget !== button ||
        attachment !== target ||
        activated
      )
        return
      const latest = presentation()
      const resolved = findFrame()
      if (
        latest === undefined ||
        latest.busy ||
        resolved === undefined ||
        !sameFrame(current, resolved) ||
        nativeButton(current) !== native ||
        native.getAttribute(SUPPRESSED) !== token ||
        !host.isConnected ||
        view.getComputedStyle(native).display !== 'none'
      ) {
        release()
        return
      }
      activated = true
      update(target, latest)
      try {
        latest.activate(event)
      } catch (error) {
        release()
        throw error
      }
    })
    owners.set(native, owner)
    attachment = target
    native.before(host)
    suppressedNodes.add(native)
    native.setAttribute(SUPPRESSED, token)
    if (
      !host.isConnected ||
      findFrame()?.card !== current.card ||
      view.getComputedStyle(native).display !== 'none'
    ) {
      release()
      return
    }
    button.style.removeProperty('visibility')
    button.style.removeProperty('pointer-events')
    if (!visibleFrom(button)) release()
  }

  function reconcile(): void {
    if (disposed || changedRoot || view === null || token === undefined) return
    const next = findFrame()
    if (next === undefined || (frame !== undefined && !sameFrame(frame, next))) {
      release()
      if (frame !== undefined) {
        changedRoot = true
        observer?.disconnect()
        offInput?.()
        observer = undefined
        offInput = undefined
        frame = undefined
      }
      return
    }
    if (frame === undefined) {
      frame = next
      observe(next)
    }
    const value = presentation()
    const native = nativeButton(next)
    if (value === undefined || native === undefined) {
      release()
      return
    }
    if (attachment?.native !== native) {
      release()
      attach(next, native, value)
    } else if (
      !attachment.host.isConnected ||
      attachment.host.parentElement !== next.trailing ||
      attachment.host.nextElementSibling !== native ||
      attachment.button.parentElement !== attachment.host ||
      !attachment.button.isConnected ||
      !visibleFrom(attachment.button) ||
      native.getAttribute(SUPPRESSED) !== token ||
      view.getComputedStyle(native).display !== 'none'
    )
      release()
    else update(attachment, value)
  }

  reconcile()
  return {
    refresh(inputPublished = false) {
      if (disposed) return
      if (inputPublished) inputDirty = false
      activated = false
      reconcile()
    },
    getStatus() {
      return disposed ? 'disposed' : attachment === undefined ? 'native' : 'attached'
    },
    getDiagnostics() {
      const current = findFrame()
      return {
        status: disposed ? 'disposed' : attachment === undefined ? 'native' : 'attached',
        frameMatched: current !== undefined,
        mainMatched: current !== undefined && nativeButton(current) !== undefined,
        changedRoot,
        inputDirty,
        composing,
        tokenPresent: token !== undefined,
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      observer?.disconnect()
      offInput?.()
      release()
    },
  }
}
