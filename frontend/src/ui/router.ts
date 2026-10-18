import { useCallback, useSyncExternalStore } from 'react'

export type Section = 'overview' | 'incidents' | 'evidence' | 'sources' | 'analysis' | 'protection' | 'rules'

export interface Route {
  section: Section
  /** Selected record, currently an incident id on the incidents page. */
  id?: string
}

const paths: Record<Section, string> = {
  overview: 'overview',
  incidents: 'incidents',
  evidence: 'evidence',
  sources: 'sources',
  analysis: 'analyse',
  protection: 'coverage',
  rules: 'rules',
}
const sections = Object.fromEntries(Object.entries(paths).map(([section, path]) => [path, section])) as Record<string, Section>
const CHANGE = 'sentinelsme:route'

export function parseRoute(hash: string): Route {
  const decode = (part: string) => { try { return decodeURIComponent(part) } catch { return '' } }
  const [path = '', id] = hash.replace(/^#\/?/, '').split('/').map(decode)
  const section = sections[path] ?? 'overview'
  return section === 'incidents' && id ? { section, id } : { section }
}

export function routeHref(route: Route): string {
  return `#/${paths[route.section]}${route.section === 'incidents' && route.id ? `/${encodeURIComponent(route.id)}` : ''}`
}

function subscribe(notify: () => void) {
  window.addEventListener('hashchange', notify)
  window.addEventListener('popstate', notify)
  window.addEventListener(CHANGE, notify)
  return () => {
    window.removeEventListener('hashchange', notify)
    window.removeEventListener('popstate', notify)
    window.removeEventListener(CHANGE, notify)
  }
}

const snapshot = () => window.location.hash

/**
 * Hash routing keeps every view addressable (refresh, back button, shared
 * links to a case) without a server-side route table. Updates are announced
 * synchronously so a click re-renders in the same task.
 */
export function useRoute(): [Route, (next: Route, options?: { replace?: boolean }) => void] {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '')
  const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
    const href = routeHref(next)
    if (href === window.location.hash) return
    const url = `${window.location.pathname}${window.location.search}${href}`
    if (options?.replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    window.dispatchEvent(new Event(CHANGE))
  }, [])
  return [parseRoute(hash), navigate]
}
