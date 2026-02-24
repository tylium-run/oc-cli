# TYL-212: Scaffold Run Command with Options and Registration

## Overview

Create a new `src/commands/run.ts` file that registers an `oc-cli run <message>` command with all specified CLI options, register it in `src/index.ts`, and stub the action body to log parsed options as JSON.

---

## File 1: `src/commands/run.ts` (NEW)

**Purpose:** Top-level `run` command — an all-in-one command that creates a session, sends a prompt, and optionally streams results, all in a single invocation.

### Full file contents

```ts
// Run command: one-shot session create + prompt + optional streaming.
//
// This is the primary entry point for agents that want to send a single
// prompt and get results back without manually managing sessions.
//
// Combines session creation, prompt dispatch, and optional SSE streaming
// into a single CLI invocation:
//
//   oc-cli run "refactor the auth module" --stream --pretty
//
// Input sources (exactly one required):
//   1. Positional argument:  oc-cli run "message"
//   2. --file <path>:        reads prompt from a file
//   3. --stdin:               reads prompt from piped stdin

import { Command } from "commander";

import { readFile } from "node:fs/promises";

import { resolveConfig, type Config, type CliOverrides } from "../lib/config.js";
import { printError } from "../lib/output.js";

// ---- Helpers ----

/**
 * Read all of stdin into a string.
 *
 * Returns a promise that resolves once the stdin stream ends.
 * If stdin is a TTY (no piped input), this would hang forever,
 * so the caller should only invoke this when --stdin is set.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

/**
 * Read global options from the root program and resolve config.
 * Passes the -p/--profile flag through to profile-based resolution.
 */
function getConfig(program: Command): Config {
  const globalOpts = program.opts();
  const overrides: CliOverrides = {};
  if (globalOpts.baseUrl) overrides.baseUrl = globalOpts.baseUrl;
  if (globalOpts.titlePrefix) overrides.titlePrefix = globalOpts.titlePrefix;
  if (globalOpts.profile) overrides.profile = globalOpts.profile;
  return resolveConfig(overrides);
}

// ---- Command registration ----

export function registerRunCommand(program: Command): void {
  program
    .command("run [message]")
    .description("Create a session, send a prompt, and optionally stream results")
    .option("-m, --model <provider/model>", "LLM model override (e.g. google/gemini-2.5-pro)")
    .option("--agent <name>", "Agent to handle the prompt")
    .option("--timeout <seconds>", "Timeout in seconds for the run", parseInt)
    .option("--stream", "Stream SSE events until the session completes")
    .option("--pretty", "Human-readable formatted output (implies --stream)")
    .option("--auto-approve", "Automatically approve all permission requests")
    .option("-f, --file <path>", "Read the prompt text from a file")
    .option("--stdin", "Read the prompt text from stdin")
    .option("-d, --directory <dir>", "Working directory for the session")
    .action(async (message: string | undefined, options) => {
      try {
        // --- Resolve input text from exactly one source ---
        const sources = [
          message !== undefined,
          Boolean(options.file),
          Boolean(options.stdin),
        ].filter(Boolean).length;

        if (sources === 0) {
          printError(
            "No message provided. Provide inline text, --file <path>, or --stdin.\n" +
              'Usage: oc-cli run "message"',
          );
        }
        if (sources > 1) {
          printError(
            "Multiple message sources provided. Use only one of: inline text, --file, or --stdin.",
          );
        }

        let text: string;
        if (options.file) {
          text = await readFile(options.file, "utf-8");
        } else if (options.stdin) {
          text = await readStdin();
        } else {
          text = message!;
        }

        // Trim and validate — don't send empty prompts.
        text = text.trim();
        if (text.length === 0) {
          printError("Message is empty after trimming whitespace.");
        }

        // --- Resolve config ---
        const config = getConfig(program);

        // --- Parse --model if provided ---
        let model: { providerID: string; modelID: string } | undefined;
        if (options.model) {
          const slashIndex = options.model.indexOf("/");
          if (slashIndex === -1) {
            printError(
              `Invalid --model format: "${options.model}". Expected provider/model (e.g. google/gemini-2.5-pro).`,
            );
          }
          model = {
            providerID: options.model.slice(0, slashIndex),
            modelID: options.model.slice(slashIndex + 1),
          };
        }

        // --- Resolve agent (CLI flag overrides profile default) ---
        const agent = options.agent ?? config.defaultAgent;

        // --- Stub: log parsed options as JSON ---
        console.log(
          JSON.stringify({
            stub: true,
            message: text,
            ...(model && { model }),
            ...(agent && { agent }),
            ...(options.timeout && { timeout: options.timeout }),
            ...(options.stream && { stream: true }),
            ...(options.pretty && { pretty: true }),
            ...(options.autoApprove && { autoApprove: true }),
            ...(options.directory && { directory: options.directory }),
            config: {
              baseUrl: config.baseUrl,
              directory: config.directory,
              activeProfile: config.activeProfile,
            },
          }),
        );
      } catch (error) {
        // AbortError is expected when user presses Ctrl+C.
        if ((error as Error).name === "AbortError") {
          process.exit(0);
        }
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });
}
```

