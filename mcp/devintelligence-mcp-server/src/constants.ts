/**
 * Constants for the DevIntelligence MCP Server
 */

/** Maximum response size in characters to prevent context overflow */
export const CHARACTER_LIMIT = 50000;

/** Default pagination limit */
export const DEFAULT_LIMIT = 20;

/** Maximum pagination limit */
export const MAX_LIMIT = 100;

/** Default timeout for shell commands (ms) */
export const DEFAULT_SHELL_TIMEOUT = 30000;

/** Maximum timeout for shell commands (ms) */
export const MAX_SHELL_TIMEOUT = 300000;

/** GitHub API base URL */
export const GITHUB_API_BASE = "https://api.github.com";

/** Common code file extensions for analysis */
export const CODE_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "kt",
  "cpp", "c", "h", "hpp", "cs", "php", "swift", "scala", "r", "m"
];

/** Response format options */
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

/** Shell command allowlist patterns (for safety) */
export const DANGEROUS_COMMANDS = [
  /^rm\s+-rf\s+\//,
  />\s*\/dev\/null.*&\s*rm/,
  /:\(\)\s*\{\s*:\|\:&/,
  /mkfs\./,
  /^dd\s+if=.*of=\/dev\/[sh]d/,
  />\s*\/etc\/passwd/,
  /chmod\s+-R\s+777\s+\//,
];
