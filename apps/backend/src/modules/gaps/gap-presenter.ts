import type {
  GapEvidenceStatus,
  GapSource,
  GapStatus,
  GapSupportingPaper,
  ResearchGapItem,
} from "@trend/shared-types";

type IdLike = { toString(): string } | string | undefined | null;

export interface GapAccessSubject {
  userId: IdLike;
  projectId?: IdLike;
}

export interface GapAccessProject {
  ownerId?: IdLike;
  members?: Array<{ targetId?: IdLike }>;
}

export interface GapListDoc {
  _id: IdLike;
  topic: string;
  normalizedTopic: string;
  title: string;
  description: string;
  rationale: string;
  evidencePaperIds?: IdLike[];
  supportingPaperIds?: IdLike[];
  confidence: number;
  probe?: { topicA?: string; topicB?: string; yearFrom?: number; yearTo?: number };
  intersectionCount?: number;
  parentCounts?: { a?: number; b?: number };
  parentTrend?: { topic?: string; growthRatePct?: number } | null;
  evidenceConfidence?: number;
  source: GapSource;
  sourceReportId?: IdLike;
  analysisId?: IdLike;
  projectId?: IdLike;
  userId: IdLike;
  status: GapStatus;
  createdAt: Date | string;
  gapType?: ResearchGapItem["gapType"];
  scope?: string;
  establishedKnowledge?: string;
  observedLimitation?: string;
  missingEvidence?: string;
  significanceExplanation?: string;
  suggestedResearchQuestion?: string;
  validationStatus?: ResearchGapItem["validationStatus"];
  gapConfidence?: ResearchGapItem["gapConfidence"];
  researchPriority?: ResearchGapItem["researchPriority"];
  origin?: ResearchGapItem["origin"];
}

export function canAccessGap(
  userId: string,
  gap: GapAccessSubject,
  project?: GapAccessProject | null,
): boolean {
  if (String(gap.userId ?? "") === userId) return true;
  if (!gap.projectId || !project) return false;
  if (String(project.ownerId ?? "") === userId) return true;
  return (project.members ?? []).some((member) => String(member.targetId ?? "") === userId);
}

/** True when a probe topic has fewer papers than the confirmation threshold (stored scores may predate the threshold). */
export function isGapLowSample(gap: Pick<GapListDoc, "parentCounts">, minParentPapers: number): boolean {
  const { a, b } = gap.parentCounts ?? {};
  if (a === undefined || b === undefined) return false;
  return Math.min(a, b) < Math.max(minParentPapers, 1);
}

export function getGapEvidenceStatus(gap: Pick<GapListDoc, "source" | "probe" | "evidenceConfidence">, lowSample = false): GapEvidenceStatus {
  if (gap.source === "report" && !gap.probe) return "ai_only";
  if (!gap.probe || lowSample) return "weak";
  return Number(gap.evidenceConfidence ?? 0) >= 0.5 ? "confirmed" : "weak";
}

export type GapSortKey = "recommended" | "evidence" | "confidence" | "papers" | "newest" | "ai_only_last";

/** Minimal gap fields needed to order a list before loading full rows for one page. */
export interface GapSortRow {
  id: string;
  confidence: number;
  evidenceConfidence?: number | null;
  createdAt: Date;
  source: GapSource;
  probe?: GapListDoc["probe"] | null;
  parentCounts?: GapListDoc["parentCounts"] | null;
  supportingCount: number;
}

const EVIDENCE_RANK: Record<GapEvidenceStatus, number> = { confirmed: 2, weak: 1, ai_only: 0 };

/** Corpus evidence score when the gap was scored, otherwise the AI's self-reported confidence. */
export function gapRankingScore(row: Pick<GapSortRow, "confidence" | "evidenceConfidence">): number {
  return row.evidenceConfidence ?? row.confidence;
}

