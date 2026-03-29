"""Tests for CRDT state management."""

import pytest
from choreographer.state.crdt_state import CRDTState, WorkflowPhase, AgentRole


@pytest.mark.asyncio
async def test_initialize_state():
    """Test state initialization."""
    crdt = CRDTState()
    state = await crdt.initialize_state(
        workflow_id="wf-1",
        specification="Test spec",
        han_mode=True
    )
    
    assert state.workflow_id == "wf-1"
    assert state.phase == WorkflowPhase.INITIALIZING
    assert state.specification == "Test spec"
    assert len(state.agents) == 4  # HAN mode agents
    assert AgentRole.IMPLEMENTER in state.agents


@pytest.mark.asyncio
async def test_initialize_state_non_han():
    """Test state initialization without HAN mode."""
    crdt = CRDTState()
    state = await crdt.initialize_state(
        workflow_id="wf-1",
        specification="Test spec",
        han_mode=False
    )
    
    assert len(state.agents) == 1  # Just orchestrator
    assert AgentRole.ORCHESTRATOR in state.agents


@pytest.mark.asyncio
async def test_merge_state():
    """Test state merging."""
    crdt = CRDTState()
    await crdt.initialize_state("wf-1", "Initial spec")
    
    updated = await crdt.merge_state(
        "wf-1",
        {"phase": "implementation"},
        node_id="orchestrator"
    )
    
    assert updated is not None
    assert updated.phase == WorkflowPhase.IMPLEMENTATION
    assert updated.vector_clock["orchestrator"] == 2


@pytest.mark.asyncio
async def test_merge_agent_updates():
    """Test merging agent state updates."""
    crdt = CRDTState()
    await crdt.initialize_state("wf-1", "Test spec", han_mode=True)
    
    updated = await crdt.merge_state(
        "wf-1",
        {
            "agent_updates": {
                "implementer": {
                    "status": "working",
                    "current_task": "Writing code"
                }
            }
        }
    )
    
    assert updated.agents[AgentRole.IMPLEMENTER].status == "working"
    assert updated.agents[AgentRole.IMPLEMENTER].current_task == "Writing code"


@pytest.mark.asyncio
async def test_merge_artifacts():
    """Test merging artifact updates."""
    crdt = CRDTState()
    await crdt.initialize_state("wf-1", "Test spec")
    
    updated = await crdt.merge_state(
        "wf-1",
        {"artifacts": {"file1.py": "hash123"}}
    )
    
    assert updated.artifacts["file1.py"] == "hash123"


@pytest.mark.asyncio
async def test_causal_trace():
    """Test causal trace accumulation."""
    crdt = CRDTState()
    await crdt.initialize_state("wf-1", "Test spec")
    
    await crdt.merge_state(
        "wf-1",
        {"causal_event": {"type": "error", "step_id": "step1"}}
    )
    
    await crdt.merge_state(
        "wf-1",
        {"causal_event": {"type": "retry", "step_id": "step2"}}
    )
    
    state = await crdt.get_state("wf-1")
    assert len(state.causal_trace) == 2
    assert state.causal_trace[0]["type"] == "error"


@pytest.mark.asyncio
async def test_get_state_copy():
    """Test that get_state returns a copy."""
    crdt = CRDTState()
    await crdt.initialize_state("wf-1", "Test spec")
    
    state1 = await crdt.get_state("wf-1")
    state1.specification = "Modified"
    
    state2 = await crdt.get_state("wf-1")
    assert state2.specification == "Test spec"  # Original unchanged


@pytest.mark.asyncio
async def test_subscribe_notifications():
    """Test subscription and notifications."""
    crdt = CRDTState()
    await crdt.initialize_state("wf-1", "Test spec")
    
    sub_id = await crdt.subscribe("wf-1")
    
    # Merge state change
    await crdt.merge_state("wf-1", {"phase": "implementation"})
    
    # Check notification
    notification = await crdt.get_notification(sub_id, timeout=0.1)
    assert notification is not None
    assert notification["type"] == "state_updated"
    assert notification["workflow_id"] == "wf-1"


@pytest.mark.asyncio
async def test_unsubscribe():
    """Test unsubscription."""
    crdt = CRDTState()
    await crdt.initialize_state("wf-1", "Test spec")
    
    sub_id = await crdt.subscribe("wf-1")
    success = await crdt.unsubscribe(sub_id)
    
    assert success is True
    
    # Should return None after unsubscribe
    notification = await crdt.get_notification(sub_id, timeout=0.01)
    assert notification is None


@pytest.mark.asyncio
async def test_to_dict():
    """Test state serialization."""
    crdt = CRDTState()
    state = await crdt.initialize_state("wf-1", "Test spec", han_mode=True)
    
    data = crdt.to_dict(state)
    
    assert data["workflow_id"] == "wf-1"
    assert data["phase"] == "initializing"
    assert "agents" in data
    assert "vector_clock" in data
    assert data["causal_trace_length"] == 0
