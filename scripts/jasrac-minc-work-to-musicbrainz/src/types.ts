export type Source = "JASRAC" | "NexTone";
export type Site = "jwid" | "minc";

export interface TitleLine {
  kind: string; // "正題", "副題1", …; minc gives "副題"
  title: string; // as written on the page
  kana: string | null; // J-WID only
  romaji: string | null; // J-WID only
  searchName: boolean; // title starts with ＊ (marker kept in title)
}

export interface Credit {
  source: Source;
  name: string; // as written on the page
  role: string; // 識別 as written
  trust: string | null; // 信託状況 (minc) or 契約 (J-WID)
  society: string | null; // 所属団体 (J-WID only)
  note: string | null; // 特記 (J-WID only)
}

export interface WorkInfo {
  site: Site;
  sourceUrl: string;
  title: string;
  jasracCode: string | null; // "703-4241-5"
  nextoneCode: string | null; // "N00913658"
  iswc: string | null; // "T-102.054.195-9"
  domestic: boolean | null;
  titles: TitleLine[];
  artists: string[];
  credits: Credit[];
}

export interface WorkHit {
  mbid: string;
  title: string;
  type: string | null;
  iswcs: string[];
  disambiguation: string | null;
  writers: string; // "米津玄師 (composer), 米津玄師 (lyricist)"
}

export interface MbRelation {
  linkTypeId: string;
  targetType: "artist" | "label";
  name: string;
  sortName: string;
  attributes: string[]; // attribute names as the web service gives them
}

export interface MbWork {
  mbid: string;
  title: string;
  type: string | null;
  languages: string[];
  iswcs: string[];
  attributes: { type: string; value: string }[];
  relations: MbRelation[];
}
