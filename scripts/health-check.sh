#!/bin/bash
# Production Health Check Script
# Usage: ./scripts/health-check.sh [URL]

set -e

URL="${1:-http://localhost:8888}"
COOKIE_JAR="/tmp/ultimate-health-check-cookies.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Ultimate System Health Check"
echo "Target: $URL"
echo "=========================================="
echo ""

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local description=$2
    local method=${3:-GET}
    local data=$4
    
    echo -n "Checking $description... "
    
    if [ "$method" == "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" \
            -c "$COOKIE_JAR" 2>/dev/null) || response="000"
    else
        response=$(curl -s -o /dev/null -w "%{http_code}" "$URL$endpoint" \
            -b "$COOKIE_JAR" 2>/dev/null) || response="000"
    fi
    
    if [ "$response" == "200" ] || [ "$response" == "201" ]; then
        echo -e "${GREEN}✓ OK${NC} ($response)"
        return 0
    elif [ "$response" == "401" ] || [ "$response" == "403" ]; then
        echo -e "${YELLOW}⚠ Auth Required${NC} ($response)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} ($response)"
        return 1
    fi
}

# Check 1: API Health
check_endpoint "/api/health" "API Health"

# Check 2: System State (public)
check_endpoint "/api/state" "System State"

# Check 3: Login
echo -n "Testing Authentication... "
login_response=$(curl -s -X POST "$URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@ultimate-system.local","password":"change-this-password"}' \
    -c "$COOKIE_JAR" 2>/dev/null)

if echo "$login_response" | grep -q "authenticated"; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Check 4: Authenticated Endpoints
check_endpoint "/api/tasks" "Task List"
check_endpoint "/api/workers" "Worker List"
check_endpoint "/api/auth/session" "Session Status"

# Check 5: Revenue Orchestrator (if enabled)
check_endpoint "/api/revenue/status" "Revenue Status"

echo ""
echo "=========================================="
echo "Health Check Complete"
echo "=========================================="

# Cleanup
rm -f "$COOKIE_JAR"