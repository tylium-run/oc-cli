import { describe, it, expect, vi } from "vitest";
import { type SessionStatus } from "@opencode-ai/sdk/v2";
import { checkSessionStatus } from "../src/lib/wait.js";

// ---- Mock Client Factory ----
// Builds a minimal mock of the OpencodeClient with just the session
// methods that checkSessionStatus uses: session.get() and session.status().

function mockClient(options: {
  getResult?: Record<string, unknown>;
  getError?: Error;
  statusMap?: Record<string, SessionStatus>;
  statusError?: Error;
}) {
  return {
    session: {
      get: vi.fn().mockImplementation(async () => {
        if (options.getError) throw options.getError;
        return { data: options.getResult ?? { id: "test-session" } };
      }),
      status: vi.fn().mockImplementation(async () => {
        if (options.statusError) throw options.statusError;
        return { data: options.statusMap ?? {} };
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ---- checkSessionStatus ----

describe("checkSessionStatus", () => {
  it("returns { type: 'idle' } when session has no entry in the status map", async () => {
    const client = mockClient({ statusMap: {} });
    const result = await checkSessionStatus(client, "sess-123");

    expect(result).toEqual({ type: "idle" });
    expect(client.session.get).toHaveBeenCalledWith({ sessionID: "sess-123" });
    expect(client.session.status).toHaveBeenCalled();
  });

  it("returns { type: 'busy' } when session is busy", async () => {
    const client = mockClient({
      statusMap: { "sess-123": { type: "busy" } },
    });
    const result = await checkSessionStatus(client, "sess-123");

    expect(result).toEqual({ type: "busy" });
  });

  it("returns retry status with full details", async () => {
    const retryStatus: SessionStatus = {
      type: "retry",
      attempt: 2,
      message: "Rate limited",
      next: 1500,
    };
    const client = mockClient({
      statusMap: { "sess-123": retryStatus },
    });
    const result = await checkSessionStatus(client, "sess-123");

    expect(result).toEqual(retryStatus);
  });

  it("throws when session.get() fails (404 not found)", async () => {
    const client = mockClient({
      getError: new Error("404: Session not found"),
    });

    await expect(checkSessionStatus(client, "nonexistent")).rejects.toThrow(
      "404: Session not found",
    );
    // status() should not be called if get() throws.
    expect(client.session.status).not.toHaveBeenCalled();
  });

  it("throws when session.get() fails with a generic error", async () => {
    const client = mockClient({
      getError: new Error("ECONNREFUSED"),
    });

    await expect(checkSessionStatus(client, "sess-123")).rejects.toThrow("ECONNREFUSED");
  });

  it("returns idle when session exists but is not in a different session's status map", async () => {
    const client = mockClient({
      statusMap: { "other-session": { type: "busy" } },
    });
    const result = await checkSessionStatus(client, "sess-123");

    expect(result).toEqual({ type: "idle" });
  });

  it("returns idle when session status is explicitly idle", async () => {
    const client = mockClient({
      statusMap: { "sess-123": { type: "idle" } },
    });
    const result = await checkSessionStatus(client, "sess-123");

    expect(result).toEqual({ type: "idle" });
  });
});

// ---- printErrorWithCode ----

describe("printErrorWithCode", () => {
  it("outputs JSON error to stderr and exits with specified code", async () => {
    // We need to import this in a way that lets us spy on process.exit.
    // Since printErrorWithCode calls process.exit(), we mock it.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { printErrorWithCode } = await import("../src/lib/output.js");

    printErrorWithCode("Timeout exceeded", 2);

    expect(stderrSpy).toHaveBeenCalledWith(JSON.stringify({ error: "Timeout exceeded" }));
    expect(exitSpy).toHaveBeenCalledWith(2);

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("exits with code 3 for connection errors", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { printErrorWithCode } = await import("../src/lib/output.js");

    printErrorWithCode("Connection error: ECONNREFUSED", 3);

    expect(stderrSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: "Connection error: ECONNREFUSED" }),
    );
    expect(exitSpy).toHaveBeenCalledWith(3);

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
