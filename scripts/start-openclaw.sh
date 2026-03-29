#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"

OPENCLAW_DIR="${ROOT_DIR}/.cache/upstreams/openclaw"
OPENCLAW_HOME_PATH="${OPENCLAW_HOME_DIR:-./data/openclaw-home}"
OPENCLAW_LOG_DIR="${ROOT_DIR}/data/logs"
OPENCLAW_HOST="${OPENCLAW_GATEWAY_HOST:-127.0.0.1}"
OPENCLAW_PORT="${OPENCLAW_GATEWAY_PORT:-28789}"
OPENCLAW_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-ultimate-system-openclaw-dev-key}"
OPENCLAW_URL="${OPENCLAW_GATEWAY_URL:-ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}}"
OPENCLAW_HEALTH_URL="${OPENCLAW_HEALTH_URL:-http://${OPENCLAW_HOST}:${OPENCLAW_PORT}/healthz}"
OPENCLAW_AGENT="${OPENCLAW_AGENT_ID:-ultimate-system}"

normalize_model_ref() {
  local raw="${1:-}"
  if [[ -z "$raw" ]]; then
    echo "openai/gpt-4o-mini"
    return
  fi
  if [[ "$raw" == */* ]]; then
    echo "$raw"
    return
  fi
  echo "openai/$raw"
}

OPENCLAW_MODEL="$(normalize_model_ref "${OPENCLAW_AGENT_MODEL:-${OPENAI_MODEL:-}}")"

if [[ "${OPENCLAW_HOME_PATH}" = /* ]]; then
  OPENCLAW_HOME="${OPENCLAW_HOME_PATH}"
else
  OPENCLAW_HOME="${ROOT_DIR}/${OPENCLAW_HOME_PATH#./}"
fi

mkdir -p "$OPENCLAW_HOME" "$OPENCLAW_LOG_DIR"

if [[ ! -d "$OPENCLAW_DIR" ]]; then
  echo "OpenClaw upstream checkout is missing. Run ./scripts/setup.sh first." >&2
  exit 1
fi

if [[ ! -f "${OPENCLAW_DIR}/dist/entry.js" && ! -f "${OPENCLAW_DIR}/dist/entry.mjs" ]]; then
  echo "OpenClaw build output is missing. Run ./scripts/setup.sh first." >&2
  exit 1
fi

openclaw_env() {
  env \
    OPENCLAW_HOME="${OPENCLAW_HOME}" \
    OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_TOKEN}" \
    OPENCLAW_GATEWAY_URL="${OPENCLAW_URL}" \
    OPENCLAW_SKIP_CHANNELS=1 \
    "$@"
}

if curl -fsS "${OPENCLAW_HEALTH_URL}" >/dev/null 2>&1; then
  echo "openclaw already running on ${OPENCLAW_URL}"
else
  openclaw_env node "${ROOT_DIR}/scripts/daemonize.mjs" \
    --cwd "${OPENCLAW_DIR}" \
    --log "${OPENCLAW_LOG_DIR}/openclaw.log" \
    --pid "${OPENCLAW_LOG_DIR}/openclaw.pid" \
    --timeout-ms 5000 \
    -- \
    node "${OPENCLAW_DIR}/openclaw.mjs" gateway run \
      --allow-unconfigured \
      --dev \
      --force \
      --bind loopback \
      --port "${OPENCLAW_PORT}" \
      --token "${OPENCLAW_TOKEN}"

  ATTEMPT=0
  until curl -fsS "${OPENCLAW_HEALTH_URL}" >/dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1))
    if (( ATTEMPT > 60 )); then
      echo "Timed out waiting for OpenClaw gateway on ${OPENCLAW_HEALTH_URL}" >&2
      exit 1
    fi
    sleep 1
  done
fi

openclaw_env node "${ROOT_DIR}/scripts/ensure-openclaw-agent.mjs" \
  "${ROOT_DIR}" \
  "${OPENCLAW_DIR}" \
  "${OPENCLAW_AGENT}" \
  "${OPENCLAW_MODEL}"

echo "openclaw started on ${OPENCLAW_URL} with agent ${OPENCLAW_AGENT}"
