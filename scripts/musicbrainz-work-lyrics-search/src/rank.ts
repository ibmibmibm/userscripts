import { namesOverlap, titlesMatch } from "./normalize";
import { FIELDS, type Field, type Query, type Row, type ScoredRow } from "./types";

function fieldMatches(field: Field, query: string, value: string): boolean {
  if (!query.trim() || !value.trim()) return false;
  return field === "title" ? titlesMatch(query, value) : namesOverlap(query, value);
}

export function scoreRow(query: Query, row: Row): ScoredRow {
  const matched = FIELDS.filter((f) => fieldMatches(f, query[f], row[f]));
  return { row, score: matched.length, matched };
}

/** Highest score first; equal scores keep the site's order. */
export function rankRows(query: Query, rows: Row[]): ScoredRow[] {
  return rows
    .map((row, index) => ({ scored: scoreRow(query, row), index }))
    .sort((a, b) => b.scored.score - a.scored.score || a.index - b.index)
    .map((x) => x.scored);
}
