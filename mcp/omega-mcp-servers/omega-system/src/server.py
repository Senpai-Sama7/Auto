"""Omega System MCP Server - System monitoring and metrics."""

import asyncio
import json
import structlog
from fastmcp import FastMCP

mcp = FastMCP("omega-system")
logger = structlog.get_logger("omega-system")


@mcp.tool()
async def system_get_metrics(include_temperatures: bool = False) -> str:
    """Get current CPU, memory, and disk usage.
    
    Returns real-time system metrics including:
    - CPU usage percentage
    - Memory usage (total, used, free, percentage)
    - Disk usage for all mounted filesystems
    - Optional: CPU/GPU temperatures
    
    Args:
        include_temperatures: Include CPU/GPU temperatures if available
        
    Returns:
        JSON string with system metrics
    """
    try:
        # Import here to avoid dependency issues
        import psutil
        
        # CPU metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_count = psutil.cpu_count()
        
        # Memory metrics
        memory = psutil.virtual_memory()
        
        # Disk metrics
        disk = psutil.disk_usage('/')
        
        metrics = {
            "cpu": {
                "usage_percent": cpu_percent,
                "core_count": cpu_count,
            },
            "memory": {
                "total_gb": round(memory.total / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2),
                "free_gb": round(memory.free / (1024**3), 2),
                "usage_percent": memory.percent
            },
            "disk": {
                "total_gb": round(disk.total / (1024**3), 2),
                "used_gb": round(disk.used / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "usage_percent": round((disk.used / disk.total) * 100, 1)
            }
        }
        
        if include_temperatures:
            try:
                temps = psutil.sensors_temperatures()
                if temps:
                    metrics["temperatures"] = {
                        name: [{"label": t.label or "", 
                                "current": t.current,
                                "high": t.high,
                                "critical": t.critical} 
                               for t in readings]
                        for name, readings in temps.items()
                    }
            except Exception:
                metrics["temperatures"] = "Not available"
        
        return json.dumps(metrics, indent=2)
    except ImportError:
        return json.dumps({"error": "psutil not installed"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def system_list_processes(limit: int = 20, sort_by: str = "cpu") -> str:
    """List running processes with CPU and memory usage.
    
    Get detailed information about currently running processes,
    sorted by CPU or memory usage.
    
    Args:
        limit: Maximum number of processes to return (1-100)
        sort_by: Sort field - "cpu", "mem", "pid", or "name"
        
    Returns:
        JSON string with process list
    """
    try:
        import psutil
        
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'username']):
            try:
                pinfo = proc.info
                processes.append({
                    "pid": pinfo['pid'],
                    "name": pinfo['name'],
                    "cpu_percent": pinfo['cpu_percent'] or 0.0,
                    "memory_percent": round(pinfo['memory_percent'] or 0.0, 2),
                    "user": pinfo['username'] or "unknown"
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Sort
        sort_key = {"cpu": "cpu_percent", "mem": "memory_percent", 
                    "pid": "pid", "name": "name"}.get(sort_by, "cpu_percent")
        processes.sort(key=lambda x: x[sort_key], reverse=(sort_by in ["cpu", "mem"]))
        
        return json.dumps(processes[:limit], indent=2)
    except ImportError:
        return json.dumps({"error": "psutil not installed"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def system_disk_usage() -> str:
    """Get detailed disk usage for all mounted filesystems.
    
    Returns disk usage information for all mounted drives/partitions
    including total size, used space, available space, and filesystem type.
    
    Returns:
        JSON string with disk usage for all filesystems
    """
    try:
        import psutil
        
        disks = []
        for partition in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    "device": partition.device,
                    "mountpoint": partition.mountpoint,
                    "filesystem": partition.fstype,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "usage_percent": round((usage.used / usage.total) * 100, 1)
                })
            except PermissionError:
                continue
        
        return json.dumps(disks, indent=2)
    except ImportError:
        return json.dumps({"error": "psutil not installed"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def system_get_info(detail_level: str = "basic") -> str:
    """Get comprehensive system information.
    
    Returns detailed information about the operating system,
    CPU, memory, and hardware.
    
    Args:
        detail_level: Level of detail - "basic" or "full"
        
    Returns:
        JSON string with system information
    """
    try:
        import psutil
        import platform
        
        info = {
            "platform": {
                "system": platform.system(),
                "release": platform.release(),
                "version": platform.version(),
                "machine": platform.machine(),
                "processor": platform.processor()
            },
            "cpu": {
                "physical_cores": psutil.cpu_count(logical=False),
                "logical_cores": psutil.cpu_count(logical=True),
                "frequency_mhz": psutil.cpu_freq().current if psutil.cpu_freq() else None
            },
            "memory": {
                "total_gb": round(psutil.virtual_memory().total / (1024**3), 2)
            },
            "boot_time": psutil.boot_time()
        }
        
        if detail_level == "full":
            info["cpu"]["stats"] = psutil.cpu_stats()._asdict()
            info["network"] = {
                "interfaces": list(psutil.net_if_addrs().keys())
            }
        
        return json.dumps(info, indent=2)
    except ImportError:
        return json.dumps({"error": "psutil not installed"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def system_kill_process(pid: int, force: bool = False) -> str:
    """Kill a process by PID.
    
    Terminate a running process. Use with caution.
    
    Args:
        pid: Process ID to kill
        force: If True, force kill (SIGKILL), otherwise graceful (SIGTERM)
        
    Returns:
        Success or error message
    """
    try:
        import psutil
        
        process = psutil.Process(pid)
        name = process.name()
        
        if force:
            process.kill()
        else:
            process.terminate()
            try:
                process.wait(timeout=3)
            except psutil.TimeoutExpired:
                process.kill()
        
        return json.dumps({
            "success": True,
            "message": f"Process {name} (PID {pid}) terminated"
        })
    except psutil.NoSuchProcess:
        return json.dumps({"error": f"Process {pid} not found"})
    except psutil.AccessDenied:
        return json.dumps({"error": f"Permission denied to kill process {pid}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    mcp.run(transport="stdio")
