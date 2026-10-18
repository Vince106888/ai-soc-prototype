"""Add encrypted Gmail credentials and short-lived OAuth attempts."""

import sqlalchemy as sa

from alembic import op

revision = "8ca421a4d701"
down_revision = "faf53a6f2686"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("delete_after", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "oauth_credentials",
        sa.Column("source_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("encrypted_tokens", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_oauth_credentials_tenant_id", "oauth_credentials", ["tenant_id"])
    op.create_table(
        "oauth_attempts",
        sa.Column("state_digest", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("cookie_digest", sa.String(64), nullable=False),
        sa.Column("encrypted_verifier", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("oauth_attempts")
    op.drop_index("ix_oauth_credentials_tenant_id", table_name="oauth_credentials")
    op.drop_table("oauth_credentials")
    op.drop_column("accounts", "delete_after")
