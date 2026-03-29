# Ultimate System: The Definitive User Manual

Welcome to the **Ultimate System**, the executive control plane for AI orchestration, enterprise automation, and secure task execution. This document is a comprehensive, cumulative, and consolidated guide designed for users of all technical levels—from executives and product managers to software engineers and operators.

---

## 1. Executive Summary: What is the Ultimate System?

The Ultimate System is an advanced orchestration platform that acts as the "mission control" for both human and AI workers. It does not just run AI prompts; it securely delegates complex enterprise tasks, enforces strict budget constraints, mandates human approvals, and puts every single piece of work through five rigid Quality Gates before it can be marked as "Released."

### Core Value Proposition
- **Total Control:** Nothing executes without budget clearance and Role-Based Access Control (RBAC) approvals.
- **Unified Orchestration:** Combines Node.js execution, Python-based sub-agents (via ReliantAI), and external AI gateways (Hermes, OpenClaw) into one unified pipeline.
- **Uncompromised Quality:** Every task undergoes Product, Engineering, QA, Security, and Release gating.
- **Seamless Interfaces:** Interact via a beautiful React-based Web Dashboard or a blazingly fast Interactive Terminal (CLI).

---

## 2. Real-World Use Cases

To understand the system, here is how it is applied in real enterprise scenarios:

### Use Case A: Accounts Receivable Automation (ClearDesk Integration)
**Scenario:** A financial controller needs to analyze 500 invoices and extract structured JSON data.
**Workflow:**
1. The controller logs into the Web Dashboard using biometric passkeys.
2. They submit a new task: "Analyze Q3 Invoices" with a budget cap of $10.00.
3. The system assigns this to the **ReliantAIPythonAdapter**, routing the request through the live Redis Event Bus.
4. The external Python agent (ClearDesk) processes the documents using Claude AI, generating a CSV export.
5. The Ultimate System pulls the artifacts back, runs the Security and QA Gates to ensure no PII was leaked, and marks the task as **Released**.

### Use Case B: Software Refactoring & TDD
**Scenario:** An engineering manager wants to refactor a legacy TypeScript module.
**Workflow:**
1. The manager creates a task: "Refactor `auth.ts` to use new crypto standards."
2. The task is routed to the **DeterministicRuntimeAdapter** (or Hermes Provider).
3. The AI agent writes the code and the system automatically runs the verification suite: `pnpm run lint`, `typecheck`, `build`, and `test`.
4. If a test fails, the Engineering Gate blocks the task. It remains `Failed` until fixed. The manager reviews the Audit Trail to see exactly which test failed.

---

## 3. Getting Started & Setup

### Bootstrapping the System
For engineers deploying the system locally or to production:
```bash
# 1. Install dependencies, setup SQLite DB, and pull upstream tools
./scripts/setup.sh

# 2. Boot the Ultimate System Control Plane, Worker, Web UI, and Event Bus
./scripts/dev.sh
```

### Accessing the Interfaces
- **Web Dashboard:** Open `http://localhost:4173` in your browser.
- **Control Plane API:** Runs on `http://localhost:4100` (Used for system-to-system communication).
- **Interactive CLI:** 
  ```bash
  cd apps/cli
  node index.js interactive
  ```

---

## 4. Role-Based Access Control (RBAC) & Authentication

The system uses highly secure session cookies and supports WebAuthn Passkeys.

| Role | Permissions | Best For |
|---|---|---|
| **Viewer** | Read-only access to dashboards, tasks, and audit logs. | Stakeholders, Auditors |
| **Requester** | Can create tasks and view their own tasks. | Standard Employees |
| **Approver** | Can approve/reject tasks, override gates, and manage budgets. | Managers, Tech Leads |
| **Admin** | Full system access, including system teardown and user management. | IT / Platform Team |

*Note: The system integrates seamlessly with external Auth services (like ReliantAI Auth on port 8080) for Single Sign-On (SSO).*

---

## 5. Navigating the Web Dashboard (GUI)

