/**
 * Turns an LLM probe phrase into a PostgreSQL tsquery for papers.search_document
 * (to_tsvector('simple', title || abstract)). PURE — no I/O.
 *
 * Matching is per word instead of the exact phrase, so "AI literacy" also hits
 * "literacy in AI" and "longitudinal study" hits "longitudinal studies". The
 * 'simple' config does not stem, so words are trimmed to a rough stem and matched
 * as prefixes ("stud:*" covers study/studies/studied).
 */

import type { GapProbe } from "@trend/shared-types";

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

const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Searchable terms of a phrase: short tokens match exactly, the rest as stem prefixes. Deduplicated, stopwords removed. */
export function probeTerms(phrase: string): Array<{ term: string; exact: boolean }> {
  const terms = new Map<string, boolean>();
  for (const word of wordsOf(phrase)) {
    if (STOPWORDS.has(word)) continue;
    const exact = word.length <= MAX_EXACT_LENGTH;
    terms.set(exact ? word : stemProbeWord(word), exact);
  }
  return [...terms].map(([term, exact]) => ({ term, exact }));
}

/** Returns null when the phrase has no searchable words. Output contains only letters, digits, '&' and ':*'. */
export function buildProbeTsQuery(phrase: string): string | null {
  const terms = probeTerms(phrase).map(({ term, exact }) => (exact ? term : `${term}:*`));
  return terms.length ? terms.join(" & ") : null;
}

/** True when at least one text contains every term of the phrase (word-wise, same matching as the tsquery). */
export function probeAppearsIn(phrase: string, texts: string[]): boolean {
  const terms = probeTerms(phrase);
  if (!terms.length) return false;
  return texts.some((text) => {
    const words = wordsOf(text);
    return terms.every(({ term, exact }) => words.some((word) => (exact ? word === term : word.startsWith(term))));
  });
}

/** Keeps a probe only when both of its topics occur in the evidence it was derived from; the LLM may invent topics. */
export function verifyProbe(probe: GapProbe | undefined, texts: string[]): GapProbe | undefined {
  if (!probe?.topicA || !probe?.topicB) return undefined;
  return probeAppearsIn(probe.topicA, texts) && probeAppearsIn(probe.topicB, texts) ? probe : undefined;
}
