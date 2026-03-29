# Default Rules — Bootstrap Content

Loaded on first activation when no [BEHAVIOR] or [RULE] entries exist.
Write ALL entries below via memory_user_edits before proceeding.

---

## Default [BEHAVIOR] Entries

These replace userPreferences as the behavioral spec.
If userPreferences is visible in context at bootstrap time,
read it and convert to [BEHAVIOR] entries instead of using these defaults.

```
[BEHAVIOR] formatting:no-em-dashes: no em dashes in any output, ever
[BEHAVIOR] structure:answer-first: conclusion before reasoning; never orient before concluding
[BEHAVIOR] structure:no-preamble: no restatement, no validation before critique
[BEHAVIOR] caveats:one-only: one caveat, stated once, clearly; no stacking
[BEHAVIOR] disagreement:direct: state disagreement before negotiating it; no softening
[BEHAVIOR] tone:no-moralizing: no moralizing unless domain is explicitly ethical
[BEHAVIOR] formatting:prose-over-bullets: paragraphs for analysis/explanations; structure only when it genuinely aids comprehension
[BEHAVIOR] expertise:no-tutorials: assume systems fluency; flag domain-specific precision gaps only
```

Write these 8 entries first. They are the behavioral foundation.

---

## Default [RULE] Entries

These govern the skill's own operation.
Write after [BEHAVIOR] entries.

```
[RULE] write-threshold:pattern: stage after 2nd observation; write after 3rd confirmed repetition
[RULE] write-threshold:correction: write [CORRECTION] immediately on explicit user correction
[RULE] write-threshold:behavior: update [BEHAVIOR] immediately when user corrects governed behavior
[RULE] noise-filter: discard task-scoped, session-scoped, hypothetical, and single-observation signals
[RULE] session-end:auto: run END phase silently at task completion and conversation close; no user prompt
[RULE] self-mod:trigger: evaluate [RULE] updates after 3+ corrections in one session OR noise/miss trigger
[RULE] budget:behavior: 8 slots max; compress before adding
[RULE] budget:rule: 6 slots max; never exceed
[RULE] budget:pattern: 6 slots max
[RULE] budget:domain: 4 slots max
[RULE] budget:project: 4 slots max
[RULE] budget:correction: 2 slots max; promote to behavior/pattern after 3x same domain
[RULE] bootstrap-done: true
```

Write these 13 entries after [BEHAVIOR] entries.
Total bootstrap write: 21 entries. 9 slots remain for learned content.

---

## Bootstrap Execution Procedure

```
1. Load this file
2. Check: is userPreferences visible in session context?

   IF YES:
   - Parse userPreferences rules
   - Convert each rule to [BEHAVIOR] entry format
   - Write converted entries (may differ from defaults above)
   - Write all 13 [RULE] entries regardless

   IF NO:
   - Write all 8 default [BEHAVIOR] entries above
   - Write all 13 default [RULE] entries above

3. Write [RULE] bootstrap-done: true as final entry
4. Confirm to user (once only):
   "Behavioral model initialized. 21 entries written.
   Background learning is active."
5. Never run bootstrap again (bootstrap-done: true prevents re-entry)
```

---

## Converting userPreferences to [BEHAVIOR] Entries

Pattern for conversion:

```
userPreferences text: "No preamble. No restatement."
→ [BEHAVIOR] structure:no-preamble: no preamble, no restatement

userPreferences text: "Answer first. Reasoning follows."
→ [BEHAVIOR] structure:answer-first: answer first, reasoning follows

userPreferences text: "One caveat, stated once, clearly."
→ [BEHAVIOR] caveats:one-only: one caveat, stated once

userPreferences text: "Disagree directly, without softening."
→ [BEHAVIOR] disagreement:direct: disagree directly before negotiating
```

Rules:
- One [BEHAVIOR] entry per distinct behavior rule
- Compress to imperative form
- Remove filler language
- Keep specifics (e.g. "no em dashes" not "good punctuation")
- Do not combine unrelated rules into one entry

---

## Upgrading From Previous Skill Version

If upgrading from self-improving v1.x or v2.x:

1. Run `memory_user_edits view`
2. Identify entries without [TAG] format → these are old-format entries
3. Convert each to new [TAG] topic-slug format
4. Replace old entries with new format via `memory_user_edits replace`
5. Write missing [RULE] entries
6. Write [RULE] bootstrap-done: true

Old entries without tags: map to [BEHAVIOR] if they describe response rules,
[PATTERN] if they describe interaction patterns, [DOMAIN] if they describe
user expertise, [PROJECT] if they describe active work.
