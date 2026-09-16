import { splitNames } from "./normalize";
import { FIELDS, type Query } from "./types";

/**
 * The query the sites see. Every site joins the words of a field with AND, so a people field that
 * holds alternatives ("May'n / Salamander Factory", three artist credits of one work) matches
 * nothing. Such a field becomes "" here. The full value stays in the panel and still ranks the
 * results.
 */
export function searchQuery(q: Query): Query {
  const out = { ...q };
  for (const f of FIELDS) {
    if (f !== "title" && splitNames(q[f]).length > 1) out[f] = "";
  }
  return out;
}
