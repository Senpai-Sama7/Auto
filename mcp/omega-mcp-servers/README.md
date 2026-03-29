# Omega Domain-Specific MCP Servers

This repository contains focused MCP servers extracted from the Omega mega-server.
Each server has a cohesive, single-purpose domain.

## Servers Overview

| Server | Tools | Purpose | From Omega Tools |
|--------|-------|---------|------------------|
| omega-system | 5 | System monitoring | system_get_metrics, system_list_processes, system_disk_usage, system_get_info, system_kill_process |
| omega-docker | 7 | Container management | docker_list_containers, docker_list_images, docker_run_container, docker_container_action, docker_container_logs, docker_inspect_container, docker_system_prune |
| omega-security | 8 | Cybersecurity | cyber_subdomain_enum, cyber_dns_analyze, cyber_headers_analyze, cyber_cve_search, cyber_cve_lookup, cyber_threat_ip_lookup, cyber_mitre_search, cyber_whois |
| omega-network | 8 | Network diagnostics | network_ping, network_port_scan, network_dns_lookup, network_reverse_dns, network_interfaces, network_traceroute, network_speed_test, network_test_connectivity |

## Installation

Each server can be installed independently:

```bash
cd omega-system
pip install -e .
```

## Usage

Run individually:
```bash
python -m omega-system.src.server
```

Or add to MCP config:
```json
{
  "mcpServers": {
    "omega-system": {
      "command": "python",
      "args": ["/path/to/omega-system/src/server.py"]
    }
  }
}
```

## Comparison: Mega vs Focused

| Aspect | Omega (Mega) | Domain-Specific |
|--------|-------------|-----------------|
| Tools | 40+ | 5-8 each |
| Context Usage | ~20K tokens | ~2-4K tokens each |
| Discoverability | Moderate | High |
| Startup Time | ~1.5s | ~0.5s each |
| Use Case | Daily driver | Specific tasks |
| Maintenance | Single point | Distributed |

## Recommendation

**Keep both:**
- Use Omega for daily work (convenient, everything in one place)
- Use domain-specific servers when:
  - Context window is tight
  - You want faster startup
  - Doing focused work in one domain
  - Testing/debugging specific functionality

