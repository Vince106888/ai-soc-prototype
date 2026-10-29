"""Versioned HTTP API for the persistent SentinelSME platform."""

from __future__ import annotations

import hmac
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import alerts as alert_service
from . import auth, budgets, deployment, explainer
from .database import get_session
from .entities import AuditRecord, ScanSchedule
from .evidence import signal_detail, signal_page
from .explanation_jobs import enqueue
from .explanation_jobs import expire as expire_explanation_jobs
from .gmail import configuration_status
from .overview import dashboard_overview
from .platform import (
    ConflictError,
    InvalidTransitionError,
    NotFoundError,
    _load_incident,
    add_trusted_sender,
    create_account,
    create_scan_job,
    create_source,
    get_account,
    get_scan_job,
    get_source,
    incident_detail,
    incident_page,
    ingest_signals,
    list_accounts,
    list_incidents,
    list_rules,
    list_scan_jobs,
    list_sources,
    list_trusted_senders,
    mark_scan_job_failed,
    remove_trusted_sender,
    retry_scan_job,
    run_evaluation,
    submit_posture_check,
    transition_incident,
    update_source_status,
)
from .platform_schemas import (
    AccountCreate,
    AccountView,
    AlertSettingsUpdate,
    AlertSettingsView,
    AlertView,
    AuditView,
    CanonicalSignalType,
    CompatibilityScanCreate,
    EvaluationRequest,
    EvaluationResult,
    IncidentDetail,
    IncidentListItem,
    IncidentPage,
    IncidentStatus,
    IncidentTransition,
    IngestionResult,
    PostureCheck,
    PostureResult,
    RuleView,
    ScanJobCreate,
    ScanJobView,
    ScheduleUpdate,
    ScheduleView,
    Severity,
    SignalBatch,
    SignalDetail,
    SignalPage,
    SourceCreate,
    SourceStatusUpdate,
    SourceView,
    TrustedSenderCreate,
    TrustedSenderView,
)
from .retention import delete_account_data, expire_workspace_evidence
from .scheduling import configure_schedule

TENANT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$")


@dataclass(frozen=True)
class RequestContext:
    tenant_id: str
    user_id: str | None = None
    email: str | None = None


def request_context(
    request: Request,
    db: Annotated[Session, Depends(get_session)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    x_tenant_id: Annotated[str, Header(alias="X-Tenant-ID")] = "default",
) -> RequestContext:
    """Google mode derives identity and tenant from the server-side session."""

    if auth.required():
        identity = auth.principal(db, request)
        if deployment.production():
            # FastAPI caches this dependency once per request. Counters survive API restarts.
            budgets.consume(
                db, identity.user_id, identity.tenant_id, request.method, request.url.path
            )
            identity = auth.principal(db, request)
            expire_workspace_evidence(db, identity.tenant_id)
            expire_explanation_jobs(db, identity.tenant_id)
            db.commit()
            identity = auth.principal(db, request)
        return RequestContext(identity.tenant_id, identity.user_id, identity.email)

    expected = os.getenv("AI_SOC_API_KEY")
    if expected and (not x_api_key or not hmac.compare_digest(x_api_key, expected)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid X-API-Key header is required.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    if not TENANT_PATTERN.fullmatch(x_tenant_id):
        raise HTTPException(status_code=400, detail="X-Tenant-ID has an invalid format.")
    return RequestContext(tenant_id=x_tenant_id)


router = APIRouter(prefix="/api/v1", tags=["SentinelSME"], dependencies=[Depends(request_context)])
DB = Annotated[Session, Depends(get_session)]
Context = Annotated[RequestContext, Depends(request_context)]


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, NotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, (ConflictError, InvalidTransitionError)):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=500, detail="Unexpected platform error.")


@router.get("/capabilities")
def capabilities() -> dict:
    """Describe available adapters without claiming unavailable live integrations."""

    return {
        "service": "SentinelSME",
        "signal_types": ["email", "forwarding", "signin", "mfa", "oauth_grant"],
        "source_types": ["controlled", "gmail", "workspace"],
        "live_connectors": ["gmail"] if configuration_status()["configured"] else [],
        "gmail": configuration_status(),
        "controlled_ingestion": True,
        "template_explanations": True,
        "ai_explanations": explainer.settings().enabled,
        "correlation_window_minutes": 30,
        "maximum_batch_size": 500,
        "privacy": {"stores_full_bodies": False, "stores_attachments": False},
    }


@router.post("/accounts", response_model=AccountView, status_code=201)
def accounts_create(payload: AccountCreate, db: DB, context: Context) -> AccountView:
    try:
        return AccountView.model_validate(create_account(db, context.tenant_id, payload))
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/overview")
def overview(db: DB, context: Context) -> dict:
    return dashboard_overview(db, context.tenant_id)


