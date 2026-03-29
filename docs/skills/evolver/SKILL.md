---
name: autonomous-learner
version: 3.0.0
description: >
  Background learning system that persists user preferences, behavioral
  patterns, and corrections across sessions WITHOUT requiring user-facing
  confirmation dialogs. Activates automatically on session start. Writes
  silently at session end. Self-modifies its own operational rules over
  time. Replaces static userPreferences with an evolving behavioral model.
  Trigger this skill at the start of every conversation and whenever the
  user corrects behavior, expresses preferences, or completes significant
  work.
---

## Platform Reality

The only write path that survives session boundaries on claude.ai:

| Mechanism | Survives? | User interaction required? |
|---|---|---|
| `memory_user_edits` | YES | No — tool fires silently |
| `~/` filesystem | NO | N/A |
| In-context state | NO | N/A |

"Persistent without user-facing writes" means: writes happen automatically
without prompting the user to approve them. The tool call is visible in UI
history if inspected, but requires zero user action. This is the closest
possible approximation in this environment — it IS the target behavior.

Load `references/engine.md` for detailed pattern-detection logic.
Load `references/schema.md` for entry format specification.
Load `references/default-rules.md` for bootstrap defaults on first activation.

---

## Four Properties — Implementation Map

### 1. Background Learning System
Pattern detection runs silently after every significant task completion.
No user prompting. No approval dialogs. Evaluation happens in the
background of normal conversation flow. See: Session Lifecycle → END phase.

### 2. Self-Modifying Agent
The skill's own operational rules are stored as [RULE] entries in memory.
When the skill detects a rule is producing suboptimal behavior, it updates
that entry via `memory_user_edits replace`. Future sessions run under the
updated rule. The skill rewrites itself from its own outputs.
See: Self-Modification Protocol.

### 3. Persistent Without User-Facing Writes
Writes trigger automatically at session end. No "should I remember this?"
No "would you like me to log that?" The skill evaluates, decides,
and writes. The user is never asked to participate.

### 4. Substitute for userPreferences
[BEHAVIOR] entries replace static userPreferences. They start from
defaults (or bootstrap from existing userPreferences on first run) and
evolve based on observed corrections. Unlike userPreferences, they can
become more specific, more nuanced, and self-correct over time.

---

## Activation Protocol

Run at the START of every session, silently:

```
1. memory_user_edits view
2. Classify entries by category tag
3. Load all [BEHAVIOR] entries into active context — these govern ALL
   responses for this session (formatting, tone, output rules)
4. Load [RULE] entries — these govern the skill's own behavior
5. Identify [PROJECT] and [DOMAIN] entries relevant to current task
6. Set session-stage = START
7. Initialize in-context staging buffer (empty list)
```

Do NOT report this to the user unless they ask. Activation is silent.
If no memory entries exist: run Bootstrap Protocol before continuing.

---

## Session Lifecycle

### START phase (on activation)
- Read memory (see Activation Protocol)
- Apply [BEHAVIOR] entries to all responses this session
- Note any [RULE] entries affecting evaluation thresholds

### DURING phase (continuous, silent)
Track in-context staging buffer. Do NOT write to memory during the
session. Stage only. This prevents partial writes from incomplete
interactions.

Add to staging buffer when:
- User explicitly corrects a behavior
- User states a preference (explicit, not implied)
- User repeats the same instruction (track count)
- A pattern appears 3x in session (configurable via [RULE])
- Task completion reveals something about how user wants work done
- The skill makes a mistake and identifies the cause

Do NOT add to staging buffer:
- Task-scoped instructions ("in this file, use X")
- One-time context ("right now I need Y")
- Hypotheticals and examples
- Information the skill already has in memory

### END phase (triggers: task complete, conversation natural close,
             user says "done" / "thanks" / "that's it")
Run silently:

```
1. Review staging buffer
2. For each staged item:
   a. Apply write criteria (see engine.md)
   b. Check for existing entry covering same topic
      → YES: evaluate replace vs. keep
      → NO: evaluate add vs. discard
3. Execute all qualifying writes via memory_user_edits
4. Run self-modification check on [RULE] entries
5. Clear staging buffer
6. If writes occurred: compact summary in next response
   Format: "Session log: +2 entries, 1 updated."
   Do NOT enumerate what was written unless user asks.
```

---

## Memory Categories

All entries tagged with category in format: `[TAG] topic: content`

