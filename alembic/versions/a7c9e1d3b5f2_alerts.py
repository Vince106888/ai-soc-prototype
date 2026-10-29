"""In-app, email and webhook alerts for high-severity incidents."""

import sqlalchemy as sa

from alembic import op

revision = "a7c9e1d3b5f2"
down_revision = "e5b730da81c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "alert_settings",
        sa.Column("tenant_id", sa.String(100), primary_key=True),
        sa.Column("minimum_severity", sa.String(20), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), nullable=False),
        sa.Column("email_to", sa.String(254)),
        sa.Column("webhook_enabled", sa.Boolean(), nullable=False),
        sa.Column("webhook_url", sa.String(500)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("incident_id", sa.String(36), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("rule_codes", sa.String(300), nullable=False),
        sa.Column("email_status", sa.String(12), nullable=False),
        sa.Column("webhook_status", sa.String(12), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("incident_id", "severity", name="uq_alerts_incident_severity"),
    )
    op.create_index("ix_alerts_tenant_created", "alerts", ["tenant_id", "created_at"])


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("alert_settings")
