#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🧪 Testing Unified Server..."
echo "============================"
echo ""

# Build web dashboard
echo "📦 Building web dashboard..."
pnpm --filter @ultimate-system/web build > /dev/null 2>&1

# Build unified server
echo "📦 Building unified server..."
pnpm --filter @ultimate-system/unified build > /dev/null 2>&1

# Start control plane in background
echo "🚀 Starting control plane on port 4100..."
pnpm --filter @ultimate-system/control-plane dev > /dev/null 2>&1 &
CONTROL_PLANE_PID=$!

# Wait for control plane to start
sleep 3

# Start unified server
echo "🚀 Starting unified server on port 8888..."
pnpm --filter @ultimate-system/unified dev > /dev/null 2>&1 &
UNIFIED_PID=$!

# Wait for unified server to start
sleep 3

# Test health endpoint
echo ""
echo "🔍 Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/health 2>/dev/null || echo "000")

if [ "$HEALTH_RESPONSE" = "200" ]; then
  echo "✅ Health endpoint: OK (HTTP $HEALTH_RESPONSE)"
else
  echo "❌ Health endpoint: FAILED (HTTP $HEALTH_RESPONSE)"
fi

# Test API proxy
echo "🔍 Testing API proxy..."
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/api/health 2>/dev/null || echo "000")

if [ "$API_RESPONSE" = "200" ]; then
  echo "✅ API proxy: OK (HTTP $API_RESPONSE)"
else
  echo "❌ API proxy: FAILED (HTTP $API_RESPONSE)"
fi

# Test static files
echo "🔍 Testing static files..."
STATIC_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/ 2>/dev/null || echo "000")

if [ "$STATIC_RESPONSE" = "200" ]; then
  echo "✅ Static files: OK (HTTP $STATIC_RESPONSE)"
else
  echo "❌ Static files: FAILED (HTTP $STATIC_RESPONSE)"
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $UNIFIED_PID 2>/dev/null || true
kill $CONTROL_PLANE_PID 2>/dev/null || true

echo ""
echo "============================================"
echo "✅ Unified server test complete!"
echo "   Access the system at: http://localhost:8888"