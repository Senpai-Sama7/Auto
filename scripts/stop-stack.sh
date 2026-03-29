#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

kill_pattern() {
  local pattern="${1:-}"
  [[ -n "$pattern" ]] || return 0

  local pids
  pids="$(pgrep -f -- "$pattern" 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill -- "-$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"

  sleep 1

  local survivors
  survivors="$(pgrep -f -- "$pattern" 2>/dev/null || true)"
  if [[ -n "$survivors" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] || continue
      kill -9 -- "-$pid" 2>/dev/null || true
      kill -9 "$pid" 2>/dev/null || true
    done <<< "$survivors"
  fi
}

cleanup_pidfile() {
  local pidfile="${1:-}"
  [[ -n "$pidfile" ]] || return 0
  rm -f "$pidfile"
}

kill_listeners() {
  local port
  for port in "$@"; do
    local pids
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN -nP 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      while IFS= read -r pid; do
        [[ -n "$pid" ]] || continue
        kill -- "-$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
      done <<< "$pids"
    fi
  done
}

pkill -f 'tsx scripts/demo.ts' 2>/dev/null || true
kill_pattern 'tsx scripts/demo.ts'
kill_pattern 'pnpm --filter @ultimate-system/worker dev'
kill_pattern 'pnpm --filter @ultimate-system/control-plane dev'
kill_pattern 'pnpm --filter @ultimate-system/web dev'
kill_pattern 'apps/worker.*tsx src/index.ts'
kill_pattern "${ROOT_DIR}/node_modules/.*/tsx/dist/cli.mjs src/index.ts"
kill_pattern "${ROOT_DIR}/node_modules/.*/tsx/dist/preflight.cjs .*loader.mjs src/index.ts"
kill_pattern 'apps/control-plane.*tsx src/server.ts'
kill_pattern "${ROOT_DIR}/node_modules/.*/tsx/dist/cli.mjs src/server.ts"
kill_pattern "${ROOT_DIR}/node_modules/.*/tsx/dist/preflight.cjs .*loader.mjs src/server.ts"
kill_pattern 'apps/web.*vite'
kill_pattern "${ROOT_DIR}/node_modules/.*/vite/bin/vite.js.*--port"
kill_pattern 'gateway.run'
kill_pattern 'openclaw.mjs gateway'
kill_pattern 'openclaw gateway'
kill_pattern '@paperclipai/server dev'
kill_pattern 'paperclip/server/.*/tsx/dist/cli.mjs src/index.ts'
kill_pattern 'redis-server .*6380'

sleep 2

kill_listeners 3100 4100 4173 6380 8642 28789

sleep 2

cleanup_pidfile "${ROOT_DIR}/data/logs/worker.pid"
cleanup_pidfile "${ROOT_DIR}/data/logs/control-plane.pid"
cleanup_pidfile "${ROOT_DIR}/data/logs/web.pid"
cleanup_pidfile "${ROOT_DIR}/data/logs/hermes.pid"
cleanup_pidfile "${ROOT_DIR}/data/logs/openclaw.pid"
cleanup_pidfile "${ROOT_DIR}/data/logs/paperclip.pid"
cleanup_pidfile "${ROOT_DIR}/data/redis/redis.pid"

echo "stack stopped"
