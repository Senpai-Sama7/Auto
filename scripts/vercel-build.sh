#!/bin/bash
# Vercel Build Script with Debugging
# This script ensures the dist directory is created and verified

set -e

echo "=== VERCEL BUILD DEBUG ==="
echo "Current directory: $(pwd)"
echo "VERCEL env: $VERCEL"
echo "VERCEL_URL: $VERCEL_URL"
echo ""

# Step 1: Build the web app
echo "Step 1: Building web app..."
cd apps/web

# Debug: Check if node_modules exist
if [ ! -d "node_modules" ]; then
    echo "ERROR: node_modules not found in apps/web"
    exit 1
fi

# Build with explicit output
echo "Running: pnpm build"
pnpm build

# Step 2: Verify build output
echo ""
echo "Step 2: Verifying build output..."
if [ ! -d "dist" ]; then
    echo "ERROR: dist directory not created in apps/web"
    ls -la
    exit 1
fi

echo "✓ dist directory exists in apps/web"
ls -la dist/

# Step 3: Copy to root dist (critical for Vercel)
echo ""
echo "Step 3: Copying to root dist..."
cd ../..

# Remove old dist if exists
rm -rf dist

# Create fresh dist directory
mkdir -p dist

# Copy all files from apps/web/dist to root dist
cp -r apps/web/dist/* dist/

echo "✓ Copied to root dist"
ls -la dist/

# Step 4: Final verification
echo ""
echo "Step 4: Final verification..."
if [ ! -f "dist/index.html" ]; then
    echo "ERROR: dist/index.html not found"
    exit 1
fi

echo "✓ dist/index.html exists"
echo "✓ Build complete and ready for Vercel"
echo ""
echo "=== BUILD SUCCESS ==="