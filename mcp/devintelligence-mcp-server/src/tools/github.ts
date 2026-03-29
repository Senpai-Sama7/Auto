/**
 * GitHub Integration Tools - Repository, Issue, and PR management
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResponseFormat, DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";
import { formatResponse, formatTimestamp, truncateText } from "../services/formatters.js";
import { getGitHubClient } from "../services/github.js";
import { handleApiError } from "../services/errors.js";
import type { GitHubRepo, GitHubIssue, GitHubPullRequest } from "../types.js";

// Helper to parse owner/repo from full name
function parseRepo(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split("/");
  if (parts.length !== 2) {
    throw new Error(`Invalid repository format: "${fullName}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}

// Input schemas
const SearchReposInputSchema = z.object({
  query: z.string()
    .min(1, "Query is required")
    .describe("Search query (e.g., 'language:typescript stars:>1000', 'topic:machine-learning')"),
  sort: z.enum(["stars", "forks", "help-wanted-issues", "updated"])
    .optional()
    .describe("Sort field (default: best match)"),
  order: z.enum(["asc", "desc"])
    .default("desc")
    .describe("Sort order (default: desc)"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(DEFAULT_LIMIT)
    .describe("Maximum results to return (default: 20)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const GetRepoInputSchema = z.object({
  owner: z.string()
    .min(1, "Owner is required")
    .describe("Repository owner (username or organization)"),
  repo: z.string()
    .min(1, "Repo name is required")
    .describe("Repository name"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const ListIssuesInputSchema = z.object({
  owner: z.string()
    .min(1, "Owner is required")
    .describe("Repository owner"),
  repo: z.string()
    .min(1, "Repo name is required")
    .describe("Repository name"),
  state: z.enum(["open", "closed", "all"])
    .default("open")
    .describe("Filter by state (default: open)"),
  labels: z.array(z.string())
    .optional()
    .describe("Filter by labels (e.g., ['bug', 'priority-high'])"),
  assignee: z.string()
    .optional()
    .describe("Filter by assignee username"),
  limit: z.number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("Maximum results (default: 20)"),
  page: z.number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number for pagination (default: 1)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const CreateIssueInputSchema = z.object({
  owner: z.string()
    .min(1, "Owner is required")
    .describe("Repository owner"),
  repo: z.string()
    .min(1, "Repo name is required")
    .describe("Repository name"),
  title: z.string()
    .min(1, "Title is required")
    .max(256, "Title too long")
    .describe("Issue title"),
  body: z.string()
    .optional()
    .describe("Issue body/description (supports Markdown)"),
  labels: z.array(z.string())
    .optional()
    .describe("Labels to apply (e.g., ['bug', 'help wanted'])"),
  assignees: z.array(z.string())
    .optional()
    .describe("Usernames to assign"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const UpdateIssueInputSchema = z.object({
  owner: z.string()
    .min(1, "Owner is required")
    .describe("Repository owner"),
  repo: z.string()
    .min(1, "Repo name is required")
    .describe("Repository name"),
  issue_number: z.number()
    .int()
    .min(1, "Issue number must be positive")
    .describe("Issue number to update"),
  title: z.string()
    .min(1)
    .max(256)
    .optional()
    .describe("New title"),
  body: z.string()
    .optional()
    .describe("New body"),
  state: z.enum(["open", "closed"])
    .optional()
    .describe("New state"),
  labels: z.array(z.string())
    .optional()
    .describe("Replace labels (empty array to clear)"),
  assignees: z.array(z.string())
    .optional()
    .describe("Replace assignees"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const ListPullRequestsInputSchema = z.object({
  owner: z.string()
    .min(1, "Owner is required")
    .describe("Repository owner"),
  repo: z.string()
    .min(1, "Repo name is required")
    .describe("Repository name"),
  state: z.enum(["open", "closed", "all"])
    .default("open")
    .describe("Filter by state (default: open)"),
  head: z.string()
    .optional()
    .describe("Filter by head branch (format: 'user:branch')"),
  base: z.string()
    .optional()
    .describe("Filter by base branch"),
  limit: z.number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("Maximum results (default: 20)"),
  page: z.number()
    .int()
    .min(1)
    .default(1)
    .describe("Page number for pagination"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const GetPullRequestInputSchema = z.object({
  owner: z.string()
    .min(1, "Owner is required")
    .describe("Repository owner"),
  repo: z.string()
    .min(1, "Repo name is required")
    .describe("Repository name"),
  pull_number: z.number()
    .int()
    .min(1, "PR number must be positive")
    .describe("Pull request number"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

const CreatePRReviewInputSchema = z.object({
  owner: z.string()
    .min(1, "Owner is required")
    .describe("Repository owner"),
  repo: z.string()
    .min(1, "Repo name is required")
    .describe("Repository name"),
  pull_number: z.number()
    .int()
    .min(1, "PR number must be positive")
    .describe("Pull request number"),
  event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
    .describe("Review action: APPROVE, REQUEST_CHANGES, or COMMENT"),
  body: z.string()
    .optional()
    .describe("Review comment body"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Type definitions
type SearchReposInput = z.infer<typeof SearchReposInputSchema>;
type GetRepoInput = z.infer<typeof GetRepoInputSchema>;
type ListIssuesInput = z.infer<typeof ListIssuesInputSchema>;
type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;
type UpdateIssueInput = z.infer<typeof UpdateIssueInputSchema>;
type ListPullRequestsInput = z.infer<typeof ListPullRequestsInputSchema>;
type GetPullRequestInput = z.infer<typeof GetPullRequestInputSchema>;
type CreatePRReviewInput = z.infer<typeof CreatePRReviewInputSchema>;

/**
 * Register all GitHub tools
 */
