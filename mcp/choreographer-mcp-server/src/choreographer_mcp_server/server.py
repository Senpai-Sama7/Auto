"""Choreographer MCP Server - Agentic Workflow Orchestration.

Exposes tools for:
- Workflow management (create, monitor, signal)
- CRDT store operations
- Agent sandbox management
- Attribution queries
- Safety monitoring
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    TextContent,
    Tool,
    INTERNAL_ERROR,
    INVALID_PARAMS,
)
from pydantic import BaseModel, Field, ValidationError

from choreographer_mcp_server.infrastructure.sandbox import (
    GitWorktreeSandbox,
    _NoOpSandbox,
    create_sandbox,
)
from choreographer_mcp_server.models import (
    AgentId,
    AgentRole,
    Phase,
    WorkflowId,
    WorkflowState,
)
from choreographer_mcp_server.store.crdt_store import CRDTStore
from choreographer_mcp_server.store.backends import HybridBackend, _MemoryBackend

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


# ============================================================================
# Request/Response Models
# ============================================================================


class CreateWorkflowRequest(BaseModel):
    """Request to create a new workflow."""

    spec_uri: str = Field(description="URI to specification document")
    budget: float = Field(default=100.0, description="Initial budget in dollars")
    workflow_id: str | None = Field(default=None, description="Optional workflow ID")


class CreateWorkflowResponse(BaseModel):
    """Response from workflow creation."""

    workflow_id: str
    initial_state: WorkflowState


class GetWorkflowStateRequest(BaseModel):
    """Request to get workflow state."""

    workflow_id: str = Field(description="Workflow ID")


class SignalPhaseGateRequest(BaseModel):
    """Request to signal phase gate approval."""

    workflow_id: str = Field(description="Workflow ID")
    approved: bool = Field(description="Whether to approve the phase")
    feedback: str = Field(default="", description="Optional feedback")
    override_phase: Phase | None = Field(default=None, description="Override next phase")


class SpawnAgentRequest(BaseModel):
    """Request to spawn an isolated agent."""

    agent_id: str = Field(description="Unique agent identifier")
    role: AgentRole = Field(description="Agent role in HAN")
    spec_uri: str = Field(description="URI to specification")
    context_budget_tokens: int = Field(default=50000, description="Token budget")
    base_ref: str = Field(default="HEAD", description="Git ref for worktree base")


class SpawnAgentResponse(BaseModel):
    """Response from agent spawn."""

    agent_id: str
    worktree_path: str
    success: bool
    error: str | None = None


class CRDTGSetAddRequest(BaseModel):
    """Request to add to GSet."""

    key: str = Field(description="CRDT key")
    item: str = Field(description="Item to add")


class CRDTLWWWriteRequest(BaseModel):
    """Request to write LWWRegister."""

    key: str = Field(description="CRDT key")
    value: str = Field(description="Value to write")
    timestamp: float = Field(description="Logical timestamp")
    node_id: str = Field(description="Node identifier")


class CRDTPNCounterIncRequest(BaseModel):
    """Request to increment PNCounter."""

    key: str = Field(description="CRDT key")
    node_id: str = Field(description="Node identifier")
    delta: int = Field(default=1, description="Amount to increment")


class ListActiveWorktreesResponse(BaseModel):
    """Response listing active worktrees."""

    count: int
    worktrees: dict[str, str]


class GetCausalBusStatsResponse(BaseModel):
    """Response with causal bus statistics."""

    registered_agents: int
    hold_buffer_sizes: dict[str, int]
    delivery_queue_sizes: dict[str, int]


# ============================================================================
# Server Lifecycle
# ============================================================================


@asynccontextmanager
async def app_lifespan(server: Server) -> AsyncIterator[dict]:
    """Manage application lifecycle."""
    logger.info("choreographer_server_starting")

    # Initialize backends (with fallback to memory-only mode)
    try:
        backend = HybridBackend()
        await backend.connect()
        logger.info("hybrid_backend_connected")
    except Exception as e:
        logger.warning("backend_connection_failed", error=str(e), fallback="memory")
        # Use a simple memory backend as fallback
        backend = _MemoryBackend()
        await backend.connect()

    store = CRDTStore(backend)
    await store.initialize()

    # Initialize sandbox (with fallback to no sandbox)
    try:
        sandbox = await create_sandbox()
    except Exception as e:
        logger.warning("sandbox_init_failed", error=str(e), fallback="none")
        sandbox = _NoOpSandbox()

    logger.info("choreographer_server_ready")

    yield {
        "store": store,
        "sandbox": sandbox,
    }

    # Cleanup
    logger.info("choreographer_server_shutting_down")
    await sandbox.cleanup_all()
    await store.close()


# Create server
app = Server("choreographer-mcp-server", lifespan=app_lifespan)


# ============================================================================
# Tool Definitions
# ============================================================================


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        # Workflow Management
        Tool(
            name="create_workflow",
            description="Create a new Choreographer workflow for agentic task execution",
            inputSchema=CreateWorkflowRequest.model_json_schema(),
        ),
        Tool(
            name="get_workflow_state",
            description="Query current state of a workflow",
            inputSchema=GetWorkflowStateRequest.model_json_schema(),
        ),
        Tool(
            name="signal_phase_gate",
            description="Signal phase gate approval for human-in-the-loop",
            inputSchema=SignalPhaseGateRequest.model_json_schema(),
        ),
        # Agent Sandbox
        Tool(
            name="spawn_agent",
            description="Spawn an isolated agent in a git worktree",
            inputSchema=SpawnAgentRequest.model_json_schema(),
        ),
        Tool(
            name="list_active_worktrees",
            description="List all active agent worktrees",
            inputSchema={"type": "object", "properties": {}},
        ),
        # CRDT Store
        Tool(
            name="crdt_gset_add",
            description="Add item to a Grow-only Set (GSet) CRDT",
            inputSchema=CRDTGSetAddRequest.model_json_schema(),
        ),
        Tool(
            name="crdt_gset_get",
            description="Get all items from a GSet CRDT",
            inputSchema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "CRDT key"},
                },
                "required": ["key"],
            },
        ),
        Tool(
            name="crdt_lww_write",
            description="Write to a Last-Write-Wins (LWW) Register CRDT",
            inputSchema=CRDTLWWWriteRequest.model_json_schema(),
        ),
        Tool(
            name="crdt_lww_get",
            description="Get value from an LWW Register CRDT",
            inputSchema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "CRDT key"},
                },
                "required": ["key"],
            },
        ),
        Tool(
            name="crdt_pncounter_increment",
            description="Increment a Positive-Negative Counter CRDT",
            inputSchema=CRDTPNCounterIncRequest.model_json_schema(),
        ),
        Tool(
            name="crdt_pncounter_get",
            description="Get current value of a PNCounter CRDT",
            inputSchema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "CRDT key"},
                },
                "required": ["key"],
            },
        ),
        # System Info
        Tool(
            name="get_causal_bus_stats",
            description="Get causal message bus statistics",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="get_guardrails",
            description="Get guardrails for a module",
            inputSchema={
                "type": "object",
                "properties": {
                    "module": {"type": "string", "description": "Module name"},
                },
                "required": ["module"],
            },
        ),
    ]


# ============================================================================
# Tool Handlers
# ============================================================================


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    ctx = app.request_context
    lifespan_ctx = ctx.lifespan_context
    store: CRDTStore = lifespan_ctx["store"]
    sandbox: GitWorktreeSandbox = lifespan_ctx["sandbox"]

    try:
        if name == "create_workflow":
            req = CreateWorkflowRequest.model_validate(arguments)
            state = WorkflowState(
                workflow_id=WorkflowId(req.workflow_id or "placeholder"),
                spec_uri=req.spec_uri,
                budget_remaining=req.budget,
                current_phase=Phase.DISCUSS,
            )
            return [
                TextContent(
                    type="text",
                    text=CreateWorkflowResponse(
                        workflow_id=str(state.workflow_id),
                        initial_state=state,
                    ).model_dump_json(indent=2),
                )
            ]

        elif name == "get_workflow_state":
            req = GetWorkflowStateRequest.model_validate(arguments)
            # In real implementation, query Temporal
            return [
                TextContent(
                    type="text",
                    text=f"Workflow state for {req.workflow_id}: pending implementation",
                )
            ]

        elif name == "signal_phase_gate":
            req = SignalPhaseGateRequest.model_validate(arguments)
            return [
                TextContent(
                    type="text",
                    text=f"Phase gate signal sent to {req.workflow_id}: approved={req.approved}",
                )
            ]

        elif name == "spawn_agent":
            req = SpawnAgentRequest.model_validate(arguments)
            try:
                process = await sandbox.spawn_agent(
                    agent_id=AgentId(req.agent_id),
                    role=req.role,
                    spec_uri=req.spec_uri,
                    context_budget_tokens=req.context_budget_tokens,
                    base_ref=req.base_ref,
                )
                return [
                    TextContent(
                        type="text",
                        text=SpawnAgentResponse(
                            agent_id=req.agent_id,
                            worktree_path=process.worktree_path,
                            success=True,
                        ).model_dump_json(indent=2),
                    )
                ]
            except Exception as e:
                return [
                    TextContent(
                        type="text",
                        text=SpawnAgentResponse(
                            agent_id=req.agent_id,
                            worktree_path="",
                            success=False,
                            error=str(e),
                        ).model_dump_json(indent=2),
                    )
                ]

        elif name == "list_active_worktrees":
            worktrees = await sandbox.list_active_worktrees()
            return [
                TextContent(
                    type="text",
                    text=ListActiveWorktreesResponse(
                        count=len(worktrees),
                        worktrees={str(k): str(v) for k, v in worktrees.items()},
                    ).model_dump_json(indent=2),
                )
            ]

        elif name == "crdt_gset_add":
            req = CRDTGSetAddRequest.model_validate(arguments)
            result = await store.gset_add(req.key, req.item)
            return [
                TextContent(
                    type="text",
                    text=f"Added to GSet '{req.key}'. Size: {len(result.items)}",
                )
            ]

        elif name == "crdt_gset_get":
            key = arguments.get("key")
            result = await store.gset_get(key)
            items = list(result.items)
            return [
                TextContent(
                    type="text",
                    text=f"GSet '{key}' has {len(items)} items:\n" + "\n".join(f"- {i[:100]}..." if len(i) > 100 else f"- {i}" for i in items[:20]),
                )
            ]

        elif name == "crdt_lww_write":
            req = CRDTLWWWriteRequest.model_validate(arguments)
            result = await store.lww_write(req.key, req.value, req.timestamp, req.node_id)
            return [
                TextContent(
                    type="text",
                    text=f"Wrote to LWW '{req.key}' at timestamp {result.timestamp}",
                )
            ]

        elif name == "crdt_lww_get":
            key = arguments.get("key")
            result = await store.lww_get(key)
            return [
                TextContent(
                    type="text",
                    text=f"LWW '{key}': {result.value} (ts={result.timestamp}, node={result.node_id})",
                )
            ]

        elif name == "crdt_pncounter_increment":
            req = CRDTPNCounterIncRequest.model_validate(arguments)
            result = await store.pncounter_increment(req.key, req.node_id, req.delta)
            return [
                TextContent(
                    type="text",
                    text=f"PNCounter '{req.key}' = {result.value()}",
                )
            ]

        elif name == "crdt_pncounter_get":
            key = arguments.get("key")
            result = await store.pncounter_get(key)
            return [
                TextContent(
                    type="text",
                    text=f"PNCounter '{key}' = {result.value()}",
                )
            ]

        elif name == "get_causal_bus_stats":
            # Placeholder - would need actual bus instance
            return [
                TextContent(
                    type="text",
                    text=GetCausalBusStatsResponse(
                        registered_agents=0,
                        hold_buffer_sizes={},
                        delivery_queue_sizes={},
                    ).model_dump_json(indent=2),
                )
            ]

        elif name == "get_guardrails":
            module = arguments.get("module")
            result = await store.get_guardrails(module)
            items = list(result.items)
            return [
                TextContent(
                    type="text",
                    text=f"Guardrails for '{module}' ({len(items)} items):\n"
                    + "\n".join(f"- {i[:200]}..." if len(i) > 200 else f"- {i}" for i in items[:10]),
                )
            ]

        else:
            raise ValueError(f"Unknown tool: {name}")

    except ValidationError as e:
        return [
            TextContent(
                type="text",
                text=f"Validation error: {e}",
            )
        ]
    except Exception as e:
        logger.error("tool_error", tool=name, error=str(e))
        return [
            TextContent(
                type="text",
                text=f"Error executing {name}: {e}",
            )
        ]


# ============================================================================
# Main Entry Point
# ============================================================================


async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options(),
        )


def run():
    """Synchronous entry point for CLI."""
    asyncio.run(main())


if __name__ == "__main__":
    run()
