"""Mesa-Optimization Detection - Real-time monitoring for Goodhart's Law.

Implements ensemble complexity analysis and specification coverage monitoring
to detect when agents game the evaluation metrics.
"""

from __future__ import annotations

import ast
import hashlib
import re
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from choreographer_mcp_server.models import AgentId, MesaSuspicionReport, Phase

logger = structlog.get_logger()


@dataclass
class ComplexityMetrics:
    """Complexity metrics for code/implementation."""

    cyclomatic_complexity: float
    halstead_metrics: dict[str, float]
    semantic_coverage: float
    compression_ratio: float

    def ensemble_score(self) -> float:
        """Calculate ensemble complexity score (0.0 to 1.0)."""
        # Normalize each component
        cyclo_norm = min(self.cyclomatic_complexity / 20.0, 1.0)
        halstead_norm = min(self.halstead_metrics.get("difficulty", 0) / 100.0, 1.0)
        semantic_norm = 1.0 - self.semantic_coverage  # Lower coverage = higher complexity
        compression_norm = self.compression_ratio

        # Weighted ensemble
        return (
            0.25 * cyclo_norm
            + 0.25 * halstead_norm
            + 0.30 * semantic_norm
            + 0.20 * compression_norm
        )


class ComplexityEstimator:
    """Estimate code complexity using multiple metrics."""

    def __init__(self) -> None:
        pass

    def analyze(self, code: str) -> ComplexityMetrics:
        """Analyze code complexity using ensemble of metrics."""
        return ComplexityMetrics(
            cyclomatic_complexity=self._cyclomatic_complexity(code),
            halstead_metrics=self._halstead_metrics(code),
            semantic_coverage=self._semantic_coverage(code),
            compression_ratio=self._compression_ratio(code),
        )

    def _cyclomatic_complexity(self, code: str) -> float:
        """Calculate cyclomatic complexity.

        Counts decision points: if, for, while, except, with, assert, etc.
        """
        try:
            tree = ast.parse(code)
        except SyntaxError:
            # If we can't parse, estimate from keywords
            complexity = 1
            complexity += len(re.findall(r"\bif\b", code))
            complexity += len(re.findall(r"\bfor\b", code))
            complexity += len(re.findall(r"\bwhile\b", code))
            complexity += len(re.findall(r"\bexcept\b", code))
            complexity += len(re.findall(r"\bwith\b", code))
            return float(complexity)

        complexity = 1

        for node in ast.walk(tree):
            if isinstance(
                node,
                (
                    ast.If,
                    ast.For,
                    ast.While,
                    ast.ExceptHandler,
                    ast.With,
                    ast.Assert,
                    ast.comprehension,
                ),
            ):
                complexity += 1
            elif isinstance(node, ast.BoolOp):
                complexity += len(node.values) - 1

        return float(complexity)

    def _halstead_metrics(self, code: str) -> dict[str, float]:
        """Calculate Halstead complexity metrics."""
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return {"difficulty": 0.0, "volume": 0.0, "effort": 0.0}

        # Count operators and operands
        operators: set[str] = set()
        operands: set[str] = set()
        operator_count = 0
        operand_count = 0

        for node in ast.walk(tree):
            if isinstance(node, ast.operator):
                operators.add(type(node).__name__)
                operator_count += 1
            elif isinstance(node, ast.Name):
                operands.add(node.id)
                operand_count += 1
            elif isinstance(node, ast.Constant):
                operands.add(str(node.value))
                operand_count += 1

        n1 = len(operators)  # Unique operators
        n2 = len(operands)  # Unique operands
        N1 = operator_count  # Total operators
        N2 = operand_count  # Total operands

        # Avoid division by zero
        if n1 == 0 or n2 == 0:
            return {"difficulty": 0.0, "volume": 0.0, "effort": 0.0}

        # Halstead formulas
        vocabulary = n1 + n2
        length = N1 + N2

        # Volume
        if vocabulary > 0:
            volume = length * (vocabulary.bit_length())
        else:
            volume = 0.0

        # Difficulty
        difficulty = (n1 / 2) * (N2 / n2) if n2 > 0 else 0.0

        # Effort
        effort = difficulty * volume

        return {
            "difficulty": difficulty,
            "volume": volume,
            "effort": effort,
        }

    def _semantic_coverage(self, code: str) -> float:
        """Estimate semantic coverage by analyzing code structure.

        Higher score = more comprehensive implementation.
        """
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return 0.5  # Default for unparseable code

        # Count semantic elements
        functions = len([n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)])
        classes = len([n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)])
        docstrings = len(
            [
                n
                for n in ast.walk(tree)
                if isinstance(n, (ast.FunctionDef, ast.ClassDef, ast.Module))
                and ast.get_docstring(n)
            ]
        )
        type_hints = len([n for n in ast.walk(tree) if isinstance(n, ast.AnnAssign)])

        # Heuristic scoring
        score = 0.0
        score += min(functions * 0.1, 0.3)
        score += min(classes * 0.1, 0.2)
        score += min(docstrings * 0.05, 0.2)
        score += min(type_hints * 0.02, 0.1)

        # Base coverage for any code
        score = max(score, 0.2)

        return min(score, 1.0)

    def _compression_ratio(self, code: str) -> float:
        """Calculate compression ratio (higher = more repetitive/compressible).

        Uses zlib compression. Highly compressible code may be:
        - Overly repetitive (suspicious)
        - Boilerplate-heavy
        - Lacking semantic diversity
        """
        if not code:
            return 0.0

        original_size = len(code.encode())
        if original_size == 0:
            return 0.0

        compressed = zlib.compress(code.encode())
        compressed_size = len(compressed)

        # Ratio: 0 = not compressible, 1 = highly compressible
        ratio = 1.0 - (compressed_size / original_size)
        return max(0.0, min(1.0, ratio))


