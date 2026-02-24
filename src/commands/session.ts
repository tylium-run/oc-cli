// Session commands: list, create, delete, messages, prompt, wait
//
// Uses the v2 SDK which has a simpler parameter style:
//   v1: client.session.create({ body: { title }, query: { directory } })
//   v2: client.session.create({ title, directory })

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { getClient } from "../lib/client.js";
import { resolveConfig, type Config, type CliOverrides } from "../lib/config.js";
import { printData, printError, printErrorWithCode } from "../lib/output.js";
import { extractTextOutput, validateTextOptions, type MessageData } from "../lib/text-extract.js";
import { checkSessionStatus, waitForSession, type WaitResult } from "../lib/wait.js";

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

// Helper for Commander to allow repeatable flags.
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
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

export function registerSessionCommands(program: Command): void {
  const session = program.command("session").description("Manage OpenCode sessions");

  // ---- session list ----
  session
    .command("list")
    .description("List all sessions")
    .option("--mine", "Only show sessions matching the configured title prefix")
    .option("--pretty", "Output as a human-readable table")
    .option("--fields <fields>", "Comma-separated list of fields to include")
    .option("--filter <key=value>", "Filter rows (contains match, repeatable)", collect, [])
    .action(async (options) => {
      try {
        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);
        const result = await client.session.list();

        let data = result.data as unknown as Record<string, unknown>[];

        if (options.mine) {
          if (!config.titlePrefix) {
            printError(
              'Cannot use --mine: no titlePrefix is configured. Set one with: oc-cli config set titlePrefix "[prefix] "',
            );
          }
          data = data.filter((s) => {
            const title = String(s.title ?? "");
            return title.startsWith(config.titlePrefix);
          });
        }

        const columns = [
          { key: "id", label: "ID", width: 35 },
          { key: "slug", label: "SLUG", width: 20 },
          { key: "title", label: "TITLE", width: 45 },
        ];

        printData(data, options, columns);
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session create ----
  session
    .command("create")
    .description("Create a new session")
    .option("-t, --title <title>", "Session title")
    .option("-d, --directory <path>", "Working directory for the session")
    .option("--pretty", "Output as a human-readable table")
    .option("--fields <fields>", "Comma-separated list of fields to include")
    .action(async (options) => {
      try {
        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);

        // Auto-prepend titlePrefix to the title if both exist.
        let title = options.title;
        if (config.titlePrefix) {
          title = title ? config.titlePrefix + title : config.titlePrefix.trimEnd();
        }

        const result = await client.session.create({
          ...(title && { title }),
          ...(options.directory && { directory: options.directory }),
        });

        const sessionData = result.data as unknown as Record<string, unknown>;

        const columns = [
          { key: "id", label: "ID", width: 35 },
          { key: "slug", label: "SLUG", width: 20 },
          { key: "title", label: "TITLE", width: 45 },
        ];

        printData([sessionData], options, columns);
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session delete ----
  session
    .command("delete <id>")
    .description("Delete a session by ID")
    .action(async (id: string) => {
      try {
        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);

        await client.session.delete({ sessionID: id });
        console.log(JSON.stringify({ deleted: id }));
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session messages ----
  session
    .command("messages <id>")
    .description("List messages in a session")
    .option("--pretty", "Output as a human-readable table")
    .option("--fields <fields>", "Comma-separated list of fields to include")
    .option("--filter <key=value>", "Filter rows (contains match, repeatable)", collect, [])
    .option("--text", "Extract and print only text content from messages")
    .option("--all", "With --text, output all messages (not just last assistant)")
    .action(async (id: string, options) => {
      try {
        const validationError = validateTextOptions(options);
        if (validationError) printError(validationError);

        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);

        const result = await client.session.messages({ sessionID: id });

        // --text mode: extract raw text content and print to stdout
        if (options.text) {
          const messages = result.data as unknown as MessageData[];
          const lines = extractTextOutput(messages, options);
          for (const line of lines) console.log(line);
          return;
        }

        // Default mode: structured data output.
        // The SDK returns { info: Message; parts: Part[] }[] — flatten
        // so that printData can access top-level keys like "role" and "id".
        const messages = result.data as unknown as MessageData[];
        const flat = messages.map((m) => ({
          role: m.info.role,
          id: m.info.id,
          sessionID: m.info.sessionID,
          parts: m.parts.length,
        }));

        const columns = [
          { key: "role", label: "ROLE", width: 12 },
          { key: "id", label: "ID", width: 35 },
          { key: "parts", label: "PARTS", width: 8 },
        ];

        printData(flat as unknown as Record<string, unknown>[], options, columns);
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session prompt ----
  // Send a message to a session. Fire-and-forget: the response streams via SSE
  // events, so the user should run `oc-cli watch -s <id>` to see output.
  //
  // Input sources (exactly one required):
  //   1. Inline text argument:  oc-cli session prompt <id> "message"
  //   2. --file <path>:         reads text from a file
  //   3. --stdin:               reads text from piped stdin
  session
    .command("prompt <sessionId> [message]")
    .description("Send a prompt message to a session")
    .option("-f, --file <path>", "Read the prompt text from a file")
    .option("--stdin", "Read the prompt text from stdin")
    .option("-m, --model <provider/model>", "Override the LLM model (e.g. google/gemini-2.5-pro)")
    .option("--agent <name>", "Specify which agent handles the prompt")
    .option("--tools <json>", "JSON map of tool name to enabled boolean")
    .option("--allow-questions", "Allow the agent to ask questions (disabled by default)")
    .option("--no-reply", "Send the message without triggering an agent response")
    .action(async (sessionId: string, message: string | undefined, options) => {
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
              'Usage: oc-cli session prompt <sessionId> "message"',
          );
          return;
        }
        if (sources > 1) {
          printError(
            "Multiple message sources provided. Use only one of: inline text, --file, or --stdin.",
          );
          return;
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
          return;
        }

        // --- Parse optional flags ---
        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);

        // Build the promptAsync parameters.
        const params: Record<string, unknown> = {
          sessionID: sessionId,
          parts: [{ type: "text", text }],
        };

        // --model google/gemini-2.5-pro → { providerID: "google", modelID: "gemini-2.5-pro" }
        if (options.model) {
          const slashIndex = options.model.indexOf("/");
          if (slashIndex === -1) {
            printError(
              `Invalid --model format: "${options.model}". Expected provider/model (e.g. google/gemini-2.5-pro).`,
            );
            return;
          }
          params.model = {
            providerID: options.model.slice(0, slashIndex),
            modelID: options.model.slice(slashIndex + 1),
          };
        }

        // --agent flag overrides profile's defaultAgent.
        if (options.agent) {
          params.agent = options.agent;
        } else if (config.defaultAgent) {
          params.agent = config.defaultAgent;
        }

        if (options.tools) {
          try {
            params.tools = JSON.parse(options.tools);
          } catch {
            printError(
              `Invalid --tools JSON: "${options.tools}". Expected a JSON object like '{"read":true,"write":false}'.`,
            );
            return;
          }
        }

        // Disable the question tool by default. When an agent asks a question,
        // execution blocks until someone answers — unhelpful for non-interactive
        // CLI usage. Pass --allow-questions to re-enable.
        if (!options.allowQuestions) {
          const toolsObj = (params.tools ?? {}) as Record<string, boolean>;
          toolsObj.question = false;
          params.tools = toolsObj;
        }

        // Commander's --no-reply convention: when you define --no-reply,
        // Commander sets options.reply = false (it strips the "no-" prefix
        // and inverts the boolean). So we check options.reply === false.
        if (options.reply === false) {
          params.noReply = true;
        }

        // --- Fire the prompt ---
        await client.session.promptAsync(
          params as Parameters<typeof client.session.promptAsync>[0],
        );

        console.log(JSON.stringify({ prompted: sessionId }));
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session permit ----
  // Respond to a permission request (e.g. "can I access this directory?")
  session
    .command("permit <requestId>")
    .description("Respond to a permission request (once, always, or reject)")
    .argument("[reply]", "Response: once, always, or reject", "once")
    .action(async (requestId: string, reply: string) => {
      try {
        if (!["once", "always", "reject"].includes(reply)) {
          printError(`Invalid reply: "${reply}". Must be once, always, or reject.`);
        }
        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);

        await client.permission.reply({
          requestID: requestId,
          reply: reply as "once" | "always" | "reject",
        });
        console.log(JSON.stringify({ permitted: requestId, reply }));
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session answer ----
  // Respond to a question from the agent.
  // Usage: oc-cli session answer <requestId> "answer1" "answer2"
  session
    .command("answer <requestId> [answers...]")
    .description("Answer a question from the agent")
    .action(async (requestId: string, answers: string[]) => {
      try {
        if (answers.length === 0) {
          printError('No answers provided. Usage: oc-cli session answer <requestId> "answer"');
        }
        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);

        // Each answer is an array of selected labels (for multi-select).
        // For single-select, it's a one-element array per question.
        await client.question.reply({
          requestID: requestId,
          answers: answers.map((a) => [a]),
        });
        console.log(JSON.stringify({ answered: requestId, answers }));
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session reject ----
  // Reject a question from the agent.
  session
    .command("reject <requestId>")
    .description("Reject a question from the agent")
    .action(async (requestId: string) => {
      try {
        const config = getConfig(program);
        const client = getClient(config.baseUrl, config.directory);

        await client.question.reject({ requestID: requestId });
        console.log(JSON.stringify({ rejected: requestId }));
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- session wait ----
  // Block until a session reaches idle state (or timeout/error).
  //
  // Exit codes:
  //   0 — session reached idle
  //   1 — session error (unrecoverable)
  //   2 — timeout (--timeout exceeded)
  //   3 — connection error (server unreachable, network failure)
  //
  // Two-phase approach:
  //   Phase 1: Pre-flight status check (fast path for already-idle sessions).
  //   Phase 2: SSE subscription to wait for state transitions.
  session
    .command("wait <sessionId>")
    .description("Wait for a session to reach idle state")
    .option("--timeout <seconds>", "Timeout in seconds (exit code 2 on timeout)", parseInt)
    .option("--stream", "Stream SSE events to stderr while waiting")
    .option("--pretty", "Human-readable formatted output")
    .action(
      async (
        sessionId: string,
        options: { timeout?: number; stream?: boolean; pretty?: boolean },
      ) => {
        try {
          const config = getConfig(program);
          const client = getClient(config.baseUrl, config.directory);

          // Phase 1: Pre-flight status check — fast path if already idle.
          let initialStatus: Awaited<ReturnType<typeof checkSessionStatus>>;
          try {
            initialStatus = await checkSessionStatus(client, sessionId);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Unknown error";
            if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
              printError(`Session not found: ${sessionId}`);
            }
            printErrorWithCode(`Connection error: ${msg}`, 3);
          }

          if (initialStatus.type === "idle") {
            console.log(
              JSON.stringify({
                sessionId,
                status: "idle",
                source: "status_check",
              }),
            );
            process.exit(0);
          }

          // Phase 2: SSE subscription — wait for idle/error/timeout.
          const controller = new AbortController();
          process.on("SIGINT", () => {
            controller.abort();
            process.exit(0);
          });

          let result: WaitResult;
          try {
            result = await waitForSession(client, sessionId, {
              timeout: options.timeout,
              signal: controller.signal,
              stream: options.stream,
              pretty: options.pretty,
            });
          } catch (error: unknown) {
            if ((error as Error)?.name === "AbortError") {
              process.exit(0);
            }
            const msg = error instanceof Error ? error.message : "Unknown error";
            printErrorWithCode(`Connection error: ${msg}`, 3);
          }

          // Phase 3: Map result to exit codes.
          if (result.status === "idle") {
            console.log(
              JSON.stringify({
                sessionId,
                status: "idle",
                source: "sse",
              }),
            );
            process.exit(0);
          } else if (result.status === "timeout") {
            printErrorWithCode(
              `Timeout: session ${sessionId} did not reach idle within ${options.timeout}s`,
              2,
            );
          } else {
            // result.status === "error"
            printError(`Session error: ${result.error ?? "unknown"}`);
          }
        } catch (error: unknown) {
          if ((error as Error)?.name === "AbortError") {
            process.exit(0);
          }
          printError(error instanceof Error ? error.message : "Unknown error");
        }
      },
    );
}
