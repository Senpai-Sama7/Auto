"""Tests for BudgetLedger TOCTOU prevention."""

import asyncio
import pytest
from choreographer.state.budget_ledger import BudgetLedger


@pytest.fixture
async def ledger():
    """Create a fresh budget ledger for testing."""
    return BudgetLedger()


@pytest.mark.asyncio
async def test_initialize_ledger():
    """Test ledger initialization."""
    ledger = BudgetLedger()
    record = await ledger.initialize_ledger("wf-1", 100.0)
    
    assert record.workflow_id == "wf-1"
    assert record.available == 100.0
    assert record.allocated == 0.0
    assert record.spent == 0.0
    assert record.version == 1


@pytest.mark.asyncio
async def test_reserve_success():
    """Test successful budget reservation."""
    ledger = BudgetLedger()
    await ledger.initialize_ledger("wf-1", 100.0)
    
    success = await ledger.reserve("wf-1", 30.0)
    assert success is True
    
    record = await ledger.get_ledger("wf-1")
    assert record.available == 70.0
    assert record.allocated == 30.0
    assert record.version == 2


@pytest.mark.asyncio
async def test_reserve_insufficient_funds():
    """Test reservation with insufficient funds."""
    ledger = BudgetLedger()
    await ledger.initialize_ledger("wf-1", 100.0)
    
    success = await ledger.reserve("wf-1", 150.0)
    assert success is False
    
    record = await ledger.get_ledger("wf-1")
    assert record.available == 100.0  # Unchanged


@pytest.mark.asyncio
async def test_spend():
    """Test recording spend."""
    ledger = BudgetLedger()
    await ledger.initialize_ledger("wf-1", 100.0)
    await ledger.reserve("wf-1", 50.0)
    
    success = await ledger.spend("wf-1", 30.0)
    assert success is True
    
    record = await ledger.get_ledger("wf-1")
    assert record.allocated == 20.0  # 50 - 30
    assert record.spent == 30.0


@pytest.mark.asyncio
async def test_release():
    """Test releasing allocated budget."""
    ledger = BudgetLedger()
    await ledger.initialize_ledger("wf-1", 100.0)
    await ledger.reserve("wf-1", 50.0)
    
    success = await ledger.release("wf-1", 20.0)
    assert success is True
    
    record = await ledger.get_ledger("wf-1")
    assert record.available == 70.0  # 50 + 20
    assert record.allocated == 30.0  # 50 - 20


@pytest.mark.asyncio
async def test_concurrent_reserves():
    """Test concurrent reservations are handled safely."""
    ledger = BudgetLedger()
    await ledger.initialize_ledger("wf-1", 100.0)
    
    async def reserve_amount(amount):
        return await ledger.reserve("wf-1", amount)
    
    # Run multiple reserves concurrently
    results = await asyncio.gather(
        reserve_amount(30.0),
        reserve_amount(30.0),
        reserve_amount(30.0),
        reserve_amount(30.0),
        return_exceptions=True
    )
    
    # Some should succeed, some should fail
    successes = sum(1 for r in results if r is True)
    failures = sum(1 for r in results if r is False)
    
    assert successes + failures == 4
    assert successes <= 3  # Can't reserve more than 100 total
    
    # Verify total allocated doesn't exceed budget
    record = await ledger.get_ledger("wf-1")
    assert record.allocated <= 100.0


@pytest.mark.asyncio
async def test_get_summary():
    """Test budget summary generation."""
    ledger = BudgetLedger()
    await ledger.initialize_ledger("wf-1", 100.0)
    await ledger.reserve("wf-1", 50.0)
    await ledger.spend("wf-1", 20.0)
    
    summary = await ledger.get_summary("wf-1")
    
    assert summary["workflow_id"] == "wf-1"
    assert summary["total_budget_usd"] == 100.0
    assert summary["available_usd"] == 50.0
    assert summary["allocated_usd"] == 30.0
    assert summary["spent_usd"] == 20.0
    assert summary["utilization_percent"] == 20.0
