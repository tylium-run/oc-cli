import { describe, it, expect, vi } from "vitest";
import { createFormatterState, formatEvent } from "../src/lib/format-event.js";

// ---- Helpers ----

function setup() {
  const writer = { write: vi.fn() } as unknown as NodeJS.WriteStream;
  const state = createFormatterState(writer);
  return { writer, state };
}

// ---- createFormatterState ----

describe("createFormatterState", () => {
  it("returns a state object with empty collections and default values", () => {
    const { writer, state } = setup();

    expect(state.messageRoles).toBeInstanceOf(Map);
    expect(state.messageRoles.size).toBe(0);
    expect(state.messageModels).toBeInstanceOf(Map);
    expect(state.messageModels.size).toBe(0);
    expect(state.messageSessions).toBeInstanceOf(Map);
    expect(state.messageSessions.size).toBe(0);
    expect(state.streamedParts).toBeInstanceOf(Set);
    expect(state.streamedParts.size).toBe(0);
    expect(state.toolsShown).toBeInstanceOf(Set);
    expect(state.toolsShown.size).toBe(0);
    expect(state.lastPartType).toBe("");
    expect(state.hasOutput).toBe(false);
    expect(state.assistantHeaderShown).toBeInstanceOf(Set);
    expect(state.assistantHeaderShown.size).toBe(0);
    expect(state.userHeaderShown).toBeInstanceOf(Set);
    expect(state.userHeaderShown.size).toBe(0);
    expect(state.writer).toBe(writer);
  });
});

// ---- formatEvent ----

describe("formatEvent", () => {
  it("returns 'Connected' line for server.connected event", () => {
    const { state } = setup();
    const lines = formatEvent({ type: "server.connected" }, state);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Connected");
  });

  it("returns empty array for unknown event types", () => {
    const { state } = setup();
    const lines = formatEvent({ type: "some.unknown.event" }, state);

    expect(lines).toEqual([]);
  });

  it("returns empty array for session.updated", () => {
    const { state } = setup();
    const lines = formatEvent({ type: "session.updated", properties: {} }, state);

    expect(lines).toEqual([]);
  });

  it("tracks message role in state for message.updated events", () => {
    const { state } = setup();
    const lines = formatEvent(
      {
        type: "message.updated",
        properties: {
          info: { id: "msg-1", role: "user", sessionID: "sess-1" },
        },
      },
      state,
    );

    expect(lines).toEqual([]);
    expect(state.messageRoles.get("msg-1")).toBe("user");
    expect(state.messageSessions.get("msg-1")).toBe("sess-1");
  });

  it("formats user text parts with '>' prefix for message.part.updated", () => {
    const { state } = setup();
    // Set up user role mapping first.
    state.messageRoles.set("msg-1", "user");
    state.messageSessions.set("msg-1", "sess-1");

    const lines = formatEvent(
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-1",
            messageID: "msg-1",
            sessionID: "sess-1",
            type: "text",
            text: "Hello world",
          },
        },
      },
      state,
    );

    expect(lines.length).toBeGreaterThanOrEqual(1);
    const textLine = lines.find((l) => l.includes("Hello world"));
    expect(textLine).toBeDefined();
    expect(textLine).toContain(">");
  });

  it("writes delta text to writer for message.part.delta events", () => {
    const { writer, state } = setup();
    // Set up assistant role mapping.
    state.messageRoles.set("msg-2", "assistant");
    state.messageSessions.set("msg-2", "sess-1");

    const lines = formatEvent(
      {
        type: "message.part.delta",
        properties: {
          messageID: "msg-2",
          partID: "part-2",
          sessionID: "sess-1",
          delta: "Hello",
          field: "text",
        },
      },
      state,
    );

    // Delta events return empty array (content goes to writer).
    expect(lines).toEqual([]);
    expect(writer.write).toHaveBeenCalledWith("Hello");
    expect(state.streamedParts.has("part-2")).toBe(true);
  });

  it("formats session.error with error message", () => {
    const { state } = setup();
    const lines = formatEvent(
      {
        type: "session.error",
        properties: {
          error: { message: "Something went wrong" },
        },
      },
      state,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Error:");
    expect(lines[0]).toContain("Something went wrong");
  });
});
