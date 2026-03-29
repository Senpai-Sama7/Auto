#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
REDIS_PORT="${REDIS_PORT:-6380}"
REDIS_DATA_DIR="${ROOT_DIR}/data/redis"
REDIS_PID_FILE="${REDIS_DATA_DIR}/redis.pid"
REDIS_LOG_FILE="${REDIS_DATA_DIR}/redis.log"

mkdir -p "$REDIS_DATA_DIR"

if command -v redis-cli >/dev/null 2>&1 && redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then
  echo "redis already running on port ${REDIS_PORT}"
  exit 0
fi

if command -v redis-server >/dev/null 2>&1; then
  redis-server \
    --port "$REDIS_PORT" \
    --dir "$REDIS_DATA_DIR" \
    --dbfilename queue.rdb \
    --save '' \
    --appendonly no \
    --daemonize yes \
    --pidfile "$REDIS_PID_FILE" \
    --logfile "$REDIS_LOG_FILE"
  echo "started redis-server on port ${REDIS_PORT}"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Neither redis-server nor docker is available for queue startup." >&2
  exit 1
fi

docker rm -f ultimate-system-redis >/dev/null 2>&1 || true
docker run -d \
  --name ultimate-system-redis \
  -p "${REDIS_PORT}:6379" \
  redis:7-alpine >/dev/null
echo "started redis container on port ${REDIS_PORT}"
