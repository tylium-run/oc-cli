# oc-cli

A command-line interface for managing remote codebases through [OpenCode](https://opencode.ai) agents.

Built for AI agents and automation pipelines. Default output is compact JSON (one line, easy to parse). Humans get `--pretty` tables with colors.

## Quick Start

```bash
# Install globally
npm install -g oc-cli

# Add a profile (connects to your OpenCode server)
oc-cli profile add my-project \
  --url https://my-server:4096 \
  --directory /path/to/project

# List sessions
oc-cli session list

# Create a session and send a prompt
oc-cli session create --title "Fix auth bug"
oc-cli session prompt <session-id> "Fix the login validation in auth.ts"

# Watch the agent work in real-time
oc-cli watch -s <session-id> --pretty
```

## Features

- **Profile-based configuration** — manage multiple servers and projects
- **Session management** — create, list, delete, inspect messages
- **Send prompts** — inline text, from file (`--file`), or piped stdin (`--stdin`)
- **Real-time streaming** — watch SSE events as the agent works
- **Agent interaction** — respond to permission requests and questions
- **Model override** — switch models per-prompt with `--model`
- **JSON-first output** — compact JSON by default for LLM/agent consumption
- **Human-friendly mode** — `--pretty` for colored tables, `--fields` and `--filter` for narrowing output

## Configuration

### Profiles

Every operation requires a profile. Profiles are stored in `~/.oc-cli.json`:

```json
{
  "titlePrefix": "[my-agent]",
  "profiles": {
    "my-project": {
      "baseUrl": "https://my-server:4096",
      "directory": "/path/to/project",
      "defaultAgent": "coder",
      "description": "My project backend",
      "tags": ["backend", "api"]
    }
  }
}
```

**Profile selection:**

- If only one profile exists, it is selected automatically.
- If multiple profiles exist, use `-p <name>` to select one.
- If no profiles exist, you are prompted to create one.

**Title prefix:** The global `titlePrefix` is combined with the profile name to tag sessions. With `titlePrefix: "[my-agent]"` and profile `my-project`, sessions are created with title prefix `[my-agent][my-project] `.

### Managing Profiles

```bash
# Add a profile
oc-cli profile add my-project --url https://server:4096 --directory /path

# Add interactively (prompts for each field)
oc-cli profile add my-project

# List all profiles
oc-cli profile list
oc-cli profile list --pretty

# Show a specific profile
oc-cli profile show my-project

# Update a field
oc-cli profile set my-project defaultAgent coder

# Remove a profile
oc-cli profile remove my-project
```

### Global Config

```bash
# Set the shared title prefix
oc-cli config set titlePrefix "[my-agent]"

# View current config
oc-cli config list

# Show config file path
oc-cli config path
```

### Environment Variables

| Variable | Overrides |
|---|---|
| `OC_BASE_URL` | Profile's `baseUrl` |
| `OC_TITLE_PREFIX` | Global `titlePrefix` |

### Priority Order

CLI flags > environment variables > profile values > defaults.

## Commands

### Global Options

| Flag | Description |
|---|---|
| `-p, --profile <name>` | Select a configuration profile |
| `--base-url <url>` | Override the server URL |
| `--title-prefix <prefix>` | Override the global title prefix |
| `-V, --version` | Print version |
| `-h, --help` | Print help |

### session list

List all sessions.

```bash
oc-cli session list
oc-cli session list --mine              # Only sessions matching your title prefix
oc-cli session list --pretty            # Human-readable table
oc-cli session list --fields id,title   # Only specific fields
oc-cli session list --filter title=auth # Filter rows
```

| Flag | Description |
|---|---|
| `--mine` | Only show sessions matching the configured title prefix |
| `--pretty` | Output as a human-readable table |
| `--fields <fields>` | Comma-separated list of fields to include |
| `--filter <key=value>` | Filter rows (case-insensitive contains, repeatable) |

### session create

Create a new session.

```bash
oc-cli session create --title "Fix the login bug"
oc-cli session create --title "Refactor" --directory /path/to/project
```

| Flag | Short | Description |
|---|---|---|
| `--title <title>` | `-t` | Session title (title prefix is auto-prepended) |
| `--directory <path>` | `-d` | Working directory for the session |
| `--pretty` | | Human-readable table output |
| `--fields <fields>` | | Comma-separated list of fields to include |

### session delete

```bash
oc-cli session delete <session-id>
```

### session messages

List messages in a session.

```bash
oc-cli session messages <session-id>
oc-cli session messages <session-id> --pretty
```

| Flag | Description |
|---|---|
| `--pretty` | Human-readable table output |
| `--fields <fields>` | Comma-separated list of fields to include |
| `--filter <key=value>` | Filter rows (repeatable) |

### session prompt

Send a prompt message to a session. Fire-and-forget — use `watch` to see the response.

```bash
# Inline text
oc-cli session prompt <session-id> "Fix the login bug"

# From a file
oc-cli session prompt <session-id> --file ./prompt.txt

# From stdin
echo "Fix it" | oc-cli session prompt <session-id> --stdin

# With model override
oc-cli session prompt <session-id> "Explain this code" --model google/gemini-2.5-pro

# With a specific agent
oc-cli session prompt <session-id> "Review the PR" --agent reviewer
```

| Flag | Short | Description |
|---|---|---|
| `--file <path>` | `-f` | Read prompt text from a file |
| `--stdin` | | Read prompt text from piped stdin |
| `--model <provider/model>` | `-m` | Override the LLM model |
| `--agent <name>` | | Override the agent (falls back to profile's `defaultAgent`) |
| `--tools <json>` | | JSON map of tool name to enabled boolean |
| `--no-reply` | | Send message without triggering agent response |

### session permit

Respond to a permission request from the agent.

```bash
oc-cli session permit <request-id>          # Default: once
oc-cli session permit <request-id> always
oc-cli session permit <request-id> reject
```

### session answer

Answer a question from the agent.

```bash
oc-cli session answer <request-id> "yes"
oc-cli session answer <request-id> "option1" "option2"
```

### session reject

Reject/dismiss a question from the agent.

```bash
oc-cli session reject <request-id>
```

### models

List available LLM models.

```bash
oc-cli models                # Enabled providers only
oc-cli models --all          # All providers on the server
oc-cli models --pretty       # Human-readable table
```

| Flag | Description |
|---|---|
| `--all` | Show all providers, not just enabled ones |
| `--pretty` | Human-readable table output |
| `--fields <fields>` | Comma-separated list of fields |
| `--filter <key=value>` | Filter rows (repeatable) |

### watch

Stream real-time SSE events from the server.

```bash
oc-cli watch                             # All events for the project
oc-cli watch -s <session-id>             # Events for one session
oc-cli watch --pretty                    # Human-readable streaming output
oc-cli watch --global                    # Cross-instance events
oc-cli watch --type message.part.delta   # Filter by event type
```

| Flag | Short | Description |
|---|---|---|
| `--session <id>` | `-s` | Filter events to a specific session |
| `--global` | | Watch events from all instances |
| `--directory <path>` | `-d` | Directory to watch events for |
| `--pretty` | | Human-readable formatted output |
| `--type <types>` | | Comma-separated event types to show |

### profile list / show / add / remove / set

See [Managing Profiles](#managing-profiles) above.

### config set / get / list / path

See [Global Config](#global-config) above.

## Output Format

### JSON (default)

All commands output compact JSON to stdout. Errors go to stderr as `{"error": "message"}`.

```bash
$ oc-cli session list --fields id,title
[{"id":"ses_abc123","title":"Fix auth bug"},{"id":"ses_def456","title":"Refactor"}]
```

### Pretty tables (`--pretty`)

Human-readable tables with colors.

```bash
$ oc-cli session list --pretty
ID                            SLUG              TITLE
---------------------------------------------------------------------------
ses_abc123                    eager-star        Fix auth bug
ses_def456                    calm-moon         Refactor

2 results
```

### Field filtering (`--fields`)

Reduce output to specific fields. Useful for saving tokens when consumed by LLMs.

```bash
$ oc-cli session list --fields id,title
```

### Row filtering (`--filter`)

Filter rows by field values. Case-insensitive contains match. Repeatable (AND logic). Supports dot notation for nested fields.

```bash
$ oc-cli session list --filter title=auth --filter title=fix
```

## Requirements

- Node.js >= 18
- An [OpenCode](https://opencode.ai) server

## License

MIT
