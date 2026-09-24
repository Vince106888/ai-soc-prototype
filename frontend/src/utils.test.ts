import { describe, expect, it, vi } from 'vitest'
import type { Incident } from './types'
import { incidentTitle, prioritizeIncidents, relativeTime } from './utils'

const incident = (id: string, severity: Incident['severity'], detectedAt: string): Incident => ({
  id,
  severity,
  status: 'open',
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
})
