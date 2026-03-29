# ADR-001: System Layering

## Status

Accepted

## Context

The user requested a non-equal-weight synthesis of Paperclip, Hermes, Superpowers, and gstack. The build needed a real runnable system, not a conceptual mashup.

## Decision

Use a layered architecture:

- Paperclip informs the control plane.
- Hermes informs the worker runtime.
- Superpowers informs the execution protocol.
- gstack informs the review, QA, security, and release layer.

The implementation must compose these responsibilities instead of blending them into one undifferentiated runtime.

## Consequences

### Positive

- Each upstream influence remains legible.
- Integration boundaries stay explicit.
- Future upstream adapters can be swapped independently.
- The MVP can stay small without abandoning the long-term model.

### Negative

- Some capabilities are duplicated in thin local form before direct upstream embeds exist.
- Cross-layer data contracts need deliberate design instead of implicit coupling.
