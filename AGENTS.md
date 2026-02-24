# AGENTS.md — Coding Agent Guidelines for oc-cli

## Project Overview

CLI tool for AI agents to manage remote codebases via OpenCode. Built with
TypeScript (strict), Commander.js, and the `@opencode-ai/sdk` (v2 API).
ESM-only (`"type": "module"` in package.json). Node.js >= 18.

## Build / Lint / Format Commands

```bash
npm run build          # Compile TypeScript via tsc → dist/
npm run dev -- <args>  # Run from source via tsx (no build needed)
npm run lint           # ESLint on src/
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier write
npm run format:check   # Prettier check (CI-style)
```

### Verification checklist (run before committing)

```bash
npm run lint && npm run format:check && npm run build
```

### Tests

There is no test framework or test files in this project. No `npm test` script
exists. If you add tests, use a framework like Vitest and add a `test` script
to `package.json`.

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
    ├── client.ts         # OpenCode SDK client factory (cached singleton)
    ├── config.ts         # Config file I/O (~/.oc-cli.json), profile resolution
    ├── output.ts         # JSON/table output, field filtering, row filtering
    └── format-event.ts   # Stateful SSE event formatter for --pretty watch
```

**Two-layer architecture:**

- `src/lib/` — shared utilities and core logic
- `src/commands/` — Commander command registration functions
- `src/index.ts` — entry point wiring everything together

## Code Style

### Formatting (Prettier — `.prettierrc`)

- **Double quotes** (not single quotes)
- **Semicolons** required
- **Trailing commas** everywhere (`"all"`)
- **100-char** line width
- **2-space** indentation

### Linting (ESLint — flat config v10)

- `@typescript-eslint/no-unused-vars`: error, but `_`-prefixed args/vars allowed
- `@typescript-eslint/no-explicit-any`: warn (not error)
- Prettier integration via `eslint-config-prettier`

### Imports

1. **External packages first**, then **`node:` builtins**, then **relative imports**,
   separated by a blank line between groups.
2. **`.js` extension required** on all relative imports (Node16 ESM):
   `import { getClient } from "../lib/client.js";`
3. **`node:` prefix required** for Node builtins: `import { readFileSync } from "node:fs";`
4. **Type-only imports** use inline `type` keyword, not separate `import type`:
   `import { resolveConfig, type Config } from "../lib/config.js";`
5. **Named imports only** — no default exports exist in the codebase.
6. **Double quotes** for all import specifiers.

### Naming Conventions

| Element            | Convention            | Example                      |
| ------------------ | --------------------- | ---------------------------- |
| Variables/params   | `camelCase`           | `baseUrl`, `cachedClient`    |
| Functions          | `camelCase`           | `getClient`, `resolveConfig` |
| Command registrars | `register*Command(s)` | `registerSessionCommands`    |
| Interfaces         | `PascalCase`          | `Config`, `Profile`          |
| Enum-like consts   | `UPPER_SNAKE_CASE`    | `PROFILE_KEYS`               |
| Files              | `kebab-case`          | `format-event.ts`            |
| Directories        | lowercase single word | `commands/`, `lib/`          |

### Types

- Use `interface` for object shapes. Use `type` only for derived/utility types
  (e.g., `type GlobalConfigKey = (typeof GLOBAL_CONFIG_KEYS)[number]`).
- Co-locate types in the module where they're used, not in separate type files.
- Use `Record<string, unknown>` for generic object types (SDK responses, etc.).
- Inline type assertions for loosely-typed SDK data:
  `let data = result.data as unknown as Record<string, unknown>[];`

### Functions

- **`function` declarations** for all top-level and exported functions.
- **Arrow functions** only for callbacks and inline closures
  (e.g., `.action(async (options) => { ... })`, `.map(...)`, `.filter(...)`).
- **Explicit return type annotations** on all exported functions.
- Config file I/O is synchronous (`readFileSync`/`writeFileSync`) by design.

### Error Handling

- Wrap entire command `.action()` body in a single `try/catch`.
- Use `printError(msg)` from `lib/output.ts` for all error exits — it outputs
  `{"error": "message"}` to stderr and calls `process.exit(1)` (return type `never`).
- Narrow errors with: `error instanceof Error ? error.message : "Unknown error"`.
- Validation errors call `printError()` directly (not thrown).
- `AbortError` (Ctrl+C) is caught and exits with code 0.
- No custom error classes — use standard `Error` and `printError()`.

### Output Philosophy

- **Default output**: compact single-line JSON to stdout (machine/LLM-friendly).
- **`--pretty` flag**: colored tables via `chalk` for human consumption.
- **Errors always** go to stderr as `{"error": "message"}`.
- Use `printData()` from `lib/output.ts` for list commands.
- Use `console.log(JSON.stringify({...}))` for single-item output.

### Comments and Documentation

- **Module-level `//` block comments** at top of every file (purpose + design rationale).
- **JSDoc `/** \*/`** on exported functions only, with `@param` tags when helpful.
- **Section dividers** using `// ---- Section Name ----` pattern within files.
- **Inline comments** explain "why" not "what".
- Comments are removed from compiled output (`removeComments: true` in tsconfig).

### Exports

- **Named exports only** — no default exports anywhere.
- Each command file exports exactly one `register*` function.
- Internal helper functions are module-private (not exported).

## Common Patterns

### Config resolution boilerplate (used in most commands)

```ts
const globalOpts = program.opts();
const overrides: CliOverrides = {};
if (globalOpts.baseUrl) overrides.baseUrl = globalOpts.baseUrl;
if (globalOpts.profile) overrides.profile = globalOpts.profile;
const config = resolveConfig(overrides);
const client = getClient(config.baseUrl, config.directory);
```

### Repeatable Commander flags

```ts
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
```

### Output column definitions

```ts
const columns = [
  { key: "id", label: "ID", width: 35 },
  { key: "slug", label: "SLUG", width: 20 },
];
printData(data, options, columns);
```

### Conditional object spread for optional fields

```ts
const obj = {
  required,
  ...(optional && { optional }),
};
```

## Key Dependencies

- `@opencode-ai/sdk` (v2 API, flat param style): `createOpencodeClient` from `"@opencode-ai/sdk/v2"`
- `commander` v14: CLI argument parsing
- `chalk` v5: Terminal coloring (ESM-only version)