/** Orders gaps for every list sort option; ties fall back to newest first. */
export function sortGapRows<T extends GapSortRow>(rows: T[], sortBy: GapSortKey, minParentPapers: number): T[] {
  const evidenceRank = (row: T) => {
    const doc = { source: row.source, probe: row.probe ?? undefined, evidenceConfidence: row.evidenceConfidence ?? undefined };
    return EVIDENCE_RANK[getGapEvidenceStatus(doc, isGapLowSample({ parentCounts: row.parentCounts ?? undefined }, minParentPapers))];
  };
  const newest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
  const score = (a: T, b: T) => gapRankingScore(b) - gapRankingScore(a);
  const papers = (a: T, b: T) => b.supportingCount - a.supportingCount;
  const recommended = (a: T, b: T) => score(a, b) || newest(a, b);
  const compare: Record<GapSortKey, (a: T, b: T) => number> = {
    recommended,
    evidence: (a, b) => evidenceRank(b) - evidenceRank(a) || score(a, b) || papers(a, b) || newest(a, b),
    confidence: (a, b) => b.confidence - a.confidence || newest(a, b),
    papers: (a, b) => papers(a, b) || score(a, b) || newest(a, b),
    newest,
    ai_only_last: (a, b) => Number(evidenceRank(a) === EVIDENCE_RANK.ai_only) - Number(evidenceRank(b) === EVIDENCE_RANK.ai_only) || recommended(a, b),
  };
  return [...rows].sort(compare[sortBy]);
}

export function toGapListItem(
  doc: GapListDoc,
  supportingPapersById: Map<string, GapSupportingPaper>,
  options: { minParentPapers?: number; canManage?: boolean } = {},
): ResearchGapItem {
  const lowSample = options.minParentPapers !== undefined ? isGapLowSample(doc, options.minParentPapers) : undefined;
  const supportingPaperIds = (doc.supportingPaperIds ?? []).map(String);
  const evidencePaperIds = (doc.evidencePaperIds?.length
    ? doc.evidencePaperIds
    : doc.supportingPaperIds ?? []
  ).map(String);
  const createdAt = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt);

  return {
    id: String(doc._id),
    topic: doc.topic,
    normalizedTopic: doc.normalizedTopic,
    title: doc.title,
    description: doc.description,
    rationale: doc.rationale,
    supportingPaperIds,
    supportingPapers: supportingPaperIds
      .map((id) => supportingPapersById.get(id))
      .filter((paper): paper is GapSupportingPaper => Boolean(paper)),
    evidencePaperIds,
    evidencePapers: evidencePaperIds
      .map((id) => supportingPapersById.get(id))
      .filter((paper): paper is GapSupportingPaper => Boolean(paper)),
    confidence: doc.confidence,
    evidenceStatus: getGapEvidenceStatus(doc, lowSample),
    source: doc.source,
    sourceReportId: doc.sourceReportId ? String(doc.sourceReportId) : undefined,
    analysisId: doc.analysisId ? String(doc.analysisId) : undefined,
    projectId: doc.projectId ? String(doc.projectId) : undefined,
    userId: String(doc.userId),
    status: doc.status,
    createdAt,
    probe: doc.probe?.topicA && doc.probe?.topicB
      ? {
          topicA: doc.probe.topicA,
          topicB: doc.probe.topicB,
          yearFrom: doc.probe.yearFrom,
          yearTo: doc.probe.yearTo,
        }
      : undefined,
    intersectionCount: doc.intersectionCount,
    parentCounts:
      doc.parentCounts?.a !== undefined && doc.parentCounts?.b !== undefined
        ? { a: doc.parentCounts.a, b: doc.parentCounts.b }
        : undefined,
    parentTrend:
      doc.parentTrend?.topic && doc.parentTrend.growthRatePct !== undefined
        ? { topic: doc.parentTrend.topic, growthRatePct: doc.parentTrend.growthRatePct }
        : doc.parentTrend === null
          ? null
          : undefined,
    evidenceConfidence: doc.evidenceConfidence,
    lowSample,
    gapType: doc.gapType,
    scope: doc.scope,
    establishedKnowledge: doc.establishedKnowledge,
    observedLimitation: doc.observedLimitation,
    missingEvidence: doc.missingEvidence,
    significanceExplanation: doc.significanceExplanation,
    suggestedResearchQuestion: doc.suggestedResearchQuestion,
    validationStatus: doc.validationStatus,
    gapConfidence: doc.gapConfidence,
    researchPriority: doc.researchPriority,
    origin: doc.origin,
    canManage: options.canManage,
  };
}
