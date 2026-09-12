export interface MincTrack {
  position: number;
  title: string;
  isrc: string | null;
}

export type DiscKind = "audio" | "video";

export interface MincDisc {
  position: number;
  format: string;
  kind: DiscKind;
  catalogNumber: string | null;
  tracks: MincTrack[];
}

export interface MincRelease {
  title: string;
  catalogNumber: string;
  barcode: string | null;
  discCount: number | null;
  trackCount: number | null;
  discs: MincDisc[];
}

export interface MbMedium {
  position: number;
  format: string | null;
  trackCount: number;
}

export interface MbReleaseHit {
  mbid: string;
  title: string;
  artist: string;
  date: string | null;
  country: string | null;
  catalogNumbers: string[];
  barcode: string | null;
  media: MbMedium[];
}