export function registerGitHubTools(server: McpServer): void {
  const client = getGitHubClient();

  // Search repositories
  server.registerTool(
    "github_search_repos",
    {
      title: "Search GitHub Repositories",
      description: `Search for repositories on GitHub using advanced query syntax.

This tool searches across all public GitHub repositories (and private ones you have access to).

Args:
  - query (string): Search query using GitHub syntax:
    - "language:typescript stars:>1000" - TypeScript repos with 1000+ stars
    - "topic:machine-learning" - Repos with ML topic
    - "user:facebook react" - Facebook's React repos
    - "org:microsoft language:python" - Microsoft's Python repos
  - sort ('stars' | 'forks' | 'help-wanted-issues' | 'updated'): Sort field
  - order ('asc' | 'desc'): Sort order (default: desc)
  - limit (number): Max results (default: 20, max: 100)
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of matching repositories with stars, forks, language, and metadata.

Examples:
  - Find popular ML repos: query="topic:machine-learning stars:>5000"
  - Find TypeScript tools: query="language:typescript stars:>1000"
  - Search by name: query="react state management"

Error Handling:
  - Returns error if GitHub API rate limit exceeded
  - Requires GITHUB_TOKEN environment variable for higher rate limits`,
      inputSchema: SearchReposInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: SearchReposInput) => {
      try {
        const result = await client.searchRepos(
          params.query,
          params.sort,
          params.order,
          params.limit,
          1
        );

        const formatMarkdown = (data: typeof result) => {
          const lines: string[] = [
            `# GitHub Repository Search`,
            "",
            `**Query**: ${params.query}`,
            `**Total Results**: ${data.total_count.toLocaleString()}`,
            `**Showing**: ${data.items.length}`,
            ""
          ];

          for (const repo of data.items) {
            const lang = repo.language ? ` · ${repo.language}` : "";
            const desc = repo.description ? `\n   ${truncateText(repo.description, 100)}` : "";
            lines.push(`### [${repo.full_name}](${repo.url})${lang}`);
            lines.push(`⭐ ${repo.stars.toLocaleString()} · 🍴 ${repo.forks.toLocaleString()} · 📋 ${repo.open_issues.toLocaleString()} issues${desc}`);
            lines.push("");
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(result, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // Get repository details
  server.registerTool(
    "github_get_repo",
    {
      title: "Get GitHub Repository Details",
      description: `Get detailed information about a specific GitHub repository.

Args:
  - owner (string): Repository owner (username or org)
  - repo (string): Repository name
  - response_format ('markdown' | 'json'): Output format

Returns:
  Full repository details including description, stats, URLs, and metadata.

Examples:
  - Get React repo: owner="facebook", repo="react"
  - Get VS Code: owner="microsoft", repo="vscode"

Error Handling:
  - Returns error if repository not found
  - Returns error if private and no access`,
      inputSchema: GetRepoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetRepoInput) => {
      try {
        const repo = await client.getRepo(params.owner, params.repo);

        const formatMarkdown = (data: GitHubRepo) => {
          const lines: string[] = [
            `# ${data.full_name}`,
            "",
            data.description || "*(No description)*",
            "",
            `- **URL**: ${data.url}`,
            `- **Language**: ${data.language || "Not specified"}`,
            `- **Stars**: ${data.stars.toLocaleString()}`,
            `- **Forks**: ${data.forks.toLocaleString()}`,
            `- **Open Issues**: ${data.open_issues.toLocaleString()}`,
            `- **Visibility**: ${data.is_private ? "Private" : "Public"}`,
            `- **Created**: ${formatTimestamp(data.created_at)}`,
            `- **Updated**: ${formatTimestamp(data.updated_at)}`
          ];
          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(repo, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // List issues
  server.registerTool(
    "github_list_issues",
    {
      title: "List GitHub Issues",
      description: `List issues in a GitHub repository with filtering options.

Args:
  - owner (string): Repository owner
  - repo (string): Repository name
  - state ('open' | 'closed' | 'all'): Filter by state (default: open)
  - labels (string[]): Filter by labels
  - assignee (string): Filter by assignee username
  - limit (number): Max results (default: 20)
  - page (number): Page number for pagination
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of issues with title, state, labels, and metadata.

Examples:
  - List open bugs: owner="facebook", repo="react", labels=["bug"]
  - List my issues: owner="microsoft", repo="vscode", assignee="myusername"
  - List all closed: owner="torvalds", repo="linux", state="closed"

Error Handling:
  - Returns error if repository not found
  - Returns empty list if no matching issues`,
      inputSchema: ListIssuesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListIssuesInput) => {
      try {
        const issues = await client.listIssues(
          params.owner,
          params.repo,
          params.state,
          params.labels,
          params.assignee,
          params.limit,
          params.page
        );

        const formatMarkdown = (data: GitHubIssue[]) => {
          const stateLabel = params.state === "all" ? "issues" : `${params.state} issues`;
          const lines: string[] = [
            `# ${params.owner}/${params.repo} ${stateLabel}`,
            "",
            `**Found**: ${data.length} issues`,
            ""
          ];

          if (params.labels?.length) {
            lines.push(`**Labels**: ${params.labels.join(", ")}`);
            lines.push("");
          }

          for (const issue of data) {
            const labels = issue.labels.length ? ` [${issue.labels.join(", ")}]` : "";
            const state = issue.state === "open" ? "🟢" : "🔴";
            lines.push(`### ${state} #${issue.number}: ${issue.title}${labels}`);
            lines.push(`By @${issue.user} · ${formatTimestamp(issue.created_at)}`);
            if (issue.body) {
              lines.push(`\n${truncateText(issue.body, 200)}`);
            }
            lines.push("");
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(issues, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent: structuredContent as unknown as { [key: string]: unknown }
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // Create issue
  server.registerTool(
    "github_create_issue",
    {
      title: "Create GitHub Issue",
      description: `Create a new issue in a GitHub repository.

Args:
  - owner (string): Repository owner
  - repo (string): Repository name
  - title (string): Issue title (required)
  - body (string): Issue description (Markdown supported)
  - labels (string[]): Labels to apply
  - assignees (string[]): Usernames to assign
  - response_format ('markdown' | 'json'): Output format

Returns:
  Created issue details including number and URL.

Examples:
  - Report bug: owner="myorg", repo="project", title="Login button not working", labels=["bug"]
  - Feature request: owner="myorg", repo="project", title="Add dark mode", labels=["enhancement"]

Error Handling:
  - Returns error if authentication fails
  - Returns error if no permission to create issues
  - Requires GITHUB_TOKEN with repo access`,
      inputSchema: CreateIssueInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateIssueInput) => {
      try {
        const issue = await client.createIssue(
          params.owner,
          params.repo,
          params.title,
          params.body,
          params.labels,
          params.assignees
        );

        const formatMarkdown = (data: GitHubIssue) => {
          const labels = data.labels.length ? ` [${data.labels.join(", ")}]` : "";
          return [
            `# ✅ Issue Created`,
            "",
            `**#${data.number}**: ${data.title}${labels}`,
            "",
            `- **URL**: ${data.url}`,
            `- **State**: ${data.state}`,
            `- **Created**: ${formatTimestamp(data.created_at)}`,
            data.body ? `\n**Body**:\n${data.body}` : ""
          ].filter(Boolean).join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(issue, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // Update issue
  server.registerTool(
    "github_update_issue",
    {
      title: "Update GitHub Issue",
      description: `Update an existing issue (title, body, state, labels, assignees).

Args:
  - owner (string): Repository owner
  - repo (string): Repository name
  - issue_number (number): Issue number to update
  - title (string): New title (optional)
  - body (string): New body (optional)
  - state ('open' | 'closed'): New state (optional)
  - labels (string[]): Replace labels (optional, empty array to clear)
  - assignees (string[]): Replace assignees (optional)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Updated issue details.

Examples:
  - Close issue: owner="myorg", repo="project", issue_number=42, state="closed"
  - Add labels: owner="myorg", repo="project", issue_number=42, labels=["bug", "confirmed"]
  - Reassign: owner="myorg", repo="project", issue_number=42, assignees=["newowner"]

Error Handling:
  - Returns error if issue not found
  - Requires GITHUB_TOKEN with repo access`,
      inputSchema: UpdateIssueInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: UpdateIssueInput) => {
      try {
        const updates: Parameters<typeof client.updateIssue>[3] = {};
        if (params.title !== undefined) updates.title = params.title;
        if (params.body !== undefined) updates.body = params.body;
        if (params.state !== undefined) updates.state = params.state;
        if (params.labels !== undefined) updates.labels = params.labels;
        if (params.assignees !== undefined) updates.assignees = params.assignees;

        const issue = await client.updateIssue(
          params.owner,
          params.repo,
          params.issue_number,
          updates
        );

        const formatMarkdown = (data: GitHubIssue) => {
          const labels = data.labels.length ? ` [${data.labels.join(", ")}]` : "";
          return [
            `# ✅ Issue Updated`,
            "",
            `**#${data.number}**: ${data.title}${labels}`,
            "",
            `- **URL**: ${data.url}`,
            `- **State**: ${data.state}`,
            `- **Updated**: ${formatTimestamp(data.updated_at)}`
          ].join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(issue, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // List pull requests
  server.registerTool(
    "github_list_pull_requests",
    {
      title: "List GitHub Pull Requests",
      description: `List pull requests in a GitHub repository.

Args:
  - owner (string): Repository owner
  - repo (string): Repository name
  - state ('open' | 'closed' | 'all'): Filter by state (default: open)
  - head (string): Filter by head branch (format: 'user:branch')
  - base (string): Filter by base/target branch
  - limit (number): Max results (default: 20)
  - page (number): Page number
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of pull requests with branches, state, and metadata.

Examples:
  - List open PRs: owner="facebook", repo="react"
  - List to main: owner="microsoft", repo="vscode", base="main"
  - List from feature: owner="myorg", repo="project", head="myuser:feature-branch"

Error Handling:
  - Returns error if repository not found`,
      inputSchema: ListPullRequestsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListPullRequestsInput) => {
      try {
        const prs = await client.listPullRequests(
          params.owner,
          params.repo,
          params.state,
          params.head,
          params.base,
          params.limit,
          params.page
        );

        const formatMarkdown = (data: GitHubPullRequest[]) => {
          const stateLabel = params.state === "all" ? "PRs" : `${params.state} PRs`;
          const lines: string[] = [
            `# ${params.owner}/${params.repo} ${stateLabel}`,
            "",
            `**Found**: ${data.length} pull requests`,
            ""
          ];

          if (params.base) {
            lines.push(`**Base branch**: ${params.base}`);
            lines.push("");
          }

          for (const pr of data) {
            const stateIcon = pr.state === "open" ? "🟢" : pr.state === "merged" ? "🟣" : "🔴";
            lines.push(`### ${stateIcon} #${pr.number}: ${pr.title}`);
            lines.push(`By @${pr.user} · ${pr.head_branch} → ${pr.base_branch}`);
            lines.push(`Created: ${formatTimestamp(pr.created_at)}`);
            if (pr.body) {
              lines.push(`\n${truncateText(pr.body, 150)}`);
            }
            lines.push("");
          }

          return lines.join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(prs, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent: structuredContent as unknown as { [key: string]: unknown }
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // Get pull request details
  server.registerTool(
    "github_get_pull_request",
    {
      title: "Get GitHub Pull Request Details",
      description: `Get detailed information about a specific pull request.

Args:
  - owner (string): Repository owner
  - repo (string): Repository name
  - pull_number (number): Pull request number
  - response_format ('markdown' | 'json'): Output format

Returns:
  Full PR details including branches, state, and metadata.

Examples:
  - Get PR details: owner="facebook", repo="react", pull_number=12345

Error Handling:
  - Returns error if PR not found`,
      inputSchema: GetPullRequestInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetPullRequestInput) => {
      try {
        const pr = await client.getPullRequest(params.owner, params.repo, params.pull_number);

        const formatMarkdown = (data: GitHubPullRequest) => {
          const stateIcon = data.state === "open" ? "🟢" : data.state === "merged" ? "🟣" : "🔴";
          return [
            `# ${stateIcon} PR #${data.number}: ${data.title}`,
            "",
            `- **Author**: @${data.user}`,
            `- **Branch**: ${data.head_branch} → ${data.base_branch}`,
            `- **State**: ${data.state}`,
            `- **URL**: ${data.url}`,
            `- **Created**: ${formatTimestamp(data.created_at)}`,
            `- **Updated**: ${formatTimestamp(data.updated_at)}`,
            data.merged_at ? `- **Merged**: ${formatTimestamp(data.merged_at)}` : "",
            "",
            data.body || "*(No description)*"
          ].filter(Boolean).join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(pr, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // Create PR review
  server.registerTool(
    "github_create_pull_request_review",
    {
      title: "Create GitHub Pull Request Review",
      description: `Review a pull request by approving, requesting changes, or commenting.

Args:
  - owner (string): Repository owner
  - repo (string): Repository name
  - pull_number (number): Pull request number
  - event ('APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'): Review action
  - body (string): Review comment (optional for APPROVE)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Created review confirmation.

Examples:
  - Approve PR: owner="myorg", repo="project", pull_number=42, event="APPROVE"
  - Request changes: owner="myorg", repo="project", pull_number=42, event="REQUEST_CHANGES", body="Please fix..."
  - Comment: owner="myorg", repo="project", pull_number=42, event="COMMENT", body="Looks good, but..."

Error Handling:
  - Returns error if PR not found
  - Returns error if no permission to review
  - Requires GITHUB_TOKEN with repo access`,
      inputSchema: CreatePRReviewInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreatePRReviewInput) => {
      try {
        const review = await client.createPullRequestReview(
          params.owner,
          params.repo,
          params.pull_number,
          params.event,
          params.body
        );

        const formatMarkdown = (data: any) => {
          const actionLabels: Record<string, string> = {
            APPROVE: "✅ Approved",
            REQUEST_CHANGES: "🔄 Changes Requested",
            COMMENT: "💬 Commented"
          };
          return [
            `# ${actionLabels[params.event]}`,
            "",
            `**PR**: #${params.pull_number} in ${params.owner}/${params.repo}`,
            params.body ? `\n**Comment**:\n${params.body}` : ""
          ].filter(Boolean).join("\n");
        };

        const { text, structured: structuredContent } = formatResponse(review, params.response_format, formatMarkdown);

        return {
          content: [{ type: "text", text }],
          structuredContent: structuredContent as unknown as { [key: string]: unknown }
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