@router.get("/sources/{source_id}/schedule", response_model=ScheduleView | None)
def schedule_get(source_id: str, db: DB, context: Context) -> ScheduleView | None:
    try:
        get_source(db, context.tenant_id, source_id)
    except NotFoundError as exc:
        raise _http_error(exc) from exc
    schedule = db.get(ScanSchedule, source_id)
    return ScheduleView.model_validate(schedule) if schedule else None


@router.put("/sources/{source_id}/schedule", response_model=ScheduleView)
def schedule_put(source_id: str, payload: ScheduleUpdate, db: DB, context: Context) -> ScheduleView:
    try:
        schedule = configure_schedule(
            db, context.tenant_id, source_id, payload, actor=context.user_id or "console-user"
        )
        return ScheduleView.model_validate(schedule)
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


def _alert_settings_view(
    db: Session, tenant: str, signed_in_email: str | None
) -> AlertSettingsView:
    row = alert_service.get_settings(db, tenant)
    return AlertSettingsView(
        minimum_severity=row.minimum_severity,
        email_enabled=row.email_enabled,
        email_to=signed_in_email or row.email_to,
        webhook_enabled=row.webhook_enabled,
        webhook_url=row.webhook_url,
        email_available=alert_service.smtp_settings() is not None,
        email_locked_to_signed_in_user=bool(signed_in_email),
    )


def _alert_view(row) -> AlertView:
    return AlertView(
        id=row.id,
        incident_id=row.incident_id,
        severity=row.severity,
        title=row.title,
        score=row.score,
        rule_codes=row.rule_codes.split(",") if row.rule_codes else [],
        email_status=row.email_status,
        webhook_status=row.webhook_status,
        read=row.read_at is not None,
        created_at=row.created_at,
    )


@router.get("/alert-settings", response_model=AlertSettingsView)
def alert_settings_get(db: DB, context: Context) -> AlertSettingsView:
    return _alert_settings_view(db, context.tenant_id, context.email)


@router.put("/alert-settings", response_model=AlertSettingsView)
def alert_settings_put(payload: AlertSettingsUpdate, db: DB, context: Context) -> AlertSettingsView:
    try:
        alert_service.configure(
            db,
            context.tenant_id,
            payload,
            signed_in_email=context.email,
            actor=context.user_id or "console-user",
        )
    except alert_service.AlertConfigError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _alert_settings_view(db, context.tenant_id, context.email)


@router.get("/alerts", response_model=list[AlertView])
def alerts_list(
    db: DB, context: Context, unread: bool = False, limit: int = Query(50, ge=1, le=200)
) -> list[AlertView]:
    rows = alert_service.list_alerts(db, context.tenant_id, unread_only=unread, limit=limit)
    return [_alert_view(row) for row in rows]


@router.post("/alerts/read", status_code=204)
def alerts_read_all(db: DB, context: Context) -> Response:
    alert_service.mark_read(db, context.tenant_id)
    return Response(status_code=204)


@router.post("/alerts/{alert_id}/read", status_code=204)
def alerts_read_one(alert_id: str, db: DB, context: Context) -> Response:
    if not alert_service.mark_read(db, context.tenant_id, alert_id):
        raise HTTPException(status_code=404, detail="Alert not found or already read.")
    return Response(status_code=204)


@router.get("/accounts", response_model=list[AccountView])
def accounts_list(db: DB, context: Context) -> list[AccountView]:
    return [AccountView.model_validate(item) for item in list_accounts(db, context.tenant_id)]


@router.get("/accounts/{account_id}", response_model=AccountView)
def accounts_get(account_id: str, db: DB, context: Context) -> AccountView:
    try:
        return AccountView.model_validate(get_account(db, context.tenant_id, account_id))
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.delete("/accounts/{account_id}", status_code=204)
def accounts_delete(account_id: str, db: DB, context: Context) -> None:
    try:
        delete_account_data(db, context.tenant_id, account_id)
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.post("/accounts/{account_id}/posture-check", response_model=PostureResult, status_code=201)
def posture_check(
    account_id: str, payload: PostureCheck, db: DB, context: Context
) -> PostureResult:
    """Record self-reported MFA, forwarding and app-access answers as signals."""

    try:
        return submit_posture_check(db, context.tenant_id, account_id, payload)
    except NotFoundError as exc:
        raise _http_error(exc) from exc
    except ConflictError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/accounts/{account_id}/sources", response_model=SourceView, status_code=201)
