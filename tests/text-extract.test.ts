import { describe, it, expect } from "vitest";
import {
  extractTextOutput,
  validateTextOptions,
  type MessageData,
} from "../src/lib/text-extract.js";

// ---- Fixture Factories ----

function msg(role: string, ...texts: string[]): MessageData {
  return {
    info: { role },
    parts: texts.map((t) => ({ type: "text", text: t })),
  };
}

function toolMsg(role: string): MessageData {
  return {
    info: { role },
    parts: [{ type: "tool_use", name: "bash" }],
  };
}

// ---- validateTextOptions ----

describe("validateTextOptions", () => {
  it("returns null for valid options with --text", () => {
    expect(validateTextOptions({ text: true })).toBeNull();
  });

  it("returns null when no flags are set", () => {
    expect(validateTextOptions({})).toBeNull();
  });

  it("returns error when --all is used without --text", () => {
    const result = validateTextOptions({ all: true });
    expect(result).toContain("--all requires --text");
  });

  it("returns error when --text and --pretty are combined", () => {
    const result = validateTextOptions({ text: true, pretty: true });
    expect(result).toContain("mutually exclusive");
  });
});

// ---- extractTextOutput ----

describe("extractTextOutput", () => {
  it("--text returns last assistant text", () => {
    const messages = [
      msg("user", "hi"),
      msg("assistant", "first"),
      msg("user", "more"),
      msg("assistant", "second"),
    ];
    expect(extractTextOutput(messages, { text: true })).toEqual(["second"]);
  });

  it("--text --all returns all messages with role prefixes", () => {
    const messages = [msg("user", "hello"), msg("assistant", "hi there")];
    expect(extractTextOutput(messages, { text: true, all: true })).toEqual([
      "[user] hello",
      "[assistant] hi there",
    ]);
  });

  it("messages with no text parts are skipped (default mode)", () => {
    const messages = [msg("user", "hello"), toolMsg("assistant"), msg("assistant", "final")];
    expect(extractTextOutput(messages, { text: true })).toEqual(["final"]);
  });

  it("--all skips messages with no text parts", () => {
    const messages = [msg("user", "hello"), toolMsg("assistant"), msg("assistant", "reply")];
    expect(extractTextOutput(messages, { text: true, all: true })).toEqual([
      "[user] hello",
      "[assistant] reply",
    ]);
  });

  it("multi-part text concatenation", () => {
    const messages = [msg("assistant", "part1", "part2", "part3")];
    expect(extractTextOutput(messages, { text: true })).toEqual(["part1\npart2\npart3"]);
  });

  it("empty message list returns empty", () => {
    expect(extractTextOutput([], { text: true })).toEqual([]);
  });

  it("no assistant messages returns empty", () => {
    const messages = [msg("user", "hello")];
    expect(extractTextOutput(messages, { text: true })).toEqual([]);
  });

  it("--all --text multi-part concat", () => {
    const messages = [msg("user", "a", "b"), msg("assistant", "c", "d")];
    expect(extractTextOutput(messages, { text: true, all: true })).toEqual([
      "[user] a\nb",
      "[assistant] c\nd",
    ]);
  });
});
