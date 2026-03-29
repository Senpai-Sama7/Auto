# DevIntelligence MCP Server

The ultimate Development Environment Intelligence MCP Server - an AI-powered development companion that enables LLMs to interact with your entire development environment.

## Features

### 🗂️ File System Tools
- `fs_read_file` - Read files with line offset and limit
- `fs_write_file` - Write or append to files
- `fs_list_directory` - List directory contents recursively
- `fs_search_files` - Search files by glob patterns
- `fs_get_file_info` - Get detailed file metadata

### 🐚 Shell Execution Tools
- `shell_execute` - Execute shell commands with safety checks
- `shell_stream_command` - Stream output from long-running commands

### 🐙 GitHub Integration
- `github_search_repos` - Search repositories with advanced filters
- `github_get_repo` - Get repository details
- `github_list_issues` - List and filter issues
- `github_create_issue` - Create new issues
- `github_update_issue` - Update existing issues
- `github_list_pull_requests` - List pull requests
- `github_get_pull_request` - Get PR details
- `github_create_pull_request_review` - Review PRs

### 🗄️ Database Tools
- `db_query_sqlite` - Execute SQL queries on SQLite databases
- `db_list_tables` - List all tables in a database
- `db_get_table_schema` - Get table schema details

### 🔍 Search Tools
- `search_grep` - Search file contents with regex patterns
- `search_find_definitions` - Find symbol definitions in code

## Installation

```bash
# Clone or create the project directory
cd devintelligence-mcp-server

# Install dependencies
npm install

# Build the TypeScript
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Recommended | GitHub personal access token for API access |
| `TRANSPORT` | No | Transport type: `stdio` (default) or `http` |
| `PORT` | No | HTTP port when using HTTP transport (default: 3000) |

### GitHub Token

Create a GitHub personal access token at https://github.com/settings/tokens with these scopes:
- `repo` - Full repository access (for private repos)
- `public_repo` - Public repository access (minimum)

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

## Usage

### Local Mode (stdio)

For local development and CLI integration:

```bash
# Run directly
npm start

# Or with tsx for development
npm run dev
```

### HTTP Mode

For remote access or web service deployment:

```bash
export TRANSPORT=http
export PORT=3000
npm start
```

The server will be available at `http://localhost:3000/mcp`

### MCP Client Configuration

Add to your MCP client configuration (e.g., Claude Desktop, Kimi CLI):

```json
{
  "mcpServers": {
    "devintelligence": {
      "command": "node",
      "args": ["/path/to/devintelligence-mcp-server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Tool Reference

### File System

#### fs_read_file
Read file contents with optional line offset and limit.

```json
{
  "path": "src/index.ts",
  "offset": 0,
  "limit": 50,
  "response_format": "markdown"
}
```

#### fs_write_file
Write or append to files.

```json
{
  "path": "output.txt",
  "content": "Hello, World!",
  "append": false,
  "create_directories": true
}
```

#### fs_list_directory
List directory contents.

```json
{
  "path": "./src",
  "recursive": true,
  "include_hidden": false
}
```

### Shell

#### shell_execute
Execute shell commands safely.

```json
{
  "command": "git status",
  "cwd": "./my-project",
  "timeout": 30000
}
```

### GitHub

#### github_search_repos
Search for repositories.

```json
{
  "query": "language:typescript stars:>1000",
  "sort": "stars",
  "limit": 20
}
```

#### github_create_issue
Create a new issue.

```json
{
  "owner": "myorg",
  "repo": "project",
  "title": "Bug: Login not working",
  "body": "Description of the bug...",
  "labels": ["bug", "priority-high"]
}
```

### Database

#### db_query_sqlite
Execute SQL queries.

```json
{
  "db_path": "data.db",
  "query": "SELECT * FROM users WHERE active = ?",
  "params": [1],
  "limit": 20
}
```

### Search

#### search_grep
Search file contents.

```json
{
  "pattern": "TODO|FIXME",
  "path": "./src",
  "include": "*.ts",
  "case_sensitive": false,
  "limit": 20
}
```

#### search_find_definitions
Find symbol definitions.

```json
{
  "symbol": "calculateTotal",
  "language": "typescript",
  "path": "./src"
}
```

## Safety Features

- **Command Safety**: Dangerous shell commands (rm -rf /, mkfs, etc.) are blocked
- **Timeout Protection**: Shell commands have configurable timeouts
- **Path Validation**: File paths are resolved and validated
- **SQL Injection Protection**: Database queries use prepared statements
- **Character Limits**: Responses are truncated to prevent context overflow

## Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Build for production
npm run build

# Type check without emitting
npm run lint

# Clean build artifacts
npm run clean
```

## Architecture

```
src/
├── index.ts           # Main entry point
├── constants.ts       # Shared constants
├── types.ts           # TypeScript types
├── services/          # Shared utilities
│   ├── formatters.ts  # Response formatting
│   ├── errors.ts      # Error handling
│   └── github.ts      # GitHub API client
└── tools/             # Tool implementations
    ├── filesystem.ts  # File system tools
    ├── shell.ts       # Shell execution tools
    ├── github.ts      # GitHub tools
    ├── database.ts    # Database tools
    └── search.ts      # Search tools
```

## License

MIT
