#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
cd "$ROOT_DIR"

WEB_PORT="${WEB_PORT:-4173}"
LOG_DIR="${ROOT_DIR}/data/logs"

mkdir -p "$LOG_DIR"

if curl -fsS "http://localhost:${WEB_PORT}/" >/dev/null 2>&1; then
  echo "web already running on port ${WEB_PORT}"
  exit 0
fi

node "${ROOT_DIR}/scripts/daemonize.mjs" \
  --cwd "${ROOT_DIR}" \
  --log "${LOG_DIR}/web.log" \
  --pid "${LOG_DIR}/web.pid" \
  --health-url "http://localhost:${WEB_PORT}/" \
  --timeout-ms 60000 \
  -- \
  pnpm --filter @ultimate-system/web dev -- --host localhost --port "${WEB_PORT}"

echo "web started on port ${WEB_PORT}"
