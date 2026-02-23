# oc-cli Documentation

`oc-cli` is a CLI tool that wraps the `@opencode-ai/sdk` to manage remote OpenCode sessions and agents. Its default output is compact JSON designed for LLM/agent consumption, with optional human-readable table output.

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd oc-cli

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link globally so you can run `oc-cli` from anywhere
npm link
```

After linking, the `oc-cli` command is available globally in your terminal.

## Quick Start

```bash
# Check it works
oc-cli --version

# List sessions
oc-cli session list

# Human-readable output
oc-cli session list --pretty

# Create a session
oc-cli session create --title "My task"

# See available models
oc-cli models --pretty

# Configure a title prefix
oc-cli config set titlePrefix "[bot] "

# Now all created sessions get the prefix
oc-cli session create --title "fix bug"   # title becomes "[bot] fix bug"

# List only your prefixed sessions
oc-cli session list --mine
```

## Documentation Index

- [Commands Reference](commands.md) - All available commands and their options
- [Configuration](configuration.md) - Config file, environment variables, and CLI flags
- [Output Formatting](output-formatting.md) - JSON, tables, field filtering, and row filtering

## Project Structure

```
oc-cli/
├── package.json                    # name: oc-cli, type: module, bin field
├── tsconfig.json                   # target: ES2022, module: Node16, strict
├── bin/
│   └── oc-cli.js                   # Shim entry point with shebang
├── src/
│   ├── index.ts                    # CLI entry point, Commander program, global options
│   ├── commands/
│   │   ├── session.ts              # session list, create, delete, messages
│   │   ├── models.ts               # models (enabled providers, --all for everything)
│   │   └── config.ts               # config set, get, list, path
│   └── lib/
│       ├── client.ts               # SDK client setup via getClient(baseUrl)
│       ├── config.ts               # Config loading, saving, resolution, source tracking
│       └── output.ts               # Output formatting: JSON, tables, filtering
└── dist/                           # Compiled JS output
```

## Tech Stack

- **TypeScript** with Node16 ESM modules
- **Commander** for CLI argument parsing
- **chalk** for terminal colors
- **@opencode-ai/sdk** for OpenCode server communication
