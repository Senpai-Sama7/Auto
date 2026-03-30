# Deployment Guide

Complete deployment instructions for Ultimate System. Choose your platform:

- [Vercel (Recommended)](#vercel)
- [GitHub Pages](#github-pages)
- [Docker](#docker)
- [Self-Hosted](#self-hosted)

---

## Vercel (Recommended)

**Best for:** Production dashboards with automatic deployments from Git.

### Prerequisites

- Vercel account (free tier works)
- GitHub repository connected to Vercel
- Control Plane API deployed and accessible

### Step 1: Prepare Your Control Plane

Your control plane must allow CORS from the Vercel domain:

```bash
# In your control plane .env
AUTH_ORIGINS=https://your-app.vercel.app,https://your-app-git-*.vercel.app
```

The `git-*` pattern allows preview deployments from pull requests.

### Step 2: Configure Vercel Project

1. **Create Project**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Login and create project
   vercel login
   vercel
   ```

2. **Set Environment Variables**

   In Vercel Dashboard → Project Settings → Environment Variables:

   | Variable | Value | Environment |
   |----------|-------|-------------|
   | `VITE_API_BASE_URL` | `https://your-api.com` | Production |
   | `VITE_API_BASE_URL` | `https://staging-api.com` | Preview |

3. **Configure Build Settings**

   The `vercel.json` in your repo already contains the correct settings:
   - Framework: Vite
   - Build Command: `pnpm --filter @ultimate-system/web build`
   - Output Directory: `apps/web/dist`

### Step 3: Automatic Deployments

Push to main branch triggers production deployment:

```bash
git push origin main
```

Pull requests create preview deployments automatically.

### GitHub Actions (Alternative)

Use the provided workflow for more control:

1. **Add Repository Secrets**

   Settings → Secrets and variables → Actions:

   | Secret | Description |
   |--------|-------------|
   | `VERCEL_TOKEN` | From vercel.com/account/tokens |
   | `VERCEL_ORG_ID` | From .vercel/project.json |
   | `VERCEL_PROJECT_ID` | From .vercel/project.json |

2. **Add Repository Variables**

   Settings → Secrets and variables → Variables:

   | Variable | Description |
   |----------|-------------|
   | `VERCEL_PROD_API_URL` | Production API URL |
   | `VERCEL_PREVIEW_API_URL` | Preview API URL (optional) |

3. **Deploy**

   The workflow `.github/workflows/vercel.yml` runs automatically on push.

### Troubleshooting Vercel

**CORS Errors**
```
Access to fetch at 'https://api.example.com' from origin 'https://app.vercel.app' has been blocked
```

Solution: Add your Vercel domain to `AUTH_ORIGINS` in control plane:
```bash
AUTH_ORIGINS=https://app.vercel.app,http://localhost:4173
```

**API Not Found**
The dashboard shows "Connecting..." forever.

Solution: Verify `VITE_API_BASE_URL` points to your control plane:
```bash
# Check browser dev tools → Network tab
curl $VITE_API_BASE_URL/api/health
```

**Session Not Persisting**
Cookies aren't set on cross-origin requests.

Solution: Ensure control plane allows credentials:
```typescript
// In control plane app.ts
cors({
  origin: authOrigins,
  credentials: true  // Required for cookies
})
```

---

## GitHub Pages

**Best for:** Free static hosting, simple deployments.

### Setup

1. **Enable Pages**

   Repository Settings → Pages → Source: GitHub Actions

2. **Configure Repository Variable**

   Settings → Secrets and variables → Variables:

   | Variable | Value |
   |----------|-------|
   | `VITE_API_BASE_URL` | `https://your-api.com` |

3. **Deploy**

   The workflow `.github/workflows/web-pages.yml` runs automatically:

   ```bash
   git push origin main
   ```

   Access at: `https://your-org.github.io/repo-name/`

### Limitations

- No server-side rendering
- API must be on different domain (CORS required)
- No preview deployments for PRs

---

## Docker

**Best for:** Self-hosted deployments, full control.

### Quick Start

```bash
# Build image
docker build -t ultimate-system:latest .

# Run with environment
docker run -d \
  -p 8888:8888 \
  -e DATABASE_URL=/data/ultimate-system.db \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -v $(pwd)/data:/data \
  --name ultimate-system \
  ultimate-system:latest
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  ultimate-system:
    build: .
    ports:
      - "8888:8888"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=/data/ultimate-system.db
      - REDIS_URL=redis://redis:6379
      - AUTH_ORIGINS=https://your-domain.com
      - AUTH_RP_IDS=your-domain.com
    volumes:
      - ./data:/data
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

Deploy:

```bash
docker-compose up -d
```

### Production Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim

# Install pnpm
RUN npm install -g pnpm@10.30.3

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/control-plane/package.json ./apps/control-plane/
COPY apps/worker/package.json ./apps/worker/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm build

# Expose unified port
EXPOSE 8888

# Start unified server
CMD ["node", "apps/unified/dist/server.js"]
```

---

## Self-Hosted

**Best for:** Bare metal, VPS, or existing infrastructure.

### Prerequisites

- Node.js 22+
- pnpm 10+
- Redis
- Systemd (for service management)

### Installation

```bash
# Clone and install
git clone https://github.com/your-org/ultimate-system.git
cd ultimate-system
./scripts/setup.sh
```

### Production Environment

Create `.env.production`:

```bash
# Core settings
NODE_ENV=production
DATABASE_URL=/var/lib/ultimate-system/data.db
REDIS_URL=redis://localhost:6379

# Security
AUTH_RP_IDS=your-domain.com
AUTH_ORIGINS=https://your-domain.com
SESSION_SECRET=generate-a-random-secret-here

# API keys (if using provider mode)
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Ports
UNIFIED_PORT=8888
```

### Systemd Service

Create `/etc/systemd/system/ultimate-system.service`:

```ini
[Unit]
Description=Ultimate System
After=network.target redis.service

[Service]
Type=simple
User=ultimate-system
Group=ultimate-system
WorkingDirectory=/opt/ultimate-system
Environment=NODE_ENV=production
EnvironmentFile=/opt/ultimate-system/.env.production
ExecStart=/usr/local/bin/pnpm --filter @ultimate-system/unified start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ultimate-system
sudo systemctl start ultimate-system

# Check status
sudo systemctl status ultimate-system
sudo journalctl -u ultimate-system -f
```

### Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/ultimate-system
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8888;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/ultimate-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `/data/ultimate-system.db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `AUTH_ORIGINS` | Allowed dashboard origins | `https://app.com,http://localhost:4173` |
| `AUTH_RP_IDS` | WebAuthn relying party IDs | `app.com,localhost` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `window.location.origin` | Dashboard API endpoint |
| `UNIFIED_PORT` | `8888` | Single-port server |
| `API_PORT` | `4100` | Control plane only |
| `WEB_PORT` | `4173` | Web dev server |
| `SESSION_SECRET` | (random) | Session cookie signing |
| `NODE_ENV` | `development` | Environment mode |

---

## SSL/TLS

### Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

### Custom Certificates

```bash
# Place certificates
sudo mkdir -p /etc/ultimate-system/ssl
sudo cp your-cert.pem /etc/ultimate-system/ssl/cert.pem
sudo cp your-key.pem /etc/ultimate-system/ssl/key.pem
sudo chmod 600 /etc/ultimate-system/ssl/key.pem

# Update nginx config to use them
```

---

## Monitoring

### Health Checks

```bash
# System health
curl https://your-domain.com/api/health

# Detailed state
curl https://your-domain.com/api/state

# Worker status
curl https://your-domain.com/api/workers
```

### Logs

```bash
# Docker
docker logs -f ultimate-system

# Systemd
sudo journalctl -u ultimate-system -f

# PM2
pm2 logs ultimate-system
```

### Metrics

Prometheus metrics available at `/metrics` (if enabled).

---

## Backup & Recovery

### Database Backup

```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/ultimate-system"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
cp /data/ultimate-system.db "$BACKUP_DIR/db_$DATE.sqlite"

# Keep last 30 days
find "$BACKUP_DIR" -name "db_*.sqlite" -mtime +30 -delete
```

Add to crontab:

```bash
0 2 * * * /opt/ultimate-system/scripts/backup.sh
```

### Restore

```bash
# Stop service
sudo systemctl stop ultimate-system

# Restore database
sudo cp /backups/ultimate-system/db_20240115_020000.sqlite /data/ultimate-system.db

# Start service
sudo systemctl start ultimate-system
```

---

## Troubleshooting

**Connection refused**
- Check if services are running: `docker ps` or `systemctl status`
- Verify port binding: `netstat -tlnp | grep 8888`
- Check firewall rules: `sudo ufw status`

**CORS errors**
- Verify `AUTH_ORIGINS` includes dashboard domain
- Check browser dev tools → Network → Response headers
- Ensure `credentials: true` in CORS config

**Database locked**
- SQLite doesn't support multiple writers
- Check for zombie processes: `ps aux | grep node`
- Restart service: `sudo systemctl restart ultimate-system`

**Redis connection failed**
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` format
- Check network connectivity: `telnet localhost 6379`

---

## Next Steps

- [ ] Configure monitoring (Prometheus/Grafana)
- [ ] Set up log aggregation (ELK/Loki)
- [ ] Configure automated backups
- [ ] Review security hardening guide
- [ ] Set up staging environment