# Learning Engine

## Pattern Detection — What Triggers Evaluation

The skill evaluates for a potential write whenever it detects a signal.
Signals are classified by strength. Only HIGH and MEDIUM signals advance
to write criteria check. LOW signals are discarded.

### HIGH signals — always evaluate for write

| Signal | Detection | Category candidate |
|---|---|---|
| Explicit correction | "no, that's wrong" / "actually" / "stop doing X" | [CORRECTION] → [BEHAVIOR] |
| Explicit preference | "I always want" / "never do Y" / "my preference is" | [BEHAVIOR] |
| Repeated instruction | Same rule stated 3+ times in session | [BEHAVIOR] |
| Stated expertise boundary | "I know X, don't explain it" / "I don't know Y" | [DOMAIN] |
| Project declaration | "I'm building X" / "this is for Y project" | [PROJECT] |

### MEDIUM signals — evaluate after session, not immediately

| Signal | Detection | Category candidate |
|---|---|---|
| Implicit style preference | Pattern of accepting certain output format, rejecting another | [BEHAVIOR] |
| Consistent workflow | Same sequence of steps requested in 3+ sessions | [PATTERN] |
| Domain usage pattern | Consistently uses/avoids certain frameworks, tools | [DOMAIN] / [PROJECT] |
| Correction cluster | 3 corrections in same domain within session | [BEHAVIOR] |

### LOW signals — discard, do not stage

| Signal | Reason to discard |
|---|---|
| Single-session instruction | "in this file, use tabs" |
| Task-scoped preference | "for this response, be brief" |
| Hypothetical or example | "what if I wanted X?" |
| Praise of specific output | Single positive reaction to one output |
| Silence / lack of correction | Cannot infer preference from absence |

---

## Write Criteria — What Qualifies for a Permanent Write

A staged item qualifies for write when ALL of the following are true:

### Criterion 1: Generalizability
The pattern applies beyond this conversation and this specific task.
Ask: "Would this change how I respond in a completely different conversation
with this user on a different topic?"
YES → qualifies. NO → discard.

### Criterion 2: Non-redundancy
The information is not already covered by an existing memory entry.
Run: scan all entries for same topic-slug or overlapping scope.
If covered → evaluate replace/merge instead of add.

### Criterion 3: Slot value
The entry justifies occupying one of 30 permanent slots.
Ask: "Is this more useful than the lowest-value existing entry in its category?"
YES → qualifies. NO → discard unless category has open slots.

### Criterion 4: Minimum signal strength
- [BEHAVIOR] entries: HIGH signal minimum. MEDIUM only if 3+ corroborating signals.
- [PATTERN] entries: MEDIUM minimum, 3x repetition confirmed.
- [RULE] entries: Only written by self-modification protocol.
- [DOMAIN] entries: HIGH signal only. Stated by user, not inferred.
- [PROJECT] entries: HIGH signal only. User named the project.
- [CORRECTION] entries: Any explicit user correction qualifies immediately.

---

## Self-Modification Triggers

The skill evaluates whether to update [RULE] entries under these conditions:

### Trigger 1: Correction cluster
3+ corrections in one session targeting similar behavior.
Signal: current rules are miscalibrated. 
Action: review [RULE] write-threshold:pattern — consider raising threshold or
narrowing detection criteria for that signal type.

### Trigger 2: Noise accumulation
Session END phase finds 5+ staged items, but fewer than 2 qualify for write.
Signal: detection is too broad — capturing too much noise.
Action: update [RULE] noise-filter to exclude detected noise pattern.

### Trigger 3: Miss detection
User explicitly asks "why didn't you remember X?" when X was observed 4+ times.
Signal: write threshold too high or signal detection too narrow.
Action: lower [RULE] write-threshold:pattern by 1 repetition minimum.

### Trigger 4: Category overflow
A category repeatedly hits its budget before important entries can be written.
Signal: budget allocation is wrong for this user.
Action: update [RULE] entry for that category budget. Adjust from adjacent
lower-priority category.

### Trigger 5: [BEHAVIOR] correction
User corrects behavior that is already governed by a [BEHAVIOR] entry.
Signal: the [BEHAVIOR] entry is wrong or too general.
Action: update the [BEHAVIOR] entry immediately (not deferred to session end).
This is the only write that happens DURING session rather than at END.

---

## Write Execution Order

At session END, writes execute in this sequence:

```
1. [RULE] self-modification (if triggered) — update engine first
2. [BEHAVIOR] updates (corrections to existing behavioral rules)
3. [BEHAVIOR] new entries (new behavioral rules)
4. [CORRECTION] entries (explicit corrections for audit)
5. [DOMAIN] updates
6. [PROJECT] updates
7. [PATTERN] new entries
8. [CORRECTION] → promote to [BEHAVIOR] if 3x same domain
```

Rationale: modify the engine's rules before applying them, so any
threshold changes take effect before evaluating whether to write [PATTERN]
and [DOMAIN] entries.

---

## Compaction Engine

Triggered when any category hits budget before a qualifying write.

```
STEP 1: Identify compaction target
  → category at budget with qualifying new entry waiting

STEP 2: Score existing entries in category
  Scoring factors:
    - Recency (estimated from content)
    - Specificity (specific rules > vague guidelines)
    - Correction-backed (came from explicit correction > inferred)
    - Cross-session applicability (broad applicability > narrow)

STEP 3: Identify lowest-scoring entry
  → candidate for replacement or merger

STEP 4: Can it be merged with another entry?
  YES → merge, free slot, add new entry
  NO  → replace with new entry

STEP 5: Execute via memory_user_edits replace
```

Never compact [RULE] entries without a qualifying replacement ready.
Never compact an entry the user explicitly asked to keep.

---

## Anti-Patterns — What This Engine Must Not Do

These are failure modes that waste slots or produce wrong behavior:

**Do not infer from silence.** If the user didn't correct something, that
is not evidence they approve of it. Only explicit signals qualify.

**Do not write specifics of completed tasks.** "User built a Rust binary
on March 14" is not a [PROJECT] entry. "User is actively building ClearDesk"
is a [PROJECT] entry.

**Do not write personality observations.** "User prefers directness" is
already captured in [BEHAVIOR] entries. Don't duplicate as [PATTERN].

**Do not write redundant [DOMAIN] entries.** "User knows Python" and
"User writes Python code" are the same fact. One entry.

**Do not stack corrections.** If 3 corrections all target the same root
behavior, that's one [BEHAVIOR] update — not 3 [CORRECTION] entries.

**Do not write the user's emotional state.** "User seemed frustrated" is
not a learnable pattern for behavior. Discard.
