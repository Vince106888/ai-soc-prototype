"""Application services for ingestion, correlation, lifecycle, and evaluation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .entities import (
    Account,
    AuditRecord,
    DetectionRule,
    Finding,
    Incident,
    IncidentExplanation,
    Recommendation,
    ScanJob,
    Signal,
    Source,
    utcnow,
)
from .platform_schemas import (
    AccountCreate,
    EvaluationRequest,
    EvaluationResult,
    IncidentDetail,
    IncidentListItem,
    IncidentTransition,
    IngestionItem,
    IngestionResult,
    SignalBatch,
    SignalInput,
    SourceCreate,
)
from .rules import (
    combine_weights,
    default_correlation_key,
    evaluate_rules,
    normalise_signal,
    seed_rules,
    severity_for,
    signal_fingerprint,
)

CORRELATION_WINDOW = timedelta(minutes=30)


class PlatformError(Exception):
    """Base for errors that have a safe HTTP representation."""


class NotFoundError(PlatformError):
    pass


class ConflictError(PlatformError):
    pass


class InvalidTransitionError(PlatformError):
    pass


def _commit(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ConflictError("A record with the same stable identifier already exists.") from exc


def create_account(session: Session, tenant_id: str, data: AccountCreate) -> Account:
    account = Account(tenant_id=tenant_id, **data.model_dump())
    session.add(account)
    _commit(session)
    return account


def list_accounts(session: Session, tenant_id: str) -> list[Account]:
    return list(
        session.scalars(
            select(Account).where(Account.tenant_id == tenant_id).order_by(Account.created_at)
        )
    )


def get_account(session: Session, tenant_id: str, account_id: str) -> Account:
    account = session.scalar(
        select(Account).where(Account.id == account_id, Account.tenant_id == tenant_id)
    )
    if account is None:
        raise NotFoundError("Account not found.")
    return account


def create_source(session: Session, tenant_id: str, account_id: str, data: SourceCreate) -> Source:
    get_account(session, tenant_id, account_id)
    capabilities = ["signin" if item == "sign_in" else item for item in data.capabilities]
    source = Source(
        tenant_id=tenant_id,
        account_id=account_id,
        source_type=data.source_type,
        name=data.name,
        external_id=data.external_id,
        capabilities=list(dict.fromkeys(capabilities)),
    )
    session.add(source)
    _commit(session)
    return source


def list_sources(session: Session, tenant_id: str, account_id: str | None = None) -> list[Source]:
    statement = select(Source).where(Source.tenant_id == tenant_id)
    if account_id:
        statement = statement.where(Source.account_id == account_id)
    return list(session.scalars(statement.order_by(Source.created_at)))


def get_source(session: Session, tenant_id: str, source_id: str) -> Source:
    source = session.scalar(
        select(Source).where(Source.id == source_id, Source.tenant_id == tenant_id)
    )
    if source is None:
        raise NotFoundError("Source not found.")
    return source


def update_source_status(session: Session, tenant_id: str, source_id: str, status: str) -> Source:
    source = get_source(session, tenant_id, source_id)
    source.status = status
    source.updated_at = utcnow()
    _commit(session)
    return source


def create_scan_job(session: Session, tenant_id: str, source_id: str, trigger: str) -> ScanJob:
    source = get_source(session, tenant_id, source_id)
    if source.status != "active":
        raise ConflictError("Disconnected sources cannot start scans.")
    job = ScanJob(tenant_id=tenant_id, source_id=source_id, trigger=trigger)
    session.add(job)
    _commit(session)
    return job


def list_scan_jobs(session: Session, tenant_id: str, source_id: str | None = None) -> list[ScanJob]:
    statement = select(ScanJob).where(ScanJob.tenant_id == tenant_id)
    if source_id:
        statement = statement.where(ScanJob.source_id == source_id)
    return list(session.scalars(statement.order_by(ScanJob.created_at.desc())))


def get_scan_job(session: Session, tenant_id: str, job_id: str) -> ScanJob:
    job = session.scalar(
        select(ScanJob).where(ScanJob.id == job_id, ScanJob.tenant_id == tenant_id)
    )
    if job is None:
        raise NotFoundError("Scan job not found.")
    return job


def retry_scan_job(session: Session, tenant_id: str, job_id: str) -> ScanJob:
    """Move a failed job back to the queue for one explicit retry attempt."""

    job = get_scan_job(session, tenant_id, job_id)
    if job.status != "failed":
        raise ConflictError("Only failed scan jobs can be retried.")
    source = get_source(session, tenant_id, job.source_id)
    if source.status != "active":
        raise ConflictError("Reconnect the source before retrying its scan job.")
    job.status = "queued"
    job.error = None
    job.completed_at = None
    _commit(session)
    return job


def mark_scan_job_failed(
    session: Session,
    tenant_id: str,
    job_id: str | None,
    source_id: str,
    error: Exception,
) -> None:
    """Persist a safe terminal failure after rolling back partial ingestion."""

    if not job_id:
        return
    session.rollback()
    job = session.scalar(
        select(ScanJob).where(
            ScanJob.id == job_id,
            ScanJob.tenant_id == tenant_id,
            ScanJob.source_id == source_id,
            ScanJob.status.in_(("queued", "running")),
        )
    )
    if job is None:
        return
    job.status = "failed"
    job.attempts += 1
    job.started_at = job.started_at or utcnow()
    job.completed_at = utcnow()
    job.error = f"{type(error).__name__}: signal ingestion failed"[:500]
    _commit(session)


def _as_utc(value: datetime | None) -> datetime:
    if value is None:
        return utcnow()
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _guidance(incident: Incident) -> tuple[dict, list[str]]:
    titles = [finding.title for finding in incident.findings]
    what = "Related security evidence was detected: " + "; ".join(titles) + "."
    why = (
        "The configured indicators may reflect account compromise or deceptive activity. "
        "The score prioritises review; it is not a probability or automatic verdict."
    )
    next_step = "Review the evidence and verify the activity through a trusted channel."
    actions = [next_step]
    codes = {finding.rule_code for finding in incident.findings}
    if any(code.startswith(("EMAIL", "URL")) for code in codes):
        actions.extend(
            [
                "Do not open the reported links until the sender is independently verified.",
                "Use the provider's official site rather than a link in the message.",
            ]
        )
    if "FORWARD-001" in codes:
        actions.append("Review mailbox forwarding settings and remove unapproved destinations.")
    if "SIGNIN-001" in codes:
        actions.append("Review recent sign-ins and revoke unfamiliar sessions.")
    if "MFA-001" in codes:
        actions.append("Enable multi-factor authentication using an approved method.")
    if "OAUTH-001" in codes:
        actions.append("Review the application's permissions and revoke the grant if unexpected.")
    return {
        "what_happened": what,
        "why_it_matters": why,
        "severity": (
            f"Severity is {incident.severity} because the combined configured score is "
            f"{incident.score:.2f}."
        ),
        "next_step": next_step,
    }, list(dict.fromkeys(actions))


def _refresh_guidance(session: Session, incident: Incident) -> None:
    session.flush()
    session.expire(incident, ["findings"])
    content, actions = _guidance(incident)
    session.execute(
        delete(IncidentExplanation).where(IncidentExplanation.incident_id == incident.id)
    )
    session.execute(delete(Recommendation).where(Recommendation.incident_id == incident.id))
    session.add(IncidentExplanation(incident_id=incident.id, source="template", content=content))
    session.add_all(
        Recommendation(incident_id=incident.id, position=index, action=action)
        for index, action in enumerate(actions, start=1)
    )


def _correlate(
    session: Session, signal: Signal, findings: list[Finding], actor: str = "system"
) -> Incident:
    start = signal.occurred_at - CORRELATION_WINDOW
    end = signal.occurred_at + CORRELATION_WINDOW
    incident = session.scalar(
        select(Incident)
        .where(
            Incident.tenant_id == signal.tenant_id,
            Incident.account_id == signal.account_id,
            Incident.correlation_key == signal.correlation_key,
            Incident.last_seen_at >= start,
            Incident.first_seen_at <= end,
            Incident.status != "false_positive",
        )
        .order_by(Incident.last_seen_at.desc())
        .limit(1)
    )
    is_new = incident is None
    if incident is None:
        strongest = max(findings, key=lambda item: item.weight)
        incident = Incident(
            tenant_id=signal.tenant_id,
            account_id=signal.account_id,
            correlation_key=signal.correlation_key,
            title=strongest.title,
            summary=(
                f"{len(findings)} configured indicator(s) matched {signal.signal_type} evidence."
            ),
            score=0,
            confidence=0,
            severity="low",
            status="new",
            first_seen_at=signal.occurred_at,
            last_seen_at=signal.occurred_at,
        )
        session.add(incident)
        session.flush()
        session.add(
            AuditRecord(
                tenant_id=signal.tenant_id,
                incident_id=incident.id,
                actor=actor,
                action="incident_created",
                to_status="new",
                detail="Incident created from correlated deterministic findings.",
            )
        )
    elif incident.status == "resolved":
        incident.status = "under_review"
        session.add(
            AuditRecord(
                tenant_id=signal.tenant_id,
                incident_id=incident.id,
                actor=actor,
                action="incident_reopened",
                from_status="resolved",
                to_status="under_review",
                detail="New related evidence arrived inside the correlation window.",
            )
        )

    for finding in findings:
        finding.incident_id = incident.id
    session.flush()
    all_findings = list(session.scalars(select(Finding).where(Finding.incident_id == incident.id)))
    incident.score = combine_weights([item.weight for item in all_findings])
    incident.confidence = combine_weights([item.confidence for item in all_findings])
    incident.severity = severity_for(incident.score)
    incident.first_seen_at = min(_as_utc(incident.first_seen_at), _as_utc(signal.occurred_at))
    incident.last_seen_at = max(_as_utc(incident.last_seen_at), _as_utc(signal.occurred_at))
    incident.updated_at = utcnow()
    incident.summary = f"{len(all_findings)} evidence-backed finding(s) were correlated."
    if not is_new:
        strongest = max(all_findings, key=lambda item: item.weight)
        incident.title = strongest.title
    _refresh_guidance(session, incident)
    return incident


def ingest_signals(
    session: Session,
    tenant_id: str,
    source_id: str,
    batch: SignalBatch,
) -> IngestionResult:
    source = get_source(session, tenant_id, source_id)
    if source.status != "active":
        raise ConflictError("Disconnected sources cannot ingest signals.")
    job = get_scan_job(session, tenant_id, batch.scan_job_id) if batch.scan_job_id else None
    if job and job.source_id != source.id:
        raise ConflictError("The scan job belongs to a different source.")
    if job:
        if job.status != "queued":
            raise ConflictError("Only queued scan jobs can ingest signals.")
        job.status = "running"
        job.attempts += 1
        job.started_at = job.started_at or utcnow()

    seed_rules(session)
    configured_rules = list(session.scalars(select(DetectionRule)))
    items: list[IngestionItem] = []
    imported_count = duplicate_count = finding_count = 0
    for raw_signal in batch.signals:
        canonical_type = "signin" if raw_signal.signal_type == "sign_in" else raw_signal.signal_type
        if canonical_type not in source.capabilities:
            raise ConflictError(f"Source is not configured for {canonical_type} signals.")
        existing = session.scalar(
            select(Signal).where(
                Signal.source_id == source.id,
                Signal.external_id == raw_signal.external_id,
            )
        )
        if existing:
            existing_findings = list(
                session.scalars(select(Finding).where(Finding.signal_id == existing.id))
            )
            incident_ids = sorted(
                {item.incident_id for item in existing_findings if item.incident_id}
            )
            items.append(
                IngestionItem(
                    external_id=raw_signal.external_id,
                    signal_id=existing.id,
                    duplicate=True,
                    finding_count=len(existing_findings),
                    incident_ids=incident_ids,
                )
            )
            duplicate_count += 1
            continue

        signal_type, features = normalise_signal(raw_signal.signal_type, raw_signal.features)
        occurred_at = _as_utc(raw_signal.occurred_at)
        correlation_key = raw_signal.correlation_key or default_correlation_key(
            signal_type, features
        )
        signal = Signal(
            tenant_id=tenant_id,
            account_id=source.account_id,
            source_id=source.id,
            scan_job_id=job.id if job else None,
            external_id=raw_signal.external_id,
            signal_type=signal_type,
            occurred_at=occurred_at,
            correlation_key=correlation_key,
            features=features,
            fingerprint=signal_fingerprint(signal_type, features),
        )
        session.add(signal)
        session.flush()
        matches = evaluate_rules(signal_type, features, configured_rules)
        findings = [
            Finding(
                tenant_id=tenant_id,
                signal_id=signal.id,
                rule_code=match.code,
                title=match.title,
                evidence=match.evidence,
                weight=match.weight,
                confidence=match.confidence,
            )
            for match in matches
            if match.weight >= 0.10
        ]
        session.add_all(findings)
        session.flush()
        incidents = [_correlate(session, signal, findings)] if findings else []
        items.append(
            IngestionItem(
                external_id=raw_signal.external_id,
                signal_id=signal.id,
                duplicate=False,
                finding_count=len(findings),
                incident_ids=[item.id for item in incidents],
            )
        )
        imported_count += 1
        finding_count += len(findings)

    if job:
        job.status = "completed"
        job.completed_at = utcnow()
        job.imported_count += imported_count
        job.duplicate_count += duplicate_count
        job.finding_count += finding_count
    _commit(session)
    return IngestionResult(
        imported_count=imported_count,
        duplicate_count=duplicate_count,
        finding_count=finding_count,
        items=items,
    )


def _incident_item(incident: Incident) -> IncidentListItem:
    return IncidentListItem(
        id=incident.id,
        account_id=incident.account_id,
        correlation_key=incident.correlation_key,
        title=incident.title,
        summary=incident.summary,
        score=incident.score,
        confidence=incident.confidence,
        severity=incident.severity,
        status=incident.status,
        finding_count=len(incident.findings),
        first_seen_at=incident.first_seen_at,
        last_seen_at=incident.last_seen_at,
        updated_at=incident.updated_at,
    )


def list_incidents(
    session: Session,
    tenant_id: str,
    *,
    severity: str | None = None,
    status: str | None = None,
    search: str | None = None,
    account_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[IncidentListItem]:
    severity_order = case(
        (Incident.severity == "critical", 4),
        (Incident.severity == "high", 3),
        (Incident.severity == "medium", 2),
        else_=1,
    )
    statement = (
        select(Incident)
        .options(selectinload(Incident.findings))
        .where(Incident.tenant_id == tenant_id)
    )
    if severity:
        statement = statement.where(Incident.severity == severity)
    if status:
        statement = statement.where(Incident.status == status)
    if account_id:
        statement = statement.where(Incident.account_id == account_id)
    if search:
        pattern = f"%{search.casefold()}%"
        statement = statement.where(
            or_(
                func.lower(Incident.title).like(pattern),
                func.lower(Incident.summary).like(pattern),
                func.lower(Incident.correlation_key).like(pattern),
            )
        )
    statement = statement.order_by(severity_order.desc(), Incident.last_seen_at.desc())
    incidents = session.scalars(statement.offset(offset).limit(limit)).unique().all()
    return [_incident_item(item) for item in incidents]


def _load_incident(session: Session, tenant_id: str, incident_id: str) -> Incident:
    incident = session.scalar(
        select(Incident)
        .options(
            selectinload(Incident.findings).selectinload(Finding.signal),
            selectinload(Incident.explanations),
            selectinload(Incident.recommendations),
            selectinload(Incident.audit_records),
        )
        .where(Incident.id == incident_id, Incident.tenant_id == tenant_id)
    )
    if incident is None:
        raise NotFoundError("Incident not found.")
    return incident


def incident_detail(session: Session, tenant_id: str, incident_id: str) -> IncidentDetail:
    incident = _load_incident(session, tenant_id, incident_id)
    latest_explanation = max(incident.explanations, key=lambda item: item.created_at)
    explanation = {"source": latest_explanation.source, **latest_explanation.content}
    unique_signals = {finding.signal.id: finding.signal for finding in incident.findings}
    return IncidentDetail(
        **_incident_item(incident).model_dump(),
        findings=incident.findings,
        signals=list(unique_signals.values()),
        explanation=explanation,
        recommendations=sorted(incident.recommendations, key=lambda item: item.position),
        audit=sorted(incident.audit_records, key=lambda item: item.created_at),
    )


VALID_TRANSITIONS = {
    "new": {"under_review", "false_positive"},
    "under_review": {"resolved", "false_positive"},
    "resolved": {"under_review"},
    "false_positive": set(),
}


def transition_incident(
    session: Session,
    tenant_id: str,
    incident_id: str,
    transition: IncidentTransition,
) -> IncidentDetail:
    incident = _load_incident(session, tenant_id, incident_id)
    previous = incident.status
    if transition.status not in VALID_TRANSITIONS[previous]:
        raise InvalidTransitionError(
            f"Incident cannot transition from {previous} to {transition.status}."
        )
    incident.status = transition.status
    incident.updated_at = utcnow()
    action = "incident_reopened" if previous == "resolved" else "incident_status_changed"
    session.add(
        AuditRecord(
            tenant_id=tenant_id,
            incident_id=incident.id,
            actor=transition.actor,
            action=action,
            from_status=previous,
            to_status=transition.status,
            detail=transition.note,
        )
    )
    _commit(session)
    return incident_detail(session, tenant_id, incident_id)


def list_rules(session: Session) -> list[DetectionRule]:
    seed_rules(session)
    _commit(session)
    return list(session.scalars(select(DetectionRule).order_by(DetectionRule.code)))


def run_evaluation(session: Session, request: EvaluationRequest) -> EvaluationResult:
    seed_rules(session)
    rules = list(session.scalars(select(DetectionRule)))
    tp = fp = tn = fn = 0
    for case_item in request.cases:
        signal_type, features = normalise_signal(
            case_item.signal.signal_type, case_item.signal.features
        )
        score = combine_weights(
            [match.weight for match in evaluate_rules(signal_type, features, rules)]
        )
        predicted = score >= request.threshold
        expected = case_item.expected_suspicious
        tp += int(predicted and expected)
        fp += int(predicted and not expected)
        tn += int(not predicted and not expected)
        fn += int(not predicted and expected)

    total = tp + fp + tn + fn

    def safe_divide(top: float, bottom: float) -> float:
        return round(top / bottom, 4) if bottom else 0.0

    precision = safe_divide(tp, tp + fp)
    recall = safe_divide(tp, tp + fn)
    return EvaluationResult(
        total=total,
        threshold=request.threshold,
        confusion_matrix={
            "true_positive": tp,
            "false_positive": fp,
            "true_negative": tn,
            "false_negative": fn,
        },
        accuracy=safe_divide(tp + tn, total),
        precision=precision,
        recall=recall,
        specificity=safe_divide(tn, tn + fp),
        f1_score=safe_divide(2 * precision * recall, precision + recall),
    )


def evaluate_one(session: Session, signal: SignalInput) -> tuple[float, list[str]]:
    """Small pure-looking helper used by callers that need a dry-run score."""

    seed_rules(session)
    signal_type, features = normalise_signal(signal.signal_type, signal.features)
    matches = evaluate_rules(signal_type, features, list(session.scalars(select(DetectionRule))))
    return combine_weights([match.weight for match in matches]), [match.code for match in matches]
