import { gmFetchText, type GmDetails } from "../src/fetch";

describe("gmFetchText", () => {
  it("resolves the response text on 2xx and passes the charset as a mime override", async () => {
    let seen: GmDetails | null = null;
    const request = (d: GmDetails) => {
      seen = d;
      d.onload({ status: 200, responseText: "<p>ok</p>" });
    };
    await expect(gmFetchText("https://kashinavi.com/search.php?kyoku=x", "shift_jis", request)).resolves.toBe("<p>ok</p>");
    expect(seen!.method).toBe("GET");
    expect(seen!.timeout).toBe(15000);
    expect(seen!.overrideMimeType).toBe("text/html; charset=shift_jis");
    let plain: GmDetails | null = null;
    await gmFetchText("https://j-lyric.net/", undefined, (d) => ((plain = d), d.onload({ status: 200, responseText: "" })));
    expect(plain!.overrideMimeType).toBeUndefined();
  });

  it("rejects on HTTP errors, network errors, and timeouts", async () => {
    await expect(gmFetchText("u", undefined, (d) => d.onload({ status: 503, responseText: "" }))).rejects.toThrow("HTTP 503");
    await expect(gmFetchText("u", undefined, (d) => d.onerror())).rejects.toThrow("Request failed");
    await expect(gmFetchText("u", undefined, (d) => d.ontimeout())).rejects.toThrow("Timed out");
  });
});
