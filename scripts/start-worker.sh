#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_WORKER_PROVIDER="${WORKER_PROVIDER:-}"
CALLER_WORKER_EXECUTION_MODE="${WORKER_EXECUTION_MODE:-}"
CALLER_WORKER_ID="${WORKER_ID:-}"
CALLER_WORKER_NAME="${WORKER_NAME:-}"
CALLER_WORKER_CAPABILITIES="${WORKER_CAPABILITIES:-}"
CALLER_WORKER_VERIFICATION_BACKEND="${WORKER_VERIFICATION_BACKEND:-}"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
if [[ -n "${CALLER_WORKER_PROVIDER}" ]]; then
  export WORKER_PROVIDER="${CALLER_WORKER_PROVIDER}"
fi
if [[ -n "${CALLER_WORKER_EXECUTION_MODE}" ]]; then
  export WORKER_EXECUTION_MODE="${CALLER_WORKER_EXECUTION_MODE}"
fi
if [[ -n "${CALLER_WORKER_ID}" ]]; then
  export WORKER_ID="${CALLER_WORKER_ID}"
fi
if [[ -n "${CALLER_WORKER_NAME}" ]]; then
  export WORKER_NAME="${CALLER_WORKER_NAME}"
fi
if [[ -n "${CALLER_WORKER_CAPABILITIES}" ]]; then
  export WORKER_CAPABILITIES="${CALLER_WORKER_CAPABILITIES}"
fi
if [[ -n "${CALLER_WORKER_VERIFICATION_BACKEND}" ]]; then
  export WORKER_VERIFICATION_BACKEND="${CALLER_WORKER_VERIFICATION_BACKEND}"
fi
if [[ "${WORKER_PROVIDER:-deterministic}" == "hermes" ]]; then
  . "${ROOT_DIR}/scripts/resolve-hermes-runtime.sh"
  export HERMES_MODEL="${HERMES_RESOLVED_MODEL}"
fi
cd "$ROOT_DIR"

LOG_DIR="${ROOT_DIR}/data/logs"
WORKER_ID="${WORKER_ID:-worker-runtime-local}"
DB_PATH="${ULTIMATE_SYSTEM_DB_PATH:-${ROOT_DIR}/data/ultimate-system.db}"
export WORKER_ID

mkdir -p "$LOG_DIR"

if [[ -f "${LOG_DIR}/worker.pid" ]]; then
  CURRENT_PID="$(cat "${LOG_DIR}/worker.pid" 2>/dev/null || true)"
  if [[ -n "$CURRENT_PID" ]] && kill -0 "$CURRENT_PID" >/dev/null 2>&1; then
    echo "worker already running as pid ${CURRENT_PID}"
    exit 0
  fi
fi

node "${ROOT_DIR}/scripts/daemonize.mjs" \
  --cwd "${ROOT_DIR}" \
  --log "${LOG_DIR}/worker.log" \
  --pid "${LOG_DIR}/worker.pid" \
  --timeout-ms 10000 \
  -- \
  pnpm --filter @ultimate-system/worker dev

node "${ROOT_DIR}/scripts/wait-for-worker.mjs" "$WORKER_ID" "$DB_PATH"

echo "worker started with id ${WORKER_ID}"
