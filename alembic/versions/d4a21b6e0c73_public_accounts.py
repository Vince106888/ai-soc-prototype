"""Public account access state and bounded per-workspace request budgets."""

import sqlalchemy as sa

from alembic import op

revision = "d4a21b6e0c73"
down_revision = "c3f1a7d2e9b4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "app_users", sa.Column("status", sa.String(20), server_default="active", nullable=False)
    )
    op.create_table(
        "request_budgets",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_request_budgets_expires", "request_budgets", ["expires_at"])
    op.create_index("ix_request_budgets_tenant", "request_budgets", ["tenant_id"])


def downgrade():
    op.drop_table("request_budgets")
    op.drop_column("app_users", "status")
