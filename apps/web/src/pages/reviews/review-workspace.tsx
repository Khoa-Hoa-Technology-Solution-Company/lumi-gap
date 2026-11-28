import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AssignedRevisionReader } from "@/features/reviews/components/assigned-revision-reader";
import type { PdfViewState } from "@/features/reviews/components/pdf-manuscript-viewer";
import { PreviousRevisionPanel } from "@/features/reviews/components/previous-revision-panel";
import { RevisionCompareView } from "@/features/reviews/components/revision-compare-view";
import {
  buildCompatiblePriorCriteriaMap,
  resolveComparisonBaseline,
} from "@/features/reviews/revision-comparison";
import { submissionsApi } from "@/features/submissions";
import { reviewsApi } from "@/features/reviews/api/reviews.api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  requiresScientificIntegrity,
  scientificIntegrityChecks,
  type AcademicReviewInput,
  type FeedbackItemPriority,
  type MentorFeedbackAction,
  type OverallAcademicAssessment,
  type ScientificIntegrityCheckKey,
  type StructuredAssessment,
} from "@trend/shared-types";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Columns2,
  Download,
  FileText,
  GripVertical,
  History,
  Lightbulb,
  Lock,
  MessageSquareText,
  Plus,
  RotateCcw,
  Save,
  Send,
  Shapes,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSkeleton, SectionErrorState } from "@/components/loading";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReviewWorkspace, useSaveReview, useSubmitReview } from "@/features/reviews";
import { CompactRubricMatrix } from "@/features/reviews/components/compact-rubric-matrix";
import { ReviewIntegrityChecklist } from "@/features/reviews/components/review-integrity-checklist";
import { ReviewTemplateSelectorDialog } from "@/features/reviews/components/review-template-selector-dialog";
import {
  computeRubricReadiness,
  criterionNeedsLowScoreComment,
  type ReadinessIssue,
} from "@/features/reviews/review-readiness";
import { internalAssessmentLabel, rubricDetailedMetrics } from "@/features/reviews/scientific-review-model";
import {
  isLumiGapSystemRubric,
  localizeIntegrityTitle,
  localizeSystemCriterion,
  localizeSystemGuideline,
  localizeSystemLevelDescription,
} from "@/features/reviews/system-rubric-i18n";
import { useI18n } from "@/i18n";
import { AssignedReviewAdvisory } from "@/features/reviews/components/assigned-review-advisory";
import { MentorReviewOutcome } from "@/features/reviews/components/mentor-review-outcome";
import { NextMentorReview } from "@/features/reviews/components/next-mentor-review";
import { useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import "./review-workspace.css";

type CriterionState = {
  comment: string;
  evidence: string;
  assessment?: StructuredAssessment;
  performanceLevelId?: string;
  notApplicable: boolean;
};
type ResponseState = Record<string, CriterionState>;
type RevisionDraft = {
  priority: FeedbackItemPriority;
  description: string;
  locator?: string;
  criterionKey?: string;
  quotation?: string;
};
type WorkspaceMode = "feedback" | "rubric";
type RubricSection = "criteria" | "integrity" | "revisions" | "summary";
type CriteriaViewMode = "compact" | "full";
type CriteriaFilter = "all" | "unscored";
type MobileTab = "manuscript" | "feedback";
type RoundPanel = "current" | "previous";

const DEFAULT_SPLIT_PCT = 55;

const assessmentOptions: Array<{ value: StructuredAssessment; key: string }> = [
  { value: "MAJOR_ISSUES", key: "reviewWorkspace.assessment.MAJOR_ISSUES" },
  { value: "NEEDS_IMPROVEMENT", key: "reviewWorkspace.assessment.NEEDS_IMPROVEMENT" },
  { value: "ADEQUATE", key: "reviewWorkspace.assessment.ADEQUATE" },
  { value: "STRONG", key: "reviewWorkspace.assessment.STRONG" },
  { value: "NOT_APPLICABLE", key: "reviewWorkspace.assessment.NOT_APPLICABLE" },
];

const SEVERITY_ORDER: Record<FeedbackItemPriority, number> = {
  MAJOR: 0,
  MINOR: 1,
  SUGGESTION: 2,
};

function shortLevelLabel(rawLabel: string, language: string): string {
  const parts = rawLabel.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    return language === "vi" ? parts[1]! : parts[0]!;
  }
  return rawLabel;
}

function modeLabel(mode: string, t: (key: string) => string): string {
  if (["RUBRIC_ASSESSMENT", "STRUCTURED_REVIEW", "GUIDED_FEEDBACK"].includes(mode)) {
    return t(`reviewTemplates.mode.${mode}`);
  }
  return mode.replaceAll("_", " ");
}

function severityBadgeMeta(priority: FeedbackItemPriority, t: (key: string) => string) {
  if (priority === "MAJOR") {
    return {
      label: t("reviewWorkspace.feedbackFirst.severity.MAJOR"),
      Icon: AlertCircle,
      tone: "major" as const,
    };
  }
  if (priority === "SUGGESTION") {
    return {
      label: t("reviewWorkspace.feedbackFirst.severity.SUGGESTION"),
      Icon: Lightbulb,
      tone: "suggestion" as const,
    };
  }
  return {
    label: t("reviewWorkspace.feedbackFirst.severity.MINOR"),
    Icon: AlertTriangle,
    tone: "minor" as const,
  };
}

function formatScoreValue(score: number, language: string): string {
  const fixed = score.toFixed(2);
  return language === "vi" ? fixed.replace(".", ",") : fixed;
}

function formatPctValue(pct: number, language: string): string {
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  return language === "vi" ? text.replace(".", ",") : text;
}

