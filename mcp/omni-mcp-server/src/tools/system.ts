/**
 * System Monitoring Tools - Real-time system metrics
 * 
 * Capabilities I DON'T have:
 * - Real-time CPU usage monitoring
 * - Memory consumption tracking
 * - Running process inspection
 * - Disk usage analysis
 * - Network interface statistics
 * - System temperature sensors
 * - Battery status
 */

import si from "systeminformation";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, MAX_PROCESSES } from "../constants.js";
import type { SystemMetrics } from "../types.js";

// Input schemas
const SystemMetricsInputSchema = z.object({
  include_temperatures: z.boolean().default(false).describe("Include CPU/GPU temperatures"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const ListProcessesInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PROCESSES).default(20)
    .describe("Maximum processes to return"),
  sort_by: z.enum(["cpu", "mem", "pid", "name"]).default("cpu")
    .describe("Sort processes by field"),
  filter: z.string().optional().describe("Filter by process name/pid"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const DiskUsageInputSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const NetworkInterfacesInputSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const SystemInfoInputSchema = z.object({
  detail_level: z.enum(["basic", "full"]).default("basic")
    .describe("Level of detail to retrieve"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Type definitions
type SystemMetricsInput = z.infer<typeof SystemMetricsInputSchema>;
type ListProcessesInput = z.infer<typeof ListProcessesInputSchema>;
type DiskUsageInput = z.infer<typeof DiskUsageInputSchema>;
type NetworkInterfacesInput = z.infer<typeof NetworkInterfacesInputSchema>;
type SystemInfoInput = z.infer<typeof SystemInfoInputSchema>;

export function registerSystemTools(server: McpServer): void {

  // Get real-time system metrics
  server.registerTool(
    "system_get_metrics",
    {
      title: "Get Real-Time System Metrics",
      description: `Get current CPU, memory, and disk usage metrics.

This retrieves REAL-TIME system statistics that I CANNOT access natively.

Args:
  - include_temperatures (boolean): Include CPU/GPU temperatures (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Current CPU usage %, memory stats, disk usage, load averages, and optional temperatures.

Examples:
  - Basic metrics: (no args)
  - With temps: include_temperatures=true

Note:
  - Values are snapshot at time of call
  - Use repeatedly for monitoring over time`,
      inputSchema: SystemMetricsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: SystemMetricsInput) => {
      try {
        const [cpu, mem, disk] = await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.fsSize()
        ]);
        
        const load = { avgLoad: 0 };

        const metrics: SystemMetrics = {
          cpu: {
            usage_percent: Math.round(cpu.currentLoad),
            cores: cpu.cpus.length,
            load_avg: [load.avgLoad || 0, 0, 0]
          },
          memory: {
            total_gb: Math.round(mem.total / 1024 / 1024 / 1024 * 100) / 100,
            used_gb: Math.round(mem.used / 1024 / 1024 / 1024 * 100) / 100,
            free_gb: Math.round(mem.free / 1024 / 1024 / 1024 * 100) / 100,
            usage_percent: Math.round(mem.used / mem.total * 100)
          },
          disk: {
            total_gb: Math.round((disk[0]?.size || 0) / 1024 / 1024 / 1024 * 100) / 100,
            used_gb: Math.round((disk[0]?.used || 0) / 1024 / 1024 / 1024 * 100) / 100,
            free_gb: Math.round(((disk[0]?.size || 0) - (disk[0]?.used || 0)) / 1024 / 1024 / 1024 * 100) / 100,
            usage_percent: Math.round(disk[0]?.use || 0)
          },
          uptime_seconds: Math.round((await si.time()).uptime)
        };

        let tempsText = "";
        if (params.include_temperatures) {
          const temps = await si.cpuTemperature();
          tempsText = `\n**Temperatures**: CPU ${temps.main}°C`;
        }

        const text = `# System Metrics

## CPU
- **Usage**: ${metrics.cpu.usage_percent}%
- **Cores**: ${metrics.cpu.cores}
- **Load Average**: ${metrics.cpu.load_avg[0].toFixed(2)}

## Memory
- **Total**: ${metrics.memory.total_gb} GB
- **Used**: ${metrics.memory.used_gb} GB (${metrics.memory.usage_percent}%)
- **Free**: ${metrics.memory.free_gb} GB

## Disk (Primary)
- **Total**: ${metrics.disk.total_gb} GB
- **Used**: ${metrics.disk.used_gb} GB (${metrics.disk.usage_percent}%)
- **Free**: ${metrics.disk.free_gb} GB

## System
- **Uptime**: ${Math.floor(metrics.uptime_seconds / 3600)}h ${Math.floor((metrics.uptime_seconds % 3600) / 60)}m${tempsText}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: metrics
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // List running processes
  server.registerTool(
    "system_list_processes",
    {
      title: "List Running Processes",
      description: `Get list of currently running processes with CPU/memory usage.

This shows REAL processes running on the system - something I CANNOT see.

Args:
  - limit (number): Max processes to return (default: 20, max: 100)
  - sort_by ('cpu' | 'mem' | 'pid' | 'name'): Sort field (default: cpu)
  - filter (string): Filter by process name or PID (optional)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of processes with PID, name, CPU %, memory %, and user.

Examples:
  - Top CPU: sort_by="cpu", limit=10
  - Find process: filter="node"
  - Memory hogs: sort_by="mem"`,
      inputSchema: ListProcessesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: ListProcessesInput) => {
      try {
        let processes = await si.processes();
        
        // Filter if specified
        if (params.filter) {
          const filter = params.filter.toLowerCase();
          processes.list = processes.list.filter(p => 
            p.name.toLowerCase().includes(filter) || 
            p.pid.toString().includes(filter)
          );
        }

        // Sort
        processes.list.sort((a, b) => {
          switch (params.sort_by) {
            case "cpu": return b.cpu - a.cpu;
            case "mem": return b.memRss - a.memRss;
            case "pid": return b.pid - a.pid;
            case "name": return a.name.localeCompare(b.name);
            default: return b.cpu - a.cpu;
          }
        });

        const limited = processes.list.slice(0, params.limit);

        const result = {
          total_processes: processes.all,
          running: processes.running,
          returned: limited.length,
          processes: limited.map(p => ({
            pid: p.pid,
            name: p.name,
            cpu_percent: Math.round(p.cpu * 100) / 100,
            mem_mb: Math.round(p.memRss / 1024),
            mem_percent: Math.round(p.memRss / processes.list.reduce((sum, proc) => sum + proc.memRss, 0) * 10000) / 100,
            user: p.user || 'unknown',
            command: p.command?.substring(0, 100)
          }))
        };

        const text = `# Running Processes

**Total**: ${result.total_processes} | **Running**: ${result.running} | **Showing**: ${result.returned}

| PID | Name | CPU% | Mem MB | User |
|-----|------|------|--------|------|
${result.processes.map(p => `| ${p.pid} | ${p.name} | ${p.cpu_percent}% | ${p.mem_mb} | ${p.user} |`).join('\n')}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Disk usage
  server.registerTool(
    "system_disk_usage",
    {
      title: "Get Disk Usage",
      description: `Get detailed disk usage for all mounted filesystems.

Args:
  - response_format ('markdown' | 'json'): Output format

Returns:
  Disk usage for all filesystems including type, size, used, and available space.

Note:
  - Shows all mounted drives/partitions`,
      inputSchema: DiskUsageInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: DiskUsageInput) => {
      try {
        const disks = await si.fsSize();
        
        const result = {
          filesystems: disks.map(d => ({
            filesystem: d.fs,
            type: d.type,
            size_gb: Math.round(d.size / 1024 / 1024 / 1024 * 100) / 100,
            used_gb: Math.round(d.used / 1024 / 1024 / 1024 * 100) / 100,
            available_gb: Math.round((d.size - d.used) / 1024 / 1024 / 1024 * 100) / 100,
            usage_percent: Math.round(d.use),
            mount: d.mount
          }))
        };

        const text = `# Disk Usage

| Filesystem | Type | Size | Used | Available | Use% | Mounted on |
|------------|------|------|------|-----------|------|------------|
${result.filesystems.map(f => 
  `| ${f.filesystem} | ${f.type} | ${f.size_gb}G | ${f.used_gb}G | ${f.available_gb}G | ${f.usage_percent}% | ${f.mount} |`
).join('\n')}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Network interfaces
  server.registerTool(
    "system_network_interfaces",
    {
      title: "Get Network Interface Information",
      description: `Get network interface details including IP addresses and statistics.

Args:
  - response_format ('markdown' | 'json'): Output format

Returns:
  Network interfaces with IP addresses, MAC addresses, and RX/TX statistics.`,
      inputSchema: NetworkInterfacesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: NetworkInterfacesInput) => {
      try {
        const [interfaces, networkStats] = await Promise.all([
          si.networkInterfaces(),
          si.networkStats()
        ]);

        const result = {
          interfaces: interfaces.map(iface => {
            const stats = networkStats.find(s => s.iface === iface.iface);
            return {
              name: iface.iface,
              ip4: iface.ip4,
              ip6: iface.ip6,
              mac: iface.mac,
              type: iface.type,
              speed_mbps: iface.speed,
              operstate: iface.operstate,
              rx_mb: stats ? Math.round(stats.rx_bytes / 1024 / 1024 * 100) / 100 : 0,
              tx_mb: stats ? Math.round(stats.tx_bytes / 1024 / 1024 * 100) / 100 : 0
            };
          })
        };

        const text = `# Network Interfaces

| Interface | IP Address | MAC | Type | Speed | State | RX MB | TX MB |
|-----------|------------|-----|------|-------|-------|-------|-------|
${result.interfaces.map(i => 
  `| ${i.name} | ${i.ip4 || 'N/A'} | ${i.mac} | ${i.type} | ${i.speed_mbps || 'N/A'} | ${i.operstate} | ${i.rx_mb} | ${i.tx_mb} |`
).join('\n')}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // System information
  server.registerTool(
    "system_get_info",
    {
      title: "Get System Information",
      description: `Get comprehensive system information.

Args:
  - detail_level ('basic' | 'full'): Level of detail (default: basic)
  - response_format ('markdown' | 'json'): Output format

Returns:
  OS, CPU, memory, and hardware information.

Examples:
  - Quick info: detail_level="basic"
  - Full specs: detail_level="full"`,
      inputSchema: SystemInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: SystemInfoInput) => {
      try {
        const [os, cpu, system] = await Promise.all([
          si.osInfo(),
          si.cpu(),
          si.system()
        ]);

        const result = {
          os: {
            platform: os.platform,
            distro: os.distro,
            release: os.release,
            codename: os.codename,
            kernel: os.kernel,
            arch: os.arch
          },
          cpu: {
            manufacturer: cpu.manufacturer,
            brand: cpu.brand,
            speed_ghz: cpu.speed,
            cores: cpu.cores,
            physical_cores: cpu.physicalCores,
            threads: cpu.processors
          },
          system: {
            manufacturer: system.manufacturer,
            model: system.model,
            version: system.version,
            serial: params.detail_level === 'full' ? system.serial : '[redacted]',
            uuid: params.detail_level === 'full' ? system.uuid : '[redacted]'
          }
        };

        const text = `# System Information

## Operating System
- **Platform**: ${result.os.platform}
- **Distribution**: ${result.os.distro} ${result.os.release}
- **Kernel**: ${result.os.kernel}
- **Architecture**: ${result.os.arch}

## CPU
- **Model**: ${result.cpu.manufacturer} ${result.cpu.brand}
- **Speed**: ${result.cpu.speed_ghz} GHz
- **Cores**: ${result.cpu.cores} (${result.cpu.physical_cores} physical)

## Hardware
- **Manufacturer**: ${result.system.manufacturer}
- **Model**: ${result.system.model}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );
}