class SpecificationCoverageAnalyzer:
    """Analyze how well implementation covers specification requirements."""

    def __init__(self) -> None:
        pass

    def analyze(
        self,
        implementation: str,
        specification: str,
    ) -> float:
        """Calculate specification coverage ratio (0.0 to 1.0).

        Uses Jaccard distance between specification keywords and
        implementation concepts.
        """
        # Extract keywords from specification
        spec_keywords = self._extract_keywords(specification)

        # Extract concepts from implementation
        impl_concepts = self._extract_concepts(implementation)

        if not spec_keywords:
            return 1.0  # No requirements = full coverage

        if not impl_concepts:
            return 0.0  # No implementation = no coverage

        # Calculate Jaccard similarity
        intersection = spec_keywords & impl_concepts
        union = spec_keywords | impl_concepts

        if not union:
            return 0.0

        jaccard = len(intersection) / len(union)
        return jaccard

    def _extract_keywords(self, text: str) -> set[str]:
        """Extract requirement keywords from specification."""
        # Normalize
        text = text.lower()
        text = re.sub(r"[^\w\s]", " ", text)

        # Extract words
        words = set(text.split())

        # Filter to meaningful words
        stopwords = {
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "must", "shall",
            "can", "need", "dare", "ought", "used", "to", "of", "in",
            "for", "on", "with", "at", "by", "from", "as", "into",
            "through", "during", "before", "after", "above", "below",
            "between", "under", "and", "but", "or", "yet", "so",
        }

        return {w for w in words if len(w) > 2 and w not in stopwords}

    def _extract_concepts(self, code: str) -> set[str]:
        """Extract concepts from implementation code."""
        try:
            tree = ast.parse(code)
        except SyntaxError:
            # Fallback to simple keyword extraction
            return self._extract_keywords(code)

        concepts: set[str] = set()

        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                concepts.add(node.id.lower())
            elif isinstance(node, ast.FunctionDef):
                concepts.add(node.name.lower())
            elif isinstance(node, ast.ClassDef):
                concepts.add(node.name.lower())
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                # String constants might contain semantic info
                if len(node.value) < 50:  # Only short strings
                    concepts.add(node.value.lower())

        return concepts


