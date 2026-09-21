"""Strict Pydantic contracts shared by the API and detection pipeline."""

import re
from email.utils import parseaddr
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

MAX_BODY_LENGTH = 100_000
MAX_URLS = 50

# This intentionally validates syntax only. Controlled fixtures may use reserved
# domains such as example.com and unknown.test, which must not trigger DNS checks.
EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)


class StrictModel(BaseModel):
    """Base contract that rejects undocumented fields and trims strings."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MessageInput(StrictModel):
    """Normalised subset of an email needed by the current detection rules."""

    sender: Annotated[str, Field(min_length=3, max_length=320)]
    display_name: Annotated[str, Field(max_length=200)] = ""
    reply_to: Annotated[str, Field(min_length=3, max_length=320)] | None = None
    subject: Annotated[str, Field(max_length=998)] = ""
    body: Annotated[str, Field(max_length=MAX_BODY_LENGTH)] = ""
    urls: Annotated[list[HttpUrl], Field(max_length=MAX_URLS)] = Field(default_factory=list)

    @field_validator("sender", "reply_to")
    @classmethod
    def validate_mailbox(cls, value: str | None) -> str | None:
        """Reject malformed addresses and newline-based header injection."""

        if value is None:
            return None
        if "\r" in value or "\n" in value:
            raise ValueError("email addresses must not contain newlines")

        _, address = parseaddr(value, strict=True)
        if not address or not EMAIL_PATTERN.fullmatch(address):
            raise ValueError("must contain a valid email address")

        # parseaddr is intentionally permissive. Accept only a bare address or
        # one conventional display-name form so trailing text cannot disappear
        # during parsing and silently pass validation.
        bracketed_address = f"<{address}>"
        is_bare = value == address
        is_named = value.endswith(bracketed_address) and not any(
            character in value[: -len(bracketed_address)] for character in "<>"
        )
        if not (is_bare or is_named):
            raise ValueError("must contain exactly one email address")
        return value

    @field_validator("urls")
    @classmethod
    def reject_url_credentials(cls, urls: list[HttpUrl]) -> list[HttpUrl]:
        """Prevent embedded credentials from being accepted or later displayed."""

        if any(url.username is not None or url.password is not None for url in urls):
            raise ValueError("URLs must not contain embedded credentials")
        return urls


class Finding(StrictModel):
    """One transparent reason why a message's risk score changed."""

    rule_id: Annotated[str, Field(pattern=r"^[A-Z]+-\d{3}$")]
    title: Annotated[str, Field(min_length=1, max_length=200)]
    evidence: Annotated[str, Field(min_length=1, max_length=1_000)]
    weight: Annotated[int, Field(ge=0, le=100)]


class AnalysisResult(StrictModel):
    """Complete response returned by the controlled analysis endpoint."""

    score: Annotated[int, Field(ge=0, le=100)]
    severity: Literal["low", "medium", "high", "critical"]
    findings: Annotated[list[Finding], Field(max_length=50)]
    explanation: Annotated[str, Field(min_length=1, max_length=2_000)]
    recommended_actions: Annotated[list[str], Field(min_length=1, max_length=20)]
