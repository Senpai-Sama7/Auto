---
name: optimizing-prompts
description: >
  Transforms vague or underspecified user prompts into maximally effective LLM task
  specifications. Analyzes ambiguity and complexity, asks clarifying questions when needed,
  selects optimal prompting technique (CoT, ToT, PAL, Self-Refine, RAG, GoT), and validates
  output quality with explicit scoring. Use when asked to optimize prompts, improve prompt
  engineering, build prompt pipelines, or create systematic prompt optimization workflows.
  Includes a meta-prompt template and a DSPy program.
metadata:
  author: donovan
  version: "1.0"
---

# Prompt Optimization Engine

Systematically transform user inputs into high-quality LLM task specifications using a 4-phase pipeline with explicit scoring and technique selection.

## When to use this skill

- User wants to optimize, improve, or engineer prompts
- Building a prompt pipeline or optimization workflow
- Need to select the right prompting technique for a task
- Want measurable quality scoring on prompt/response quality
- Converting the meta-prompt to a DSPy program or vice versa

## Core protocol

### Phase 1: Analyze

Compute three metrics on the input prompt:

**Ambiguity Score (0-10)**:
```
ambiguity = pronoun_count × 2 + missing_constraints × 1.5 + vague_verbs × 1
```
- Pronouns without antecedents ("it", "this", "that"): ×2 each
- Missing goal: +3, missing success criteria: +2, no output format: +1.5, no scope: +1.5
- Vague verbs ("help", "do", "make", "fix"): +1 each
- **0-2**: Clear → proceed. **3-5**: Ask 1 question. **6-10**: Ask 2-3 questions.

**Complexity Score (0-10)**:
```
complexity = reasoning_depth × 2 + interdependencies × 1.5 + constraint_conflicts × 2
```
- Simple lookup: 1. Single-step inference: 2-3. Multi-step: 4-6. Compositional/creative: 7-10.
- **0-3**: Simple (direct). **4-6**: Moderate (CoT). **7-8**: Complex (CoT+SC). **9-10**: Highly complex (ToT/GoT).

**Task Classification**: `FACTUAL | REASONING | CODE | CREATIVE | DATA | META`

Detection heuristics:
- CODE: code blocks, language names, "debug"/"refactor"/"optimize"
- REASONING: "why", "how", "explain", "prove"
- CREATIVE: "write", "generate", "design", "imagine"
- DATA: "analyze", "summarize", datasets/tables
- META: "help me", "plan", "organize", "approach"

### Phase 2: Clarify (if ambiguity ≥ 3)

Generate max 3 targeted questions tagged `[SCOPE]`, `[CONSTRAINTS]`, `[SUCCESS]`, or `[REFERENCE]`. Stop and wait for user response before proceeding.

### Phase 3: Optimize (technique selection)

Decision tree:

```
if complexity ≤ 3 → DIRECT
if FACTUAL + web_search available → RAG
if REASONING:
    complexity ≤ 6 → CoT
    complexity ≤ 8 → CoT + Self-Consistency (5 chains)
    complexity 9-10 → Tree-of-Thought
if CODE:
    code_execution available → PAL (Program-Aided Language)
    else → CoT
if CREATIVE → Self-Refine (draft → critique → refine)
if DATA:
    code_execution available → PAL
    else → CoT
if META → Graph-of-Thought (dependency graph)
default → CoT
```

Apply the corresponding template from [references/TEMPLATES.md](references/TEMPLATES.md).

### Phase 4: Validate

**Completeness (0-10)**: All constraints addressed (+3), output format matches (+2), edge cases handled (+2), no placeholders (+3).

**Confidence (0-100%)**:
- DIRECT: 90% factual, 70% subjective
- CoT: 70% base + 10% if logically sound + 10% if evidence cited
- CoT+SC: agreement_rate × 100%
- PAL: 95% if code runs, 60% if untested

Checks before delivery:
- [ ] No hallucinated citations
- [ ] No placeholder content (TODO, XXX, [insert])
- [ ] Output format matches spec
- [ ] Constraints satisfied
- [ ] Uncertainty quantified

Output metadata block:
```
Technique: {name} | Complexity: {n}/10 | Completeness: {n}/10 | Confidence: {n}%
```

## Operational rules

- **Cost-aware escalation**: If ToT or heavy self-consistency needed, notify user of cost before proceeding.
- **Tool integration**: If code execution available, validate code answers by running them. If web search available, inject RAG for time-sensitive queries.
- **Confidence < 60%**: Flag as "Low confidence, recommend verification."
- **Anti-patterns**: Never assume unstated details, generate placeholders, fabricate citations, or overstate confidence.

## Bundled resources

- **[references/TEMPLATES.md](references/TEMPLATES.md)**: Full templates for each technique (CoT, ToT, PAL, Self-Refine, RAG, GoT)
- **[references/META_PROMPT.md](references/META_PROMPT.md)**: Complete copy-paste meta-prompt for any LLM
- **[scripts/dspy_prompt_optimizer.py](scripts/dspy_prompt_optimizer.py)**: DSPy program with metrics, teleprompter, and CLI
- **[assets/dev_set.json](assets/dev_set.json)**: Example dev set for DSPy optimization

## Quick start

**Option A — Meta-prompt (any LLM)**: Copy contents of `references/META_PROMPT.md` into your LLM context, then send queries.

**Option B — DSPy program**:
```bash
pip install dspy-ai
python scripts/dspy_prompt_optimizer.py --task "your task" --model gpt-4

# With optimization against dev set:
python scripts/dspy_prompt_optimizer.py --task "your task" --dev-set assets/dev_set.json --optimize --code-exec
```

## Meta-prompt vs DSPy comparison

| Aspect | Meta-Prompt | DSPy |
|---|---|---|
| Execution | Single LLM call | Modular separate LM calls |
| Optimization | Static rules | Compiled via teleprompter |
| Metrics | Self-assessed | External Python functions |
| Tool integration | Simulated | Real execution |
| Portability | Paste anywhere | Requires DSPy + API keys |
