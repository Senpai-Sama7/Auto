/**
 * Error handling utilities
 */

import { AxiosError } from "axios";

/**
 * Handle API errors with actionable messages
 */
export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          return `Error: Bad request. ${data?.message || "Check your parameters and try again."}`;
        case 401:
          return "Error: Authentication failed. Check your GITHUB_TOKEN environment variable.";
        case 403:
          if (data?.message?.includes("rate limit")) {
            const resetTime = error.response.headers["x-ratelimit-reset"];
            const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleString() : "soon";
            return `Error: GitHub API rate limit exceeded. Resets at ${resetDate}. Consider using a token with higher limits.`;
          }
          return "Error: Permission denied. You don't have access to this resource.";
        case 404:
          return "Error: Resource not found. Please check the owner/repo/ID is correct.";
        case 422:
          return `Error: Validation failed. ${data?.message || "Check your input data."}`;
        case 429:
          return "Error: Rate limit exceeded. Please wait before making more requests.";
        case 500:
        case 502:
        case 503:
          return "Error: GitHub service temporarily unavailable. Please try again later.";
        default:
          return `Error: API request failed with status ${status}. ${data?.message || ""}`;
      }
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "Error: Request timed out. GitHub may be experiencing issues. Please try again.";
    } else if (error.code === "ENOTFOUND") {
      return "Error: Network error. Cannot reach GitHub API. Check your internet connection.";
    }
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Error: Unexpected error occurred: ${String(error)}`;
}

/**
 * Handle shell command errors
 */
export function handleShellError(error: unknown, command: string): string {
  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes("ENOENT")) {
      return `Error: Command not found: "${command.split(" ")[0]}". Is it installed and in your PATH?`;
    }
    if (error.message.includes("EACCES")) {
      return `Error: Permission denied executing "${command}". Check file permissions.`;
    }
    if (error.message.includes("ETIMEDOUT")) {
      return `Error: Command timed out. The operation took too long to complete.`;
    }
    return `Error executing command: ${error.message}`;
  }
  return `Error: Unexpected error: ${String(error)}`;
}

/**
 * Handle file system errors
 */
export function handleFsError(error: unknown, path: string): string {
  if (error instanceof Error) {
    if (error.message.includes("ENOENT")) {
      return `Error: File or directory not found: "${path}"`;
    }
    if (error.message.includes("EACCES")) {
      return `Error: Permission denied accessing "${path}"`;
    }
    if (error.message.includes("EISDIR")) {
      return `Error: Expected a file but found a directory: "${path}"`;
    }
    if (error.message.includes("ENOTDIR")) {
      return `Error: Expected a directory but found a file: "${path}"`;
    }
    return `Error accessing "${path}": ${error.message}`;
  }
  return `Error: Unexpected error: ${String(error)}`;
}

/**
 * Handle database errors
 */
export function handleDbError(error: unknown, query?: string): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    
    if (msg.includes("no such table")) {
      return `Error: Table does not exist. ${error.message}`;
    }
    if (msg.includes("no such column")) {
      return `Error: Column does not exist. ${error.message}`;
    }
    if (msg.includes("syntax error")) {
      return `Error: SQL syntax error${query ? ` in query: "${truncateText(query, 50)}"` : ""}. ${error.message}`;
    }
    if (msg.includes("database is locked")) {
      return `Error: Database is locked by another process. Try again later.`;
    }
    if (msg.includes("readonly")) {
      return `Error: Database is read-only. Cannot execute write operations.`;
    }
    return `Error: Database error: ${error.message}`;
  }
  return `Error: Unexpected database error: ${String(error)}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}
