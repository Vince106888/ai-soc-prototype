"""Atomic shared-database request budgets and bounded private workspaces."""

import hashlib
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .entities import RequestBudget

REQUEST_LIMITS = {"read": 120, "write": 30, "collection": 6, "explanation": 3}


def consume(db: Session, user_id: str, tenant_id: str, method: str, path: str) -> None:
    scope = "read" if method in {"GET", "HEAD", "OPTIONS"} else "write"
    if method not in {"GET", "HEAD", "OPTIONS"}:
        if path.endswith("/explanation"):
            scope = "explanation"
        elif path.endswith(("/signals", "/scan", "/email-analysis")):
            scope = "collection"
    now = datetime.now(UTC)
    minute = int(now.timestamp()) // 60
    key = hashlib.sha256(f"{user_id}:{scope}:{minute}".encode()).hexdigest()
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    db.execute(delete(RequestBudget).where(RequestBudget.expires_at <= now))
    statement = insert(RequestBudget).values(
        key=key,
        tenant_id=tenant_id,
        count=1,
        expires_at=datetime.fromtimestamp((minute + 2) * 60, UTC),
    )
    count = db.scalar(
        statement.on_conflict_do_update(
            index_elements=[RequestBudget.key],
            set_={"count": RequestBudget.count + 1},
        ).returning(RequestBudget.count)
    )
    db.commit()  # Failed application requests still consume their abuse budget.
    if count > REQUEST_LIMITS[scope]:
        raise HTTPException(
            429,
            "Request limit reached. Try again shortly.",
            headers={"Retry-After": str(60 - int(now.timestamp()) % 60)},
        )
