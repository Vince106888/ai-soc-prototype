"""Separate app identities, hashed sessions and single-use login attempts."""

import sqlalchemy as sa

from alembic import op

revision = "76b18e25a901"
down_revision = "8ca421a4d701"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("google_subject", sa.String(255), nullable=False, unique=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("tenant_id", sa.String(100), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "app_sessions",
        sa.Column("token_digest", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("csrf_digest", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["app_users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_app_sessions_expires_at", "app_sessions", ["expires_at"])
    op.create_table(
        "login_attempts",
        sa.Column("state_digest", sa.String(64), primary_key=True),
        sa.Column("cookie_digest", sa.String(64), nullable=False),
        sa.Column("encrypted_parameters", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_login_attempts_expires_at", "login_attempts", ["expires_at"])


def downgrade() -> None:
    op.drop_table("login_attempts")
    op.drop_table("app_sessions")
    op.drop_table("app_users")
