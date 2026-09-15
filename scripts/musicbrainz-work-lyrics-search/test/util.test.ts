import { abs, withParams } from "../src/sites/util";

describe("abs", () => {
  it("resolves a relative href against the origin", () => {
    expect(abs("https://example.com", "/lyrics/1/")).toBe("https://example.com/lyrics/1/");
  });

  it("rejects a javascript: href", () => {
    expect(abs("https://example.com", "javascript:alert(1)")).toBe("");
  });

  it("returns \"\" for a missing href", () => {
    expect(abs("https://example.com", null)).toBe("");
    expect(abs("https://example.com", undefined)).toBe("");
  });
});

describe("withParams", () => {
  it("percent-encodes with the default (URLSearchParams-style) encoding", () => {
    expect(withParams("https://example.com/search", { q: "a b" })).toBe("https://example.com/search?q=a+b");
  });

  it("uses a custom encoder for every value when given one", () => {
    expect(withParams("https://example.com/search", { q: "AB" }, (v) => v.split("").reverse().join(""))).toBe("https://example.com/search?q=BA");
  });

  it("returns the base URL when there are no non-empty params", () => {
    expect(withParams("https://example.com/search", { q: "  " })).toBe("https://example.com/search");
  });
});
