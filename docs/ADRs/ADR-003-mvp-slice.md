# ADR-003: MVP Slice

## Status

Accepted

## Context

The first slice needed to prove orchestration, persistence, governance, and visibility. The hardened slice now also needs to avoid obviously synthetic behavior.

## Decision

The maintained slice must include:

1. Control-plane task creation with approval, idempotency, retry, and budget metadata.
2. Worker execution through an explicit adapter boundary.
3. Persistent worker memory, sessions, and execution transcripts.
4. Structured review and release gates with rule evidence.
5. One local deterministic runtime and one real provider-backed runtime.
6. A dashboard that exposes task detail, gate evidence, executions, sessions, and memory.
7. Tests that cover failure paths, not just the happy path.

The slice is still intentionally local-first. It does not need distributed queueing or production auth to be valid.

## Consequences

### Positive

- the repo proves a full lifecycle from task creation to release decision
- the runtime is less synthetic than the original scaffold
- the portability story is stronger because setup no longer depends on a native SQLite addon
- direct upstream Paperclip and Hermes services are exercised in the supported local path

### Negative

- provider pre-dispatch cost remains estimated
- the shared SQLite control store still constrains cross-host deployment
- shell execution remains available as a debug fallback even though Docker is the supported sandbox
