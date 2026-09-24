"""Strict request and response contracts for the versioned platform API."""

from __future__ import annotations

from datetime import datetime
from email.utils import parseaddr
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import EMAIL_PATTERN

SignalType = Literal["email", "forwarding", "signin", "sign_in", "mfa", "oauth_grant"]
Severity = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["new", "under_review", "resolved", "false_positive"]


class APIModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", str_strip_whitespace=True, from_attributes=True, populate_by_name=True
    )


class AccountCreate(APIModel):
    email: Annotated[str, Field(min_length=3, max_length=320)]
    display_name: Annotated[str, Field(max_length=200)] = ""
    provider: Literal["controlled", "google"] = "controlled"
    profile: Literal["controlled", "personal_gmail", "workspace_admin"] = "controlled"

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        _name, address = parseaddr(value, strict=True)
        if value != address or not EMAIL_PATTERN.fullmatch(address):
            raise ValueError("email must be one valid bare address")
        return address.casefold()


class AccountView(AccountCreate):
    id: str
    status: Literal["active", "disconnected"]
    created_at: datetime
    updated_at: datetime


class SourceCreate(APIModel):
    source_type: Literal["controlled", "gmail", "workspace"] = "controlled"
    name: Annotated[str, Field(min_length=1, max_length=200)]
    external_id: Annotated[str, Field(min_length=1, max_length=255)]
    capabilities: list[SignalType] = Field(default_factory=list, max_length=10)


class SourceView(SourceCreate):
    id: str
    account_id: str
    status: Literal["active", "disconnected"]
    created_at: datetime
    updated_at: datetime


class SourceStatusUpdate(APIModel):
    status: Literal["active", "disconnected"]


class ScanJobCreate(APIModel):
    source_id: str
    trigger: Literal["user", "schedule"] = "user"


class CompatibilityScanCreate(APIModel):
    """Dashboard-friendly scan request; a controlled source is created as needed."""

    account_id: str
    scope: Annotated[str, Field(min_length=1, max_length=50)] = "full"
    target: Annotated[str, Field(min_length=1, max_length=255)] = "controlled"


class ScanJobView(APIModel):
    id: str
    source_id: str
    trigger: Literal["user", "schedule"]
    status: Literal["queued", "running", "completed", "failed"]
    attempts: int
    imported_count: int
    duplicate_count: int
    finding_count: int
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class SignalInput(APIModel):
    external_id: Annotated[str, Field(min_length=1, max_length=255)]
    signal_type: SignalType
    occurred_at: datetime | None = None
    correlation_key: Annotated[str | None, Field(max_length=255)] = None
    features: dict = Field(default_factory=dict)

    @field_validator("features")
    @classmethod
    def reject_attachments(cls, features: dict) -> dict:
        lowered = {str(key).casefold() for key in features}
        forbidden = {"attachment", "attachments", "attachment_content", "raw_message"}
        if lowered & forbidden:
            raise ValueError("attachments and raw messages are outside the platform data boundary")
        return features

    @model_validator(mode="after")
    def validate_required_features(self) -> SignalInput:
        required: dict[str, tuple[str, ...]] = {
            "email": ("sender",),
            "forwarding": ("target",),
            "signin": (),
            "sign_in": (),
            "mfa": ("enabled",),
            "oauth_grant": ("app_name",),
        }
        missing = [key for key in required[self.signal_type] if key not in self.features]
        if missing:
            raise ValueError(f"missing required {self.signal_type} features: {', '.join(missing)}")
        string_fields = {
            "email": (
                "sender",
                "reply_to",
                "display_name",
                "subject",
                "body",
                "spf",
                "dkim",
                "dmarc",
            ),
            "forwarding": ("target", "account_domain"),
            "signin": ("source_ip", "source_country", "risk_level"),
            "sign_in": ("source_ip", "source_country", "risk_level"),
            "mfa": (),
            "oauth_grant": ("app_name", "app_id"),
        }
        boolean_fields = {
            "email": (),
            "forwarding": ("enabled", "external", "authorized"),
            "signin": ("new_device", "unusual", "impossible_travel", "success"),
            "sign_in": ("new_device", "unusual", "impossible_travel", "success"),
            "mfa": ("enabled",),
            "oauth_grant": ("verified", "broad_scope"),
        }
        list_fields = {
            "email": ("urls", "labels", "claimed_domains"),
            "forwarding": (),
            "signin": (),
            "sign_in": (),
            "mfa": (),
            "oauth_grant": ("scopes",),
        }
        additional_fields = {
            "email": {"authentication"},
            "mfa": {"method_count"},
        }
        allowed = (
            set(string_fields[self.signal_type])
            | set(boolean_fields[self.signal_type])
            | set(list_fields[self.signal_type])
            | additional_fields.get(self.signal_type, set())
        )
        if unexpected := set(self.features) - allowed:
            raise ValueError(
                f"unsupported {self.signal_type} features: {', '.join(sorted(unexpected))}"
            )
        for field in string_fields[self.signal_type]:
            if field in self.features and not isinstance(self.features[field], str):
                raise ValueError(f"{field} must be a string")
            if field in self.features:
                maximum = 100_000 if field == "body" else 2_048
                if len(self.features[field]) > maximum:
                    raise ValueError(f"{field} exceeds the {maximum}-character limit")
        for field in boolean_fields[self.signal_type]:
            if field in self.features and type(self.features[field]) is not bool:
                raise ValueError(f"{field} must be a boolean")
        list_limits = {"urls": 50, "labels": 50, "claimed_domains": 20, "scopes": 100}
        for field in list_fields[self.signal_type]:
            if field in self.features and (
                not isinstance(self.features[field], list)
                or any(not isinstance(item, str) for item in self.features[field])
            ):
                raise ValueError(f"{field} must be a list of strings")
            if field in self.features and (
                len(self.features[field]) > list_limits[field]
                or any(len(item) > 2_048 for item in self.features[field])
            ):
                raise ValueError(f"{field} exceeds the bounded input limit")
        if "authentication" in self.features and (
            not isinstance(self.features["authentication"], dict)
            or len(self.features["authentication"]) > 10
            or any(
                not isinstance(key, str)
                or not isinstance(value, str)
                or len(key) > 50
                or len(value) > 100
                for key, value in self.features["authentication"].items()
            )
        ):
            raise ValueError("authentication must map strings to strings")
        if self.signal_type == "mfa" and "method_count" in self.features:
            method_count = self.features["method_count"]
            if type(method_count) is not int or method_count < 0:
                raise ValueError("method_count must be a non-negative integer")
        return self


