// Profile commands: list, show, add, remove, set
//
// Profiles are the primary way to configure oc-cli. Each profile defines
// a connection to an OpenCode server and optionally a project directory,
// default agent, and metadata (description, tags).
//
// Profiles are stored in ~/.oc-cli.json under the "profiles" key.

import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import {
  getProfiles,
  getProfile,
  saveProfile,
  removeProfile,
  PROFILE_KEYS,
  type Profile,
} from "../lib/config.js";
import { printData, printError } from "../lib/output.js";

// Helper for Commander to allow repeatable flags.
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerProfileCommands(program: Command): void {
  const profile = program
    .command("profile")
    .description("Manage configuration profiles");

  // ---- profile list ----
  profile
    .command("list")
    .description("List all configured profiles")
    .option("--pretty", "Output as a human-readable table")
    .option("--fields <fields>", "Comma-separated list of fields to include")
    .option("--filter <key=value>", "Filter rows (contains match, repeatable)", collect, [])
    .action((options) => {
      const profiles = getProfiles();
      const names = Object.keys(profiles);

      if (names.length === 0) {
        printError("No profiles configured. Run `oc-cli profile add <name>` to create one.");
        return;
      }

      // Build rows with the profile name injected.
      const rows = names.map((name) => ({
        name,
        baseUrl: profiles[name].baseUrl,
        directory: profiles[name].directory ?? "",
        defaultAgent: profiles[name].defaultAgent ?? "",
        description: profiles[name].description ?? "",
        tags: (profiles[name].tags ?? []).join(", "),
      }));

      const columns = [
        { key: "name", label: "NAME", width: 20 },
        { key: "baseUrl", label: "BASE URL", width: 35 },
        { key: "directory", label: "DIRECTORY", width: 35 },
        { key: "defaultAgent", label: "AGENT", width: 12 },
        { key: "description", label: "DESCRIPTION", width: 30 },
      ];

      printData(rows, options, columns);
    });

  // ---- profile show <name> ----
  profile
    .command("show <name>")
    .description("Show details of a specific profile")
    .option("--pretty", "Human-readable formatted output")
    .action((name: string, options: { pretty?: boolean }) => {
      const p = getProfile(name);
      if (!p) {
        const available = Object.keys(getProfiles());
        const hint = available.length > 0
          ? ` Available: ${available.join(", ")}`
          : " No profiles configured.";
        printError(`Profile "${name}" not found.${hint}`);
        return;
      }

      if (options.pretty) {
        console.log(`${chalk.bold("Name:")}          ${name}`);
        console.log(`${chalk.bold("Base URL:")}      ${p.baseUrl}`);
        if (p.directory) console.log(`${chalk.bold("Directory:")}     ${p.directory}`);
        if (p.defaultAgent) console.log(`${chalk.bold("Default Agent:")} ${p.defaultAgent}`);
        if (p.description) console.log(`${chalk.bold("Description:")}   ${p.description}`);
        if (p.tags?.length) console.log(`${chalk.bold("Tags:")}          ${p.tags.join(", ")}`);
      } else {
        console.log(JSON.stringify({ name, ...p }));
      }
    });

  // ---- profile add <name> ----
  // Supports two modes:
  //   1. Flags mode: oc-cli profile add myproj --base-url https://... --directory /path
  //   2. Interactive mode: if --base-url is not provided and stdin is a TTY,
  //      prompts the user for each field.
  profile
    .command("add <name>")
    .description("Add a new profile")
    .option("--url <url>", "OpenCode server URL (required)")
    .option("-d, --directory <path>", "Project directory")
    .option("--agent <name>", "Default agent for prompts")
    .option("--description <text>", "Profile description")
    .option("--tags <tags>", "Comma-separated tags")
    .action(async (name: string, options) => {
      try {
        // Check if profile already exists.
        if (getProfile(name)) {
          printError(`Profile "${name}" already exists. Use \`oc-cli profile set ${name} <key> <value>\` to update it.`);
          return;
        }

        let baseUrl: string;
        let directory: string | undefined;
        let defaultAgent: string | undefined;
        let description: string | undefined;
        let tags: string[] | undefined;

        if (options.url) {
          // Flags mode — use provided values.
          baseUrl = options.url;
          directory = options.directory;
          defaultAgent = options.agent;
          description = options.description;
          tags = options.tags ? options.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
        } else if (process.stdin.isTTY) {
          // Interactive mode — prompt for each field.
          const rl = createInterface({
            input: process.stdin,
            output: process.stderr, // prompts go to stderr so JSON output stays clean on stdout
          });

          try {
            baseUrl = await rl.question("Base URL (required): ");
            if (!baseUrl.trim()) {
              printError("Base URL is required.");
              rl.close();
              return;
            }
            baseUrl = baseUrl.trim();

            const dirAnswer = await rl.question("Directory (optional, press Enter to skip): ");
            directory = dirAnswer.trim() || undefined;

            const agentAnswer = await rl.question("Default agent (optional, press Enter to skip): ");
            defaultAgent = agentAnswer.trim() || undefined;

            const descAnswer = await rl.question("Description (optional, press Enter to skip): ");
            description = descAnswer.trim() || undefined;

            const tagsAnswer = await rl.question("Tags (optional, comma-separated, press Enter to skip): ");
            tags = tagsAnswer.trim()
              ? tagsAnswer.split(",").map((t) => t.trim()).filter(Boolean)
              : undefined;
          } finally {
            rl.close();
          }
        } else {
          // Not a TTY and no --url flag — can't prompt interactively.
          printError(
            "No --url provided and stdin is not interactive. " +
            "Usage: oc-cli profile add <name> --url <url> [--directory <path>] [--agent <name>]",
          );
          return;
        }

        // ---- Validate connectivity ----
        try {
          const testClient = createOpencodeClient({ baseUrl });
          await testClient.session.list();
        } catch (err) {
          // Warn but still save the profile.
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error(
            JSON.stringify({ warning: `Could not connect to ${baseUrl}: ${message}. Profile saved anyway.` }),
          );
        }

        // ---- Save the profile ----
        const newProfile: Profile = {
          baseUrl,
          ...(directory && { directory }),
          ...(defaultAgent && { defaultAgent }),
          ...(description && { description }),
          ...(tags?.length && { tags }),
        };

        saveProfile(name, newProfile);
        console.log(JSON.stringify({ added: name }));
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });

  // ---- profile remove <name> ----
  profile
    .command("remove <name>")
    .description("Remove a profile")
    .action((name: string) => {
      const removed = removeProfile(name);
      if (!removed) {
        const available = Object.keys(getProfiles());
        const hint = available.length > 0
          ? ` Available: ${available.join(", ")}`
          : " No profiles configured.";
        printError(`Profile "${name}" not found.${hint}`);
        return;
      }
      console.log(JSON.stringify({ removed: name }));
    });

  // ---- profile set <name> <key> <value> ----
  // Update a single field on an existing profile.
  profile
    .command("set <name> <key> <value>")
    .description("Set a field on an existing profile")
    .action((name: string, key: string, value: string) => {
      if (!PROFILE_KEYS.includes(key as keyof Profile)) {
        printError(
          `Unknown profile key: "${key}". Valid keys: ${PROFILE_KEYS.join(", ")}`,
        );
        return;
      }

      const existing = getProfile(name);
      if (!existing) {
        printError(`Profile "${name}" not found.`);
        return;
      }

      // Special handling for tags: parse comma-separated string into array.
      let parsedValue: string | string[] = value;
      if (key === "tags") {
        parsedValue = value.split(",").map((t) => t.trim()).filter(Boolean);
      }

      const updated = { ...existing, [key]: parsedValue };
      saveProfile(name, updated);
      console.log(JSON.stringify({ updated: name, key, value: parsedValue }));
    });
}
