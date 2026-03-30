#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
. "${ROOT_DIR}/scripts/load-env.sh" "$ROOT_DIR"
. "${ROOT_DIR}/scripts/resolve-hermes-runtime.sh"
export HERMES_MODEL="${HERMES_RESOLVED_MODEL}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_header() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║   🚀 ULTIMATE SYSTEM - Unified Startup                      ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    print_status "Node.js $(node --version)"
    
    # Check if pnpm is installed
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed"
        exit 1
    fi
    print_status "pnpm $(pnpm --version)"
    
    # Check if Redis is available
    if ! command -v redis-cli &> /dev/null; then
        print_warning "redis-cli not found (will use Docker fallback)"
    else
        print_status "Redis CLI available"
    fi
    
    # Check if Docker is available (optional)
    if command -v docker &> /dev/null; then
        print_status "Docker available"
    else
        print_warning "Docker not available (some features may not work)"
    fi
}

# Build all packages
build_packages() {
    echo ""
    echo "📦 Building packages..."
    
    # Build web dashboard
    echo "  Building web dashboard..."
    pnpm --filter @ultimate-system/web build > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        print_status "Web dashboard built"
    else
        print_error "Failed to build web dashboard"
        exit 1
    fi
    
    # Build unified server
    echo "  Building unified server..."
    pnpm --filter @ultimate-system/unified build > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        print_status "Unified server built"
    else
        print_error "Failed to build unified server"
        exit 1
    fi
}

# Start services
start_services() {
    echo ""
    echo "🚀 Starting services..."
    
    # Kill any existing processes on our ports
    lsof -ti:8888 | xargs kill -9 2>/dev/null || true
    lsof -ti:4100 | xargs kill -9 2>/dev/null || true
    
    # Start Redis
    echo "  Starting Redis..."
    ./scripts/start-redis.sh > /dev/null 2>&1 &
    sleep 2
    
    # Start Paperclip
    echo "  Starting Paperclip..."
    ./scripts/start-paperclip.sh > /dev/null 2>&1 &
    sleep 2
    
    # Start Hermes
    echo "  Starting Hermes..."
    ./scripts/start-hermes.sh > /dev/null 2>&1 &
    sleep 2
    
    # Start OpenClaw
    echo "  Starting OpenClaw..."
    ./scripts/start-openclaw.sh > /dev/null 2>&1 &
    sleep 2
    
    # Start Control Plane
    echo "  Starting Control Plane..."
    pnpm --filter @ultimate-system/control-plane dev > /dev/null 2>&1 &
    sleep 3
    
    # Start Unified Server
    echo "  Starting Unified Server..."
    pnpm --filter @ultimate-system/unified dev > /dev/null 2>&1 &
    sleep 3
    
    print_status "All services started"
}

# Verify services
verify_services() {
    echo ""
    echo "🔍 Verifying services..."
    
    # Check Redis
    if redis-cli ping > /dev/null 2>&1; then
        print_status "Redis is running on port 6379"
    else
        print_warning "Redis check failed (may be running on different port)"
    fi
    
    # Check Paperclip
    if curl -s http://localhost:3100/health > /dev/null 2>&1; then
        print_status "Paperclip is running on port 3100"
    else
        print_warning "Paperclip not responding on port 3100"
    fi
    
    # Check Hermes
    if curl -s http://127.0.0.1:8642/health > /dev/null 2>&1; then
        print_status "Hermes is running on port 8642"
    else
        print_warning "Hermes not responding on port 8642"
    fi
    
    # Check Control Plane
    if curl -s http://localhost:4100/api/health > /dev/null 2>&1; then
        print_status "Control Plane is running on port 4100"
    else
        print_error "Control Plane not responding on port 4100"
    fi
    
    # Check Unified Server
    if curl -s http://localhost:8888/health > /dev/null 2>&1; then
        print_status "Unified Server is running on port 8888"
    else
        print_error "Unified Server not responding on port 8888"
    fi
    
    # Test API proxy
    API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/api/health)
    if [ "$API_RESPONSE" = "200" ]; then
        print_status "API proxy is working (HTTP $API_RESPONSE)"
    else
        print_error "API proxy failed (HTTP $API_RESPONSE)"
    fi
    
    # Test Dashboard
    DASHBOARD_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/)
    if [ "$DASHBOARD_RESPONSE" = "200" ]; then
        print_status "Dashboard is serving (HTTP $DASHBOARD_RESPONSE)"
    else
        print_error "Dashboard failed (HTTP $DASHBOARD_RESPONSE)"
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║   🎉 ULTIMATE SYSTEM - READY!                                ║"
    echo "║                                                              ║"
    echo "║   🌐 Access Point: http://localhost:8888                     ║"
    echo "║   📊 Dashboard:    http://localhost:8888                     ║"
    echo "║   🔌 API:          http://localhost:8888/api                 ║"
    echo "║   ❤️  Health:       http://localhost:8888/health              ║"
    echo "║                                                              ║"
    echo "║   Login Credentials:                                         ║"
    echo "║   • admin@ultimate-system.local / change-this-password       ║"
    echo "║   • requester@ultimate-system.local / requester-password     ║"
    echo "║   • approver@ultimate-system.local / approver-password       ║"
    echo "║   • viewer@ultimate-system.local / viewer-password           ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# Main execution
print_header
check_prerequisites
build_packages
start_services
verify_services
print_summary

# Keep script running
echo "Press Ctrl+C to stop all services..."
wait