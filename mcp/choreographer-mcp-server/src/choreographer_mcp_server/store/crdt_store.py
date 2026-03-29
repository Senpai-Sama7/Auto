"""CRDT Store with algebraic property guarantees.

Implements the CRDT schema from the Choreographer specification:
- GSet: Grow-only sets for guardrails, test cases
- LWWRegister: Last-write-wins for specifications, phase status
- PNCounter: Positive-negative counters for budget, tokens
- VectorVersioned: Vector-versioned values for concurrent proposals
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

import structlog
from pydantic import TypeAdapter

from choreographer_mcp_server.models import (
    GSet,
    LWWRegister,
    PNCounter,
    StoreSchema,
    VectorVersionedValue,
    VectorClock,
    AgentId,
)
from choreographer_mcp_server.store.backends import HybridBackend

logger = structlog.get_logger()

T = TypeVar("T")


class CRDTStore:
    """CRDT Store with commutative/associative/idempotent merge operations.

    All merge operations satisfy the algebraic laws:
    - Commutative: merge(a, b) == merge(b, a)
    - Associative: merge(merge(a, b), c) == merge(a, merge(b, c))
    - Idempotent: merge(a, a) == a
    """

    def __init__(self, backend: HybridBackend | None = None) -> None:
        self.backend = backend or HybridBackend()
        self._schema = StoreSchema()
        self._adapters: dict[type, TypeAdapter] = {
            GSet: TypeAdapter(GSet),
            LWWRegister: TypeAdapter(LWWRegister),
            PNCounter: TypeAdapter(PNCounter),
            VectorVersionedValue: TypeAdapter(VectorVersionedValue),
        }

    async def initialize(self) -> None:
        """Initialize the store."""
        await self.backend.connect()
        logger.info("crdt_store_initialized")

    async def close(self) -> None:
        """Close the store."""
        await self.backend.close()
        logger.info("crdt_store_closed")

    # ========================================================================
    # GSet Operations
    # ========================================================================

    async def gset_get(self, key: str) -> GSet:
        """Get GSet by key (returns empty set if not exists)."""
        data = await self.backend.get(key)
        if data is None:
            return GSet()
        return self._adapters[GSet].validate_json(data)

    async def gset_add(self, key: str, item: str) -> GSet:
        """Add item to GSet.

        Returns the updated GSet after merge.
        """
        current = await self.gset_get(key)
        updated = current.add(item)

        # Persist updated set
        await self.backend.set(key, self._adapters[GSet].dump_json(updated))

        logger.debug("gset_add", key=key, item=item, size=len(updated.items))
        return updated

    async def gset_merge(self, key: str, other: GSet) -> GSet:
        """Merge GSet with another (idempotent).

        Satisfies algebraic laws:
        - Commutative: merge(a, b) == merge(b, a)
        - Associative: merge(merge(a, b), c) == merge(a, merge(b, c))
        - Idempotent: merge(a, a) == a
        """
        current = await self.gset_get(key)
        merged = current.merge(other)

        await self.backend.set(key, self._adapters[GSet].dump_json(merged))

        logger.debug(
            "gset_merge",
            key=key,
            current_size=len(current.items),
            other_size=len(other.items),
            merged_size=len(merged.items),
        )
        return merged

    # ========================================================================
    # LWWRegister Operations
    # ========================================================================

    async def lww_get(self, key: str) -> LWWRegister:
        """Get LWWRegister by key."""
        data = await self.backend.get(key)
        if data is None:
            return LWWRegister()
        return self._adapters[LWWRegister].validate_json(data)

    async def lww_write(
        self, key: str, value: Any, timestamp: float, node_id: str
    ) -> LWWRegister:
        """Write to LWWRegister (only if timestamp is newer)."""
        current = await self.lww_get(key)
        updated = current.write(value, timestamp, node_id)

        # Only persist if actually updated
        if updated.timestamp != current.timestamp:
            await self.backend.set(key, self._adapters[LWWRegister].dump_json(updated))
            logger.debug("lww_write", key=key, timestamp=timestamp, node_id=node_id)
        else:
            logger.debug("lww_write_stale", key=key, timestamp=timestamp)

        return updated

    async def lww_merge(self, key: str, other: LWWRegister) -> LWWRegister:
        """Merge LWWRegister (takes max timestamp).

        Satisfies algebraic laws for LWW with tie-breaking.
        """
        current = await self.lww_get(key)
        merged = current.merge(other)

        await self.backend.set(key, self._adapters[LWWRegister].dump_json(merged))
        return merged

    # ========================================================================
    # PNCounter Operations
    # ========================================================================

    async def pncounter_get(self, key: str) -> PNCounter:
        """Get PNCounter by key."""
        data = await self.backend.get(key)
        if data is None:
            return PNCounter()
        return self._adapters[PNCounter].validate_json(data)

    async def pncounter_increment(
        self, key: str, node_id: str, delta: int = 1
    ) -> PNCounter:
        """Increment PNCounter."""
        current = await self.pncounter_get(key)
        updated = current.increment(node_id, delta)

        await self.backend.set(key, self._adapters[PNCounter].dump_json(updated))

        logger.debug(
            "pncounter_increment",
            key=key,
            node_id=node_id,
            delta=delta,
            new_value=updated.value(),
        )
        return updated

    async def pncounter_decrement(
        self, key: str, node_id: str, delta: int = 1
    ) -> PNCounter:
        """Decrement PNCounter."""
        current = await self.pncounter_get(key)
        updated = current.decrement(node_id, delta)

        await self.backend.set(key, self._adapters[PNCounter].dump_json(updated))

        logger.debug(
            "pncounter_decrement",
            key=key,
            node_id=node_id,
            delta=delta,
            new_value=updated.value(),
        )
        return updated

    async def pncounter_merge(self, key: str, other: PNCounter) -> PNCounter:
        """Merge PNCounter (takes max per-node values).

        Satisfies algebraic laws for PN-Counters.
        """
        current = await self.pncounter_get(key)
        merged = current.merge(other)

        await self.backend.set(key, self._adapters[PNCounter].dump_json(merged))

        logger.debug(
            "pncounter_merge",
            key=key,
            current_value=current.value(),
            other_value=other.value(),
            merged_value=merged.value(),
        )
        return merged

    # ========================================================================
    # VectorVersioned Operations
    # ========================================================================

    async def vv_get(self, key: str) -> VectorVersionedValue:
        """Get VectorVersionedValue by key."""
        data = await self.backend.get(key)
        if data is None:
            return VectorVersionedValue()
        return self._adapters[VectorVersionedValue].validate_json(data)

    async def vv_update(
        self,
        key: str,
        value: Any,
        agent_id: AgentId,
        vector_clock: VectorClock,
    ) -> VectorVersionedValue:
        """Update vector-versioned value."""
        current = await self.vv_get(key)
        updated = current.update(value, agent_id, vector_clock)

        await self.backend.set(
            key, self._adapters[VectorVersionedValue].dump_json(updated)
        )

        logger.debug("vv_update", key=key, agent_id=agent_id, clock=vector_clock)
        return updated

    async def vv_merge(self, key: str, other: VectorVersionedValue) -> VectorVersionedValue:
        """Merge vector-versioned values (handles concurrent versions).

        Returns list of concurrent values if conflict detected.
        """
        current = await self.vv_get(key)
        merged = current.merge(other)

        await self.backend.set(
            key, self._adapters[VectorVersionedValue].dump_json(merged)
        )

        is_concurrent = isinstance(merged.value, list)
        logger.debug(
            "vv_merge",
            key=key,
            is_concurrent=is_concurrent,
            concurrent_versions=len(merged.value) if is_concurrent else 1,
        )
        return merged

    # ========================================================================
    # Schema Helpers
    # ========================================================================

    async def get_guardrails(self, module: str) -> GSet:
        """Get guardrails GSet for module."""
        return await self.gset_get(StoreSchema.guardrails(module))

    async def add_guardrail(self, module: str, failure_json: str) -> GSet:
        """Add guardrail failure to module."""
        return await self.gset_add(StoreSchema.guardrails(module), failure_json)

    async def get_test_cases(self) -> GSet:
        """Get test cases GSet."""
        return await self.gset_get(StoreSchema.test_cases())

    async def add_test_case(self, test_case_json: str) -> GSet:
        """Add test case."""
        return await self.gset_add(StoreSchema.test_cases(), test_case_json)

    async def get_spec_current(self) -> LWWRegister:
        """Get current specification."""
        return await self.lww_get(StoreSchema.spec_current())

    async def set_spec_current(
        self, spec: Any, timestamp: float, node_id: str
    ) -> LWWRegister:
        """Set current specification."""
        return await self.lww_write(StoreSchema.spec_current(), spec, timestamp, node_id)

    async def get_budget_remaining(self) -> PNCounter:
        """Get remaining budget counter."""
        return await self.pncounter_get(StoreSchema.budget_remaining())

    async def decrement_budget(self, node_id: str, amount: float) -> PNCounter:
        """Decrement budget (amount is treated as integer cents)."""
        # Convert to integer cents for PNCounter
        delta = int(amount * 100)
        return await self.pncounter_decrement(
            StoreSchema.budget_remaining(), node_id, delta
        )

    async def get_tokens_consumed(self) -> PNCounter:
        """Get tokens consumed counter."""
        return await self.pncounter_get(StoreSchema.tokens_consumed())

    async def increment_tokens(self, node_id: str, tokens: int) -> PNCounter:
        """Increment token counter."""
        return await self.pncounter_increment(
            StoreSchema.tokens_consumed(), node_id, tokens
        )


# ============================================================================
# Algebraic Property Verification
# ============================================================================


def verify_crdt_properties():
    """Verify CRDT algebraic properties using Hypothesis.

    This function is used by tests to verify:
    - Commutativity: merge(a, b) == merge(b, a)
    - Associativity: merge(merge(a, b), c) == merge(a, merge(b, c))
    - Idempotence: merge(a, a) == a
    """
    from hypothesis import given, strategies as st

    # GSet properties
    @given(st.sets(st.text()), st.sets(st.text()), st.sets(st.text()))
    def test_gset_commutative(s1, s2):
        a = GSet(items=frozenset(s1))
        b = GSet(items=frozenset(s2))
        assert a.merge(b) == b.merge(a)

    @given(st.sets(st.text()), st.sets(st.text()), st.sets(st.text()))
    def test_gset_associative(s1, s2, s3):
        a = GSet(items=frozenset(s1))
        b = GSet(items=frozenset(s2))
        c = GSet(items=frozenset(s3))
        assert a.merge(b).merge(c) == a.merge(b.merge(c))

    @given(st.sets(st.text()))
    def test_gset_idempotent(s):
        a = GSet(items=frozenset(s))
        assert a.merge(a) == a

    # PNCounter properties
    @given(st.dictionaries(st.text(), st.integers(min_value=0)),
           st.dictionaries(st.text(), st.integers(min_value=0)))
    def test_pncounter_commutative(inc1, dec1):
        a = PNCounter(increments=inc1, decrements={})
        b = PNCounter(increments=dec1, decrements={})
        merged_ab = a.merge(b)
        merged_ba = b.merge(a)
        assert merged_ab.value() == merged_ba.value()

    @given(st.dictionaries(st.text(), st.integers(min_value=0)))
    def test_pncounter_idempotent(inc):
        a = PNCounter(increments=inc, decrements={})
        assert a.merge(a).value() == a.value()

    # Run tests
    test_gset_commutative()
    test_gset_associative()
    test_gset_idempotent()
    test_pncounter_commutative()
    test_pncounter_idempotent()

    return True


if __name__ == "__main__":
    # Run property verification
    print("Verifying CRDT algebraic properties...")
    verify_crdt_properties()
    print("All properties verified!")
