#!/bin/bash
# Quick Production Deploy Script
# Usage: ./scripts/deploy-vercel.sh

set -e

echo "🚀 Ultimate System - Vercel Production Deploy"
echo "=============================================="
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if logged in
echo "🔍 Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "⚠️  Not logged in to Vercel. Please login:"
    vercel login
fi

echo "✅ Authenticated as: $(vercel whoami)"
echo ""

# Check if project is linked
if [ ! -f ".vercel/project.json" ]; then
    echo "🔗 Linking project to Vercel..."
    vercel link
fi

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🔨 Building project..."
pnpm --filter @ultimate-system/web build

echo ""
echo "🚀 Deploying to production..."
echo "=============================================="
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variable in Vercel Dashboard:"
echo "   VITE_API_BASE_URL=https://your-api-url.com"
echo ""
echo "2. Configure CORS in your control plane .env:"
echo "   AUTH_ORIGINS=https://$(vercel inspect --timeout=1 2>/dev/null | grep -o 'https://[^[:space:]]*' | head -1),http://localhost:4173"
echo ""
echo "3. Test the deployment:"
echo "   ./scripts/health-check.sh https://your-vercel-url.vercel.app"