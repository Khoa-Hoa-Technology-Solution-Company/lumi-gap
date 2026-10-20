/**
 * Turns an LLM probe phrase into a PostgreSQL tsquery for papers.search_document
 * (to_tsvector('simple', title || abstract)). PURE — no I/O.
 *
 * Matching is per word instead of the exact phrase, so "AI literacy" also hits
 * "literacy in AI" and "longitudinal study" hits "longitudinal studies". The
 * 'simple' config does not stem, so words are trimmed to a rough stem and matched
 * as prefixes ("analys:*" covers analysis/analyses). A word ending in consonant + y
 * gets two prefixes ("study:* | studi:*") instead of the bare stem "stud:*", which
 * would also hit "student".
 */

import type { GapProbe } from "@trend/shared-types";

const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with", "via", "vs", "versus",
]);

const MIN_STEM_LENGTH = 4;
// "a" only on longer words (curricula, criteria, formula), so "media" does not become "medi:*" and hit "medical".
const MIN_A_STEM_LENGTH = 5;
// Tokens this short ("ai", "ml") are matched exactly; as prefixes they would hit "aim", "mlp", ...
const MAX_EXACT_LENGTH = 2;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

const strip = (word: string, suffix: string, min = MIN_STEM_LENGTH) =>
  word.endsWith(suffix) && word.length - suffix.length >= min ? word.slice(0, -suffix.length) : null;

/** Stem of a word plus, for consonant + y words, the "i" form its other inflections use (study → study, studi). */
function stemForms(word: string): { stem: string; alt?: string } {
  const ies = strip(word, "ies");
  if (ies) return { stem: `${ies}y`, alt: `${ies}i` };
  const y = strip(word, "y");
  if (y && !VOWELS.has(y.at(-1)!)) return { stem: word, alt: `${y}i` };
  const sis = word.endsWith("sis") ? strip(word, "is") : null; // analysis → analys (also reached from analyses)
  if (sis) return { stem: sis };
  for (const suffix of ["ing", "es", "ed", "um"]) { const stem = strip(word, suffix); if (stem) return { stem }; }
  // No "s" after s, u or i: class, process, corpus, status, basis are singular.
  const s = strip(word, "s");
  if (s && !["s", "u", "i"].includes(s.at(-1)!)) return { stem: s };
  const a = strip(word, "a", MIN_A_STEM_LENGTH);
  if (a) return { stem: a };
  return { stem: word };
}

export function stemProbeWord(word: string): string {
  return stemForms(word).stem;
}

const wordsOf = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export interface ProbeTerm { term: string; exact: boolean; alt?: string }

/** Searchable terms of a phrase: short tokens match exactly, the rest as stem prefixes. Deduplicated, stopwords removed. */
export function probeTerms(phrase: string): ProbeTerm[] {
  const terms = new Map<string, ProbeTerm>();
  for (const word of wordsOf(phrase)) {
    if (STOPWORDS.has(word)) continue;
    if (word.length <= MAX_EXACT_LENGTH) { terms.set(word, { term: word, exact: true }); continue; }
    const { stem, alt } = stemForms(word);
    terms.set(stem, alt ? { term: stem, exact: false, alt } : { term: stem, exact: false });
  }
  return [...terms.values()];
}

/** Returns null when the phrase has no searchable words. Output contains only letters, digits, '&', '|', parentheses and ':*'. */
export function buildProbeTsQuery(phrase: string): string | null {
  const terms = probeTerms(phrase).map(({ term, exact, alt }) => (exact ? term : alt ? `(${term}:* | ${alt}:*)` : `${term}:*`));
  return terms.length ? terms.join(" & ") : null;
}

const termMatches = ({ term, exact, alt }: ProbeTerm, word: string) =>
  exact ? word === term : word.startsWith(term) || (alt !== undefined && word.startsWith(alt));

/** True when at least one text contains every term of the phrase (word-wise, same matching as the tsquery). */
export function probeAppearsIn(phrase: string, texts: string[]): boolean {
  const terms = probeTerms(phrase);
  if (!terms.length) return false;
  return texts.some((text) => {
    const words = wordsOf(text);
    return terms.every((term) => words.some((word) => termMatches(term, word)));
  });
}

/** Keeps a probe only when both of its topics occur in the evidence it was derived from; the LLM may invent topics. */
export function verifyProbe(probe: GapProbe | undefined, texts: string[]): GapProbe | undefined {
  if (!probe?.topicA || !probe?.topicB) return undefined;
  return probeAppearsIn(probe.topicA, texts) && probeAppearsIn(probe.topicB, texts) ? probe : undefined;
}
