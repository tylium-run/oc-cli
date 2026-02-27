import { describe, it, expect } from "vitest";
import { resolveDotPath, filterFields, filterData } from "../src/lib/output.js";

// ---- resolveDotPath ----

describe("resolveDotPath", () => {
  it("resolves nested dot path to the leaf value", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(resolveDotPath(obj, "a.b.c")).toBe(42);
  });

  it("returns undefined when an intermediate key is missing or non-object", () => {
    const obj = { a: 1 };
    expect(resolveDotPath(obj, "a.b.c")).toBeUndefined();
  });
});

// ---- filterFields ----

describe("filterFields", () => {
  it("returns objects containing only the specified comma-separated keys", () => {
    const data = [
      { id: 1, name: "alice", extra: true },
      { id: 2, name: "bob", extra: false },
    ];
    const result = filterFields(data, "id,name");
    expect(result).toEqual([
      { id: 1, name: "alice" },
      { id: 2, name: "bob" },
    ]);
  });
});

// ---- filterData ----

describe("filterData", () => {
  it("filters rows by case-insensitive substring match on a single filter", () => {
    const data = [
      { slug: "brave-project", title: "Brave" },
      { slug: "firefox-project", title: "Firefox" },
    ];
    const result = filterData(data, ["slug=BRAVE"]);
    expect(result).toEqual([{ slug: "brave-project", title: "Brave" }]);
  });

  it("requires all filters to match (AND logic) with multiple filters", () => {
    const data = [
      { slug: "brave-project", title: "Linear Brave" },
      { slug: "brave-project", title: "Notion Brave" },
      { slug: "firefox-project", title: "Linear Firefox" },
    ];
    const result = filterData(data, ["slug=brave", "title=linear"]);
    expect(result).toEqual([{ slug: "brave-project", title: "Linear Brave" }]);
  });
});
