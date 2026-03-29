"""Verification safety - Composed Predicate Engine.

Implements infrastructure conflict detection to ensure verification layers
have no shared exploit surface (Independence Preservation).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import structlog

from choreographer_mcp_server.models import FailureClass

logger = structlog.get_logger()


@dataclass(frozen=True)
class InfrastructureRequirement:
    """Infrastructure required by a verification predicate."""

    name: str
    resource_type: str  # e.g., "mock_framework", "compiler", "test_runner"
    critical_properties: frozenset[str] = field(default_factory=frozenset)


@dataclass
class PredicateDefinition:
    """Definition of a verification predicate."""

    name: str
    required_infrastructure: list[InfrastructureRequirement]
    verification_method: str  # "static_analysis", "unit_test", "integration_test", "formal"
    coverage_scope: str  # "module", "integration", "system"


@dataclass
class CompositionVulnerabilityError(Exception):
    """Raised when predicates share exploitable infrastructure."""

    predicate1: str
    predicate2: str
    shared_infrastructure: list[str]
    message: str = ""

    def __str__(self) -> str:
        return (
            f"Composition vulnerability between '{self.predicate1}' and '{self.predicate2}': "
            f"shared infrastructure: {', '.join(self.shared_infrastructure)}. "
            f"{self.message}"
        )


class PredicateCompositionValidator:
    """Validates that composed predicates have disjoint infrastructure.

    Ensures Independence Preservation: No shared exploit surface between
    verification layers, preventing gaming across multiple predicates.
    """

    def __init__(self) -> None:
        self._predicates: dict[str, PredicateDefinition] = {}
        self._checked_compositions: set[tuple[str, str]] = set()

    def register_predicate(self, definition: PredicateDefinition) -> None:
        """Register a predicate definition."""
        self._predicates[definition.name] = definition
        logger.debug("predicate_registered", name=definition.name)

    def validate_composition(
        self, predicate1_name: str, predicate2_name: str
    ) -> None:
        """Validate that two predicates can be safely composed.

        Checks for:
        1. Shared infrastructure resources
        2. Critical property overlap
        3. Method diversity

        Args:
            predicate1_name: First predicate name
            predicate2_name: Second predicate name

        Raises:
            CompositionVulnerabilityError: If predicates share exploitable infrastructure
        """
        # Skip if already checked
        key = tuple(sorted([predicate1_name, predicate2_name]))
        if key in self._checked_compositions:
            return

        p1 = self._predicates.get(predicate1_name)
        p2 = self._predicates.get(predicate2_name)

        if not p1 or not p2:
            logger.warning(
                "predicate_not_registered",
                p1=predicate1_name,
                p2=predicate2_name,
            )
            return

        # Check for shared infrastructure
        shared = self._find_shared_infrastructure(p1, p2)

        if shared:
            error = CompositionVulnerabilityError(
                predicate1=predicate1_name,
                predicate2=predicate2_name,
                shared_infrastructure=shared,
                message="Predicates share infrastructure that could be gamed simultaneously",
            )
            logger.error(
                "composition_vulnerability_detected",
                p1=predicate1_name,
                p2=predicate2_name,
                shared=shared,
            )
            raise error

        # Check for method diversity (different verification methods preferred)
        if p1.verification_method == p2.verification_method:
            logger.warning(
                "verification_method_overlap",
                p1=predicate1_name,
                p2=predicate2_name,
                method=p1.verification_method,
            )

        self._checked_compositions.add(key)
        logger.debug(
            "composition_validated",
            p1=predicate1_name,
            p2=predicate2_name,
        )

    def validate_composition_set(self, predicate_names: list[str]) -> None:
        """Validate all pairwise compositions in a set.

        Args:
            predicate_names: List of predicate names to compose

        Raises:
            CompositionVulnerabilityError: If any pair shares infrastructure
        """
        for i, p1 in enumerate(predicate_names):
            for p2 in predicate_names[i + 1 :]:
                self.validate_composition(p1, p2)

    def _find_shared_infrastructure(
        self, p1: PredicateDefinition, p2: PredicateDefinition
    ) -> list[str]:
        """Find shared infrastructure between predicates."""
        shared = []

        # Extract infrastructure names
        p1_resources = {
            (req.resource_type, frozenset(req.critical_properties))
            for req in p1.required_infrastructure
        }
        p2_resources = {
            (req.resource_type, frozenset(req.critical_properties))
            for req in p2.required_infrastructure
        }

        # Find exact resource type matches
        p1_types = {req.resource_type for req in p1.required_infrastructure}
        p2_types = {req.resource_type for req in p2.required_infrastructure}
        shared_types = p1_types & p2_types

        for resource_type in shared_types:
            # Check if critical properties also overlap
            p1_props = self._get_critical_properties(p1, resource_type)
            p2_props = self._get_critical_properties(p2, resource_type)

            if p1_props & p2_props:  # Non-empty intersection
                shared.append(resource_type)

        return shared

    def _get_critical_properties(
        self, predicate: PredicateDefinition, resource_type: str
    ) -> frozenset[str]:
        """Get critical properties for a resource type."""
        for req in predicate.required_infrastructure:
            if req.resource_type == resource_type:
                return req.critical_properties
        return frozenset()

    def get_diversification_recommendation(
        self, predicate_names: list[str]
    ) -> dict[str, Any]:
        """Get recommendations for improving predicate diversification.

        Returns:
            Dict with recommendations for method diversity, infrastructure diversity
        """
        predicates = [self._predicates.get(name) for name in predicate_names]
        predicates = [p for p in predicates if p]

        if not predicates:
            return {"error": "No predicates registered"}

        methods_used = {p.verification_method for p in predicates}
        infrastructure_used = {
            req.resource_type
            for p in predicates
            for req in p.required_infrastructure
        }

        recommendations = {
            "current_methods": list(methods_used),
            "current_infrastructure": list(infrastructure_used),
            "method_diversity_score": len(methods_used) / len(predicates),
            "recommendations": [],
        }

        # Recommend method diversity
        all_methods = {
            "static_analysis",
            "unit_test",
            "integration_test",
            "property_based_test",
            "formal_verification",
            "fuzzing",
        }
        missing_methods = all_methods - methods_used
        if missing_methods:
            recommendations["recommendations"].append(
                f"Consider adding predicates using: {', '.join(missing_methods)}"
            )

        # Recommend infrastructure diversity
        if len(infrastructure_used) < len(predicates):
            recommendations["recommendations"].append(
                "Multiple predicates share infrastructure - diversify resources"
            )

        return recommendations


# ============================================================================
# Predefined Predicates
# ============================================================================


def create_standard_predicates() -> dict[str, PredicateDefinition]:
    """Create standard predicate definitions for common verification methods."""

    return {
        "unit_tests": PredicateDefinition(
            name="unit_tests",
            required_infrastructure=[
                InfrastructureRequirement(
                    name="pytest",
                    resource_type="test_framework",
                    critical_properties=frozenset({"assertion_logic", "mocking"}),
                ),
                InfrastructureRequirement(
                    name="coverage",
                    resource_type="coverage_tool",
                    critical_properties=frozenset({"line_coverage", "branch_coverage"}),
                ),
            ],
            verification_method="unit_test",
            coverage_scope="module",
        ),
        "integration_tests": PredicateDefinition(
            name="integration_tests",
            required_infrastructure=[
                InfrastructureRequirement(
                    name="pytest",
                    resource_type="test_framework",
                    critical_properties=frozenset({"fixture_management"}),
                ),
                InfrastructureRequirement(
                    name="docker",
                    resource_type="container_runtime",
                    critical_properties=frozenset({"isolation", "service_deps"}),
                ),
            ],
            verification_method="integration_test",
            coverage_scope="integration",
        ),
        "type_check": PredicateDefinition(
            name="type_check",
            required_infrastructure=[
                InfrastructureRequirement(
                    name="mypy",
                    resource_type="static_analyzer",
                    critical_properties=frozenset({"type_inference", "generic_checking"}),
                ),
            ],
            verification_method="static_analysis",
            coverage_scope="module",
        ),
        "lint": PredicateDefinition(
            name="lint",
            required_infrastructure=[
                InfrastructureRequirement(
                    name="ruff",
                    resource_type="static_analyzer",
                    critical_properties=frozenset({"style_rules", "complexity_metrics"}),
                ),
            ],
            verification_method="static_analysis",
            coverage_scope="module",
        ),
        "property_tests": PredicateDefinition(
            name="property_tests",
            required_infrastructure=[
                InfrastructureRequirement(
                    name="hypothesis",
                    resource_type="test_framework",
                    critical_properties=frozenset({"strategies", "shrinking"}),
                ),
            ],
            verification_method="property_based_test",
            coverage_scope="module",
        ),
        "formal_verification": PredicateDefinition(
            name="formal_verification",
            required_infrastructure=[
                InfrastructureRequirement(
                    name="z3",
                    resource_type="theorem_prover",
                    critical_properties=frozenset({"smt_solving", "proof_generation"}),
                ),
            ],
            verification_method="formal_verification",
            coverage_scope="module",
        ),
    }


# ============================================================================
# Integration with Ralph Loop
# ============================================================================


class VerifiedRalphLoop:
    """Ralph loop with predicate composition validation."""

    def __init__(self, validator: PredicateCompositionValidator | None = None) -> None:
        self.validator = validator or PredicateCompositionValidator()
        self._registered_predicates: set[str] = set()

        # Register standard predicates
        for name, definition in create_standard_predicates().items():
            self.validator.register_predicate(definition)

    def validate_predicate_set(self, predicate_names: list[str]) -> None:
        """Validate a set of predicates before using in Ralph loop."""
        self.validator.validate_composition_set(predicate_names)
        self._registered_predicates.update(predicate_names)

    def get_safety_report(self) -> dict[str, Any]:
        """Get safety validation report."""
        return self.validator.get_diversification_recommendation(
            list(self._registered_predicates)
        )
