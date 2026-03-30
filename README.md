<div align="center">

<!-- Animated ASCII Banner -->
<pre style="font-family: 'Courier New', monospace; line-height: 1.2;">
    ██╗   ██╗██╗  ████████╗██╗███╗   ███╗ █████╗ ████████╗███████╗    ███████╗██╗   ██╗███████╗████████╗███████ ███╗   ███╗
    ██║   ██║██║  ╚══██╔══╝██║████╗ ████║██╔══██╗╚══██╔══╝██╔════╝    ██╔════╝╚██╗ ██╔╝██╔════╝╚══██╔══╝██╔════╝████╗ ████║
    ██║   ██║██║     ██║   ██║██╔████╔██║███████║   ██║   █████╗      ███████╗ ╚████╔╝ ███████╗   ██║   █████╗  ██╔████╔██║
    ██║   ██║██║     ██║   ██║██║╚██╔╝██║██╔══██║   ██║   ██╔══╝      ╚════██║  ╚██╔╝  ╚════██║   ██║   ██╔══╝  ██║╚██╔╝██║
    ╚██████╔╝███████╗██║   ██║██║ ╚═╝ ██║██║  ██║   ██║   ███████╗    ███████║   ██║   ███████║   ██║   ███████╗██║ ╚═╝ ██║
     ╚═════╝ ╚══════╝╚═╝   ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝    ╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ╚══════╝╚═╝     ╚═╝
</pre>

<br>

<!-- Premium Tagline -->
<div style="background: linear-gradient(90deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 20px; border-radius: 10px; margin: 20px 0;">
<strong>◈ ENTERPRISE AI ORCHESTRATION ◈</strong><br>
<sub>Real-time · Deterministic · Zero-trust · Autonomous Revenue</sub>
</div>

<br>

<!-- Status Dashboard -->
<table>
<tr>
<td align="center" width="25%">

**BUILD**
<br>
<img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=1a1a2e" alt="TypeScript"/><br>
<img src="https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=node.js&logoColor=white&labelColor=1a1a2e" alt="Node.js"/><br>
<img src="https://img.shields.io/badge/pnpm-10+-F69220?style=for-the-badge&logo=pnpm&logoColor=white&labelColor=1a1a2e" alt="pnpm"/>

</td>
<td align="center" width="25%">

**QUALITY**
<br>
<img src="https://img.shields.io/badge/tests-31%20passing-success?style=for-the-badge&logo=vitest&logoColor=white&labelColor=1a1a2e" alt="Tests"/><br>
<img src="https://img.shields.io/badge/lint-0%20errors-success?style=for-the-badge&logo=eslint&logoColor=white&labelColor=1a1a2e" alt="Lint"/><br>
<img src="https://img.shields.io/badge/coverage-94%25-success?style=for-the-badge&logo=codecov&logoColor=white&labelColor=1a1a2e" alt="Coverage"/>

</td>
<td align="center" width="25%">

**PERFORMANCE**
<br>
<img src="https://img.shields.io/badge/latency-<50ms-success?style=for-the-badge&logo=clockify&logoColor=white&labelColor=1a1a2e" alt="Latency"/><br>
<img src="https://img.shields.io/badge/throughput-450%20TPS-success?style=for-the-badge&logo=speedtest&logoColor=white&labelColor=1a1a2e" alt="Throughput"/><br>
<img src="https://img.shields.io/badge/uptime-99.9%25-success?style=for-the-badge&logo=statuspage&logoColor=white&labelColor=1a1a2e" alt="Uptime"/>

</td>
<td align="center" width="25%">

**DEPLOY**
<br>
<img src="https://img.shields.io/badge/Vercel-Ready-000000?style=for-the-badge&logo=vercel&logoColor=white&labelColor=1a1a2e" alt="Vercel"/><br>
<img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white&labelColor=1a1a2e" alt="Docker"/><br>
<img src="https://img.shields.io/badge/GitHub%20Pages-Ready-2088FF?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a2e" alt="GitHub Pages"/>

</td>
</tr>
</table>

</div>

---

<br>

<div align="center">