def sources_create(account_id: str, payload: SourceCreate, db: DB, context: Context) -> SourceView:
    if payload.source_type != "controlled":
        raise HTTPException(409, "Use Google consent to create a live Gmail source.")
    try:
        return SourceView.model_validate(create_source(db, context.tenant_id, account_id, payload))
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/accounts/{account_id}/sources", response_model=list[SourceView])
def account_sources_list(account_id: str, db: DB, context: Context) -> list[SourceView]:
    try:
        get_account(db, context.tenant_id, account_id)
        return [
            SourceView.model_validate(item)
            for item in list_sources(db, context.tenant_id, account_id)
        ]
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.get("/sources", response_model=list[SourceView])
def sources_list(db: DB, context: Context, account_id: str | None = None) -> list[SourceView]:
    return [
        SourceView.model_validate(item) for item in list_sources(db, context.tenant_id, account_id)
    ]


@router.patch("/sources/{source_id}", response_model=SourceView)
def sources_update(
    source_id: str, payload: SourceStatusUpdate, db: DB, context: Context
) -> SourceView:
    from .platform import get_source

    try:
        source = get_source(db, context.tenant_id, source_id)
        if source.source_type != "controlled":
            raise HTTPException(409, "Use Gmail connect or disconnect to change provider consent.")
        return SourceView.model_validate(
            update_source_status(db, context.tenant_id, source_id, payload.status)
        )
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.post("/scan-jobs", response_model=ScanJobView, status_code=202)
def scan_jobs_create(payload: ScanJobCreate, db: DB, context: Context) -> ScanJobView:
    try:
        return ScanJobView.model_validate(
            create_scan_job(db, context.tenant_id, payload.source_id, payload.trigger)
        )
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/scan-jobs", response_model=list[ScanJobView])
def scan_jobs_list(db: DB, context: Context, source_id: str | None = None) -> list[ScanJobView]:
    return [
        ScanJobView.model_validate(item)
        for item in list_scan_jobs(db, context.tenant_id, source_id)
    ]


@router.get("/scan-jobs/{job_id}", response_model=ScanJobView)
def scan_jobs_get(job_id: str, db: DB, context: Context) -> ScanJobView:
    try:
        return ScanJobView.model_validate(get_scan_job(db, context.tenant_id, job_id))
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.post("/scan-jobs/{job_id}/retry", response_model=ScanJobView, status_code=202)
def scan_jobs_retry(job_id: str, db: DB, context: Context) -> ScanJobView:
    try:
        return ScanJobView.model_validate(retry_scan_job(db, context.tenant_id, job_id))
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.post("/scans", response_model=ScanJobView, status_code=202)
def dashboard_scan_create(
    payload: CompatibilityScanCreate, db: DB, context: Context
) -> ScanJobView:
    """Create a controlled source on demand for the dashboard's compact flow."""

    try:
        get_account(db, context.tenant_id, payload.account_id)
        external_id = f"dashboard:{payload.account_id}:{payload.scope}:{payload.target}"
        source = next(
            (
                item
                for item in list_sources(db, context.tenant_id, payload.account_id)
                if item.external_id == external_id
            ),
            None,
        )
        if source is None:
            source = create_source(
                db,
                context.tenant_id,
                payload.account_id,
                SourceCreate(
                    source_type="controlled",
                    name=f"Dashboard {payload.scope} scan",
                    external_id=external_id,
                    capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
                ),
            )
        return ScanJobView.model_validate(create_scan_job(db, context.tenant_id, source.id, "user"))
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/scans/{job_id}", response_model=ScanJobView)
def dashboard_scan_get(job_id: str, db: DB, context: Context) -> ScanJobView:
    return scan_jobs_get(job_id, db, context)


@router.post("/sources/{source_id}/signals", response_model=IngestionResult, status_code=201)
def signals_ingest(
    source_id: str, payload: SignalBatch, db: DB, context: Context
) -> IngestionResult:
    try:
        source = get_source(db, context.tenant_id, source_id)
        if source.source_type != "controlled":
            raise ConflictError("Manual ingestion requires a controlled source.")
        return ingest_signals(db, context.tenant_id, source_id, payload)
    except (ConflictError, NotFoundError) as exc:
        mark_scan_job_failed(
            db,
            context.tenant_id,
            payload.scan_job_id,
            source_id,
            exc,
        )
        raise _http_error(exc) from exc
    except Exception as exc:
        mark_scan_job_failed(
            db,
            context.tenant_id,
            payload.scan_job_id,
            source_id,
            exc,
        )
        raise


