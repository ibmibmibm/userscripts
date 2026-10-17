import { gmPostForm, type GmDetails } from "../src/fetch";

describe("gmPostForm", () => {
  it("posts a URL-encoded form and resolves the text on 2xx", async () => {
    let seen: GmDetails | null = null;
    const request = (d: GmDetails) => {
      seen = d;
      d.onload({ status: 200, responseText: "[]" });
    };
    await expect(gmPostForm("https://translate.googleapis.com/x", { q: "a b\n是" }, request)).resolves.toBe("[]");
    expect(seen!.method).toBe("POST");
    expect(seen!.data).toBe("q=a+b%0A%E6%98%AF");
    expect(seen!.headers["Content-Type"]).toContain("application/x-www-form-urlencoded");
  });

  it("rejects on HTTP errors, network errors, and timeouts", async () => {
    await expect(gmPostForm("u", {}, (d) => d.onload({ status: 429, responseText: "" }))).rejects.toThrow("HTTP 429");
    await expect(gmPostForm("u", {}, (d) => d.onerror())).rejects.toThrow("Request failed");
    await expect(gmPostForm("u", {}, (d) => d.ontimeout())).rejects.toThrow("Timed out");
  });
});
