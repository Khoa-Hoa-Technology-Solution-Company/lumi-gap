import type { ISODateString } from "./common.js";

/** OpenAlex taxonomy levels, broadest first. */
export type TaxonomyLevel = "domain" | "field" | "subfield" | "topic";

export type TaxonomyNodeStatus = "active" | "hidden";

/** One node of the OpenAlex taxonomy tree (domain > field > subfield > topic). */
export interface TaxonomyNode {
  id: string;
  level: TaxonomyLevel;
  name: string;
  description: string | null;
  /** Short OpenAlex id, unique within a level (e.g. "T10028" or "17"). */
  openalexId: string | null;
  parentId: string | null;
  aliases: string[];
  /** Works in the whole of OpenAlex. */
  worksCount: number;
  /** Local papers classified under this node. */
  paperCount: number;
  status: TaxonomyNodeStatus;
  childCount: number;
  syncedAt: ISODateString | null;
}

export interface TaxonomyNodeDetail extends TaxonomyNode {
  /** Root first: domain, field, subfield... down to the parent of this node. */
  ancestors: TaxonomyNode[];
  /** Direct children, top 50 by local paper count. */
  children: TaxonomyNode[];
  openalexKeywords: string[];
}

export type KeywordStatus = "active" | "hidden" | "merged";

export interface CatalogKeyword {
  id: string;
  keywordName: string;
  normalizedName: string;
  aliases: string[];
  status: KeywordStatus;
  mergedIntoId: string | null;
  paperCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type TagStatus = "active" | "archived";

export interface Tag {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: TagStatus;
  color: string | null;
  paperCount: number;
  ruleCount: number;
  createdById: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type TagRuleKind = "topic" | "keyword";
export type TagRuleEffect = "include" | "exclude";

/** What a rule points at, resolved for display. */
export interface TagRuleTarget {
  id: string;
  name: string;
  /** Taxonomy level for topic rules; absent for keyword rules. */
  level?: TaxonomyLevel;
}

export interface TagRule {
  id: string;
  tagId: string;
  ruleKind: TagRuleKind;
  effect: TagRuleEffect;
  researchTopicId: string | null;
  keywordId: string | null;
  target: TagRuleTarget | null;
  createdAt: ISODateString;
}

export interface TagDetail extends Tag {
  rules: TagRule[];
}

export type TagRuleInput =
  | { ruleKind: "topic"; researchTopicId: string; effect?: TagRuleEffect }
  | { ruleKind: "keyword"; keywordId: string; effect?: TagRuleEffect };

export interface TagPreview {
  matchedPapers: number;
  /** Up to 10 matches, most cited first. */
  sample: Array<{ id: string; title: string; publicationYear: number }>;
}

/** How a paper got into a tag. `blocked` = an admin took it out; automatic tagging leaves it out. */
export type PaperTagSource = "rule" | "embedding" | "manual" | "blocked";

export interface TaggedPaper {
  paperId: string;
  title: string;
  publicationYear: number;
  citationCount: number;
  source: PaperTagSource;
  /** Cosine similarity to the tag centroid for `embedding` rows; null otherwise. */
  confidence: number | null;
  taggedAt: ISODateString;
}

/** Outcome of applying one tag's rules (and embedding expansion) to the corpus. */
export interface TagApplyResult {
  tagId: string;
  ruleTagged: number;
  embeddingTagged: number;
  manual: number;
  blocked: number;
  /** Active papers now carrying the tag (rule + embedding + manual). */
  paperCount: number;
  /** Why embedding expansion did not run, when it did not (disabled, too few seed papers with embeddings). */
  embeddingSkippedReason: string | null;
}

/** 202 body of the apply endpoints: the work runs in the tagging worker. */
export interface TagApplyJob {
  jobId: string;
  tagId: string | null;
}

export interface TaxonomyStats {
  /** Active papers. */
  papers: number;
  /** Active papers with at least one classified topic. */
  withTopic: number;
  /** Active papers with at least one catalogue keyword. */
  withKeyword: number;
  nodesByLevel: Record<TaxonomyLevel, number>;
  keywords: { active: number; merged: number; hidden: number };
  tags: { active: number; archived: number };
  topDomains: Array<{ id: string; name: string; paperCount: number }>;
  topTopics: Array<{ id: string; name: string; paperCount: number }>;
}
