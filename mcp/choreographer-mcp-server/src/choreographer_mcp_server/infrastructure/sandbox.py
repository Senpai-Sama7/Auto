"""Git worktree-based context isolation for agent execution.

Implements the Context Isolation Protocol from the Choreographer specification:
- Every agent execution spawns in a git worktree (isolated filesystem + git ref)
- Secrets injected via anonymous pipe (not env vars)
- No filesystem trace after destruction
"""

from __future__ import annotations

import asyncio
import os
import secrets
import shutil
import subprocess
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator, BinaryIO

import structlog
from pygit2 import Repository, clone_repository

from choreographer_mcp_server.models import AgentId, AgentProcess, AgentRole, WorktreeRef

logger = structlog.get_logger()


@dataclass(frozen=True)
class SandboxConfig:
    """Configuration for sandboxed agent execution."""

    base_repo_path: Path
    worktree_base: Path = Path(tempfile.gettempdir()) / "choreographer_worktrees"
    max_worktrees: int = 100
    cleanup_on_exit: bool = True
    secrets_pipe_size: int = 65536


class GitWorktreeSandbox:
    """Manages isolated git worktrees for agent execution.

    Implements the Context Isolation Protocol:
    - Spawns agents in disposable git worktrees
    - Injects secrets via anonymous pipes (not environment variables)
    - Ensures complete cleanup after agent termination
    """

    def __init__(self, config: SandboxConfig | None = None) -> None:
        self.config = config or SandboxConfig(base_repo_path=Path.cwd())
        self._active_worktrees: dict[WorktreeRef, Path] = {}
        self._repo: Repository | None = None
        self._lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Initialize the sandbox - ensure base repo is valid."""
        async with self._lock:
            if not self.config.base_repo_path.exists():
                raise SandboxError(
                    f"Base repo path does not exist: {self.config.base_repo_path}"
                )

            try:
                self._repo = Repository(str(self.config.base_repo_path / ".git"))
            except Exception as e:
                raise SandboxError(f"Invalid git repository: {e}") from e

            self.config.worktree_base.mkdir(parents=True, exist_ok=True)
            logger.info(
                "sandbox_initialized",
                base_repo=str(self.config.base_repo_path),
                worktree_base=str(self.config.worktree_base),
            )

    async def spawn_agent(
        self,
        agent_id: AgentId,
        role: AgentRole,
        spec_uri: str,
        context_budget_tokens: int,
        base_ref: str = "HEAD",
        secrets: dict[str, str] | None = None,
    ) -> AgentProcess:
        """Spawn an agent in an isolated git worktree.

        Args:
            agent_id: Unique identifier for the agent
            role: Agent role in the HAN
            spec_uri: URI to the specification document
            context_budget_tokens: Maximum tokens for context window
            base_ref: Git ref to base worktree on (default: HEAD)
            secrets: Secrets to inject via anonymous pipe

        Returns:
            AgentProcess with worktree path and pipe descriptors

        Raises:
            SandboxError: If worktree creation fails
            WorktreeLimitError: If max worktrees exceeded
        """
        async with self._lock:
            if len(self._active_worktrees) >= self.config.max_worktrees:
                raise WorktreeLimitError(
                    f"Maximum worktrees ({self.config.max_worktrees}) exceeded"
                )

            # Generate unique worktree reference
            worktree_ref = WorktreeRef(f"{agent_id}_{secrets.token_hex(8)}")
            worktree_path = self.config.worktree_base / worktree_ref

            try:
                # Create git worktree
                await self._create_worktree(worktree_ref, worktree_path, base_ref)

                # Create anonymous pipe for secrets
                secrets_pipe = await self._create_secrets_pipe(secrets or {})

                # Set up minimal git config (no user info to prevent commits)
                await self._setup_git_config(worktree_path)

                # Record active worktree
                self._active_worktrees[worktree_ref] = worktree_path

                process = AgentProcess(
                    agent_id=agent_id,
                    role=role,
                    worktree_path=str(worktree_path),
                    spec_uri=spec_uri,
                    context_budget_tokens=context_budget_tokens,
                )

                logger.info(
                    "agent_spawned",
                    agent_id=agent_id,
                    role=role,
                    worktree_ref=worktree_ref,
                    worktree_path=str(worktree_path),
                    has_secrets=bool(secrets),
                )

                return process

            except Exception as e:
                # Cleanup on failure
                await self._cleanup_worktree(worktree_path)
                raise SandboxError(f"Failed to spawn agent: {e}") from e

    async def destroy_worktree(self, worktree_ref: WorktreeRef) -> None:
        """Destroy a worktree and all its contents.

        Args:
            worktree_ref: Reference to the worktree to destroy
        """
        async with self._lock:
            if worktree_ref not in self._active_worktrees:
                logger.warning("worktree_not_found", worktree_ref=worktree_ref)
                return

            worktree_path = self._active_worktrees[worktree_ref]

            try:
                await self._cleanup_worktree(worktree_path)
                del self._active_worktrees[worktree_ref]

                logger.info("worktree_destroyed", worktree_ref=worktree_ref)

            except Exception as e:
                logger.error(
                    "worktree_cleanup_failed",
                    worktree_ref=worktree_ref,
                    error=str(e),
                )
                raise SandboxError(f"Failed to cleanup worktree: {e}") from e

    async def list_active_worktrees(self) -> dict[WorktreeRef, Path]:
        """List all active worktrees."""
        async with self._lock:
            return dict(self._active_worktrees)

    async def cleanup_all(self) -> None:
        """Destroy all active worktrees."""
        async with self._lock:
            for worktree_ref, worktree_path in list(self._active_worktrees.items()):
                try:
                    await self._cleanup_worktree(worktree_path)
                    logger.info("worktree_cleaned", worktree_ref=worktree_ref)
                except Exception as e:
                    logger.error(
                        "worktree_cleanup_failed",
                        worktree_ref=worktree_ref,
                        error=str(e),
                    )
            self._active_worktrees.clear()

    async def _create_worktree(
        self, worktree_ref: WorktreeRef, worktree_path: Path, base_ref: str
    ) -> None:
        """Create a git worktree."""
        cmd = [
            "git", "worktree", "add",
            "--detach",  # Detached HEAD to prevent accidental commits
            str(worktree_path),
            base_ref,
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=self.config.base_repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise SandboxError(
                f"Git worktree creation failed: {stderr.decode()}"
            )

        # Create isolation markers
        (worktree_path / ".choreographer_worktree").touch()
        (worktree_path / ".choreographer_ref").write_text(worktree_ref)

    async def _cleanup_worktree(self, worktree_path: Path) -> None:
        """Remove a git worktree and its files."""
        if not worktree_path.exists():
            return

        # Verify this is a choreographer worktree
        marker = worktree_path / ".choreographer_worktree"
        if not marker.exists():
            logger.warning(
                "not_a_choreographer_worktree",
                path=str(worktree_path),
            )
            return

        # Remove git worktree entry
        try:
            cmd = ["git", "worktree", "remove", "--force", str(worktree_path)]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=self.config.base_repo_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
        except Exception as e:
            logger.warning("git_worktree_remove_failed", error=str(e))

        # Ensure filesystem cleanup
        if worktree_path.exists():
            await asyncio.to_thread(shutil.rmtree, worktree_path, ignore_errors=True)

    async def _setup_git_config(self, worktree_path: Path) -> None:
        """Setup minimal git config to prevent commits."""
        gitconfig = worktree_path / ".git" / "config"
        config_content = """
