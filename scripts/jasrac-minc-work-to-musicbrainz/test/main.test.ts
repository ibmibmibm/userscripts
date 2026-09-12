import { enhance, siteOf } from "../src/main";
import type { UiDeps } from "../src/ui";
import { emptyDocument, jwidDocument, mincDocument } from "./helpers";

const deps: UiDeps = {
  version: "1.0.0",
  searchByIswc: async () => [],
  searchByTitle: async () => [],
  lookupWork: async () => {
    throw new Error("unused");
  },
  open: () => null,
};

describe("siteOf", () => {
  it("maps hostnames to sites", () => {
    expect(siteOf("www2.jasrac.or.jp")).toBe("jwid");
    expect(siteOf("www.minc.or.jp")).toBe("minc");
    expect(siteOf("musicbrainz.org")).toBeNull();
  });
});

describe("enhance", () => {
  it("adds one panel to a J-WID page and never a second", () => {
    const doc = jwidDocument("jwid-70342415");
    expect(enhance(doc, "jwid", deps)).toBe("added");
    expect(enhance(doc, "jwid", deps)).toBe("present");
    expect(doc.querySelectorAll(".jasrac-minc-mb").length).toBe(1);
  });

  it("adds one panel to a minc page", () => {
    const doc = mincDocument("minc-25707965-N00913658");
    expect(enhance(doc, "minc", deps)).toBe("added");
    expect(enhance(doc, "minc", deps)).toBe("present");
    expect(doc.querySelectorAll(".jasrac-minc-mb").length).toBe(1);
  });

  it("returns none and warns once when the page has no work", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = emptyDocument("https://www2.jasrac.or.jp/eJwid/main?trxID=F20101");
    expect(enhance(doc, "jwid", deps)).toBe("none");
    expect(enhance(doc, "jwid", deps)).toBe("none");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("jwid");
    warn.mockRestore();
  });
});
