import type {
  GapClosureStatus,
  GapClosureSummary,
  GapEvidenceStatus,
  GapGlobalEvidence,
  GapNextStep,
  GapNextStepKind,
  GapRefinement,
  GapProjectEvidence,
  GapSource,
  GapStatus,
  GapSupportingPaper,
  QuestionFacets,
  ResearchGapItem,
} from "@trend/shared-types";
import { computeGapEvidence, GAP_UNDEREXPLORED_DEFAULTS, type GapEvidence } from "./gap-evidence.js";

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
  analysisMode?: "DRAFT" | "OFFICIAL";
  version?: number;
  assessmentStatus?: ResearchGapItem["assessmentStatus"];
  _id: IdLike;
  topic: string;
  normalizedTopic: string;
  title: string;
  description: string;
  rationale: string;
  evidencePaperIds?: IdLike[];
  supportingPaperIds?: IdLike[];
  counterPaperIds?: IdLike[];
  /** Found by searching the corpus with the gap's own text: they may already answer it (not yet reviewed). */
  possibleCounterPaperIds?: IdLike[];
  confidence: number;
  probe?: { topicA?: string; topicB?: string; yearFrom?: number; yearTo?: number; semanticMinSimilarity?: number };
  intersectionCount?: number;
  parentCounts?: { a?: number; b?: number };
  parentTrend?: { topic?: string; growthRatePct?: number; cagrPct?: number | null; slope?: number } | null;
  globalEvidence?: GapGlobalEvidence | null;
  evidenceConfidence?: number;
  evidenceScopeSize?: number;
  projectEvidence?: GapProjectEvidence;
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
  closureStatus?: GapClosureStatus;
  refinement?: GapRefinement | null;
  questionFacets?: QuestionFacets;
  latestClosureCheck?: GapClosureSummary;
}

/** Row of gap_closure_checks reduced to what a gap list item shows. */
export interface GapClosureSummaryRow {
  id: string;
  status: string;
  decision: string | null;
  bound: number | null;
  judgeKind: string | null;
  decidedAt: Date | null;
}

