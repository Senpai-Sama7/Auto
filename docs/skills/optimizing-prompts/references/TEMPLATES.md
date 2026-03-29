# Technique Templates

## Contents
- DIRECT template
- CoT (Chain-of-Thought) template
- CoT + Self-Consistency template
- ToT (Tree-of-Thought) template
- PAL (Program-Aided Language) template
- Self-Refine (Creative) template
- RAG (Retrieval-Augmented) template
- GoT (Graph-of-Thought) template

---

## DIRECT

```
{clarified_query}

Provide a concise, accurate answer.
```

---

## CoT (Chain-of-Thought)

```
**Task**: {task_description}

**Reasoning Process**:
1. **Interpret**: Define key terms and restate the problem
2. **Decompose**: Break into sub-problems
3. **Solve**: Address each sub-problem with evidence/logic
4. **Synthesize**: Combine into final answer

**Constraints**: {constraints_list}
**Output Format**: {desired_format}

Think step-by-step and show your reasoning.
```

---

## CoT + Self-Consistency

```
**Task**: {task_description}

**Process**: Generate 5 independent reasoning chains, then select the most consistent answer.

**Reasoning Chain Template**:
1. Interpret
2. Decompose
3. Solve
4. Conclude

**Constraints**: {constraints_list}

**Aggregation**: After generating 5 chains, identify the answer that appears most frequently
or has the strongest logical support across chains.

**Output**:
- Show all 5 reasoning chains
- Indicate consistency score (e.g., "4/5 chains agree")
- Provide final answer with confidence level
```

---

## ToT (Tree-of-Thought)

```
**Task**: {task_description}

**Process**: Explore multiple reasoning paths systematically.

**Structure**:
1. **Generate 3 initial approaches** (breadth-first exploration)
2. **For each approach**:
   - Evaluate feasibility (0-10 score)
   - Identify pros/cons
3. **Select top 2 approaches** (highest feasibility scores)
4. **Expand each** with 2-3 sub-strategies
5. **Evaluate leaf nodes** and select optimal path
6. **Execute** the winning strategy with full reasoning

**Constraints**: {constraints_list}

**Output**:
- Decision tree visualization (ASCII or structured)
- Final answer with path taken and alternatives considered
```

---

## PAL (Program-Aided Language)

```
**Task**: {task_description}

**Process**:
1. **Understand**: Restate problem in natural language
2. **Formalize**: Define inputs, outputs, and logic
3. **Code**: Write executable Python code to solve
4. **Execute**: Run code and capture output
5. **Interpret**: Translate code output back to natural language answer

**Constraints**: {constraints_list}

**Code Requirements**:
- Include assertions/tests
- Handle edge cases
- Print intermediate results for transparency

**Output**:
- Solution code
- Executed output
- Natural language interpretation
```

---

## Self-Refine (Creative)

```
**Creative Brief**:
- **Goal**: {objective}
- **Audience**: {target}
- **Tone**: {tone_descriptors}
- **Constraints**: {style_guides}

**Process**:
1. **Draft**: Generate initial version
2. **Critique**: Evaluate against dimensions:
   - Clarity (0-10)
   - Emotional resonance (0-10)
   - Originality (0-10)
   - Constraint adherence (0-10)
3. **Refine**: Address weaknesses identified in critique
4. **Validate**: Final quality check

**Output**:
- Draft v1
- Critique (scores + reasoning)
- Draft v2 (refined)
- Final quality scores
```

---

## RAG (Retrieval-Augmented Generation)

```
**Query**: {user_query}

**Process**:
1. **Retrieve**: Search for relevant information sources
2. **Synthesize**: Integrate retrieved information into coherent answer
3. **Cite**: Provide source references

**Retrieved Context**:
[Search results or knowledge base excerpts]

**Synthesized Answer**:
{response_with_inline_citations}

**Sources**:
[1] {source_1}
[2] {source_2}
```

---

## GoT (Graph-of-Thought for Planning)

```
**Planning Task**: {task_description}

**Process**: Build a dependency graph of sub-tasks.

**Structure**:
1. **Identify nodes** (sub-tasks, decisions, deliverables)
2. **Identify edges** (dependencies, information flow)
3. **Optimize path** (critical path, parallelization opportunities)
4. **Execute plan** step-by-step

**Graph Representation**:
Node A → Node B → Node D
  ↓
Node C -----→ Node D

**Execution Order**: [Topologically sorted list]

**Output**: Step-by-step plan with dependencies explicitly marked.
```
