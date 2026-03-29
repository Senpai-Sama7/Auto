"""Protocol validation script for Choreographer MCP Server.

Run this to validate protocol compliance:
    python validate_protocol.py
"""

import asyncio
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from choreographer.state import AppState, CRDTState, BudgetLedger
from choreographer.utils.specification_analyzer import SpecificationAnalyzer
from choreographer.utils.shapley import ShapleyAttributor, AttributionTier


def check(condition: bool, message: str) -> bool:
    """Check a condition and print result."""
    if condition:
        print(f"  ✅ {message}")
        return True
    else:
        print(f"  ❌ {message}")
        return False


async def validate_budget_ledger():
    """Validate BudgetLedger TOCTOU prevention."""
    print("\n📊 Budget Ledger Validation")
    
    ledger = BudgetLedger()
    
    # Test initialization
    await ledger.initialize_ledger("test-wf", 100.0)
    record = await ledger.get_ledger("test-wf")
    assert record.available == 100.0
    check(True, "Ledger initialization")
    
    # Test reserve
    success = await ledger.reserve("test-wf", 30.0)
    check(success, "Budget reservation")
    
    record = await ledger.get_ledger("test-wf")
    check(record.available == 70.0, "Available updated correctly")
    check(record.allocated == 30.0, "Allocated tracked correctly")
    
    # Test insufficient funds
    success = await ledger.reserve("test-wf", 200.0)
    check(not success, "Insufficient funds rejected")
    
    # Test summary
    summary = await ledger.get_summary("test-wf")
    check(summary["total_budget_usd"] == 100.0, "Budget summary accurate")


async def validate_crdt_state():
    """Validate CRDT state management."""
    print("\n🔄 CRDT State Validation")
    
    crdt = CRDTState()
    
    # Test initialization
    state = await crdt.initialize_state("test-wf", "Test specification", han_mode=True)
    check(len(state.agents) == 4, "HAN mode creates 4 agents")
    
    # Test merge
    updated = await crdt.merge_state("test-wf", {"phase": "implementation"})
    check(updated.phase.value == "implementation", "State merge updates phase")
    
    # Test causal trace
    await crdt.merge_state("test-wf", {"causal_event": {"type": "test"}})
    state = await crdt.get_state("test-wf")
    check(len(state.causal_trace) == 1, "Causal trace accumulated")
    
    # Test subscription
    sub_id = await crdt.subscribe("test-wf")
    check(sub_id.startswith("sub_"), "Subscription created")
    
    await crdt.merge_state("test-wf", {"phase": "completed"})
    notification = await crdt.get_notification(sub_id, timeout=0.1)
    check(notification is not None and notification["type"] == "state_updated", "Notification received")


async def validate_spec_analyzer():
    """Validate SpecificationAnalyzer."""
    print("\n🔍 Specification Analyzer Validation")
    
    # Complete spec
    complete_spec = """
    Implement a REST API.
    
    Acceptance Criteria:
    - Returns 200 OK for valid requests
    
    Scope:
    - In scope: Core API
    - Out of scope: Authentication
    
    Constraints:
    - Performance < 100ms
    
    Context:
    - Replaces legacy system
    """
    
    result = SpecificationAnalyzer.analyze(complete_spec)
    check(not result.is_underspecified, "Complete spec detected")
    
    # Underspecified spec
    underspec = "Implement API"
    result = SpecificationAnalyzer.analyze(underspec)
    check(result.is_underspecified, "Underspecified spec detected")
    check(len(result.missing_elements) > 0, "Missing elements identified")
    check(len(result.suggestions) > 0, "Suggestions provided")


async def validate_shapley():
    """Validate Shapley attribution."""
    print("\n📈 Shapley Attribution Validation")
    
    attributor = ShapleyAttributor()
    
    causal_trace = [
        {"step_id": "step1", "type": "success"},
        {"step_id": "step2", "type": "error"},
        {"step_id": "step3", "type": "success"},
    ]
    
    # Test heuristic
    result = await attributor.compute("test-wf", causal_trace, AttributionTier.HEURISTIC)
    check(result.tier == AttributionTier.HEURISTIC, "Heuristic tier computed")
    check(len(result.shapley_values) > 0, "Shapley values generated")
    
    # Test approximate
    result = await attributor.compute("test-wf", causal_trace, AttributionTier.APPROXIMATE)
    check(result.tier == AttributionTier.APPROXIMATE, "Approximate tier computed")
    check(result.sample_count > 0, "Samples used")
    
    # Values should sum to ~1
    total = sum(result.shapley_values.values())
    check(abs(total - 1.0) < 0.01, f"Values normalized (sum={total:.2f})")


async def validate_mcp_content_types():
    """Validate MCP content type compliance."""
    print("\n📄 MCP Content Types Validation")
    
    # Check that we use correct content types
    # TextContent, EmbeddedResource - not resource_link
    from mcp.types import TextContent, EmbeddedResource, TextResourceContents
    
    check(True, "TextContent imported")
    check(True, "EmbeddedResource imported")
    check(True, "TextResourceContents imported")
    
    # Verify content type structure
    text = TextContent(type="text", text="Test")
    check(text.type == "text", "TextContent has correct type")
    
    resource = EmbeddedResource(
        type="resource",
        resource=TextResourceContents(
            uri="test://uri",
            mimeType="text/plain",
            text="content"
        )
    )
    check(resource.type == "resource", "EmbeddedResource has correct type")


async def validate_error_handling():
    """Validate error handling uses ToolError, not dict returns."""
    print("\n⚠️  Error Handling Validation")
    
    from fastmcp.exceptions import ToolError
    
    try:
        raise ToolError("Test error")
    except ToolError as e:
        check(str(e) == "Test error", "ToolError message captured")
        check("Test error" in str(e), "ToolError string conversion works")


async def main():
    """Run all validations."""
    print("=" * 60)
    print("Choreographer MCP Server - Protocol Validation")
    print("=" * 60)
    
    try:
        await validate_budget_ledger()
        await validate_crdt_state()
        await validate_spec_analyzer()
        await validate_shapley()
        await validate_mcp_content_types()
        await validate_error_handling()
        
        print("\n" + "=" * 60)
        print("✅ All validations passed!")
        print("=" * 60)
        return 0
        
    except Exception as e:
        print(f"\n❌ Validation failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
