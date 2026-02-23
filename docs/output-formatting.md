# Output Formatting

oc-cli is designed primarily for LLM/agent consumption. The default output is compact JSON. Human-readable output is available via flags.

## Output Modes

### Default: Compact JSON

All commands output a single line of JSON with no extra whitespace. This is optimized for machine parsing and saves tokens when consumed by LLMs.

```bash
oc-cli session list
# [{"id":"ses_abc123","slug":"happy-lagoon","title":"My session",...}]

oc-cli config get baseUrl
# {"baseUrl":"https://devs-mac-mini.taild2246a.ts.net:4096","source":"default"}
```

### --pretty: Human-Readable Tables

Add `--pretty` to any list/display command for a colored table with headers:

```bash
oc-cli session list --pretty
# ID                                   SLUG                  TITLE
# --------------------------------------------------------------------------------------------------------
# ses_abc123                           happy-lagoon          My session
#
# 1 result
```

Table colors:
- **Headers:** bold cyan
- **IDs:** dim (gray)
- **Slugs:** green
- **Titles/Names:** white
- **Providers:** cyan
- **Default markers:** bold green

## Filtering Flags

### --fields: Select Output Fields

Reduce output to only the fields you need. Useful for saving LLM tokens.

```bash
# Only get id and title
oc-cli session list --fields id,title
# [{"id":"ses_abc123","title":"My session"},{"id":"ses_def456","title":"Other session"}]

# Works with --pretty too
oc-cli session list --fields id,title --pretty
# ID                                   TITLE
# ---------------------------------------------------------------
# ses_abc123                           My session
#
# 1 result
```

Fields are comma-separated, no spaces. Only top-level fields are supported. Fields that don't exist in the data are silently omitted.

### --filter: Filter Rows

Filter output rows by field value. Uses case-insensitive "contains" matching.

```bash
# Sessions with "Linear" in the title
oc-cli session list --filter title=Linear

# Models from Anthropic
oc-cli models --filter provider=anthropic

# Messages from the user role
oc-cli session messages ses_abc123 --filter role=user
```

#### Repeatable (AND logic)

Use `--filter` multiple times. All conditions must match:

```bash
# Anthropic models with "sonnet" in the name
oc-cli models --filter provider=anthropic --filter model=sonnet
```

#### Dot notation for nested fields

Access nested object properties with dot notation:

```bash
oc-cli session list --filter summary.files=0
```

This resolves `item.summary.files` on each row and checks if its string representation contains `"0"`.

### Combining flags

All formatting flags can be combined:

```bash
# Pretty table, filtered to Anthropic models, showing only provider and model
oc-cli models --pretty --filter provider=anthropic --fields provider,model
```

## Error Output

Errors are always output as JSON to **stderr** (not stdout), and the process exits with code 1:

```bash
oc-cli config set badKey "value" 2>/dev/null  # suppress error
echo $?  # prints: 1
```

```bash
oc-cli config set badKey "value"
# stderr: {"error":"Unknown config key: \"badKey\". Valid keys: baseUrl, titlePrefix"}
```

This design means:
- **stdout** always contains valid data JSON (or nothing on error)
- **stderr** contains error JSON on failure
- **Exit code** is 0 for success, 1 for failure
- LLMs/scripts can reliably parse the output without mixing data and errors

## Summary Table

| Flag | Available on | Purpose |
|------|-------------|---------|
| `--pretty` | All list/display commands | Human-readable table with colors |
| `--fields <f1,f2>` | All list/display commands | Include only specified fields |
| `--filter <key=value>` | `session list`, `session messages`, `models` | Row filtering (repeatable, AND logic) |
| `--mine` | `session list` | Filter to sessions matching `titlePrefix` |
| `--all` | `models` | Show all providers, not just enabled ones |
