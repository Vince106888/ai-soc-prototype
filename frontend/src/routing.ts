export type WorkspaceView = 'overview' | 'analyse' | 'incidents' | 'evidence' | 'connections' | 'detection'
export type DetectionTab = 'rules' | 'coverage' | 'trusted' | 'posture'
export type AnalysisMethod = 'selected' | 'gmail'

export interface WorkspaceRoute {
  view: WorkspaceView
  incident: string
  severity: string
  status: string
  q: string
  account: string
  seenFrom: string
  seenTo: string
  openOnly: boolean
  method: AnalysisMethod
  detectionTab: DetectionTab
}

const views: WorkspaceView[] = ['overview', 'analyse', 'incidents', 'evidence', 'connections', 'detection']
const tabs: DetectionTab[] = ['rules', 'coverage', 'trusted', 'posture']

export function readWorkspaceRoute(search = window.location.search): WorkspaceRoute {
  const params = new URLSearchParams(search)
  const requested = params.get('view')
  const view = views.includes(requested as WorkspaceView) ? requested as WorkspaceView : 'overview'
  const incident = params.get('incident')?.trim() ?? ''
  const tab = params.get('tab')
  return {
    view: incident ? 'incidents' : view,
    incident,
    severity: params.get('severity') ?? '',
    status: params.get('status') ?? '',
    q: params.get('q') ?? '',
    account: params.get('account') ?? '',
    seenFrom: params.get('from') ?? '',
    seenTo: params.get('to') ?? '',
    openOnly: params.get('open') === '1',
    method: params.get('method') === 'gmail' ? 'gmail' : 'selected',
    detectionTab: tabs.includes(tab as DetectionTab) ? tab as DetectionTab : 'rules',
  }
}

export function workspaceRouteUrl(route: WorkspaceRoute) {
  const params = new URLSearchParams()
  params.set('view', route.view)
  if (route.view === 'incidents') {
    if (route.incident) params.set('incident', route.incident)
    if (route.severity) params.set('severity', route.severity)
    if (route.status) params.set('status', route.status)
    if (route.q) params.set('q', route.q)
    if (route.account) params.set('account', route.account)
    if (route.seenFrom) params.set('from', route.seenFrom)
    if (route.seenTo) params.set('to', route.seenTo)
    if (route.openOnly) params.set('open', '1')
  }
  if (route.view === 'analyse' && route.method === 'gmail') params.set('method', 'gmail')
  if (route.view === 'detection' && route.detectionTab !== 'rules') params.set('tab', route.detectionTab)
  return `${window.location.pathname}?${params.toString()}`
}

export function writeWorkspaceRoute(route: WorkspaceRoute, mode: 'push' | 'replace' = 'replace') {
  const url = workspaceRouteUrl(route)
  const current = `${window.location.pathname}${window.location.search}`
  if (url === current) return
  window.history[`${mode}State`]({ workspaceView: route.view }, '', url)
}

export function workspaceRouteFromState(state: {
  view: WorkspaceView
  incident: string
  severity: string
  status: string
  q: string
  account: string
  seenFrom: string
  seenTo: string
  openOnly: boolean
  method: AnalysisMethod
  detectionTab: DetectionTab
}) {
  return state
}
