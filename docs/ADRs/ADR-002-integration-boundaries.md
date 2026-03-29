# ADR-002: Integration Boundaries

## Status

Accepted

## Context

The upstream systems use different runtimes and host assumptions:

- Paperclip is a TypeScript control-plane system with server, UI, governance, and routing concerns.
- Hermes is a Python-first runtime with long-lived sessions, memory, and tool execution.
- Superpowers is a workflow discipline.
- gstack is a review and release playbook.

This repository needs honest boundaries so local behavior is real without pretending upstream runtimes are embedded.

## Decision

Use explicit boundaries:

- `WorkerAdapter` isolates task execution from control-plane policy.
- `MemoryStore` isolates session and memory persistence from runtime logic.
- `ReviewGate` and `ReleaseGate` isolate governance decisions from worker output.
- `EventBus` persists lifecycle evidence instead of relying on hidden in-process state.

The runtime may have multiple concrete adapters:

- deterministic local execution
- provider-backed execution
- future direct Hermes bridge

Host-specific slash-command behavior is out of scope. Only neutral docs, scripts, checklists, and explicit API/runtime contracts are used.

## Consequences

### Positive

- control-plane and worker concerns remain separated
- provider-backed execution can be added without rewriting orchestration
- direct Hermes gateway execution has a clear insertion point
- upstream branding does not leak into unsupported claims

### Negative

- upstream services add operational startup complexity
- some advanced upstream capabilities still sit behind explicit local contracts instead of being imported wholesale
