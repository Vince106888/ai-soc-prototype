"""Trusted senders, hashed sender history and trust-aware rule versions."""

import json

import sqlalchemy as sa

from alembic import op

revision = "c3f1a7d2e9b4"
down_revision = "9d213bf807a2"
branch_labels = None
depends_on = None

# Rules whose content-only indicators a trusted, authenticated sender silences.
TRUST_AWARE = ("EMAIL-001", "EMAIL-002", "URL-001", "URL-002")


def upgrade() -> None:
    op.create_table(
        "trusted_senders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("value", sa.String(320), nullable=False),
        sa.Column("note", sa.String(200), nullable=False),
        sa.Column("created_by", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("tenant_id", "kind", "value", name="uq_trusted_sender_value"),
    )
    op.create_index("ix_trusted_senders_tenant", "trusted_senders", ["tenant_id"])
    op.create_table(
        "sender_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("account_id", sa.String(36), nullable=False),
        sa.Column("sender_digest", sa.String(64), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("account_id", "sender_digest", name="uq_sender_history_account"),
    )
    op.create_index("ix_sender_history_tenant_id", "sender_history", ["tenant_id"])

    # Existing databases keep their seeded rules, so mark the trust-aware ones as
    # version 2. Operator imports cannot overwrite these codes, so a version-1 row
    # is the original default; any other version is left untouched.
    rules = sa.table(
        "detection_rules",
        sa.column("code", sa.String),
        sa.column("configuration", sa.JSON),
        sa.column("version", sa.Integer),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(rules.c.code, rules.c.configuration, rules.c.version).where(
            rules.c.code.in_(TRUST_AWARE)
        )
    ).all()
    for code, configuration, version in rows:
        if version != 1:
            continue
        config = (
            json.loads(configuration) if isinstance(configuration, str) else dict(configuration)
        )
        config["suppress_if"] = ["trusted_sender"]
        connection.execute(
            rules.update().where(rules.c.code == code).values(configuration=config, version=2)
        )


def downgrade() -> None:
    op.drop_table("sender_history")
    op.drop_table("trusted_senders")