The Web Dashboard is the primary visual interface, designed with enterprise typography (Fraunces & IBM Plex Sans) and intuitive color coding.

### 1. The Control Panel (Home)
- **KPIs:** Instantly see total Queued, Running, Completed, and Failed tasks.
- **Budget Tracking:** View real-time organizational spend against the monthly budget limit.

### 2. Task Intake Form
- **Execution Mode:** Choose `Deterministic` (local script execution) or `Provider` (external AI API).
- **Required Capabilities:** Specify what the worker needs (e.g., `planning`, `security`, `coding`).
- **Budget Cap:** Hard limit in USD. If the estimated tokens exceed this, the task is instantly rejected.

### 3. Task Detail & Audit Trail
Clicking on a task reveals:
- **Execution Records:** Step-by-step terminal outputs of exactly what the worker did.
- **Gate Evidence:** The exact checks performed during the 5 Quality Gates.
- **Worker Memory:** A look into the AI's contextual memory used to solve the task.

---

## 6. Using the Interactive CLI (TUI)

For power users who prefer the keyboard, the `apps/cli` package offers a fully interactive terminal application.

### Available Commands:
- `node index.js interactive`: Launches a wizard that walks you through viewing tasks, creating new tasks, and checking worker health.
- `node index.js dashboard`: Prints a gorgeous, color-coded ascii dashboard of system health directly to standard output.

---

## 7. The 5 Quality Gates (Enterprise Hardening)

The Ultimate System's crowning feature is its un-bypassable gating system inspired by the strict `gstack` release protocol.

1. 📋 **Product Gate:** Verifies the presence of a `specDoc`, `planDoc`, and `acceptanceCriteria`. Did the agent actually plan the work before executing?
2. ⚙️ **Engineering Gate:** Verifies that all compilation, linting, and testing suites passed with a 0 exit code.
3. 🧪 **QA Gate:** Checks that both API and Runtime areas were successfully tested.
4. 🔒 **Security Gate:** Ensures security controls (like trust-boundary validations) were explicitly checked and no high-severity vulnerabilities were introduced.
5. 🚀 **Release Gate:** The final aggregate check. If the task is Approved, Execution Succeeded, and the prior 4 gates pass, the task status transitions to `Released`.

---

## 8. Integration Ecosystem (Under the Hood)

The Ultimate System doesn't operate in a vacuum. It is deeply integrated into a wider ecosystem:

- **ReliantAI Event Bus (Port 8081):** A Redis-backed FastAPI pub/sub system. The Ultimate System publishes state changes here so other Python services know when tasks finish.
- **ReliantAIPythonAdapter:** A specialized bridge that sends Ultimate System tasks directly to complex Python sub-agents (like Citadel, ClearDesk, or BackupIQ) for specialized processing.
- **Paperclip:** Bi-directional syncing of Goals, Issues, and Documents.
- **Hermes / OpenClaw:** Local LLM gateways that provide memory retention, MCP (Model Context Protocol) tool integration, and seamless agent routing.
- **Model Context Protocol (MCP):** The system dynamically loads MCP servers from the `mcp/` directory, allowing agents to natively talk to external APIs without hardcoding endpoints.

---

## 9. Troubleshooting & FAQ

**Q: My task is stuck in "Queued" but nothing is happening.**
*A: Check if the task requires Approval. If the estimated cost exceeds auto-approve thresholds, an `Approver` must manually click Approve in the Web Dashboard. Also, ensure the `Worker` daemon is running (`./scripts/dev.sh`).*

**Q: A task "Failed" during the Engineering Gate.**
*A: Open the Task Detail in the Web UI, click on the Execution Logs. It will show the exact terminal output (e.g., a TypeScript compiler error). Fix the code and retry.*

**Q: I want to use the Ultimate System from my Python script.**
*A: Just send a `POST /api/tasks` request to `http://localhost:4100` with the `CreateTaskInput` JSON payload. The system will handle the queuing, routing, and execution automatically.*

---
*Built with precision. Engineered for reliability. This is the Ultimate System.*