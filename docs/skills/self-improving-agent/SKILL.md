---
name: self-improving
version: 2.0.0
description: >
  Real cross-session learning via memory_user_edits.
  No filesystem fiction. No fake timers. No HOT/WARM/COLD.
  One actual persistent write path, used correctly.
---

## What Actually Persists (and What Doesn't)

| Layer | Survives sessions? | Mechanism |
|---|---|---|
| `memory_user_edits` entries | YES | Injected into every future conversation |
| `~/self-improving/` files | NO | Filesystem resets on claude.ai conversation boundaries |
| In-context tracking | NO | Dies with the session |

The original skill routes all "permanent" learning through a filesystem that evaporates.
This version routes it through the only write path that actually works.

---

## Architecture

```
WITHIN SESSION
  ↓
  In-context staging (no files needed for normal sessions)
  ↓
  Correction meets write criteria?
  ↓ YES
  memory_user_edits add/replace  ←── THE ONLY REAL PERSISTENCE

LONG SESSIONS (50+ exchanges, many pending corrections)
  ↓
  Stage to ~/session-log.md to avoid losing track mid-session
  ↓
  Bulk review at session end → promote qualifying corrections to memory
```

---

## Activation Protocol

On skill activation, run in this order:

1. Call `memory_user_edits view`
2. Report to user:
   - Entry count and approximate slot usage (max 30)
   - Any entries directly relevant to current task
   - Confirmation that session tracking is active

Example activation report:
```
Self-improving active.
Memory: 7/30 entries. No entries directly relevant to current task.
Session tracking: on.
```

---

## Correction Detection Triggers

**Log and evaluate when user says:**
- "No, that's wrong..."
- "Actually it should be..."
- "You keep doing X, stop"
- "Remember that I always..."
- "I told you before..."
- "My preference is X not Y"
- "Always do X for me"
- "Never do Y"

**Do NOT log:**
- One-time context instructions ("in this file, use X")
- Factual corrections that don't reflect a behavior pattern
- Hypotheticals or examples
- Instructions scoped to the current task only

---

## Write Criteria (strict — slots are scarce)

WRITE to `memory_user_edits` only when ALL are true:

1. User explicitly corrected a behavior, OR it's a clear generalizable preference
2. The lesson applies beyond this conversation
3. No existing entry already covers it (check first with `view`)
4. Worth occupying one of 30 permanent slots

**30-entry limit is real.** Every write should displace something less useful or fill a genuinely new slot. Write ruthlessly, not generously.

---

## Write Protocol

Before any write:

```
1. memory_user_edits view          — scan existing entries
2. Does any entry cover this topic?
   YES → memory_user_edits replace (line_number, updated_text)
   NO  → memory_user_edits add (new_text)
3. Confirm to user: "Logged to memory (#N): [entry text]"
```

**Entry format:** `[DOMAIN] topic: lesson`

```
[CODE] Path traversal: use Path.relative_to() not str.startswith() — string prefix matching is bypassable
[PREF] Analysis structure: architecture verdict first, then defects ranked by severity, then what works
[PREF] Formatting: no em dashes ever; no bullet-point prose; answer before reasoning
[PATTERN] Model strings: always flag API/model ID strings as requiring live verification before deployment
[TOOL] Shell injection: ["bash","-c",cmd] only prevents Python-level word splitting; bash still parses cmd string
```

Domains: `[CODE]` `[PREF]` `[PATTERN]` `[TOOL]` `[PROJECT]` `[DOMAIN]`

---

## Self-Reflection Protocol

After completing significant work (multi-step tasks, audits, builds):

1. Did output match what was actually needed, not just what was asked?
2. What would a sharper version have done differently?
3. Is this generalizable? Does it meet write criteria?

Only promote to memory if write criteria are met.
Reflection without promotion stays in-context — don't clog memory with introspection noise.

**Reflection log format (in-context only):**
```
CONTEXT: [task type]
ISSUE: [what fell short]
LESSON: [what to do differently]
WRITE: yes/no — [reason]
```

---

## Deletion Protocol

User says "forget X" or "remove [topic]":

```
1. memory_user_edits view
2. Identify entry by keyword match
3. Confirm: "Remove entry #N: [text]? (yes/no)"
4. On confirm: memory_user_edits remove (line_number)
5. Confirm: "Removed. X/30 slots remaining."
```

---

## Query Commands

| User says | Action |
|---|---|
| "What have you learned?" | `view` → show all entries, summarize themes |
| "Memory stats" | `view` → count entries, report slot usage |
| "Show [domain] patterns" | `view` → filter by [DOMAIN] tag |
| "Forget X" | Deletion protocol |
| "Do you know about X?" | `view` → search entries for X |
| "What's in memory?" | `view` → full dump |

---

## Long Session Filesystem Use (Optional)

Only use `~/session-log.md` when:
- Session exceeds ~50 exchanges
- Multiple corrections are accumulating
- Risk of losing track before end-of-session promotion

Format:
```markdown
# Session Corrections — [date]

## Pending Review
- [correction text] | generalizes? yes/no
- [correction text] | generalizes? yes/no

## Promoted to Memory
- Entry #N: [text]
```

At session end: review pending list, promote qualifying items, discard the rest.
Delete the file after. It has no value after promotion.

---

## Limits — Stated Honestly

- **30 entries max.** No HOT/WARM/COLD tiers — that requires a background process that doesn't exist here.
- **No automatic demotion timers.** There is no cron job. Unused entries don't decay.
- **No clawhub.** Not a real tool in this environment.
- **Entries are flat.** No hierarchical namespacing within the memory system.
- **Timestamps are not stored per-entry** unless you manually include them in the text.
- **Context window fills:** if context is very long, this skill degrades to in-context tracking only. It will say so explicitly rather than silently failing.
- **Filesystem is scratch only.** Nothing written to `~/` persists across claude.ai conversations.

---

## What This Skill Is Not

It is not:
- A background learning system
- A self-modifying agent
- Persistent without user-facing writes
- A substitute for userPreferences (use that for formatting and tone rules)

It is:
- A structured protocol for deciding what's worth writing to memory
- A consistent format for those writes
- An activation routine that reads existing memory before starting work
- Honest about every constraint
