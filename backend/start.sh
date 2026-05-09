#!/bin/bash

# Exit on error
set -e

# Run migrations (ensure DB is up to date before starting)
# Note: If build.sh already runs this, it's redundant but safe.
# Render Build Command might run it, but running here ensures it happens on deploy.
# If build.sh runs it, we can comment it out here.
# Run migrations on startup
# alembic upgrade head 

# Run data correction scripts
echo "Running data correction scripts..."
python scripts/fix_missing_plan_items.py || true

# Start Uvicorn with explicit host and port
# Render sets PORT environment variable.
echo "Starting Uvicorn on 0.0.0.0:${PORT:-10000}"
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}
