#!/usr/bin/env python3
"""
DSPy Prompt Optimization Engine
Compiles and optimizes prompts using metrics-driven teleprompters.

Usage:
    python dspy_prompt_optimizer.py --task "Explain quantum entanglement" --dev-set examples.json
"""

import argparse
import json
import re
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

import dspy
from dspy.teleprompt import BootstrapFewShotWithRandomSearch
from dspy.evaluate import Evaluate


# ============================================================================
# CONFIGURATION
# ============================================================================

@dataclass
class ToolCapabilities:
    code_execution: bool = False
    web_search: bool = False
    file_access: bool = False
    multimodal: bool = False
    memory: bool = False


# ============================================================================
# SCORING FUNCTIONS
# ============================================================================

class PromptAnalyzer:
    @staticmethod
    def compute_ambiguity_score(prompt: str) -> float:
        pronouns = ['it', 'this', 'that', 'they', 'them', 'these', 'those']
        pronoun_count = sum(prompt.lower().count(f' {p} ') for p in pronouns)

        missing_constraints = 0
        if not any(m in prompt.lower() for m in ['goal', 'objective', 'task', 'need to']):
            missing_constraints += 3
        if not any(m in prompt.lower() for m in ['format', 'output', 'should', 'must', 'require']):
            missing_constraints += 2
        if len(prompt.split()) < 10:
            missing_constraints += 1.5

        vague_verbs = ['help', 'do', 'make', 'fix', 'handle', 'deal with']
        vague_verb_count = sum(prompt.lower().count(v) for v in vague_verbs)

        return min(10, pronoun_count * 2 + missing_constraints * 1.5 + vague_verb_count)

    @staticmethod
    def compute_complexity_score(prompt: str) -> float:
        reasoning_markers = {
            'simple': ['what is', 'define', 'list'],
            'moderate': ['explain', 'how', 'why', 'compare'],
            'complex': ['analyze', 'evaluate', 'synthesize', 'design', 'optimize'],
        }
        prompt_lower = prompt.lower()
        reasoning_depth = 1
        if any(m in prompt_lower for m in reasoning_markers['complex']):
            reasoning_depth = 8
        elif any(m in prompt_lower for m in reasoning_markers['moderate']):
            reasoning_depth = 4
        elif any(m in prompt_lower for m in reasoning_markers['simple']):
            reasoning_depth = 2

        dependency_markers = ['then', 'after', 'given', 'first', 'next', 'finally']
        interdependencies = sum(prompt_lower.count(m) for m in dependency_markers)

        return min(10, reasoning_depth * 0.8 + interdependencies * 1.5)

    @staticmethod
    def classify_task(prompt: str) -> str:
        p = prompt.lower()
        if any(m in p for m in ['code', 'function', 'debug', 'python', 'javascript', 'bug', 'refactor']):
            return "CODE"
        if any(m in p for m in ['why', 'how does', 'explain', 'prove', 'logic']):
            return "REASONING"
        if any(m in p for m in ['write', 'generate', 'create story', 'imagine', 'design']):
            return "CREATIVE"
        if any(m in p for m in ['analyze', 'summarize', 'data', 'table', 'statistics']):
            return "DATA"
        if any(m in p for m in ['help', 'plan', 'organize', 'approach']):
            return "META"
        return "FACTUAL"


class OutputValidator:
    @staticmethod
    def compute_completeness_score(output: str, constraints: List[str]) -> float:
        score = 3.0
        if constraints:
            addressed = sum(1 for c in constraints if c.lower() in output.lower())
            score += (addressed / len(constraints)) * 3
        else:
            score += 3
        placeholders = ['TODO', 'XXX', '[insert', 'placeholder', 'TBD']
        if not any(p in output for p in placeholders):
            score += 3
        if len(output.split()) > 20:
            score += 1
        return min(10, score)

    @staticmethod
    def compute_confidence(technique: str, output: str, metadata: Dict[str, Any]) -> float:
        if technique == "DIRECT":
            return 70.0
        elif technique == "CoT":
            has_structure = any(m in output.lower() for m in ['first', 'then', 'therefore', 'because'])
            return 70.0 + (20.0 if has_structure else 0)
        elif technique == "CoT_SELF_CONSISTENCY":
            return metadata.get('agreement_rate', 0.6) * 100
        elif technique == "PAL":
            return 95.0 if metadata.get('execution_success', False) else 60.0
        return 75.0


