// Models command: list available providers and models.
//
// By default, shows only the models you've enabled (configured providers).
// Use --all to see every provider/model combo available on the server.

import { Command } from "commander";
import { getClient } from "../lib/client.js";
import { resolveConfig, type CliOverrides } from "../lib/config.js";
import { printData, printError } from "../lib/output.js";

// Helper for Commander to allow repeatable flags.
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerModelsCommand(program: Command): void {
  program
    .command("models")
    .description("List available models (enabled providers only, use --all for everything)")
    .option("--all", "Show all providers, not just enabled ones")
    .option("--pretty", "Output as a human-readable table")
    .option("--fields <fields>", "Comma-separated list of fields to include")
    .option("--filter <key=value>", "Filter rows (contains match, repeatable)", collect, [])
    .action(async (options) => {
      try {
        const globalOpts = program.opts();
        const overrides: CliOverrides = {};
        if (globalOpts.baseUrl) overrides.baseUrl = globalOpts.baseUrl;
        if (globalOpts.profile) overrides.profile = globalOpts.profile;
        const config = resolveConfig(overrides);
        const client = getClient(config.baseUrl, config.directory);

        const rows: Record<string, unknown>[] = [];

        if (options.all) {
          const result = await client.provider.list();
          const providers = result.data?.all ?? [];

          for (const provider of providers) {
            for (const [modelId, modelInfo] of Object.entries(provider.models || {})) {
              rows.push({
                provider: provider.id,
                model: modelId,
                name: (modelInfo as Record<string, unknown>).name ?? modelId,
              });
            }
          }
        } else {
          const result = await client.config.providers();
          const providers = result.data?.providers ?? [];
          const defaults = (result.data?.default ?? {}) as Record<string, string>;

          for (const provider of providers) {
            for (const [modelId, modelInfo] of Object.entries(provider.models || {})) {
              const isDefault = defaults[provider.id] === modelId;
              rows.push({
                provider: provider.id,
                model: modelId,
                name: (modelInfo as Record<string, unknown>).name ?? modelId,
                default: isDefault ? "yes" : "",
              });
            }
          }
        }

        const columns = [
          { key: "provider", label: "PROVIDER", width: 15 },
          { key: "model", label: "MODEL", width: 35 },
          { key: "name", label: "NAME", width: 30 },
          ...(!options.all ? [{ key: "default", label: "DEFAULT", width: 8 }] : []),
        ];

        printData(rows, options, columns);
      } catch (error) {
        printError(error instanceof Error ? error.message : "Unknown error");
      }
    });
}
