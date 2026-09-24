export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type IncidentStatus = 'new' | 'under_review' | 'resolved' | 'false_positive'

export interface Finding {
  rule_id?: string
  rule_code?: string
  id?: string
  title: string
  evidence: string | Record<string, unknown>
  weight?: number
  observed_at?: string
}

export interface AuditEntry {
  id?: string
  action?: string
  status?: string
  note?: string
  detail?: string
  from_status?: string | null
  to_status?: string | null
  actor?: string
  created_at?: string
  timestamp?: string
}

export interface IncidentExplanation {
  source?: 'template' | 'ai'
  what_happened: string
  why_it_matters: string
  severity: string
  next_step: string
}

export interface Recommendation {
  position?: number
  action: string
  advisory?: boolean
}

export interface Incident {
  id: string
  title?: string
  summary?: string
  explanation?: string | IncidentExplanation
  severity: Severity
  status: IncidentStatus
  score?: number
  source?: string
  detected_at?: string
  first_seen_at?: string
  last_seen_at?: string
  created_at?: string
  updated_at?: string
  account_id?: string
  account_name?: string
  assignee?: string
  findings?: Finding[]
  recommendations?: Array<string | Recommendation>
  recommended_actions?: string[]
  audit?: AuditEntry[]
}

export interface Account {
  id: string
  display_name?: string
  provider?: string
  status?: string
  email?: string
  last_scan_at?: string
}

export interface CapabilityProfile {
  service: string
  signal_types: string[]
  source_types: string[]
  live_connectors: string[]
  controlled_ingestion: boolean
  template_explanations: boolean
  ai_explanations: boolean
  correlation_window_minutes: number
  maximum_batch_size: number
  privacy: {
    stores_full_bodies: boolean
    stores_attachments: boolean
  }
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
