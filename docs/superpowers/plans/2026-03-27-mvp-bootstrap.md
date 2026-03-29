# MVP Bootstrap Implementation Plan

> For agentic workers: this plan encodes the Superpowers discipline even though execution in this repo is host-neutral.

**Goal:** Bootstrap a runnable control plane, worker runtime, persistence layer, and dashboard.

**Architecture:** Separate API, worker, and UI apps over shared contracts and SQLite persistence.

**Tech Stack:** Node.js, TypeScript, Express, React, Vite, SQLite, Vitest.

---

### Task 1: Create repository structure and architecture docs

- [x] Add root manifests and workspace files.
- [x] Add architecture docs, assumptions, ADRs, and build log seed.

### Task 2: Define typed contracts

- [ ] Add shared domain types for orgs, teams, workers, tasks, events, memory, and gates.
- [ ] Add API DTOs and event definitions.

### Task 3: Implement orchestration interfaces and services

- [ ] Add store interfaces and orchestration services.
- [ ] Add deterministic worker runtime behavior and gate evaluation flow.

### Task 4: Add SQLite persistence

- [ ] Add schema initialization and store implementations.
- [ ] Add seeded org, team, and worker bootstrap.

### Task 5: Implement API, worker, and dashboard

- [ ] Add the control-plane API.
- [ ] Add the polling worker.
- [ ] Add the dashboard UI.

### Task 6: Add workflow assets and hardening docs

- [ ] Add review, QA, security, and release docs plus helper scripts.
- [ ] Add CI and local run scripts.

### Task 7: Verify with tests and demo flow

- [ ] Add happy-path orchestration tests.
- [ ] Add adapter contract tests.
- [ ] Add a demo script and final runbook.
