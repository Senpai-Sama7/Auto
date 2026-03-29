#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
. "${ROOT_DIR}/scripts/resolve-hermes-runtime.sh"
HERMES_DIR="${ROOT_DIR}/.cache/upstreams/hermes-agent"
HERMES_HOME_DIR="${ROOT_DIR}/data/hermes-home"
HERMES_RUNTIME_HOME_DIR="${HERMES_HOME_DIR}/runtime-home"
HERMES_VENV_DIR="${HERMES_DIR}/.venv"
HERMES_LOG_DIR="${ROOT_DIR}/data/logs"
HERMES_PORT="${HERMES_API_PORT:-8642}"
HERMES_HOST="${HERMES_API_HOST:-127.0.0.1}"

mkdir -p "$HERMES_HOME_DIR" "$HERMES_RUNTIME_HOME_DIR" "$HERMES_LOG_DIR"

if [[ ! -d "$HERMES_DIR" ]]; then
  echo "Hermes upstream checkout is missing. Run ./scripts/setup.sh first." >&2
  exit 1
fi

if curl -fsS "http://${HERMES_HOST}:${HERMES_PORT}/health" >/dev/null 2>&1; then
  echo "hermes already running on port ${HERMES_PORT}"
  exit 0
fi

if [[ ! -x "${HERMES_VENV_DIR}/bin/python" ]]; then
  echo "Hermes virtualenv is missing. Run ./scripts/setup.sh first." >&2
  exit 1
fi

HERMES_RUNTIME_HOME="${HOME}"
if [[ "${HERMES_RESOLVED_PROVIDER}" == "anthropic" ]]; then
  HERMES_RUNTIME_HOME="${HERMES_RUNTIME_HOME_DIR}"
fi

cat > "${HERMES_HOME_DIR}/config.yaml" <<EOF
model:
  default: "${HERMES_RESOLVED_MODEL}"
  provider: "${HERMES_RESOLVED_PROVIDER}"
EOF

if [[ -n "${HERMES_RESOLVED_BASE_URL}" ]]; then
  cat >> "${HERMES_HOME_DIR}/config.yaml" <<EOF
  base_url: "${HERMES_RESOLVED_BASE_URL}"
EOF
fi

cat >> "${HERMES_HOME_DIR}/config.yaml" <<EOF
terminal:
  backend: "docker"
  cwd: "/workspace"
  timeout: 240
  lifetime_seconds: 600
  docker_image: "${TERMINAL_DOCKER_IMAGE:-nikolaik/python-nodejs:python3.11-nodejs20}"
  docker_mount_cwd_to_workspace: true
  container_cpu: 1
  container_memory: 4096
  container_disk: 8192
  container_persistent: false
platform_toolsets:
  api_server: []
EOF

env \
  HOME="${HERMES_RUNTIME_HOME}" \
  HERMES_HOME="${HERMES_HOME_DIR}" \
  HERMES_MODEL="${HERMES_RESOLVED_MODEL}" \
  HERMES_INFERENCE_PROVIDER="${HERMES_RESOLVED_PROVIDER}" \
  HERMES_MAX_ITERATIONS="${HERMES_MAX_ITERATIONS:-2}" \
  HERMES_HUMAN_DELAY_MODE=off \
  HERMES_EXEC_ASK=false \
  OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  OPENAI_BASE_URL="${HERMES_RESOLVED_BASE_URL:-${OPENAI_BASE_URL:-}}" \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  TWILIO_ACCOUNT_SID="" \
  TWILIO_AUTH_TOKEN="" \
  TWILIO_PHONE_NUMBER="" \
  API_SERVER_ENABLED=true \
  API_SERVER_KEY="${HERMES_API_KEY:-ultimate-system-hermes-dev-key}" \
  API_SERVER_HOST="${HERMES_HOST}" \
  API_SERVER_PORT="${HERMES_PORT}" \
  TERMINAL_ENV=docker \
  TERMINAL_DOCKER_IMAGE="${TERMINAL_DOCKER_IMAGE:-nikolaik/python-nodejs:python3.11-nodejs20}" \
  TERMINAL_DOCKER_MOUNT_CWD_TO_WORKSPACE=true \
  TERMINAL_CONTAINER_CPU=1 \
  TERMINAL_CONTAINER_MEMORY=4096 \
  TERMINAL_CONTAINER_DISK=8192 \
  TERMINAL_CONTAINER_PERSISTENT=false \
  node "${ROOT_DIR}/scripts/daemonize.mjs" \
    --cwd "${HERMES_DIR}" \
    --log "${HERMES_LOG_DIR}/hermes.log" \
    --pid "${HERMES_LOG_DIR}/hermes.pid" \
    --health-url "http://${HERMES_HOST}:${HERMES_PORT}/health" \
    --timeout-ms 120000 \
    -- \
    "${HERMES_VENV_DIR}/bin/python" -m gateway.run

echo "hermes started on ${HERMES_HOST}:${HERMES_PORT}"
