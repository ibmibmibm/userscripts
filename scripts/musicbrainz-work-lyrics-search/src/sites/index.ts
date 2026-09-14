import type { Site } from "../types";
import { jLyric } from "./j-lyric";
import { joysound } from "./joysound";
import { kashinavi } from "./kashinavi";
import { petitlyrics } from "./petitlyrics";
import { utaNet } from "./uta-net";
import { utaten } from "./utaten";

export const SITES: Site[] = [jLyric, utaten, utaNet, kashinavi, petitlyrics, joysound];

export const MUSIXMATCH_SEARCH = "https://www.musixmatch.com/search";
