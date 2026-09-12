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

export function getGapEvidenceStatus(gap: Pick<GapListDoc, "source" | "probe" | "evidenceConfidence">): GapEvidenceStatus {
  if (gap.source === "report" && !gap.probe) return "ai_only";
  if (!gap.probe) return "weak";
  return Number(gap.evidenceConfidence ?? 0) >= 0.5 ? "confirmed" : "weak";
}

export function toGapListItem(
  doc: GapListDoc,
  supportingPapersById: Map<string, GapSupportingPaper>,
): ResearchGapItem {
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
    evidenceStatus: getGapEvidenceStatus(doc),
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
  };
}
