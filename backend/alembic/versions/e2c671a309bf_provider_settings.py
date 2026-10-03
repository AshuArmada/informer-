"""Store encrypted provider configuration from the Settings UI."""
from alembic import op
import sqlalchemy as sa

revision = "e2c671a309bf"
down_revision = "34b5f8ad49fa"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("provider_settings", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("encrypted_payload", sa.Text(), nullable=False))


def downgrade():
    op.drop_table("provider_settings")
