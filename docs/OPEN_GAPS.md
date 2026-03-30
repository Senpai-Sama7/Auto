# Open Gaps

This file tracks real remaining limits, not missing-core-feature theater.

## Control Store And Deployment Model

- BullMQ + Redis provide real distributed queueing, but the authoritative control store is still a shared SQLite file.
- Multi-host deployment is therefore bounded by shared-filesystem access or by replacing `SqlitePlatformStore` with a networked store implementation.

## Identity And Secrets

- Local auth and RBAC are implemented, but identities are bootstrap users stored in SQLite rather than an external IdP.
- Session cookies are local only. There is no OIDC, SAML, SCIM, or centralized secret manager.

## Cost And Budget Accuracy

- ✅ Pre-dispatch quota reservation is now enforced via `BudgetPolicy.canDispatch()` before task claim.
- ✅ Monthly budgets auto-reset on calendar month boundaries via `BudgetResetService`.
- Actual usage and cost are recorded after execution.

## Search And Observability

- ✅ Worker memory search now uses SQLite FTS5 full-text search with prefix matching and rank-based ordering.
- Audit history, execution records, and release decisions are stored locally in SQLite and JSON files; there is no external telemetry sink or signed event stream.

## Production Packaging

- The stack is portable and locally reproducible from a clean checkout, but there is no Kubernetes, Nomad, or systemd packaging in-repo.
- Upstream Paperclip and Hermes are pinned and started locally; operating them as long-running managed services still requires deployment work outside this repository.
