// Watch command: subscribe to SSE events from the OpenCode server.
//
// This command opens a long-lived connection to the server's SSE endpoint
// and prints events as they arrive. It stays running until you press Ctrl+C.
//
// SSE (Server-Sent Events) is a protocol where the server keeps an HTTP
// connection open and pushes events to the client in real-time. Unlike
// WebSockets, SSE is one-way (server → client only). The SDK handles all
// the SSE parsing and reconnection logic internally.
//
// Two modes:
//   oc-cli watch              → subscribe to events for a specific directory
//   oc-cli watch --global     → subscribe to ALL events across all instances
//
// By default, outputs one JSON object per line (JSON Lines / NDJSON format).
// With --pretty, shows a human-readable formatted stream with colors,
// modeled after how OpenCode/Claude Code display streaming output.

import { Command } from "commander";
import chalk from "chalk";
import { getClient } from "../lib/client.js";
import { resolveConfig, type CliOverrides } from "../lib/config.js";
import { printError } from "../lib/output.js";
import { formatEvent, createFormatterState } from "../lib/format-event.js";

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Watch real-time events from the OpenCode server (SSE stream)")
    .option("-s, --session <id>", "Only show events for a specific session ID")
    .option("--global", "Watch events from all instances (not just one directory)")
    .option("-d, --directory <path>", "Directory to watch events for (instance-scoped)")
    .option("--pretty", "Human-readable formatted output with colors")
    .option(
      "--type <types>",
      "Comma-separated event types to show (e.g. session.status,message.part.updated)",
    )
    .action(async (options) => {
      try {
        // Resolve config for base URL and directory.
        const globalOpts = program.opts();
        const overrides: CliOverrides = {};
        if (globalOpts.baseUrl) overrides.baseUrl = globalOpts.baseUrl;
        if (globalOpts.profile) overrides.profile = globalOpts.profile;
        const config = resolveConfig(overrides);
        const client = getClient(config.baseUrl, config.directory);

        // Parse --type filter if provided.
        const typeFilter = options.type
          ? new Set(options.type.split(",").map((t: string) => t.trim()))
          : null;

        // Session filter: extract sessionID from any event shape.
        // Events carry sessionID in different places depending on the type:
        //   - properties.sessionID (message.part.delta, session.status, etc.)
        //   - properties.info.id (session.created/updated/deleted)
        //   - properties.info.sessionID (message.updated)
        //   - properties.part.sessionID (message.part.updated)
        const sessionFilter = options.session ?? null;
        function matchesSession(evt: Record<string, unknown>): boolean {
          if (!sessionFilter) return true;
          const p = (evt.properties ?? {}) as Record<string, unknown>;
          // Direct sessionID on properties
          if (p.sessionID === sessionFilter) return true;
          // Nested in info (session events, message.updated)
          const info = p.info as Record<string, unknown> | undefined;
          if (info?.id === sessionFilter) return true;
          if (info?.sessionID === sessionFilter) return true;
          // Nested in part (message.part.updated)
          const part = p.part as Record<string, unknown> | undefined;
          if (part?.sessionID === sessionFilter) return true;
          // Global events that have no session scope (server.connected) — allow
          const type = evt.type as string;
          if (type === "server.connected") return true;
          return false;
        }

        // Create formatter state for pretty mode.
        // This tracks context (current session, last event type) so the
        // formatter can decide when to insert separators and group events.
        const fmtState = createFormatterState();

        // Set up Ctrl+C handling.
        // AbortController lets us cancel the SSE connection cleanly.
        const controller = new AbortController();
        process.on("SIGINT", () => {
          if (options.pretty) {
            console.log(chalk.dim("\nDisconnected."));
          }
          controller.abort();
          process.exit(0);
        });

        if (options.pretty) {
          const mode = options.global ? "global" : "instance";
          const sessionLabel = sessionFilter ? ` (session: ${sessionFilter})` : "";
          console.log(chalk.dim(`Watching ${mode} events from ${config.baseUrl}${sessionLabel}`));
          console.log(chalk.dim("Press Ctrl+C to stop.\n"));
        }

        if (options.global) {
          // Global events — all instances.
          // v2 API: global.event(options?) — signal goes in options (2nd style param)
          const { stream } = await client.global.event({
            signal: controller.signal,
          } as Parameters<typeof client.global.event>[0]);

          for await (const globalEvent of stream) {
            const ge = globalEvent as unknown as {
              directory: string;
              payload: Record<string, unknown>;
            };
            const event = ge.payload;

            // Apply filters.
            if (typeFilter && !typeFilter.has(event.type as string)) continue;
            if (!matchesSession(event)) continue;

            if (options.pretty) {
              const lines = formatEvent(event, fmtState);
              const dirTag = ge.directory ? chalk.dim(`[${ge.directory}] `) : "";
              for (const line of lines) {
                console.log(dirTag + line);
              }
            } else {
              // JSON Lines: one JSON object per line.
              console.log(JSON.stringify(globalEvent));
            }
          }
        } else {
          // Instance-scoped events.
          // v2 API: event.subscribe(params?, options?)
          // params = { directory? }, options = { signal }
          const { stream } = await client.event.subscribe(
            options.directory ? { directory: options.directory } : undefined,
            { signal: controller.signal } as Parameters<typeof client.event.subscribe>[1],
          );

          for await (const event of stream) {
            const evt = event as unknown as Record<string, unknown>;

            // Apply filters.
            if (typeFilter && !typeFilter.has(evt.type as string)) continue;
            if (!matchesSession(evt)) continue;

            if (options.pretty) {
              const lines = formatEvent(evt, fmtState);
              for (const line of lines) {
                console.log(line);
              }
            } else {
              console.log(JSON.stringify(event));
            }
          }
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
