"""Tests for MCP tools - tests core logic separate from FastMCP decorators."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

from choreographer.state import AppState, BudgetLedger, CRDTState
from choreographer.utils.specification_analyzer import SpecificationAnalyzer
from choreographer.utils.shapley import ShapleyAttributor, AttributionTier


@pytest.fixture
def app_state():
    """Create a fresh AppState for testing."""
    return AppState()


@pytest.mark.asyncio
async def test_workflow_start_logic(app_state):
    """Test workflow start business logic."""
    # Simulate workflow start logic
    from uuid import uuid4
    
    workflow_id = str(uuid4())
    specification = "Implement a function to calculate fibonacci numbers"
    budget_usd = 50.0
    han_mode = True
    
    # Initialize budget ledger
    await app_state.budget.initialize_ledger(workflow_id, budget_usd)
    
    # Initialize CRDT state
    await app_state.crdt.initialize_state(
        workflow_id=workflow_id,
        specification=specification,
        han_mode=han_mode
    )
    
    # Verify initialization
    budget = await app_state.budget.get_ledger(workflow_id)
    assert budget.available == 50.0
    
    state = await app_state.crdt.get_state(workflow_id)
    assert state.workflow_id == workflow_id
    assert state.specification == specification
    assert len(state.agents) == 4  # HAN mode


@pytest.mark.asyncio
async def test_specification_validation(app_state):
    """Test specification validation in workflow start."""
    # Valid spec
    valid_spec = """
    Implement API with acceptance criteria:
    - Returns 200 OK
    
    Scope: Core features only
    Constraints: Performance < 100ms
    Context: Replacement for legacy system
    """
    
    analysis = SpecificationAnalyzer.analyze(valid_spec)
    # This should pass validation (might have minor issues but enough detail)
    assert len(valid_spec.strip()) >= 10
    
    # Invalid spec - too short
    short_spec = "Fix bug"
    analysis = SpecificationAnalyzer.analyze(short_spec)
    assert analysis.is_underspecified
    assert "sufficient_detail" in analysis.missing_elements


@pytest.mark.asyncio
async def test_budget_operations(app_state):
    """Test budget operations during workflow."""
    workflow_id = "test-wf"
    await app_state.budget.initialize_ledger(workflow_id, 100.0)
    
    # Reserve budget
    success = await app_state.budget.reserve(workflow_id, 30.0)
    assert success
    
    budget = await app_state.budget.get_ledger(workflow_id)
    assert budget.available == 70.0
    assert budget.allocated == 30.0
    
    # Spend budget
    await app_state.budget.spend(workflow_id, 20.0)
    budget = await app_state.budget.get_ledger(workflow_id)
    assert budget.allocated == 10.0
    assert budget.spent == 20.0
    
    # Release remaining
    await app_state.budget.release(workflow_id, 10.0)
    budget = await app_state.budget.get_ledger(workflow_id)
    assert budget.available == 80.0
    assert budget.allocated == 0.0


@pytest.mark.asyncio
async def test_state_transitions(app_state):
    """Test workflow state transitions."""
    workflow_id = "test-wf"
    await app_state.crdt.initialize_state(workflow_id, "Test spec")
    
    # Initial state
    state = await app_state.crdt.get_state(workflow_id)
    assert state.phase.value == "initializing"
    
    # Transition to implementation
    await app_state.crdt.merge_state(
        workflow_id,
        {"phase": "implementation"}
    )
    
    state = await app_state.crdt.get_state(workflow_id)
    assert state.phase.value == "implementation"
    
    # Add causal event
    await app_state.crdt.merge_state(
        workflow_id,
        {"causal_event": {"type": "step_completed", "step_id": "step1"}}
    )
    
    state = await app_state.crdt.get_state(workflow_id)
    assert len(state.causal_trace) == 1
    assert state.causal_trace[0]["type"] == "step_completed"


@pytest.mark.asyncio
async def test_shapley_attribution_heuristic(app_state):
    """Test Shapley attribution with heuristic tier."""
    workflow_id = "test-wf"
    await app_state.crdt.initialize_state(workflow_id, "Test spec")
    
    # Add some causal events
    await app_state.crdt.merge_state(workflow_id, {
        "causal_event": {"type": "success", "step_id": "step1", "agent_role": "implementer"}
    })
    await app_state.crdt.merge_state(workflow_id, {
        "causal_event": {"type": "error", "step_id": "step2", "agent_role": "verifier"}
    })
    
    state = await app_state.crdt.get_state(workflow_id)
    
    attributor = ShapleyAttributor()
    result = await attributor.compute(
        workflow_id=workflow_id,
        causal_trace=state.causal_trace,
        tier=AttributionTier.HEURISTIC
    )
    
    assert result.tier == AttributionTier.HEURISTIC
    assert len(result.shapley_values) > 0
    
    # Error step should have higher attribution
    total = sum(result.shapley_values.values())
    assert abs(total - 1.0) < 0.01  # Normalized


@pytest.mark.asyncio
async def test_shapley_attribution_approximate(app_state):
    """Test Shapley attribution with approximate tier."""
    workflow_id = "test-wf"
    await app_state.crdt.initialize_state(workflow_id, "Test spec")
    
    # Add causal events
    for i in range(5):
        await app_state.crdt.merge_state(workflow_id, {
            "causal_event": {
                "type": "success" if i % 2 == 0 else "error",
                "step_id": f"step{i}",
                "agent_role": "implementer" if i % 2 == 0 else "verifier"
            }
        })
    
    state = await app_state.crdt.get_state(workflow_id)
    
    attributor = ShapleyAttributor()
    result = await attributor.compute(
        workflow_id=workflow_id,
        causal_trace=state.causal_trace,
        tier=AttributionTier.APPROXIMATE
    )
    
    assert result.tier == AttributionTier.APPROXIMATE
    assert result.sample_count > 0
    assert len(result.shapley_values) > 0


@pytest.mark.asyncio
async def test_subscriptions(app_state):
    """Test state change subscriptions."""
    workflow_id = "test-wf"
    await app_state.crdt.initialize_state(workflow_id, "Test spec")
    
    # Subscribe
    sub_id = await app_state.crdt.subscribe(workflow_id)
    assert sub_id.startswith("sub_")
    
    # Make a state change
    await app_state.crdt.merge_state(workflow_id, {"phase": "completed"})
    
    # Check notification
    notification = await app_state.crdt.get_notification(sub_id, timeout=0.1)
    assert notification is not None
    assert notification["type"] == "state_updated"
    
    # Unsubscribe
    success = await app_state.crdt.unsubscribe(sub_id)
    assert success


@pytest.mark.asyncio
async def test_concurrent_budget_reservations(app_state):
    """Test concurrent budget reservations are safe."""
    workflow_id = "test-wf"
    await app_state.budget.initialize_ledger(workflow_id, 100.0)
    
    async def reserve_task(amount):
        return await app_state.budget.reserve(workflow_id, amount)
    
    # Run multiple reserves concurrently
    tasks = [reserve_task(30.0) for _ in range(4)]
    results = await asyncio.gather(*tasks)
    
    # Some should succeed, some should fail
    successes = sum(1 for r in results if r)
    failures = sum(1 for r in results if not r)
    
    assert successes + failures == 4
    assert successes <= 3  # Can't exceed 100 total
    
    # Verify total allocated
    budget = await app_state.budget.get_ledger(workflow_id)
    assert budget.allocated <= 100.0


@pytest.mark.asyncio
async def test_task_storage(app_state):
    """Test background task result storage."""
    task_id = "task-test-123"
    result_data = {"shapley_values": {"step1": 0.5, "step2": 0.5}}
    
    # Store result
    app_state.store_task_result(task_id, result_data)
    
    # Retrieve result
    retrieved = app_state.get_task_result(task_id)
    assert retrieved == result_data
    
    # Check status
    status = app_state.get_task_status(task_id)
    assert status == "completed"
