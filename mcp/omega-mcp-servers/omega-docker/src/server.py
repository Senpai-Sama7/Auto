"""Omega Docker MCP Server - Container management and operations."""

import json
import structlog
from fastmcp import FastMCP
from typing import Optional, Dict, Any, List

mcp = FastMCP("omega-docker")
logger = structlog.get_logger("omega-docker")


def _run_docker_command(args: List[str]) -> tuple:
    """Run a docker command and return (success, output/error)."""
    import subprocess
    try:
        result = subprocess.run(
            ["docker"] + args,
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return True, result.stdout
        else:
            return False, result.stderr
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except FileNotFoundError:
        return False, "Docker not installed or not in PATH"
    except Exception as e:
        return False, str(e)


@mcp.tool()
async def docker_list_containers(all: bool = False, filters: Optional[Dict[str, Any]] = None) -> str:
    """List Docker containers with status and port mappings.
    
    Get a list of Docker containers including their ID, name, image,
    status, and port mappings.
    
    Args:
        all: Show all containers including stopped ones
        filters: Optional filters like {"status": ["running"]}
        
    Returns:
        JSON string with container list
    """
    try:
        cmd = ["ps", "--format", "{{json .}}"]
        if all:
            cmd.append("--all")
        
        success, output = _run_docker_command(cmd)
        if not success:
            return json.dumps({"error": output})
        
        containers = []
        for line in output.strip().split('\n'):
            if line:
                try:
                    containers.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        
        # Apply filters if provided
        if filters and "status" in filters:
            statuses = filters["status"]
            containers = [c for c in containers if c.get("State") in statuses]
        
        return json.dumps(containers, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def docker_list_images(all: bool = False) -> str:
    """List Docker images on the system.
    
    Get a list of Docker images with tags, sizes, and creation dates.
    
    Args:
        all: Include intermediate layers
        
    Returns:
        JSON string with image list
    """
    try:
        cmd = ["images", "--format", "{{json .}}"]
        if all:
            cmd.append("--all")
        
        success, output = _run_docker_command(cmd)
        if not success:
            return json.dumps({"error": output})
        
        images = []
        for line in output.strip().split('\n'):
            if line:
                try:
                    images.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        
        return json.dumps(images, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def docker_run_container(
    image: str,
    name: Optional[str] = None,
    command: Optional[List[str]] = None,
    ports: Optional[Dict[str, str]] = None,
    env: Optional[Dict[str, str]] = None,
    volumes: Optional[List[str]] = None,
    detach: bool = True
) -> str:
    """Create and start a new Docker container.
    
    Launch a Docker container with specified configuration.
    
    Args:
        image: Docker image to run
        name: Container name (optional)
        command: Command and args to run
        ports: Port mappings {host_port: container_port}
        env: Environment variables
        volumes: Volume mounts ["host:container"]
        detach: Run in background
        
    Returns:
        JSON string with container ID and status
    """
    try:
        cmd = ["run"]
        
        if detach:
            cmd.append("--detach")
        
        if name:
            cmd.extend(["--name", name])
        
        if ports:
            for host, container in ports.items():
                cmd.extend(["-p", f"{host}:{container}"])
        
        if env:
            for key, value in env.items():
                cmd.extend(["-e", f"{key}={value}"])
        
        if volumes:
            for vol in volumes:
                cmd.extend(["-v", vol])
        
        cmd.append(image)
        
        if command:
            cmd.extend(command)
        
        success, output = _run_docker_command(cmd)
        if success:
            container_id = output.strip()
            return json.dumps({
                "success": True,
                "container_id": container_id[:12],
                "status": "created" if detach else "completed"
            })
        else:
            return json.dumps({"error": output})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def docker_container_action(container: str, action: str, force: bool = False) -> str:
    """Control a Docker container (start, stop, restart, pause, unpause, remove).
    
    Perform lifecycle actions on a container.
    
    Args:
        container: Container ID or name
        action: One of: start, stop, restart, pause, unpause, remove
        force: Force action (for stop/remove)
        
    Returns:
        JSON string with action result
    """
    try:
        valid_actions = ["start", "stop", "restart", "pause", "unpause", "remove"]
        if action not in valid_actions:
            return json.dumps({"error": f"Invalid action. Use: {valid_actions}"})
        
        # Map 'remove' to 'rm'
        docker_action = "rm" if action == "remove" else action
        
        cmd = [docker_action]
        if force and action in ["stop", "remove"]:
            cmd.append("--force")
        cmd.append(container)
        
        success, output = _run_docker_command(cmd)
        if success:
            return json.dumps({
                "success": True,
                "action": action,
                "container": container,
                "message": output.strip() or f"Container {action}ed successfully"
            })
        else:
            return json.dumps({"error": output})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def docker_container_logs(container: str, tail: int = 100, timestamps: bool = True) -> str:
    """Retrieve logs from a Docker container.
    
    Get the stdout/stderr logs from a container.
    
    Args:
        container: Container ID or name
        tail: Number of lines to show (max 1000)
        timestamps: Include timestamps
        
    Returns:
        Container logs
    """
    try:
        tail = min(tail, 1000)
        cmd = ["logs", "--tail", str(tail)]
        if timestamps:
            cmd.append("--timestamps")
        cmd.append(container)
        
        success, output = _run_docker_command(cmd)
        if success:
            return json.dumps({
                "container": container,
                "logs": output
            })
        else:
            return json.dumps({"error": output})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def docker_inspect_container(container: str) -> str:
    """Get detailed information about a container.
    
    Returns comprehensive container configuration, state,
    mounts, and network settings.
    
    Args:
        container: Container ID or name
        
    Returns:
        JSON string with detailed container info
    """
    try:
        cmd = ["inspect", container]
        
        success, output = _run_docker_command(cmd)
        if success:
            data = json.loads(output)
            return json.dumps(data[0] if data else {}, indent=2)
        else:
            return json.dumps({"error": output})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def docker_system_prune(images: bool = False, volumes: bool = False) -> str:
    """Clean up unused Docker resources.
    
    Remove stopped containers, unused networks, dangling images,
    and optionally unused volumes.
    
    Args:
        images: Also remove unused images
        volumes: Also remove unused volumes (DANGEROUS)
        
    Returns:
        JSON string with cleanup results
    """
    try:
        cmd = ["system", "prune", "--force"]
        
        if images:
            cmd.append("--all")
        
        if volumes:
            cmd.append("--volumes")
        
        success, output = _run_docker_command(cmd)
        if success:
            return json.dumps({
                "success": True,
                "message": output.strip()
            })
        else:
            return json.dumps({"error": output})
    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    mcp.run(transport="stdio")
