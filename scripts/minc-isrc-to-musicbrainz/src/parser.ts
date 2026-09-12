import type { DiscKind, MincDisc, MincRelease, MincTrack } from "./types";

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export function isValidIsrc(s: string): boolean {
  return ISRC_RE.test(s);
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function matchGroup(src: string, re: RegExp): string | null {
  const m = src.match(re);
  return m && m[1] !== undefined ? m[1] : null;
}

function toInt(s: string | null): number | null {
  if (s === null || s === "") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export function discKind(format: string): DiscKind {
  return /dvd|blu-?ray/i.test(format) ? "video" : "audio";
}

function parseDisc(wrapper: Element, position: number): MincDisc | null {
  const table = wrapper.querySelector("table.cd-detail2-track-list");
  if (!table) return null;

  let format = "CD";
  let catalogNumber: string | null = null;
  const diskData = wrapper.querySelector(".disk_data");
  if (diskData) {
    const t = text(diskData).normalize("NFKC");
    const f = matchGroup(t, /形態:\s*(.+?)\s*(?:カタログ番号|収録曲数|$)/);
    if (f && f.length > 0) format = f;
    catalogNumber = matchGroup(t, /カタログ番号:\s*(.+?)\s*(?:収録曲数|収録時間|Discタイトル|$)/);
    if (catalogNumber === "") catalogNumber = null;
  }

  const tracks: MincTrack[] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const orderCell = tr.querySelector('td[data-th="曲順"]');
    if (!orderCell) continue;
    const pos = toInt(text(orderCell));
    if (pos === null) continue;
    const rawIsrc = text(tr.querySelector('td[data-th="ISRC"]')).toUpperCase();
    tracks.push({
      position: pos,
      title: text(tr.querySelector('td[data-th="曲名"]')),
      isrc: isValidIsrc(rawIsrc) ? rawIsrc : null,
    });
  }

  return { position, format, kind: discKind(format), catalogNumber, tracks };
}

export function parseProductModal(modalBody: Element): MincRelease | null {
  const detail = modalBody.querySelector(".detail_data");
  if (!detail) return null;
  const wrappers = Array.from(modalBody.querySelectorAll(".table_wrapper"));
  const discs: MincDisc[] = [];
  for (const w of wrappers) {
    const d = parseDisc(w, discs.length + 1);
    if (d) discs.push(d);
  }
  if (discs.length === 0) return null;

  const modal = modalBody.closest(".modal") ?? modalBody.parentElement;
  const title = text(modal?.querySelector(".modal-title") ?? null);
  const header = text(detail);

  const catalogNumber = matchGroup(header, /品番：\s*(.+?)\s*(?:発売日|税抜価格|ジャンル|POS|$)/) ?? "";
  const barcodeRaw = matchGroup(header, /POS：\s*(\d*)/);
  const barcode = barcodeRaw && barcodeRaw.length > 0 ? barcodeRaw : null;

  return {
    title,
    catalogNumber,
    barcode,
    discCount: toInt(matchGroup(header, /セット数：\s*(\d+)/)),
    trackCount: toInt(matchGroup(header, /収録曲数：\s*(\d+)/)),
    discs,
  };
}