export function toGapClosureSummary(row: GapClosureSummaryRow): GapClosureSummary {
  return {
    checkId: row.id,
    status: row.status as GapClosureSummary["status"],
    decision: (row.decision ?? undefined) as GapClosureSummary["decision"],
    bound: row.bound ?? undefined,
    judgeKind: (row.judgeKind ?? undefined) as GapClosureSummary["judgeKind"],
    decidedAt: row.decidedAt?.toISOString(),
  };
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

/** True when a probe topic has fewer papers than the signal threshold (stored scores may predate the threshold). */
export function isGapLowSample(gap: Pick<GapListDoc, "parentCounts">, minParentPapers: number): boolean {
  const { a, b } = gap.parentCounts ?? {};
  if (a === undefined || b === undefined) return false;
  return Math.min(a, b) < Math.max(minParentPapers, 1);
}

/** Thresholds of the under-explored signal; `maxRatio` and `alpha` default to the documented 0.5 and 0.05. */
export interface GapSignalConfig { minParentPapers: number; maxRatio?: number; alpha?: number }

type GapSignalInput = Pick<GapListDoc, "intersectionCount" | "parentCounts" | "evidenceScopeSize" | "globalEvidence">;

/**
 * The under-explored signal recomputed from the stored counts, so rows saved under an older rule are ranked under the
 * current one. Null when a count is missing (the stored score is used instead). The probes of the run that created the
 * row are not stored, so the family size is taken as k = 1 here.
 */
export function gapUnderExploredSignal(gap: GapSignalInput, config: GapSignalConfig): GapEvidence | null {
  const { a, b } = gap.parentCounts ?? {};
  if (gap.intersectionCount == null || a === undefined || b === undefined || gap.evidenceScopeSize == null) return null;
  return computeGapEvidence(
    { evidenceScopeSize: gap.evidenceScopeSize, intersectionCount: gap.intersectionCount, parentCounts: { a, b }, probeCount: 1, globalEvidence: gap.globalEvidence },
    { minParentPapers: Math.max(config.minParentPapers, 1), maxRatio: config.maxRatio ?? GAP_UNDEREXPLORED_DEFAULTS.maxRatio, alpha: config.alpha ?? GAP_UNDEREXPLORED_DEFAULTS.alpha },
  );
}

/**
 * "confirmed" means the under-explored ranking signal is met (not that the gap is proven open; the closure check decides).
 * A gap whose counting scope was never recorded predates the corpus-wide counts (project gaps were scored over a
 * handful of papers), so its score cannot support it.
 */
export function getGapEvidenceStatus(gap: Pick<GapListDoc, "source" | "probe" | "evidenceConfidence" | "evidenceScopeSize"> & Partial<GapSignalInput>, lowSample = false, config?: GapSignalConfig): GapEvidenceStatus {
  if (gap.source === "report" && !gap.probe) return "ai_only";
  if (!gap.probe || lowSample || gap.evidenceScopeSize == null) return "weak";
  const signal = config ? gapUnderExploredSignal(gap, config) : null;
  if (signal) return signal.underExplored ? "confirmed" : "weak";
  return Number(gap.evidenceConfidence ?? 0) >= 0.5 ? "confirmed" : "weak";
}

export interface GapNextStepInput {
  evidenceStatus: GapEvidenceStatus;
  /** Confirmed plus possible counter-evidence papers. */
  counterCount: number;
  /** OpenAlex has enough papers per topic and does not find the intersection under-explored (whatever the corpus says). */
  globalWellCovered: boolean;
  /** A probe topic has fewer corpus papers than GAP_MIN_PARENT_PAPERS. */
  lowSample: boolean;
  globalEvidence?: GapGlobalEvidence | null;
  minParentPapers: number;
  /** A closure check already decided: its decision answers the question. */
  closureDecided: boolean;
  /** Result of the self-check against the possible counter-evidence, when it ran. */
  refinement?: GapRefinement | null;
  probe?: GapListDoc["probe"] | null;
}

/**
 * What to do with a gap now (see GapNextStep). Order matters: a paper that may already answer the gap outranks every
 * count; a thin corpus makes the counts meaningless; only then does the corpus signal decide.
 */
export function gapNextStep(input: GapNextStepInput): GapNextStep | undefined {
  // A decided closure check, or a self-check that found a paper answering the gap, already says what the gap is.
  if (input.closureDecided || input.refinement?.action === "drop") return undefined;
  const base = { counterCount: input.counterCount, globalWellCovered: input.globalWellCovered };
  // Rewritten to what the related papers leave open: the closure check is next.
  if (input.refinement?.action === "narrow") return { kind: "refined", ...base };
  // The self-check read the related papers and found they do not address the gap, so they no longer count against it.
  if (input.counterCount > 0 && input.refinement?.action !== "keep") return { kind: "likely_studied", ...base };
  if (input.globalWellCovered) {
    const { topicA, topicB } = input.probe ?? {};
    // Only the two broad probe topics are known to be well studied together, not the gap's narrower claim.
    return { kind: "busy_area", ...base, ...(topicA && topicB ? { broadArea: { topicA, topicB, openAlexCount: input.globalEvidence?.intersectionCount ?? 0 } } : {}) };
  }
  const global = input.globalEvidence?.parentCounts;
  const openAlexHasTopics = !!global && Math.min(global.a, global.b) >= Math.max(input.minParentPapers, 1);
  if (input.lowSample && openAlexHasTopics) return { kind: "thin_corpus", ...base };
  if (input.evidenceStatus === "confirmed") return { kind: "run_closure", ...base };
  return { kind: "refine", ...base };
}

/** Recommended order: what to act on first. */
const NEXT_STEP_RANK: Record<GapNextStepKind | "none", number> = { run_closure: 0, refined: 0, refine: 1, none: 1, busy_area: 2, thin_corpus: 3, likely_studied: 4 };

export type GapSortKey = "recommended" | "evidence" | "confidence" | "papers" | "newest" | "ai_only_last";

/** Minimal gap fields needed to order a list before loading full rows for one page. */
export interface GapSortRow {
  id: string;
  confidence: number;
  evidenceConfidence?: number | null;
  evidenceScopeSize?: number | null;
  intersectionCount?: number | null;
  createdAt: Date;
  source: GapSource;
  probe?: GapListDoc["probe"] | null;
  parentCounts?: GapListDoc["parentCounts"] | null;
  globalEvidence?: GapGlobalEvidence | null;
  supportingCount: number;
  /** Counter-evidence links (confirmed or possible). */
  counterCount?: number;
  refinement?: GapRefinement | null;
}

const EVIDENCE_RANK: Record<GapEvidenceStatus, number> = { confirmed: 2, weak: 1, ai_only: 0 };

/**
 * Ranking score: the under-explored signal recomputed from the stored counts when possible, else the stored corpus
 * evidence score, else the AI's self-reported confidence.
 */
export function gapRankingScore(row: Pick<GapSortRow, "confidence" | "evidenceConfidence"> & Partial<Pick<GapSortRow, "evidenceScopeSize" | "intersectionCount" | "parentCounts" | "globalEvidence">>, config?: GapSignalConfig): number {
  const signal = config ? gapUnderExploredSignal({ intersectionCount: row.intersectionCount ?? undefined, parentCounts: row.parentCounts ?? undefined, evidenceScopeSize: row.evidenceScopeSize ?? undefined, globalEvidence: row.globalEvidence }, config) : null;
  // A gap without a corpus score must stay behind evidence-backed gaps even if the LLM confidence is high.
  return signal?.evidenceConfidence ?? row.evidenceConfidence ?? 0;
}

/** Orders gaps for every list sort option; ties fall back to newest first. */
export function sortGapRows<T extends GapSortRow>(rows: T[], sortBy: GapSortKey, minParentPapers: number, signal: Omit<GapSignalConfig, "minParentPapers"> = {}): T[] {
  const config: GapSignalConfig = { minParentPapers, ...signal };
  const evidenceRank = (row: T) => {
    const doc = { source: row.source, probe: row.probe ?? undefined, evidenceConfidence: row.evidenceConfidence ?? undefined, evidenceScopeSize: row.evidenceScopeSize ?? undefined, intersectionCount: row.intersectionCount ?? undefined, parentCounts: row.parentCounts ?? undefined, globalEvidence: row.globalEvidence };
    return EVIDENCE_RANK[getGapEvidenceStatus(doc, isGapLowSample({ parentCounts: row.parentCounts ?? undefined }, minParentPapers), config)];
  };
  const newest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
  const score = (a: T, b: T) => gapRankingScore(b, config) - gapRankingScore(a, config);
  const papers = (a: T, b: T) => b.supportingCount - a.supportingCount;
  // What to act on first: closure-ready and refined gaps, then weak ones, then those probably already studied.
  const stepRank = (row: T) => {
    const lowSample = isGapLowSample({ parentCounts: row.parentCounts ?? undefined }, minParentPapers);
    const doc = { source: row.source, probe: row.probe ?? undefined, evidenceConfidence: row.evidenceConfidence ?? undefined, evidenceScopeSize: row.evidenceScopeSize ?? undefined, intersectionCount: row.intersectionCount ?? undefined, parentCounts: row.parentCounts ?? undefined, globalEvidence: row.globalEvidence };
    const signal = gapUnderExploredSignal(doc, config);
    const step = gapNextStep({ evidenceStatus: getGapEvidenceStatus(doc, lowSample, config), counterCount: row.counterCount ?? 0, globalWellCovered: !!signal?.global && !signal.global.lowSample && !signal.global.underExplored, lowSample, globalEvidence: row.globalEvidence, minParentPapers, closureDecided: false, refinement: row.refinement, probe: row.probe });
    return NEXT_STEP_RANK[step?.kind ?? "none"];
  };
  const contested = (a: T, b: T) => stepRank(a) - stepRank(b);
  const recommended = (a: T, b: T) => contested(a, b) || score(a, b) || newest(a, b);
  const compare: Record<GapSortKey, (a: T, b: T) => number> = {
    recommended,
    evidence: (a, b) => evidenceRank(b) - evidenceRank(a) || contested(a, b) || score(a, b) || papers(a, b) || newest(a, b),
    // The LLM now returns confidence 0 as a placeholder, so the shown score decides; the legacy value only breaks ties.
    confidence: (a, b) => score(a, b) || b.confidence - a.confidence || newest(a, b),
    papers: (a, b) => papers(a, b) || score(a, b) || newest(a, b),
    newest,
    ai_only_last: (a, b) => Number(evidenceRank(a) === EVIDENCE_RANK.ai_only) - Number(evidenceRank(b) === EVIDENCE_RANK.ai_only) || recommended(a, b),
  };
  return [...rows].sort(compare[sortBy]);
}

export function toGapListItem(
  doc: GapListDoc,
  supportingPapersById: Map<string, GapSupportingPaper>,
  options: { minParentPapers?: number; maxRatio?: number; alpha?: number; canManage?: boolean; validationQuorum?: number } = {},
): ResearchGapItem {
  const lowSample = options.minParentPapers !== undefined ? isGapLowSample(doc, options.minParentPapers) : undefined;
  const config: GapSignalConfig | undefined = options.minParentPapers !== undefined ? { minParentPapers: options.minParentPapers, maxRatio: options.maxRatio, alpha: options.alpha } : undefined;
  const signal = config ? gapUnderExploredSignal(doc, config) : null;
  const supportingPaperIds = (doc.supportingPaperIds ?? []).map(String);
  const counterPaperIds = (doc.counterPaperIds ?? []).map(String);
  const possibleCounterPaperIds = (doc.possibleCounterPaperIds ?? []).map(String);
  const evidencePaperIds = (doc.evidencePaperIds?.length
    ? doc.evidencePaperIds
    : doc.supportingPaperIds ?? []
  ).map(String);
  const createdAt = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt);
  const evidenceStatus = getGapEvidenceStatus(doc, lowSample, config);
  const nextStep = gapNextStep({
    evidenceStatus,
    counterCount: counterPaperIds.length + possibleCounterPaperIds.length,
    globalWellCovered: !!signal?.global && !signal.global.lowSample && !signal.global.underExplored,
    lowSample: lowSample ?? false,
    globalEvidence: doc.globalEvidence,
    minParentPapers: options.minParentPapers ?? 0,
    closureDecided: Boolean(doc.latestClosureCheck?.decision),
    refinement: doc.refinement,
    probe: doc.probe,
  });

  return {
    id: String(doc._id),
    analysisMode: doc.analysisMode,
    version: doc.version,
    assessmentStatus: doc.assessmentStatus,
    topic: doc.topic,
    normalizedTopic: doc.normalizedTopic,
    title: doc.title,
    description: doc.description,
    rationale: doc.rationale,
    supportingPaperIds,
    supportingPapers: supportingPaperIds
      .map((id) => supportingPapersById.get(id))
      .filter((paper): paper is GapSupportingPaper => Boolean(paper)),
    counterPaperIds,
    counterPapers: counterPaperIds
      .map((id) => supportingPapersById.get(id))
      .filter((paper): paper is GapSupportingPaper => Boolean(paper)),
    possibleCounterPaperIds,
    possibleCounterPapers: possibleCounterPaperIds
      .map((id) => supportingPapersById.get(id))
      .filter((paper): paper is GapSupportingPaper => Boolean(paper)),
    evidencePaperIds,
    evidencePapers: evidencePaperIds
      .map((id) => supportingPapersById.get(id))
      .filter((paper): paper is GapSupportingPaper => Boolean(paper)),
    confidence: doc.confidence,
    evidenceStatus,
    ...(nextStep ? { nextStep } : {}),
    ...(doc.refinement ? { refinement: doc.refinement } : {}),
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
          ...(doc.probe.semanticMinSimilarity !== undefined ? { semanticMinSimilarity: doc.probe.semanticMinSimilarity } : {}),
        }
      : undefined,
    intersectionCount: doc.intersectionCount,
    parentCounts:
      doc.parentCounts?.a !== undefined && doc.parentCounts?.b !== undefined
        ? { a: doc.parentCounts.a, b: doc.parentCounts.b }
        : undefined,
    parentTrend:
      doc.parentTrend?.topic && doc.parentTrend.growthRatePct !== undefined
        ? {
            topic: doc.parentTrend.topic,
            growthRatePct: doc.parentTrend.growthRatePct,
            ...(doc.parentTrend.cagrPct !== undefined ? { cagrPct: doc.parentTrend.cagrPct } : {}),
            ...(doc.parentTrend.slope !== undefined ? { slope: doc.parentTrend.slope } : {}),
          }
        : doc.parentTrend === null
          ? null
          : undefined,
    evidenceConfidence: signal?.evidenceConfidence ?? doc.evidenceConfidence,
    underExplored: signal && signal.expected > 0 ? { expected: signal.expected, ratio: signal.ratio, pValue: signal.pValue, ...(signal.global ? { global: { expected: signal.global.expected, ratio: signal.global.ratio, pValue: signal.global.pValue } } : {}), vetoedByGlobal: signal.vetoedByGlobal } : undefined,
    globalEvidence: doc.globalEvidence ?? null,
    evidenceScopeSize: doc.evidenceScopeSize,
    projectEvidence: doc.projectEvidence,
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
    closureStatus: doc.closureStatus,
    questionFacets: doc.questionFacets,
    latestClosureCheck: doc.latestClosureCheck,
    validationQuorum: options.validationQuorum,
    canManage: options.canManage,
  };
}