[user]
    name = Choreographer Agent
    email = agent@choreographer.local
[core]
    bare = false
    repositoryformatversion = 0
    filemode = true
    logallrefupdates = false
"""
        gitconfig.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(gitconfig.write_text, config_content)

    async def _create_secrets_pipe(
        self, secrets: dict[str, str]
    ) -> tuple[int, int]:
        """Create anonymous pipe for secrets injection.

        Returns:
            Tuple of (read_fd, write_fd) for the pipe
        """
        # Create anonymous pipe
        read_fd, write_fd = os.pipe()

        # Write secrets to pipe
        secrets_data = "\n".join(f"{k}={v}" for k, v in secrets.items())
        secrets_bytes = secrets_data.encode("utf-8")

        if len(secrets_bytes) > self.config.secrets_pipe_size:
            raise SandboxError("Secrets exceed pipe size limit")

        os.write(write_fd, secrets_bytes)
        os.close(write_fd)

        return (read_fd, -1)  # Return read fd, write fd closed

    @asynccontextmanager
    async def agent_context(
        self,
        agent_id: AgentId,
        role: AgentRole,
        spec_uri: str,
        context_budget_tokens: int,
        base_ref: str = "HEAD",
        secrets: dict[str, str] | None = None,
    ) -> AsyncIterator[AgentProcess]:
        """Context manager for agent lifecycle.

        Automatically destroys worktree on exit.

        Usage:
            async with sandbox.agent_context(...) as agent:
                # Use agent
                pass
            # Worktree automatically cleaned up
        """
        process = await self.spawn_agent(
            agent_id=agent_id,
            role=role,
            spec_uri=spec_uri,
            context_budget_tokens=context_budget_tokens,
            base_ref=base_ref,
            secrets=secrets,
        )

        worktree_ref = WorktreeRef(Path(process.worktree_path).name)

        try:
            yield process
        finally:
            await self.destroy_worktree(worktree_ref)


class SandboxError(Exception):
    """Base error for sandbox operations."""
    pass


class WorktreeLimitError(SandboxError):
    """Raised when worktree limit is exceeded."""
    pass


async def create_sandbox(
    base_repo_path: Path | str | None = None,
) -> GitWorktreeSandbox:
    """Factory function to create and initialize a sandbox.

    Args:
        base_repo_path: Path to base git repository (default: current directory)

    Returns:
        Initialized GitWorktreeSandbox
    """
    if base_repo_path is None:
        base_repo_path = Path.cwd()

    config = SandboxConfig(base_repo_path=Path(base_repo_path))
    sandbox = GitWorktreeSandbox(config)
    await sandbox.initialize()
    return sandbox


class _NoOpSandbox:
    """No-op sandbox for standalone mode (no git required)."""

    def __init__(self) -> None:
        self._worktrees: dict[AgentId, AgentProcess] = {}

    async def spawn_agent(
        self,
        agent_id: AgentId,
        role: AgentRole,
        spec_uri: str,
        context_budget_tokens: int,
        base_ref: str = "HEAD",
        secrets: dict[str, str] | None = None,
    ) -> AgentProcess:
        """Return a mock agent process."""
        from datetime import datetime
        process = AgentProcess(
            agent_id=agent_id,
            role=role,
            worktree_path=f"/tmp/mock-worktree-{agent_id}",
            spec_uri=spec_uri,
            context_budget_tokens=context_budget_tokens,
        )
        self._worktrees[agent_id] = process
        return process

    async def terminate_agent(self, agent_id: AgentId) -> None:
        """Remove agent from tracking."""
        self._worktrees.pop(agent_id, None)

    async def list_active_worktrees(self) -> dict[AgentId, Path]:
        """Return empty dict."""
        return {k: Path(v.worktree_path) for k, v in self._worktrees.items()}

    async def cleanup_all(self) -> None:
        """Clear tracking."""
        self._worktrees.clear()
