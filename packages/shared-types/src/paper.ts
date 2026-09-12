import type { ISODateString } from "./common.js";

export type DataSource = "openalex" | "semanticscholar" | "crossref" | "arxiv";
export type PaperKind =
  | "article"
  | "proceedings"
  | "preprint"
  | "review"
  | "book-chapter"
  | "other";
export type OpenAccessStatus = "gold" | "green" | "hybrid" | "bronze" | "closed" | "unknown";
export type DataStatus = "draft" | "active" | "low-quality" | "archived";
export type DetectedBy = "openalex" | "ai" | "user";

export interface PaperAuthorRef {
  authorId?: string;
  displayName: string;
  position: number;
  isCorresponding?: boolean;
}

export interface PaperKeyword {
  keywordId?: string;
  keywordName: string;
  detectedBy?: DetectedBy;
  confidence?: number; // 0..1
}

export interface PaperTopic {
  topicId?: string;
  openalexTopicId?: string;
  topicName: string;
  detectedBy?: DetectedBy;
  confidence?: number; // 0..1
  isPrimary?: boolean;
  subfieldId?: string;
  subfieldName?: string;
  fieldId?: string;
  fieldName?: string;
  domainId?: string;
  domainName?: string;
}

/**
 * Paper as returned by the API (`GET /papers`, `GET /papers/:id`).
 * Mirrors the backend `research_papers` document, with `_id` exposed as `id`
 * and the `embedding` vector omitted. `aiScore` is populated in Phase B.
 */
export interface Paper {
  id: string;
  externalIds: {
    doi?: string;
    openalexId?: string;
    semanticScholarId?: string;
    arxivId?: string;
    pubmedId?: string;
  };
  title: string;
  abstractText?: string;
  authors: PaperAuthorRef[];
  journalId?: string;
  journalName?: string;
  publicationYear: number;
  publicationDate?: ISODateString;
  paperKind?: PaperKind;
  language?: string;
  openAccessStatus?: OpenAccessStatus;
  openAccessUrl?: string;
  licenseName?: string;
  citationCount: number;
  fwci?: number;
  citationNormalizedPercentile?: PaperCitationNormalizedPercentile;
  relatedWorksCount?: number;
  keywords: PaperKeyword[];
  topics: PaperTopic[];
  primaryProvider: DataSource | "user";
  dataStatus: DataStatus;
  dataQualityScore: number; // 0..1 — field-presence quality
  isAiAnalyzable: boolean; // true when quality is high enough for AI analysis
  aiScore?: PaperAiScore; // Phase B
  aiAnalysis?: PaperAiAnalysis; // F2 structured knowledge extracted once from title+abstract
  metadataScore?: number;
  sourceScore?: number;
  duplicateScore?: number;
  relevanceScore?: number;
  prestigeScore?: number;
  utilityScore?: number;
  qualityScore?: number;
  qualityTier?: number;
  qualityTierName?: string;
  downloadCost?: number | null;
  uploadCreditReward?: number;
  pdfPath?: string;
  pdfAvailable?: boolean;
  paperLink?: string;
  rejectionReason?: string;
  paperStatus?: "pending" | "not-downloaded" | "downloaded" | "rejected" | "pending-requester-acceptance";
  requestedBy?: {
    _id: string;
    fullName: string;
    email?: string;
    university?: string;
    role?: string;
    avatarUrl?: string | null;
  };
  uploadedBy?: {
    _id: string;
    fullName: string;
    email?: string;
    university?: string;
    role?: string;
    avatarUrl?: string | null;
  };
  uploadedAt?: ISODateString;
  uploadRewardedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Paper-INTRINSIC AI score — deterministic, query-independent. */
export interface PaperCitationNormalizedPercentile {
  value: number; // 0..1 — OpenAlex citation percentile among comparable works
  isInTop1Percent?: boolean;
  isInTop10Percent?: boolean;
}

export interface PaperAiScore {
  recencyScore: number; // 0..1 — newer = higher
  citationImpactScore: number; // 0..1 — OpenAlex-normalized when available, fallback otherwise
  citationPercentileScore?: number; // 0..1 — OpenAlex citation_normalized_percentile.value
  fwciScore?: number; // 0..1 — normalized FWCI proxy
  metadataQualityScore: number; // 0..1 — = dataQualityScore
  finalScore: number; // 0..1 — weighted blend
  scoreBasis?: "openalex-percentile-fwci" | "openalex-fwci" | "citations-per-year-fallback";
  modelVersion: string;
  computedAt: ISODateString;
}

export interface PaperAiAnalysis {
  summary: string | null;
  methods: string | null;
  dataset: string | null;
  findings: string[];
  limitations: string[];
  contributions: string[];
  futureWork: string[];
  keyTerms: string[];
  extractedBy: "llm";
  analysisPromptVersion: string;
  extractedAt: ISODateString;
}

/** Cached, on-demand translation of Paper Detail title and abstract. */
export interface PaperTranslation {
  paperId: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedTitle: string;
  translatedAbstract: string;
  provider: "original" | "libretranslate" | "gemini";
  cacheHit: boolean;
  translatedAt: ISODateString;
}

export interface PaperTranslationCapabilities {
  enabled: boolean;
  provider: "disabled" | "libretranslate" | "gemini";
  targetLanguages: string[];
  message?: string;
}

/** Lightweight paper reference — used for references + report grounding lists. */
export interface PaperRef {
  id: string;
  title: string;
  publicationYear: number;
  authors: PaperAuthorRef[];
  doi?: string;
}

export type PaperSummary = Pick<
  Paper,
  | "id"
  | "title"
  | "authors"
  | "publicationYear"
  | "journalName"
  | "citationCount"
  | "openAccessStatus"
  | "dataQualityScore"
  | "aiScore"
>;

/** Body of POST /api/v1/papers/compare. */
export interface CompareRequest {
  paperIds: string[]; // 2..COMPARE_MAX_PAPERS distinct ids
}

export interface PaperComparison {
  papers: PaperRef[]; // resolved, in request order
  metrics: Array<{
    paperId: string;
    publicationYear: number;
    citationCount: number;
    aiScore?: PaperAiScore;
    journalName?: string;
    openAccess: boolean;
    paperKind?: PaperKind;
  }>;
  /** LLM qualitative comparison; each dimension has one entry per paper (same order). */
  llmComparison: { dimensions: Array<{ name: string; perPaper: string[] }> };
}
