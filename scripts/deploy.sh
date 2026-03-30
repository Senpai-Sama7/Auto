#!/bin/bash
# Ultimate System Deployment Script
# Sets up the system for 24/7 autonomous operation

set -e

echo "======================================="
echo "Ultimate System Deployment"
echo "======================================="

# Check for dependencies
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required but not installed. Aborting." >&2; exit 1; }
command -v redis-server >/dev/null 2>&1 || { echo "Redis is required but not installed. Aborting." >&2; exit 1; }

# Install dependencies
echo "[1/5] Installing dependencies..."
pnpm install

# Build all packages
echo "[2/5] Building packages..."
pnpm build

# Create data directories
echo "[3/5] Creating data directories..."
mkdir -p data
mkdir -p data/openclaw-home

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "[4/5] Creating .env from example..."
    cp apps/control-plane/.env.example .env
    echo "Please edit .env with your configuration before starting services."
else
    echo "[4/5] .env already exists, skipping..."
fi

# Check if systemd is available for service installation
if command -v systemctl >/dev/null 2>&1; then
    echo "[5/5] Systemd detected."
    echo ""
    echo "To install as systemd services (requires sudo):"
    echo "  sudo cp scripts/ultimate-control-plane.service /etc/systemd/system/"
    echo "  sudo cp scripts/ultimate-worker.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable ultimate-control-plane ultimate-worker"
    echo "  sudo systemctl start ultimate-control-plane ultimate-worker"
    echo ""
    echo "To view logs:"
    echo "  sudo journalctl -u ultimate-control-plane -f"
    echo "  sudo journalctl -u ultimate-worker -f"
else
    echo "[5/5] Systemd not available. Using PM2 alternative..."
    
    if command -v pm2 >/dev/null 2>&1; then
        echo "PM2 is installed. Setting up processes..."
        pm2 start apps/control-plane/dist/server.js --name ultimate-control-plane
        pm2 start apps/worker/dist/worker.js --name ultimate-worker
        pm2 save
        echo "To view logs: pm2 logs"
    else
        echo "PM2 not installed. Install with: npm install -g pm2"
        echo "Then run: pm2 start apps/control-plane/dist/server.js --name ultimate-control-plane"
    fi
fi

echo ""
echo "======================================="
echo "Deployment Complete!"
echo "======================================="
echo ""
echo "Next steps:"
echo "1. Edit .env with your API keys and configuration"
echo "2. Ensure Redis is running: redis-server --port 6380 &"
echo "3. Start services (see instructions above)"
echo "4. Access dashboard: http://localhost:4173"
echo "5. Enable revenue orchestrator: Settings → Revenue Orchestrator → Start"
echo ""
echo "Environment variables for revenue generation:"
echo "  REVENUE_AUTO_START=true        # Auto-start on boot"
echo "  REVENUE_MAX_DAILY_TASKS=50     # Max daily tasks"
echo "  APEX_MCP_ENDPOINT=http://localhost:4000  # Apex tools"
echo "  MONEY_ENDPOINT=http://localhost:8000      # HVAC dispatch"
echo "  CLEARDESK_ENDPOINT=https://clear-desk-ten.vercel.app"
echo ""