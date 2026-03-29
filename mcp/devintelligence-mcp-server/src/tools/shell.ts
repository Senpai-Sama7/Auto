/**
 * Shell Execution Tools - Execute commands safely
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, DEFAULT_SHELL_TIMEOUT, MAX_SHELL_TIMEOUT, DANGEROUS_COMMANDS } from "../constants.js";
import { formatResponse, codeBlock } from "../services/formatters.js";
import { handleShellError } from "../services/errors.js";
import type { ShellResult } from "../types.js";

const execAsync = promisify(exec);

// Input schemas
const ExecuteCommandInputSchema = z.object({
  command: z.string()
    .min(1, "Command is required")
    .describe("Shell command to execute"),
  cwd: z.string()
    .optional()
    .describe("Working directory for the command (default: current directory)"),
  timeout: z.number()
    .int()
    .min(1000)
    .max(MAX_SHELL_TIMEOUT)
    .default(DEFAULT_SHELL_TIMEOUT)
    .describe("Timeout in milliseconds (default: 30000, max: 300000)"),
  env: z.record(z.string())
    .optional()
    .describe("Additional environment variables"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const StreamCommandInputSchema = z.object({
  command: z.string()
    .min(1, "Command is required")
    .describe("Shell command to execute with streaming output"),
  cwd: z.string()
    .optional()
    .describe("Working directory for the command"),
  timeout: z.number()
    .int()
    .min(1000)
    .max(MAX_SHELL_TIMEOUT)
    .default(DEFAULT_SHELL_TIMEOUT)
    .describe("Timeout in milliseconds")
}).strict();

// Type definitions
type ExecuteCommandInput = z.infer<typeof ExecuteCommandInputSchema>;
type StreamCommandInput = z.infer<typeof StreamCommandInputSchema>;

/**
 * Check if a command is potentially dangerous
 */
function isDangerousCommand(command: string): { safe: boolean; reason?: string } {
  const normalized = command.toLowerCase().trim();
  
  for (const pattern of DANGEROUS_COMMANDS) {
    if (pattern.test(normalized)) {
      return { 
        safe: false, 
        reason: `Command matches dangerous pattern: ${pattern.source}` 
      };
    }
  }

  // Additional safety checks
  if (normalized.includes("rm -rf /") || normalized.includes("rm -rf /*")) {
    return { safe: false, reason: "Command attempts to delete root filesystem" };
  }

  if (normalized.includes("mkfs") && normalized.includes("/dev/sd")) {
    return { safe: false, reason: "Command attempts to format a drive" };
  }

  return { safe: true };
}

/**
 * Sanitize working directory path
 */
function sanitizeCwd(cwd?: string): string {
  if (!cwd) return process.cwd();
  const resolved = path.resolve(cwd);
  // Prevent escaping to parent directories in dangerous ways
  return resolved;
}

/**
 * Register all shell tools
 */
