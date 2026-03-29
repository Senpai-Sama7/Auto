"""Tests for SpecificationAnalyzer."""

import pytest
from choreographer.utils.specification_analyzer import SpecificationAnalyzer


def test_complete_specification():
    """Test analysis of a complete specification."""
    spec = """
    Implement a REST API for user management.
    
    ## Acceptance Criteria
    - API returns 200 OK for valid requests
    - API returns 400 Bad Request for invalid input
    - All endpoints are documented
    
    ## Scope
    - In scope: User CRUD operations, authentication
    - Out of scope: OAuth, social login
    
    ## Constraints
    - Must complete within 2 weeks
    - Performance: < 100ms response time
    
    ## Context
    This replaces the legacy user management system.
    """
    
    result = SpecificationAnalyzer.analyze(spec)
    
    assert result.is_underspecified is False
    assert len(result.missing_elements) == 0


def test_underspecified_no_acceptance_criteria():
    """Test detection of missing acceptance criteria."""
    spec = "Implement a REST API."
    
    result = SpecificationAnalyzer.analyze(spec)
    
    assert result.is_underspecified is True
    assert "acceptance_criteria" in result.missing_elements


def test_underspecified_no_scope():
    """Test detection of missing scope."""
    spec = """
    Implement a REST API.
    
    Acceptance Criteria:
    - It works
    """
    
    result = SpecificationAnalyzer.analyze(spec)
    
    assert result.is_underspecified is True
    assert "scope" in result.missing_elements


def test_underspecified_too_short():
    """Test detection of insufficient detail."""
    spec = "Fix bug"
    
    result = SpecificationAnalyzer.analyze(spec)
    
    assert result.is_underspecified is True
    assert "sufficient_detail" in result.missing_elements


def test_suggestions_provided():
    """Test that suggestions are provided for missing elements."""
    spec = "Implement feature"
    
    result = SpecificationAnalyzer.analyze(spec)
    
    assert len(result.suggestions) > 0
    assert any("acceptance" in s.lower() for s in result.suggestions)


def test_extract_requirements():
    """Test requirement extraction from specification."""
    spec = """
    Features needed:
    - User authentication
    - Password reset
    1. Email verification
    2. Two-factor authentication
    """
    
    reqs = SpecificationAnalyzer.extract_key_requirements(spec)
    
    assert len(reqs) >= 2
    assert any("authentication" in r for r in reqs)


def test_extract_requirements_empty():
    """Test requirement extraction with no bullet points."""
    spec = "Just some plain text without any structure."
    
    reqs = SpecificationAnalyzer.extract_key_requirements(spec)
    
    assert len(reqs) == 0
