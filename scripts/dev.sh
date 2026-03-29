#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
. "${ROOT_DIR}/scripts/resolve-hermes-runtime.sh"
export HERMES_MODEL="${HERMES_RESOLVED_MODEL}"

./scripts/start-redis.sh
./scripts/start-paperclip.sh
./scripts/start-hermes.sh
./scripts/start-openclaw.sh
pnpm dev
