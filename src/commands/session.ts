// Session commands: list, create, delete, messages
//
// This file defines all `oc-cli session <subcommand>` commands.
// It exports a function that takes the top-level Commander program
// and registers the "session" command group on it.
//
// CHANGE: Now uses resolveConfig() + getClient() so the base URL and
// title prefix come from the layered config system instead of being hardcoded.

import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { resolveConfig, type Config } from "../lib/config.js";
import { printData, printError } from "../lib/output.js";

// Helper for Commander to allow repeatable flags.
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Read global options from the root program and resolve config.
 * This is called at the start of every command action so we always
 * have the merged config (defaults ← file ← env ← CLI flags).
 */
function getConfig(program: Command): Config {
  const globalOpts = program.opts();
  const cliFlags: Partial<Config> = {};
  if (globalOpts.baseUrl) cliFlags.baseUrl = globalOpts.baseUrl;
  if (globalOpts.titlePrefix) cliFlags.titlePrefix = globalOpts.titlePrefix;
  return resolveConfig(cliFlags);
}

export function registerSessionCommands(program: Command): void {
  // Create a "session" command group.
  // This means all subcommands will be: oc-cli session list, oc-cli session create, etc.
  const session = program
    .command("session")
    .description("Manage OpenCode sessions");

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
        const client = getClient(config.baseUrl);
        const result = await client.session.list();

        let data = result.data as unknown as Record<string, unknown>[];

        // --mine: filter to sessions whose title starts with the configured prefix.
        // Only applies if a titlePrefix is actually set.
        if (options.mine) {
          if (!config.titlePrefix) {
            printError("Cannot use --mine: no titlePrefix is configured. Set one with: oc-cli config set titlePrefix \"[prefix] \"");
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
        const client = getClient(config.baseUrl);

        // Auto-prepend titlePrefix to the title if both exist.
        // If no --title is given but a prefix is set, use the prefix alone.
        let title = options.title;
        if (config.titlePrefix) {
          title = title
            ? config.titlePrefix + title
            : config.titlePrefix.trimEnd(); // trim trailing space if no title follows
        }

        const result = await client.session.create({
          body: {
            ...(title && { title }),
          },
          ...(options.directory && { query: { directory: options.directory } }),
        });

        // Print the created session. Wrap in array for consistent output.
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
        const client = getClient(config.baseUrl);

        await client.session.delete({
          path: { id },
        });
        // Output success as JSON for consistency.
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
    .action(async (id: string, options) => {
      try {
        const config = getConfig(program);
        const client = getClient(config.baseUrl);

        const result = await client.session.messages({
          path: { id },
        });

        const columns = [
          { key: "role", label: "ROLE", width: 12 },
          { key: "id", label: "ID", width: 35 },
        ];

        printData(
          result.data as unknown as Record<string, unknown>[],
          options,
          columns,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });
}
