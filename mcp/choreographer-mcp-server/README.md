# Choreographer MCP Server

**Version**: 0.4.2  
**Protocol**: MCP 2025-11-25 (strict compliance)

A production-grade Model Context Protocol server implementing agentic workflow orchestration with CRDT state management, Shapley attribution analysis, and Human-Agent Network (HAN) topology.

## Features

- ✅ **MCP 2025-11-25 Protocol Compliance** - Strict adherence to the latest MCP specification
- ✅ **Agentic Workflow Orchestration** - Multi-agent workflows with spec refinement, implementation, and verification
- ✅ **CRDT State Management** - Convergent state for distributed agent coordination
- ✅ **Shapley Attribution** - Causal analysis with heuristic, approximate, and full computation tiers
- ✅ **HAN Topology** - Human-Agent Network parallel execution mode
- ✅ **Budget Management** - TOCTOU-safe budget ledger with atomic CAS operations
- ✅ **Supervisor Pattern** - Secure worker spawning without preexec_fn deadlock
- ✅ **Task Augmentation** - Long-running operations with background task support

## Installation

```bash
# Clone or navigate to the project
cd choreographer-mcp-server

# Install with pip
pip install -e .

# Or install with development dependencies
pip install -e ".[dev]"
```

## Usage

### stdio Transport (Default)

```bash
choreographer-mcp
```

### Streamable HTTP Transport

```bash
choreographer-mcp --transport streamable-http --port 8080
```

## Available Tools

### workflow_start

Start an agentic workflow to implement, verify, or refactor code.

```json
{
  "specification": "Implement a function to calculate fibonacci numbers",
  "task_type": "feature",
  "irreversibility_profile": "freely_reversible",
  "budget_usd": 50.0,
  "han_mode": true
}
```

### workflow_status

Get the current status of a workflow.

```json
{
  "workflow_id": "uuid-here",
  "include_trace": true
}
```

### blame_attribution

Analyze workflow to attribute blame/responsibility using Shapley values.

```json
{
  "workflow_id": "uuid-here",
  "tier": "heuristic"
}
```

For computationally expensive analysis:

```json
{
  "workflow_id": "uuid-here",
  "tier": "full"
}
```

With Task augmentation:

```json
{
  "name": "blame_attribution",
  "arguments": {"workflow_id": "...", "tier": "full"},
  "_meta": {
    "task": {"ttl": 600000}
  }
}
```

### workflow_cancel

Cancel a running workflow.

```json
{
  "workflow_id": "uuid-here",
  "reason": "Specification changed"
}
```

## Available Resources

- `choreographer://state/{workflow_id}` - Live workflow phase, budget, and progress
- `choreographer://artifacts/{workflow_id}/diff` - Generated code diff
- `choreographer://spec/{workflow_id}/current` - Current specification
- `choreographer://budget/{workflow_id}` - Budget utilization

## Architecture

### Components

1. **FastMCP Server** (`server.py`)
   - MCP protocol implementation
   - Tool and resource registration
   - Transport handling

2. **State Management** (`state/`)
   - `CRDTState` - Convergent state for workflow coordination
   - `BudgetLedger` - TOCTOU-safe budget management
   - `AppState` - Global application state container

3. **Utilities** (`utils/`)
   - `SpecificationAnalyzer` - Detect underspecified requirements
   - `ShapleyAttributor` - Causal attribution computation

4. **Worker Management** (`workers/`)
   - `Supervisor` - Secure process spawning
   - `_supervisor.py` - Entry point for worker processes
   - `worker.py` - Worker process implementation

### Security Features

- **preexec_fn Avoidance**: Uses supervisor pattern to avoid asyncio deadlock
- **Landlock Sandbox**: Filesystem sandboxing for worker processes (Linux 5.13+)
- **Budget CAS**: Atomic compare-and-swap prevents TOCTOU race conditions
- **Credential Pipes**: Credentials passed via file descriptors, not environment

## Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=choreographer --cov-report=html

# Lint
ruff check choreographer

# Type check
mypy choreographer
```

## Protocol Compliance

| Feature | Status |
|---------|--------|
| Tools with annotations | ✅ |
| ToolError serialization | ✅ |
| Progress notifications | ✅ |
| Resource templates | ✅ |
| Task augmentation | ✅ |
| CreateTaskResult format | ✅ |
| stdio transport | ✅ |
| streamable-http transport | ✅ |
| MCP-Session-Id header | ✅ |
| MCP-Protocol-Version header | ✅ |

## Specification Analysis

The server includes automatic specification analysis to detect underspecified requirements:

- Acceptance criteria presence
- Scope definition
- Constraints documentation
- Context/background

## Shapley Attribution Tiers

1. **Heuristic** - Fast analysis based on error presence and timing
2. **Approximate** - Monte Carlo sampling (100-500 samples)
3. **Full** - Exact computation (exponential, limited to < 10 steps)

## License

MIT
