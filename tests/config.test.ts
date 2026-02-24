import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs before importing the module under test.
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "node:fs";
import { resolveConfig, getGlobalConfigSource, type CliOverrides } from "../src/lib/config.js";

// ---- Helpers ----

function mockConfigFile(config: Record<string, unknown>): void {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));
}

function mockNoConfigFile(): void {
  vi.mocked(existsSync).mockReturnValue(false);
}

// ---- Setup ----

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OC_BASE_URL;
  delete process.env.OC_TITLE_PREFIX;
});

// ---- resolveConfig ----

describe("resolveConfig", () => {
  it("auto-selects the only profile when exactly one exists", () => {
    mockConfigFile({
      profiles: {
        "my-project": { baseUrl: "https://example.com" },
      },
    });

    const config = resolveConfig();
    expect(config.activeProfile).toBe("my-project");
    expect(config.baseUrl).toBe("https://example.com");
  });

  it("throws when no profiles are configured", () => {
    mockNoConfigFile();

    expect(() => resolveConfig()).toThrow("No profiles configured");
  });

  it("throws when multiple profiles exist without explicit selection", () => {
    mockConfigFile({
      profiles: {
        alpha: { baseUrl: "https://alpha.com" },
        beta: { baseUrl: "https://beta.com" },
      },
    });

    expect(() => resolveConfig()).toThrow("Multiple profiles configured");
  });

  it("selects the explicitly named profile via overrides.profile", () => {
    mockConfigFile({
      profiles: {
        alpha: { baseUrl: "https://alpha.com" },
        beta: { baseUrl: "https://beta.com" },
      },
    });

    const config = resolveConfig({ profile: "beta" });
    expect(config.activeProfile).toBe("beta");
    expect(config.baseUrl).toBe("https://beta.com");
  });

  it("throws when the named profile does not exist", () => {
    mockConfigFile({
      profiles: {
        alpha: { baseUrl: "https://alpha.com" },
      },
    });

    expect(() => resolveConfig({ profile: "nonexistent" })).toThrow(
      'Profile "nonexistent" not found',
    );
  });

  it("uses CLI baseUrl override over profile value", () => {
    mockConfigFile({
      profiles: {
        "my-project": { baseUrl: "https://profile.com" },
      },
    });

    const overrides: CliOverrides = { baseUrl: "https://cli-override.com" };
    const config = resolveConfig(overrides);
    expect(config.baseUrl).toBe("https://cli-override.com");
  });
});

// ---- getGlobalConfigSource ----

describe("getGlobalConfigSource", () => {
  it("returns 'default' when titlePrefix is not set anywhere", () => {
    mockNoConfigFile();

    const source = getGlobalConfigSource("titlePrefix");
    expect(source).toBe("default");
  });
});
