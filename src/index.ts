#!/usr/bin/env node

// Import the Command class from commander.
// This is the main thing you use — it represents your CLI program.
import { Command } from "commander";

// Import the SDK client we created in lib/client.ts.
// Note the ".js" extension — with Node16 ESM modules, TypeScript requires
// you to use the .js extension in imports even though the source file is .ts.
// This is because at runtime, Node will be looking for the compiled .js file.
import { client } from "./lib/client.js";
import { printData, printError } from "./lib/output.js";

// Create the top-level program.
// Think of this as the root of your CLI — all commands hang off it.
const program = new Command();

// Configure the program with basic info.
// This shows up when someone runs `oc-cli --help`.
program
  .name("oc-cli")
  .description("CLI tool for managing OpenCode sessions")
  .version("0.1.0");

// Define the "hello" command.
//
// .command("hello")      — registers a subcommand called "hello"
// .description(...)      — help text shown in --help
// .option(...)           — defines a flag. "-n, --name <value>" means:
//                           -n is the short form, --name is the long form,
//                           <value> means it requires a value after it
// .action(...)           — the function that runs when this command is invoked.
//                           `options` is an object with the parsed flags.
program
  .command("hello")
  .description("Say hello (a test command)")
  .option("-n, --name <value>", "Who to greet", "world")
  .action((options) => {
    console.log(`Hello, ${options.name}!`);
  });

// Define the "sessions" command.
//
// Output flags:
//   (default)       → compact JSON on one line (for LLMs/scripts)
//   --pretty        → human-readable table
//   --fields a,b,c  → only include these fields in JSON output
program
  .command("sessions")
  .description("List all OpenCode sessions")
  .option("--pretty", "Output as a human-readable table")
  .option("--fields <fields>", "Comma-separated list of fields to include")
  .action(async (options) => {
    try {
      const result = await client.session.list();

      // The columns definition tells --pretty mode how to render the table.
      // Each entry maps a data key to a display label and column width.
      const columns = [
        { key: "id", label: "ID", width: 35 },
        { key: "slug", label: "SLUG", width: 20 },
        { key: "title", label: "TITLE", width: 45 },
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

// This line actually parses process.argv (the command-line arguments)
// and routes to the correct command. Without this, nothing happens.
program.parse();
