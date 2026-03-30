#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
. "${ROOT_DIR}/scripts/resolve-hermes-runtime.sh"
export HERMES_MODEL="${HERMES_RESOLVED_MODEL}"

echo "🚀 Starting Ultimate System (Unified Mode)"
echo "=========================================="
echo ""

# Start backend services
echo "📦 Starting Redis..."
./scripts/start-redis.sh &

echo "📄 Starting Paperclip..."
./scripts/start-paperclip.sh &

echo "🤖 Starting Hermes..."
./scripts/start-hermes.sh &

echo "🔧 Starting OpenClaw..."
./scripts/start-openclaw.sh &

# Wait a moment for services to initialize
sleep 3

echo ""
echo "✨ Starting unified server on port 8888..."
echo "   Dashboard: http://localhost:8888"
echo "   API:       http://localhost:8888/api"
echo ""

# Start the unified server
pnpm --filter @ultimate-system/unified dev