class MesaDetector:
    """Detect potential mesa-optimization (gaming) in agent outputs.

    Monitors for:
    1. Test-aware gaming (hardcoded test inputs)
    2. Semantically minimal implementations
    3. Divergence from stated goals
    4. Sudden complexity drops
    """

    SUSPICION_THRESHOLD = 0.6
    HIGH_SUSPICION_THRESHOLD = 0.8

    def __init__(self) -> None:
        self.complexity_estimator = ComplexityEstimator()
        self.coverage_analyzer = SpecificationCoverageAnalyzer()
        self._history: list[dict[str, Any]] = []

    def analyze(
        self,
        agent_id: AgentId,
        phase: Phase,
        implementation: str,
        specification: str,
        test_results: list[bool] | None = None,
        previous_implementations: list[str] | None = None,
    ) -> MesaSuspicionReport:
        """Analyze implementation for mesa-optimization indicators.

        Returns:
            MesaSuspicionReport with suspicion score and indicators
        """
        indicators: list[str] = []

        # 1. Ensemble Complexity Analysis
        complexity = self.complexity_estimator.analyze(implementation)
        complexity_score = complexity.ensemble_score()

        if complexity_score < 0.2:
            indicators.append("Very low complexity - potentially oversimplified")
        elif complexity.compression_ratio > 0.9:
            indicators.append("Highly compressible code - repetitive patterns")

        # 2. Specification Coverage Analysis
        coverage = self.coverage_analyzer.analyze(implementation, specification)

        if coverage < 0.3:
            indicators.append(f"Low specification coverage ({coverage:.1%})")

        # 3. Test-Aware Gaming Detection
        if test_results and all(test_results):
            # All tests pass but coverage is low - suspicious
            if coverage < 0.5:
                indicators.append("All tests pass but low spec coverage - possible hardcoding")

        # 4. Divergence Detection (if history available)
        divergence_score = 0.0
        if previous_implementations:
            divergence_score = self._detect_divergence(
                implementation, previous_implementations
            )
            if divergence_score > 0.7:
                indicators.append("Implementation diverged significantly from previous")

        # Calculate overall suspicion score
        suspicion_score = self._calculate_suspicion(
            complexity_score=complexity_score,
            coverage=coverage,
            divergence=divergence_score,
            indicators=len(indicators),
        )

        # Determine recommended action
        if suspicion_score >= self.HIGH_SUSPICION_THRESHOLD:
            action = "ESCALATE_TO_ADVERSARIAL_GAME"
        elif suspicion_score >= self.SUSPICION_THRESHOLD:
            action = "REQUEST_HUMAN_REVIEW"
        else:
            action = "CONTINUE_MONITORING"

        report = MesaSuspicionReport(
            agent_id=agent_id,
            phase=phase,
            suspicion_score=suspicion_score,
            complexity_metrics={
                "cyclomatic": complexity.cyclomatic_complexity,
                "halstead_difficulty": complexity.halstead_metrics.get("difficulty", 0),
                "semantic_coverage": complexity.semantic_coverage,
                "compression_ratio": complexity.compression_ratio,
            },
            spec_coverage_ratio=coverage,
            divergence_indicators=indicators,
            recommended_action=action,
        )

        # Store in history
        self._history.append({
            "agent_id": agent_id,
            "suspicion_score": suspicion_score,
            "complexity": complexity_score,
            "coverage": coverage,
        })

        logger.info(
            "mesa_analysis_complete",
            agent_id=agent_id,
            suspicion_score=suspicion_score,
            indicators=indicators,
            action=action,
        )

        return report

    def _detect_divergence(
        self, current: str, previous: list[str]
    ) -> float:
        """Detect if current implementation diverges from previous attempts."""
        if not previous:
            return 0.0

        # Compare with most recent
        last = previous[-1]

        # Simple line-based comparison
        current_lines = set(current.split("\n"))
        last_lines = set(last.split("\n"))

        if not current_lines or not last_lines:
            return 0.0

        # Jaccard distance
        intersection = len(current_lines & last_lines)
        union = len(current_lines | last_lines)

        if union == 0:
            return 0.0

        similarity = intersection / union
        divergence = 1.0 - similarity

        return divergence

    def _calculate_suspicion(
        self,
        complexity_score: float,
        coverage: float,
        divergence: float,
        indicators: int,
    ) -> float:
        """Calculate overall suspicion score."""
        # Low complexity + low coverage = high suspicion
        suspicion = 0.0

        # Factor 1: Low complexity (oversimplification)
        if complexity_score < 0.3:
            suspicion += 0.3

        # Factor 2: Low spec coverage
        suspicion += (1.0 - coverage) * 0.3

        # Factor 3: High divergence
        suspicion += divergence * 0.2

        # Factor 4: Number of indicators
        suspicion += min(indicators * 0.1, 0.2)

        return min(suspicion, 1.0)

    def get_historical_trend(self, agent_id: AgentId | None = None) -> dict[str, Any]:
        """Get historical trend of suspicion scores."""
        if not self._history:
            return {"error": "No history available"}

        if agent_id:
            entries = [h for h in self._history if h["agent_id"] == agent_id]
        else:
            entries = self._history

        if not entries:
            return {"error": f"No history for agent {agent_id}"}

        scores = [e["suspicion_score"] for e in entries]
        return {
            "count": len(scores),
            "mean": sum(scores) / len(scores),
            "max": max(scores),
            "min": min(scores),
            "recent_trend": "increasing" if len(scores) > 1 and scores[-1] > scores[0] else "stable",
        }


# ============================================================================
# Adversarial Specification Game
# ============================================================================


class AdversarialSpecificationGame:
    """Adversarial game to stress-test specifications.

    When mesa-optimization is suspected, escalate to adversarial specification
game where one agent (Adversary) tries to find loopholes and another
    (Defender) patches them.
    """

    def __init__(self) -> None:
        self.rounds: list[dict[str, Any]] = []

    async def run_round(
        self,
        specification: str,
        implementation: str,
        adversary_agent_id: AgentId,
        defender_agent_id: AgentId,
    ) -> dict[str, Any]:
        """Run one round of adversarial specification game."""
        # In real implementation, would spawn agents
        # For now, return structure

        round_result = {
            "round": len(self.rounds) + 1,
            "adversary": adversary_agent_id,
            "defender": defender_agent_id,
            "loopholes_found": [],  # Would be populated by adversary
            "patches_applied": [],  # Would be populated by defender
            "specification_strengthened": False,
        }

        self.rounds.append(round_result)
        return round_result

    def get_strengthened_specification(self) -> str:
        """Get specification with adversarial patches applied."""
        # Combine all rounds
        return "Strengthened specification after adversarial game"
