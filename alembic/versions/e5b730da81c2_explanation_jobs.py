"""Queue explanations against template revisions, separately from collection."""

import sqlalchemy as sa

from alembic import op

revision = "e5b730da81c2"
down_revision = "d4a21b6e0c73"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "explanation_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(100), nullable=False),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id", ondelete="CASCADE")),
        sa.Column(
            "template_id",
            sa.String(36),
            sa.ForeignKey("incident_explanations.id", ondelete="CASCADE"),
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lease_id", sa.String(36)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("reason", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("incident_id", "template_id", name="uq_explanation_job_template"),
    )
    op.create_index(
        "ix_explanation_jobs_status_created", "explanation_jobs", ["status", "created_at"]
    )
    op.create_index("ix_explanation_jobs_tenant", "explanation_jobs", ["tenant_id"])


def downgrade():
    op.drop_table("explanation_jobs")
