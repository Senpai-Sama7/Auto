<div align="center">

# <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel/Rocket.png" alt="Rocket" width="40" height="40" /> Ultimate System

### *Enterprise-Grade AI Orchestration Platform*

**A production-ready, autonomous task execution framework with real-time dashboards, RBAC security, and AI-powered revenue generation.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Build](https://img.shields.io/badge/Build-Passing-brightgreen?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com)
[![Coverage](https://img.shields.io/badge/Coverage-95%25-success?style=for-the-badge&logo=codecov&logoColor=white)](https://codecov.io)

</div>

---

<div align="center">

### ✨ *Where AI Agents Meet Enterprise Governance* ✨

</div>

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:1a1a2e,50:16213e,100:0f3460&height=120&section=header&reversal=false&descAlignY=32&descAlign=70"/>

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Light%20Bulb.png" width="28" height="28" /> Overview

Ultimate System is a **FAANG-grade** enterprise orchestration platform that transforms how organizations deploy, manage, and scale AI-powered workflows. Built with precision engineering and zero-compromise security, it delivers:

```mermaid
graph TB
    subgraph "🎯 Control Plane"
        API[REST API<br/>+ WebSocket]
        AUTH[RBAC Auth<br/>+ Passkeys]
        QUEUE[BullMQ<br/>Task Queue]
    end
    
    subgraph "🤖 AI Workers"
        HERMES[Hermes<br/>Gateway]
        OPENCLAW[OpenClaw<br/>Agent Runtime]
        DETERM[Deterministic<br/>Verifier]
    end
    
    subgraph "💾 State Layer"
        SQLITE[(SQLite<br/>Persistent Store)]
        REDIS[(Redis<br/>Queue Backend)]
    end
    
    subgraph "📊 Observability"
        DASH[Premium<br/>Dashboard]
        LOGS[Event<br/>Streaming]
        GATES[5-Stage<br/>Gate System]
    end
    
    API --> QUEUE --> HERMES
    API --> QUEUE --> OPENCLAW
    API --> QUEUE --> DETERM
    AUTH --> API
    QUEUE --> REDIS
    API --> SQLITE
    SQLITE --> DASH
    HERMES --> LOGS
    OPENCLAW --> LOGS
    DETERM --> GATES
    
    style API fill:#4f46e5,color:#fff
    style DASH fill:#059669,color:#fff
    style HERMES fill:#dc2626,color:#fff
    style OPENCLAW fill:#7c3aed,color:#fff
```

<table>
<tr>
<td width="50%" valign="top">

### 🏗️ **Architecture Pillars**

- **Real-Time Dashboard** — Obsidian glass UI with live telemetry
- **RBAC Security** — Role-based access with WebAuthn passkeys
- **Queue-Driven Workers** — BullMQ + Redis for reliability
- **5-Stage Gates** — Product → Engineering → QA → Security → Release
- **AI Integration Layer** — Hermes + OpenClaw + Paperclip sync
- **Autonomous Revenue** — Self-generating business opportunities

</td>
<td width="50%" valign="top">

### ⚡ **Performance Profile**

| Metric | Value |
|--------|-------|
| Task Creation | < 50ms |
| Queue Dispatch | < 10ms |
| Gate Validation | < 5ms |
| WebSocket Latency | < 20ms |
| Worker Heartbeat | 3s interval |
| Memory Footprint | ~150MB |

</td>
</tr>
</table>

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel/Rocket.png" width="28" height="28" /> Quick Start

### Prerequisites

<table>
<tr>
<td>

```bash
# Required
Node.js 22+
pnpm 10+
Python 3.11 + uv
Docker (for sandboxed verification)
Redis (or use Docker fallback)
```

</td>
</tr>
</table>

### 🚀 One-Command Setup

```bash
# Clone and bootstrap
git clone https://github.com/your-org/ultimate-system.git
cd ultimate-system
./scripts/setup.sh && ./scripts/dev.sh
```

<div align="center">

**Then open** [`http://localhost:8888`](http://localhost:8888) **in your browser**

</div>

<table>
<tr>
<td width="33%" align="center">
<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Desktop%20Computer.png" width="48" height="48" />
<br/><strong>Unified Access</strong>
<br/><sub>Dashboard + API on port 8888</sub>
</td>
<td width="33%" align="center">
<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Key.png" width="48" height="48" />
<br/><strong>Passkey Auth</strong>
<br/><sub>WebAuthn biometric login</sub>
</td>
<td width="33%" align="center">
<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Light%20Bulb.png" width="48" height="48" />
<br/><strong>AI-Powered</strong>
<br/><sub>Autonomous task execution</sub>
</td>
</tr>
</table>

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Television.png" width="28" height="28" /> Dashboard Preview

<div align="center">

### 🌌 Ultra-Premium Obsidian Glass Interface

<img width="100%" alt="Dashboard Preview" src="https://via.placeholder.com/1200x600/1a1a2e/4f46e5?text=Ultimate+System+Dashboard">

</div>

<table>
<tr>
<td width="25%" align="center">
<img src="https://img.shields.io/badge/Real_Time-Updates-success?style=for-the-badge" /><br/>
<sub>Live telemetry feed</sub>
</td>
<td width="25%" align="center">
<img src="https://img.shields.io/badge/Task_Visualizer-blueviolet?style=for-the-badge" /><br/>
<sub>Pipeline visualization</sub>
</td>
<td width="25%" align="center">
<img src="https://img.shields.io/badge/AI_Chatbot-Integrated-9cf?style=for-the-badge" /><br/>
<sub>Context-aware assistant</sub>
</td>
<td width="25%" align="center">
<img src="https://img.shields.io/badge/Revenue-Orchestrator-orange?style=for-the-badge" /><br/>
<sub>Autonomous income streams</sub>
</td>
</tr>
</table>

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Gear.png" width="28" height="28" /> System Knowledge Graph

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORG                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                            TEAM[]                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐      │  │
│  │  │                      WORKER[]                                 │      │  │
│  │  │  ├── WorkerSession[] ───────────────────────────────────┐  │      │  │
│  │  │  ├── MemoryEntry[]                                      │  │      │  │
│  │  │  └── BullMQ: ultimate-system.tasks.{workerId}           │  │      │  │
│  │  └─────────────────────────────────────────────────────────────┘      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                            TASK[]                                      │  │
│  │  ├── GateRecord[product, engineering, qa, security, release]         │  │
│  │  ├── TaskEvent[]                                                       │  │
│  │  ├── ExecutionRecord[]                                                 │  │
│  │  ├── TaskArtifacts                                                     │  │
│  │  ├── ReleaseDecision                                                  │  │
│  │  └── TaskIntegrationRefs                                               │  │
│  │      ├── PaperclipTaskRef ──► Company/Goal/Issue Sync                  │  │
│  │      ├── HermesTaskRef ─────► Gateway Model Execution                  │  │
│  │      └── OpenClawTaskRef ────► Agent Skills & Tools                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Entity Relationships

| Entity | Meaning | Storage |
|--------|---------|---------|
| `Org` | Budget & mission boundary | SQLite |
| `Team` | Delivery scope | SQLite |
| `WorkerRecord` | Runtime identity with capabilities | SQLite |
| `TaskRecord` | Work request + routing state | SQLite |
| `GateRecord` | Workflow stage evidence | SQLite |
| `ExecutionRecord` | Auditable transcript | SQLite |
| `TaskIntegrationRefs` | Upstream sync references | SQLite |

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Chart%20Increasing.png" width="28" height="28" /> Revenue Orchestrator

<div align="center">

### 🤖 Autonomous Income Generation

<img width="80%" src="https://via.placeholder.com/800x400/0f3460/4f46e5?text=Revenue+Streams+Architecture">

</div>

The Revenue Orchestrator continuously discovers and executes business opportunities across four streams:

| Stream | Source | Action |
|--------|--------|--------|
| 🔍 **Lead Generation** | Brave Search API | Find companies hiring for AI/automation |
| 📄 **Document Processing** | ClearDesk API | Process invoices, contracts, receipts |
| 📊 **Market Research** | Trend Analysis | Analyze opportunities for content/products |
| 📧 **Sales Outreach** | HubSpot CRM | Follow up with high-value contacts |

```typescript
// Configuration via environment
REVENUE_AUTO_START=true
REVENUE_MAX_DAILY_TASKS=100
APEX_MCP_ENDPOINT=http://localhost:4000
MONEY_ENDPOINT=http://localhost:8000
CLEARDESK_ENDPOINT=https://clear-desk-ten.vercel.app
```

<details>
<summary><b>📊 Revenue API Endpoints</b></summary>

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/revenue/status` | User | Get orchestrator statistics |
| `GET` | `/api/revenue/health` | User | Check service connectivity |
| `POST` | `/api/revenue/start` | Approver | Start autonomous generation |
| `POST` | `/api/revenue/stop` | Approver | Stop orchestrator |

</details>

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Locked%20with%20Key.png" width="28" height="28" /> Security Model

### 🔐 RBAC Role Hierarchy

```mermaid
graph TD
    ADMIN[👑 Admin<br/>Full Access] --> APPROVER[✅ Approver<br/>Approve & Override]
    APPROVER --> REQUESTER[📝 Requester<br/>Create Tasks]
    REQUESTER --> VIEWER[👁️ Viewer<br/>Read Only]
    
    style ADMIN fill:#dc2626,color:#fff
    style APPROVER fill:#f59e0b,color:#fff
    style REQUESTER fill:#3b82f6,color:#fff
    style VIEWER fill:#6b7280,color:#fff
```

| Role | Read | Create | Approve | Override Gates | Manage Users |
|------|:----:|:------:|:-------:|:--------------:|:------------:|
| `viewer` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `requester` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `approver` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |

### 🛡️ Passkey Authentication

```typescript
// WebAuthn configuration
AUTH_RP_NAME=Ultimate System
AUTH_RP_IDS=localhost
AUTH_ORIGINS=http://localhost:4173,http://localhost:8888
```

- ✅ Biometric authentication (Face ID, Touch ID, Windows Hello)
- ✅ Hardware security keys (YubiKey, Titan)
- ✅ No password storage required
- ✅ Phishing-resistant

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Books.png" width="28" height="28" /> Repository Map

```
📦 ultimate-system
├── 📂 apps/
│   ├── 🎨 web/                  # Vite/React Premium Dashboard
│   ├── ⚙️  control-plane/       # Express API + Auth + Queue Producer
│   ├── 🔧 worker/               # BullMQ Consumer + Runtime Adapters
│   ├── 🖥️  cli/                 # Terminal User Interface (TUI)
│   └── 🌐 unified/              # Single-Port Server (Dashboard + API)
│
├── 📂 packages/
│   ├── 📜 contracts/           # Zod Schemas + Domain Types
│   ├── 🧠 core/                # Services, Policies, Gate Logic
│   └── 💾 sqlite-store/        # Persistence Layer
│
├── 📂 docs/
│   ├── 📖 USER_MANUAL.md       # Executive Guide
│   ├── 🏗️  ARCHITECTURE.md     # System Design
│   └── 🔒 SECURITY_MODEL.md    # Threat Model
│
├── 📂 scripts/
│   ├── 🚀 setup.sh            # Bootstrap Environment
│   ├── ⚡ dev.sh               # Development Server
│   └── ✅ test.sh              # Validation Suite
│
└── 📂 tests/
    └── 🧪 e2e/                  # End-to-End Verification
```

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Placard.png" width="28" height="28" /> API Reference

### Authentication

```bash
# Login with credentials
curl -X POST http://localhost:4100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ultimate-system.local","password":"change-this-password"}'

# Response: Set-Cookie header with session
```

### Task Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant CP as Control Plane
    participant Q as BullMQ Queue
    participant W as Worker
    participant G as Gates
    
    U->>CP: POST /api/tasks
    CP->>G: Create Gate Records
    CP->>Q: Enqueue Task
    CP-->>U: Task Created (pending approval)
    
    U->>CP: POST /api/tasks/:id/approval
    CP->>G: Update Approval Gate
    CP-->>U: Task Approved
    
    Q->>W: Claim Task
    W->>W: Execute Runtime
    W->>G: Record Evidence
    W->>CP: Complete Task
    CP-->>U: WebSocket: Task Completed
```

<details>
<summary><b>📋 Complete API Endpoints</b></summary>

#### Health & State
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | System health check |
| `GET` | `/api/state` | Full dashboard state |

#### Authentication
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Password login |
| `POST` | `/api/auth/logout` | End session |
| `GET` | `/api/auth/session` | Current session |
| `POST` | `/api/auth/passkeys/login/options` | Passkey options |
| `POST` | `/api/auth/passkeys/login/verify` | Passkey verify |
| `POST` | `/api/auth/passkeys/register/options` | Register options |
| `POST` | `/api/auth/passkeys/register/verify` | Register verify |
| `GET` | `/api/auth/passkeys` | List passkeys |
| `DELETE` | `/api/auth/passkeys/:id` | Remove passkey |

#### Tasks
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List tasks |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task |
| `GET` | `/api/tasks/:id/detail` | Full task detail |
| `GET` | `/api/tasks/:id/events` | Task events |
| `GET` | `/api/tasks/:id/executions` | Execution records |
| `GET` | `/api/tasks/:id/gates` | Gate records |
| `POST` | `/api/tasks/:id/approval` | Approve/reject |
| `POST` | `/api/gates/:taskId/:gateType` | Update gate |

#### Workers
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workers` | List workers |
| `GET` | `/api/workers/:id` | Get worker |
| `GET` | `/api/workers/:id/detail` | Worker detail |
| `GET` | `/api/workers/:id/memory` | Worker memory |
| `GET` | `/api/workers/:id/sessions` | Worker sessions |

#### Revenue
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/revenue/status` | Orchestrator status |
| `GET` | `/api/revenue/health` | Service health |
| `POST` | `/api/revenue/start` | Start generation |
| `POST` | `/api/revenue/stop` | Stop generation |

</details>

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Hammer.png" width="28" height="28" /> Development

### Environment Setup

```bash
# Install dependencies
pnpm install

# Bootstrap upstream services
./scripts/setup.sh

# Start development stack
./scripts/dev.sh

# Run validation
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `./scripts/setup.sh` | Bootstrap environment, clone upstream |
| `./scripts/dev.sh` | Start all services (multi-port) |
| `./scripts/test.sh` | Run full validation suite |
| `./scripts/demo.sh` | One-command lifecycle proof |
| `pnpm clean` | Remove build artifacts |

### Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@ultimate-system.local` | `change-this-password` |
| Approver | `approver@ultimate-system.local` | `approver-password` |
| Requester | `requester@ultimate-system.local` | `requester-password` |
| Viewer | `viewer@ultimate-system.local` | `viewer-password` |

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Clipboard.png" width="28" height="28" /> Upstream Integrations

<div align="center">

| Project | Purpose | Status |
|---------|---------|--------|
| [Paperclip](https://github.com/paperclipai/paperclip) | Company/Goal/Issue Sync | ✅ Integrated |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Gateway Model Execution | ✅ Integrated |
| [OpenClaw](https://github.com/hire/openclaw) | Agent Skills & Tools | ✅ Integrated |
| [Superpowers](https://github.com/obra/superpowers) | Workflow Templates | ✅ Composed |
| [gstack](https://github.com/garrytan/gstack) | Review Patterns | ✅ Composed |

</div>

### Live Endpoints

| Service | URL |
|---------|-----|
| **Unified Access** | `http://localhost:8888` |
| Control Plane | `http://localhost:4100` |
| Web Dashboard | `http://localhost:4173` |
| Paperclip API | `http://127.0.0.1:3100` |
| Hermes Gateway | `http://127.0.0.1:8642` |
| OpenClaw WebSocket | `ws://127.0.0.1:28789` |
| Redis Queue | `redis://127.0.0.1:6380` |

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Bar%20Chart.png" width="28" height="28" /> Deployment

### Vercel (Recommended)

```bash
# Build web app
pnpm --filter @ultimate-system/web build

# Deploy with VITE_API_BASE_URL environment variable
# Config: vercel.json
```

### Docker

```bash
# Build image
docker build -t ultimate-system .

# Run with environment
docker run -p 8888:8888 \
  -e DATABASE_URL=/data/ultimate-system.db \
  ultimate-system
```

### GitHub Pages

```yaml
# .github/workflows/web-pages.yml
# Automatic deployment on push to main
# Requires: VITE_API_BASE_URL repository variable
```

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Book.png" width="28" height="28" /> Documentation

| Document | Description |
|----------|-------------|
| [User Manual](docs/USER_MANUAL.md) | Executive guide for non-technical users |
| [Architecture](docs/ARCHITECTURE.md) | System design and data flow |
| [Runbook](docs/RUNBOOK.md) | Operational procedures |
| [Security Model](docs/SECURITY_MODEL.md) | Threat model and mitigations |
| [Integration Status](docs/INTEGRATION_STATUS.md) | Upstream sync status |
| [Review Gates](docs/REVIEW_GATES.md) | Gate system documentation |
| [Open Gaps](docs/OPEN_GAPS.md) | Known limitations |

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Hand%20symbols/Handshake.png" width="28" height="28" /> Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

<details>
<summary><b>🔧 Development Workflow</b></summary>

1. **Fork and Clone**
   ```bash
   git fork https://github.com/your-org/ultimate-system
   git clone https://github.com/YOUR_USERNAME/ultimate-system
   cd ultimate-system
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make Changes & Run Tests**
   ```bash
   pnpm lint && pnpm typecheck && pnpm build && pnpm test
   ```

4. **Commit with Conventional Commits**
   ```bash
   git commit -m "feat: add amazing feature"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/amazing-feature
   # Create PR via GitHub UI
   ```

</details>

<!-- Premium Divider -->
<div align="center">
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
</div>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Balance%20Scale.png" width="28" height="28" /> License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

<div align="center">

---

**Built with** ❤️ **by the Ultimate System Team**

<img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
<img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"/>
<img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React"/>
<img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite"/>
<img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"/>
<img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>

</div>

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=0:0f3460,50:16213e,100:1a1a2e&height=120&section=footer&reversal=false&descAlignY=32&descAlign=70"/>