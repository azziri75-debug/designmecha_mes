"""manual_hr_columns_sql

Revision ID: b1d7d5f8a9e2
Revises: 4bd8cb559139, bc1076f7ea2f
Create Date: 2026-03-06 00:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1d7d5f8a9e2'
down_revision: Union[str, Sequence[str], None] = ('4bd8cb559139', 'bc1076f7ea2f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns with IF NOT EXISTS (PostgreSQL syntax)
    op.execute("ALTER TABLE staff ADD COLUMN IF NOT EXISTS mac_address VARCHAR;")
    op.execute("ALTER TABLE staff ADD COLUMN IF NOT EXISTS ip_address VARCHAR;")
    
    op.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS grace_period_start_mins INTEGER DEFAULT 0;")
    op.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS grace_period_end_mins INTEGER DEFAULT 0;")
    
    op.execute("ALTER TABLE employee_time_records ADD COLUMN IF NOT EXISTS clock_in_time TIMESTAMP;")
    op.execute("ALTER TABLE employee_time_records ADD COLUMN IF NOT EXISTS clock_out_time TIMESTAMP;")
    op.execute("ALTER TABLE employee_time_records ADD COLUMN IF NOT EXISTS record_source VARCHAR;")
    op.execute("ALTER TABLE employee_time_records ADD COLUMN IF NOT EXISTS attendance_status VARCHAR;")
    
    # 2. Create attendance_logs table if not exists
    op.execute("""
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id SERIAL PRIMARY KEY,
            staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
            log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            log_type VARCHAR NOT NULL
        );
    """)


def downgrade() -> None:
    pass
