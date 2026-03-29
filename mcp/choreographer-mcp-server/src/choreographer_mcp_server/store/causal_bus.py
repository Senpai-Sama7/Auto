"""Causal Message Bus using Birman-Schiper-Stephenson protocol.

Ensures causal consistency: message M₂ is not delivered until all messages
that causally precede M₂ have been delivered.

Uses vector clocks and hold-back buffers per Birman-Schiper-Stephenson.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import AsyncIterator, Callable

import structlog

from choreographer_mcp_server.models import (
    AgentId,
    AgentRole,
    CausalMessage,
    VectorClock,
)
from choreographer_mcp_server.store.crdt_store import CRDTStore

logger = structlog.get_logger()


@dataclass
class VectorClockState:
    """Vector clock state for an agent."""

    clock: VectorClock = field(default_factory=dict)

    def increment(self, agent_id: AgentId) -> VectorClock:
        """Increment clock for agent and return new clock."""
        new_clock = dict(self.clock)
        new_clock[agent_id] = new_clock.get(agent_id, 0) + 1
        return new_clock

    def update(self, other: VectorClock) -> VectorClock:
        """Merge with another clock (takes max values)."""
        merged = dict(self.clock)
        for agent, timestamp in other.items():
            merged[agent] = max(merged.get(agent, 0), timestamp)
        return merged

    def can_deliver(self, message_clock: VectorClock, sender: AgentId) -> bool:
        """Check if message can be delivered based on vector clock.

        A message can be delivered if:
        1. For the sender: our clock[sender] == message_clock[sender] - 1
        2. For all other agents: our clock[agent] >= message_clock[agent]
        """
        for agent, msg_time in message_clock.items():
            our_time = self.clock.get(agent, 0)
            if agent == sender:
                # For sender, we expect exactly one less
                if our_time != msg_time - 1:
                    return False
            else:
                # For others, we must have seen at least as much
                if our_time < msg_time:
                    return False
        return True


@dataclass
class HoldBackBuffer:
    """Buffer for out-of-order messages."""

    messages: list[CausalMessage] = field(default_factory=list)

    def add(self, message: CausalMessage) -> None:
        """Add message to buffer."""
        self.messages.append(message)

    def extract_deliverable(
        self, clock_state: VectorClockState
    ) -> list[CausalMessage]:
        """Extract messages that are now deliverable."""
        deliverable = []
        remaining = []

        for msg in self.messages:
            if clock_state.can_deliver(msg.vector_clock, msg.from_agent):
                deliverable.append(msg)
            else:
                remaining.append(msg)

        self.messages = remaining
        return deliverable


class CausalMessageBus:
    """Causal message bus with BSS protocol.

    Ensures that messages are delivered in causal order:
    - If M1 -> M2 (M1 causally precedes M2), M1 is delivered before M2
    - Uses vector clocks to track causality
    - Uses hold-back buffers for out-of-order messages
    """

    def __init__(self, store: CRDTStore | None = None) -> None:
        self.store = store
        self._clock_states: dict[AgentId, VectorClockState] = {}
        self._hold_buffers: dict[AgentId, HoldBackBuffer] = defaultdict(HoldBackBuffer)
        self._delivery_queues: dict[AgentId, asyncio.Queue[CausalMessage]] = defaultdict(
            asyncio.Queue
        )
        self._subscribers: dict[AgentId, list[Callable[[CausalMessage], None]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def register_agent(self, agent_id: AgentId) -> None:
        """Register an agent with the message bus."""
        async with self._lock:
            if agent_id not in self._clock_states:
                self._clock_states[agent_id] = VectorClockState()
                logger.info("agent_registered", agent_id=agent_id)

    async def send(
        self,
        from_agent: AgentId,
        to_agent: AgentId,
        payload: dict,
    ) -> CausalMessage:
        """Send a message with vector clock attached.

        Args:
            from_agent: Sender agent ID
            to_agent: Recipient agent ID
            payload: Message payload

        Returns:
            The sent message with vector clock
        """
        async with self._lock:
            # Get sender's clock state
            if from_agent not in self._clock_states:
                await self.register_agent(from_agent)

            clock_state = self._clock_states[from_agent]

            # Increment sender's clock
            new_clock = clock_state.increment(from_agent)
            self._clock_states[from_agent] = VectorClockState(clock_state.update(new_clock))

            # Create message
            message = CausalMessage(
                from_agent=from_agent,
                to_agent=to_agent,
                payload=payload,
                vector_clock=new_clock,
            )

            logger.debug(
                "message_sent",
                message_id=message.message_id,
                from_agent=from_agent,
                to_agent=to_agent,
                vector_clock=new_clock,
            )

            # Route to recipient
            await self._route_message(message)

            return message

    async def _route_message(self, message: CausalMessage) -> None:
        """Route message to recipient (internal)."""
        to_agent = message.to_agent

        # Ensure recipient is registered
        if to_agent not in self._clock_states:
            await self.register_agent(to_agent)

        recipient_clock = self._clock_states[to_agent]

        # Check if deliverable
        if recipient_clock.can_deliver(message.vector_clock, message.from_agent):
            await self._deliver(message)
        else:
            # Hold back for later
            self._hold_buffers[to_agent].add(message)
            logger.debug(
                "message_held_back",
                message_id=message.message_id,
                to_agent=to_agent,
                recipient_clock=recipient_clock.clock,
                message_clock=message.vector_clock,
            )

    async def _deliver(self, message: CausalMessage) -> None:
        """Deliver message and update recipient's clock."""
        to_agent = message.to_agent

        # Update recipient's clock
        current_state = self._clock_states[to_agent]
        merged_clock = current_state.update(message.vector_clock)
        self._clock_states[to_agent] = VectorClockState(merged_clock)

        # Add to delivery queue
        await self._delivery_queues[to_agent].put(message)

        # Notify subscribers
        for callback in self._subscribers[to_agent]:
            try:
                callback(message)
            except Exception as e:
                logger.error("subscriber_callback_failed", error=str(e))

        logger.debug(
            "message_delivered",
            message_id=message.message_id,
            to_agent=to_agent,
            updated_clock=merged_clock,
        )

        # Check held-back messages
        buffer = self._hold_buffers[to_agent]
        deliverable = buffer.extract_deliverable(self._clock_states[to_agent])

        for msg in deliverable:
            await self._deliver(msg)

    async def receive(self, agent_id: AgentId) -> AsyncIterator[CausalMessage]:
        """Receive messages for an agent (blocking iterator).

        Yields messages only when causal dependencies are satisfied.

        Usage:
            async for message in bus.receive(agent_id):
                process(message)
        """
        if agent_id not in self._clock_states:
            await self.register_agent(agent_id)

        queue = self._delivery_queues[agent_id]

        while True:
            message = await queue.get()
            yield message

    async def receive_one(
        self, agent_id: AgentId, timeout: float | None = None
    ) -> CausalMessage | None:
        """Receive single message with optional timeout."""
        try:
            async with asyncio.timeout(timeout):
                async for message in self.receive(agent_id):
                    return message
        except asyncio.TimeoutError:
            return None

    def subscribe(
        self, agent_id: AgentId, callback: Callable[[CausalMessage], None]
    ) -> None:
        """Subscribe to messages for an agent."""
        self._subscribers[agent_id].append(callback)

    def unsubscribe(
        self, agent_id: AgentId, callback: Callable[[CausalMessage], None]
    ) -> None:
        """Unsubscribe from messages."""
        if callback in self._subscribers[agent_id]:
            self._subscribers[agent_id].remove(callback)

    async def broadcast(
        self, from_agent: AgentId, payload: dict, to_agents: list[AgentId]
    ) -> list[CausalMessage]:
        """Broadcast message to multiple agents with same vector clock."""
        async with self._lock:
            # Get sender's clock state
            if from_agent not in self._clock_states:
                await self.register_agent(from_agent)

            clock_state = self._clock_states[from_agent]
            new_clock = clock_state.increment(from_agent)
            self._clock_states[from_agent] = VectorClockState(clock_state.update(new_clock))

            # Send to all recipients with same clock
            messages = []
            for to_agent in to_agents:
                message = CausalMessage(
                    from_agent=from_agent,
                    to_agent=to_agent,
                    payload=payload,
                    vector_clock=new_clock,
                )
                await self._route_message(message)
                messages.append(message)

            return messages

    def get_clock(self, agent_id: AgentId) -> VectorClock:
        """Get current vector clock for agent."""
        if agent_id not in self._clock_states:
            return {}
        return dict(self._clock_states[agent_id].clock)

    def get_stats(self) -> dict:
        """Get bus statistics."""
        return {
            "registered_agents": len(self._clock_states),
            "hold_buffer_sizes": {
                agent: len(buffer.messages)
                for agent, buffer in self._hold_buffers.items()
            },
            "delivery_queue_sizes": {
                agent: queue.qsize() for agent, queue in self._delivery_queues.items()
            },
        }


class CausalBroadcastBus(CausalMessageBus):
    """Extension with reliable broadcast guarantees.

    Ensures:
    - Validity: If correct process broadcasts M, it eventually delivers M
    - No duplication: No message delivered more than once
    - No creation: Only broadcast messages are delivered
    - Causal order: If broadcast(M) -> broadcast(N), then deliver(M) -> deliver(N)
    """

    def __init__(self, store: CRDTStore | None = None) -> None:
        super().__init__(store)
        self._delivered: set[str] = set()
        self._lock = asyncio.Lock()

    async def _deliver(self, message: CausalMessage) -> None:
        """Override delivery with deduplication."""
        if message.message_id in self._delivered:
            logger.debug("message_deduplicated", message_id=message.message_id)
            return

        self._delivered.add(message.message_id)
        await super()._deliver(message)


# ============================================================================
# Helper functions
# ============================================================================


async def create_causal_bus(store: CRDTStore | None = None) -> CausalMessageBus:
    """Factory to create and initialize a causal message bus."""
    bus = CausalMessageBus(store)
    return bus
