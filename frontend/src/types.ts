export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type IncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved' | string

export interface Finding {
  rule_id?: string
  id?: string
  title: string
  evidence: string
  weight?: number
  observed_at?: string
}

export interface AuditEntry {
  id?: string
  action?: string
  status?: string
  note?: string
  actor?: string
  created_at?: string
  timestamp?: string
}

export interface Incident {
  id: string
  title?: string
  summary?: string
  explanation?: string
  severity: Severity
  status: IncidentStatus
  score?: number
  source?: string
  detected_at?: string
  created_at?: string
  updated_at?: string
  account_id?: string
  account_name?: string
  assignee?: string
  findings?: Finding[]
  recommendations?: string[]
  recommended_actions?: string[]
  audit?: AuditEntry[]
}

export interface Account {
  id: string
  name: string
  provider?: string
  status?: string
  email?: string
  last_scan_at?: string
}

export interface Capability {
  id?: string
  name: string
  description?: string
  enabled?: boolean
  status?: string
}

export interface Source {
  id: string
  account_id?: string
  name: string
  source_type?: 'controlled' | 'gmail' | 'workspace' | string
  status?: string
  capabilities?: string[]
  last_scan_at?: string
}

export interface Credentials {
  apiKey: string
  tenantId: string
}

export interface IncidentFilters {
  severity: string
  status: string
  q: string
}

export interface ScanRequest {
  source_id: string
  trigger: 'user' | 'schedule'
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}
