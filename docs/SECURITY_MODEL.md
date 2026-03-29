# Security Model

## Scope

This model covers the system as currently implemented:

- control-plane HTTP API
- worker runtime
- BullMQ + Redis job transport
- upstream Paperclip API integration
- upstream Hermes gateway integration
- Docker-backed verification sandboxes
- SQLite persistence
- dashboard UI

## Assets

- task payloads and approvals
- user identities, password hashes, and session hashes
- worker prompts and provider responses
- execution records and tool-call summaries
- worker memory and session history
- gate evidence and release decisions
- Paperclip issue/document/comment links
- org and worker budget records
- audit events

## Trust Boundaries

1. browser or API client -> control-plane API
2. control plane -> SQLite store
3. control plane -> Redis / BullMQ
4. control plane -> upstream Paperclip
5. worker runtime -> Redis / BullMQ
6. worker runtime -> SQLite store
7. worker runtime -> Docker sandbox
8. worker runtime -> upstream Hermes or OpenAI
9. dashboard -> control-plane API

## Implemented Controls

### Input and auth boundary

- Zod validation at all HTTP mutation boundaries
- local users persisted in SQLite
- password hashing via `scrypt`
- session token hashing via `sha256`
- role-enforced routes:
  - `viewer` read-only
  - `requester` can create tasks
  - `approver` and `admin` can approve and override gates

### Task integrity

- idempotency key uniqueness on task creation
- explicit approval state on every task
- capability-aware dispatch checks
- bounded retry policy
- atomic task claim with `WHERE status = 'queued'`

### Runtime integrity

- provider output parsed into typed artifacts and treated as untrusted data
- local verification commands remain authoritative
- Docker-backed verification sandbox by default
- Hermes terminal backend also configured for Docker
- execution records persist prompts, responses, usage, tool calls, and errors

### Governance integrity

- five persisted gates on every task
- release requires prior gates, approval, execution success, and satisfied release checks
- lifecycle and gate events are persisted as audit records
- worker sessions and memory writes are persisted for post-hoc inspection

## Threats And Current Responses

### Malformed or hostile task payloads

Current controls:

- `CreateTaskInputSchema`
- `ApprovalTransitionInputSchema`
- `GateTransitionInputSchema`
- `LoginInputSchema`
- `UpsertUserInputSchema`

### Duplicate task creation

Current controls:

- unique partial index on `tasks.idempotency_key`
- `TaskCreationService.findTaskByIdempotencyKey()`
- API returns the existing task for a reused key

### Concurrent task execution

Current controls:

- BullMQ delivery
- atomic SQLite claim
- concurrency coverage in the test suite

### Approval or release bypass

Current controls:

- session-backed identity
- route-level role checks
- persisted approval state
- release gate requiring prior gates, approval, execution success, and satisfied release checks

### Model hallucination or provider false claims

Current controls:

- structured parsing
- local verification suite
- rule-based gate evaluation
- provider response persisted as evidence instead of authority

### Command execution abuse

Current controls:

- Docker sandbox by default
- bounded command list in the verification suite
- execution transcript persistence

Residual risk:

- shell mode is still available for local debugging and should not be the default in shared environments

### Audit loss or ambiguity

Current controls:

- persisted events for task creation, approvals, claims, starts, retries, completion, release, heartbeats, memory writes, and gate updates
- persisted execution records
- persisted worker sessions and memory entries
- persisted release decision JSON from `pnpm release:local`

## Known Weaknesses

- bootstrap credentials live in local config unless operators override them
- no CSRF token layer is implemented on top of the cookie session
- no cryptographic signing of audit events or execution transcripts
- no dedicated secrets manager
- `node:sqlite` is an experimental Node API
- the control store is a local SQLite file rather than a networked database

## What To Treat As Untrusted

- all HTTP input
- all provider output
- all persisted artifact text
- all recalled memory content
- all upstream Paperclip and Hermes responses

Only explicit local policy, local verification commands, and persisted gate evaluation should decide task success and release.
