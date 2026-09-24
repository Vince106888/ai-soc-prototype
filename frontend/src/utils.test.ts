import { describe, expect, it, vi } from 'vitest'
import type { Incident } from './types'
import { accountLabel, incidentTitle, prioritizeIncidents, relativeTime, scorePercent } from './utils'

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
})