@router.get("/incidents", response_model=list[IncidentListItem])
def incidents_list(
    db: DB,
    context: Context,
    severity: Severity | None = None,
    status_filter: Annotated[IncidentStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    account_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[IncidentListItem]:
    return list_incidents(
        db,
        context.tenant_id,
        severity=severity,
        status=status_filter,
        search=search,
        account_id=account_id,
        limit=limit,
        offset=offset,
    )


@router.get("/incidents/page", response_model=IncidentPage)
def incidents_page(
    db: DB,
    context: Context,
    severity: Severity | None = None,
    status_filter: Annotated[IncidentStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    account_id: str | None = None,
    open_only: bool = False,
    seen_from: datetime | None = None,
    seen_to: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> IncidentPage:
    def utc(value):
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

    if seen_from and seen_to and utc(seen_from) > utc(seen_to):
        raise HTTPException(422, "The start time must precede the end time.")
    return incident_page(
        db,
        context.tenant_id,
        severity=severity,
        status=status_filter,
        search=search,
        account_id=account_id,
        open_only=open_only,
        seen_from=seen_from,
        seen_to=seen_to,
        limit=limit,
        offset=offset,
    )


@router.get("/signals", response_model=SignalPage)
def signals_list(
    db: DB,
    context: Context,
    account_id: str | None = None,
    source_id: str | None = None,
    signal_type: CanonicalSignalType | None = None,
    has_findings: bool | None = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SignalPage:
    return signal_page(
        db,
        context.tenant_id,
        account_id=account_id,
        source_id=source_id,
        signal_type=signal_type,
        has_findings=has_findings,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get("/signals/{signal_id}", response_model=SignalDetail)
def signals_get(signal_id: str, db: DB, context: Context) -> SignalDetail:
    try:
        return signal_detail(db, context.tenant_id, signal_id)
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.get("/incidents/{incident_id}", response_model=IncidentDetail)
def incidents_get(incident_id: str, db: DB, context: Context) -> IncidentDetail:
    try:
        return incident_detail(db, context.tenant_id, incident_id)
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.post("/incidents/{incident_id}/explanation", response_model=IncidentDetail)
def incidents_explain(
    incident_id: str, db: DB, context: Context, response: Response
) -> IncidentDetail:
    """Ask the local model to explain one incident now; the template remains on failure."""

    if not explainer.settings().enabled:
        raise HTTPException(status_code=409, detail="Local model explanations are not enabled.")
    try:
        incident = _load_incident(db, context.tenant_id, incident_id)
        if deployment.production():
            enqueue(db, context.tenant_id, incident)
            db.commit()
            response.status_code = 202
        else:
            explainer.explain_incident(db, incident)
        db.expire_all()
        return incident_detail(db, context.tenant_id, incident_id)
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.patch("/incidents/{incident_id}/status", response_model=IncidentDetail)
def incidents_transition(
    incident_id: str, payload: IncidentTransition, db: DB, context: Context
) -> IncidentDetail:
    try:
        if context.user_id:
            payload = payload.model_copy(update={"actor": "user:" + context.user_id})
        return transition_incident(db, context.tenant_id, incident_id, payload)
    except (ConflictError, InvalidTransitionError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/trusted-senders", response_model=list[TrustedSenderView])
def trusted_senders_list(db: DB, context: Context) -> list[TrustedSenderView]:
    return [
        TrustedSenderView.model_validate(item)
        for item in list_trusted_senders(db, context.tenant_id)
    ]


@router.post("/trusted-senders", response_model=TrustedSenderView, status_code=201)
def trusted_senders_create(
    payload: TrustedSenderCreate, db: DB, context: Context
) -> TrustedSenderView:
    actor = "user:" + context.user_id if context.user_id else "console-user"
    try:
        return TrustedSenderView.model_validate(
            add_trusted_sender(db, context.tenant_id, payload, actor=actor)
        )
    except ConflictError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/trusted-senders/{trusted_id}", status_code=204)
def trusted_senders_delete(trusted_id: str, db: DB, context: Context) -> None:
    actor = "user:" + context.user_id if context.user_id else "console-user"
    try:
        remove_trusted_sender(db, context.tenant_id, trusted_id, actor=actor)
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.get("/rules", response_model=list[RuleView])
def rules_list(db: DB) -> list[RuleView]:
    return [RuleView.model_validate(item) for item in list_rules(db)]


@router.get("/audit", response_model=list[AuditView])
def audit_list(
    db: DB,
    context: Context,
    incident_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[AuditView]:
    statement = select(AuditRecord).where(AuditRecord.tenant_id == context.tenant_id)
    if incident_id:
        statement = statement.where(AuditRecord.incident_id == incident_id)
    records = db.scalars(statement.order_by(AuditRecord.created_at.desc()).limit(limit)).all()
    return [AuditView.model_validate(item) for item in records]


@router.post("/evaluation", response_model=EvaluationResult)
def evaluation_run(payload: EvaluationRequest, db: DB, _context: Context) -> EvaluationResult:
    return run_evaluation(db, payload)
