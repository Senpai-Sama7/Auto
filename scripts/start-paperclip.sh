#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
PAPERCLIP_DIR="${ROOT_DIR}/.cache/upstreams/paperclip"
PAPERCLIP_HOME_DIR="${PAPERCLIP_HOME_DIR:-${ROOT_DIR}/data/paperclip-home-state-v2}"
PAPERCLIP_PORT="${PAPERCLIP_PORT:-3100}"
PAPERCLIP_LOG_DIR="${ROOT_DIR}/data/logs"

mkdir -p "$PAPERCLIP_HOME_DIR" "$PAPERCLIP_LOG_DIR"

if [[ ! -d "$PAPERCLIP_DIR" ]]; then
  echo "Paperclip upstream checkout is missing. Run ./scripts/setup.sh first." >&2
  exit 1
fi

if [[ ! -f "${PAPERCLIP_DIR}/packages/plugins/sdk/dist/index.js" ]]; then
  (
    cd "$PAPERCLIP_DIR"
    pnpm --filter @paperclipai/server... build >> "${PAPERCLIP_LOG_DIR}/paperclip-build.log" 2>&1
  )
fi

if curl -fsS "http://127.0.0.1:${PAPERCLIP_PORT}/api/health" >/dev/null 2>&1; then
  echo "paperclip already running on port ${PAPERCLIP_PORT}"
  exit 0
fi

env \
  -u DATABASE_URL \
  -u PGDATABASE \
  -u PGHOST \
  -u PGHOSTADDR \
  -u PGHOST_UNPOOLED \
  -u PGPASSWORD \
  -u PGPORT \
  -u PGUSER \
  -u PGSSLMODE \
  -u POSTGRES_URL \
  -u POSTGRES_PRISMA_URL \
  -u POSTGRES_URL_NON_POOLING \
  HOST=127.0.0.1 \
  PORT="${PAPERCLIP_PORT}" \
  PAPERCLIP_HOME="${PAPERCLIP_HOME_DIR}" \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_DEPLOYMENT_MODE=local_trusted \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  PAPERCLIP_PUBLIC_URL="http://127.0.0.1:${PAPERCLIP_PORT}" \
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-ultimate-system-paperclip-dev-secret}" \
  node "${ROOT_DIR}/scripts/daemonize.mjs" \
    --cwd "${PAPERCLIP_DIR}" \
    --log "${PAPERCLIP_LOG_DIR}/paperclip.log" \
    --pid "${PAPERCLIP_LOG_DIR}/paperclip.pid" \
    --health-url "http://127.0.0.1:${PAPERCLIP_PORT}/api/health" \
    --timeout-ms 120000 \
    -- \
    pnpm dev:server

echo "paperclip started on port ${PAPERCLIP_PORT}"
