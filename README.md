# oc-cli

[![npm version](https://img.shields.io/npm/v/oc-agent-cli)](https://www.npmjs.com/package/oc-agent-cli)
[![license](https://img.shields.io/npm/l/oc-agent-cli)](./LICENSE)
[![node](https://img.shields.io/node/v/oc-agent-cli)](https://nodejs.org/)

A command-line interface for managing remote codebases through [OpenCode](https://opencode.ai) agents.

Built for AI agents and automation pipelines. Default output is compact JSON (one line, easy to parse). Humans get `--pretty` tables with colors.

## Why oc-cli?

OpenCode gives you AI coding agents. **oc-cli** makes them scriptable.

- **Orchestrate multiple agents** — spin up sessions across different projects, send prompts, and collect results from a single terminal or script.
- **Run ralph loops with claw bots** — automate repeated agent workflows (create session, prompt, watch, extract result) without manual intervention.
- **Pipe JSON everywhere** — every command outputs machine-readable JSON by default, so you can chain `oc-cli` with `jq`, other CLIs, or feed output directly into another LLM.
- **Remote-first** — designed to talk to OpenCode servers over the network, not just localhost. Pair with [Tailscale](#setup-guide-opencode-server--tailscale) for secure access to remote machines.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features](#features)
- [Configuration](#configuration)
  - [Profiles](#profiles)
  - [Managing Profiles](#managing-profiles)
  - [Global Config](#global-config)
  - [Environment Variables](#environment-variables)
  - [Priority Order](#priority-order)
- [Commands](#commands)
  - [Global Options](#global-options)
  - [session list](#session-list)
  - [session create](#session-create)
  - [session delete](#session-delete)
  - [session messages](#session-messages)
  - [session prompt](#session-prompt)
  - [session permit](#session-permit)
  - [session answer](#session-answer)
  - [session reject](#session-reject)
  - [models](#models)
  - [watch](#watch)
- [Output Format](#output-format)
- [Setup Guide: OpenCode Server + Tailscale](#setup-guide-opencode-server--tailscale)
- [Development](#development)
- [Requirements](#requirements)
- [Useful Links](#useful-links)
- [License](#license)

## Installation

### From npm

```bash
npm install -g oc-agent-cli
```

### From source

```bash
git clone https://github.com/anomalyco/oc-cli.git
cd oc-cli
npm install
npm run build
npm link
```

## Quick Start

```bash
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

### End-to-end workflow

Chain commands together using JSON output and `jq`:

```bash
# Create a session, capture the ID, prompt it, and watch
SESSION=$(oc-cli session create -t "Fix null check" | jq -r '.id')
oc-cli session prompt "$SESSION" "Fix the null pointer in auth.ts line 42"
oc-cli watch -s "$SESSION" --pretty

# When done, read the final messages
oc-cli session messages "$SESSION" --fields role,text --pretty
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

**Title prefix:** The global `titlePrefix` is combined with the profile name to tag sessions. With `titlePrefix: "[my-agent]"` and profile `my-project`, sessions are created with title prefix `[my-agent][my-project] `. See [`--mine`](#session-list) to filter sessions by this prefix.

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

| Variable          | Overrides            |
| ----------------- | -------------------- |
| `OC_BASE_URL`     | Profile's `baseUrl`  |
| `OC_TITLE_PREFIX` | Global `titlePrefix` |

### Priority Order

CLI flags > environment variables > profile values > defaults.

## Commands

### Global Options

| Flag                      | Description                      |
| ------------------------- | -------------------------------- |
| `-p, --profile <name>`    | Select a configuration profile   |
| `--base-url <url>`        | Override the server URL          |
| `--title-prefix <prefix>` | Override the global title prefix |
| `-V, --version`           | Print version                    |
| `-h, --help`              | Print help                       |

### session list

List all sessions.

```bash
oc-cli session list
oc-cli session list --mine              # Only sessions matching your title prefix
oc-cli session list --pretty            # Human-readable table
oc-cli session list --fields id,title   # Only specific fields
oc-cli session list --filter title=auth # Filter rows
```

| Flag                   | Description                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `--mine`               | Only show sessions matching the configured [title prefix](#profiles) for the active profile |
| `--pretty`             | Output as a human-readable table                                                            |
| `--fields <fields>`    | Comma-separated list of fields to include                                                   |
| `--filter <key=value>` | Filter rows (case-insensitive contains, repeatable)                                         |

### session create

Create a new session.

```bash
oc-cli session create --title "Fix the login bug"
oc-cli session create --title "Refactor" --directory /path/to/project
```

| Flag                 | Short | Description                                    |
| -------------------- | ----- | ---------------------------------------------- |
| `--title <title>`    | `-t`  | Session title (title prefix is auto-prepended) |
| `--directory <path>` | `-d`  | Working directory for the session              |
| `--pretty`           |       | Human-readable table output                    |
| `--fields <fields>`  |       | Comma-separated list of fields to include      |

### session delete

Delete a session and its messages.

```bash
oc-cli session delete <session-id>
```

### session messages

List messages in a session.

```bash
oc-cli session messages <session-id>
oc-cli session messages <session-id> --pretty
```

| Flag                   | Description                               |
| ---------------------- | ----------------------------------------- |
| `--pretty`             | Human-readable table output               |
| `--fields <fields>`    | Comma-separated list of fields to include |
| `--filter <key=value>` | Filter rows (repeatable)                  |

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

| Flag                       | Short | Description                                                 |
| -------------------------- | ----- | ----------------------------------------------------------- |
| `--file <path>`            | `-f`  | Read prompt text from a file                                |
| `--stdin`                  |       | Read prompt text from piped stdin                           |
| `--model <provider/model>` | `-m`  | Override the LLM model                                      |
| `--agent <name>`           |       | Override the agent (falls back to profile's `defaultAgent`) |
| `--tools <json>`           |       | JSON map of tool name to enabled boolean                    |
| `--no-reply`               |       | Send message without triggering agent response              |

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

| Flag                   | Description                               |
| ---------------------- | ----------------------------------------- |
| `--all`                | Show all providers, not just enabled ones |
| `--pretty`             | Human-readable table output               |
| `--fields <fields>`    | Comma-separated list of fields            |
| `--filter <key=value>` | Filter rows (repeatable)                  |

### watch

Stream real-time SSE events from the server.

```bash
oc-cli watch                             # All events for the project
oc-cli watch -s <session-id>             # Events for one session
oc-cli watch --pretty                    # Human-readable streaming output
oc-cli watch --global                    # Cross-instance events
oc-cli watch --type message.part.delta   # Filter by event type
```

| Flag                 | Short | Description                         |
| -------------------- | ----- | ----------------------------------- |
| `--session <id>`     | `-s`  | Filter events to a specific session |
| `--global`           |       | Watch events from all instances     |
| `--directory <path>` | `-d`  | Directory to watch events for       |
| `--pretty`           |       | Human-readable formatted output     |
| `--type <types>`     |       | Comma-separated event types to show |

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

## Setup Guide: OpenCode Server + Tailscale

This section covers running an [OpenCode](https://opencode.ai) server on a remote machine and accessing it securely via [Tailscale](https://tailscale.com) from your local machine.

### 1. Run OpenCode Server on Remote Machine

On your remote machine (the one with the codebase), start the OpenCode server:

```bash
# Using the web interface (default port 4096)
opencode web

# Or use serve for headless operation
opencode serve --port 4096
```

> **Note:** Check the [OpenCode docs](https://opencode.ai/docs) for whether your version serves over HTTP or HTTPS by default, and for full server configuration options.

### 2. Set up Tailscale on Both Machines

Install [Tailscale](https://tailscale.com/install) on both your local and remote machines:

```bash
# On macOS
brew install tailscale

# On Linux
curl -fsSL https://tailscale.com/install.sh | sh
```

Start Tailscale and authenticate:

```bash
sudo tailscale up
```

Once connected, both machines are on the same private Tailscale network (tailnet). Traffic is encrypted end-to-end via WireGuard.

### 3. Get Your Remote Machine's Tailscale IP

On the remote machine, find the Tailscale IP:

```bash
tailscale ip -4
# e.g. 100.64.0.12
```

### 4. Connect from Local Machine

Add the remote machine's Tailscale IP to your oc-cli profile:

```bash
oc-cli profile add my-remote \
  --url http://100.64.0.12:4096 \
  --directory /home/user/my-project
```

Verify the connection:

```bash
oc-cli session list -p my-remote
```

### Alternative: Use Tailscale Serve

Instead of connecting via raw IP, you can use [`tailscale serve`](https://tailscale.com/kb/1242/tailscale-serve) to expose the OpenCode server under a stable hostname with automatic HTTPS:

```bash
# On the remote machine, proxy port 4096 via Tailscale
tailscale serve https / http://localhost:4096
```

Then connect using your machine's Tailscale hostname:

```bash
oc-cli profile add my-remote \
  --url https://my-remote-machine.tail12345.ts.net \
  --directory /home/user/my-project
```

This gives you a valid HTTPS certificate without any manual cert management.

## Development

```bash
# Clone and install
git clone https://github.com/anomalyco/oc-cli.git
cd oc-cli
npm install

# Run from source (no build needed)
npm run dev -- session list --pretty

# Build
npm run build

# Lint and format
npm run lint
npm run format:check

# Verify before committing
npm run lint && npm run format:check && npm run build
```

## Requirements

- Node.js >= 18
- An [OpenCode](https://opencode.ai) server

## Useful Links

| Resource          | Link                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| npm package       | [npmjs.com/package/oc-agent-cli](https://www.npmjs.com/package/oc-agent-cli) |
| OpenCode          | [opencode.ai](https://opencode.ai)                                           |
| OpenCode docs     | [opencode.ai/docs](https://opencode.ai/docs)                                 |
| Tailscale         | [tailscale.com](https://tailscale.com)                                       |
| Tailscale install | [tailscale.com/install](https://tailscale.com/install)                       |
| Tailscale Serve   | [tailscale.com/kb/1242](https://tailscale.com/kb/1242/tailscale-serve)       |

## License

MIT
