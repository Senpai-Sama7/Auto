"""Causal Failure Taxonomy - Structured classification of failures.

Implements FailureClass enum with deterministic regex-based classification
for guardrails store integration.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Pattern

import structlog

from choreographer_mcp_server.models import (
    AgentId,
    AgentRole,
    CausalFingerprint,
    FailureClass,
    Phase,
    StructuredFailure,
)

logger = structlog.get_logger()


@dataclass(frozen=True)
class FailurePattern:
    """Pattern for matching failure types."""

    failure_class: FailureClass
    patterns: list[Pattern[str]]
    confidence: float  # Pattern matching confidence
    description: str


class FailureClassifier:
    """Deterministic classifier for error logs using regex patterns.

    No LLM calls - purely regex-based for deterministic, reproducible
    classification suitable for guardrails store.
    """

    def __init__(self) -> None:
        self._patterns: list[FailurePattern] = self._build_patterns()

    def _build_patterns(self) -> list[FailurePattern]:
        """Build regex patterns for each failure class."""
        return [
            # SPEC_AMBIGUITY: Specification-related issues
            FailurePattern(
                failure_class=FailureClass.SPEC_AMBIGUITY,
                patterns=[
                    re.compile(r"ambiguous|unclear|not specified|undefined behavior", re.I),
                    re.compile(r"requirement.*?conflict|contradictory requirement", re.I),
                    re.compile(r"missing.*?specification|incomplete spec", re.I),
                ],
                confidence=0.85,
                description="Specification is ambiguous or incomplete",
            ),
            # CONTEXT_ROT: Context window degradation
            FailurePattern(
                failure_class=FailureClass.CONTEXT_ROT,
                patterns=[
                    re.compile(r"context.*?exceed|token limit|window.*?full", re.I),
                    re.compile(r"cosine similarity|drift|context.*?degrad", re.I),
                    re.compile(r"lost.*?context|forgotten|earlier.*?ignored", re.I),
                ],
                confidence=0.80,
                description="Context window degradation or overflow",
            ),
            # IMPLEMENTATION_ERROR: Code bugs
            FailurePattern(
                failure_class=FailureClass.IMPLEMENTATION_ERROR,
                patterns=[
                    re.compile(r"syntax error|parse error|compilation failed", re.I),
                    re.compile(r"runtime error|exception|traceback", re.I),
                    re.compile(r"null pointer|undefined variable|type error", re.I),
                    re.compile(r"index out of range|key error|attribute error", re.I),
                ],
                confidence=0.90,
                description="Implementation contains bugs or errors",
            ),
            # VERIFICATION_FAILURE: Test/predicate failures
            FailurePattern(
                failure_class=FailureClass.VERIFICATION_FAILURE,
                patterns=[
                    re.compile(r"assertion failed|test.*?failed|expectation.*?not met", re.I),
                    re.compile(r"verification.*?fail|predicate.*?false|invariant.*?broken", re.I),
                    re.compile(r"coverage.*?below|insufficient.*?test", re.I),
                ],
                confidence=0.85,
                description="Verification or test failure",
            ),
            # INFRASTRUCTURE_FAILURE: System/environment issues
            FailurePattern(
                failure_class=FailureClass.INFRASTRUCTURE_FAILURE,
                patterns=[
                    re.compile(r"connection.*?refused|network.*?error|timeout", re.I),
                    re.compile(r"disk full|out of memory|resource.*?exhausted", re.I),
                    re.compile(r"permission denied|access denied|unauthorized", re.I),
                    re.compile(r"service unavailable|dependency.*?fail", re.I),
                ],
                confidence=0.90,
                description="Infrastructure or environment failure",
            ),
            # MESA_OPTIMIZATION: Gaming detected
            FailurePattern(
                failure_class=FailureClass.MESA_OPTIMIZATION,
                patterns=[
                    re.compile(r"gaming|shortcut|cheat|exploit", re.I),
                    re.compile(r"hardcoded.*?test|specific.*?input.*?only", re.I),
                    re.compile(r"minimal.*?implementation|barely.*?pass", re.I),
                    re.compile(r"circumvent|bypass|workaround.*?verify", re.I),
                ],
                confidence=0.75,
                description="Potential mesa-optimization or gaming detected",
            ),
            # TIMEOUT: Execution timeout
            FailurePattern(
                failure_class=FailureClass.TIMEOUT,
                patterns=[
                    re.compile(r"timeout|timed out|deadline exceeded", re.I),
                    re.compile(r"execution.*?too long|infinite loop|hang", re.I),
                ],
                confidence=0.95,
                description="Execution timeout or hang",
            ),
            # RESOURCE_EXHAUSTION: Resource limits
            FailurePattern(
                failure_class=FailureClass.RESOURCE_EXHAUSTION,
                patterns=[
                    re.compile(r"out of memory|memory limit|heap exhausted", re.I),
                    re.compile(r"disk quota exceeded|storage full", re.I),
                    re.compile(r"rate limit|quota exceeded|throttle", re.I),
                ],
                confidence=0.90,
                description="Resource limits exceeded",
            ),
            # CONTRACT_VIOLATION: Interface contract breach
            FailurePattern(
                failure_class=FailureClass.CONTRACT_VIOLATION,
                patterns=[
                    re.compile(r"precondition.*?fail|postcondition.*?fail", re.I),
                    re.compile(r"interface.*?violation|contract.*?breach", re.I),
                    re.compile(r"invariant.*?violated|assumption.*?broken", re.I),
                ],
                confidence=0.85,
                description="Interface contract or invariant violation",
            ),
            # UNCERTAINTY_ESCALATION: Explicit uncertainty
            FailurePattern(
                failure_class=FailureClass.UNCERTAINTY_ESCALATION,
                patterns=[
                    re.compile(r"uncertain|not sure|ambiguous|need clarification", re.I),
                    re.compile(r"cannot determine|insufficient information", re.I),
                    re.compile(r"human.*?review|manual intervention", re.I),
                ],
                confidence=0.70,
                description="Agent explicitly reported uncertainty",
            ),
        ]

    def classify(self, error_message: str, stack_trace: str | None = None) -> FailureClass:
        """Classify an error into FailureClass.

        Args:
            error_message: Primary error message
            stack_trace: Optional stack trace for additional context

        Returns:
            FailureClass classification
        """
        text_to_classify = error_message
        if stack_trace:
            text_to_classify += " " + stack_trace

        best_match: FailureClass | None = None
        best_confidence = 0.0
        matched_patterns = []

        for pattern in self._patterns:
            for regex in pattern.patterns:
                if regex.search(text_to_classify):
                    matched_patterns.append(pattern.failure_class.value)
                    if pattern.confidence > best_confidence:
                        best_confidence = pattern.confidence
                        best_match = pattern.failure_class
                    break

        if best_match:
            logger.debug(
                "failure_classified",
                classification=best_match.value,
                confidence=best_confidence,
                matched_patterns=matched_patterns,
            )
            return best_match

        # Default to implementation error if no match
        logger.debug("failure_default_classification", classification="implementation_error")
        return FailureClass.IMPLEMENTATION_ERROR

    def classify_with_confidence(
        self, error_message: str, stack_trace: str | None = None
    ) -> tuple[FailureClass, float]:
        """Classify with confidence score."""
        text_to_classify = error_message
        if stack_trace:
            text_to_classify += " " + stack_trace

        best_match: FailureClass | None = None
        best_confidence = 0.0

        for pattern in self._patterns:
            for regex in pattern.patterns:
                if regex.search(text_to_classify):
                    if pattern.confidence > best_confidence:
                        best_confidence = pattern.confidence
                        best_match = pattern.failure_class
                    break

        if best_match:
            return best_match, best_confidence

        return FailureClass.IMPLEMENTATION_ERROR, 0.50

    def get_classification_explanation(self, failure_class: FailureClass) -> str:
        """Get human-readable explanation for failure class."""
        explanations = {
            FailureClass.SPEC_AMBIGUITY: "The specification was ambiguous or incomplete",
            FailureClass.CONTEXT_ROT: "Context window degraded or was exceeded",
            FailureClass.IMPLEMENTATION_ERROR: "Code contained bugs or syntax errors",
            FailureClass.VERIFICATION_FAILURE: "Tests or verification predicates failed",
            FailureClass.INFRASTRUCTURE_FAILURE: "System or infrastructure issue occurred",
            FailureClass.MESA_OPTIMIZATION: "Potential gaming or shortcutting detected",
            FailureClass.TIMEOUT: "Execution exceeded time limits",
            FailureClass.RESOURCE_EXHAUSTION: "Resource limits were exceeded",
            FailureClass.CONTRACT_VIOLATION: "Interface contracts were violated",
            FailureClass.UNCERTAINTY_ESCALATION: "Agent reported explicit uncertainty",
        }
        return explanations.get(failure_class, "Unknown failure type")


# ============================================================================
# Causal Fingerprint Generation
# ============================================================================


def generate_causal_fingerprint(
    agent_id: AgentId,
    role: AgentRole,
    error_message: str,
    context_hash: str | None = None,
) -> CausalFingerprint:
    """Generate deterministic causal fingerprint for failure.

    The fingerprint is a hash of:
    - Agent identity (role + id)
    - Error message (normalized)
    - Context hash (if available)

    This allows for deterministic matching of similar failures.
    """
    # Normalize error message
    normalized_error = error_message.lower().strip()
    normalized_error = re.sub(r"\s+", " ", normalized_error)
    normalized_error = re.sub(r"0x[0-9a-f]+", "<ADDR>", normalized_error)  # Remove addresses
    normalized_error = re.sub(r"\d+", "<NUM>", normalized_error)  # Remove numbers

    # Create fingerprint data
    fingerprint_data = f"{role.value}:{agent_id}:{normalized_error}"
    if context_hash:
        fingerprint_data += f":{context_hash}"

    # Generate hash (first 32 chars of SHA-256)
    full_hash = hashlib.sha256(fingerprint_data.encode()).hexdigest()
    return CausalFingerprint(full_hash[:32])


def fingerprint_similarity(fp1: CausalFingerprint, fp2: CausalFingerprint) -> float:
    """Calculate similarity between two fingerprints.

    Returns 0.0 to 1.0 where 1.0 is identical.
    """
    if fp1 == fp2:
        return 1.0

    # Simple hamming distance on hex characters
    matches = sum(c1 == c2 for c1, c2 in zip(fp1, fp2))
    return matches / len(fp1)


# ============================================================================
# Structured Failure Factory
# ============================================================================


class StructuredFailureFactory:
    """Factory for creating StructuredFailure objects."""

    def __init__(self) -> None:
        self.classifier = FailureClassifier()

    def create_from_error(
        self,
        agent_id: AgentId,
        role: AgentRole,
        phase: Phase,
        error_message: str,
        stack_trace: str | None = None,
        context_window_hash: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> StructuredFailure:
        """Create structured failure from error information."""
        # Classify the failure
        failure_class = self.classifier.classify(error_message, stack_trace)

        # Generate causal fingerprint
        fingerprint = generate_causal_fingerprint(
            agent_id=agent_id,
            role=role,
            error_message=error_message,
            context_hash=context_window_hash,
        )

        return StructuredFailure(
            failure_class=failure_class,
            causal_fingerprint=fingerprint,
            agent_role=role,
            agent_id=agent_id,
            phase=phase,
            error_message=error_message,
            stack_trace=stack_trace,
            context_window_hash=context_window_hash,
            metadata=metadata or {},
        )

    def batch_classify(
        self,
        errors: list[tuple[str, str | None]],
    ) -> list[tuple[FailureClass, float]]:
        """Classify multiple errors efficiently."""
        return [self.classifier.classify_with_confidence(msg, trace) for msg, trace in errors]


# ============================================================================
# Guardrails Retrieval
# ============================================================================


class GuardrailsRetriever:
    """Retrieve relevant guardrails for context construction."""

    def __init__(self, classifier: FailureClassifier | None = None) -> None:
        self.classifier = classifier or FailureClassifier()

    def find_relevant_guardrails(
        self,
        guardrails: list[StructuredFailure],
        current_error: str,
        top_k: int = 3,
    ) -> list[StructuredFailure]:
        """Find most relevant guardrails for current error.

        Uses causal fingerprint matching and failure class similarity.
        """
        if not guardrails:
            return []

        # Classify current error
        current_class = self.classifier.classify(current_error)

        # Score each guardrail
        scored = []
        for guardrail in guardrails:
            score = 0.0

            # Same failure class bonus
            if guardrail.failure_class == current_class:
                score += 1.0

            # Text similarity (simple)
            error_words = set(current_error.lower().split())
            guardrail_words = set(guardrail.error_message.lower().split())
            if error_words and guardrail_words:
                jaccard = len(error_words & guardrail_words) / len(error_words | guardrail_words)
                score += jaccard

            scored.append((score, guardrail))

        # Sort by score descending and return top_k
        scored.sort(key=lambda x: x[0], reverse=True)
        return [g for _, g in scored[:top_k]]
