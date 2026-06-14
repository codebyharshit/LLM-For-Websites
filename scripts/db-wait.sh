#!/usr/bin/env bash
# Wait until the local Postgres container is accepting connections.
# Usage: scripts/db-wait.sh [container] [timeout-seconds]
set -euo pipefail

CONTAINER="${1:-supportrag-postgres}"
TIMEOUT="${2:-60}"
elapsed=0

echo "Waiting for Postgres in container '$CONTAINER' (timeout ${TIMEOUT}s)..."
until docker exec "$CONTAINER" pg_isready -U app -d supportrag >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "Postgres did not become ready within ${TIMEOUT}s" >&2
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

echo "Postgres is ready."
