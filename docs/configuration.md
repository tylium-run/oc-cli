# Configuration

oc-cli uses a layered config system. Multiple sources are merged with a clear priority order, where higher-priority sources override lower ones.

## Config Values

| Key | Default | Description |
|-----|---------|-------------|
| `baseUrl` | `https://devs-mac-mini.taild2246a.ts.net:4096` | OpenCode server URL |
| `titlePrefix` | `""` (empty) | Prefix auto-prepended to session titles |

## Priority Layers

Config is resolved by merging four layers. Highest priority wins:

| Priority | Layer | How to set |
|----------|-------|------------|
| 1 (highest) | CLI flags | `--base-url <url>`, `--title-prefix <prefix>` |
| 2 | Environment variables | `OC_BASE_URL`, `OC_TITLE_PREFIX` |
| 3 | Config file | `~/.oc-cli.json` |
| 4 (lowest) | Hardcoded defaults | Built into the code |

### Example: all four layers

```bash
# Layer 4: default baseUrl is https://devs-mac-mini.taild2246a.ts.net:4096

# Layer 3: config file overrides default
oc-cli config set baseUrl "https://server-a:4096"
oc-cli config get baseUrl
# {"baseUrl":"https://server-a:4096","source":"config file"}

# Layer 2: env var overrides config file
OC_BASE_URL="https://server-b:4096" oc-cli config get baseUrl
# {"baseUrl":"https://server-b:4096","source":"env (OC_BASE_URL)"}

# Layer 1: CLI flag overrides everything
OC_BASE_URL="https://server-b:4096" oc-cli --base-url "https://server-c:4096" config get baseUrl
# {"baseUrl":"https://server-c:4096","source":"cli flag"}
```

## Config File

**Location:** `~/.oc-cli.json`

The config file is a simple JSON object. It is only created when you first run `oc-cli config set`. You can also edit it by hand.

```json
{
  "baseUrl": "https://devs-mac-mini.taild2246a.ts.net:4096",
  "titlePrefix": "[bot] "
}
```

Find the file path with:
```bash
oc-cli config path
# {"path":"/Users/<you>/.oc-cli.json"}
```

### Partial configs are fine

You only need to include keys you want to override. Missing keys fall through to defaults:

```json
{
  "titlePrefix": "[bot] "
}
```

Here `baseUrl` will use the hardcoded default since it's not in the file.

## Environment Variables

| Variable | Maps to | Example |
|----------|---------|---------|
| `OC_BASE_URL` | `baseUrl` | `export OC_BASE_URL="https://my-server:4096"` |
| `OC_TITLE_PREFIX` | `titlePrefix` | `export OC_TITLE_PREFIX="[ci] "` |

Useful for CI/CD pipelines or per-shell overrides:

```bash
# Set for the current shell session
export OC_TITLE_PREFIX="[deploy] "
oc-cli session create --title "release v2.0"
# Creates session with title: "[deploy] release v2.0"
```

## CLI Flags

Global flags available on every command:

| Flag | Maps to |
|------|---------|
| `--base-url <url>` | `baseUrl` |
| `--title-prefix <prefix>` | `titlePrefix` |

These have the highest priority and are useful for one-off overrides:

```bash
# Connect to a different server for one command
oc-cli --base-url "https://staging:4096" session list

# Override prefix for one session
oc-cli --title-prefix "[urgent] " session create --title "fix prod"
```

## Managing Config

```bash
# View all config with sources
oc-cli config list --pretty

# Set a value
oc-cli config set titlePrefix "[bot] "

# Get a single value (shows source)
oc-cli config get titlePrefix --pretty

# See where the config file lives
oc-cli config path
```

### Validation

`config set` only accepts known keys. Unknown keys are rejected:

```bash
oc-cli config set unknownKey "value"
# stderr: {"error":"Unknown config key: \"unknownKey\". Valid keys: baseUrl, titlePrefix"}
```

## Title Prefix Behavior

The `titlePrefix` config has two effects:

### 1. Auto-prepend on session create

When a `titlePrefix` is set, `session create` automatically prepends it to the `--title` value:

```bash
oc-cli config set titlePrefix "[bot] "
oc-cli session create --title "fix login bug"
# Creates session with title: "[bot] fix login bug"

oc-cli session create
# Creates session with title: "[bot]" (trailing space trimmed when no title follows)
```

### 2. Filter with --mine on session list

The `--mine` flag on `session list` filters to sessions whose title starts with the configured prefix:

```bash
oc-cli session list --mine --pretty
# Only shows sessions with titles starting with "[bot] "
```

If no prefix is configured, `--mine` returns an error telling you to set one.
