import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = join(here, "raw");

const HEADER_ROW =
  '<tr class="header"><th class="cd-detail2-kyokujyun">曲順</th><th class="cd-detail2-kyokumed">メドレー</th>' +
  '<th class="cd-detail2-kyokunm">曲名</th><th class="cd-detail2-iv">IV</th><th class="cd-detail2-time">収録時間</th>' +
  '<th class="cd-detail2-artist">アーティスト</th><th class="cd-detail2-isrc">ISRC</th>' +
  '<th class="cd-detail2-jassakucd">JASRAC<br>作品コード</th><th class="cd-detail2-ntsakucd">NexTone<br>作品コード</th>' +
  '<th class="cd-detail2-link">著作権<br>管理情報</th></tr>';

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function trackRow(cells) {
  const [order, medley, title, iv, time, artist, isrc, jasrac, nextone, link] = cells;
  return (
    `<tr><td data-th="曲順">${esc(order)}</td><td data-th="メドレー">${esc(medley)}</td>` +
    `<td data-th="曲名">${esc(title)}</td><td data-th="IV">${esc(iv)}</td>` +
    `<td data-th="収録時間">${esc(time)}</td><td data-th="アーティスト">${esc(artist)}</td>` +
    `<td data-th="ISRC"> ${esc(isrc)} </td><td data-th="JASRAC作品コード"> ${esc(jasrac)} </td>` +
    `<td data-th="NexTone作品コード"> ${esc(nextone)} </td>` +
    `<td data-th="著作権管理情報">${link ? `<a>${esc(link)}</a>` : " "}</td></tr>`
  );
}

export function generate(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  let title = "";
  const headerCells = [];
  const wrappers = [];
  let current = null;

  for (const line of lines) {
    const [kind, ...rest] = line.split("|");
    if (kind === "T") title = rest.join("|");
    else if (kind === "H") headerCells.push({ cls: rest[0], text: rest.slice(1).join("|") });
    else if (kind === "D") {
      current = { diskCells: rest.slice(1).filter((c) => c.length > 0), collapseIn: false, rows: [] };
      wrappers.push(current);
    } else if (kind === "C") current.collapseIn = rest[0] === "in";
    else if (kind === "R") current.rows.push(trackRow(rest));
    else if (kind === "S") current.rows.push(trackRow([rest[0], "0", rest[1], "V", "0", "陰陽座", rest[2], "-", "-", "管理情報"]));
    else throw new Error(`unknown line kind: ${line}`);
  }

  const cell = (c) => `<div class="${c.cls}">${esc(c.text)}</div>`;
  const row1 = headerCells.slice(0, 4).map(cell).join("");
  const row2 = headerCells.slice(4, 8).map(cell).join("");
  const company = headerCells[8];
  const companyHtml =
    `<div class="col-sm-9"> ${esc(company.text.replace(/ ※集中管理.*$/, ""))} <br><span>※集中管理</span>： ` +
    `<span class="icon delegation active">委任者</span><span class="icon delegation">非委任者</span></div>` +
    `<div class="col-sm-3"><button class="btn btn-success description-of-cd-detail"><i class="fas fa-question-circle"></i> 用語の説明</button></div>`;

  const wrapperHtml = wrappers
    .map((w) => {
      const disk =
        w.diskCells.length === 0
          ? ""
          : `<div class="disk_data"><div class="row">` +
            w.diskCells
              .map((c) => {
                const eq = c.indexOf("=");
                const cls = c.slice(0, eq);
                const inner = c.slice(eq + 1).split("{br}").map(esc).join("<br>");
                return `<div class="${cls}">${inner || " "}</div>`;
              })
              .join("") +
            `</div></div>`;
      return (
        `<div class="table_wrapper">${disk}<a></a><div class="collapse${w.collapseIn ? " in" : ""}">` +
        `<table class="responsive_table cd-detail2-track-list table table-condensed"><tbody>${HEADER_ROW}${w.rows.join("")}</tbody></table></div></div>`
      );
    })
    .join("");

  return (
    `<div class="modal-content"><div class="modal-header"> <button class="close" data-dismiss="modal" area-hidden="true"> × </button>` +
    `<h4 class="modal-title"> ${esc(title)} </h4> </div><div class="modal-body"> <div class="detail_data">` +
    `<div class="clearfix">${row1}</div><div class="clearfix">${row2}</div><div class="clearfix">${companyHtml}</div></div>` +
    `<span class="modal-alubum-list" style="display:none"></span>${wrapperHtml} </div></div>\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of readdirSync(rawDir)) {
    if (!name.endsWith(".txt")) continue;
    const raw = readFileSync(join(rawDir, name), "utf8");
    const out = join(here, name.replace(/\.txt$/, ".html"));
    writeFileSync(out, generate(raw));
    console.log("wrote", out);
  }
}
