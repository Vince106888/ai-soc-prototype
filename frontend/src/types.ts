export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type IncidentStatus = 'new' | 'under_review' | 'resolved' | 'false_positive'
export type SignalType = 'email' | 'forwarding' | 'signin' | 'mfa' | 'oauth_grant'

export interface Finding {
  rule_id?: string
  rule_code?: string
  id?: string
  title: string
  evidence: string | Record<string, unknown>
  weight?: number
  observed_at?: string
  signal_id?: string
  confidence?: number
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

export interface ExplanationReason {
  rule_code: string
  indicator: string
  why: string
  legitimate_if: string
}

export interface IncidentExplanation {
  source?: 'template' | 'ai'
  what_happened: string
  why_it_matters: string
  severity: string
  next_step: string
  reasons?: ExplanationReason[]
  warning_signs?: number | null
  warning_level?: 'few' | 'some' | 'many' | null
  warning_note?: string
}

export type TrustChoice = 'none' | 'address' | 'domain'

export interface TrustedSender {
  id: string
  kind: 'address' | 'domain'
  value: string
  note: string
  created_by: string
  created_at: string
}

export interface Recommendation {
  position?: number
  action: string
  advisory?: boolean
}

export interface Incident {
  explanation_job?: { status: 'queued' | 'running' | 'succeeded' | 'failed'; reason?: string | null; updated_at: string } | null
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
  correlation_key?: string
  account_name?: string
  assignee?: string
  findings?: Finding[]
  recommendations?: Array<string | Recommendation>
  recommended_actions?: string[]
  audit?: AuditEntry[]
  signals?: Signal[]
  confidence?: number
}

export interface Account {
  id: string
  display_name?: string
  provider?: string
  status?: string
  email?: string
  last_scan_at?: string
  delete_after?: string | null
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
  gmail?: GmailConfiguration
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

export interface ScanJob {
  id: string
  source_id: string
  trigger: 'user' | 'schedule'
  status: 'queued' | 'running' | 'completed' | 'failed'
  attempts: number
  imported_count: number
  duplicate_count: number
  finding_count: number
  error?: string | null
  created_at: string
  started_at?: string | null
  completed_at?: string | null
}

export interface ScanSchedule {
  source_id: string
  enabled: boolean
  interval_minutes: number
  maximum_messages: number
  recent_days: number
  next_run_at: string
  failure_count: number
  last_job_id: string | null
  updated_at: string
}

export interface Credentials {
  apiKey: string
  tenantId: string
  csrfToken?: string
  userEmail?: string
}

export interface AuthSession {
  operator_contact?: string
  environment?: 'development' | 'production'
  evidence_retention_days?: number
  mode: 'local' | 'google'
  configured: boolean
  invitation_only: boolean
  session_hours: number
  mailbox_consent_separate: boolean
  user: { id: string; email: string; workspace_id: string } | null
  csrf_token: string
  expires_at?: string
}

export interface IncidentFilters {
  seenFrom?: string
  seenTo?: string
  severity: string
  status: string
  q: string
  accountId?: string
  offset?: number
  openOnly?: boolean
}

export interface Signal {
  id: string
  signal_type: string
  occurred_at: string
  received_at: string
  features: Record<string, unknown>
  account_id?: string
  source_id?: string
}

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export interface EvidenceItem {
  id: string
  account_id: string
  source_id: string
  signal_type: string
  occurred_at: string
  received_at: string
  sender: string
  subject: string
  finding_count: number
  incident_ids: string[]
}
export interface EvidenceDetail extends Signal {
  external_id: string
  correlation_key: string
  findings: Finding[]
  incidents: Incident[]
}
export interface DetectionRule {
  code: string
  signal_type: string
  title: string
  weight: number
  confidence: number
  enabled: boolean
  configuration: Record<string, unknown>
  version: number
}

export interface IngestionResult {
  imported_count: number
  duplicate_count: number
  finding_count: number
  items: Array<{ external_id: string; signal_id: string; duplicate: boolean; finding_count: number; incident_ids: string[] }>
}

export interface GmailConfiguration {
  trial?: boolean
  evidence_retention_days?: number
  implemented: boolean
  configured: boolean
  message: string
  scope: string
  maximum_messages: number
  signal_types: string[]
  automatic_scanning: boolean
}

export interface Overview {
  incidents: { active: number; critical: number; under_review: number; resolved: number; false_positive: number }
  accounts: number
  active_sources: number
  retained_signals: number
  source_activity: Record<string, { signal_count: number; last_received_at: string }>
  activity: Array<{ day: string; signals: number; incidents: number }>
  latest_job: { status: string; completed_at?: string; imported_count: number } | null
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

export interface PostureAnswers {
  mfa: 'on' | 'off' | 'unsure'
  forwarding: 'none' | 'approved' | 'unapproved' | 'unsure'
  forwarding_domain?: string
  apps: Array<{ name: string; full_mailbox_access: boolean; from_known_developer: boolean }>
}

export interface PostureResult {
  source_id: string
  submitted: string[]
  skipped: string[]
  ingestion: IngestionResult
}

export interface AlertSettings {
  minimum_severity: 'medium' | 'high' | 'critical'
  webhook_enabled: boolean
  webhook_url: string | null
}

export type AlertSettingsUpdate = Pick<AlertSettings, 'minimum_severity' | 'webhook_enabled' | 'webhook_url'>

export interface AlertItem {
  id: string
  incident_id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  score: number
  rule_codes: string[]
  webhook_status: string
  read: boolean
  created_at: string
}