# ============================================================================
# DSPy SIGNATURES
# ============================================================================

class AnalyzePrompt(dspy.Signature):
    """Analyze user prompt and compute metrics."""
    prompt = dspy.InputField(desc="User's input prompt")
    ambiguity_score = dspy.OutputField(desc="Ambiguity score 0-10")
    complexity_score = dspy.OutputField(desc="Complexity score 0-10")
    task_type = dspy.OutputField(desc="FACTUAL|REASONING|CODE|CREATIVE|DATA|META")


class GenerateClarifyingQuestions(dspy.Signature):
    """Generate targeted clarifying questions."""
    prompt = dspy.InputField(desc="User's ambiguous prompt")
    ambiguity_score = dspy.InputField(desc="Computed ambiguity score")
    questions = dspy.OutputField(desc="JSON array of 1-3 clarifying questions")


class OptimizeWithCoT(dspy.Signature):
    """Generate response using Chain-of-Thought."""
    task = dspy.InputField(desc="Clarified task description")
    constraints = dspy.InputField(desc="List of constraints")
    reasoning = dspy.OutputField(desc="Step-by-step reasoning process")
    answer = dspy.OutputField(desc="Final answer")


class OptimizeWithPAL(dspy.Signature):
    """Generate response using Program-Aided Language."""
    task = dspy.InputField(desc="Task requiring code-based solution")
    constraints = dspy.InputField(desc="List of constraints")
    code = dspy.OutputField(desc="Executable Python code")
    explanation = dspy.OutputField(desc="Natural language explanation")
    answer = dspy.OutputField(desc="Final answer from code execution")


class OptimizeCreative(dspy.Signature):
    """Generate creative content with self-refinement."""
    task = dspy.InputField(desc="Creative task description")
    tone = dspy.InputField(desc="Desired tone/style")
    constraints = dspy.InputField(desc="Style constraints")
    draft = dspy.OutputField(desc="Initial creative draft")
    critique = dspy.OutputField(desc="Self-critique with scores")
    refined = dspy.OutputField(desc="Refined version addressing critique")


# ============================================================================
# DSPy MODULE
# ============================================================================

class PromptOptimizerModule(dspy.Module):
    def __init__(self, tools: ToolCapabilities):
        super().__init__()
        self.tools = tools
        self.analyzer = PromptAnalyzer()
        self.validator = OutputValidator()
        self.analyze = dspy.ChainOfThought(AnalyzePrompt)
        self.clarify = dspy.ChainOfThought(GenerateClarifyingQuestions)
        self.cot = dspy.ChainOfThought(OptimizeWithCoT)
        self.pal = dspy.ChainOfThought(OptimizeWithPAL)
        self.creative = dspy.ChainOfThought(OptimizeCreative)

    def forward(self, prompt: str, constraints: str = "", user_clarifications: str = ""):
        ambiguity = self.analyzer.compute_ambiguity_score(prompt)
        complexity = self.analyzer.compute_complexity_score(prompt)
        task_type = self.analyzer.classify_task(prompt)

        if ambiguity >= 3.0 and not user_clarifications:
            clarification = self.clarify(prompt=prompt, ambiguity_score=str(ambiguity))
            return dspy.Prediction(
                needs_clarification=True, questions=clarification.questions,
                ambiguity_score=ambiguity, complexity_score=complexity, task_type=task_type
            )

        effective_prompt = f"{prompt}\n\nAdditional context: {user_clarifications}" if user_clarifications else prompt
        technique = self._select_technique(task_type, complexity, self.tools)

        if technique == "PAL" and self.tools.code_execution:
            result = self.pal(task=effective_prompt, constraints=constraints)
            output = f"**Code:**\n```python\n{result.code}\n```\n\n**Explanation:**\n{result.explanation}\n\n**Answer:**\n{result.answer}"
            metadata = {'execution_success': True}
        elif technique == "SELF_REFINE":
            result = self.creative(task=effective_prompt, tone="engaging and clear", constraints=constraints)
            output = f"**Draft:**\n{result.draft}\n\n**Critique:**\n{result.critique}\n\n**Refined:**\n{result.refined}"
            metadata = {}
        else:
            result = self.cot(task=effective_prompt, constraints=constraints)
            output = f"**Reasoning:**\n{result.reasoning}\n\n**Answer:**\n{result.answer}"
            metadata = {}

        constraint_list = [c.strip() for c in constraints.split('\n') if c.strip()]
        completeness = self.validator.compute_completeness_score(output, constraint_list)
        confidence = self.validator.compute_confidence(technique, output, metadata)

        return dspy.Prediction(
            needs_clarification=False, output=output, technique=technique,
            ambiguity_score=ambiguity, complexity_score=complexity,
            completeness_score=completeness, confidence=confidence, task_type=task_type
        )

    def _select_technique(self, task_type: str, complexity: float, tools: ToolCapabilities) -> str:
        if complexity <= 3.0:
            return "DIRECT"
        if task_type == "REASONING":
            if complexity <= 6.0: return "CoT"
            elif complexity <= 8.0: return "CoT_SELF_CONSISTENCY"
            else: return "ToT"
        if task_type == "CODE":
            return "PAL" if tools.code_execution else "CoT"
        if task_type == "CREATIVE":
            return "SELF_REFINE"
        if task_type == "DATA":
            return "PAL" if tools.code_execution else "CoT"
        return "CoT"


