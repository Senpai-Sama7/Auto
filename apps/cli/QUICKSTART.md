# Ultimate System CLI - Quick Start Guide

## Installation

```bash
# Make executable
chmod +x apps/cli/index.js

# Add to PATH (optional)
ln -s apps/cli/index.js /usr/local/bin/ultimate

# Enable shell completion (optional)
source apps/cli/complete.sh
```

## First Steps

### 1. Connect to Your Workspace

```bash
# Default connection
ultimate dashboard

# Custom workspace
ultimate -u http://your-workspace:4100 dashboard
```

### 2. Create Your First Task

```bash
ultimate create
```

Follow the interactive prompts:
- Enter a title for your task
- Provide a detailed description
- Choose execution mode (deterministic/provider)
- Select required capabilities
- Set budget limit

### 3. Check Task Status

```bash
# View all tasks
ultimate tasks

# View specific task
ultimate task <task-id>
```

### 4. Approve Tasks (if you have approver role)

```bash
ultimate approve
```

## Common Workflows

### Monitor System in Real-Time

```bash
ultimate monitor
```
Press `Ctrl+C` to exit.

### View Workers

```bash
ultimate workers
```

### Get Help

```bash
ultimate help
ultimate --help
```

## Configuration

Create `.ultimate.json` in your project directory:

```json
{
  "apiBase": "http://localhost:4100",
  "refreshInterval": 3000,
  "pageSize": 20
}
```

Or use environment variables:

```bash
export ULTIMATE_SYSTEM_API_BASE=http://localhost:4100
ultimate dashboard
```

## Keyboard Shortcuts (Interactive Mode)

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate options |
| `Enter` | Select option |
| `Space` | Toggle selection |
| `Esc` | Cancel/Go back |
| `Ctrl+C` | Exit monitor mode |

## Troubleshooting

### "Cannot connect to server"

- Ensure the Ultimate System server is running
- Check the API URL: `ultimate -u http://correct-url:4100 dashboard`
- Verify network connectivity

### "Authentication required"

- Sign in first: `ultimate login`
- Check your credentials with an administrator

### "Task not found"

- Verify the task ID is correct
- Check task exists: `ultimate tasks`

## Examples

### Create a Code Review Task

```bash
ultimate create
# Title: Review authentication module
# Description: Review the new auth module for security issues
# Mode: deterministic
# Capabilities: security, review
# Budget: 10
```

### Monitor Until Task Completes

```bash
ultimate monitor
# Watch for your task status changes
```

## Support

For more information, see the full documentation or contact your system administrator.
