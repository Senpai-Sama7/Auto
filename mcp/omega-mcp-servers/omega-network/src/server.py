"""Omega Network MCP Server - Network diagnostics and connectivity."""

import json
import structlog
from fastmcp import FastMCP
from typing import List, Optional

mcp = FastMCP("omega-network")
logger = structlog.get_logger("omega-network")


@mcp.tool()
async def network_ping(host: str, count: int = 4, timeout: int = 5) -> str:
    """Check if a host is reachable via ICMP ping.
    
    Sends ICMP echo requests and returns latency statistics.
    
    Args:
        host: IP address or hostname to ping
        count: Number of pings (1-10)
        timeout: Timeout per ping in seconds
        
    Returns:
        JSON string with ping statistics
    """
    try:
        import subprocess
        import platform
        
        count = min(max(count, 1), 10)
        
        # Platform-specific ping command
        system = platform.system().lower()
        if system == "windows":
            cmd = ["ping", "-n", str(count), "-w", str(timeout * 1000), host]
        else:
            cmd = ["ping", "-c", str(count), "-W", str(timeout), host]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout * count + 5
        )
        
        output = result.stdout + result.stderr
        
        # Parse output
        import re
        
        # Extract packet loss
        packet_loss_match = re.search(r'(\d+)% packet loss', output)
        packet_loss = int(packet_loss_match.group(1)) if packet_loss_match else None
        
        # Extract times
        time_matches = re.findall(r'time[=<](\d+\.?\d*)\s*ms', output)
        times = [float(t) for t in time_matches]
        
        stats = {
            "host": host,
            "packets_sent": count,
            "packets_received": count - int(count * (packet_loss or 0) / 100),
            "packet_loss_percent": packet_loss,
            "reachable": packet_loss is not None and packet_loss < 100
        }
        
        if times:
            stats["latency_ms"] = {
                "min": round(min(times), 2),
                "avg": round(sum(times) / len(times), 2),
                "max": round(max(times), 2)
            }
        
        return json.dumps(stats, indent=2)
    except subprocess.TimeoutExpired:
        return json.dumps({
            "host": host,
            "error": "Ping timed out",
            "reachable": False
        })
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def network_port_scan(host: str, ports: Optional[List[int]] = None, timeout: int = 2) -> str:
    """Scan TCP ports on a host to check if they're open.
    
    Performs TCP connect scans on specified ports.
    
    Args:
        host: Host to scan (IP or hostname)
        ports: Array of port numbers to scan (default: common ports)
        timeout: Timeout per port in seconds
        
    Returns:
        JSON string with port scan results
    """
    try:
        import socket
        
        if not ports:
            ports = [22, 80, 443, 3306, 5432, 8080, 8443, 3000, 5000, 9000]
        
        results = []
        
        for port in ports:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            
            try:
                result = sock.connect_ex((host, port))
                if result == 0:
                    status = "open"
                    # Try to get banner
                    try:
                        sock.settimeout(1)
                        banner = sock.recv(1024).decode('utf-8', errors='ignore').strip()
                    except:
                        banner = None
                else:
                    status = "closed"
                    banner = None
                
                results.append({
                    "port": port,
                    "status": status,
                    "banner": banner
                })
            except socket.gaierror:
                return json.dumps({"error": f"Could not resolve hostname: {host}"})
            except Exception as e:
                results.append({
                    "port": port,
                    "status": "error",
                    "error": str(e)
                })
            finally:
                sock.close()
        
        open_ports = [r for r in results if r["status"] == "open"]
        
        return json.dumps({
            "host": host,
            "ports_scanned": len(ports),
            "open_ports_found": len(open_ports),
            "results": results
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def network_dns_lookup(hostname: str, record_type: str = "A") -> str:
    """Resolve DNS records for a hostname.
    
    Args:
        hostname: Hostname to lookup
        record_type: Record type - A, AAAA, MX, TXT, NS, CNAME, SOA
        
    Returns:
        JSON string with DNS records
    """
    try:
        import socket
        import dns.resolver
        
        valid_types = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA']
        if record_type not in valid_types:
            return json.dumps({"error": f"Invalid record type. Use: {valid_types}"})
        
        try:
            answers = dns.resolver.resolve(hostname, record_type)
            records = [str(rdata) for rdata in answers]
        except dns.resolver.NoAnswer:
            records = []
        except dns.resolver.NXDOMAIN:
            return json.dumps({"error": f"Domain {hostname} does not exist"})
        
        return json.dumps({
            "hostname": hostname,
            "record_type": record_type,
            "records": records,
            "count": len(records)
        }, indent=2)
    except ImportError:
        # Fallback to socket
        try:
            if record_type == "A":
                ip = socket.gethostbyname(hostname)
                return json.dumps({
                    "hostname": hostname,
                    "record_type": "A",
                    "records": [ip],
                    "count": 1
                })
            else:
                return json.dumps({"error": "dnspython required for non-A records"})
        except socket.gaierror:
            return json.dumps({"error": f"Could not resolve {hostname}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def network_reverse_dns(ip: str) -> str:
    """Find the hostname associated with an IP address.
    
    Args:
        ip: IP address to reverse lookup
        
    Returns:
        JSON string with associated hostnames
    """
    try:
        import socket
        
        try:
            hostname, aliaslist, ipaddrlist = socket.gethostbyaddr(ip)
            return json.dumps({
                "ip": ip,
                "hostname": hostname,
                "aliases": aliaslist,
                "ips": ipaddrlist
            }, indent=2)
        except socket.herror:
            return json.dumps({
                "ip": ip,
                "error": "No PTR record found"
            })
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def network_interfaces() -> str:
    """Get network interface details including IP addresses and statistics.
    
    Returns information about all network interfaces on the system.
    
    Returns:
        JSON string with network interface details
    """
    try:
        import psutil
        
        interfaces = {}
        stats = psutil.net_if_stats()
        addrs = psutil.net_if_addrs()
        
        for name, stat in stats.items():
            interfaces[name] = {
                "is_up": stat.isup,
                "speed_mbps": stat.speed,
                "mtu": stat.mtu,
                "addresses": []
            }
            
            if name in addrs:
                for addr in addrs[name]:
                    interfaces[name]["addresses"].append({
                        "family": str(addr.family),
                        "address": addr.address,
                        "netmask": addr.netmask,
                        "broadcast": addr.broadcast
                    })
        
        return json.dumps(interfaces, indent=2)
    except ImportError:
        return json.dumps({"error": "psutil not installed"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def network_traceroute(host: str, max_hops: int = 30) -> str:
    """Trace the network path to a host.
    
    Shows each hop along the route with latency.
    
    Args:
        host: Target host
        max_hops: Maximum number of hops
        
    Returns:
        JSON string with traceroute results
    """
    try:
        import subprocess
        import platform
        import re
        
        system = platform.system().lower()
        if system == "windows":
            cmd = ["tracert", "-h", str(max_hops), host]
        else:
            cmd = ["traceroute", "-m", str(max_hops), host]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        output = result.stdout
        
        # Parse hops
        hops = []
        for line in output.split('\n'):
            # Extract hop number and IP/time
            match = re.search(r'^\s*(\d+)\s+(.+)', line)
            if match:
                hop_num = match.group(1)
                hop_info = match.group(2)
                
                # Extract IP if present
                ip_match = re.search(r'\((\d+\.\d+\.\d+\.\d+)\)', hop_info)
                ip = ip_match.group(1) if ip_match else None
                
                # Extract times
                times = re.findall(r'(\d+\.?\d*)\s*ms', hop_info)
                
                hops.append({
                    "hop": int(hop_num),
                    "ip": ip,
                    "host": hop_info.split()[0] if not ip else None,
                    "times_ms": [float(t) for t in times] if times else None
                })
        
        return json.dumps({
            "target": host,
            "hops": len(hops),
            "path": hops
        }, indent=2)
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "Traceroute timed out"})
    except FileNotFoundError:
        return json.dumps({"error": "traceroute command not found"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def network_speed_test() -> str:
    """Run a basic network speed test.
    
    Note: This is a simplified speed test using download of a test file.
    For accurate results, use a dedicated speed test service.
    
    Returns:
        JSON string with speed test results
    """
    try:
        import time
        import requests
        
        # Use a test file (Cloudflare or similar)
        test_urls = [
            "https://speed.cloudflare.com/__down?bytes=1000000",  # 1MB
            "https://speed.hetzner.de/1MB.bin"
        ]
        
        results = []
        
        for url in test_urls:
            try:
                start = time.time()
                response = requests.get(url, timeout=30, stream=True)
                total_bytes = 0
                
                for chunk in response.iter_content(chunk_size=8192):
                    total_bytes += len(chunk)
                
                elapsed = time.time() - start
                speed_mbps = (total_bytes * 8 / elapsed) / 1_000_000
                
                results.append({
                    "url": url,
                    "bytes_downloaded": total_bytes,
                    "time_seconds": round(elapsed, 2),
                    "speed_mbps": round(speed_mbps, 2)
                })
            except Exception as e:
                results.append({
                    "url": url,
                    "error": str(e)
                })
        
        return json.dumps({
            "tests": results,
            "note": "These are approximate values. Network conditions vary."
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def network_test_connectivity(hosts: Optional[List[str]] = None) -> str:
    """Test connectivity to multiple common services.
    
    Quick check of internet connectivity and common services.
    
    Args:
        hosts: List of hosts to test (default: common services)
        
    Returns:
        JSON string with connectivity results
    """
    try:
        import socket
        
        if not hosts:
            hosts = [
                ("8.8.8.8", 53, "Google DNS"),
                ("1.1.1.1", 53, "Cloudflare DNS"),
                ("google.com", 443, "Google HTTPS"),
                ("cloudflare.com", 443, "Cloudflare HTTPS"),
                ("github.com", 443, "GitHub HTTPS")
            ]
        
        results = []
        
        for host, port, name in hosts:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(5)
                result = sock.connect_ex((host, port))
                sock.close()
                
                results.append({
                    "service": name,
                    "host": host,
                    "port": port,
                    "reachable": result == 0
                })
            except Exception as e:
                results.append({
                    "service": name,
                    "host": host,
                    "port": port,
                    "reachable": False,
                    "error": str(e)
                })
        
        all_reachable = all(r["reachable"] for r in results)
        
        return json.dumps({
            "internet_accessible": all_reachable,
            "services_tested": len(results),
            "services_reachable": sum(1 for r in results if r["reachable"]),
            "results": results
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    mcp.run(transport="stdio")
