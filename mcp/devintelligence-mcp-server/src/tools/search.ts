/**
 * Search Tools - Grep-like content searching across files
 */

import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, DEFAULT_LIMIT, MAX_LIMIT, CODE_EXTENSIONS } from "../constants.js";
import { formatResponse, codeBlock } from "../services/formatters.js";
import { handleShellError } from "../services/errors.js";
import type { SearchMatch } from "../types.js";

const execAsync = promisify(exec);

// Input schemas
const GrepSearchInputSchema = z.object({
  pattern: z.string()
    .min(1, "Pattern is required")
    .describe("Search pattern (regex supported)"),
  path: z.string()
    .default(".")
    .describe("Base directory to search"),
  include: z.string()
    .optional()
    .describe("Glob pattern for files to include (e.g., '*.ts', '*.py')"),
  exclude: z.string()
    .optional()
    .describe("Glob pattern for files to exclude (e.g., 'node_modules/*', '*.min.js')"),
  case_sensitive: z.boolean()
    .default(false)
    .describe("Case-sensitive search (default: false)"),
  whole_word: z.boolean()
    .default(false)
    .describe("Match whole words only (default: false)"),
  limit: z.number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("Maximum matches to return (default: 20)"),
  context_lines: z.number()
    .int()
    .min(0)
    .max(5)
    .default(2)
    .describe("Lines of context before/after match (default: 2)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const FindDefinitionsInputSchema = z.object({
  symbol: z.string()
    .min(1, "Symbol name is required")
    .describe("Function, class, or variable name to find"),
  path: z.string()
    .default(".")
    .describe("Base directory to search"),
  language: z.enum(["typescript", "javascript", "python", "go", "rust", "java", "any"])
    .default("any")
    .describe("Language to search in (default: any)"),
  limit: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results (default: 10)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Type definitions
type GrepSearchInput = z.infer<typeof GrepSearchInputSchema>;
type FindDefinitionsInput = z.infer<typeof FindDefinitionsInputSchema>;

/**
 * Register all search tools
 */
export function registerSearchTools(server: McpServer): void {

  // Grep search tool
  server.registerTool(
    "search_grep",
    {
      title: "Search File Contents with Grep",
      description: `Search for patterns in file contents using ripgrep-style search.

This tool searches through files for text patterns, supporting regex and providing context.

Args:
  - pattern (string): Search pattern (supports regex, e.g., 'function\s+\w+', 'TODO|FIXME')
  - path (string): Base directory (default: current directory)
  - include (string): Glob to include (e.g., '*.ts', '*.{js,ts}')
  - exclude (string): Glob to exclude (e.g., 'node_modules/*', 'dist/*')
  - case_sensitive (boolean): Case-sensitive search (default: false)
  - whole_word (boolean): Match whole words only (default: false)
  - limit (number): Max matches (default: 20, max: 100)
  - context_lines (number): Context lines before/after (default: 2, max: 5)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Matching files with line numbers, column, and context.

Examples:
  - Find TODOs: pattern="TODO|FIXME"
  - Find function: pattern="function\s+myFunc", include="*.ts"
  - Case sensitive: pattern="API_KEY", case_sensitive=true
  - Whole word: pattern="config", whole_word=true

Error Handling:
  - Returns empty results if no matches
  - Returns error if base path not found`,
      inputSchema: GrepSearchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: GrepSearchInput) => {
      try {
        const resolvedPath = path.resolve(params.path);
        
        // Check if directory exists
        try {
          const stats = await fs.stat(resolvedPath);
          if (!stats.isDirectory()) {
            return { content: [{ type: "text", text: `Error: "${params.path}" is not a directory` }] };
          }
        } catch {
          return { content: [{ type: "text", text: `Error: Directory not found: "${params.path}"` }] };
        }

        // Build ripgrep command
        const args: string[] = [
          "rg",
          "--json",           // JSON output for parsing
          "--trim",           // Trim leading whitespace
          "-C", params.context_lines.toString(),  // Context lines
        ];

        if (!params.case_sensitive) args.push("-i");  // Case insensitive
        if (params.whole_word) args.push("-w");       // Whole word
        if (params.include) args.push("--glob", params.include);
        if (params.exclude) args.push("--glob", `!${params.exclude}`);

        args.push(params.pattern);
        args.push(resolvedPath);

        const command = args.join(" ");
        
        let stdout: string;
        let stderr: string;
        
        try {
          const result = await execAsync(command, { timeout: 30000 });
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (execError: any) {
          // ripgrep returns exit code 1 when no matches found
          if (execError.code === 1 && !execError.stdout) {
            stdout = "";
            stderr = "";
          } else {
            throw execError;
          }
        }

        // Parse ripgrep JSON output
        const matches: SearchMatch[] = [];
        const lines = stdout.trim().split("\n").filter(Boolean);
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "match") {
              const filePath = data.data.path.text;
              const lineNum = data.data.line_number;
              const matchText = data.data.lines.text?.trim() || "";
              
              // Get submatches for column info
              const submatch = data.data.submatches?.[0];
              const column = submatch?.start || 0;
              
              // Get context lines
              let contextBefore = "";
              let contextAfter = "";
              
              // Parse context from lines if available
              const lineText = data.data.lines.text || "";
              
              matches.push({
                file: filePath,
                line: lineNum,
                column: column + 1,  // 1-indexed
                match: matchText,
                context_before: contextBefore,
                context_after: contextAfter
              });

              if (matches.length >= params.limit) break;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }

        const result = {
          pattern: params.pattern,
          base_path: resolvedPath,
          match_count: matches.length,
          has_more: lines.length > matches.length,
          matches: matches
        };

        const formatMarkdown = (data: typeof result) => {
          const lines: string[] = [
            `# Grep Search Results`,
            "",
            `**Pattern**: ${codeBlock(params.pattern)}`,
            `**Path**: ${data.base_path}`,
            `**Matches**: ${data.match_count}${data.has_more ? "+ (truncated)" : ""}`,
            ""
          ];

          if (params.include) lines.push(`**Include**: ${params.include}`);
          if (params.exclude) lines.push(`**Exclude**: ${params.exclude}`);
          if (params.include || params.exclude) lines.push("");

          // Group by file
          const byFile = new Map<string, typeof matches>();
          for (const match of data.matches) {
            if (!byFile.has(match.file)) byFile.set(match.file, []);
            byFile.get(match.file)!.push(match);
          }

          for (const [file, fileMatches] of byFile) {
            lines.push(`## ${path.relative(resolvedPath, file) || file}`);
            lines.push("");
            
            for (const match of fileMatches) {
              lines.push(`**Line ${match.line}** (col ${match.column}):`);
              lines.push(codeBlock(match.match));
              lines.push("");
            }
          }

          if (data.matches.length === 0) {
            lines.push("*(No matches found)*");
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleShellError(error, `rg ${params.pattern}`) }] };
      }
    }
  );

  // Find definitions tool
  server.registerTool(
    "search_find_definitions",
    {
      title: "Find Symbol Definitions",
      description: `Find where functions, classes, or variables are defined in code.

This tool searches for definition patterns across different programming languages.

Args:
  - symbol (string): Symbol name to find (function, class, variable)
  - path (string): Base directory to search (default: current)
  - language ('typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'any'): Language filter
  - limit (number): Max results (default: 10)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Locations where the symbol is defined with file path and line number.

Examples:
  - Find function: symbol="calculateTotal", language="typescript"
  - Find class: symbol="UserRepository", language="python"
  - Any language: symbol="main"

Note:
  - Uses pattern matching, not semantic analysis
  - May return false positives for common names`,
      inputSchema: FindDefinitionsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (params: FindDefinitionsInput) => {
      try {
        const resolvedPath = path.resolve(params.path);
        
        // Build language-specific patterns
        const patterns: string[] = [];
        const extensions: string[] = [];

        switch (params.language) {
          case "typescript":
          case "javascript":
            patterns.push(
              `function\\s+${params.symbol}\\b`,
              `(const|let|var)\\s+${params.symbol}\\s*[=:]`,
              `class\\s+${params.symbol}\\b`,
              `interface\\s+${params.symbol}\\b`,
              `type\\s+${params.symbol}\\b`,
              `${params.symbol}\\s*[=:]\\s*(async\\s*)?\\(`,
              `async\\s+function\\s+${params.symbol}\\b`
            );
            extensions.push("ts", "tsx", "js", "jsx", "mjs");
            break;
          case "python":
            patterns.push(
              `def\\s+${params.symbol}\\b`,
              `class\\s+${params.symbol}\\b`,
              `${params.symbol}\\s*=`
            );
            extensions.push("py", "pyi");
            break;
          case "go":
            patterns.push(
              `func\\s+\\(?.+\\)?\\s*${params.symbol}\\b`,
              `func\\s+${params.symbol}\\b`,
              `type\\s+${params.symbol}\\b`,
              `var\\s+${params.symbol}\\b`,
              `const\\s+${params.symbol}\\b`
            );
            extensions.push("go");
            break;
          case "rust":
            patterns.push(
              `fn\\s+${params.symbol}\\b`,
              `struct\\s+${params.symbol}\\b`,
              `impl\\s+.*\\b${params.symbol}\\b`,
              `trait\\s+${params.symbol}\\b`,
              `const\\s+${params.symbol}\\b`,
              `let\\s+${params.symbol}\\b`
            );
            extensions.push("rs");
            break;
          case "java":
            patterns.push(
              `(public|private|protected)?\\s*(static)?\\s*(final)?\\s*\\w+\\s+${params.symbol}\\b`,
              `class\\s+${params.symbol}\\b`,
              `interface\\s+${params.symbol}\\b`,
              `enum\\s+${params.symbol}\\b`
            );
            extensions.push("java");
            break;
          default:
            // Generic patterns for any language
            patterns.push(
              `function\\s+${params.symbol}\\b`,
              `def\\s+${params.symbol}\\b`,
              `class\\s+${params.symbol}\\b`,
              `fn\\s+${params.symbol}\\b`,
              `(const|let|var)\\s+${params.symbol}\\b`,
              `${params.symbol}\\s*=`
            );
            extensions.push(...CODE_EXTENSIONS);
        }

        // Build ripgrep command with OR patterns
        const patternArg = patterns.join("|");
        const globArg = extensions.length > 0 
          ? `*.{${extensions.join(",")}}` 
          : "*";

        const args = [
          "rg",
          "--json",
          "--trim",
          "-n",  // Line numbers
          "-t", globArg,
          `"${patternArg}"`,
          resolvedPath
        ];

        const command = args.join(" ");
        
        let stdout = "";
        try {
          const result = await execAsync(command, { timeout: 30000 });
          stdout = result.stdout;
        } catch (execError: any) {
          if (execError.code !== 1) throw execError;
        }

        // Parse results
        const definitions: Array<{
          file: string;
          line: number;
          column: number;
          code: string;
          type: string;
        }> = [];

        const lines = stdout.trim().split("\n").filter(Boolean);
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "match") {
              const filePath = data.data.path.text;
              const lineNum = data.data.line_number;
              const code = data.data.lines.text?.trim() || "";
              const submatch = data.data.submatches?.[0];
              const column = (submatch?.start || 0) + 1;

              // Determine type based on code
              let type = "unknown";
              if (code.match(/\bfunction\b|\bdef\b|\bfn\b/)) type = "function";
              else if (code.match(/\bclass\b/)) type = "class";
              else if (code.match(/\binterface\b/)) type = "interface";
              else if (code.match(/\b(const|let|var)\s+\w+\s*[:=]/)) type = "variable";
              else if (code.match(/\b\w+\s*=/)) type = "assignment";

              definitions.push({
                file: filePath,
                line: lineNum,
                column,
                code,
                type
              });

              if (definitions.length >= params.limit) break;
            }
          } catch {
            // Skip malformed lines
          }
        }

        const result = {
          symbol: params.symbol,
          language: params.language,
          base_path: resolvedPath,
          definition_count: definitions.length,
          definitions
        };

        const formatMarkdown = (data: typeof result) => {
          const lines: string[] = [
            `# Symbol Definitions: ${data.symbol}`,
            "",
            `**Language**: ${data.language}`,
            `**Found**: ${data.definition_count} definitions`,
            ""
          ];

          for (const def of data.definitions) {
            const relPath = path.relative(resolvedPath, def.file) || def.file;
            lines.push(`### ${def.type}: ${relPath}:${def.line}`);
            lines.push("");
            lines.push(codeBlock(def.code));
            lines.push("");
          }

          if (data.definitions.length === 0) {
            lines.push("*(No definitions found)*");
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleShellError(error, `search for ${params.symbol}`) }] };
      }
    }
  );
}
