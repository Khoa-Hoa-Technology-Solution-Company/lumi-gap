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

/** Normalized, de-duplicated, non-empty alias list. */
export function normalizeAliases(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeTerm).filter(Boolean))];
}

/** URL-safe tag slug matching the `tags_slug_check` constraint. */
export function slugifyTag(name: string): string {
  return normalizeTerm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}
