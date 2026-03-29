"""Example: Basic Choreographer Workflow.

This example demonstrates:
1. Creating a workflow
2. Spawning isolated agents
3. Using CRDT operations
4. Causal message passing
"""

from __future__ import annotations

import asyncio

from choreographer_mcp_server.infrastructure.sandbox import create_sandbox
from choreographer_mcp_server.models import (
    AgentId,
    AgentRole,
    Phase,
    WorkflowState,
    WorkflowId,
)
from choreographer_mcp_server.store import CRDTStore, HybridBackend, create_causal_bus


async def basic_workflow_example():
    """Run a basic workflow example."""
    print("🎭 Choreographer Basic Workflow Example")
    print("=" * 50)

    # Initialize infrastructure
    print("\n📦 Initializing infrastructure...")
    backend = HybridBackend()
    await backend.connect()

    store = CRDTStore(backend)
    await store.initialize()

    sandbox = await create_sandbox()

    bus = await create_causal_bus(store)

    print("✅ Infrastructure ready")

    # Create workflow
    print("\n🔄 Creating workflow...")
    workflow_id = WorkflowId("example_workflow_001")
    state = WorkflowState(
        workflow_id=workflow_id,
        spec_uri="file://examples/specs/hello_world.md",
        current_phase=Phase.DISCUSS,
        budget_remaining=50.0,
    )
    print(f"✅ Workflow created: {workflow_id}")
    print(f"   Phase: {state.current_phase}")
    print(f"   Budget: ${state.budget_remaining}")

    # Demonstrate CRDT operations
    print("\n💾 CRDT Store Operations")
    print("-" * 30)

    # GSet: Add guardrails
    await store.add_guardrail("hello_world", '{"type": "syntax_error", "message": "Missing semicolon"}')
    await store.add_guardrail("hello_world", '{"type": "type_error", "message": "Type mismatch"}')

    guardrails = await store.get_guardrails("hello_world")
    print(f"✅ GSet guardrails: {len(guardrails.items)} items")

    # PNCounter: Track budget
    await store.decrement_budget("orchestrator", 10.50)
    await store.decrement_budget("orchestrator", 5.25)

    budget = await store.get_budget_remaining()
    print(f"✅ PNCounter budget remaining: ${budget.value() / 100:.2f}")

    # LWWRegister: Current spec
    await store.set_spec_current(
        {"version": "1.0", "content": "Hello World API"},
        timestamp=1000.0,
        node_id="architect_001",
    )

    spec = await store.get_spec_current()
    print(f"✅ LWWRegister spec: {spec.value}")

    # Spawn isolated agent
    print("\n🔒 Agent Sandbox Isolation")
    print("-" * 30)

    async with sandbox.agent_context(
        agent_id=AgentId("architect_001"),
        role=AgentRole.ARCHITECT,
        spec_uri="file://examples/specs/hello_world.md",
        context_budget_tokens=50000,
    ) as agent:
        print(f"✅ Agent spawned: {agent.agent_id}")
        print(f"   Role: {agent.role}")
        print(f"   Worktree: {agent.worktree_path}")

        # Agent would generate output here
        # For demo, just write a file
        import aiofiles

        async with aiofiles.open(f"{agent.worktree_path}/design.md", "w") as f:
            await f.write("# Hello World API Design\n\n## Endpoints\n- GET /hello\n")

        print("   📝 Generated design.md")

    # Worktree automatically cleaned up
    print("✅ Agent worktree cleaned up")

    # Causal message passing
    print("\n📨 Causal Message Bus")
    print("-" * 30)

    # Register agents
    await bus.register_agent(AgentId("architect_001"))
    await bus.register_agent(AgentId("implementer_001"))

    # Send message
    msg = await bus.send(
        from_agent=AgentId("architect_001"),
        to_agent=AgentId("implementer_001"),
        payload={"type": "design_complete", "uri": "file://design.md"},
    )
    print(f"✅ Message sent: {msg.message_id}")
    print(f"   From: {msg.from_agent}")
    print(f"   To: {msg.to_agent}")
    print(f"   Vector Clock: {msg.vector_clock}")

    # Receive message
    received = await bus.receive_one(AgentId("implementer_001"), timeout=1.0)
    if received:
        print(f"✅ Message received: {received.payload}")

    # Get bus stats
    stats = bus.get_stats()
    print(f"✅ Bus stats: {stats['registered_agents']} agents registered")

    # Cleanup
    print("\n🧹 Cleaning up...")
    await sandbox.cleanup_all()
    await store.close()

    print("\n✨ Example complete!")


async def ralph_loop_example():
    """Example of Ralph loop for iterative refinement."""
    from choreographer_mcp_server.agents import ralph_loop

    print("\n\n🔄 Ralph Loop Example")
    print("=" * 50)

    backend = HybridBackend()
    await backend.connect()

    store = CRDTStore(backend)
    await store.initialize()

    sandbox = await create_sandbox()

    # Example completion predicate
    async def compiles_successfully(output: str) -> tuple[bool, str]:
        """Check if generated code compiles."""
        # In real implementation, would actually compile
        if "error" in output.lower():
            return False, "Contains compilation error"
        return True, "Compilation successful"

    # Example generator
    async def typescript_generator(context: dict, worktree_path: str) -> str:
        """Generate TypeScript code."""
        # In real implementation, would call LLM
        return "export function hello(): string { return 'world'; }"

    print("🚀 Starting Ralph loop...")

    result = await ralph_loop(
        sandbox=sandbox,
        store=store,
        agent_id=AgentId("typescript_fixer"),
        role=AgentRole.IMPLEMENTER,
        spec_uri="file://examples/specs/hello_endpoint.md",
        generate=typescript_generator,
        predicate=compiles_successfully,
        max_iterations=3,
    )

    print(f"✅ Ralph loop complete")
    print(f"   Success: {result.success}")
    print(f"   Iterations: {result.iterations}")
    print(f"   Guardrails added: {result.guardrails_added}")

    if result.output:
        print(f"   Output: {result.output[:100]}...")

    await sandbox.cleanup_all()
    await store.close()


async def main():
    """Run all examples."""
    try:
        await basic_workflow_example()
        await ralph_loop_example()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
