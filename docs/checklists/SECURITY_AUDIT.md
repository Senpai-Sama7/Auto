# Security Audit Checklist

Adapted from gstack's security review flow and reduced to a neutral checklist for this repository.

## Input and boundary checks

- Validate all external API payloads.
- Treat worker artifacts as untrusted data.
- Confirm no persisted artifact is executed as code.

## Persistence checks

- Confirm audit events exist for task creation, start, completion, release, and gate updates.
- Confirm budget updates occur on task completion.
- Confirm worker memory is scoped by `workerId`.

## Operational checks

- Review [SECURITY_MODEL.md](/home/donovan/Projects/Auto/docs/SECURITY_MODEL.md).
- Record any missing auth, RBAC, or sandboxing controls.
- Track unresolved items in [OPEN_GAPS.md](/home/donovan/Projects/Auto/docs/OPEN_GAPS.md).
