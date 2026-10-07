/**
 * Turns an LLM probe phrase into a PostgreSQL tsquery for papers.search_document
 * (to_tsvector('simple', title || abstract)). PURE — no I/O.
 *
 * Matching is per word instead of the exact phrase, so "AI literacy" also hits
 * "literacy in AI" and "longitudinal study" hits "longitudinal studies". The
 * 'simple' config does not stem, so words are trimmed to a rough stem and matched
 * as prefixes ("stud:*" covers study/studies/studied).
 */

const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "via", "vs", "versus",
]);

// Longest first; only applied when at least MIN_STEM_LENGTH characters remain.
const SUFFIXES = ["ies", "ing", "es", "ed", "um", "s", "y", "a"];
const MIN_STEM_LENGTH = 4;
// Tokens this short ("ai", "ml") are matched exactly; as prefixes they would hit "aim", "mlp", ...
const MAX_EXACT_LENGTH = 2;

export function stemProbeWord(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Returns null when the phrase has no searchable words. Output contains only letters, digits, '&' and ':*'. */
export function buildProbeTsQuery(phrase: string): string | null {
  const words = phrase
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !STOPWORDS.has(word));
  const terms = [...new Set(words.map((word) => (word.length <= MAX_EXACT_LENGTH ? word : `${stemProbeWord(word)}:*`)))];
  return terms.length ? terms.join(" & ") : null;
}
