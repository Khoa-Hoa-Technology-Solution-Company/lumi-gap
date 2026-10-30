import type { DetectedTag, ScoredPaper } from "@trend/shared-types";
import { normalizeTerm } from "../taxonomy/taxonomy.normalize.js";

const MAX_TAXONOMY_BOOST = 0.08;
/** Cap on the existing name-overlap boost plus the detected-tag boost together. */
const MAX_COMBINED_BOOST = 0.12;
/** Boost per matched detected tag, scaled by the tag's confidence. */
const DETECTED_TAG_WEIGHT = 0.05;

const TAXONOMY_WEIGHTS = {
  topicName: 0.04,
  subfieldName: 0.03,
  fieldName: 0.02,
  domainName: 0.015,
  primaryTopic: 0.01,
} as const;

type TaxonomyPaper = Pick<ScoredPaper, "topics">;

export function annotateTaxonomyBoost<T extends TaxonomyPaper>(
  query: string,
  papers: T[],
): Array<T & { taxonomyBoostScore?: number }> {
  return papers.map((paper) => ({
    ...paper,
    taxonomyBoostScore: computeTaxonomyBoost(query, paper),
  }));
}

export function computeTaxonomyBoost(query: string, paper: TaxonomyPaper): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  let boost = 0;
  for (const topic of paper.topics ?? []) {
    boost += matchingWeight(normalizedQuery, topic.topicName, TAXONOMY_WEIGHTS.topicName);
    boost += matchingWeight(normalizedQuery, topic.subfieldName, TAXONOMY_WEIGHTS.subfieldName);
    boost += matchingWeight(normalizedQuery, topic.fieldName, TAXONOMY_WEIGHTS.fieldName);
    boost += matchingWeight(normalizedQuery, topic.domainName, TAXONOMY_WEIGHTS.domainName);
    if (topic.isPrimary && matchingWeight(normalizedQuery, topic.topicName, 1) > 0) {
      boost += TAXONOMY_WEIGHTS.primaryTopic;
    }
  }

  return round2(Math.min(MAX_TAXONOMY_BOOST, boost));
}

type TagBoostPaper = Pick<ScoredPaper, "topics" | "keywords" | "taxonomyBoostScore">;

/**
 * Lift papers that carry the taxonomy nodes / keywords the query was resolved to. Each matched tag adds
 * 0.05 x its confidence on top of the name-overlap boost; the combined value is capped at 0.12.
 * A no-op (same array content) when there are no tags.
 */
export function applyDetectedTagBoost<T extends TagBoostPaper>(papers: T[], tags: readonly DetectedTag[]): T[] {
  if (tags.length === 0) return papers;
  const prepared = tags.map((tag) => ({ tag, keywordPhrases: keywordPhrases(tag) }));
  return papers.map((paper) => {
    let tagBoost = 0;
    for (const { tag, keywordPhrases: phrases } of prepared) {
      if (paperMatchesTag(paper, tag, phrases)) tagBoost += DETECTED_TAG_WEIGHT * tag.confidence;
    }
    if (tagBoost === 0) return paper;
    const combined = Math.min(MAX_COMBINED_BOOST, Number(paper.taxonomyBoostScore ?? 0) + tagBoost);
    return { ...paper, taxonomyBoostScore: Math.round(combined * 1000) / 1000 };
  });
}

/** True when the paper carries the tag's taxonomy node or keyword (same rule the boost uses). */
export function paperCarriesTag(paper: TagBoostPaper, tag: DetectedTag): boolean {
  return paperMatchesTag(paper, tag, keywordPhrases(tag));
}

/** Normalized strings a paper's keyword may carry to count as this keyword tag. */
function keywordPhrases(tag: DetectedTag): Set<string> {
  if (tag.kind !== "keyword") return new Set();
  const phrases = new Set([normalizeTerm(tag.name)]);
  // matchedText is the catalogue name/alias that met the query, except for fuzzy matches (it is the query then).
  if (tag.source !== "fuzzy") phrases.add(tag.matchedText);
  phrases.delete("");
  return phrases;
}

function paperMatchesTag(paper: TagBoostPaper, tag: DetectedTag, phrases: Set<string>): boolean {
  if (tag.kind === "keyword") {
    return (paper.keywords ?? []).some((raw) => {
      const keyword = raw as unknown as string | { keywordId?: string; keywordName?: string };
      if (typeof keyword === "string") return phrases.has(normalizeTerm(keyword));
      return keyword.keywordId === tag.id || phrases.has(normalizeTerm(keyword.keywordName ?? ""));
    });
  }
  const wanted = shortOpenAlexId(tag.openalexId);
  if (!wanted) return false;
  return (paper.topics ?? []).some((topic) => {
    switch (tag.kind) {
      case "topic": return shortOpenAlexId(topic.openalexTopicId) === wanted;
      case "subfield": return shortOpenAlexId(topic.subfieldId) === wanted;
      case "field": return shortOpenAlexId(topic.fieldId) === wanted;
      case "domain": return shortOpenAlexId(topic.domainId) === wanted;
      default: return false;
    }
  });
}

/** "https://openalex.org/T10028" and "t10028" both reduce to "t10028". */
function shortOpenAlexId(value: string | undefined): string {
  return (value ?? "").split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
}

/** Unrounded relevance used for sorting, so RRF order survives deep ranks. */
export function relevanceSortScore(
  paper: Pick<ScoredPaper, "score" | "hybridScore" | "taxonomyBoostScore">,
): number {
  return Math.min(1, Number(paper.hybridScore ?? paper.score ?? 0) + Number(paper.taxonomyBoostScore ?? 0));
}

export function effectiveRelevanceScore(
  paper: Pick<ScoredPaper, "score" | "hybridScore" | "taxonomyBoostScore">,
): number {
  return round2(relevanceSortScore(paper));
}

function matchingWeight(query: string, value: string | undefined, weight: number): number {
  const term = normalize(value);
  if (!term || term.length < 3) return 0;
  return query.includes(term) || term.includes(query) || overlaps(query, term) ? weight : 0;
}

function overlaps(query: string, term: string): boolean {
  const queryTokens = significantTokens(query);
  const termTokens = significantTokens(term);
  if (queryTokens.length === 0 || termTokens.length === 0) return false;
  return termTokens.some((token) => queryTokens.includes(token));
}

function significantTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 4);
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
