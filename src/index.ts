#!/usr/bin/env node

// Import the Command class from commander.
// This is the main thing you use — it represents your CLI program.
import { Command } from "commander";

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

// This line actually parses process.argv (the command-line arguments)
// and routes to the correct command. Without this, nothing happens.
program.parse();
