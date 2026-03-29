/**
 * File System Tools - Read, write, list, and analyze files
 */

import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { glob } from "glob";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";
import { formatResponse, formatBytes, formatTimestamp, codeBlock, escapeMarkdown } from "../services/formatters.js";
import { handleFsError } from "../services/errors.js";
import type { FileInfo } from "../types.js";

// Input schemas
const ReadFileInputSchema = z.object({
  path: z.string()
    .min(1, "Path is required")
    .describe("Absolute or relative path to the file to read"),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Line offset to start reading from (0-indexed)"),
  limit: z.number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("Maximum number of lines to read"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const WriteFileInputSchema = z.object({
  path: z.string()
    .min(1, "Path is required")
    .describe("Absolute or relative path to write the file"),
  content: z.string()
    .describe("Content to write to the file"),
  append: z.boolean()
    .default(false)
    .describe("If true, append to existing file instead of overwriting"),
  create_directories: z.boolean()
    .default(true)
    .describe("If true, create parent directories if they don't exist")
}).strict();

const ListDirectoryInputSchema = z.object({
  path: z.string()
    .min(1, "Path is required")
    .describe("Absolute or relative path to the directory"),
  recursive: z.boolean()
    .default(false)
    .describe("If true, list contents recursively"),
  include_hidden: z.boolean()
    .default(false)
    .describe("If true, include hidden files (starting with .)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const SearchFilesInputSchema = z.object({
  pattern: z.string()
    .min(1, "Pattern is required")
    .describe("Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.json')"),
  path: z.string()
    .default(".")
    .describe("Base directory to search in"),
  limit: z.number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("Maximum number of results to return"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const GetFileInfoInputSchema = z.object({
  path: z.string()
    .min(1, "Path is required")
    .describe("Absolute or relative path to the file or directory"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Type definitions
type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
type ListDirectoryInput = z.infer<typeof ListDirectoryInputSchema>;
type SearchFilesInput = z.infer<typeof SearchFilesInputSchema>;
type GetFileInfoInput = z.infer<typeof GetFileInfoInputSchema>;

/**
 * Register all file system tools
 */
export function registerFilesystemTools(server: McpServer): void {
  
  // Read file tool
  server.registerTool(
    "fs_read_file",
    {
      title: "Read File Contents",
      description: `Read the contents of a file with optional line offset and limit.

This tool reads text files and returns their contents. For binary files, it returns an error.
Use offset and limit parameters to read large files in chunks.

Args:
  - path (string): Path to the file (absolute or relative to current directory)
  - offset (number): Line number to start from (0-indexed, default: 0)
  - limit (number): Max lines to read (default: 100, max: 500)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  File contents with line numbers and metadata, or JSON with structured data.

Examples:
  - Read entire small file: path="README.md"
  - Read specific section: path="src/index.ts", offset=50, limit=20
  - Read from beginning: path="config.json", offset=0, limit=50

Error Handling:
  - Returns error if file not found
  - Returns error if path is a directory
  - Returns error if file is binary`,
      inputSchema: ReadFileInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: ReadFileInput) => {
      try {
        const resolvedPath = path.resolve(params.path);
        
        // Check if file exists and is readable
        const stats = await fs.stat(resolvedPath).catch(() => null);
        if (!stats) {
          return { content: [{ type: "text", text: `Error: File not found: "${params.path}"` }] };
        }
        if (stats.isDirectory()) {
          return { content: [{ type: "text", text: `Error: "${params.path}" is a directory, not a file. Use fs_list_directory instead.` }] };
        }

        // Read file content
        const content = await fs.readFile(resolvedPath, "utf-8");
        const lines = content.split("\n");
        const totalLines = lines.length;

        // Apply offset and limit
        const startLine = params.offset;
        const endLine = Math.min(startLine + params.limit, totalLines);
        const selectedLines = lines.slice(startLine, endLine);

        const result = {
          path: resolvedPath,
          total_lines: totalLines,
          offset: startLine,
          lines_read: selectedLines.length,
          content: selectedLines.join("\n"),
          has_more: endLine < totalLines,
          next_offset: endLine < totalLines ? endLine : undefined
        };

        const formatMarkdown = (data: typeof result) => {
          const extension = path.extname(data.path).slice(1);
          const lines: string[] = [
            `# File: ${path.basename(data.path)}`,
            "",
            `- **Path**: ${data.path}`,
            `- **Total Lines**: ${data.total_lines}`,
            `- **Showing**: Lines ${data.offset + 1}-${data.offset + data.lines_read}`,
            data.has_more ? `- **More**: Use offset=${data.next_offset} to continue` : "",
            "",
            codeBlock(data.content, extension)
          ];
          return lines.filter(Boolean).join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);
        
        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleFsError(error, params.path) }] };
      }
    }
  );

  // Write file tool
  server.registerTool(
    "fs_write_file",
    {
      title: "Write or Append to File",
      description: `Write content to a file, optionally creating parent directories.

This tool creates new files or overwrites existing ones. Use with caution as it can modify your filesystem.

Args:
  - path (string): Path to the file (absolute or relative)
  - content (string): Content to write to the file
  - append (boolean): If true, append instead of overwrite (default: false)
  - create_directories (boolean): Create parent directories if needed (default: true)

Returns:
  Confirmation of write operation with bytes written.

Examples:
  - Create new file: path="notes.txt", content="Hello world"
  - Append to log: path="app.log", content="New entry", append=true
  - Create with dirs: path="src/utils/helper.ts", content="export const x = 1;"

Error Handling:
  - Returns error if parent directory doesn't exist (and create_directories=false)
  - Returns error if permission denied`,
      inputSchema: WriteFileInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: WriteFileInput) => {
      try {
        const resolvedPath = path.resolve(params.path);
        
        // Create parent directories if needed
        if (params.create_directories) {
          const dir = path.dirname(resolvedPath);
          await fs.mkdir(dir, { recursive: true });
        }

        // Write or append
        const flag = params.append ? "a" : "w";
        await fs.writeFile(resolvedPath, params.content, { flag });

        const stats = await fs.stat(resolvedPath);
        const action = params.append ? "appended to" : "wrote";
        
        const result = {
          path: resolvedPath,
          action,
          bytes_written: Buffer.byteLength(params.content, "utf-8"),
          total_size: stats.size,
          success: true
        };

        const text = `Successfully ${result.action} "${result.path}"\n- Bytes ${params.append ? "appended" : "written"}: ${result.bytes_written}\n- Total file size: ${formatBytes(result.total_size)}`;

        return {
          content: [{ type: "text", text }],
          structuredContent: result
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleFsError(error, params.path) }] };
      }
    }
  );

  // List directory tool
  server.registerTool(
    "fs_list_directory",
    {
      title: "List Directory Contents",
      description: `List files and directories with optional recursive listing.

This tool shows directory contents with file sizes, modification times, and types.

Args:
  - path (string): Path to the directory
  - recursive (boolean): List recursively (default: false)
  - include_hidden (boolean): Include hidden files starting with "." (default: false)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Directory listing with file metadata.

Examples:
  - List current dir: path="."
  - List project src: path="./src", recursive=true
  - Include hidden: path="~/.config", include_hidden=true

Error Handling:
  - Returns error if path not found
  - Returns error if path is a file, not directory`,
      inputSchema: ListDirectoryInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: ListDirectoryInput) => {
      try {
        const resolvedPath = path.resolve(params.path);
        
        const stats = await fs.stat(resolvedPath).catch(() => null);
        if (!stats) {
          return { content: [{ type: "text", text: `Error: Directory not found: "${params.path}"` }] };
        }
        if (!stats.isDirectory()) {
          return { content: [{ type: "text", text: `Error: "${params.path}" is a file, not a directory. Use fs_read_file instead.` }] };
        }

        async function listDir(dirPath: string, relativeTo: string, depth = 0): Promise<Array<{ name: string; path: string; type: string; size?: number; modified?: string; depth: number }>> {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          const results: Array<{ name: string; path: string; type: string; size?: number; modified?: string; depth: number }> = [];

          for (const entry of entries) {
            if (!params.include_hidden && entry.name.startsWith(".")) {
              continue;
            }

            const entryPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(relativeTo, entryPath);

            if (entry.isDirectory()) {
              results.push({
                name: entry.name,
                path: relativePath,
                type: "directory",
                depth
              });

              if (params.recursive && depth < 10) {
                const subResults = await listDir(entryPath, relativeTo, depth + 1);
                results.push(...subResults);
              }
            } else {
              const entryStats = await fs.stat(entryPath);
              results.push({
                name: entry.name,
                path: relativePath,
                type: "file",
                size: entryStats.size,
                modified: entryStats.mtime.toISOString(),
                depth
              });
            }
          }

          return results;
        }

        const entries = await listDir(resolvedPath, resolvedPath);

        const result = {
          path: resolvedPath,
          entry_count: entries.length,
          recursive: params.recursive,
          entries: entries.map(e => ({
            ...e,
            size: e.size !== undefined ? formatBytes(e.size) : undefined,
            modified: e.modified ? formatTimestamp(e.modified) : undefined
          }))
        };

        const formatMarkdown = (data: typeof result) => {
          const lines: string[] = [`# Directory: ${data.path}`, ""];
          
          for (const entry of data.entries) {
            const indent = "  ".repeat(entry.depth);
            const icon = entry.type === "directory" ? "📁" : "📄";
            const size = entry.size ? ` (${entry.size})` : "";
            const modified = entry.modified ? ` - ${entry.modified}` : "";
            lines.push(`${indent}${icon} ${entry.name}${size}${modified}`);
          }
          
          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleFsError(error, params.path) }] };
      }
    }
  );

  // Search files tool
  server.registerTool(
    "fs_search_files",
    {
      title: "Search Files by Pattern",
      description: `Search for files matching a glob pattern.

This tool finds files using glob patterns like "**/*.ts" or "src/**/*.json".

Args:
  - pattern (string): Glob pattern (e.g., "**/*.py", "src/**/*.{ts,tsx}")
  - path (string): Base directory to search (default: ".")
  - limit (number): Maximum results (default: 20, max: 100)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of matching file paths with metadata.

Examples:
  - Find all TypeScript: pattern="**/*.ts"
  - Find test files: pattern="**/*.test.ts"
  - Find in src only: pattern="**/*.js", path="./src"

Error Handling:
  - Returns empty list if no matches
  - Returns error if base path not found`,
      inputSchema: SearchFilesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: SearchFilesInput) => {
      try {
        const resolvedPath = path.resolve(params.path);
        
        const matches = await glob(params.pattern, {
          cwd: resolvedPath,
          absolute: true,
          nodir: true
        });

        const fileInfos: Array<{ path: string; relative_path: string; size: string; modified: string }> = [];
        
        for (const match of matches.slice(0, params.limit)) {
          try {
            const stats = await fs.stat(match);
            fileInfos.push({
              path: match,
              relative_path: path.relative(resolvedPath, match),
              size: formatBytes(stats.size),
              modified: formatTimestamp(stats.mtime.toISOString())
            });
          } catch {
            // Skip files we can't stat
          }
        }

        const result = {
          pattern: params.pattern,
          base_path: resolvedPath,
          total_matches: matches.length,
          returned: fileInfos.length,
          has_more: matches.length > params.limit,
          files: fileInfos
        };

        const formatMarkdown = (data: typeof result) => {
          const lines: string[] = [
            `# File Search Results`,
            "",
            `- **Pattern**: ${data.pattern}`,
            `- **Base Path**: ${data.base_path}`,
            `- **Matches**: ${data.returned} of ${data.total_matches}${data.has_more ? " (truncated)" : ""}`,
            ""
          ];

          for (const file of data.files) {
            lines.push(`- **${file.relative_path}** (${file.size}, ${file.modified})`);
          }

          if (data.has_more) {
            lines.push("", "*More matches available. Use a more specific pattern to narrow results.*");
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleFsError(error, params.path) }] };
      }
    }
  );

  // Get file info tool
  server.registerTool(
    "fs_get_file_info",
    {
      title: "Get File or Directory Information",
      description: `Get detailed metadata about a file or directory.

This tool returns size, permissions, modification times, and other metadata.

Args:
  - path (string): Path to the file or directory
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Detailed metadata about the file or directory.

Examples:
  - File info: path="package.json"
  - Directory info: path="./src"

Error Handling:
  - Returns error if path not found`,
      inputSchema: GetFileInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GetFileInfoInput) => {
      try {
        const resolvedPath = path.resolve(params.path);
        const stats = await fs.stat(resolvedPath);

        const result = {
          path: resolvedPath,
          name: path.basename(resolvedPath),
          type: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
          size: stats.size,
          size_formatted: formatBytes(stats.size),
          created: stats.birthtime.toISOString(),
          created_formatted: formatTimestamp(stats.birthtime.toISOString()),
          modified: stats.mtime.toISOString(),
          modified_formatted: formatTimestamp(stats.mtime.toISOString()),
          accessed: stats.atime.toISOString(),
          accessed_formatted: formatTimestamp(stats.atime.toISOString()),
          permissions: stats.mode.toString(8).slice(-3),
          is_symbolic_link: stats.isSymbolicLink()
        };

        const formatMarkdown = (data: typeof result) => {
          const icon = data.type === "directory" ? "📁" : "📄";
          return [
            `# ${icon} ${data.name}`,
            "",
            `- **Path**: ${data.path}`,
            `- **Type**: ${data.type}`,
            `- **Size**: ${data.size_formatted}`,
            `- **Permissions**: ${data.permissions}`,
            `- **Created**: ${data.created_formatted}`,
            `- **Modified**: ${data.modified_formatted}`,
            `- **Accessed**: ${data.accessed_formatted}`,
            data.is_symbolic_link ? "- **Symlink**: Yes" : ""
          ].filter(Boolean).join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleFsError(error, params.path) }] };
      }
    }
  );
}
