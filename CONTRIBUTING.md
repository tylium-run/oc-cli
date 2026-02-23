# Contributing to oc-cli

## Prerequisites

- Node.js >= 18
- npm
- An OpenCode server to test against

## Setup

```bash
git clone https://github.com/tylium-run/oc-cli.git
cd oc-cli
npm install
npm run build
npm link    # Makes `oc-cli` available globally for testing
```

## Development

```bash
# Run from source (no build step needed)
npm run dev -- session list

# Build compiled output
npm run build

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check
```

## Project Structure

```
src/
├── index.ts              # CLI entry point, Commander setup, global options
├── commands/
│   ├── session.ts        # Session management + prompt command
│   ├── profile.ts        # Profile CRUD commands
│   ├── models.ts         # Model listing
│   ├── config.ts         # Global config management
│   └── watch.ts          # SSE event streaming
└── lib/
    ├── client.ts         # OpenCode SDK client factory
    ├── config.ts         # Config file I/O, profile resolution
    ├── output.ts         # JSON/table output, field filtering, row filtering
    └── format-event.ts   # Stateful SSE event formatter for --pretty watch
```

## Conventions

- **Output format**: Commands output compact JSON to stdout by default. Errors go to stderr as `{"error": "message"}`.
- **TypeScript**: Strict mode enabled. Imports use `.js` extensions (Node16 ESM requirement).
- **Code style**: Enforced by ESLint + Prettier. Run `npm run lint` and `npm run format:check` before submitting.
- **SDK**: Uses `@opencode-ai/sdk/v2` (flat parameter style, not the v1 nested `{path, body, query}` style).

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes
4. Run `npm run lint` and `npm run format:check`
5. Run `npm run build` to verify compilation
6. Commit with a clear message describing the change
7. Open a pull request
