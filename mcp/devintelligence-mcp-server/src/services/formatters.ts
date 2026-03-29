/**
 * Shared formatting utilities for responses
 */

import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import type { PaginationInfo } from "../types.js";

/**
 * Format content based on response format preference
 */
export function formatResponse<T>(
  data: T,
  format: ResponseFormat,
  markdownFormatter: (data: T) => string
): { text: string; structured: T; truncated?: boolean } {
  let text: string;
  let truncated = false;

  if (format === ResponseFormat.MARKDOWN) {
    text = markdownFormatter(data);
  } else {
    text = JSON.stringify(data, null, 2);
  }

  // Check character limit
  if (text.length > CHARACTER_LIMIT) {
    const truncateMessage = `\n\n[Response truncated: ${text.length} characters exceeds ${CHARACTER_LIMIT} limit. Use offset parameter or filters to see more results.]`;
    text = text.substring(0, CHARACTER_LIMIT - truncateMessage.length) + truncateMessage;
    truncated = true;
  }

  return { text, structured: data, truncated };
}

/**
 * Format pagination info as markdown
 */
export function formatPagination(info: PaginationInfo): string {
  const parts = [`**Results**: ${info.count} of ${info.total}`];
  if (info.has_more) {
    parts.push(`(more available, use offset=${info.next_offset})`);
  }
  return parts.join(" ");
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format timestamp to human readable string
 */
export function formatTimestamp(timestamp: string | number | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

/**
 * Escape markdown special characters
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/`/g, "\\`");
}

/**
 * Create a code block in markdown
 */
export function codeBlock(code: string, language?: string): string {
  return `\`\`\`${language || ""}\n${code}\n\`\`\``;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}
