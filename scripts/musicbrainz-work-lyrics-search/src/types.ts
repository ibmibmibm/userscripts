export interface Query {
  title: string;
  artist: string;
  lyricist: string;
  composer: string;
}

export type Field = keyof Query;

export const FIELDS: Field[] = ["title", "artist", "lyricist", "composer"];

/** One search result row. Fields the site does not list are "". */
export interface Row {
  url: string;
  title: string;
  artist: string;
  lyricist: string;
  composer: string;
}

export interface Site {
  id: string; // "j-lyric"
  name: string; // "J-Lyric"
  origin: string; // "https://j-lyric.net"
  charset?: string; // "shift_jis" for pages that are not UTF-8
  buildUrl(q: Query): string;
  parse(doc: Document, origin: string): Row[];
}

export interface ScoredRow {
  row: Row;
  score: number;
  matched: Field[];
}

export interface WorkPeople {
  artist: string;
  lyricist: string;
  composer: string;
}

export interface PageInfo {
  kind: "edit" | "create";
  mbid: string | null;
  title: string;
}
