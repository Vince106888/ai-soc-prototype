"""Database configuration for the persistent SentinelSME platform.

SQLite is intentionally the zero-configuration development default.  The ORM
uses portable SQLAlchemy types so the same models can be migrated to
PostgreSQL by setting ``AI_SOC_DATABASE_URL``.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Declarative base shared by every platform table."""


DEFAULT_DATABASE_PATH = Path("data") / "sentinelsme.db"


def _database_url() -> str:
    configured = os.getenv("AI_SOC_DATABASE_URL")
    if configured:
        return configured
    DEFAULT_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"


def _make_engine(url: str) -> Engine:
    options = {"check_same_thread": False} if url.startswith("sqlite") else {}
    created = create_engine(url, connect_args=options, pool_pre_ping=True)
    if url.startswith("sqlite"):

        @event.listens_for(created, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return created


engine = _make_engine(_database_url())
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def configure_database(url: str) -> None:
    """Rebind sessions to a database URL (primarily useful for isolated tests)."""

    global engine
    engine.dispose()
    engine = _make_engine(url)
    SessionLocal.configure(bind=engine)


def create_schema() -> None:
    """Create tables for local/demo operation; deployments should use Alembic."""

    from . import entities  # noqa: F401 -- registers mapped classes

    Base.metadata.create_all(engine)


def get_session() -> Generator[Session]:
    """Yield one transaction-capable request session."""

    create_schema()
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
