#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-4100}"
LOG_DIR="${ROOT_DIR}/data/logs"

mkdir -p "$LOG_DIR"

if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
  echo "control-plane already running on port ${API_PORT}"
  exit 0
fi

node "${ROOT_DIR}/scripts/daemonize.mjs" \
  --cwd "${ROOT_DIR}" \
  --log "${LOG_DIR}/control-plane.log" \
  --pid "${LOG_DIR}/control-plane.pid" \
  --health-url "http://127.0.0.1:${API_PORT}/api/health" \
  --timeout-ms 60000 \
  -- \
  pnpm --filter @ultimate-system/control-plane dev

echo "control-plane started on port ${API_PORT}"
