// Run command: create a session, send a prompt, and wait for completion.
//
// This is a high-level convenience command that combines session creation,
// prompting, and result waiting into a single invocation. It's the main
// entry point for agents that want to run a prompt end-to-end without
// manually orchestrating session lifecycle.
//
// Input sources (exactly one required):
//   1. Inline text argument:  oc-cli run "do something"
//   2. --file <path>:         reads prompt from a file
//   3. --stdin:               reads prompt from piped stdin

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { getClient } from "../lib/client.js";
import { resolveConfig, type CliOverrides } from "../lib/config.js";
import { printError } from "../lib/output.js";
import { extractTextOutput, type MessageData } from "../lib/text-extract.js";
import { waitForSession } from "../lib/wait.js";

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
function getConfig(program: Command): ReturnType<typeof resolveConfig> {
  const globalOpts = program.opts();
  const overrides: CliOverrides = {};
  if (globalOpts.baseUrl) overrides.baseUrl = globalOpts.baseUrl;
  if (globalOpts.titlePrefix) overrides.titlePrefix = globalOpts.titlePrefix;
  if (globalOpts.profile) overrides.profile = globalOpts.profile;
  return resolveConfig(overrides);
}

export function registerRunCommand(program: Command): void {
  program
    .command("run [message]")
    .description("Create a session, send a prompt, and wait for completion")
    .option("-m, --model <provider/model>", "LLM model override (e.g. google/gemini-2.5-pro)")
    .option("--agent <name>", "Agent to handle the prompt")
    .option("--timeout <seconds>", "Timeout in seconds", parseInt)
    .option("--stream", "Stream SSE events in real-time")
    .option("--pretty", "Human-readable formatted output")
    .option("--auto-approve", "Auto-approve permission requests")
    .option("--tools <json>", "JSON map of tool name to enabled boolean")
    .option("--allow-questions", "Allow the agent to ask questions (disabled by default)")
    .option("-f, --file <path>", "Read prompt from file")
    .option("--stdin", "Read prompt from stdin")
    .option("-d, --directory <dir>", "Working directory")
    .action(async (message: string | undefined, options) => {
      try {
        // --- Validate exactly one input source ---
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

        // --- Read prompt text from the chosen source ---
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
        const directory = options.directory ?? config.directory;
        const client = getClient(config.baseUrl, directory);

        // --- Create session ---
        const titleBody = text.length > 50 ? text.slice(0, 50) + "…" : text;
        let title = `run: ${titleBody}`;
        if (config.titlePrefix) {
          title = config.titlePrefix + title;
        }

        const sessionResult = await client.session.create({
          title,
          ...(directory && { directory }),
        });

        const sessionData = sessionResult.data as unknown as Record<string, unknown>;
        const sessionId = sessionData.id as string;

        // --- Fire the prompt ---
        const promptParams: Record<string, unknown> = {
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
          }
          promptParams.model = {
            providerID: options.model.slice(0, slashIndex),
            modelID: options.model.slice(slashIndex + 1),
          };
        }

        // --agent flag overrides profile's defaultAgent.
        if (options.agent) {
          promptParams.agent = options.agent;
        } else if (config.defaultAgent) {
          promptParams.agent = config.defaultAgent;
        }

        // --tools flag
        if (options.tools) {
          try {
            promptParams.tools = JSON.parse(options.tools);
          } catch {
            printError(
              `Invalid --tools JSON: "${options.tools}". Expected a JSON object like '{"read":true,"write":false}'.`,
            );
          }
        }

        // Disable the question tool by default. When an agent asks a question,
        // execution blocks until someone answers — unhelpful for non-interactive
        // CLI usage. Pass --allow-questions to re-enable.
        if (!options.allowQuestions) {
          const toolsObj = (promptParams.tools ?? {}) as Record<string, boolean>;
          toolsObj.question = false;
          promptParams.tools = toolsObj;
        }

        await client.session.promptAsync(
          promptParams as Parameters<typeof client.session.promptAsync>[0],
        );

        // --- Wait for session completion ---
        const controller = new AbortController();
        process.on("SIGINT", () => {
          controller.abort();
          process.exit(0);
        });

        const result = await waitForSession(client, sessionId, {
          timeout: options.timeout,
          signal: controller.signal,
          stream: options.stream,
          pretty: options.pretty,
          autoApprove: options.autoApprove,
        });

        if (result.status === "idle") {
          // Fetch all messages for the completed session.
          const msgResult = await client.session.messages({ sessionID: sessionId });
          const messages = msgResult.data as unknown as MessageData[];

          // Extract last assistant text using shared extraction logic.
          const textLines = extractTextOutput(messages, {});
          const lastAssistantText = textLines.length > 0 ? textLines.join("\n") : null;

          if (options.pretty && !options.stream) {
            // --pretty (non-streaming): output just the final text for piping.
            if (lastAssistantText) {
              console.log(lastAssistantText);
            }
          } else {
            // Default: structured JSON with full context.
            console.log(
              JSON.stringify({
                sessionId,
                status: "completed",
                messages: messages.length,
                lastAssistantText,
              }),
            );
          }
        } else if (result.status === "timeout") {
          printError(`Timeout: session ${sessionId} did not complete within ${options.timeout}s`);
        } else {
          // result.status === "error"
          printError(`Session error: ${result.error}`);
        }
      } catch (error) {
        // AbortError is expected when user presses Ctrl+C.
        if ((error as Error).name === "AbortError") {
          process.exit(0);
        }
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });
}
