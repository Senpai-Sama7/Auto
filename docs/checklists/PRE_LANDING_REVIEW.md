# Pre-Landing Review

Adapted from gstack's pre-landing review checklist and translated into a host-neutral repo asset.

## Critical pass

- SQL and data safety
- Race conditions and concurrency
- LLM output trust boundaries
- Enum and value completeness

## Informational pass

- Conditional side effects
- Magic numbers and string coupling
- Dead code and consistency
- Test gaps
- Completeness gaps
- Distribution and CI/CD pipeline integrity

## Output contract

- Cite concrete `file:line` findings.
- Separate issues into `AUTO-FIXABLE` and `NEEDS INPUT`.
- If no issues are found, say so plainly.
