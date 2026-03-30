#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🏗️  Building web dashboard..."
pnpm --filter @ultimate-system/web build

echo ""
echo "✅ Web dashboard built successfully"
echo "   Location: apps/web/dist"