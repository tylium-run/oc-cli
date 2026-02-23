# Commands Reference

All commands output compact JSON by default (single line, no extra whitespace). Use `--pretty` for human-readable table output with colors.

## Global Options

These options are available on every command and override config file and environment variable values.

| Option | Description |
|--------|-------------|
| `--base-url <url>` | Override the OpenCode server URL |
| `--title-prefix <prefix>` | Override the session title prefix |
| `--version` | Show version number |
| `--help` | Show help |

```bash
# Example: connect to a different server for one command
oc-cli --base-url "https://other-server:4096" session list
```

---

## session

Manage OpenCode sessions.

### session list

List all sessions.

```bash
oc-cli session list
oc-cli session list --pretty
oc-cli session list --mine
oc-cli session list --fields id,title
oc-cli session list --filter title=Linear
```

| Option | Description |
|--------|-------------|
| `--mine` | Only show sessions whose title starts with the configured `titlePrefix` |
| `--pretty` | Output as a human-readable table |
| `--fields <fields>` | Comma-separated list of fields to include in output |
| `--filter <key=value>` | Filter rows by value (case-insensitive contains match, repeatable) |

**Default JSON output fields:** `id`, `slug`, `title` (plus all other fields from the API)

**`--mine` behavior:** Requires a `titlePrefix` to be configured. Filters sessions to only those whose title starts with the prefix. Errors if no prefix is set.

### session create

Create a new session.

```bash
oc-cli session create
oc-cli session create --title "Fix the login bug"
oc-cli session create --title "Refactor auth" --directory /path/to/project
oc-cli session create --pretty
```

| Option | Description |
|--------|-------------|
| `-t, --title <title>` | Session title |
| `-d, --directory <path>` | Working directory for the session |
| `--pretty` | Output as a human-readable table |
| `--fields <fields>` | Comma-separated list of fields to include |

**Title prefix behavior:** If a `titlePrefix` is configured (via config file, env var, or `--title-prefix` flag), it is automatically prepended to the title:
- `--title "my task"` with prefix `[bot] ` becomes `[bot] my task`
- No `--title` with prefix `[bot] ` becomes `[bot]` (trailing space trimmed)

### session delete

Delete a session by ID.

```bash
oc-cli session delete ses_abc123
```

**Arguments:**
- `<id>` (required) - The session ID to delete

**Output:** `{"deleted": "<id>"}`

### session messages

List messages in a session.

```bash
oc-cli session messages ses_abc123
oc-cli session messages ses_abc123 --pretty
oc-cli session messages ses_abc123 --filter role=user
```

**Arguments:**
- `<id>` (required) - The session ID

| Option | Description |
|--------|-------------|
| `--pretty` | Output as a human-readable table |
| `--fields <fields>` | Comma-separated list of fields to include |
| `--filter <key=value>` | Filter rows by value (repeatable) |

---

## models

List available AI models.

```bash
oc-cli models
oc-cli models --pretty
oc-cli models --all
oc-cli models --filter provider=anthropic
```

| Option | Description |
|--------|-------------|
| `--all` | Show all providers/models on the server (not just enabled ones) |
| `--pretty` | Output as a human-readable table |
| `--fields <fields>` | Comma-separated list of fields to include |
| `--filter <key=value>` | Filter rows by value (repeatable) |

**Default behavior:** Shows only enabled/configured providers with their models. A `default` column marks each provider's default model with `yes`.

**`--all` behavior:** Shows every provider and model available on the server. The `default` column is hidden since defaults only apply to enabled providers.

---

## config

Manage oc-cli configuration.

### config set

Set a config value in the config file (`~/.oc-cli.json`).

```bash
oc-cli config set baseUrl "https://my-server:4096"
oc-cli config set titlePrefix "[bot] "
```

**Arguments:**
- `<key>` (required) - Config key. Valid keys: `baseUrl`, `titlePrefix`
- `<value>` (required) - Value to set

**Output:** `{"<key>": "<value>"}`

Errors if the key is not recognized.

### config get

Show the resolved value for a config key, including which layer it came from.

```bash
oc-cli config get baseUrl
oc-cli config get titlePrefix --pretty
```

**Arguments:**
- `<key>` (required) - Config key to look up

| Option | Description |
|--------|-------------|
| `--pretty` | Show value with source label inline |

**Default output:** `{"<key>": "<value>", "source": "<layer>"}`

**Source values:** `cli flag`, `env (OC_BASE_URL)`, `config file`, `default`

### config list

Show all resolved config values with their sources.

```bash
oc-cli config list
oc-cli config list --pretty
```

| Option | Description |
|--------|-------------|
| `--pretty` | Output as a human-readable table |
| `--fields <fields>` | Comma-separated list of fields to include |

### config path

Print the config file path.

```bash
oc-cli config path
```

**Output:** `{"path": "/Users/<you>/.oc-cli.json"}`

---

## Error Handling

All errors are output as JSON to stderr and the process exits with code 1:

```json
{"error": "error message here"}
```

Examples:
```bash
# Unknown config key
oc-cli config set badKey "value"
# stderr: {"error":"Unknown config key: \"badKey\". Valid keys: baseUrl, titlePrefix"}

# Server unreachable
oc-cli --base-url "http://localhost:9999" session list
# stderr: {"error":"fetch failed"}

# --mine without a prefix configured
oc-cli session list --mine
# stderr: {"error":"Cannot use --mine: no titlePrefix is configured..."}
```
