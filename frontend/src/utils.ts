import type { CapabilityProfile, Incident, Severity, Source } from './types'

export const severityOrder: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function prioritizeIncidents(incidents: Incident[]): Incident[] {
  return [...incidents].sort((a, b) => {
    const severityDifference = severityOrder[b.severity] - severityOrder[a.severity]
    if (severityDifference) return severityDifference
    const aTime = Date.parse(a.detected_at ?? a.last_seen_at ?? a.created_at ?? '') || 0
    const bTime = Date.parse(b.detected_at ?? b.last_seen_at ?? b.created_at ?? '') || 0
    return bTime - aTime
  })
}

export function incidentTitle(incident: Incident): string {
  return incident.title?.trim() || incident.summary?.trim() || `Incident ${incident.id}`
}

export function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function scorePercent(score?: number): number | undefined {
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined
  return Math.max(0, Math.min(100, Math.round(score <= 1 ? score * 100 : score)))
}

export function accountLabel(account: { display_name?: string; email?: string; id: string }): string {
  return account.display_name?.trim() || account.email?.trim() || `Account ${account.id}`
}

export interface TelemetryCoverage {
  activeSourceCount: number
  activeCapabilities: string[]
  supportedCapabilityCount: number
  percent: number
  mode: 'none' | 'controlled' | 'live'
}

export function telemetryCoverage(
  sources: Source[],
  profile: CapabilityProfile | null,
): TelemetryCoverage {
  const activeSources = sources.filter((source) => source.status === 'active')
  const supported = new Set(profile?.signal_types ?? [])
  const activeCapabilities = [
    ...new Set(activeSources.flatMap((source) => source.capabilities ?? [])),
  ].filter((capability) => supported.has(capability))
  const liveSourceTypes = new Set(profile?.live_connectors ?? [])
  const hasLiveSource = activeSources.some((source) =>
    source.source_type ? liveSourceTypes.has(source.source_type) : false,
  )

  return {
    activeSourceCount: activeSources.length,
    activeCapabilities,
    supportedCapabilityCount: supported.size,
    percent: supported.size ? Math.round((activeCapabilities.length / supported.size) * 100) : 0,
    mode: activeSources.length === 0 ? 'none' : hasLiveSource ? 'live' : 'controlled',
  }
}

export function relativeTime(value?: string): string {
  if (!value) return 'Time unknown'
  const milliseconds = Date.now() - Date.parse(value)
  if (!Number.isFinite(milliseconds)) return value
  const minutes = Math.round(milliseconds / 60_000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (Math.abs(minutes) < 60) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-hours, 'hour')
  const days = Math.round(hours / 24)
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-days, 'day')
}

export function formatDateTime(value?: string): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