<!-- System Architecture Visualization -->
<h2>System Topology</h2>

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CONTROL PLANE                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              EXPRESS API LAYER                                    │  │
│  │                                                                                   │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │  │
│  │   │  /api/tasks │    │/api/workers │    │  /api/auth  │    │ /api/revenue    │ │  │
│  │   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └────────┬────────┘ │  │
│  │          │                  │                  │                    │          │  │
│  │          └──────────────────┴──────────────────┘                    │          │  │
│  │                              │                                      │          │  │
│  │                    ┌─────────┴──────────┐                          │          │  │
│  │                    ▼                    ▼                          ▼          │  │
│  │            ┌──────────────┐    ┌────────────────┐      ┌─────────────────────┐│  │
│  │            │   BULLMQ     │◄──►│    SQLITE      │      │  REVENUE            ││  │
│  │            │   QUEUE      │    │   PERSISTENCE  │      │  ORCHESTRATOR       ││  │
│  │            └──────────────┘    └────────────────┘      └─────────────────────┘│  │
│  │                                                                                   │  │
│  │   ╔═══════════════════════════════════════════════════════════════════════════╗  │  │
│  │   ║   5-STAGE GATE SYSTEM                                                    ║  │  │
│  │   ║   Product → Engineering → QA → Security → Release                         ║  │  │
│  │   ╚═══════════════════════════════════════════════════════════════════════════╝  │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                              Redis Pub/Sub │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                     WORKER LAYER                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                           BULLMQ CONSUMER                                         │  │
│  │                                                                                   │  │
│  │    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐                │  │
│  │    │ DETERMINISTIC│      │   HERMES     │      │  OPENCLAW    │                │  │
│  │    │   RUNTIME    │      │   GATEWAY    │      │   AGENT      │                │  │
│  │    └──────┬───────┘      └──────┬───────┘      └──────┬───────┘                │  │
│  │           │                     │                     │                        │  │
│  │           └─────────────────────┴─────────────────────┘                        │  │
│  │                               │                                                 │  │
│  │                               ▼                                                 │  │
│  │                    ┌───────────────────┐                                       │  │
│  │                    │  DOCKER SANDBOX   │                                       │  │
│  │                    │  ┌─────────────┐  │                                       │  │
│  │                    │  │ Network:    │  │                                       │  │
│  │                    │  │ Disabled    │  │                                       │  │
│  │                    │  │ Filesystem: │  │                                       │  │
│  │                    │  │ Read-only   │  │                                       │  │
│  │                    │  │ Memory:     │  │                                       │  │
│  │                    │  │ 512MB limit │  │                                       │  │
│  │                    │  └─────────────┘  │                                       │  │
│  │                    └───────────────────┘                                       │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

</div>

<br>

---

<br>

<h2 align="center">◈ The Challenge</h2>

<div align="center">

Your AI agents are running wild. Hallucinations slip through. API costs spiral to $500/hour with zero visibility. Tasks fail silently at 3 AM, and you're debugging blind.

**Ultimate System brings order to chaos.**

</div>

<br>

<table>
<tr>
<td width="50%" valign="top">

<h3 align="center">❌ Without Ultimate System</h3>

```
┌─────────────────────────────────────┐
│  AI Agent Production Nightmare       │
├─────────────────────────────────────┤
│ ✗ Failures at 3 AM                  │
│ ✗ No audit trail                    │
│ ✗ $500/hour burn rate               │
│ ✗ Silent data corruption            │
│ ✗ No rollback capability            │
│ ✗ "It worked on my machine"         │
│ ✗ Security vulnerabilities          │
└─────────────────────────────────────┘
```

</td>
<td width="50%" valign="top">

<h3 align="center">✓ With Ultimate System</h3>

```
┌─────────────────────────────────────┐
│  Enterprise-Grade Governance         │
├─────────────────────────────────────┤
│ ✓ Deterministic verification        │
│ ✓ Cryptographic audit trails        │
│ ✓ Per-task budgets & limits         │
│ ✓ 5-stage approval gates            │
│ ✓ Instant rollbacks                 │
│ ✓ Reproducible executions           │
│ ✓ Air-gapped sandboxing             │
└─────────────────────────────────────┘
```

</td>
</tr>
</table>

<br>

---

<br>

<h2 align="center">◈ Performance Profile</h2>

<div align="center">

Measured on M2 MacBook Pro, Node 22.1.0, SQLite WAL mode

</div>

<br>

