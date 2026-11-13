/**
 * Shared normalization for the taxonomy catalogue. Keyword `normalized_name`, keyword/topic `aliases`
 * and query-to-tag resolution must all go through these, or "Deep-Learning" and "deep learning" stop
 * meeting in the same row.
 */

export const TAXONOMY_LEVELS = ["domain", "field", "subfield", "topic"] as const;
export type TaxonomyLevel = (typeof TAXONOMY_LEVELS)[number];

/** Lowercase, strip diacritics, turn punctuation into spaces, collapse whitespace. */
export function normalizeTerm(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularWord(word: string): string {
  // Short words are often acronyms ("UMLS" is not the plural of "UML").
  if (word.length <= 4 || /(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(sses|xes|ches|shes|zes)$/.test(word)) return word.slice(0, -2);
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

/**
 * Looser key over a normalized term so spellings that only differ by spacing, hyphens or a plural last word meet:
 * "large language models", "large language model" and "health care" / "healthcare" share a key.
 */
export function keywordMatchKey(normalized: string): string {
  const words = normalized.split(" ").filter(Boolean);
  if (!words.length) return "";
  words[words.length - 1] = singularWord(words[words.length - 1]!);
  return words.join("");
}

/** An all-caps name ("GRADE", "UMLS") is an acronym and is never matched by spelling variants. */
export function isAcronym(displayName: string): boolean {
  return /[A-Z]{2}/.test(displayName) && displayName === displayName.toUpperCase();
}

/** Space-free spellings whose keywordMatchKey can equal `key`, for an SQL pre-filter on replace(normalized_name, ' ', ''). */
export function keywordMatchCandidates(key: string): string[] {
  const out = new Set([key, `${key}s`, `${key}es`]);
  if (key.endsWith("y")) out.add(`${key.slice(0, -1)}ies`);
  return [...out];
}

/** Normalized, de-duplicated, non-empty alias list. */
export function normalizeAliases(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeTerm).filter(Boolean))];
}

/** URL-safe tag slug matching the `tags_slug_check` constraint. */
export function slugifyTag(name: string): string {
  return normalizeTerm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}
