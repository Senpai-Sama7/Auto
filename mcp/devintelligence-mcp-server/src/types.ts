/**
 * TypeScript type definitions for DevIntelligence MCP Server
 */

/** Pagination metadata returned by list operations */
export interface PaginationInfo {
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

/** File information structure */
export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  modified: string;
  created: string;
}

/** Shell command result */
export interface ShellResult {
  [key: string]: unknown;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

/** Code symbol (function, class, variable) */
export interface CodeSymbol {
  name: string;
  type: "function" | "class" | "interface" | "variable" | "import" | "export";
  line_start: number;
  line_end: number;
  signature?: string;
  documentation?: string;
}

/** Code complexity metrics */
export interface ComplexityMetrics {
  lines_of_code: number;
  cyclomatic_complexity: number;
  cognitive_complexity: number;
  function_count: number;
  class_count: number;
  max_function_length: number;
}

/** GitHub repository info */
export interface GitHubRepo {
  [key: string]: unknown;
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  open_issues: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  is_private: boolean;
}

/** GitHub issue */
export interface GitHubIssue {
  [key: string]: unknown;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  user: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  url: string;
}

/** GitHub pull request */
export interface GitHubPullRequest {
  [key: string]: unknown;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged";
  user: string;
  head_branch: string;
  base_branch: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  url: string;
}

/** Database column info */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  is_primary_key: boolean;
}

/** Database table info */
export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  row_count: number;
}

/** Search match result */
export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  match: string;
  context_before: string;
  context_after: string;
}
