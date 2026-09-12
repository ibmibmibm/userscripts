import { loadFixture } from "./helpers";

const expectations: Record<string, { wrappers: number; rows: number; diskData: number; title: string }> = {
  "single-cd": { wrappers: 1, rows: 3, diskData: 0, title: "YOUTHFUL" },
  "two-cd-dvd": { wrappers: 3, rows: 28, diskData: 3, title: "Mr.Children 2011-2015" },
  "two-cd-duplicate": { wrappers: 2, rows: 27, diskData: 2, title: "Mr.Children 2011-2015" },
  "cd-bluray": { wrappers: 2, rows: 23, diskData: 2, title: "BEST -E-" },
  "thirteen-discs": { wrappers: 13, rows: 134, diskData: 13, title: "陰陽大全" },
  "music-list-empty-pos": { wrappers: 1, rows: 11, diskData: 0, title: "TODAY" },
};

describe("fixtures", () => {
  for (const [name, exp] of Object.entries(expectations)) {
    it(`${name} has the real modal structure`, () => {
      const body = loadFixture(name);
      expect(body.querySelector(".detail_data")).not.toBeNull();
      expect(body.querySelectorAll(".table_wrapper").length).toBe(exp.wrappers);
      expect(body.querySelectorAll(".table_wrapper .disk_data").length).toBe(exp.diskData);
      expect(body.querySelectorAll("table.cd-detail2-track-list tr td[data-th='曲順']").length).toBe(exp.rows);
      expect(body.querySelectorAll("table.cd-detail2-track-list tr.header").length).toBe(exp.wrappers);
      const title = body.parentElement!.querySelector(".modal-title")!.textContent!.trim();
      expect(title).toBe(exp.title);
    });
  }
});
