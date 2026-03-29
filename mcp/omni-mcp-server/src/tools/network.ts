/**
 * Network Tools - Scanning and diagnostics
 * 
 * Capabilities I DON'T have:
 * - Port scanning
 * - Ping hosts
 * - DNS lookups
 * - Traceroute
 * - Network interface configuration
 */

import * as net from "net";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat } from "../constants.js";
import type { PortScanResult } from "../types.js";

const execAsync = promisify(exec);

// Input schemas
const PingInputSchema = z.object({
  host: z.string().min(1).describe("Host to ping (IP or hostname)"),
  count: z.number().int().min(1).max(10).default(4).describe("Number of pings"),
  timeout: z.number().int().default(5000).describe("Timeout per ping in ms"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const PortScanInputSchema = z.object({
  host: z.string().min(1).describe("Host to scan"),
  ports: z.array(z.number().int().min(1).max(65535))
    .default([22, 80, 443, 3306, 5432, 8080, 8443])
    .describe("Ports to scan (default: common ports)"),
  timeout: z.number().int().default(2000).describe("Timeout per port in ms"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const DNSLookupInputSchema = z.object({
  hostname: z.string().min(1).describe("Hostname to lookup"),
  type: z.enum(["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"]).default("A")
    .describe("DNS record type"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const ReverseDNSInputSchema = z.object({
  ip: z.string().ip().describe("IP address to reverse lookup"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Type definitions
type PingInput = z.infer<typeof PingInputSchema>;
type PortScanInput = z.infer<typeof PortScanInputSchema>;
type DNSLookupInput = z.infer<typeof DNSLookupInputSchema>;
type ReverseDNSInput = z.infer<typeof ReverseDNSInputSchema>;

export function registerNetworkTools(server: McpServer): void {

  // Ping host
  server.registerTool(
    "network_ping",
    {
      title: "Ping Host",
      description: `Check if a host is reachable via ICMP ping.

Args:
  - host (string): IP address or hostname to ping (required)
  - count (number): Number of pings (default: 4, max: 10)
  - timeout (number): Timeout per ping in ms (default: 5000)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Ping statistics including latency and packet loss.

Examples:
  - Basic: host="google.com"
  - Quick: host="8.8.8.8", count=2
  - Thorough: host="server.local", count=10

Notes:
  - Requires ping command available
  - Some hosts block ICMP
  - Shows min/avg/max latency`,
      inputSchema: PingInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: PingInput) => {
      try {
        // Use system ping command
        const platform = process.platform;
        const countFlag = platform === 'win32' ? '-n' : '-c';
        const timeoutFlag = platform === 'win32' ? '-w' : '-W';
        const timeoutVal = platform === 'win32' ? params.timeout : Math.ceil(params.timeout / 1000);
        
        const command = `ping ${countFlag} ${params.count} ${timeoutFlag} ${timeoutVal} ${params.host}`;
        
        const { stdout, stderr } = await execAsync(command, { timeout: params.timeout * params.count + 5000 });
        
        const output = stdout || stderr;
        
        // Parse ping output
        const lines = output.split('\n');
        const result = {
          host: params.host,
          reachable: output.includes('time=') || output.includes('time<') || output.includes('time>'),
          packet_loss: 0,
          min_latency: null as number | null,
          avg_latency: null as number | null,
          max_latency: null as number | null,
          raw_output: output
        };

        // Extract packet loss
        const lossMatch = output.match(/(\d+)% packet loss/) || output.match(/(\d+)% loss/);
        if (lossMatch) result.packet_loss = parseInt(lossMatch[1]);

        // Extract latency stats
        const statsMatch = output.match(/min\/avg\/max.*=\s*[\d.]+\/([\d.]+)\/([\d.]+)/) ||
                           output.match(/Minimum\s*=\s*([\d.]+).*Average\s*=\s*([\d.]+).*Maximum\s*=\s*([\d.]+)/);
        if (statsMatch) {
          result.min_latency = parseFloat(statsMatch[1]);
          result.avg_latency = parseFloat(statsMatch[2]);
          result.max_latency = parseFloat(statsMatch[3] || statsMatch[2]);
        }

        const text = `# Ping Results: ${params.host}

**Reachable**: ${result.reachable ? '✓ Yes' : '✗ No'}
**Packet Loss**: ${result.packet_loss}%
${result.avg_latency !== null ? `**Latency**: min=${result.min_latency}ms avg=${result.avg_latency}ms max=${result.max_latency}ms` : ''}

\`\`\`
${output.substring(0, 500)}
\`\`\``;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Ping failed: ${errorMsg}\n\nHost "${params.host}" may be unreachable or blocking ICMP.` }],
          structuredContent: { host: params.host, reachable: false, error: errorMsg }
        };
      }
    }
  );

  // Port scan
  server.registerTool(
    "network_port_scan",
    {
      title: "Scan Ports on Host",
      description: `Scan TCP ports on a host to check if they're open.

This performs actual network connections - something I CANNOT do.

Args:
  - host (string): Host to scan (IP or hostname) (required)
  - ports (array): Array of port numbers to scan (default: common ports)
  - timeout (number): Timeout per port in ms (default: 2000)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of ports and their status (open/closed/filtered).

Examples:
  - Common ports: host="example.com"
  - Specific ports: host="192.168.1.1", ports=[22, 80, 443]
  - Full range: host="server.local", ports=[1, 22, 80, 443, 3306, 8080, 8443]

Common Ports:
  - 22: SSH
  - 80: HTTP
  - 443: HTTPS
  - 3306: MySQL
  - 5432: PostgreSQL
  - 8080: HTTP Alternate
  - 8443: HTTPS Alternate

Warning:
  - Only scan hosts you have permission to scan
  - May be detected as intrusion attempt`,
      inputSchema: PortScanInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: PortScanInput) => {
      const results: PortScanResult[] = [];

      for (const port of params.ports) {
        const isOpen = await new Promise<boolean>((resolve) => {
          const socket = new net.Socket();
          
          socket.setTimeout(params.timeout);
          
          socket.on('connect', () => {
            socket.destroy();
            resolve(true);
          });
          
          socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
          });
          
          socket.on('error', () => {
            resolve(false);
          });
          
          socket.connect(port, params.host);
        });

        results.push({
          host: params.host,
          port,
          state: isOpen ? 'open' : 'closed'
        });
      }

      const openPorts = results.filter(r => r.state === 'open');

      const result = {
        host: params.host,
        scanned: results.length,
        open: openPorts.length,
        closed: results.length - openPorts.length,
        results
      };

      const text = `# Port Scan Results: ${params.host}

**Scanned**: ${result.scanned} ports
**Open**: ${result.open}
**Closed**: ${result.closed}

## Open Ports

${openPorts.length > 0 ? openPorts.map(p => `- **Port ${p.port}**: ${getServiceName(p.port)}`).join('\n') : '*(No open ports found)*'}

## All Results

| Port | State | Service |
|------|-------|---------|
${results.map(r => `| ${r.port} | ${r.state} | ${getServiceName(r.port)} |`).join('\n')}`;

      return {
        content: [{ type: "text", text }],
        structuredContent: result as { [key: string]: unknown }
      };
    }
  );

  // DNS lookup
  server.registerTool(
    "network_dns_lookup",
    {
      title: "DNS Lookup",
      description: `Resolve DNS records for a hostname.

Args:
  - hostname (string): Hostname to lookup (required)
  - type ('A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' | 'SOA'): Record type (default: A)
  - response_format ('markdown' | 'json'): Output format

Returns:
  DNS records of the specified type.

Examples:
  - A record: hostname="google.com"
  - MX records: hostname="gmail.com", type="MX"
  - NS records: hostname="example.com", type="NS"

Record Types:
  - A: IPv4 address
  - AAAA: IPv6 address
  - MX: Mail servers
  - TXT: Text records
  - NS: Name servers
  - CNAME: Canonical name (alias)
  - SOA: Start of authority`,
      inputSchema: DNSLookupInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: DNSLookupInput) => {
      try {
        const dns = await import('dns');
        const resolver = new dns.promises.Resolver();

        let records: unknown;

        switch (params.type) {
          case 'A':
            records = await resolver.resolve4(params.hostname);
            break;
          case 'AAAA':
            records = await resolver.resolve6(params.hostname);
            break;
          case 'MX':
            records = await resolver.resolveMx(params.hostname);
            break;
          case 'TXT':
            records = await resolver.resolveTxt(params.hostname);
            break;
          case 'NS':
            records = await resolver.resolveNs(params.hostname);
            break;
          case 'CNAME':
            records = await resolver.resolveCname(params.hostname);
            break;
          case 'SOA':
            records = await resolver.resolveSoa(params.hostname);
            break;
        }

        const result = {
          hostname: params.hostname,
          type: params.type,
          records
        };

        const text = `# DNS Lookup: ${params.hostname}

**Record Type**: ${params.type}
**Records Found**: ${Array.isArray(records) ? records.length : 1}

\`\`\`json
${JSON.stringify(records, null, 2)}
\`\`\``;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `DNS lookup failed: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Reverse DNS
  server.registerTool(
    "network_reverse_dns",
    {
      title: "Reverse DNS Lookup",
      description: `Find the hostname associated with an IP address.

Args:
  - ip (string): IP address to lookup (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Hostname(s) associated with the IP address.

Example:
  - ip="8.8.8.8"

Note:
  - Not all IPs have PTR records
  - May return multiple hostnames`,
      inputSchema: ReverseDNSInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ReverseDNSInput) => {
      try {
        const dns = await import('dns');
        const hostnames = await dns.promises.reverse(params.ip);

        const result = {
          ip: params.ip,
          hostnames
        };

        const text = `# Reverse DNS: ${params.ip}

**Hostnames**:
${hostnames.map(h => `- ${h}`).join('\n') || '*(No PTR records found)*'}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result as { [key: string]: unknown }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Reverse DNS lookup failed: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );
}

function getServiceName(port: number): string {
  const services: Record<number, string> = {
    21: 'FTP',
    22: 'SSH',
    23: 'Telnet',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    445: 'SMB',
    3306: 'MySQL',
    3389: 'RDP',
    5432: 'PostgreSQL',
    5900: 'VNC',
    6379: 'Redis',
    8080: 'HTTP-Alt',
    8443: 'HTTPS-Alt',
    27017: 'MongoDB'
  };
  return services[port] || 'Unknown';
}
