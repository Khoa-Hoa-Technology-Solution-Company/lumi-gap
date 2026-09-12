const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/i;

export interface QualityResult {
  metadataScore: number;
  sourceScore: number;
  duplicateScore: number;
  relevanceScore: number;
  prestigeScore: number;
  utilityScore: number;
  qualityScore: number;
  qualityTier: number;
  qualityTierName: string;
  downloadCost: number | null;
  uploadCreditReward: number;
}


// uploadCreditReward tuned down (was 100/150/200/300) so an upload reward stays
// proportionate to the 100-credit request cost — a top-tier paper funds ~1.5
// requests, a basic one 30, instead of every well-formed upload minting 2-3 free
// requests. Papers whose reward was ALREADY granted (uploadRewardedAt set) freeze
// their stored uploadCreditReward (see paper.service updateStatus/updatePaper) so
// clawback stays symmetric; un-granted papers pick up the new amount on next score.
export const QUALITY_TIERS = [
  { tier: 0, name: "Invalid", minScore: 0, maxScore: 49, downloadCost: null, uploadCreditReward: 0 },
  { tier: 1, name: "Basic", minScore: 50, maxScore: 64, downloadCost: 20, uploadCreditReward: 60 },
  { tier: 2, name: "Academic Standard", minScore: 65, maxScore: 79, downloadCost: 30, uploadCreditReward: 90 },
  { tier: 3, name: "High Value", minScore: 80, maxScore: 91, downloadCost: 50, uploadCreditReward: 150 },
  { tier: 4, name: "Elite", minScore: 92, maxScore: 100, downloadCost: 80, uploadCreditReward: 180 },
];

function hasValue(value: string | undefined | null): boolean {
  return !!value && value.trim().length > 0;
}

function countWords(value: string | undefined | null): number {
  if (!value) return 0;
  return value
    .trim()
    .split(/\s+/u)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function scoreMetadata(paper: any): number {
  const hasTitle = hasValue(paper.title);
  const hasAuthors = Array.isArray(paper.authors) && paper.authors.length > 0;
  const hasYear = !!paper.publicationYear;
  const hasAbstract = hasValue(paper.abstractText);
  const hasKeywordsOrTopics = (Array.isArray(paper.keywords) && paper.keywords.length > 0) || 
                              (Array.isArray(paper.topics) && paper.topics.length > 0);

  return (
    (hasTitle ? 3 : 0) +
    (hasAuthors ? 3 : 0) +
    (hasYear ? 2 : 0) +
    (hasAbstract ? 4 : 0) +
    (hasKeywordsOrTopics ? 3 : 0)
  );
}

function scoreSource(paper: any): number {
  const doi = paper.externalIds?.doi || paper.doi;
  if (hasValue(doi) && DOI_PATTERN.test(doi.trim())) {
    return 15;
  }
  const link = paper.openAccessUrl || paper.paperLink;
  if (hasValue(link) && /arxiv|hal|zenodo|repository|repo/i.test(link)) {
    return 8;
  }
  if (hasValue(link)) {
    return 10;
  }
  if (hasValue(paper.pdfPath)) {
    return 2;
  }
  return 0;
}

function scoreDuplicate(paper: any): number {
  // Duplicate points: Unique (+20), Needs Review (+10), Duplicate (0)
  if (paper.isDuplicate) return 0;
  if (paper.needsDuplicateReview) return 10;
  return 20;
}

function scoreRelevance(paper: any): number {
  // Relevance here means "metadata can place the paper in the corpus reliably",
  // not query relevance. OpenAlex taxonomy is stronger evidence than a loose
  // user-entered topic string, so it receives the final completeness points.
  const topics = Array.isArray(paper.topics) ? paper.topics : [];
  const hasTopics = topics.length > 0;
  const hasKeywords = Array.isArray(paper.keywords) && paper.keywords.length > 0;
  const hasAbstract = hasValue(paper.abstractText) && countWords(paper.abstractText) >= 20;
  const hasOpenAlexTopicId = topics.some((t: any) => hasValue(t.openalexTopicId));
  const hasPrimaryTopic = topics.some((t: any) => t.isPrimary === true);
  const hasHierarchy = topics.some(
    (t: any) => hasValue(t.domainName) && hasValue(t.fieldName) && hasValue(t.subfieldName),
  );

  return (
    (hasAbstract ? 5 : 0) +
    (hasKeywords ? 3 : 0) +
    (hasTopics ? 3 : 0) +
    (hasOpenAlexTopicId ? 1 : 0) +
    (hasHierarchy ? 2 : 0) +
    (hasPrimaryTopic ? 1 : 0)
  );
}

function scorePrestige(paper: any): number {
  const kind = String(paper.paperKind || "").toLowerCase();
  if (kind === "article" || kind === "proceedings") return 15;
  if (kind === "review" || kind === "book-chapter") return 10;
  if (kind === "preprint") return 8;
  return 3;
}

function scoreUtility(paper: any): number {
  const kind = String(paper.paperKind || "").toLowerCase();
  const abstract = String(paper.abstractText || "").toLowerCase();

  if (kind.includes("data") || kind.includes("software") || /dataset|benchmark|code/i.test(abstract)) {
    return 15;
  }
  if (/method|experiment|result/i.test(abstract)) {
    return 12;
  }
  if (kind === "review") {
    return 12;
  }
  if (kind.includes("case") || /case study/i.test(abstract)) {
    return 8;
  }
  return hasValue(paper.abstractText) ? 3 : 0;
}

export function getQualityTier(score: number): typeof QUALITY_TIERS[number] {
  const found = QUALITY_TIERS.find((t) => score >= t.minScore && score <= t.maxScore);
  return found || QUALITY_TIERS[0]!;
}

export function calculatePaperQuality(paper: any): QualityResult {
  const meta = scoreMetadata(paper);
  const src = scoreSource(paper);
  const dup = scoreDuplicate(paper);
  const rel = scoreRelevance(paper);
  const prestige = scorePrestige(paper);
  const util = scoreUtility(paper);

  const qualityScore = meta + src + dup + rel + prestige + util;
  const tier = getQualityTier(qualityScore);

  return {
    metadataScore: meta,
    sourceScore: src,
    duplicateScore: dup,
    relevanceScore: rel,
    prestigeScore: prestige,
    utilityScore: util,
    qualityScore,
    qualityTier: tier.tier,
    qualityTierName: tier.name,
    downloadCost: tier.downloadCost,
    uploadCreditReward: tier.uploadCreditReward,
  };
}