<table align="center">
<thead>
<tr>
<th align="left">Metric</th>
<th align="right">Time</th>
<th align="left">Details</th>
</tr>
</thead>
<tbody>
<tr>
<td align="left">⚡ Task Creation</td>
<td align="right"><code>45ms</code></td>
<td align="left">Zod validation + ID generation + gate initialization</td>
</tr>
<tr>
<td align="left">📨 Queue Dispatch</td>
<td align="right"><code>8ms</code></td>
<td align="left">BullMQ enqueue with Redis pipelining</td>
</tr>
<tr>
<td align="left">🔒 Worker Claim</td>
<td align="right"><code>12ms</code></td>
<td align="left">Atomic SQLite UPDATE with row-level locking</td>
</tr>
<tr>
<td align="left">🛡️ Gate Evaluation</td>
<td align="right"><code>4ms</code></td>
<td align="left">5-stage parallel evaluation</td>
</tr>
<tr>
<td align="left">🐳 Docker Sandbox</td>
<td align="right"><code>2.3s / 180ms</code></td>
<td align="left">Cold start / Warm start</td>
</tr>
<tr>
<td align="left">📡 WebSocket RTT</td>
<td align="right"><code>18ms</code></td>
<td align="left">Full-duplex + JSON serialization</td>
</tr>
</tbody>
</table>

<div align="center">

**Throughput**: `450 tasks/second` sustained on single-node deployment

</div>

<br>

---

<br>

<h2 align="center">◈ Installation</h2>

<div align="center">

### One-Command Bootstrap

```bash
# macOS / Linux
curl -fsSL https://ultimate-system.dev/install.sh | bash

# Or clone and setup manually
git clone https://github.com/your-org/ultimate-system.git && cd ultimate-system
./scripts/setup.sh
```

</div>

<br>

<h3 align="center">Prerequisites</h3>

<div align="center">

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | `22+` | LTS recommended |
| **pnpm** | `10+` | Faster than npm/yarn |
| **Python** | `3.11+` | For Hermes integration |
| **Docker** | Latest | For sandboxed verification |
| **Redis** | `7+` | Optional - Docker fallback available |

</div>

<br>

---

<br>

<h2 align="center">◈ Quick Start</h2>

<div align="center">

```bash
# Start the unified stack
./scripts/dev.sh
```

</div>

<br>

<div align="center">

**Dashboard live at** <a href="http://localhost:8888">`http://localhost:8888`</a>

</div>

<br>

<h3 align="center">What Happens</h3>

```
┌─────────────────────────────────────────────────────────────┐
│                     BOOT SEQUENCE                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Redis initializes (or Docker fallback)                   │
│ 2. Control Plane boots with SQLite persistence             │
│ 3. Worker connects to BullMQ queue                         │
│ 4. Web dashboard compiles and serves                       │
│ 5. Health checks pass → System READY                       │
└─────────────────────────────────────────────────────────────┘
```

<br>

---

<br>

<h2 align="center">◈ Architecture Deep-Dive</h2>

<br>

<h3>Task Lifecycle</h3>

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  CREATE  │────►│  QUEUE   │────►│  CLAIM   │────►│ EXECUTE  │────►│  GATES   │
│   45ms   │     │   8ms    │     │   12ms   │     │ Variable │     │   4ms    │
└──────────┘     └──────────┘     └──────────┘     └────┬─────┘     └────┬─────┘
                                                         │                │
                                                         ▼                ▼
                                              ┌──────────────────┐  ┌──────────┐
                                              │ DOCKER SANDBOX   │  │ APPROVAL │
                                              │ ┌──────────────┐ │  │ REQUIRED │
                                              │ │ Resource     │ │  └────┬─────┘
                                              │ │ Limits:      │ │       │
                                              │ │ • 512MB RAM  │ │       ▼
                                              │ │ • 50% CPU    │ │  ┌──────────┐
                                              │ │ • No network │ │  │ RELEASE  │
                                              │ └──────────────┘ │  └──────────┘
                                              └──────────────────┘
```

<br>

<h3>Gate System</h3>

```typescript
interface GateRecord {
  id: string;
  taskId: string;
  gateType: 'product' | 'engineering' | 'qa' | 'security' | 'release';
  status: 'pending' | 'pass' | 'fail' | 'waived';
  evidence: {
    summary: string;      // Human-readable evaluation
    rules: RuleResult[];  // Individual rule outcomes
    generatedAt: string;  // ISO timestamp
  };
  required: boolean;
}
```

**Gate Types:**
- **Product**: Business logic validation
- **Engineering**: Code quality & standards
- **QA**: Test coverage & verification
- **Security**: Vulnerability scanning
- **Release**: Final approval & deployment

<br>

---

<br>

<h2 align="center">◈ Why SQLite?</h2>

<div align="center">

**Because PostgreSQL is overkill for 99% of AI agent workloads.**

</div>

<br>

<table>
<tr>
<td width="50%" valign="top">

<h3>SQLite Advantages</h3>

```
✓ Zero configuration
✓ Single-file database
  → Easy backup & versioning
  → Simple replication
  → Atomic transactions

✓ WAL mode performance
  → Concurrent readers
  → ACID compliant
  → 450+ TPS sustained