### Option design decisions

| Option           | Flag style                      | Rationale                                                                                                                                     |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`        | `[message]` (optional argument) | Optional because `--file` or `--stdin` can provide input instead. Mirrors `session prompt <sessionId> [message]` pattern at `session.ts:178`. |
| `--model`        | `-m, --model <provider/model>`  | Short flag `-m` matches `session.ts:183`. Value format `provider/model`.                                                                      |
| `--agent`        | `--agent <name>`                | No short flag — matches `session.ts:184`.                                                                                                     |
| `--timeout`      | `--timeout <seconds>`           | Uses `parseInt` as the Commander value parser to coerce to number.                                                                            |
| `--stream`       | `--stream` (boolean)            | No value — presence = true.                                                                                                                   |
| `--pretty`       | `--pretty` (boolean)            | Consistent with every other command in the codebase.                                                                                          |
| `--auto-approve` | `--auto-approve` (boolean)      | Kebab-case CLI, Commander will expose as `options.autoApprove`.                                                                               |
| `--file`         | `-f, --file <path>`             | Short flag `-f` matches `session.ts:180`.                                                                                                     |
| `--stdin`        | `--stdin` (boolean)             | Matches `session.ts:181`.                                                                                                                     |
| `--directory`    | `-d, --directory <dir>`         | Short flag `-d` matches `session.ts:95` and `watch.ts:32`.                                                                                    |

### Key patterns followed

- Module-level `//` block comment at top of file (purpose + design rationale)
- External packages first, then `node:` builtins, then relative imports with blank line separators
- `.js` extension on all relative imports
- `type` keyword inline in imports (not separate `import type`)
- Named exports only, one `register*` function exported
- `function` declarations for top-level functions, arrow functions only for callbacks
- Single `try/catch` wrapping the entire action body
- `printError()` for all error exits (return type `never`)
- Conditional object spread for optional fields
- `AbortError` handling for Ctrl+C
- `readStdin()` and `getConfig()` duplicated from `session.ts` (intentional for scaffold; extraction to `lib/` is a follow-up)

---

## File 2: `src/index.ts` (MODIFY)

Two changes required:

### Change 1 — Add import (after line 11)

Add the following line after the existing command imports:

```ts
import { registerRunCommand } from "./commands/run.js";
```

### Change 2 — Register the command (after line 30)

Add the following line after the existing `registerProfileCommands(program)` call:

```ts
registerRunCommand(program);
```

### No other files changed

- No changes to `lib/config.ts`, `lib/client.ts`, `lib/output.ts`, or `lib/format-event.ts`
- No new dependencies needed
- No `tsconfig.json` changes

---

## Acceptance Criteria

1. **Build passes:** `npm run build` completes with zero errors
2. **Lint passes:** `npm run lint` reports no errors or warnings
3. **Format passes:** `npm run format:check` reports no issues
4. **Command appears in help:** `npm run dev -- --help` shows `run` in the command list
5. **Command help works:** `npm run dev -- run --help` shows all options with descriptions
6. **Inline message works:** `npm run dev -- run "hello world"` outputs JSON with `stub: true` and `message: "hello world"`
7. **File input works:** `npm run dev -- run --file README.md` outputs JSON with the file contents as message
8. **Stdin input works:** `echo "hello" | npm run dev -- run --stdin` outputs JSON with stdin contents
9. **Input validation works:**
   - `npm run dev -- run` (no input) exits with error JSON
   - `npm run dev -- run "hello" --file README.md` (multiple inputs) exits with error
   - `npm run dev -- run ""` (empty message) exits with error
10. **Model parsing works:** `npm run dev -- run "test" --model google/gemini-2.5-pro` outputs `model: { providerID: "google", modelID: "gemini-2.5-pro" }`
11. **Invalid model rejected:** `npm run dev -- run "test" --model badformat` exits with error
12. **All options pass through:** `npm run dev -- run "test" --agent coder --timeout 30 --stream --pretty --auto-approve --directory /tmp` outputs JSON containing all options
13. **Global options work:** `npm run dev -- -p myprofile run "test"` resolves the correct profile

---

## Verification Commands

```bash
npm run lint && npm run format:check && npm run build
npm run dev -- --help
npm run dev -- run --help
npm run dev -- run "hello world"
npm run dev -- run "test" --model google/gemini-2.5-pro --agent coder --timeout 60 --stream --pretty --auto-approve
```
