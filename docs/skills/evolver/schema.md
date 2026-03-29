# Memory Entry Schema

## Entry Format

```
[TAG] topic-slug: description (max 120 chars recommended)
```

All entries written via `memory_user_edits add` or `replace`.
Read via `memory_user_edits view` — returns numbered list.

---

## Category Definitions and Examples

### [BEHAVIOR] — Replaces userPreferences

Rules that govern every response in every session.
Applied at session start. Updated when user corrects behavior.

```
[BEHAVIOR] formatting:no-em-dashes: never use em dashes in any output
[BEHAVIOR] formatting:prose-over-bullets: use paragraphs for analysis, not bullet lists
[BEHAVIOR] structure:answer-first: conclusion before reasoning, always
[BEHAVIOR] caveats:one-only: state one caveat clearly, never stack caveats
[BEHAVIOR] disagreement:direct: disagree directly, no softening before stating the disagreement
[BEHAVIOR] preamble:none: no restatement of question, no validation before critique
[BEHAVIOR] tone:no-moralizing: no moralizing unless the domain is explicitly ethical
[BEHAVIOR] expertise:assume-systems: treat systems thinking as native, skip the tutorial
```

Entry count: target 6-8, hard cap 8. Compress before adding.

### [RULE] — Skill's Operational Parameters

Controls the skill's own behavior. Writable by the skill (self-modification).
Updated when performance data suggests a rule is miscalibrated.

```
[RULE] write-threshold:pattern: promote to memory after 3 repetitions in session
[RULE] write-threshold:correction: write immediately on explicit user correction
[RULE] noise-filter: reject task-scoped, hypothetical, and one-time instructions
[RULE] session-end:trigger: task completion + natural conversation close
[RULE] self-mod:interval: review [RULE] entries after detecting 3+ corrections in one session
[RULE] bootstrap-done: true
```

Entry count: target 5-6, hard cap 6. Never exceed — these are the engine.

### [PATTERN] — Recurring Interaction Patterns

What this specific user does repeatedly that shapes how to interact with them.
NOT inferred from single events. Must be observed 3+ times.

```
[PATTERN] auditing:security-first: in code reviews, lead with security vulnerabilities before architecture
[PATTERN] delivery:files-not-prose: prefers downloadable files over in-chat code blocks for long content
[PATTERN] iteration:build-then-critique: wants full build before critique pass, not interleaved
[PATTERN] depth:no-tutorials: has systems fluency, flag domain-specific precision issues only
```

Entry count: target 4-6, hard cap 6. Must be empirically observed, not inferred.

### [DOMAIN] — Domain Knowledge About This User

What they know deeply, what they know as an informed outsider, what they don't know.
Prevents over-explaining things they're native in, and flags where to add rigor.

```
[DOMAIN] native: systems architecture, AI/ML application, influence psychology, cross-domain synthesis
[DOMAIN] outsider: formal ML theory, clinical psychology, quant finance
[DOMAIN] precision-flag: domain-specific technical authority matters — call it out when relevant
[DOMAIN] stack: React, TypeScript, Vite, Tailwind, Vercel, Python, SQLite, GCP, Claude API
```

Entry count: target 3-4, hard cap 4.

### [PROJECT] — Active Project Context

High-signal context about what the user is actively building.
Updated when project status changes or new project becomes primary.

```
[PROJECT] cleardesk: AI-powered AR document processing, mid-market freight brokers, primary product
[PROJECT] douglasmitchell-info: Next.js 15 / Sanity / Tailwind v4 personal blog, active build sprint
[PROJECT] reliant-ai: organizational frame for all projects, not a standalone product
```

Entry count: target 2-4, hard cap 4. Retire projects that are no longer active.

### [CORRECTION] — Explicit Corrections Audit Trail

Logged for pattern tracking. After 3 corrections in same domain,
the root pattern should be promoted to [BEHAVIOR] and this entry retired.

```
[CORRECTION] 2026-03-14:path-traversal: str.startswith() is not safe for path containment — use Path.relative_to()
[CORRECTION] 2026-03-14:shell-injection: ["bash","-c",cmd] doesn't prevent injection from cmd contents
```

Entry count: target 0-2. These are temporary. Promote to [PATTERN] or [BEHAVIOR] then delete.

---

## De-Duplication Rules

Before any write, scan all existing entries for:

1. **Exact topic match**: same `[TAG] topic-slug` exists → replace, do not add
2. **Overlapping scope**: two entries describe aspects of same behavior →
   merge into one entry before adding new information
3. **Contradiction**: new entry contradicts existing entry → replace with
   more specific/recent version
4. **Subsumption**: new entry is a specific case of existing general rule →
   evaluate whether to generalize or keep specific

Example merge:
```
BEFORE:
  [BEHAVIOR] tone:direct: be direct
  [BEHAVIOR] tone:no-soften: don't soften disagreements

AFTER (merged):
  [BEHAVIOR] tone:direct-no-soften: be direct; disagree without softening; no pre-negotiation
```

---

## Compression Rules

When compressing verbose entries:

- Remove filler words: "always", "never", "make sure to"
  → these are implied by the category
- State the rule as minimal imperative
- Keep specifics that are non-obvious: "no em dashes" is specific; "be clear" is noise
- Include the "why" only if it changes how the rule applies in edge cases

```
BAD:  [BEHAVIOR] formatting: always make sure you never use em dashes in any output ever
GOOD: [BEHAVIOR] formatting:no-em-dashes: no em dashes in any output
```

---

## Entry Lifecycle

```
Observation → Staging buffer (in-context, session only)
     ↓
Write criteria check (see engine.md)
     ↓
De-duplication scan
     ↓
memory_user_edits add/replace (silent write)
     ↓
Active memory (persists across sessions)
     ↓
Compaction (when budget pressure)
     ↓
[CORRECTION] → promote to [BEHAVIOR]/[PATTERN] after 3x same domain
[PATTERN] → remains unless contradicted or user retires project
[BEHAVIOR] → evolves in place via replace, never deleted unless user asks
[RULE] → self-modifies via skill evaluation
```
