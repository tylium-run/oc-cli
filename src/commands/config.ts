// Config commands: set, get, list, path
//
// These let the user manage their persistent config file (~/.oc-cli.json).
// All subcommands live under `oc-cli config <subcommand>`.

import { Command } from "commander";
import chalk from "chalk";
import {
  CONFIG_KEYS,
  getConfigPath,
  loadConfigFile,
  saveConfigFile,
  resolveConfig,
  getConfigSource,
  type Config,
} from "../lib/config.js";
import { printData, printError } from "../lib/output.js";

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("Manage oc-cli configuration");

  // ---- config set <key> <value> ----
  // Writes a single key to the config file.
  // Only accepts known keys (baseUrl, titlePrefix).
  config
    .command("set <key> <value>")
    .description("Set a config value (saves to ~/.oc-cli.json)")
    .action((key: string, value: string) => {
      // Validate the key is one we recognize.
      if (!CONFIG_KEYS.includes(key as keyof Config)) {
        printError(
          `Unknown config key: "${key}". Valid keys: ${CONFIG_KEYS.join(", ")}`,
        );
      }

      // Load existing config, update the key, save back.
      const existing = loadConfigFile();
      existing[key as keyof Config] = value;
      saveConfigFile(existing);

      // Output confirmation as JSON.
      console.log(JSON.stringify({ [key]: value }));
    });

  // ---- config get <key> ----
  // Shows the resolved value for a single key.
  // In --pretty mode, also shows which layer it came from.
  config
    .command("get <key>")
    .description("Get the resolved value for a config key")
    .option("--pretty", "Show the value source alongside the value")
    .action((key: string, options: { pretty?: boolean }) => {
      if (!CONFIG_KEYS.includes(key as keyof Config)) {
        printError(
          `Unknown config key: "${key}". Valid keys: ${CONFIG_KEYS.join(", ")}`,
        );
      }

      // Get CLI flags from the parent program (global options like --base-url).
      const globalOpts = program.opts();
      const cliFlags: Partial<Config> = {};
      if (globalOpts.baseUrl) cliFlags.baseUrl = globalOpts.baseUrl;
      if (globalOpts.titlePrefix) cliFlags.titlePrefix = globalOpts.titlePrefix;

      const resolved = resolveConfig(cliFlags);
      const value = resolved[key as keyof Config];
      const source = getConfigSource(key as keyof Config, cliFlags);

      if (options.pretty) {
        // Human-readable: show value and where it came from.
        console.log(`${chalk.bold(key)}: ${chalk.white(value)} ${chalk.dim(`(${source})`)}`);
      } else {
        // Machine-readable JSON.
        console.log(JSON.stringify({ [key]: value, source }));
      }
    });

  // ---- config list ----
  // Shows all resolved config values.
  config
    .command("list")
    .description("Show all resolved config values")
    .option("--pretty", "Output as a human-readable table")
    .option("--fields <fields>", "Comma-separated list of fields to include")
    .action((options: { pretty?: boolean; fields?: string }) => {
      const globalOpts = program.opts();
      const cliFlags: Partial<Config> = {};
      if (globalOpts.baseUrl) cliFlags.baseUrl = globalOpts.baseUrl;
      if (globalOpts.titlePrefix) cliFlags.titlePrefix = globalOpts.titlePrefix;

      const resolved = resolveConfig(cliFlags);

      // Build rows: one per config key, with value and source.
      const rows: Record<string, unknown>[] = CONFIG_KEYS.map((key) => ({
        key,
        value: resolved[key],
        source: getConfigSource(key, cliFlags),
      }));

      const columns = [
        { key: "key", label: "KEY", width: 15 },
        { key: "value", label: "VALUE", width: 55 },
        { key: "source", label: "SOURCE", width: 20 },
      ];

      printData(rows, options, columns);
    });

  // ---- config path ----
  // Prints the config file location. Useful for scripts or debugging.
  config
    .command("path")
    .description("Print the config file path")
    .action(() => {
      console.log(JSON.stringify({ path: getConfigPath() }));
    });
}
