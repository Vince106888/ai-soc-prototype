import { describe, expect, it, vi } from 'vitest'
import type { Incident } from './types'
import { accountLabel, incidentTitle, prioritizeIncidents, relativeTime, scorePercent, telemetryCoverage } from './utils'

const incident = (id: string, severity: Incident['severity'], detectedAt: string): Incident => ({
  id,
  severity,
  status: 'new',
  detected_at: detectedAt,
})

describe('incident presentation helpers', () => {
  it('prioritizes severity before recency without mutating input', () => {
    const input = [
      incident('low-new', 'low', '2026-09-24T10:00:00Z'),
      incident('critical-old', 'critical', '2026-09-23T10:00:00Z'),
      incident('critical-new', 'critical', '2026-09-24T11:00:00Z'),
    ]

    expect(prioritizeIncidents(input).map(({ id }) => id)).toEqual([
      'critical-new',
      'critical-old',
      'low-new',
    ])
    expect(input[0].id).toBe('low-new')
  })

  it('uses a safe incident title fallback', () => {
    expect(incidentTitle({ ...incident('abc', 'high', ''), title: '  ' })).toBe('Incident abc')
  })

  it('formats recent timestamps for quick triage', () => {
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'))
    expect(relativeTime('2026-09-24T11:30:00Z')).toBe('30 minutes ago')
    vi.useRealTimers()
  })

  it('converts normalized backend scores to a percentage', () => {
    expect(scorePercent(0.86)).toBe(86)
    expect(scorePercent(1)).toBe(100)
    expect(scorePercent(86)).toBe(86)
  })

  it('uses display name, email, then ID for account labels', () => {
    expect(accountLabel({ id: '1', display_name: 'Acme Ops', email: 'ops@acme.test' })).toBe('Acme Ops')
    expect(accountLabel({ id: '2', email: 'owner@acme.test' })).toBe('owner@acme.test')
    expect(accountLabel({ id: '3' })).toBe('Account 3')
  })

  it('does not claim active monitoring from engine support alone', () => {
    const coverage = telemetryCoverage([], {
      service: 'SentinelSME', signal_types: ['email', 'signin'], source_types: ['controlled'],
      live_connectors: [], controlled_ingestion: true, template_explanations: true,
      ai_explanations: false, correlation_window_minutes: 30, maximum_batch_size: 500,
      privacy: { stores_full_bodies: false, stores_attachments: false },
    })

    expect(coverage).toEqual({
      activeSourceCount: 0,
      activeCapabilities: [],
      supportedCapabilityCount: 2,
      percent: 0,
      mode: 'none',
    })
  })

  it('derives telemetry coverage from active source capabilities only', () => {
    const profile = {
      service: 'SentinelSME', signal_types: ['email', 'signin', 'mfa'], source_types: ['controlled'],
      live_connectors: [] as string[], controlled_ingestion: true, template_explanations: true,
      ai_explanations: false, correlation_window_minutes: 30, maximum_batch_size: 500,
      privacy: { stores_full_bodies: false, stores_attachments: false },
    }
    const coverage = telemetryCoverage([
      { id: 'a', name: 'active', status: 'active', source_type: 'controlled', capabilities: ['email', 'mfa'] },
      { id: 'b', name: 'offline', status: 'disconnected', source_type: 'controlled', capabilities: ['signin'] },
    ], profile)

    expect(coverage.activeCapabilities).toEqual(['email', 'mfa'])
    expect(coverage.percent).toBe(67)
    expect(coverage.mode).toBe('controlled')
  })
})
