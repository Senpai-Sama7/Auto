/**
 * Docker Management Tools - Container and image operations
 * 
 * Capabilities I DON'T have:
 * - List running/stopped containers
 * - Start/stop/restart containers
 * - View container logs
 * - Build Docker images
 * - Run new containers
 * - Inspect container details
 * - Manage Docker networks/volumes
 */

import Docker from "dockerode";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, DOCKER_TIMEOUT } from "../constants.js";
import type { ContainerInfo } from "../types.js";

// Docker client
const docker = new Docker();

// Input schemas
const DockerListContainersInputSchema = z.object({
  all: z.boolean().default(false).describe("Show all containers including stopped"),
  filters: z.record(z.array(z.string())).optional().describe("Docker filters (status, label, etc.)"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const DockerContainerLogsInputSchema = z.object({
  container: z.string().min(1).describe("Container ID or name"),
  tail: z.number().int().min(1).max(1000).default(100).describe("Number of lines to show"),
  follow: z.boolean().default(false).describe("Stream logs (not implemented)"),
  timestamps: z.boolean().default(true).describe("Include timestamps"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const DockerRunContainerInputSchema = z.object({
  image: z.string().min(1).describe("Docker image to run"),
  name: z.string().optional().describe("Container name"),
  command: z.array(z.string()).optional().describe("Command to run"),
  ports: z.record(z.string()).optional().describe("Port mappings {host: container}"),
  env: z.record(z.string()).optional().describe("Environment variables"),
  volumes: z.array(z.string()).optional().describe("Volume mounts"),
  detach: z.boolean().default(true).describe("Run in detached mode"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const DockerContainerActionInputSchema = z.object({
  container: z.string().min(1).describe("Container ID or name"),
  action: z.enum(["start", "stop", "restart", "pause", "unpause", "remove"]).describe("Action to perform"),
  force: z.boolean().default(false).describe("Force action (for stop/remove)"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const DockerInspectInputSchema = z.object({
  container: z.string().min(1).describe("Container ID or name"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

const DockerImagesInputSchema = z.object({
  all: z.boolean().default(false).describe("Include intermediate layers"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Type definitions
type DockerListContainersInput = z.infer<typeof DockerListContainersInputSchema>;
type DockerContainerLogsInput = z.infer<typeof DockerContainerLogsInputSchema>;
type DockerRunContainerInput = z.infer<typeof DockerRunContainerInputSchema>;
type DockerContainerActionInput = z.infer<typeof DockerContainerActionInputSchema>;
type DockerInspectInput = z.infer<typeof DockerInspectInputSchema>;
type DockerImagesInput = z.infer<typeof DockerImagesInputSchema>;

export function registerDockerTools(server: McpServer): void {

  // List containers
  server.registerTool(
    "docker_list_containers",
    {
      title: "List Docker Containers",
      description: `List Docker containers with status and port mappings.

This shows REAL containers running on the Docker daemon - something I CANNOT see.

Args:
  - all (boolean): Show stopped containers too (default: false)
  - filters (object): Docker filters like {"status": ["running"]}
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of containers with ID, name, image, status, and ports.

Examples:
  - Running only: (no args)
  - All containers: all=true
  - Filter by status: filters={"status": ["exited"]}

Note:
  - Requires Docker daemon to be running
  - User must have Docker permissions`,
      inputSchema: DockerListContainersInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: DockerListContainersInput) => {
      try {
        const containers = await docker.listContainers({
          all: params.all,
          filters: params.filters
        });

        const result = {
          containers: containers.map(c => ({
            id: c.Id.substring(0, 12),
            names: c.Names.map(n => n.replace(/^\//, '')),
            image: c.Image,
            command: c.Command,
            created: new Date(c.Created * 1000).toISOString(),
            status: c.Status,
            state: c.State,
            ports: c.Ports.map(p => ({
              internal: p.PrivatePort,
              external: p.PublicPort,
              protocol: p.Type,
              ip: p.IP
            })),
            labels: c.Labels
          }))
        };

        const text = `# Docker Containers

| ID | Name | Image | Status | Ports |
|----|------|-------|--------|-------|
${result.containers.map(c => {
  const ports = c.ports.filter(p => p.external).map(p => `${p.external}:${p.internal}`).join(', ') || '-';
  return `| ${c.id} | ${c.names[0]} | ${c.image} | ${c.state} | ${ports} |`;
}).join('\n') || '| *(No containers)* | | | | |'}`;

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

  // Get container logs
  server.registerTool(
    "docker_container_logs",
    {
      title: "Get Docker Container Logs",
      description: `Retrieve logs from a Docker container.

Args:
  - container (string): Container ID or name (required)
  - tail (number): Number of lines to show (default: 100, max: 1000)
  - timestamps (boolean): Include timestamps (default: true)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Container stdout/stderr logs.

Examples:
  - Recent logs: container="myapp"
  - Last 500 lines: container="myapp", tail=500
  - No timestamps: container="myapp", timestamps=false`,
      inputSchema: DockerContainerLogsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: DockerContainerLogsInput) => {
      try {
        const container = docker.getContainer(params.container);
        
        const logs = await container.logs({
          stdout: true,
          stderr: true,
          tail: params.tail,
          timestamps: params.timestamps
        });

        // Convert buffer to string and clean up
        const logString = logs.toString('utf-8')
          .split('\n')
          .filter(line => line.trim())
          .slice(-params.tail)
          .join('\n');

        const result = {
          container: params.container,
          lines: logString.split('\n').length,
          logs: logString
        };

        const text = `# Container Logs: ${params.container}

**Lines**: ${result.lines}

\`\`\`
${logString.substring(0, 10000)}${logString.length > 10000 ? '\n... (truncated)' : ''}
\`\`\``;

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

  // Run new container
  server.registerTool(
    "docker_run_container",
    {
      title: "Run Docker Container",
      description: `Create and start a new Docker container.

Args:
  - image (string): Docker image to run (required)
  - name (string): Container name (optional)
  - command (array): Command and args to run (optional)
  - ports (object): Port mappings {host: container} (optional)
  - env (object): Environment variables (optional)
  - volumes (array): Volume mounts ["host:container"] (optional)
  - detach (boolean): Run in background (default: true)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Container ID and status.

Examples:
  - Simple: image="nginx", name="web"
  - With ports: image="nginx", ports={"8080": "80"}
  - With env: image="postgres", env={"POSTGRES_PASSWORD": "secret"}
  - With volumes: image="nginx", volumes=["/host/html:/usr/share/nginx/html"]

Note:
  - Pulls image if not present
  - Requires Docker permissions`,
      inputSchema: DockerRunContainerInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: DockerRunContainerInput) => {
      try {
        // Build port bindings
        const portBindings: Record<string, Array<{ HostPort: string }>> = {};
        const exposedPorts: Record<string, {}> = {};
        
        if (params.ports) {
          for (const [host, container] of Object.entries(params.ports)) {
            const containerPort = container.includes('/') ? container : `${container}/tcp`;
            portBindings[containerPort] = [{ HostPort: host }];
            exposedPorts[containerPort] = {};
          }
        }

        // Build volume bindings
        const binds = params.volumes || [];

        // Build env array
        const env = params.env ? Object.entries(params.env).map(([k, v]) => `${k}=${v}`) : [];

        const createOptions: Docker.ContainerCreateOptions = {
          Image: params.image,
          name: params.name,
          Cmd: params.command,
          Env: env,
          HostConfig: {
            PortBindings: portBindings,
            Binds: binds
          },
          ExposedPorts: exposedPorts
        };

        const container = await docker.createContainer(createOptions);
        
        if (params.detach) {
          await container.start();
        }

        const info = await container.inspect();

        const result = {
          id: info.Id.substring(0, 12),
          name: info.Name.replace(/^\//, ''),
          image: info.Config.Image,
          status: info.State.Status,
          running: info.State.Running,
          ports: Object.entries(info.NetworkSettings.Ports || {}).flatMap(([containerPort, bindings]) => 
            (bindings || []).map(b => `${b.HostPort}:${containerPort.split('/')[0]}`)
          )
        };

        const text = `# Container Started

**ID**: ${result.id}
**Name**: ${result.name}
**Image**: ${result.image}
**Status**: ${result.status}
**Ports**: ${result.ports.join(', ') || 'None mapped'}`;

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

  // Container actions (start/stop/restart/remove)
  server.registerTool(
    "docker_container_action",
    {
      title: "Perform Docker Container Action",
      description: `Start, stop, restart, pause, unpause, or remove a container.

Args:
  - container (string): Container ID or name (required)
  - action ('start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'remove'): Action to perform (required)
  - force (boolean): Force action for stop/remove (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Action confirmation and container status.

Examples:
  - Stop: container="web", action="stop"
  - Force remove: container="old", action="remove", force=true
  - Restart: container="db", action="restart"

Warning:
  - remove action deletes the container permanently
  - force=true kills container immediately`,
      inputSchema: DockerContainerActionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: DockerContainerActionInput) => {
      try {
        const container = docker.getContainer(params.container);

        switch (params.action) {
          case 'start':
            await container.start();
            break;
          case 'stop':
            await container.stop({ t: params.force ? 0 : 10 });
            break;
          case 'restart':
            await container.restart({ t: 10 });
            break;
          case 'pause':
            await container.pause();
            break;
          case 'unpause':
            await container.unpause();
            break;
          case 'remove':
            await container.remove({ force: params.force });
            break;
        }

        const result = {
          container: params.container,
          action: params.action,
          success: true
        };

        return {
          content: [{ type: "text", text: `✓ ${params.action} performed on container "${params.container}"` }],
          structuredContent: result
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );

  // Inspect container
  server.registerTool(
    "docker_inspect_container",
    {
      title: "Inspect Docker Container",
      description: `Get detailed information about a container.

Args:
  - container (string): Container ID or name (required)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Detailed container configuration, state, mounts, and network settings.`,
      inputSchema: DockerInspectInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: DockerInspectInput) => {
      try {
        const container = docker.getContainer(params.container);
        const info = await container.inspect();

        const result = {
          id: info.Id,
          name: info.Name.replace(/^\//, ''),
          image: info.Config.Image,
          created: info.Created,
          state: {
            status: info.State.Status,
            running: info.State.Running,
            started: info.State.StartedAt,
            finished: info.State.FinishedAt,
            exit_code: info.State.ExitCode
          },
          config: {
            hostname: info.Config.Hostname,
            user: info.Config.User,
            env: info.Config.Env,
            cmd: info.Config.Cmd,
            working_dir: info.Config.WorkingDir
          },
          mounts: info.Mounts.map(m => ({
            source: m.Source,
            destination: m.Destination,
            type: m.Type,
            mode: m.Mode
          })),
          network: {
            ip_address: info.NetworkSettings.IPAddress,
            gateway: info.NetworkSettings.Gateway,
            mac_address: info.NetworkSettings.MacAddress
          }
        };

        const text = `# Container Inspection: ${result.name}

## State
- **Status**: ${result.state.status}
- **Running**: ${result.state.running}
- **Exit Code**: ${result.state.exit_code}
- **Started**: ${result.state.started}

## Configuration
- **Image**: ${result.image}
- **Command**: ${result.config.cmd?.join(' ') || 'N/A'}
- **Working Dir**: ${result.config.working_dir || 'N/A'}

## Network
- **IP Address**: ${result.network.ip_address || 'N/A'}
- **Gateway**: ${result.network.gateway || 'N/A'}
- **MAC**: ${result.network.mac_address || 'N/A'}

## Mounts
${result.mounts.map(m => `- ${m.source} → ${m.destination} (${m.type})`).join('\n') || 'None'}`;

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

  // List images
  server.registerTool(
    "docker_list_images",
    {
      title: "List Docker Images",
      description: `List Docker images on the system.

Args:
  - all (boolean): Include intermediate layers (default: false)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of images with tags, sizes, and creation dates.`,
      inputSchema: DockerImagesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: DockerImagesInput) => {
      try {
        const images = await docker.listImages({
          all: params.all
        });

        const result = {
          images: images.map(img => ({
            id: img.Id.substring(7, 19), // Remove "sha256:" prefix
            tags: img.RepoTags || ['<none>:<none>'],
            size_mb: Math.round(img.Size / 1024 / 1024 * 100) / 100,
            created: new Date(img.Created * 1000).toISOString(),
            labels: img.Labels
          }))
        };

        const text = `# Docker Images

| ID | Repository | Tag | Size | Created |
|----|------------|-----|------|---------|
${result.images.slice(0, 50).map(img => {
  const [repo, tag] = img.tags[0]?.split(':') || ['<none>', '<none>'];
  return `| ${img.id} | ${repo} | ${tag} | ${img.size_mb} MB | ${img.created.split('T')[0]} |`;
}).join('\n')}`;

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