class SignalBatch(APIModel):
    scan_job_id: str | None = None
    signals: Annotated[list[SignalInput], Field(min_length=1, max_length=500)]


class IngestionItem(APIModel):
    external_id: str
    signal_id: str
    duplicate: bool
    finding_count: int
    incident_ids: list[str]


class IngestionResult(APIModel):
    imported_count: int
    duplicate_count: int
    finding_count: int
    items: list[IngestionItem]


class SignalView(APIModel):
    id: str
    account_id: str
    source_id: str
    external_id: str
    signal_type: str
    occurred_at: datetime
    received_at: datetime
    correlation_key: str
    features: dict


class FindingView(APIModel):
    id: str
    signal_id: str
    rule_code: str
    title: str
    evidence: dict
    weight: float
    confidence: float
    created_at: datetime


class ExplanationView(APIModel):
    source: Literal["template", "ai"]
    what_happened: str
    why_it_matters: str
    severity: str
    next_step: str


class RecommendationView(APIModel):
    position: int
    action: str
    advisory: bool


class AuditView(APIModel):
    id: str
    actor: str
    action: str
    from_status: str | None
    to_status: str | None
    detail: str
    created_at: datetime


class IncidentListItem(APIModel):
    id: str
    account_id: str
    correlation_key: str
    title: str
    summary: str
    score: float
    confidence: float
    severity: Severity
    status: IncidentStatus
    finding_count: int
    first_seen_at: datetime
    last_seen_at: datetime
    updated_at: datetime


class IncidentDetail(IncidentListItem):
    findings: list[FindingView]
    signals: list[SignalView]
    explanation: ExplanationView
    recommendations: list[RecommendationView]
    audit: list[AuditView]


class IncidentTransition(APIModel):
    status: IncidentStatus
    actor: Annotated[str, Field(min_length=1, max_length=200)] = "user"
    note: Annotated[str, Field(max_length=500)] = ""


class RuleView(APIModel):
    code: str
    signal_type: str
    title: str
    weight: float
    confidence: float
    enabled: bool
    configuration: dict
    version: int


class EvaluationCase(APIModel):
    case_id: str
    expected_suspicious: bool
    signal: SignalInput


class EvaluationRequest(APIModel):
    cases: Annotated[list[EvaluationCase], Field(min_length=1, max_length=1000)]
    threshold: Annotated[float, Field(ge=0.1, le=1.0)] = 0.3


class ConfusionMatrix(APIModel):
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int


class EvaluationResult(APIModel):
    total: int
    threshold: float
    confusion_matrix: ConfusionMatrix
    accuracy: float
    precision: float
    recall: float
    specificity: float
    f1_score: float
