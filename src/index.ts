#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { Command } from "commander";

// Import command registration functions.
// Each file in commands/ exports a function that adds its commands to the program.
// This keeps index.ts clean — it just wires everything together.
import { registerSessionCommands } from "./commands/session.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerWatchCommand } from "./commands/watch.js";
import { registerProfileCommands } from "./commands/profile.js";
import { registerRunCommand } from "./commands/run.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));

const program = new Command();

program.name("oc-cli").description("CLI tool for managing OpenCode sessions").version(pkg.version);

// ---- Global options ----
// These are available on EVERY command. Commander places them on program.opts().
program
  .option("-p, --profile <name>", "Select a configuration profile")
  .option("--base-url <url>", "Override the OpenCode server URL")
  .option("--title-prefix <prefix>", "Override the global title prefix");

// Register all command groups.
registerSessionCommands(program);
registerModelsCommand(program);
registerConfigCommands(program);
registerWatchCommand(program);
registerProfileCommands(program);
registerRunCommand(program);

program.parse();
