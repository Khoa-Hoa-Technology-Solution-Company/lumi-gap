import type { ScoredPaper } from "@trend/shared-types";

const MAX_TAXONOMY_BOOST = 0.08;

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

export function effectiveRelevanceScore(
  paper: Pick<ScoredPaper, "score" | "taxonomyBoostScore">,
): number {
  return round2(Math.min(1, Number(paper.score ?? 0) + Number(paper.taxonomyBoostScore ?? 0)));
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