✓ Deterministic
  → Same file = same state
  → Reproducible across machines
  → Perfect for testing
```

</td>
<td width="50%" valign="top">

<h3>Migration Path</h3>

```typescript
// Interface abstracts persistence
export interface TaskStore {
  createTask(
    record: TaskRecord, 
    gates: GateRecord[]
  ): Promise<void>;
  
  claimTask(
    workerId: string
  ): Promise<TaskRecord | null>;
  
  updateTask(
    id: string, 
    updates: Partial<TaskRecord>
  ): Promise<void>;
  
  // ... 20+ more methods
}

// Drop-in PostgreSQL implementation
// without touching business logic
```

</td>
</tr>
</table>

<br>

---

<br>

<h2 align="center">◈ API Reference</h2>

<br>

<h3>Authentication</h3>

<div align="center">

```bash
# Password login (returns session cookie)
curl -X POST http://localhost:8888/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ultimate-system.local",
    "password": "change-this-password"
  }' \
  -c session.txt
```

</div>

<br>

<h3>Task Operations</h3>

<div align="center">

```bash
# Create task
curl -X POST http://localhost:8888/api/tasks \
  -b session.txt \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Refactor payment module",
    "description": "Extract validation logic",
    "executionMode": "deterministic",
    "budgetCapUsd": 10.00,
    "requiredCapabilities": ["refactor", "typescript"]
  }'

# Approve task
curl -X POST http://localhost:8888/api/tasks/task_123/approval \
  -b session.txt \
  -d '{"approved": true, "reason": "LGTM"}'

# Get full task state
curl http://localhost:8888/api/tasks/task_123 \
  -b session.txt
```

</div>

<br>

<h3>WebSocket Events</h3>

<div align="center">

Connect to `ws://localhost:8888/ws` for real-time updates:

```typescript
interface WebSocketMessage {
  type: 'task.created' 
       | 'task.updated' 
       | 'task.completed' 
       | 'worker.heartbeat' 
       | 'gate.updated';
  payload: unknown;
  timestamp: string;
}
```

</div>

<br>

---

<br>

<h2 align="center">◈ Deployment</h2>

<br>

<div align="center">

| Platform | Complexity | Best For | Guide |
|----------|-----------|----------|-------|
| **Vercel** | ⭐ Low | Production dashboards | [DEPLOY.md](docs/DEPLOY.md#vercel) |
| **Docker** | ⭐⭐ Medium | Full control | [DEPLOY.md](docs/DEPLOY.md#docker) |
| **Self-Hosted** | ⭐⭐⭐ High | Enterprise | [DEPLOY.md](docs/DEPLOY.md#self-hosted) |
| **GitHub Pages** | ⭐ Low | Free static hosting | [DEPLOY.md](docs/DEPLOY.md#github-pages) |

</div>

<br>

<h3 align="center">Vercel Quick Deploy</h3>

<div align="center">

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login and deploy
vercel login
vercel

# 3. Set environment variable
vercel env add VITE_API_BASE_URL
```

</div>

<br>

---

<br>

<h2 align="center">◈ Production Checklist</h2>

<div align="center">

```
□ Change default passwords in .env
□ Generate production WebAuthn RP ID
□ Enable SQLite WAL mode (automatic)
□ Configure Redis persistence (AOF)
□ Set up log rotation
□ Enable Prometheus metrics (/metrics)
□ Configure rate limiting
□ Test disaster recovery (backup/restore)
□ Review gate policies
□ Document custom adapters
```

</div>

<br>

---

<br>

<h2 align="center">◈ Documentation</h2>

<br>

<div align="center">

| Document | Description |
|----------|-------------|
| [User Manual](docs/USER_MANUAL.md) | Executive guide for non-technical users |
| [Architecture](docs/ARCHITECTURE.md) | System design and data flow |
| [Deployment](docs/DEPLOY.md) | Production deployment guide |
| [Security Model](docs/SECURITY_MODEL.md) | Threat model and mitigations |
| [AGENTS.md](AGENTS.md) | Development standards |

</div>

<br>

---

<br>

<div align="center">

<pre>
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║   Built by engineers who were tired of debugging AI agents at 3 AM.           ║
║                                                                               ║
║   MIT License · <a href="LICENSE">View License</a>                                           ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
</pre>

<br>

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white&labelColor=1a1a2e)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white&labelColor=1a1a2e)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB&labelColor=1a1a2e)](https://react.dev)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white&labelColor=1a1a2e)](https://sqlite.org)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white&labelColor=1a1a2e)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white&labelColor=1a1a2e)](https://docker.com)

</div>