export function ReviewWorkspacePage() {
  const { t, language } = useI18n();
  const client = useQueryClient();
  const { embedded, param, navigate, href } = useReviewPageNavigation();
  const Container = embedded ? "section" : "main";
  const assignmentId = param("assignmentId") ?? "";
  const query = useReviewWorkspace(assignmentId);
  const save = useSaveReview(assignmentId);
  const submit = useSubmitReview(assignmentId);

  const initialized = useRef<string>();
  const sending = useRef(false);
  const editGeneration = useRef(0);
  const submitKey = useRef(crypto.randomUUID());

  // Core review state
  const [integrityChecks, setIntegrityChecks] = useState<NonNullable<AcademicReviewInput["integrityChecks"]>>({});
  const [responses, setResponses] = useState<ResponseState>({});
  const [keyStrengths, setKeyStrengths] = useState("");
  const [keyConcerns, setKeyConcerns] = useState("");
  const [overallComment, setOverallComment] = useState("");
  const [overallAssessment, setOverallAssessment] = useState<OverallAcademicAssessment>();
  const [commentOnly, setCommentOnly] = useState(false);
  const [mentorAction, setMentorAction] = useState<MentorFeedbackAction | undefined>("SELF_REVISE");
  const [requiredRevisions, setRequiredRevisions] = useState<RevisionDraft[]>([]);

  // Workspace mode & UI state
  const [workspaceView, setWorkspaceView] = useState<"review" | "compare">("review");
  const [selectedBaselineId, setSelectedBaselineId] = useState<string>("");
  const [verifyingItemIds, setVerifyingItemIds] = useState<Record<string, boolean>>({});
  const [jumpToPageRequest, setJumpToPageRequest] = useState<{ page: number; nonce: number } | null>(null);
  const [assignedPdfCache, setAssignedPdfCache] = useState<{ revisionId: string; blob: Blob } | null>(null);
  const assignedPdfViewRef = useRef<PdfViewState | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("rubric");
  const [rubricSection, setRubricSection] = useState<RubricSection>("criteria");
  const [criteriaViewMode, setCriteriaViewMode] = useState<CriteriaViewMode>("compact");
  const [roundPanel, setRoundPanel] = useState<RoundPanel>("current");
  const [mobileTab, setMobileTab] = useState<MobileTab>("manuscript");
  const [criteriaFilter, setCriteriaFilter] = useState<CriteriaFilter>("all");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Save & Dialog state
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);

  // Split view draggable divider state
  const gridRef = useRef<HTMLDivElement>(null);
  const evalPaneRef = useRef<HTMLDivElement>(null);
  const evalScrollRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState<number>(DEFAULT_SPLIT_PCT);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [isNarrowPanel, setIsNarrowPanel] = useState(false);

  // Criteria & Integrity UI focus state
  const [expandedCriterionKey, setExpandedCriterionKey] = useState<string | null>(null);
  const [focusedIntegrityKey, setFocusedIntegrityKey] = useState<ScientificIntegrityCheckKey | null>(null);
  const [missingListOpen, setMissingListOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string>("");
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const [fullEvidenceOpenKeys, setFullEvidenceOpenKeys] = useState<Record<string, boolean>>({});

  useUnsavedWorkspace(dirty);

  useEffect(() => {
    const initKey = `${assignmentId}:${query.data?.roundNumber}:${query.data?.artifactRevision?.id}:${query.data?.templateVersion?.id ?? ""}`;
    if (!query.data || initialized.current === initKey) return;
    initialized.current = initKey;

    const isGuidance = query.data.request?.origin === "MENTOR_GUIDANCE";
    const templateMode = query.data.templateVersion?.reviewMode ?? "GUIDED_FEEDBACK";
    const customChosenTemplate =
      query.data.templateVersion?.templateSource === "PERSONAL" ||
      query.data.templateVersion?.templateSource === "PROJECT";
    const hasStartedRubric = query.data.responses.some(
      r => Boolean(r.performanceLevelId) || Boolean(r.assessment) || Boolean(r.notApplicable),
    );
    const wasCommentOnly =
      isGuidance &&
      (query.data.review?.recommendation === "COMMENT_ONLY" ||
        (query.data.review?.status === "SUBMITTED" && !query.data.review.overallAssessment));

    const initialMode: WorkspaceMode = !isGuidance
      ? "rubric"
      : customChosenTemplate && templateMode !== "GUIDED_FEEDBACK" && !wasCommentOnly
        ? "rubric"
        : templateMode === "GUIDED_FEEDBACK" || wasCommentOnly || !hasStartedRubric
          ? "feedback"
          : "rubric";

    const requestedCompare =
      param("mode") === "compare" &&
      (query.data.comparisonVersions?.length ?? 0) >= 2 &&
      Boolean(query.data.artifactRevision?.id);
    setWorkspaceView(requestedCompare ? "compare" : "review");
    setSelectedBaselineId("");
    setJumpToPageRequest(null);
    assignedPdfViewRef.current = null;
    setWorkspaceMode(initialMode);
    setRubricSection("criteria");
    const hasPendingPreviousItems = query.data.previousRevisionItems.some(
      item => item.priority !== "SUGGESTION" && item.status !== "ACCEPTED",
    );
    setRoundPanel(hasPendingPreviousItems ? "previous" : "current");
    setAttemptedSubmit(false);
    setCriteriaFilter("all");
    setExpandedCriterionKey(null);

    setIntegrityChecks(query.data.review?.integrityChecks ?? {});
    submitKey.current = crypto.randomUUID();
    setKeyStrengths(query.data.review?.keyStrengths ?? "");
    setKeyConcerns(query.data.review?.keyConcerns ?? "");
    setOverallComment(query.data.review?.overallComment ?? "");
    setOverallAssessment(query.data.review?.overallAssessment ?? undefined);
    setCommentOnly(wasCommentOnly);

    // Derive mentor feedback-first action cleanly from saved review state
    if (wasCommentOnly) {
      setMentorAction(query.data.requiredRevisions.length > 0 ? "SELF_REVISE" : "CONTINUE");
    } else if (
      query.data.review?.overallAssessment === "MINOR_REVISION" ||
      query.data.review?.overallAssessment === "MAJOR_REVISION" ||
      query.data.review?.overallAssessment === "NOT_READY"
    ) {
      setMentorAction("RESUBMIT");
    } else {
      setMentorAction("SELF_REVISE");
    }

    setRequiredRevisions(
      query.data.requiredRevisions.map(item => ({
        priority: item.priority,
        description: item.description,
        locator: item.locator ?? undefined,
        criterionKey: item.criterionKey ?? undefined,
        quotation: item.quotation ?? undefined,
      })),
    );
    setResponses(
      Object.fromEntries(
        query.data.criteria.map(criterion => {
          const stored = query.data!.responses.find(item => item.criterionKey === criterion.key);
          return [
            criterion.key,
            {
              comment: stored?.comment ?? "",
              evidence: stored?.evidence ?? "",
              assessment: (stored?.assessment ?? undefined) as StructuredAssessment | undefined,
              performanceLevelId: stored?.performanceLevelId ?? undefined,
              notApplicable: stored?.notApplicable ?? false,
            },
          ];
        }),
      ),
    );
    const firstKey = query.data.criteria[0]?.key ?? "";
    setActiveKey(firstKey);
    setOpenKeys(firstKey ? { [firstKey]: true } : {});
    setDirty(false);
    setSaveState("saved");
  }, [assignmentId, query.data]);

  const isMentorGuidance = query.data?.request?.origin === "MENTOR_GUIDANCE";
  const effectiveFeedbackMode = isMentorGuidance && workspaceMode === "feedback";

  const payload = useCallback((): AcademicReviewInput => {
    const cleanedIntegrityChecks = Object.fromEntries(
      Object.entries(integrityChecks).map(([key, entry]) => [
        key,
        entry.status === "CONCERN"
          ? { status: entry.status, ...(entry.note?.trim() ? { note: entry.note.trim() } : {}) }
          : { status: entry.status },
      ]),
    );
    const cleanedRevisions = requiredRevisions
      .filter(item => item.description.trim())
      .map(item => ({
        priority: item.priority,
        description: item.description.trim(),
        ...(item.locator?.trim() ? { locator: item.locator.trim() } : {}),
        ...(item.criterionKey ? { criterionKey: item.criterionKey } : {}),
        ...(item.quotation?.trim() ? { quotation: item.quotation.trim() } : {}),
      }));

    if (effectiveFeedbackMode) {
      const action = mentorAction ?? "SELF_REVISE";
      const hasMajor = cleanedRevisions.some(item => item.priority === "MAJOR");
      return {
        integrityChecks: cleanedIntegrityChecks,
        expectedRevisionId: query.data?.artifactRevision?.id,
        expectedRoundNumber: query.data?.roundNumber,
        keyStrengths: keyStrengths.trim() || undefined,
        keyConcerns: keyConcerns.trim() || undefined,
        overallComment: overallComment.trim() || undefined,
        feedbackOnly: true,
        mentorAction: action,
        commentOnly: action !== "RESUBMIT" ? true : undefined,
        overallAssessment: action === "RESUBMIT" ? (hasMajor ? "MAJOR_REVISION" : "MINOR_REVISION") : undefined,
        responses: (query.data?.criteria ?? []).map(criterion => ({
          criterionKey: criterion.key,
          comment: responses[criterion.key]?.comment.trim() || undefined,
          evidence: responses[criterion.key]?.evidence.trim() || undefined,
          assessment: responses[criterion.key]?.assessment ?? undefined,
          performanceLevelId: responses[criterion.key]?.performanceLevelId ?? undefined,
          notApplicable: responses[criterion.key]?.notApplicable,
        })),
        requiredRevisions: cleanedRevisions,
      };
    }

    return {
      integrityChecks: cleanedIntegrityChecks,
      expectedRevisionId: query.data?.artifactRevision?.id,
      expectedRoundNumber: query.data?.roundNumber,
      keyStrengths: keyStrengths.trim() || undefined,
      keyConcerns: keyConcerns.trim() || undefined,
      overallComment: overallComment.trim() || undefined,
      overallAssessment: overallAssessment ?? undefined,
      commentOnly: commentOnly || undefined,
      responses: (query.data?.criteria ?? []).map(criterion => ({
        criterionKey: criterion.key,
        comment: responses[criterion.key]?.comment.trim() || undefined,
        evidence: responses[criterion.key]?.evidence.trim() || undefined,
        assessment: responses[criterion.key]?.assessment ?? undefined,
        performanceLevelId: responses[criterion.key]?.performanceLevelId ?? undefined,
        notApplicable: responses[criterion.key]?.notApplicable,
      })),
      requiredRevisions: commentOnly ? [] : cleanedRevisions,
    };
  }, [
    commentOnly,
    effectiveFeedbackMode,
    integrityChecks,
    keyConcerns,
    keyStrengths,
    mentorAction,
    overallAssessment,
    overallComment,
    query.data?.artifactRevision?.id,
    query.data?.criteria,
    query.data?.roundNumber,
    requiredRevisions,
    responses,
  ]);

  useEffect(() => {
    if (!dirty || saveState === "error" || !query.data || query.data.review?.status === "SUBMITTED") return;
    const generation = editGeneration.current;
    const timer = window.setTimeout(async () => {
      if (save.isPending || sending.current) return;
      setSaveState("saving");
      try {
        await save.mutateAsync(payload());
        if (editGeneration.current === generation) {
          setDirty(false);
          setSaveState("saved");
        }
      } catch {
        if (editGeneration.current === generation) setSaveState("error");
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, payload, query.data, save, saveState]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  // Drag-to-resize split pane handler
  useEffect(() => {
    if (!draggingSplit) return;
    const onMove = (event: PointerEvent) => {
      const container = gridRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const rawPct = ((event.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(32, Math.min(72, Math.round(rawPct))));
    };
    const onUp = () => setDraggingSplit(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingSplit]);

  // Observe Review Panel width to switch matrix cleanly to narrow-panel list fallback
  useEffect(() => {
    const node = evalPaneRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setIsNarrowPanel(width < 500);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [query.data]);

  const markDirty = () => {
    editGeneration.current += 1;
    submitKey.current = crypto.randomUUID();
    setDirty(true);
    setSaveState("saving");
  };

  const isCriterionComplete = useCallback(
    (criterion: { key: string; allowNotApplicable: boolean }) => {
      const response = responses[criterion.key];
      if (!response) return false;
      if (response.notApplicable) return criterion.allowNotApplicable;
      if (query.data?.templateVersion?.reviewMode === "RUBRIC_ASSESSMENT") return Boolean(response.performanceLevelId);
      if (query.data?.templateVersion?.reviewMode === "STRUCTURED_REVIEW") {
        return Boolean(response.assessment);
      }
      return Boolean(response.comment.trim());
    },
    [query.data?.templateVersion?.reviewMode, responses],
  );

  const completedCount = useMemo(
    () => (query.data?.criteria ?? []).filter(isCriterionComplete).length,
    [isCriterionComplete, query.data?.criteria],
  );

  if (query.isLoading) {
    return (
      <Container className={embedded ? "rw-shell" : "rw-shell rw-shell-standalone"}>
        <PageSkeleton variant="review-workspace" embedded={embedded} label={t("loading.reviewWorkspace")} />
      </Container>
    );
  }
  if (!query.data || query.error) {
    return (
      <Container className="mx-auto max-w-2xl px-4 py-12">
        <SectionErrorState
          error={query.error}
          title={t("reviewWorkspace.unavailable")}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Container>
    );
  }

  const workspace = query.data;
  const mode = workspace.templateVersion?.reviewMode ?? "GUIDED_FEEDBACK";
  const systemRubric = isLumiGapSystemRubric(workspace.templateVersion?.guidelines);
  const rubricContext = {
    artifactType: workspace.assignment.submissionId.submissionType,
    versionNumber: workspace.templateVersion?.versionNumber,
    guidelines: workspace.templateVersion?.guidelines,
  };
  const metrics = rubricDetailedMetrics(workspace.criteria, responses);
  const uniformMaxScore = (() => {
    if (mode !== "RUBRIC_ASSESSMENT" || workspace.criteria.length === 0) return null;
    const maxes = workspace.criteria.map(c =>
      c.levels.length > 0 ? Math.max(...c.levels.map(l => l.score)) : null,
    );
    const first = maxes[0];
    if (first == null || maxes.some(m => m !== first)) return null;
    return first;
  })();
  const integrityRequired = requiresScientificIntegrity(workspace.templateVersion?.guidelines, workspace.request?.origin);
  const completed = workspace.review?.status === "SUBMITTED" && workspace.request?.status !== "RESUBMITTED";
  const revisionNum = workspace.artifactRevision?.revisionNumber ?? workspace.assignment.submissionId.currentRevisionNumber;
  const allExpanded = workspace.criteria.length > 0 && workspace.criteria.every(c => openKeys[c.key]);
  const totalCriteria = workspace.criteria.length;
  const unscoredCount = totalCriteria - completedCount;
  const countPct = totalCriteria > 0 ? Math.round((completedCount / totalCriteria) * 1000) / 10 : 0;

  const hasPreviousRound =
    workspace.previousRevisionItems.length > 0 || (workspace.previousReviews?.length ?? 0) > 0;
  const previousCount = workspace.previousRevisionItems.length || (workspace.previousReviews?.length ?? 0);

  const comparisonBaseline = resolveComparisonBaseline({
    artifactRevision: workspace.artifactRevision,
    comparisonVersions: workspace.comparisonVersions,
    previousReviews: workspace.previousReviews,
    previousRevisionItems: workspace.previousRevisionItems,
  });

  const activeCompareBefore =
    comparisonBaseline.status === "available"
      ? comparisonBaseline.selectableBaselines.find(v => v.id === selectedBaselineId) ?? comparisonBaseline.defaultBefore
      : undefined;

  const priorCriteriaMap = buildCompatiblePriorCriteriaMap({
    previousReviews: workspace.previousReviews,
    currentTemplateVersionId: workspace.templateVersion?.id,
  });

  const latestPriorIntegrityReview = [...(workspace.previousReviews ?? [])]
    .sort((a, b) => b.roundNumber - a.roundNumber)
    .find(rev => rev.integrityChecks && Object.keys(rev.integrityChecks).length > 0);
  const priorIntegrity = latestPriorIntegrityReview
    ? { roundNumber: latestPriorIntegrityReview.roundNumber, checks: latestPriorIntegrityReview.integrityChecks }
    : undefined;

  const handleVerifyRevisionItem = async (itemId: string, status: "ACCEPTED" | "REOPENED") => {
    if (!workspace.request || verifyingItemIds[itemId]) return;
    setVerifyingItemIds(prev => ({ ...prev, [itemId]: true }));
    try {
      await reviewsApi.verifyRevision(
        workspace.request.id,
        itemId,
        status,
        workspace.artifactRevision?.id,
      );
      await query.refetch();
      await client.invalidateQueries({ queryKey: ["review-requests"] });
      await client.invalidateQueries({ queryKey: ["submissions"] });
    } catch {
      toast.error(t("reviewWorkspace.verifyError"));
    } finally {
      setVerifyingItemIds(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleJumpToPdfPage = (pageNum: number) => {
    setWorkspaceView("review");
    setMobileTab("manuscript");
    setJumpToPageRequest({ page: pageNum, nonce: Date.now() });
  };

  const handleAssignedBlobLoaded = (revId: string, blob: Blob) => {
    setAssignedPdfCache(prev => (prev?.revisionId === revId && prev.blob === blob ? prev : { revisionId: revId, blob }));
  };

  const cachedBlobForAssigned =
    workspace.artifactRevision?.id && assignedPdfCache?.revisionId === workspace.artifactRevision.id
      ? assignedPdfCache.blob
      : null;

  const visibleCriteria =
    criteriaFilter === "unscored"
      ? workspace.criteria.filter(c => !isCriterionComplete(c))
      : workspace.criteria;

  const nonEmptyIssues = requiredRevisions.filter(item => item.description.trim());
  const mandatoryIssues = nonEmptyIssues.filter(item => item.priority !== "SUGGESTION");
  const suggestionIssues = nonEmptyIssues.filter(item => item.priority === "SUGGESTION");
  const allCriteriaOrderMap = new Map(workspace.criteria.map((c, idx) => [c.key, idx]));
  const revisionCountByCriterion = nonEmptyIssues.reduce<Record<string, number>>((acc, item) => {
    if (item.criterionKey) acc[item.criterionKey] = (acc[item.criterionKey] ?? 0) + 1;
    return acc;
  }, {});

  const readiness = computeRubricReadiness({
    criteria: workspace.criteria,
    getCriterionTitle: criterion => localizeSystemCriterion(criterion, language, systemRubric, rubricContext).title,
    responses,
    reviewMode: mode,
    commentOnly,
    overallAssessment: overallAssessment ?? "",
    overallComment,
    requiredRevisions,
    integrityChecks,
    guidelines: workspace.templateVersion?.guidelines ?? [],
    origin: workspace.request?.origin,
    previousRevisionItems: workspace.previousRevisionItems,
  });

  const criteriaIssueCount =
    readiness.missingRequiredCriteria.length + readiness.lowScoreMissingCommentCriteria.length;
  const nonCriteriaIssueCount = readiness.issues.length - criteriaIssueCount;
  const isRevisionAssessment =
    overallAssessment === "MINOR_REVISION" ||
    overallAssessment === "MAJOR_REVISION" ||
    overallAssessment === "NOT_READY";

  function switchRubricSection(next: RubricSection) {
    setRoundPanel("current");
    setRubricSection(next);
    if (evalScrollRef.current) {
      evalScrollRef.current.scrollTop = 0;
    }
  }

  function handleCreateRevisionFromCriterion(draft: {
    criterionKey: string;
    description: string;
    priority: FeedbackItemPriority;
    locator?: string;
    quotation?: string;
  }): { added: boolean; duplicate?: boolean } {
    const normalizedDesc = draft.description.trim().toLowerCase();
    if (!normalizedDesc) return { added: false };
    const isDuplicate = requiredRevisions.some(
      item =>
        (item.criterionKey ?? "") === draft.criterionKey &&
        item.description.trim().toLowerCase() === normalizedDesc,
    );
    if (isDuplicate) return { added: false, duplicate: true };
    setRequiredRevisions(current => [
      ...current,
      {
        priority: draft.priority,
        description: draft.description.trim(),
        criterionKey: draft.criterionKey,
        locator: draft.locator?.trim() || undefined,
        quotation: draft.quotation?.trim() || undefined,
      },
    ]);
    markDirty();
    return { added: true };
  }

  function handleUpdateRevisionFromCriterion(
    index: number,
    draft: {
      criterionKey: string;
      description: string;
      priority: FeedbackItemPriority;
      locator?: string;
      quotation?: string;
    },
  ): { updated: boolean; duplicate?: boolean } {
    const normalizedDesc = draft.description.trim().toLowerCase();
    if (!normalizedDesc) return { updated: false };
    const isDuplicate = requiredRevisions.some(
      (item, i) =>
        i !== index &&
        (item.criterionKey ?? "") === draft.criterionKey &&
        item.description.trim().toLowerCase() === normalizedDesc,
    );
    if (isDuplicate) return { updated: false, duplicate: true };
    setRequiredRevisions(current =>
      current.map((item, i) =>
        i === index
          ? {
            priority: draft.priority,
            description: draft.description.trim(),
            criterionKey: draft.criterionKey,
            locator: draft.locator?.trim() || undefined,
            quotation: draft.quotation?.trim() || undefined,
          }
          : item,
      ),
    );
    markDirty();
    return { updated: true };
  }

  function handleDeleteRevisionFromCriterion(index: number) {
    setRequiredRevisions(current => current.filter((_, i) => i !== index));
    markDirty();
  }

  function jumpToCriterion(criterionKey: string) {
    setRoundPanel("current");
    setRubricSection("criteria");
    setCriteriaFilter("all");
    setExpandedCriterionKey(criterionKey);
    setActiveKey(criterionKey);
    setOpenKeys(current => ({ ...current, [criterionKey]: true }));
    window.requestAnimationFrame(() => scrollInnerTo(`criterion-${criterionKey}`));
  }

  function handleCreateRevisionFromConcern(draft: {
    description: string;
    priority: FeedbackItemPriority;
    locator?: string;
  }): { added: boolean; duplicate?: boolean } {
    const normalizedDesc = draft.description.trim().toLowerCase();
    if (!normalizedDesc) return { added: false };
    const isDuplicate = requiredRevisions.some(
      item => !item.criterionKey && item.description.trim().toLowerCase() === normalizedDesc,
    );
    if (isDuplicate) return { added: false, duplicate: true };
    setRequiredRevisions(current => [
      ...current,
      {
        priority: draft.priority,
        description: draft.description.trim(),
        locator: draft.locator?.trim() || undefined,
      },
    ]);
    markDirty();
    return { added: true };
  }

  function jumpToIntegrityCheck(checkKey?: ScientificIntegrityCheckKey) {
    setSubmitOpen(false);
    setMissingListOpen(false);
    setRoundPanel("current");
    setRubricSection("integrity");
    setFocusedIntegrityKey(checkKey ?? null);
    window.requestAnimationFrame(() => {
      scrollInnerTo(checkKey ? `integrity-row-${checkKey}` : "review-integrity");
    });
  }

  function jumpToReadinessIssue(issue: ReadinessIssue) {
    setSubmitOpen(false);
    setMissingListOpen(false);
    if (issue.targetSection === "previous") {
      setRoundPanel("previous");
      return;
    }
    if (issue.targetSection === "integrity") {
      jumpToIntegrityCheck(issue.integrityCheckKey);
      return;
    }
    setRoundPanel("current");
    setRubricSection(issue.targetSection);
    if (issue.criterionKey) {
      setCriteriaFilter("all");
      setExpandedCriterionKey(issue.criterionKey);
      setActiveKey(issue.criterionKey);
      setOpenKeys(current => ({ ...current, [issue.criterionKey!]: true }));
      window.requestAnimationFrame(() => scrollInnerTo(`criterion-${issue.criterionKey}`));
      return;
    }
    if (issue.focusElementId) {
      window.requestAnimationFrame(() => {
        scrollInnerTo(issue.focusElementId!);
        const el = document.getElementById(issue.focusElementId!);
        if (!el) return;
        const details = el.querySelector("details");
        if (details) details.open = true;
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
          el.focus();
        }
      });
    }
  }

  const feedbackValidationError = (() => {
    if (!effectiveFeedbackMode) return null;
    if (readiness.addressedPreviousCount > 0) {
      return t("reviewWorkspace.readiness.verifyPreviousAddressed", { count: readiness.addressedPreviousCount });
    }
    if (mentorAction !== "RESUBMIT" && readiness.unresolvedPreviousCount > 0) {
      return t("reviewWorkspace.readiness.resolvePreviousForCommentOnly", { count: readiness.unresolvedPreviousCount });
    }
    if (!overallComment.trim() && nonEmptyIssues.length === 0 && readiness.unresolvedPreviousCount === 0) {
      return t("reviewWorkspace.feedbackFirst.missingComment");
    }
    if (!mentorAction) {
      return t("reviewWorkspace.feedbackFirst.missingAction");
    }
    if (mentorAction === "RESUBMIT" && mandatoryIssues.length === 0 && readiness.unresolvedPreviousCount === 0) {
      return t("reviewWorkspace.feedbackFirst.resubmitNeedsItem");
    }
    return null;
  })();

  const handleDownloadPdf = () => {
    if (!workspace.artifactRevision) return;
    void submissionsApi
      .downloadRevision(
        workspace.assignment.submissionId.id,
        workspace.artifactRevision.id,
        workspace.artifactRevision.revisionNumber,
      )
      .catch(() => toast.error(t("reviewWorkspace.pdfUnavailable")));
  };

  function updateResponse(key: string, change: Partial<CriterionState>) {
    setResponses(current => ({
      ...current,
      [key]: {
        ...current[key],
        comment: current[key]?.comment ?? "",
        evidence: current[key]?.evidence ?? "",
        notApplicable: current[key]?.notApplicable ?? false,
        ...change,
      },
    }));
    markDirty();
  }

  function scrollInnerTo(elementId: string) {
    const container = evalScrollRef.current;
    const target = document.getElementById(elementId);
    if (!target) return;
    if (container && container.scrollHeight > container.clientHeight + 2) {
      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 8;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function focusCriterion(key: string, collapseOthers = true) {
    setActiveKey(key);
    setOpenKeys(current => (collapseOthers ? { [key]: true } : { ...current, [key]: true }));
    window.requestAnimationFrame(() => scrollInnerTo(`criterion-${key}`));
  }

  function toggleExpandAll() {
    if (allExpanded) {
      const keep = activeKey || workspace.criteria[0]?.key || "";
      setOpenKeys(keep ? { [keep]: true } : {});
    } else {
      setOpenKeys(Object.fromEntries(workspace.criteria.map(c => [c.key, true])));
    }
  }

  function applyLocationPrefix(index: number, prefix: string, replaceAll = false) {
    setRequiredRevisions(current =>
      current.map((item, i) => {
        if (i !== index) return item;
        if (replaceAll) return { ...item, locator: prefix };
        const existing = (item.locator ?? "").trim();
        if (!existing || existing === t("reviewWorkspace.feedbackFirst.location.whole")) {
          return { ...item, locator: prefix };
        }
        if (existing.toLowerCase().startsWith(prefix.trim().toLowerCase())) return item;
        return { ...item, locator: `${prefix}${existing}` };
      }),
    );
    markDirty();
  }

  async function saveNow() {
    const generation = editGeneration.current;
    setSaveState("saving");
    try {
      await save.mutateAsync(payload());
      if (editGeneration.current === generation) {
        setDirty(false);
        setSaveState("saved");
      }
      toast.success(t("reviewWorkspace.toast.saved"));
    } catch {
      if (editGeneration.current === generation) setSaveState("error");
      toast.error(t("reviewWorkspace.toast.saveError"));
    }
  }

  function requestOpenSubmit() {
    setAttemptedSubmit(true);
    if (effectiveFeedbackMode && feedbackValidationError) {
      toast.error(feedbackValidationError);
      return;
    }
    setSubmitOpen(true);
  }

  async function submitNow() {
    if (sending.current) return;
    sending.current = true;
    try {
      if (dirty) await save.mutateAsync(payload());
      const submitted = await submit.mutateAsync({ ...payload(), clientKey: submitKey.current });
      toast.success(t("reviewWorkspace.toast.submitted"));
      setDirty(false);
      setSaveState("saved");
      setAttemptedSubmit(false);
      if (workspace.request?.origin === "MENTOR_GUIDANCE" && workspace.request.id) {
        const context = new URLSearchParams({ detailTab: "feedback" });
        if (submitted?.review?.id) context.set("reviewId", submitted.review.id);
        navigate(`/review-requests/${encodeURIComponent(workspace.request.id)}?${context}`, { replace: true });
      } else if (!embedded) navigate("/reviews");
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || t("reviewWorkspace.toast.submitError"));
    } finally {
      sending.current = false;
      setSubmitOpen(false);
    }
  }

  const sortedPreviousItems = [...workspace.previousRevisionItems].sort(
    (a, b) => (SEVERITY_ORDER[a.priority ?? "MINOR"] ?? 1) - (SEVERITY_ORDER[b.priority ?? "MINOR"] ?? 1),
  );

  const showProjectSubtitle =
    Boolean(workspace.projectTitle) &&
    workspace.projectTitle!.trim().toLowerCase() !== workspace.assignment.submissionId.title.trim().toLowerCase();

  return (
    <Container className={embedded ? "rw-shell" : "rw-shell rw-shell-standalone"} data-no-i18n>
      {!embedded ? (
        <div className="mb-2.5">
          <Link
            to={href("/reviews")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>{t("reviewWorkspace.backToCenter")}</span>
          </Link>
        </div>
      ) : null}

      {/* Compact Single-Row Header */}
      <header className="rw-header">
        <div className="rw-header-main">
          <div className="rw-header-title-row">
            <h1 className="truncate">{workspace.assignment.submissionId.title}</h1>
            <Badge variant="secondary" className="h-5 px-2 text-[11px] font-semibold">
              v{revisionNum}
            </Badge>
            <Badge variant="outline" className="h-5 px-2 text-[11px]">
              {t("reviewWorkspace.round", { round: workspace.roundNumber })}
            </Badge>
            <Badge
              variant="outline"
              className={
                effectiveFeedbackMode
                  ? "h-5 border-primary/30 bg-primary/10 px-2 text-[11px] text-primary"
                  : !isMentorGuidance
                    ? "h-5 border-indigo-500/30 bg-indigo-500/10 px-2 text-[11px] text-indigo-700 dark:text-indigo-300"
                    : "h-5 px-2 text-[11px]"
              }
            >
              {effectiveFeedbackMode
                ? t("reviewWorkspace.modeBadge.feedback")
                : !isMentorGuidance
                  ? t("reviewWorkspace.modeBadge.peerReview")
                  : modeLabel(mode, t)}
            </Badge>
          </div>
          <div className="rw-header-meta">
            {showProjectSubtitle ? (
              <>
                <span className="font-medium text-foreground/80">{workspace.projectTitle}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            {workspace.delivery ? (
              <>
                <span>{workspace.delivery.authors.join(", ")}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {t("mentorWorkspace.sentAt")} {new Date(workspace.delivery.sentAt).toLocaleString(language)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="rw-header-actions">
          <span className="rw-save-pill" data-state={saveState} role="status" aria-live="polite">
            <span className="rw-save-dot" aria-hidden="true" />
            <span>
              {saveState === "saving"
                ? t("reviewWorkspace.savingDraft")
                : saveState === "error"
                  ? t("reviewWorkspace.autosaveFailed")
                  : t("reviewWorkspace.draftSaved")}
            </span>
          </span>

          {/* Compact Compare Mode Toggle (Review Mode only — Compare Mode has its own Back to review bar) */}
          {workspaceView === "review" && comparisonBaseline.status === "available" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              data-testid="header-compare-toggle"
              onClick={() => setWorkspaceView("compare")}
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {t("reviewWorkspace.compare.ctaVersions", {
                  before: comparisonBaseline.defaultBefore.revisionNumber,
                  after: comparisonBaseline.after.revisionNumber,
                })}
              </span>
            </Button>
          ) : null}

          {/* Split Presets (Desktop only, Review Mode only) */}
          {workspaceView === "review" ? (
            <div className="rw-layout-switch" role="group" aria-label={t("reviewWorkspace.layoutBalanced")}>
              <button
                type="button"
                data-active={splitPct >= 62}
                title={t("reviewWorkspace.layoutReaderLabel")}
                onClick={() => setSplitPct(66)}
              >
                {t("reviewWorkspace.layoutReaderLabel")}
              </button>
              <button
                type="button"
                data-active={splitPct > 45 && splitPct < 62}
                title={t("reviewWorkspace.layoutBalancedLabel")}
                onClick={() => setSplitPct(DEFAULT_SPLIT_PCT)}
              >
                <Columns2 size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                data-active={splitPct <= 45}
                title={t("reviewWorkspace.layoutFeedbackLabel")}
                onClick={() => setSplitPct(40)}
              >
                {t("reviewWorkspace.layoutFeedbackLabel")}
              </button>
              {splitPct !== DEFAULT_SPLIT_PCT ? (
                <button
                  type="button"
                  title={t("reviewWorkspace.layoutReset")}
                  aria-label={t("reviewWorkspace.layoutReset")}
                  onClick={() => setSplitPct(DEFAULT_SPLIT_PCT)}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}

          {workspace.templateSelection?.canChangeTemplate && workspace.request && !completed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setTemplateSelectorOpen(true)}
            >
              <Shapes className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("reviewTemplates.selector.changeAction")}</span>
            </Button>
          ) : null}

          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setGuidelinesOpen(true)}>
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("reviewWorkspace.guidelines")}</span>
          </Button>
          {workspace.manuscriptSource ? (
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link
                to={`/projects/${workspace.manuscriptSource.projectId}/manuscripts/${workspace.manuscriptSource.manuscriptId}?snapshot=${workspace.manuscriptSource.snapshotId}`}
              >
                {t("View manuscript source version")}
              </Link>
            </Button>
          ) : null}
          {workspace.artifactContent ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setArtifactOpen(true)}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("reviewWorkspace.viewArtifact")}</span>
            </Button>
          ) : null}
          {workspace.artifactRevision?.contentType === "PDF" ? (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownloadPdf}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("reviewWorkspace.downloadPdf")}</span>
            </Button>
          ) : null}
          {workspace.request ? (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Link to={href(`/review-requests/${encodeURIComponent(workspace.request.id)}`)}>
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("reviewWorkspace.reviewHistory")}</span>
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {/* COMPARE MODE (2 PDFs max, full workspace) OR REVIEW MODE (1 PDF + Evaluation Panel) */}
      {workspaceView === "compare" && comparisonBaseline.status === "available" && activeCompareBefore ? (
        <RevisionCompareView
          assignmentId={workspace.assignment.id}
          submissionId={workspace.assignment.submissionId.id}
          before={activeCompareBefore}
          after={comparisonBaseline.after}
          selectableBaselines={comparisonBaseline.selectableBaselines}
          onSelectBaseline={setSelectedBaselineId}
          baselineRoundNumber={
            workspace.previousReviews?.find(r => r.revisionId === activeCompareBefore.id)?.roundNumber ??
            comparisonBaseline.baselineRoundNumber
          }
          currentRoundNumber={workspace.roundNumber}
          hasPreviousFeedback={(workspace.previousReviews?.length ?? 0) > 0}
          previousFeedbackCount={
            workspace.previousRevisionItems.length > 0
              ? workspace.previousRevisionItems.length
              : (workspace.previousReviews?.length ?? 0)
          }
          currentCriteria={workspace.criteria}
          currentTemplateGuidelines={workspace.templateVersion?.guidelines}
          assignedCachedBlob={cachedBlobForAssigned}
          onAssignedBlobLoaded={handleAssignedBlobLoaded}
          initialAssignedView={assignedPdfViewRef.current}
          onAssignedViewChange={state => {
            assignedPdfViewRef.current = state;
          }}
          onExitCompare={() => setWorkspaceView("review")}
        />
      ) : (
        <>
          {/* Mobile / Tablet Tab Switcher (<= 1024px) */}
          <div className="rw-mobile-tabs" role="tablist" aria-label={t("reviewWorkspace.mobileTab.manuscript")}>
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "manuscript"}
              className="rw-mobile-tab"
              data-active={mobileTab === "manuscript" ? "true" : undefined}
              onClick={() => setMobileTab("manuscript")}
            >
              <FileText size={14} aria-hidden="true" />
              <span>
                {t("reviewWorkspace.mobileTab.manuscript")} (v{revisionNum})
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "feedback"}
              className="rw-mobile-tab"
              data-active={mobileTab === "feedback" ? "true" : undefined}
              onClick={() => setMobileTab("feedback")}
            >
              <MessageSquareText size={14} aria-hidden="true" />
              <span>
                {roundPanel === "previous" && hasPreviousRound
                  ? t("reviewWorkspace.roundTab.previous", { count: previousCount })
                  : effectiveFeedbackMode
                    ? t("reviewWorkspace.mobileTab.feedback")
                    : t("reviewWorkspace.modeTab.rubric")}
              </span>
            </button>
          </div>

          {/* Main Split Grid */}
          <div
            ref={gridRef}
            className="rw-grid"
            data-mobile-tab={mobileTab}
            data-dragging={draggingSplit ? "true" : undefined}
            style={{ "--rw-left-pct": `${splitPct}%` } as React.CSSProperties}
          >
            {/* Left Fixed Manuscript Reader Pane (Single PDF in Review Mode) */}
            <aside className="rw-reader-pane" data-testid="review-mode-reader">
              <div className="rw-reader-header">
                <div className="rw-reader-title">
                  <Lock size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="truncate">{t("reviewWorkspace.assignedRevision", { version: revisionNum })}</span>
                </div>
                <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                  {t("reviewWorkspace.immutableHint")}
                </span>
              </div>

              <AssignedRevisionReader
                key={`review-assigned-${workspace.artifactRevision?.id ?? "none"}`}
                compact
                submissionId={workspace.assignment.submissionId.id}
                revisionId={workspace.artifactRevision?.id}
                contentType={workspace.artifactRevision?.contentType}
                text={workspace.artifactContent}
                cachedBlob={cachedBlobForAssigned}
                onBlobLoaded={handleAssignedBlobLoaded}
                initialPage={assignedPdfViewRef.current?.page}
                initialFitMode={assignedPdfViewRef.current?.fitMode}
                initialZoom={assignedPdfViewRef.current?.customZoom}
                jumpToPageRequest={jumpToPageRequest}
                onViewStateChange={state => {
                  assignedPdfViewRef.current = state;
                }}
                onDownload={workspace.artifactRevision?.contentType === "PDF" ? handleDownloadPdf : undefined}
              />
            </aside>

            {/* Draggable Split Resize Handle (Desktop) */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t("reviewWorkspace.dragResize")}
              aria-valuenow={splitPct}
              aria-valuemin={32}
              aria-valuemax={72}
              tabIndex={0}
              className="rw-resizer"
              onPointerDown={e => {
                e.preventDefault();
                setDraggingSplit(true);
              }}
              onDoubleClick={() => setSplitPct(DEFAULT_SPLIT_PCT)}
              onKeyDown={e => {
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setSplitPct(prev => Math.max(32, prev - 3));
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setSplitPct(prev => Math.min(72, prev + 3));
                } else if (e.key === "Home") {
                  e.preventDefault();
                  setSplitPct(DEFAULT_SPLIT_PCT);
                }
              }}
            >
              <span className="rw-resizer-grip" aria-hidden="true">
                <GripVertical size={13} />
              </span>
            </div>

            {/* Right Evaluation & Feedback Pane */}
            <div ref={evalPaneRef} className="rw-eval-pane">
              {/* Mode Switcher + Revision-First Tab Bar (no duplicate tab layers) */}
              {isMentorGuidance || hasPreviousRound ? (
                <div className="rw-pane-switcher">
                  <div className="rw-segmented" role="tablist" aria-label={t("reviewWorkspace.modeTab.feedback")}>
                    {hasPreviousRound ? (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={roundPanel === "previous"}
                        className="rw-segmented-btn"
                        data-active={roundPanel === "previous" ? "true" : undefined}
                        onClick={() => setRoundPanel("previous")}
                      >
                        <History size={14} aria-hidden="true" />
                        <span>{t("reviewWorkspace.roundTab.previous", { count: previousCount })}</span>
                        {readiness.addressedPreviousCount > 0 ? (
                          <span className="rw-subnav-badge" data-tone="warn">
                            {readiness.addressedPreviousCount}
                          </span>
                        ) : null}
                      </button>
                    ) : null}

                    {isMentorGuidance ? (
                      <>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={workspaceMode === "feedback" && roundPanel === "current"}
                          className="rw-segmented-btn"
                          data-active={workspaceMode === "feedback" && roundPanel === "current" ? "true" : undefined}
                          onClick={() => {
                            setWorkspaceMode("feedback");
                            setRoundPanel("current");
                          }}
                        >
                          <MessageSquareText size={14} aria-hidden="true" />
                          <span>{t("reviewWorkspace.modeTab.feedback")}</span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={workspaceMode === "rubric" && roundPanel === "current"}
                          className="rw-segmented-btn"
                          data-active={workspaceMode === "rubric" && roundPanel === "current" ? "true" : undefined}
                          onClick={() => {
                            setWorkspaceMode("rubric");
                            setRoundPanel("current");
                          }}
                        >
                          <ClipboardCheck size={14} aria-hidden="true" />
                          <span>
                            {mode === "RUBRIC_ASSESSMENT"
                              ? t("reviewWorkspace.modeTab.rubric")
                              : modeLabel(mode, t)}
                          </span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={roundPanel === "current"}
                        className="rw-segmented-btn"
                        data-active={roundPanel === "current" ? "true" : undefined}
                        onClick={() => setRoundPanel("current")}
                      >
                        <ClipboardCheck size={14} aria-hidden="true" />
                        <span>{t("reviewWorkspace.roundTab.current")}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              <div ref={evalScrollRef} className="rw-eval-scroll">
                {/* PREVIOUS ROUND REVISION-FIRST VERIFICATION PANEL */}
                {roundPanel === "previous" && hasPreviousRound ? (
                  <PreviousRevisionPanel
                    assignedRevisionId={workspace.artifactRevision?.id}
                    assignedRevisionNumber={revisionNum}
                    currentRoundNumber={workspace.roundNumber}
                    previousReviews={workspace.previousReviews}
                    previousRevisionItems={workspace.previousRevisionItems}
                    baseline={comparisonBaseline}
                    completed={completed}
                    canVerify={Boolean(workspace.request)}
                    verifyingItemIds={verifyingItemIds}
                    onVerifyItem={handleVerifyRevisionItem}
                    onOpenCompare={() => setWorkspaceView("compare")}
                    onJumpToPage={workspace.artifactRevision?.contentType === "PDF" ? handleJumpToPdfPage : undefined}
                    onProceedToAssessment={() => setRoundPanel("current")}
                  />
                ) : (
                  <>
                    <AssignedReviewAdvisory
                      submissionId={workspace.assignment.submissionId.id}
                      revisionId={workspace.artifactRevision?.id}
                    />

                    {/* Team Request Context Card (if team wrote a message) */}
                    {workspace.request?.message ? (
                      <section className="rw-request-note">
                        <p className="text-xs font-semibold text-primary">
                          {t("reviewWorkspace.teamRequestTitle")}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {workspace.request.message}
                        </p>
                      </section>
                    ) : null}

                    {/* ====================================================== */}
                    {/* MODE A: FEEDBACK-FIRST (MENTOR GUIDANCE DEFAULT)       */}
                    {/* ====================================================== */}
                    {effectiveFeedbackMode ? (
                      <div className="space-y-3">
                        <section className="rw-card p-4 sm:p-5 space-y-4">
                          <div>
                            <h2 className="text-sm font-semibold text-foreground">
                              {t("reviewWorkspace.feedbackFirst.overallLabel")}
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t("reviewWorkspace.feedbackFirst.hint")}
                            </p>
                          </div>

                          <textarea
                            disabled={completed}
                            aria-label={t("reviewWorkspace.feedbackFirst.overallLabel")}
                            value={overallComment}
                            onChange={event => {
                              setOverallComment(event.target.value);
                              markDirty();
                            }}
                            placeholder={t("reviewWorkspace.feedbackFirst.overallPlaceholder")}
                            className="min-h-[120px] w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </section>

                        {/* Specific Issues & Suggestions */}
                        <section className="rw-card p-4 sm:p-5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h2 className="text-sm font-semibold text-foreground">
                                {t("reviewWorkspace.feedbackFirst.issuesTitle")}
                              </h2>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t("reviewWorkspace.feedbackFirst.issuesHint")}
                              </p>
                            </div>
                            {!completed ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => {
                                  setRequiredRevisions(current => [...current, { priority: "MINOR", description: "" }]);
                                  markDirty();
                                }}
                              >
                                <Plus size={14} aria-hidden="true" />
                                <span>{t("reviewWorkspace.feedbackFirst.addIssue")}</span>
                              </Button>
                            ) : null}
                          </div>

                          {requiredRevisions.length > 0 ? (
                            <div className="space-y-2.5">
                              {requiredRevisions.map((item, index) => (
                                <div key={index} className="rw-feedback-item-card" data-tone={item.priority.toLowerCase()}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("mentorWorkspace.revisionLevel")}>
                                      {(["MAJOR", "MINOR", "SUGGESTION"] as const).map(level => {
                                        const meta = severityBadgeMeta(level, t);
                                        const Icon = meta.Icon;
                                        const active = item.priority === level;
                                        return (
                                          <button
                                            key={level}
                                            type="button"
                                            disabled={completed}
                                            aria-pressed={active}
                                            className="rw-severity-btn"
                                            data-tone={meta.tone}
                                            data-active={active ? "true" : undefined}
                                            onClick={() => {
                                              setRequiredRevisions(current =>
                                                current.map((cur, i) => (i === index ? { ...cur, priority: level } : cur)),
                                              );
                                              markDirty();
                                            }}
                                          >
                                            <Icon size={12} aria-hidden="true" />
                                            <span>{meta.label}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {!completed ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        aria-label={t("Remove revision item")}
                                        onClick={() => {
                                          setRequiredRevisions(current => current.filter((_, i) => i !== index));
                                          markDirty();
                                        }}
                                      >
                                        <Trash2 size={14} aria-hidden="true" />
                                      </Button>
                                    ) : null}
                                  </div>

                                  <textarea
                                    disabled={completed}
                                    aria-label={t("Required change")}
                                    value={item.description}
                                    onChange={event => {
                                      setRequiredRevisions(current =>
                                        current.map((cur, i) =>
                                          i === index ? { ...cur, description: event.target.value } : cur,
                                        ),
                                      );
                                      markDirty();
                                    }}
                                    placeholder={t("reviewWorkspace.revisionPlaceholder")}
                                    className="min-h-[68px] w-full rounded-md border bg-background px-3 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-ring"
                                  />

                                  <div className="rw-location-bar">
                                    <div className="rw-location-chips">
                                      <button
                                        type="button"
                                        disabled={completed}
                                        className="rw-location-chip"
                                        onClick={() => applyLocationPrefix(index, language === "vi" ? "Trang " : "Page ")}
                                      >
                                        {t("reviewWorkspace.feedbackFirst.location.page")}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={completed}
                                        className="rw-location-chip"
                                        onClick={() => applyLocationPrefix(index, language === "vi" ? "Mục " : "Section ")}
                                      >
                                        {t("reviewWorkspace.feedbackFirst.location.section")}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={completed}
                                        className="rw-location-chip"
                                        onClick={() => applyLocationPrefix(index, language === "vi" ? "Bảng/Hình " : "Table/Figure ")}
                                      >
                                        {t("reviewWorkspace.feedbackFirst.location.figure")}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={completed}
                                        className="rw-location-chip"
                                        onClick={() =>
                                          applyLocationPrefix(index, t("reviewWorkspace.feedbackFirst.location.whole"), true)
                                        }
                                      >
                                        {t("reviewWorkspace.feedbackFirst.location.whole")}
                                      </button>
                                    </div>
                                    <Input
                                      disabled={completed}
                                      aria-label={t("Page or section reference")}
                                      value={item.locator ?? ""}
                                      maxLength={500}
                                      placeholder={t("reviewWorkspace.feedbackFirst.locatorPlaceholder")}
                                      className="h-8 text-xs"
                                      onChange={event => {
                                        setRequiredRevisions(current =>
                                          current.map((cur, i) =>
                                            i === index ? { ...cur, locator: event.target.value } : cur,
                                          ),
                                        );
                                        markDirty();
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-lg border border-dashed p-3.5 text-xs text-muted-foreground">
                              {t("reviewWorkspace.feedbackFirst.emptyIssues")}
                            </p>
                          )}
                        </section>

                        {/* Final Next-Step Recommendation (3 clean radio cards) */}
                        <section className="rw-card p-4 sm:p-5 space-y-3">
                          <h2 className="text-sm font-semibold text-foreground">
                            {t("reviewWorkspace.feedbackFirst.nextStepTitle")}
                          </h2>
                          <div className="grid gap-2" role="radiogroup" aria-label={t("reviewWorkspace.feedbackFirst.nextStepTitle")}>
                            {(["CONTINUE", "SELF_REVISE", "RESUBMIT"] as const).map(action => {
                              const selected = mentorAction === action;
                              return (
                                <label
                                  key={action}
                                  className="rw-action-card"
                                  data-selected={selected ? "true" : undefined}
                                >
                                  <input
                                    type="radio"
                                    name="mentor-feedback-action"
                                    className="mt-0.5 accent-primary"
                                    disabled={completed}
                                    checked={selected}
                                    onChange={() => {
                                      setMentorAction(action);
                                      markDirty();
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-foreground">
                                      {t(`reviewWorkspace.feedbackFirst.action.${action}`)}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground leading-5">
                                      {t(`reviewWorkspace.feedbackFirst.action.${action}_DESC`)}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      </div>
                    ) : (
                      /* ====================================================== */
                      /* MODE B: COMPACT RUBRIC REVIEW WORKSPACE                */
                      /* ====================================================== */
                      <>
                        {/* Single Primary Compact Progress Header */}
                        {totalCriteria > 0 ? (
                          <section className="rw-rubric-summary" aria-label={t("reviewWorkspace.jumpBarLabel")}>
                            <div className="rw-rubric-summary-top">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                                  <span className="font-semibold text-foreground tabular-nums">
                                    {t("reviewWorkspace.criteriaProgress", {
                                      completed: completedCount,
                                      total: totalCriteria,
                                      pct: formatPctValue(countPct, language),
                                    })}
                                  </span>
                                  {mode === "RUBRIC_ASSESSMENT" ? (
                                    <span className="text-muted-foreground tabular-nums">
                                      · {t("reviewWorkspace.weightCoverage", { pct: metrics.weightCoveragePct })}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="rw-progress-track" aria-hidden="true">
                                  <div
                                    className="rw-progress-fill"
                                    data-complete={completedCount === totalCriteria ? "true" : undefined}
                                    style={{ width: `${Math.min(100, countPct)}%` }}
                                  />
                                </div>

                                {/* Explicit 3-tier readiness separation: criteria vs required fields vs ready to submit */}
                                <div className="rw-readiness-row">
                                  {!commentOnly ? (
                                    <span
                                      className="rw-readiness-chip"
                                      data-state={readiness.allCriteriaScored ? "done" : attemptedSubmit ? "warn" : undefined}
                                    >
                                      {readiness.allCriteriaScored ? (
                                        <Check size={11} aria-hidden="true" />
                                      ) : null}
                                      {readiness.allCriteriaScored
                                        ? t("reviewWorkspace.readiness.criteriaDone")
                                        : t("reviewWorkspace.readiness.criteriaPending", { count: criteriaIssueCount })}
                                    </span>
                                  ) : null}
                                  <span
                                    className="rw-readiness-chip"
                                    data-state={
                                      readiness.requiredFieldsCompleted ? "done" : attemptedSubmit ? "warn" : undefined
                                    }
                                  >
                                    {readiness.requiredFieldsCompleted ? (
                                      <Check size={11} aria-hidden="true" />
                                    ) : null}
                                    {readiness.requiredFieldsCompleted
                                      ? t("reviewWorkspace.readiness.fieldsDone")
                                      : t("reviewWorkspace.readiness.fieldsPending", { count: nonCriteriaIssueCount })}
                                  </span>
                                  {readiness.isReadyToSubmit ? (
                                    <span className="rw-readiness-chip" data-state="done">
                                      <CheckCircle2 size={11} aria-hidden="true" />
                                      {t("reviewWorkspace.readiness.readyToSubmit")}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {mode === "RUBRIC_ASSESSMENT" ? (
                                <div
                                  className="rw-score-summary-pill"
                                  title={t("reviewWorkspace.scoringFormula")}
                                  data-provisional={metrics.isProvisional ? "true" : undefined}
                                  data-complete={metrics.isComplete ? "true" : undefined}
                                >
                                  <span className="text-[11px] font-medium opacity-80">
                                    {metrics.score === null
                                      ? t("reviewWorkspace.weightedScore")
                                      : metrics.isProvisional
                                        ? t("reviewWorkspace.provisionalScore")
                                        : t("reviewWorkspace.weightedScore")}
                                  </span>
                                  <strong className="text-sm font-bold tabular-nums">
                                    {metrics.score === null
                                      ? t("Not assessed")
                                      : `${formatScoreValue(metrics.score, language)}${uniformMaxScore != null ? ` / ${uniformMaxScore}` : ""}`}
                                  </strong>
                                </div>
                              ) : null}
                            </div>

                            {mode === "RUBRIC_ASSESSMENT" && metrics.isProvisional ? (
                              <p className="text-[11px] leading-4 text-muted-foreground">
                                {t("reviewWorkspace.scoreIncompleteHint", { weightPct: metrics.weightCoveragePct })}
                              </p>
                            ) : null}
                          </section>
                        ) : null}

                        {/* Compact Review Panel Sub-Navigation (Criteria | Integrity | Revision Requests | Summary) */}
                        <nav className="rw-subnav" role="tablist" aria-label={t("reviewWorkspace.jumpBarLabel")}>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={rubricSection === "criteria"}
                            className="rw-subnav-tab"
                            data-active={rubricSection === "criteria" ? "true" : undefined}
                            onClick={() => switchRubricSection("criteria")}
                          >
                            <span className="truncate">{t("reviewWorkspace.subTab.criteria")}</span>
                            <span
                              className="rw-subnav-badge"
                              data-tone={
                                !commentOnly && attemptedSubmit && criteriaIssueCount > 0
                                  ? "warn"
                                  : readiness.allCriteriaScored && totalCriteria > 0
                                    ? "done"
                                    : undefined
                              }
                            >
                              {completedCount}/{totalCriteria}
                            </span>
                          </button>

                          {integrityRequired ? (
                            <button
                              type="button"
                              role="tab"
                              aria-selected={rubricSection === "integrity"}
                              className="rw-subnav-tab"
                              data-active={rubricSection === "integrity" ? "true" : undefined}
                              onClick={() => switchRubricSection("integrity")}
                            >
                              <span className="truncate">{t("reviewWorkspace.subTab.integrity")}</span>
                              <span
                                className="rw-subnav-badge"
                                data-tone={
                                  !commentOnly &&
                                    (readiness.integrityConcernMissingNoteKeys.length > 0 ||
                                      (attemptedSubmit &&
                                        (readiness.integrityCompleteCount < readiness.integrityTotalCount ||
                                          (overallAssessment === "STRONG" && readiness.hasIntegrityConcern))))
                                    ? "warn"
                                    : readiness.integrityCompleteCount === readiness.integrityTotalCount
                                      ? "done"
                                      : undefined
                                }
                              >
                                {readiness.integrityCompleteCount}/{readiness.integrityTotalCount}
                              </span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            role="tab"
                            aria-selected={rubricSection === "revisions"}
                            className="rw-subnav-tab"
                            data-active={rubricSection === "revisions" ? "true" : undefined}
                            onClick={() => switchRubricSection("revisions")}
                          >
                            <span className="truncate">{t("reviewWorkspace.subTab.revisions")}</span>
                            <span
                              className="rw-subnav-badge"
                              data-tone={
                                attemptedSubmit && readiness.issues.some(i => i.category === "revisions")
                                  ? "warn"
                                  : undefined
                              }
                            >
                              {nonEmptyIssues.length}
                            </span>
                          </button>

                          <button
                            type="button"
                            role="tab"
                            aria-selected={rubricSection === "summary"}
                            className="rw-subnav-tab"
                            data-active={rubricSection === "summary" ? "true" : undefined}
                            onClick={() => switchRubricSection("summary")}
                          >
                            <span className="truncate">{t("reviewWorkspace.subTab.summary")}</span>
                            {readiness.requiredFieldsCompleted ? (
                              <span className="rw-subnav-badge" data-tone="done" aria-hidden="true">
                                <Check size={10} />
                              </span>
                            ) : attemptedSubmit && nonCriteriaIssueCount > 0 ? (
                              <span className="rw-subnav-badge" data-tone="warn">
                                {nonCriteriaIssueCount}
                              </span>
                            ) : null}
                          </button>
                        </nav>

                        {/* SUB-TAB 1: CRITERIA */}
                        {rubricSection === "criteria" ? (
                          <div role="tabpanel" className="space-y-2.5">
                            {totalCriteria > 0 ? (
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-1.5" role="group">
                                  <button
                                    type="button"
                                    className="rw-filter-pill"
                                    data-active={criteriaFilter === "all" ? "true" : undefined}
                                    onClick={() => setCriteriaFilter("all")}
                                  >
                                    {t("reviewWorkspace.filterAll", { count: totalCriteria })}
                                  </button>
                                  <button
                                    type="button"
                                    className="rw-filter-pill"
                                    data-active={criteriaFilter === "unscored" ? "true" : undefined}
                                    onClick={() => setCriteriaFilter("unscored")}
                                  >
                                    {t("reviewWorkspace.filterUnscored", { count: unscoredCount })}
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {criteriaViewMode === "full" ? (
                                    <button type="button" className="rw-jump-toggle" onClick={toggleExpandAll}>
                                      {allExpanded ? t("reviewWorkspace.collapseOthers") : t("reviewWorkspace.expandAll")}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="rw-jump-toggle"
                                    onClick={() =>
                                      setCriteriaViewMode(prev => (prev === "compact" ? "full" : "compact"))
                                    }
                                  >
                                    {criteriaViewMode === "compact"
                                      ? t("reviewWorkspace.viewMode.full")
                                      : t("reviewWorkspace.viewMode.compact")}
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {visibleCriteria.length === 0 && criteriaFilter === "unscored" ? (
                              <div className="rw-card p-5 text-center text-sm text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5" aria-hidden="true" />
                                <p>{t("reviewWorkspace.allCriteriaDone")}</p>
                              </div>
                            ) : criteriaViewMode === "compact" ? (
                              <CompactRubricMatrix
                                criteria={visibleCriteria}
                                allCriteriaOrderMap={allCriteriaOrderMap}
                                reviewMode={mode}
                                isSystemRubric={systemRubric}
                                rubricContext={rubricContext}
                                responses={responses}
                                requiredRevisions={requiredRevisions}
                                revisionCountByCriterion={revisionCountByCriterion}
                                expandedKey={expandedCriterionKey}
                                onToggleExpand={setExpandedCriterionKey}
                                onUpdateResponse={updateResponse}
                                onCreateRevisionRequest={handleCreateRevisionFromCriterion}
                                onUpdateRevisionRequest={handleUpdateRevisionFromCriterion}
                                onDeleteRevisionRequest={handleDeleteRevisionFromCriterion}
                                onNavigateToRevisions={() => switchRubricSection("revisions")}
                                disabled={completed}
                                showMissingHighlight={attemptedSubmit && !commentOnly}
                                isCriterionComplete={isCriterionComplete}
                                needsLowScoreComment={criterion =>
                                  criterionNeedsLowScoreComment(criterion, responses[criterion.key], mode)
                                }
                                isNarrowPanel={isNarrowPanel}
                                previousCriteriaMap={priorCriteriaMap}
                              />
                            ) : (
                              /* Optional Full Rubric View (Classic Accordion) */
                              <div className="space-y-2">
                                {visibleCriteria.map(criterion => {
                                  const originalIndex = workspace.criteria.findIndex(c => c.key === criterion.key);
                                  const state = responses[criterion.key] ?? { comment: "", evidence: "", notApplicable: false };
                                  const done = isCriterionComplete(criterion);
                                  const showMissingError = attemptedSubmit && criterion.required && !commentOnly && !done;
                                  const isOpen = Boolean(openKeys[criterion.key]);
                                  const selectedLevel = criterion.levels.find(l => l.id === state.performanceLevelId);
                                  const prevCriterion = workspace.criteria[originalIndex - 1];
                                  const nextCriterion = workspace.criteria[originalIndex + 1];
                                  const localized = localizeSystemCriterion(criterion, language, systemRubric, rubricContext);
                                  const levelDescCtx = {
                                    criterionKey: criterion.key,
                                    criterionTitle: criterion.title,
                                    ...rubricContext,
                                  };
                                  const hasEvidence = state.evidence.trim().length > 0;
                                  const isFullEvidenceOpen = hasEvidence || Boolean(fullEvidenceOpenKeys[criterion.key]);

                                  return (
                                    <section
                                      id={`criterion-${criterion.key}`}
                                      key={criterion.key}
                                      className="rw-card"
                                      data-active={activeKey === criterion.key ? "true" : undefined}
                                      data-error={showMissingError ? "true" : undefined}
                                    >
                                      <details
                                        open={isOpen}
                                        onToggle={event => {
                                          const nextOpen = event.currentTarget.open;
                                          setOpenKeys(current => {
                                            if (!nextOpen) return { ...current, [criterion.key]: false };
                                            return allExpanded ? { ...current, [criterion.key]: true } : { [criterion.key]: true };
                                          });
                                          if (nextOpen) setActiveKey(criterion.key);
                                        }}
                                      >
                                        <summary className="rw-card-summary">
                                          <div className="flex items-start gap-2.5 min-w-0">
                                            <span className="rw-step-badge" data-done={done ? "true" : undefined}>
                                              {done ? <Check size={13} aria-hidden="true" /> : originalIndex + 1}
                                            </span>
                                            <div className="min-w-0">
                                              <h2 className="text-sm font-semibold leading-snug text-foreground">
                                                {localized.title}
                                              </h2>
                                              <div className="rw-criterion-tags">
                                                {criterion.weight ? (
                                                  <span className="rw-weight-tag">
                                                    {t("reviewWorkspace.weight", { weight: criterion.weight })}
                                                  </span>
                                                ) : null}
                                                {showMissingError ? (
                                                  <span className="rw-inline-warn">
                                                    <AlertCircle size={11} aria-hidden="true" />
                                                    <span>{t("reviewWorkspace.criterionRequiredWarning")}</span>
                                                  </span>
                                                ) : null}
                                              </div>
                                            </div>
                                          </div>
                                          <span className="rw-score-badge" data-assessed={done ? "true" : undefined}>
                                            {state.notApplicable
                                              ? t("Not applicable")
                                              : selectedLevel
                                                ? `${selectedLevel.score} · ${shortLevelLabel(selectedLevel.label, language)}`
                                                : state.assessment
                                                  ? t(`reviewWorkspace.assessment.${state.assessment}`)
                                                  : state.comment.trim()
                                                    ? t("Draft response")
                                                    : t("Not assessed")}
                                          </span>
                                        </summary>

                                        <div className="rw-card-body">
                                          {localized.description ? (
                                            <p className="rw-criterion-desc">{localized.description}</p>
                                          ) : null}

                                          {mode === "STRUCTURED_REVIEW" ? (
                                            <div className="mb-4">
                                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {t("reviewWorkspace.assessment")}
                                              </p>
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                {assessmentOptions
                                                  .filter(option => option.value !== "NOT_APPLICABLE" || criterion.allowNotApplicable)
                                                  .map(option => (
                                                    <button
                                                      key={option.value}
                                                      type="button"
                                                      disabled={completed}
                                                      onClick={() =>
                                                        updateResponse(criterion.key, {
                                                          assessment: option.value,
                                                          notApplicable: option.value === "NOT_APPLICABLE",
                                                        })
                                                      }
                                                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${state.assessment === option.value
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "hover:bg-muted"
                                                        }`}
                                                    >
                                                      {t(option.key)}
                                                    </button>
                                                  ))}
                                              </div>
                                            </div>
                                          ) : null}

                                          {mode === "RUBRIC_ASSESSMENT" ? (
                                            <div className="mb-4">
                                              <div className="rw-score-strip" role="group" aria-label={localized.title}>
                                                {criterion.levels.map(level => {
                                                  const pressed = state.performanceLevelId === level.id && !state.notApplicable;
                                                  const levelDesc = localizeSystemLevelDescription(
                                                    level,
                                                    language,
                                                    systemRubric,
                                                    levelDescCtx,
                                                  );
                                                  return (
                                                    <button
                                                      key={level.id}
                                                      type="button"
                                                      disabled={completed}
                                                      aria-pressed={pressed}
                                                      title={levelDesc || shortLevelLabel(level.label, language)}
                                                      className="rw-score-btn"
                                                      onClick={() =>
                                                        updateResponse(criterion.key, {
                                                          performanceLevelId: level.id,
                                                          notApplicable: false,
                                                        })
                                                      }
                                                    >
                                                      <span className="rw-score-num">{level.score}</span>
                                                      <span className="rw-score-label">{shortLevelLabel(level.label, language)}</span>
                                                    </button>
                                                  );
                                                })}
                                              </div>

                                              {state.notApplicable ? (
                                                <div className="rw-descriptor-box" data-compact="true">
                                                  <strong>{t("reviewWorkspace.notApplicable")}</strong>
                                                </div>
                                              ) : selectedLevel ? (
                                                <div className="rw-descriptor-box">
                                                  <div className="rw-descriptor-heading">
                                                    <strong>
                                                      {selectedLevel.score} — {shortLevelLabel(selectedLevel.label, language)}
                                                    </strong>
                                                  </div>
                                                  {localizeSystemLevelDescription(
                                                    selectedLevel,
                                                    language,
                                                    systemRubric,
                                                    levelDescCtx,
                                                  ) ? (
                                                    <p className="rw-descriptor-body">
                                                      {localizeSystemLevelDescription(
                                                        selectedLevel,
                                                        language,
                                                        systemRubric,
                                                        levelDescCtx,
                                                      )}
                                                    </p>
                                                  ) : null}
                                                </div>
                                              ) : (
                                                <p className="rw-descriptor-empty mt-2">{t("reviewWorkspace.selectScoreHint")}</p>
                                              )}

                                              {criterion.allowNotApplicable ? (
                                                <div className="rw-scale-controls">
                                                  <button
                                                    type="button"
                                                    disabled={completed}
                                                    onClick={() =>
                                                      updateResponse(criterion.key, {
                                                        performanceLevelId: undefined,
                                                        notApplicable: !state.notApplicable,
                                                      })
                                                    }
                                                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${state.notApplicable
                                                      ? "border-primary bg-primary/10 text-primary"
                                                      : "text-muted-foreground hover:bg-muted"
                                                      }`}
                                                  >
                                                    {t("reviewWorkspace.notApplicable")}
                                                  </button>
                                                </div>
                                              ) : null}

                                            </div>
                                          ) : null}

                                          <label className="block text-xs font-medium text-foreground">
                                            {mode === "GUIDED_FEEDBACK"
                                              ? t("reviewWorkspace.responseLabel")
                                              : t("reviewWorkspace.commentLabel")}
                                            <textarea
                                              disabled={completed}
                                              rows={2}
                                              value={state.comment}
                                              onChange={event => updateResponse(criterion.key, { comment: event.target.value })}
                                              className="rw-comment-textarea mt-1.5"
                                              placeholder={
                                                mode === "GUIDED_FEEDBACK"
                                                  ? t("reviewWorkspace.responsePlaceholder")
                                                  : t("reviewWorkspace.commentPlaceholder")
                                              }
                                            />
                                          </label>

                                          <div className="mt-2">
                                            {isFullEvidenceOpen ? (
                                              <div className="space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                  <label
                                                    htmlFor={`rw-full-evidence-${criterion.key}`}
                                                    className="text-xs font-medium text-foreground"
                                                  >
                                                    {t("reviewWorkspace.evidenceLabel")}{" "}
                                                    <span className="font-normal text-muted-foreground">
                                                      {t("reviewWorkspace.optional")}
                                                    </span>
                                                  </label>
                                                  {!hasEvidence && !completed ? (
                                                    <button
                                                      type="button"
                                                      className="rw-text-action"
                                                      onClick={() =>
                                                        setFullEvidenceOpenKeys(current => ({
                                                          ...current,
                                                          [criterion.key]: false,
                                                        }))
                                                      }
                                                    >
                                                      {t("reviewWorkspace.hideEvidence")}
                                                    </button>
                                                  ) : null}
                                                </div>
                                                <Input
                                                  id={`rw-full-evidence-${criterion.key}`}
                                                  disabled={completed}
                                                  value={state.evidence}
                                                  onChange={event => updateResponse(criterion.key, { evidence: event.target.value })}
                                                  className="h-8 text-sm font-normal"
                                                  placeholder={t("reviewWorkspace.evidencePlaceholder")}
                                                />
                                              </div>
                                            ) : !completed ? (
                                              <button
                                                type="button"
                                                className="rw-subtle-add-btn"
                                                onClick={() =>
                                                  setFullEvidenceOpenKeys(current => ({
                                                    ...current,
                                                    [criterion.key]: true,
                                                  }))
                                                }
                                              >
                                                <Plus size={12} aria-hidden="true" />
                                                <span>{t("reviewWorkspace.addEvidenceCta")}</span>
                                              </button>
                                            ) : null}
                                          </div>

                                          <div className="rw-criterion-footer">
                                            {prevCriterion ? (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="gap-1.5 text-xs"
                                                onClick={() => focusCriterion(prevCriterion.key, !allExpanded)}
                                              >
                                                <ArrowLeft size={13} aria-hidden="true" />
                                                <span>{t("reviewWorkspace.prevCriterion")}</span>
                                              </Button>
                                            ) : (
                                              <span />
                                            )}
                                            {nextCriterion ? (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="gap-1.5 text-xs"
                                                onClick={() => focusCriterion(nextCriterion.key, !allExpanded)}
                                              >
                                                <span>
                                                  {t("reviewWorkspace.nextCriterion")} ({originalIndex + 2}/{totalCriteria})
                                                </span>
                                                <ArrowRight size={13} aria-hidden="true" />
                                              </Button>
                                            ) : (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="gap-1.5 text-xs"
                                                onClick={() => switchRubricSection("summary")}
                                              >
                                                <span>{t("reviewWorkspace.goToSummary")}</span>
                                                <ArrowRight size={13} aria-hidden="true" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </details>
                                    </section>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}

                        {/* SUB-TAB 2: INTEGRITY & RESEARCH ETHICS */}
                        {rubricSection === "integrity" && integrityRequired ? (
                          <div role="tabpanel" className="space-y-3">
                            <ReviewIntegrityChecklist
                              disabled={completed}
                              value={integrityChecks}
                              evidence={workspace.integrityEvidence}
                              isNarrowPanel={isNarrowPanel}
                              focusedCheckKey={focusedIntegrityKey}
                              showMissingHighlight={attemptedSubmit && !commentOnly}
                              commentOnly={commentOnly}
                              previousIntegrity={priorIntegrity}
                              onCreateRevisionFromConcern={handleCreateRevisionFromConcern}
                              onNavigateToRevisions={() => switchRubricSection("revisions")}
                              onChange={value => {
                                setIntegrityChecks(value);
                                markDirty();
                              }}
                            />
                          </div>
                        ) : null}

                        {/* SUB-TAB 3: REVISION REQUESTS */}
                        {rubricSection === "revisions" ? (
                          <div role="tabpanel" className="space-y-3">
                            <section className="rw-card p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-semibold text-foreground">
                                      {t("reviewWorkspace.revisions.currentTitle")}
                                    </h2>
                                    <Badge variant="secondary" className="h-5 text-[11px] tabular-nums">
                                      {nonEmptyIssues.length}
                                    </Badge>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {t("reviewWorkspace.revisions.currentHint")}
                                  </p>
                                </div>
                                {!completed ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    onClick={() => {
                                      setRequiredRevisions(current => [...current, { priority: "MAJOR", description: "" }]);
                                      markDirty();
                                    }}
                                  >
                                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{t("reviewWorkspace.revisions.addCta")}</span>
                                  </Button>
                                ) : null}
                              </div>

                              {commentOnly ? (
                                <div className="rw-decision-callout" data-tone="info">
                                  <span>{t("reviewWorkspace.revisions.commentOnlyNotice")}</span>
                                </div>
                              ) : null}

                              {requiredRevisions.length > 0 ? (
                                <div className="space-y-2.5">
                                  {requiredRevisions.map((item, index) => {
                                    const sev = severityBadgeMeta(item.priority, t);
                                    const linkedCriterion = item.criterionKey
                                      ? workspace.criteria.find(c => c.key === item.criterionKey)
                                      : undefined;
                                    return (
                                      <div key={index} className="rw-revision-card" data-tone={sev.tone}>
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="rw-severity-pill" data-tone={sev.tone}>
                                              <sev.Icon size={11} aria-hidden="true" />
                                              {sev.label}
                                            </span>
                                            {linkedCriterion ? (
                                              <span className="rw-weight-tag">
                                                {localizeSystemCriterion(linkedCriterion, language, systemRubric, rubricContext).title}
                                              </span>
                                            ) : null}
                                          </div>
                                          {!completed ? (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-destructive hover:text-destructive"
                                              aria-label={t("Remove revision item")}
                                              onClick={() => {
                                                setRequiredRevisions(current => current.filter((_, i) => i !== index));
                                                markDirty();
                                              }}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </Button>
                                          ) : null}
                                        </div>

                                        <div className="rw-revision-row-1">
                                          <select
                                            disabled={completed}
                                            aria-label={t("reviewWorkspace.matrix.priorityLabel")}
                                            value={item.priority}
                                            onChange={event => {
                                              setRequiredRevisions(current =>
                                                current.map((cur, i) =>
                                                  i === index
                                                    ? { ...cur, priority: event.target.value as FeedbackItemPriority }
                                                    : cur,
                                                ),
                                              );
                                              markDirty();
                                            }}
                                            className="h-9 rounded-md border bg-background px-2.5 text-xs font-medium"
                                          >
                                            <option value="MAJOR">{t("reviewWorkspace.feedbackFirst.severity.MAJOR")}</option>
                                            <option value="MINOR">{t("reviewWorkspace.feedbackFirst.severity.MINOR")}</option>
                                            <option value="SUGGESTION">{t("reviewWorkspace.feedbackFirst.severity.SUGGESTION")}</option>
                                          </select>
                                          <Input
                                            disabled={completed}
                                            aria-label={t("Required change")}
                                            value={item.description}
                                            onChange={event => {
                                              setRequiredRevisions(current =>
                                                current.map((cur, i) =>
                                                  i === index ? { ...cur, description: event.target.value } : cur,
                                                ),
                                              );
                                              markDirty();
                                            }}
                                            placeholder={t("reviewWorkspace.revisionPlaceholder")}
                                            className="h-9 text-sm"
                                          />
                                        </div>

                                        <div className="rw-revision-row-2">
                                          <select
                                            disabled={completed}
                                            aria-label={t("Related rubric criterion")}
                                            className="h-8 rounded-md border bg-background px-2 text-xs"
                                            value={item.criterionKey ?? ""}
                                            onChange={event => {
                                              setRequiredRevisions(current =>
                                                current.map((r, i) =>
                                                  i === index ? { ...r, criterionKey: event.target.value || undefined } : r,
                                                ),
                                              );
                                              markDirty();
                                            }}
                                          >
                                            <option value="">{t("reviewWorkspace.revisions.allCriteriaOption")}</option>
                                            {workspace.criteria.map(c => (
                                              <option key={c.key} value={c.key}>
                                                {localizeSystemCriterion(c, language, systemRubric, rubricContext).title}
                                              </option>
                                            ))}
                                          </select>
                                          <Input
                                            disabled={completed}
                                            aria-label={t("Page or section reference")}
                                            value={item.locator ?? ""}
                                            maxLength={500}
                                            placeholder={t("reviewWorkspace.feedbackFirst.locatorPlaceholder")}
                                            className="h-8 text-xs"
                                            onChange={event => {
                                              setRequiredRevisions(current =>
                                                current.map((r, i) => (i === index ? { ...r, locator: event.target.value } : r)),
                                              );
                                              markDirty();
                                            }}
                                          />
                                          <Input
                                            disabled={completed}
                                            aria-label={t("Exact quoted excerpt (optional)")}
                                            value={item.quotation ?? ""}
                                            maxLength={5000}
                                            placeholder={t("reviewWorkspace.matrix.quotationPlaceholder")}
                                            className="h-8 text-xs"
                                            onChange={event => {
                                              setRequiredRevisions(current =>
                                                current.map((r, i) =>
                                                  i === index ? { ...r, quotation: event.target.value || undefined } : r,
                                                ),
                                              );
                                              markDirty();
                                            }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed p-5 text-center space-y-2.5">
                                  <p className="text-xs text-muted-foreground">
                                    {t("reviewWorkspace.revisions.empty")}
                                  </p>
                                  {!completed ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-1.5 text-xs"
                                      onClick={() => {
                                        setRequiredRevisions(current => [...current, { priority: "MAJOR", description: "" }]);
                                        markDirty();
                                      }}
                                    >
                                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>{t("reviewWorkspace.revisions.addCta")}</span>
                                    </Button>
                                  ) : null}
                                </div>
                              )}
                            </section>

                            {/* Clearly separated previous round items needing verification */}
                            {workspace.previousRevisionItems.length > 0 ? (
                              <section className="rw-card p-4 space-y-2.5">
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="text-sm font-semibold text-foreground">
                                        {t("reviewWorkspace.revisions.previousTitle")}
                                      </h3>
                                      <Badge variant="outline" className="h-5 text-[11px] tabular-nums">
                                        {readiness.unresolvedPreviousCount}/{workspace.previousRevisionItems.length}
                                      </Badge>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {t("reviewWorkspace.revisions.previousHint")}
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => setRoundPanel("previous")}
                                  >
                                    <History size={12} aria-hidden="true" />
                                    {t("reviewWorkspace.revisions.openPreviousTab")}
                                  </Button>
                                </div>
                                <ul className="space-y-1.5 text-xs">
                                  {sortedPreviousItems.map(item => (
                                    <li
                                      key={item.id}
                                      className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-2"
                                    >
                                      <span className="truncate font-medium text-foreground">{item.description}</span>
                                      <span className="rw-item-status-pill shrink-0" data-status={item.status}>
                                        {t(`reviewWorkspace.previousRound.status.${item.status}`)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            ) : null}
                          </div>
                        ) : null}

                        {/* SUB-TAB 3: SUMMARY & DECISION */}
                        {rubricSection === "summary" ? (
                          <div role="tabpanel" className="space-y-3">
                            <section id="review-summary" className="rw-card scroll-mt-24 p-4 sm:p-5 space-y-4">
                              <h2 className="text-sm font-semibold text-foreground">
                                {t("reviewWorkspace.summaryTitle")}
                              </h2>

                              {/* Decision Section */}
                              <div id="review-decision-section" className="space-y-2.5">
                                {isMentorGuidance ? (
                                  <MentorReviewOutcome
                                    commentOnly={commentOnly}
                                    assessment={overallAssessment}
                                    disabled={completed}
                                    onChange={(only, assessment) => {
                                      setCommentOnly(only);
                                      setOverallAssessment(assessment);
                                      markDirty();
                                    }}
                                  />
                                ) : (
                                  <label className="block text-sm font-medium">
                                    {t("reviewWorkspace.overallAssessment")} <span className="text-destructive">*</span>
                                    <select
                                      disabled={completed}
                                      value={overallAssessment ?? ""}
                                      onChange={event => {
                                        setOverallAssessment(
                                          (event.target.value || undefined) as OverallAcademicAssessment | undefined,
                                        );
                                        markDirty();
                                      }}
                                      className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm"
                                    >
                                      <option value="">{t("reviewWorkspace.selectAssessment")}</option>
                                      <option value="STRONG">{t("Ready to advance internally")}</option>
                                      <option value="MINOR_REVISION">{t("Minor revision")}</option>
                                      <option value="MAJOR_REVISION">{t("Major revision")}</option>
                                      <option value="NOT_READY">{t("Not ready")}</option>
                                    </select>
                                  </label>
                                )}

                                {/* Context-aware decision status callout */}
                                {commentOnly ? (
                                  <div className="rw-decision-callout" data-tone="info">
                                    <span>
                                      {nonEmptyIssues.length > 0
                                        ? t("reviewWorkspace.summary.commentOnlyDraftNote", {
                                          count: nonEmptyIssues.length,
                                        })
                                        : t("reviewWorkspace.summary.commentOnlyNote")}
                                    </span>
                                  </div>
                                ) : isRevisionAssessment ? (
                                  <div
                                    className="rw-decision-callout"
                                    data-tone={
                                      mandatoryIssues.length === 0 && readiness.unresolvedPreviousCount === 0
                                        ? "warn"
                                        : undefined
                                    }
                                  >
                                    <span className="min-w-0 flex-1">
                                      {mandatoryIssues.length > 0 && suggestionIssues.length > 0
                                        ? t("reviewWorkspace.summary.revisionsBreakdown", {
                                          mandatory: mandatoryIssues.length,
                                          suggestions: suggestionIssues.length,
                                        })
                                        : mandatoryIssues.length > 0
                                          ? t("reviewWorkspace.summary.revisionsIncluded", {
                                            count: mandatoryIssues.length,
                                          })
                                          : t("reviewWorkspace.summary.revisionsMissing")}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 shrink-0 text-xs"
                                      onClick={() => switchRubricSection("revisions")}
                                    >
                                      {t("reviewWorkspace.summary.manageRevisions")}
                                    </Button>
                                  </div>
                                ) : overallAssessment === "STRONG" ? (
                                  <div
                                    className="rw-decision-callout"
                                    data-tone={readiness.issues.length > 0 ? "warn" : undefined}
                                  >
                                    <div className="space-y-1.5 min-w-0 flex-1">
                                      <p className="m-0">{t("reviewWorkspace.summary.approveNote")}</p>
                                      {suggestionIssues.length > 0 ? (
                                        <p className="m-0 text-muted-foreground">
                                          {t("reviewWorkspace.summary.suggestionsOnlyIncluded", {
                                            count: suggestionIssues.length,
                                          })}
                                        </p>
                                      ) : null}
                                      {integrityRequired && readiness.hasIntegrityConcern ? (
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                                          <p className="m-0 font-semibold">
                                            {t("reviewWorkspace.summary.integrityBlocksApprovalMsg")}
                                          </p>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 shrink-0 text-xs"
                                            onClick={() => jumpToIntegrityCheck(readiness.integrityConcernKeys[0])}
                                          >
                                            {t("reviewWorkspace.summary.viewIntegrityConcerns")}
                                          </Button>
                                        </div>
                                      ) : readiness.issues.length > 0 ? (
                                        <p className="m-0 font-semibold">
                                          {t("reviewWorkspace.summary.approveBlocked", {
                                            count: readiness.issues.length,
                                          })}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}

                                {/* Clear two-group overview: Academic assessment vs Research integrity & ethics (never combined) */}
                                {!commentOnly ? (
                                  <div className="rw-summary-dual-grid">
                                    <div className="rw-summary-group-card">
                                      <div className="flex items-center justify-between gap-2">
                                        <h3 className="text-xs font-semibold text-foreground">
                                          {t("reviewWorkspace.summary.academicGroup")}
                                        </h3>
                                        <button
                                          type="button"
                                          className="rw-text-action"
                                          onClick={() => switchRubricSection("criteria")}
                                        >
                                          {t("reviewWorkspace.subTab.criteria")}
                                        </button>
                                      </div>
                                      <dl className="mt-2 space-y-1 text-xs">
                                        {mode === "RUBRIC_ASSESSMENT" ? (
                                          <div className="flex items-center justify-between gap-2">
                                            <dt className="text-muted-foreground">
                                              {metrics.isProvisional
                                                ? t("reviewWorkspace.provisionalScore")
                                                : t("reviewWorkspace.weightedScore")}
                                            </dt>
                                            <dd className="font-semibold text-foreground tabular-nums">
                                              {metrics.score === null
                                                ? t("Not assessed")
                                                : `${formatScoreValue(metrics.score, language)}${uniformMaxScore != null ? ` / ${uniformMaxScore}` : ""}`}
                                            </dd>
                                          </div>
                                        ) : null}
                                        <div className="flex items-center justify-between gap-2">
                                          <dt className="text-muted-foreground">{t("reviewWorkspace.subTab.criteria")}</dt>
                                          <dd className="font-semibold text-foreground tabular-nums">
                                            {completedCount}/{totalCriteria}
                                          </dd>
                                        </div>
                                      </dl>
                                    </div>

                                    {integrityRequired ? (
                                      <div className="rw-summary-group-card">
                                        <div className="flex items-center justify-between gap-2">
                                          <h3 className="text-xs font-semibold text-foreground">
                                            {t("reviewWorkspace.summary.integrityGroup")}
                                          </h3>
                                          <button
                                            type="button"
                                            className="rw-text-action"
                                            onClick={() => jumpToIntegrityCheck()}
                                          >
                                            {t("reviewWorkspace.summary.openIntegrityTab")}
                                          </button>
                                        </div>
                                        <dl className="mt-2 space-y-1 text-xs">
                                          <div className="flex items-center justify-between gap-2">
                                            <dt className="text-muted-foreground">
                                              {t("reviewWorkspace.summary.integrityCheckedCount", {
                                                valid: readiness.integrityCompleteCount,
                                                total: readiness.integrityTotalCount,
                                              })}
                                            </dt>
                                            <dd className="font-medium text-foreground tabular-nums">
                                              {readiness.integrityCompleteCount === readiness.integrityTotalCount
                                                ? t("reviewWorkspace.integrity.completedLabel")
                                                : t("reviewWorkspace.integrity.pendingLabel")}
                                            </dd>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                                            <span>
                                              {t("reviewWorkspace.summary.integrityNoIssue", {
                                                count: readiness.integrityCheckedCount,
                                              })}
                                            </span>
                                            <span className={readiness.integrityConcernCount > 0 ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>
                                              {t("reviewWorkspace.summary.integrityConcernCount", {
                                                count: readiness.integrityConcernCount,
                                              })}
                                            </span>
                                            <span>
                                              {t("reviewWorkspace.summary.integrityNaCount", {
                                                count: readiness.integrityNotApplicableCount,
                                              })}
                                            </span>
                                          </div>
                                        </dl>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}

                                {/* Flagged Integrity Concerns list inside Summary (clickable back to exact item) */}
                                {!commentOnly && integrityRequired && readiness.integrityConcernKeys.length > 0 ? (
                                  <div className="rw-summary-rev-box">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-foreground">
                                        {t("reviewWorkspace.summary.integrityConcernListTitle")} (
                                        {readiness.integrityConcernKeys.length})
                                      </span>
                                      <button
                                        type="button"
                                        className="rw-text-action"
                                        onClick={() => jumpToIntegrityCheck(readiness.integrityConcernKeys[0])}
                                      >
                                        {t("reviewWorkspace.summary.viewIntegrityConcerns")}
                                      </button>
                                    </div>
                                    <ul className="space-y-1.5">
                                      {readiness.integrityConcernKeys.map(checkKey => {
                                        const checkMeta = scientificIntegrityChecks.find(c => c.key === checkKey);
                                        const title = checkMeta
                                          ? localizeIntegrityTitle(checkMeta.title, language)
                                          : checkKey;
                                        const note = integrityChecks[checkKey]?.note?.trim() ?? "";
                                        return (
                                          <li key={checkKey} className="rw-summary-rev-row">
                                            <div className="min-w-0 flex-1 space-y-0.5">
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="rw-integrity-status-pill" data-tone="concern">
                                                  {t("reviewWorkspace.integrity.concern")}
                                                </span>
                                                <span className="text-xs font-medium text-foreground">{title}</span>
                                              </div>
                                              <p className="text-xs text-muted-foreground leading-snug">
                                                {note || t("reviewWorkspace.integrity.noteMinHint", { current: 0 })}
                                              </p>
                                            </div>
                                            <button
                                              type="button"
                                              className="rw-text-action shrink-0"
                                              onClick={() => jumpToIntegrityCheck(checkKey)}
                                            >
                                              {t("reviewWorkspace.readiness.goToFix")}
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                ) : null}

                                {/* Compact summary list of created revisions & suggestions with direct jump back to criterion */}
                                {!commentOnly && nonEmptyIssues.length > 0 ? (
                                  <div className="rw-summary-rev-box">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-foreground">
                                        {t("reviewWorkspace.revisionSectionHeader", { count: nonEmptyIssues.length })}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">
                                        {t("reviewWorkspace.summary.revisionsBreakdown", {
                                          mandatory: mandatoryIssues.length,
                                          suggestions: suggestionIssues.length,
                                        })}
                                      </span>
                                    </div>
                                    <ul className="space-y-1.5">
                                      {nonEmptyIssues.map((item, idx) => {
                                        const sev = severityBadgeMeta(item.priority, t);
                                        const SevIcon = sev.Icon;
                                        const linkedCriterion = item.criterionKey
                                          ? workspace.criteria.find(c => c.key === item.criterionKey)
                                          : undefined;
                                        return (
                                          <li key={`${idx}-${item.description.slice(0, 24)}`} className="rw-summary-rev-row">
                                            <div className="min-w-0 flex-1 space-y-0.5">
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="rw-severity-pill" data-tone={sev.tone}>
                                                  <SevIcon size={11} aria-hidden="true" />
                                                  <span>{sev.label}</span>
                                                </span>
                                                {linkedCriterion ? (
                                                  <span className="text-[11px] font-medium text-muted-foreground">
                                                    {localizeSystemCriterion(linkedCriterion, language, systemRubric, rubricContext).title}
                                                  </span>
                                                ) : null}
                                              </div>
                                              <p className="text-xs text-foreground leading-snug">{item.description}</p>
                                            </div>
                                            {linkedCriterion ? (
                                              <button
                                                type="button"
                                                className="rw-text-action shrink-0"
                                                onClick={() => jumpToCriterion(linkedCriterion.key)}
                                              >
                                                {t("reviewWorkspace.summary.jumpToCriterion")}
                                              </button>
                                            ) : null}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>

                              {/* Overall comment + Strengths / Concerns */}
                              <label className="block text-sm font-medium">
                                {t("reviewWorkspace.overallComment")} <span className="text-destructive">*</span>
                                <textarea
                                  id="review-overall-comment"
                                  disabled={completed}
                                  value={overallComment}
                                  onChange={event => {
                                    setOverallComment(event.target.value);
                                    markDirty();
                                  }}
                                  placeholder={t("reviewWorkspace.overallCommentPlaceholder")}
                                  className={`mt-1.5 min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${attemptedSubmit && !overallComment.trim() ? "border-amber-500" : ""
                                    }`}
                                />
                              </label>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-medium">
                                  {t("reviewWorkspace.keyStrengths")}
                                  <textarea
                                    disabled={completed}
                                    value={keyStrengths}
                                    onChange={event => {
                                      setKeyStrengths(event.target.value);
                                      markDirty();
                                    }}
                                    placeholder={t("reviewWorkspace.keyStrengthsPlaceholder")}
                                    className="mt-1.5 min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </label>
                                <label className="text-sm font-medium">
                                  {t("reviewWorkspace.keyConcerns")}
                                  <textarea
                                    disabled={completed}
                                    value={keyConcerns}
                                    onChange={event => {
                                      setKeyConcerns(event.target.value);
                                      markDirty();
                                    }}
                                    placeholder={t("reviewWorkspace.keyConcernsPlaceholder")}
                                    className="mt-1.5 min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </label>
                              </div>
                            </section>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Fixed Sticky Action Footer (contextual: Compare Mode returns safely without accidental submit) */}
      {!completed ? (
        <footer className="rw-footer-shell">
          {workspaceView === "compare" ? (
            <div className="rw-footer-bar">
              <div className="rw-footer-progress">
                <span className="text-xs text-muted-foreground">
                  {t("reviewWorkspace.compare.footerNote")}
                </span>
              </div>
              <div className="rw-footer-actions">
                <Button type="button" size="sm" onClick={() => setWorkspaceView("review")}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>{t("reviewWorkspace.compare.backToReview")}</span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {!effectiveFeedbackMode && missingListOpen && readiness.issues.length > 0 ? (
                <div className="rw-footer-missing-tray" role="region" aria-label={t("reviewWorkspace.readiness.missingItemsTitle", { count: readiness.issues.length })}>
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/60">
                    <span className="text-xs font-semibold text-foreground">
                      {t("reviewWorkspace.readiness.missingItemsTitle", { count: readiness.issues.length })}
                    </span>
                    <button
                      type="button"
                      className="rw-text-action"
                      onClick={() => setMissingListOpen(false)}
                    >
                      {t("reviewWorkspace.footer.hideMissing")}
                    </button>
                  </div>
                  <ul className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                    {readiness.issues.map(issue => (
                      <li key={issue.id} className="rw-readiness-issue-row">
                        <span>{t(issue.labelKey, issue.labelValues)}</span>
                        <button
                          type="button"
                          className="rw-readiness-jump-btn"
                          onClick={() => jumpToReadinessIssue(issue)}
                        >
                          {t("reviewWorkspace.readiness.goToFix")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rw-footer-bar">
                <div className="rw-footer-progress">
                  {effectiveFeedbackMode ? (
                    <>
                      <span className="text-xs font-medium text-muted-foreground">
                        {nonEmptyIssues.length > 0
                          ? `${nonEmptyIssues.length} ${t("reviewWorkspace.feedbackFirst.issuesTitle").toLowerCase()}`
                          : t("reviewWorkspace.modeBadge.feedback")}
                      </span>
                      {feedbackValidationError ? (
                        readiness.addressedPreviousCount > 0 || readiness.unresolvedPreviousCount > 0 ? (
                          <button
                            type="button"
                            className="rw-missing-toggle-btn"
                            onClick={() => setRoundPanel("previous")}
                          >
                            <AlertCircle size={13} aria-hidden="true" />
                            <span>{feedbackValidationError}</span>
                          </button>
                        ) : (
                          <span className="rw-missing-note">· {feedbackValidationError}</span>
                        )
                      ) : (
                        <span className="rw-ready-note">· {t("reviewWorkspace.feedbackFirst.ready")}</span>
                      )}
                    </>
                  ) : (
                    <>
                      {readiness.isReadyToSubmit ? (
                        <span className="rw-ready-note inline-flex items-center gap-1.5">
                          <CheckCircle2 size={14} aria-hidden="true" />
                          {t("reviewWorkspace.readiness.readyToSubmit")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rw-missing-toggle-btn tabular-nums"
                          aria-expanded={missingListOpen}
                          onClick={() => setMissingListOpen(prev => !prev)}
                        >
                          <AlertCircle size={13} aria-hidden="true" />
                          <span>
                            {readiness.issues.length === 1
                              ? t(readiness.issues[0]!.labelKey, readiness.issues[0]!.labelValues)
                              : t("reviewWorkspace.readiness.missingItemsTitle", { count: readiness.issues.length })}
                          </span>
                          <span className="underline underline-offset-2 ml-1">
                            {missingListOpen
                              ? t("reviewWorkspace.footer.hideMissing")
                              : t("reviewWorkspace.footer.showMissing")}
                          </span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="rw-footer-actions">
                  <Button variant="outline" size="sm" onClick={saveNow} disabled={save.isPending}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    <span>{t("reviewWorkspace.saveDraft")}</span>
                  </Button>
                  {!effectiveFeedbackMode && roundPanel === "current" && rubricSection !== "summary" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => switchRubricSection("summary")}
                    >
                      <span>{t("reviewWorkspace.summary.viewSummary")}</span>
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={requestOpenSubmit} disabled={submit.isPending || save.isPending}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {effectiveFeedbackMode
                        ? t("reviewWorkspace.feedbackFirst.submitBtn")
                        : t("reviewWorkspace.submitReview")}
                    </span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </footer>
      ) : (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {t("reviewWorkspace.submittedBanner")}
        </div>
      )}

      {completed && isMentorGuidance && workspace.request ? (
        <NextMentorReview requestId={workspace.request.id} />
      ) : null}

      {/* Guidelines Dialog */}
      <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reviewWorkspace.guidelinesTitle")}</DialogTitle>
            <DialogDescription>{t("reviewWorkspace.guidelinesSubtitle")}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2.5 text-sm leading-6">
            {workspace.templateVersion?.guidelines.length ? (
              workspace.templateVersion.guidelines.map(item => (
                <li key={item} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{localizeSystemGuideline(item, language)}</span>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">{t("reviewWorkspace.noGuidelines")}</li>
            )}
          </ul>
          <DialogFooter>
            <Button onClick={() => setGuidelinesOpen(false)}>{t("reviewWorkspace.startReview")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Text Artifact Dialog */}
      <Dialog open={artifactOpen} onOpenChange={setArtifactOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("reviewWorkspace.submittedArtifact")}</DialogTitle>
            <DialogDescription>{t("reviewWorkspace.artifactSnapshot", { version: revisionNum })}</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap rounded-xl border bg-muted/20 p-5 text-sm leading-7">
            {workspace.artifactContent}
          </div>
        </DialogContent>
      </Dialog>

      {/* Submit Confirmation Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {effectiveFeedbackMode
                ? t("reviewWorkspace.feedbackFirst.submitDialogTitle")
                : t("reviewWorkspace.submitDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {effectiveFeedbackMode
                ? t("reviewWorkspace.feedbackFirst.submitDialogDesc")
                : t("reviewWorkspace.submitDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border bg-muted/25 p-4 text-sm">
            {effectiveFeedbackMode ? (
              <>
                <p>
                  {t("reviewWorkspace.submitSummaryAssessment")}:{" "}
                  <strong>
                    {mentorAction
                      ? t(`reviewWorkspace.feedbackFirst.action.${mentorAction}`)
                      : t("Not selected")}
                  </strong>
                </p>
                <p>
                  {t("reviewWorkspace.feedbackFirst.issuesTitle")}:{" "}
                  <strong>{nonEmptyIssues.length}</strong>
                </p>
              </>
            ) : (
              <>
                {!commentOnly ? (
                  <p className="font-medium tabular-nums">
                    {t("reviewWorkspace.progressCount", {
                      completed: completedCount,
                      total: totalCriteria,
                    })}
                    {mode === "RUBRIC_ASSESSMENT" && metrics.score !== null
                      ? ` · ${metrics.isProvisional ? t("reviewWorkspace.provisionalScore") : t("reviewWorkspace.weightedScore")}: ${formatScoreValue(metrics.score, language)}${uniformMaxScore != null ? ` / ${uniformMaxScore}` : ""}`
                      : ""}
                  </p>
                ) : null}
                <p>
                  {t("reviewWorkspace.submitSummaryAssessment")}:{" "}
                  <strong>
                    {commentOnly
                      ? t("mentorWorkspace.outcome.comment")
                      : overallAssessment
                        ? t(internalAssessmentLabel(overallAssessment))
                        : t("Not selected")}
                  </strong>
                </p>
                {!commentOnly && integrityRequired ? (
                  <p className="tabular-nums">
                    {t("reviewWorkspace.summary.integrityGroup")}:{" "}
                    <strong>
                      {readiness.integrityCompleteCount}/{readiness.integrityTotalCount}
                    </strong>
                    {readiness.integrityConcernCount > 0
                      ? ` · ${t("reviewWorkspace.summary.integrityConcernCount", { count: readiness.integrityConcernCount })}`
                      : ""}
                  </p>
                ) : null}
                {commentOnly ? (
                  nonEmptyIssues.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("reviewWorkspace.submitDialog.commentOnlyExcluded", {
                        count: nonEmptyIssues.length,
                      })}
                    </p>
                  ) : null
                ) : (
                  <p>
                    {t("reviewWorkspace.submitDialog.currentRevisions")}:{" "}
                    <strong>
                      {suggestionIssues.length > 0
                        ? t("reviewWorkspace.summary.revisionsBreakdown", {
                          mandatory: mandatoryIssues.length,
                          suggestions: suggestionIssues.length,
                        })
                        : mandatoryIssues.length}
                    </strong>
                  </p>
                )}
              </>
            )}
            {workspace.previousRevisionItems.length > 0 ? (
              <p>
                {t("Unresolved earlier items")}:{" "}
                <strong>{readiness.unresolvedPreviousCount}</strong>
              </p>
            ) : null}
            {!effectiveFeedbackMode && readiness.issues.length > 0 ? (
              <div className="rw-readiness-checklist" role="alert">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                  <span>
                    {t("reviewWorkspace.readiness.missingItemsTitle", { count: readiness.issues.length })}
                  </span>
                </p>
                <ul className="space-y-1">
                  {readiness.issues.map(issue => (
                    <li key={issue.id} className="rw-readiness-issue-row">
                      <span>{t(issue.labelKey, issue.labelValues)}</span>
                      <button
                        type="button"
                        className="rw-readiness-jump-btn"
                        onClick={() => jumpToReadinessIssue(issue)}
                      >
                        {t("reviewWorkspace.readiness.goToFix")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>
              {t("reviewWorkspace.continueEditing")}
            </Button>
            <Button onClick={submitNow} disabled={submit.isPending || save.isPending}>
              {submit.isPending
                ? t("reviewWorkspace.submitting")
                : effectiveFeedbackMode
                  ? t("reviewWorkspace.feedbackFirst.confirmSubmit")
                  : t("reviewWorkspace.confirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {workspace.templateSelection?.canChangeTemplate && workspace.request && !completed ? (
        <ReviewTemplateSelectorDialog
          open={templateSelectorOpen}
          onOpenChange={setTemplateSelectorOpen}
          requestId={workspace.request.id}
          artifactType={workspace.assignment.submissionId.submissionType}
          onChanged={() => {
            void query.refetch();
          }}
        />
      ) : null}
    </Container>
  );
}
