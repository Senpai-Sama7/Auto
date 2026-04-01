# Auto Project Deployment Architecture

## Overview

This document describes the deployment architecture for the Auto project (Ultimate System) frontends and backends on Vercel.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            VERCEL (Frontend)                                 │
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │ Auto Web        │     │ Revenue Engine  │     │ API Edge       │       │
│  │ Dashboard       │     │ v6              │     │ Functions      │       │
│  │                 │     │                 │     │                │       │
│  │ localhost:8888  │     │ localhost:8888  │     │ /api/*         │       │
│  │ /              │     │ /revenue/       │     │                │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   │ Proxy                                   │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BACKEND (VPS/Cloud VM)                                   │
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │ Control Plane   │     │ Worker          │     │ Unified Server  │       │
│  │                 │     │                 │     │                 │       │
│  │ Express.js      │     │ BullMQ Queue    │     │ Express Proxy   │       │
│  │ Port 4100       │     │ Background Jobs │     │ Port 8888       │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   │                                         │
│                           ┌───────┴───────┐                                 │
│                           │   Redis        │                                 │
│                           │   Port 6379    │                                 │
│                           └───────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Vercel Projects

### 1. Auto Web Dashboard (Primary Frontend)

**Project:** `ultimate-system`
**Framework:** Vite + React 19
**Build Command:** `pnpm --filter @ultimate-system/web build`
**Output Directory:** `apps/web/dist`

**Deployment:**
```bash
cd /home/donovan/Projects/Auto
vercel --prod
```

**URL Structure:**
- Production: `https://ultimate-system.vercel.app`
- Staging: `https://ultimate-system-git-main.vercel.app`

### 2. Revenue Engine v6 (Secondary Frontend)

Can be deployed as:
- **Option A:** Subpath of main deployment (`/revenue/`)
- **Option B:** Separate Vercel project

**Framework:** Vite + React 19
**Build Command:** `npm run build` (from `apps/revenue-engine/`)
**Output Directory:** `dist`

**Subpath Configuration:**
```json
// vite.config.ts
export default defineConfig({
  base: "/revenue/",
  // ...
});
```

## Environment Variables

### Frontend (Vercel)
Set in Vercel Dashboard → Settings → Environment Variables:

```bash
VITE_API_URL=https://your-backend.com/api
VITE_CONTROL_PLANE_URL=https://your-backend.com
VITE_WS_URL=wss://your-backend.com
```

### Backend (VPS)
Set in `.env` or system environment:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/ultimate
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=sk-or-v1-xxx
PAPERCLIP_URL=http://localhost:3000
OPENCLAW_HOME=/home/openclaw
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your-token
```

## API Routes (Vercel Edge Functions)

### Health Check
```
GET /api/health → api/health/index.ts
```

### Auth Session Proxy
```
GET /api/auth/session → api/auth/session.ts
```
Proxies authentication requests to backend Control Plane.

### Skills Proxy
```
ALL /api/skills/* → api/skills/[[...path]].ts
```
Proxies all skill-related requests to Control Plane.

## Deployment Checklist

### Pre-Deployment

- [ ] Build frontends locally and verify
- [ ] Run TypeScript type checks
- [ ] Run linting
- [ ] Test production builds

### Deploy Frontends to Vercel

```bash
# 1. Login to Vercel (if not already)
vercel login

# 2. Link project (if not already linked)
cd /home/donovan/Projects/Auto
vercel link

# 3. Deploy to production
vercel --prod
```

### Configure Backend CORS

Add Vercel domain to allowed origins:

```typescript
// In control-plane/src/app.ts
app.use(cors({
  origin: [
    'http://localhost:4173',
    'http://localhost:8888',
    'https://ultimate-system.vercel.app',  // Add this
    /^https:\/\/ultimate-system.*\.vercel\.app$/  // Or use regex for previews
  ],
  credentials: true
}));
```

### Environment Variables in Vercel

1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add:

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_CONTROL_PLANE_URL` | `https://your-backend-domain.com` | Production |
| `CONTROL_PLANE_URL` | `https://your-backend-domain.com` | Production |

## Migration Path for Full Serverless

To deploy the Control Plane entirely on Vercel:

### Phase 1: API Routes Migration
Convert Express routes to Vercel Edge Functions:

```
/api/health → api/health/index.ts ✅
/api/auth/* → api/auth/[...path].ts
/api/tasks/* → api/tasks/[...path].ts
/api/workers/* → api/workers/[...path].ts
```

### Phase 2: Database Migration
Replace SQLite with serverless database:

- **Option A:** Vercel Postgres (Neon)
- **Option B:** Supabase
- **Option C:** PlanetScale

### Phase 3: Queue Migration
Replace BullMQ with serverless queue:

- **Option A:** Vercel Cron Jobs + KV
- **Option B:** Upstash Queue
- **Option C:** Inngest

### Phase 4: WebSocket Migration
Replace WebSocket connections:

- **Option A:** Pusher
- **Option B:** Ably
- **Option C:** Liveblocks

## Current Deployment Status

| Component | Platform | Status | URL |
|-----------|----------|--------|-----|
| Auto Web Dashboard | Vercel | ⚠️ Error (pending fix) | ultimate-system.vercel.app |
| Revenue Engine v6 | Vercel | ⚠️ Not deployed | N/A |
| Control Plane | Local/VPS | ✅ Running | localhost:4100 |
| Worker | Local/VPS | ✅ Running | N/A |
| Unified Server | Local/VPS | ✅ Running | localhost:8888 |

## Commands Reference

```bash
# Build frontend locally
pnpm --filter @ultimate-system/web build

# Build revenue engine locally
pnpm --filter @ultimate-system/revenue-engine build

# Deploy to Vercel
vercel --prod

# View deployment logs
vercel logs [deployment-url]

# Remove deployment
vercel remove [deployment-url]

# List deployments
vercel list
```

## Troubleshooting

### Build Fails on Vercel

1. Check `pnpm-lock.yaml` is committed
2. Ensure `PNPM_IGNORE_PACKAGE_MANAGER_VERSION=true` is set
3. Verify `package.json` engines match Vercel's Node version

### CORS Errors

1. Add Vercel domain to backend CORS whitelist
2. Ensure `credentials: true` in CORS config
3. Check `VITE_CONTROL_PLANE_URL` is set correctly

### API Routes Not Working

1. Ensure `api/` directory exists at project root
2. Check file naming: `[...path].ts` for catch-all routes
3. Verify Edge Function runtime: `export const config = { runtime: 'edge' }`