# ============================================================================
# EVALUATION METRIC
# ============================================================================

def quality_metric(example, pred, trace=None):
    if pred.needs_clarification:
        return 1.0 if example.ambiguity_expected else 0.5
    if not pred.output or len(pred.output) < 50:
        return 0.0
    score = (pred.completeness_score / 10) * 0.5 + (pred.confidence / 100) * 0.5
    if hasattr(example, 'expected_technique') and example.expected_technique:
        if pred.technique == example.expected_technique:
            score += 0.2
    return min(1.0, score)


# ============================================================================
# CLI
# ============================================================================

def load_dev_set(filepath: str) -> List[dspy.Example]:
    with open(filepath, 'r') as f:
        data = json.load(f)
    return [
        dspy.Example(
            prompt=item['prompt'],
            constraints=item.get('constraints', ''),
            expected_output=item.get('expected_output', ''),
            ambiguity_expected=item.get('ambiguity_expected', False),
            expected_technique=item.get('expected_technique', None)
        ).with_inputs('prompt', 'constraints')
        for item in data
    ]


def main():
    parser = argparse.ArgumentParser(description="DSPy Prompt Optimization Engine")
    parser.add_argument("--task", required=True, help="Task prompt to optimize")
    parser.add_argument("--constraints", default="", help="Constraints (optional)")
    parser.add_argument("--dev-set", help="Path to dev set JSON for optimization")
    parser.add_argument("--model", default="gpt-4", help="LM to use")
    parser.add_argument("--optimize", action="store_true", help="Run teleprompter optimization")
    parser.add_argument("--code-exec", action="store_true", help="Enable code execution")
    parser.add_argument("--web-search", action="store_true", help="Enable web search")
    args = parser.parse_args()

    lm = dspy.OpenAI(model=args.model)
    dspy.settings.configure(lm=lm)

    tools = ToolCapabilities(code_execution=args.code_exec, web_search=args.web_search)
    optimizer_module = PromptOptimizerModule(tools=tools)

    if args.optimize and args.dev_set:
        print("Loading dev set...")
        dev_set = load_dev_set(args.dev_set)
        print(f"Optimizing with {len(dev_set)} examples...")
        teleprompter = BootstrapFewShotWithRandomSearch(
            metric=quality_metric, max_bootstrapped_demos=3,
            max_labeled_demos=3, num_candidate_programs=5
        )
        optimized_module = teleprompter.compile(student=optimizer_module, trainset=dev_set)
        optimized_module.save("optimized_prompt_engine.json")
        optimizer_module = optimized_module

    print(f"\nProcessing task: {args.task}\n")
    result = optimizer_module(prompt=args.task, constraints=args.constraints)

    if result.needs_clarification:
        print("CLARIFICATION NEEDED:")
        print(result.questions)
    else:
        print("=" * 80)
        print(f"TECHNIQUE: {result.technique}")
        print(f"TASK TYPE: {result.task_type}")
        print(f"AMBIGUITY: {result.ambiguity_score:.1f}/10")
        print(f"COMPLEXITY: {result.complexity_score:.1f}/10")
        print(f"COMPLETENESS: {result.completeness_score:.1f}/10")
        print(f"CONFIDENCE: {result.confidence:.1f}%")
        print("=" * 80)
        print("\nOUTPUT:")
        print(result.output)


if __name__ == "__main__":
    main()
