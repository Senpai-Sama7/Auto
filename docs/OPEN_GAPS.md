# Open Gaps

This file tracks real remaining limits, not missing-core-feature theater.

## Control Store And Deployment Model

- BullMQ + Redis provide real distributed queueing, but the authoritative control store is still a shared SQLite file.
- Multi-host deployment is therefore bounded by shared-filesystem access or by replacing `SqlitePlatformStore` with a networked store implementation.

## Identity And Secrets

- Local auth and RBAC are implemented, but identities are bootstrap users stored in SQLite rather than an external IdP.
- Session cookies are local only. There is no OIDC, SAML, SCIM, or centralized secret manager.

## Cost And Budget Accuracy

- Pre-dispatch provider cost is still estimated from local pricing tables.
- Actual usage and cost are recorded after execution, but there is no upstream quota reservation before dispatch.
- Monthly budgets do not auto-reset on a calendar schedule yet.

## Search And Observability

- Worker memory search is currently `LIKE`-based rather than full-text indexed.
- Audit history, execution records, and release decisions are stored locally in SQLite and JSON files; there is no external telemetry sink or signed event stream.

## Production Packaging

- The stack is portable and locally reproducible from a clean checkout, but there is no Kubernetes, Nomad, or systemd packaging in-repo.
- Upstream Paperclip and Hermes are pinned and started locally; operating them as long-running managed services still requires deployment work outside this repository.
