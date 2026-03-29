#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"

DEMO_PROVIDER="${DEMO_PROVIDER:-deterministic}"
if [[ "${DEMO_PROVIDER}" == "deterministic" ]]; then
  DEMO_EXECUTION_MODE="${DEMO_EXECUTION_MODE:-deterministic}"
else
  DEMO_EXECUTION_MODE="${DEMO_EXECUTION_MODE:-provider}"
fi

./scripts/stop-stack.sh
./scripts/start-redis.sh
./scripts/start-paperclip.sh
./scripts/start-hermes.sh
./scripts/start-openclaw.sh
./scripts/start-control-plane.sh
WORKER_PROVIDER="${DEMO_PROVIDER}" WORKER_EXECUTION_MODE="${DEMO_EXECUTION_MODE}" ./scripts/start-worker.sh
./scripts/start-web.sh
DEMO_PROVIDER="${DEMO_PROVIDER}" DEMO_EXECUTION_MODE="${DEMO_EXECUTION_MODE}" pnpm demo