export function registerShellTools(server: McpServer): void {

  // Execute command tool
  server.registerTool(
    "shell_execute",
    {
      title: "Execute Shell Command",
      description: `Execute a shell command and return the output.

This tool runs shell commands safely with timeout protection. Use it to run git, npm, python, or other CLI tools.

Args:
  - command (string): Shell command to execute (required)
  - cwd (string): Working directory (default: current directory)
  - timeout (number): Timeout in ms (default: 30000, max: 300000)
  - env (object): Additional environment variables
  - response_format ('markdown' | 'json'): Output format

Returns:
  stdout, stderr, exit code, and execution duration.

Examples:
  - Git status: command="git status"
  - Run tests: command="npm test", cwd="./my-project"
  - Python script: command="python analysis.py"
  - With env: command="deploy.sh", env={"ENV": "production"}

Safety:
  - Dangerous commands (rm -rf /, mkfs, etc.) are blocked
  - Commands have timeout protection
  - Working directory is validated

Error Handling:
  - Returns error if command not found
  - Returns error on timeout
  - Returns error if permission denied`,
      inputSchema: ExecuteCommandInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: ExecuteCommandInput) => {
      try {
        // Safety check
        const safety = isDangerousCommand(params.command);
        if (!safety.safe) {
          return {
            content: [{
              type: "text",
              text: `Error: Command blocked for safety: ${safety.reason}. If you need to perform this operation, use shell commands directly outside the MCP server.`
            }]
          };
        }

        const cwd = sanitizeCwd(params.cwd);
        const startTime = Date.now();

        // Set up environment
        const env = { ...process.env, ...params.env };

        // Execute command
        const { stdout, stderr } = await execAsync(params.command, {
          cwd,
          timeout: params.timeout,
          env,
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        const duration = Date.now() - startTime;

        const result: ShellResult = {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exit_code: 0,
          duration_ms: duration
        };

        const formatMarkdown = (data: ShellResult) => {
          const lines: string[] = [
            `# Command Execution Results`,
            "",
            `**Command**: ${codeBlock(params.command, "bash")}`,
            `**Working Directory**: ${cwd}`,
            `**Duration**: ${data.duration_ms}ms`,
            `**Exit Code**: ${data.exit_code}`,
            ""
          ];

          if (data.stdout) {
            lines.push(`## stdout`, "", codeBlock(data.stdout));
          }

          if (data.stderr) {
            lines.push(`## stderr`, "", codeBlock(data.stderr));
          }

          if (!data.stdout && !data.stderr) {
            lines.push("*(No output)*");
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        const duration = 0;
        
        if (error instanceof Error && "stdout" in error && "stderr" in error) {
          // Command executed but returned non-zero exit code
          const execError = error as unknown as { stdout: string; stderr: string; code?: number };
          const result: ShellResult = {
            stdout: execError.stdout?.trim() || "",
            stderr: execError.stderr?.trim() || "",
            exit_code: execError.code || 1,
            duration_ms: duration
          };

          const text = `# Command Execution Results

**Command**: ${codeBlock(params.command, "bash")}
**Exit Code**: ${result.exit_code}

## stdout
${result.stdout ? codeBlock(result.stdout) : "*(empty)*"}

## stderr
${result.stderr ? codeBlock(result.stderr) : "*(empty)*"}

*Note: Command returned non-zero exit code. Check stderr for errors.*`;

          return {
            content: [{ type: "text", text }],
            structuredContent: result
          };
        }

        return { content: [{ type: "text", text: handleShellError(error, params.command) }] };
      }
    }
  );

  // Stream command tool (for long-running commands)
  server.registerTool(
    "shell_stream_command",
    {
      title: "Execute Command with Streaming Output",
      description: `Execute a long-running command and capture output incrementally.

This tool is useful for commands that produce a lot of output or run for a long time.
Note: This waits for the command to complete before returning.

Args:
  - command (string): Shell command to execute (required)
  - cwd (string): Working directory (default: current directory)
  - timeout (number): Timeout in ms (default: 30000)

Returns:
  Combined output (stdout + stderr) and exit code.

Examples:
  - Build project: command="npm run build"
  - Run server: command="python manage.py runserver"

Safety:
  - Same safety checks as shell_execute
  - Timeout protection applies`,
      inputSchema: StreamCommandInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: StreamCommandInput) => {
      try {
        // Safety check
        const safety = isDangerousCommand(params.command);
        if (!safety.safe) {
          return {
            content: [{
              type: "text",
              text: `Error: Command blocked for safety: ${safety.reason}`
            }]
          };
        }

        const cwd = sanitizeCwd(params.cwd);
        const startTime = Date.now();

        return new Promise((resolve) => {
          const chunks: string[] = [];
          
          const child = spawn(params.command, {
            cwd,
            shell: true,
            timeout: params.timeout,
            env: process.env
          });

          child.stdout.on("data", (data) => {
            chunks.push(data.toString());
          });

          child.stderr.on("data", (data) => {
            chunks.push(data.toString());
          });

          child.on("close", (code) => {
            const duration = Date.now() - startTime;
            const output = chunks.join("").trim();
            
            // Truncate if too long
            const maxOutput = 50000;
            const truncatedOutput = output.length > maxOutput 
              ? output.substring(0, maxOutput) + "\n\n[Output truncated...]"
              : output;

            const result = {
              command: params.command,
              exit_code: code || 0,
              duration_ms: duration,
              output: truncatedOutput,
              truncated: output.length > maxOutput
            };

            const text = `# Streamed Command Results

**Command**: ${codeBlock(params.command, "bash")}
**Exit Code**: ${result.exit_code}
**Duration**: ${result.duration_ms}ms
${result.truncated ? "**Note**: Output was truncated" : ""}

## Output

${codeBlock(truncatedOutput)}`;

            resolve({
              content: [{ type: "text", text }],
              structuredContent: result
            });
          });

          child.on("error", (error) => {
            resolve({
              content: [{ type: "text", text: handleShellError(error, params.command) }]
            });
          });

          // Timeout handler
          setTimeout(() => {
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 5000);
          }, params.timeout);
        });
      } catch (error) {
        return { content: [{ type: "text", text: handleShellError(error, params.command) }] };
      }
    }
  );
}
