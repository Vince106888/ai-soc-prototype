import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Message for an unknown rejection, or '' when the request was aborted. */
export function failureMessage(reason: unknown, fallback: string): string {
  if (reason instanceof DOMException && reason.name === 'AbortError') return ''
  if (reason instanceof Error && reason.name === 'AbortError') return ''
  return reason instanceof Error ? reason.message : fallback
}

interface RequestState<T> {
  key: string | null
  data?: T
  error: string
}

/**
 * Load data for a request key. State only changes when a response lands, so a
 * changed key is "loading" until its own response arrives and late responses
 * for an older key are discarded. The previous data stays available while the
 * next page loads, which avoids layout jumps in lists.
 */
export function useRequest<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, fallback = 'Could not load this data.') {
  const [state, setState] = useState<RequestState<T>>({ key: null, error: '' })
  const loader = useRef(load)
  useEffect(() => { loader.current = load })
  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    loader.current(controller.signal).then(
      data => { if (!controller.signal.aborted) setState({ key, data, error: '' }) },
      reason => {
        const message = failureMessage(reason, fallback)
        if (!controller.signal.aborted && message) setState({ key, error: message })
      },
    )
    return () => controller.abort()
  }, [key, fallback])
  const current = key !== null && state.key === key
  return {
    data: current ? state.data : undefined,
    previous: state.data,
    error: current ? state.error : '',
    loading: key !== null && !current,
  }
}

/** Subscribe to a CSS media query without effect-driven state. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const list = window.matchMedia?.(query)
    list?.addEventListener?.('change', notify)
    return () => list?.removeEventListener?.('change', notify)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false)
}

const traps: object[] = []

/** Keep focus inside a container while it is open, and return it to the opener afterwards. Only the most recently opened trap handles keys. */
export function useFocusTrap(container: React.RefObject<HTMLElement | null>, active: boolean, onEscape: () => void, initial?: React.RefObject<HTMLElement | null>, restore?: React.RefObject<HTMLElement | null>) {
  const escape = useRef(onEscape)
  useEffect(() => { escape.current = onEscape })
  useEffect(() => {
    if (!active) return
    const opener = restore?.current ?? document.activeElement as HTMLElement | null
    const focusable = () => Array.from(container.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])') ?? [])
      .filter(element => !(element as HTMLButtonElement).disabled && element.getAttribute('aria-hidden') !== 'true' && !element.closest('[inert]'))
    const token = {}
    traps.push(token)
    ;(initial?.current ?? focusable()[0])?.focus()
    const handler = (event: KeyboardEvent) => {
      if (traps[traps.length - 1] !== token || event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); escape.current(); return }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (!controls.length) return
      const first = controls[0], last = controls[controls.length - 1]
      const inside = container.current?.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      traps.splice(traps.indexOf(token), 1)
      if (opener?.isConnected) opener.focus()
    }
  }, [active, container, initial, restore])
}
