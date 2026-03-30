#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Building web dashboard..."
pnpm --filter @ultimate-system/web build

# For Vercel deployment: copy dist to root if on Vercel
if [ "$VERCEL" = "1" ]; then
  echo "Detected Vercel environment..."
  mkdir -p dist
  cp -r apps/web/dist/* dist/
  echo "Output copied to root dist/ for Vercel"
fi

echo ""
echo "Web dashboard built successfully"
echo "   Location: apps/web/dist"