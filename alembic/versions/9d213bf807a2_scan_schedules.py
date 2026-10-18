"""Opt-in bounded schedules and durable worker leases."""

import sqlalchemy as sa

from alembic import op

revision = "9d213bf807a2"
down_revision = "76b18e25a901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scan_schedules",
        sa.Column("source_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("interval_minutes", sa.Integer(), nullable=False),
        sa.Column("maximum_messages", sa.Integer(), nullable=False),
        sa.Column("recent_days", sa.Integer(), nullable=False),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("lease_id", sa.String(36)),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.Column("last_job_id", sa.String(36)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["last_job_id"], ["scan_jobs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_scan_schedules_tenant_id", "scan_schedules", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("scan_schedules")
