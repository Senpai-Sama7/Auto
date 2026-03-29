# Assumptions

## Operating Assumptions

1. The repository began as a greenfield monorepo and is being hardened in place rather than replaced.
2. TypeScript/Node remains the integration language because the control plane, dashboard, scripts, and most host tooling are Node-native.
3. One local SQLite database is still the correct smallest runnable deployment shape.
4. Direct upstream Paperclip and Hermes integrations should be run as external pinned services rather than copied into the local app layer.
5. A deterministic worker mode is useful because it proves orchestration, persistence, and governance through real repository commands.
6. Provider-backed execution must still be bounded by local verification and typed contracts.
7. Portability from a clean clone is more important than native-driver performance for this stage, which is why the store now uses `node:sqlite` instead of `better-sqlite3`.

## Upstream Interpretation Assumptions

1. Paperclip remains the reference for the control-plane layer: governance, routing, budgets, heartbeats, and auditability.
2. Hermes remains the reference for the worker-runtime layer and is invoked through its upstream gateway for provider-backed execution.
3. Superpowers remains the reference for execution discipline, not a runtime dependency.
4. gstack remains the reference for structured review and release hardening, not a slash-command dependency.

## Still Out of Scope

1. External identity-provider integration.
2. Replacing the shared SQLite control store with a network database.
3. Centralized secrets management and signed audit streams.
4. Production packaging beyond the local scripts.