| Tag | Purpose | Slot budget |
|---|---|---|
| `[BEHAVIOR]` | Formatting, tone, output rules — replaces userPreferences | 8 |
| `[RULE]` | Skill's own operational parameters — enables self-modification | 6 |
| `[PATTERN]` | Recurring interaction patterns about this user | 6 |
| `[DOMAIN]` | Domain knowledge: what user knows, doesn't know, works in | 4 |
| `[PROJECT]` | Active project context | 4 |
| `[CORRECTION]` | Explicit corrections for tracking | 2 |

Total: 30 slots. Budget is enforced. Before any write, check slot count
per category. If category is at budget: a new entry requires replacing
a lower-value existing entry, not appending.

---

## Write Protocol (Silent)

```
BEFORE EVERY WRITE:
1. memory_user_edits view
2. Search for entries with same topic or overlapping scope
3. Decision tree:
   - Exact topic match → replace (not add)
   - Overlapping scope → merge into single updated entry
   - New topic, category under budget → add
   - New topic, category at budget → replace lowest-utility entry
   - Does not meet write criteria → discard
4. Execute write
5. No user-facing confirmation
```

Entry format: `[TAG] topic-slug: plain-text description of rule/pattern`

Keep entries under 80 characters where possible. Verbose entries decay
in usefulness as context fills. Compress aggressively.

---

## Self-Modification Protocol

The skill's [RULE] entries control its own behavior. These are writable
by the skill itself. This is the self-modification mechanism.

Examples of [RULE] entries the skill maintains:
```
[RULE] write-threshold: promote pattern to memory after 3 session repetitions
[RULE] noise-filter: reject task-scoped and hypothetical instructions
[RULE] behavior-budget: max 8 [BEHAVIOR] entries, compress before adding
[RULE] session-end: always run END phase, no exceptions
[RULE] self-mod-trigger: review [RULE] entries after 5 sessions with new corrections
[RULE] bootstrap-done: true
```

**When to update [RULE] entries:**

- Write threshold is producing noise (too many weak entries) → raise threshold
- Write threshold is missing important patterns → lower threshold
- A category budget is consistently insufficient → adjust budget
- A detection trigger is producing false positives → tighten definition
- End phase is running too frequently / infrequently → adjust trigger

Update via `memory_user_edits replace` on the relevant line number.
No user involvement. The skill rewrites its own operating parameters.

---

## Bootstrap Protocol

Run on first activation when no [BEHAVIOR] or [RULE] entries exist.

```
1. Check: is there a userPreferences block in context?
   YES → read it, convert each rule to [BEHAVIOR] entry
   NO  → load references/default-rules.md, write default entries

2. Write default [RULE] entries (operational parameters)

3. Write [RULE] bootstrap-done: true

4. Report to user ONCE: "First run — behavioral model initialized
   from [source: userPreferences / defaults]. X entries written."
   Do not report again.
```

Load `references/default-rules.md` for default entry content.

---

## userPreferences Substitution

Once [BEHAVIOR] entries exist in memory, they are the behavioral spec.
The skill reads [BEHAVIOR] entries at session start and applies them to
ALL responses — exactly like userPreferences, but evolvable.

Key difference: if the user corrects a behavior covered by a [BEHAVIOR]
entry, the skill:
1. Updates the [BEHAVIOR] entry to match the correction
2. Does not require the user to manually update userPreferences
3. Logs the correction to [CORRECTION] for audit trail

Over time, [BEHAVIOR] entries become more specific and accurate than
any static userPreferences block because they incorporate observed
corrections rather than just stated intentions.

---

## Slot Management

30 entries is a hard constraint. The skill manages this actively:

**Compaction triggers:**
- Any category hits its budget before a qualifying write
- Total entries exceed 27 (3-slot buffer)

**Compaction rules:**
1. Merge entries with overlapping scope into single entry
2. Remove entries that haven't been applied in 5+ sessions
   (track via session-count in entry if needed)
3. Generalize multiple specific corrections into one rule
4. Never remove [RULE] entries without first verifying replacement
5. Never remove a correction the user explicitly asked to keep

**Priority order when compacting:**
[RULE] > [BEHAVIOR] > [DOMAIN] > [PROJECT] > [PATTERN] > [CORRECTION]

---

## Reference Files

| File | Load when |
|---|---|
| `references/schema.md` | Need entry format details or examples |
| `references/engine.md` | Need pattern detection or write criteria logic |
| `references/default-rules.md` | First activation / bootstrap |
