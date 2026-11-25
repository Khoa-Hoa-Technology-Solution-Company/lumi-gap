import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AssignedRevisionReader } from "@/features/reviews/components/assigned-revision-reader";
import { ContentComparison } from "@/features/submissions/components/content-comparison";
import { submissionsApi } from "@/features/submissions";
import { reviewsApi } from "@/features/reviews/api/reviews.api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requiresScientificIntegrity, type AcademicReviewInput, type OverallAcademicAssessment, type StructuredAssessment } from "@trend/shared-types";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  Download,
  FileText,
  History,
  Lock,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReviewWorkspace, useSaveReview, useSubmitReview } from "@/features/reviews";
import { ReviewIntegrityChecklist } from "@/features/reviews/components/review-integrity-checklist";
import { internalAssessmentLabel, rubricCoverage } from "@/features/reviews/scientific-review-model";
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
  priority: "MINOR" | "MAJOR";
  description: string;
  locator?: string;
  criterionKey?: string;
  quotation?: string;
};
type SplitLayout = "balanced" | "reader" | "rubric";

const assessmentOptions: Array<{ value: StructuredAssessment; key: string }> = [
  { value: "MAJOR_ISSUES", key: "reviewWorkspace.assessment.MAJOR_ISSUES" },
  { value: "NEEDS_IMPROVEMENT", key: "reviewWorkspace.assessment.NEEDS_IMPROVEMENT" },
  { value: "ADEQUATE", key: "reviewWorkspace.assessment.ADEQUATE" },
  { value: "STRONG", key: "reviewWorkspace.assessment.STRONG" },
  { value: "NOT_APPLICABLE", key: "reviewWorkspace.assessment.NOT_APPLICABLE" },
];

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
  const [integrityChecks, setIntegrityChecks] = useState<NonNullable<AcademicReviewInput["integrityChecks"]>>({});
  const [responses, setResponses] = useState<ResponseState>({});
  const [keyStrengths, setKeyStrengths] = useState("");
  const [keyConcerns, setKeyConcerns] = useState("");
  const [overallComment, setOverallComment] = useState("");
  const [overallAssessment, setOverallAssessment] = useState<OverallAcademicAssessment>();
  const [commentOnly, setCommentOnly] = useState(false);
  const [requiredRevisions, setRequiredRevisions] = useState<RevisionDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);

  // UX helpers: layout ratio, active/expanded criteria, full scale compare
  const evalScrollRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<SplitLayout>("balanced");
  const [activeKey, setActiveKey] = useState<string>("");
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const [showFullScale, setShowFullScale] = useState<Record<string, boolean>>({});
  useUnsavedWorkspace(dirty);

  useEffect(() => {
    if (!query.data || initialized.current === `${assignmentId}:${query.data.roundNumber}:${query.data.artifactRevision?.id}`) return;
    initialized.current = `${assignmentId}:${query.data.roundNumber}:${query.data.artifactRevision?.id}`;
    setIntegrityChecks(query.data.review?.integrityChecks ?? {});
    submitKey.current = crypto.randomUUID();
    setKeyStrengths(query.data.review?.keyStrengths ?? "");
    setKeyConcerns(query.data.review?.keyConcerns ?? "");
    setOverallComment(query.data.review?.overallComment ?? "");
    setOverallAssessment(query.data.review?.overallAssessment ?? undefined);
    setCommentOnly(
      query.data.request?.origin === "MENTOR_GUIDANCE"
      && (query.data.review?.recommendation === "COMMENT_ONLY"
        || (query.data.review?.status === "SUBMITTED" && !query.data.review.overallAssessment)),
    );
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

  const payload = useCallback(
    (): AcademicReviewInput => ({
      integrityChecks,
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
      requiredRevisions: commentOnly
        ? []
        : requiredRevisions
            .filter(item => item.description.trim())
            .map(item => ({
              ...item,
              description: item.description.trim(),
              locator: item.locator?.trim() || undefined,
              criterionKey: item.criterionKey || undefined,
              quotation: item.quotation?.trim() || undefined,
            })),
    }),
    [
      commentOnly,
      integrityChecks,
      keyConcerns,
      keyStrengths,
      overallAssessment,
      overallComment,
      query.data?.criteria,
      query.data?.artifactRevision?.id,
      query.data?.roundNumber,
      requiredRevisions,
      responses,
    ],
  );

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

  const markDirty = () => {
    editGeneration.current += 1;
    submitKey.current = crypto.randomUUID();
    setDirty(true);
    setSaveState("saving");
  };

  const isCriterionComplete = useCallback(
    (criterion: NonNullable<typeof query.data>["criteria"][number]) => {
      const response = responses[criterion.key];
      if (!response) return false;
      if (response.notApplicable) return criterion.allowNotApplicable;
      if (query.data?.templateVersion?.reviewMode === "RUBRIC_ASSESSMENT") return Boolean(response.performanceLevelId);
      if (query.data?.templateVersion?.reviewMode === "STRUCTURED_REVIEW") {
        return Boolean(response.assessment && response.comment.trim());
      }
      return Boolean(response.comment.trim());
    },
    [query.data?.templateVersion?.reviewMode, responses],
  );

  const completedCount = useMemo(
    () => (query.data?.criteria ?? []).filter(isCriterionComplete).length,
    [isCriterionComplete, query.data?.criteria],
  );

  const missingRequiredCount = useMemo(
    () =>
      commentOnly
        ? 0
        : (query.data?.criteria ?? []).filter(c => c.required && !isCriterionComplete(c)).length,
    [commentOnly, isCriterionComplete, query.data?.criteria],
  );

  if (query.isLoading) {
    return (
      <Container className={embedded ? "rw-shell" : "rw-shell rw-shell-standalone"}>
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </Container>
    );
  }
  if (!query.data || query.error) {
    return (
      <Container className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {t("reviewWorkspace.unavailable")}
        </div>
      </Container>
    );
  }

  const workspace = query.data;
  const mode = workspace.templateVersion?.reviewMode ?? "GUIDED_FEEDBACK";
  const coverage = rubricCoverage(workspace.criteria, responses);
  const fivePointScale = workspace.criteria.every(c => c.levels.length > 0 && Math.max(...c.levels.map(l => l.score)) === 5);
  const integrityRequired = requiresScientificIntegrity(workspace.templateVersion?.guidelines, workspace.request?.origin);
  const completed = workspace.review?.status === "SUBMITTED" && workspace.request?.status !== "RESUBMITTED";
  const revisionNum = workspace.artifactRevision?.revisionNumber ?? workspace.assignment.submissionId.currentRevisionNumber;
  const allExpanded = workspace.criteria.length > 0 && workspace.criteria.every(c => openKeys[c.key]);
  const progressPct = workspace.criteria.length > 0 ? Math.round((completedCount / workspace.criteria.length) * 100) : 0;

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
      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 6;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function focusCriterion(key: string, collapseOthers = true) {
    setActiveKey(key);
    setOpenKeys(current => (collapseOthers ? { [key]: true } : { ...current, [key]: true }));
    window.requestAnimationFrame(() => scrollInnerTo(`criterion-${key}`));
  }

  function scrollToSection(id: string) {
    scrollInnerTo(id);
  }

  function toggleExpandAll() {
    if (allExpanded) {
      const keep = activeKey || workspace.criteria[0]?.key || "";
      setOpenKeys(keep ? { [keep]: true } : {});
    } else {
      setOpenKeys(Object.fromEntries(workspace.criteria.map(c => [c.key, true])));
    }
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

  async function submitNow() {
    if (sending.current) return;
    sending.current = true;
    try {
      if (dirty) await save.mutateAsync(payload());
      await submit.mutateAsync({ ...payload(), clientKey: submitKey.current });
      toast.success(t("reviewWorkspace.toast.submitted"));
      setDirty(false);
      setSaveState("saved");
      if (workspace.request?.origin !== "MENTOR_GUIDANCE") navigate("/reviews");
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || t("reviewWorkspace.toast.submitError"));
    } finally {
      sending.current = false;
      setSubmitOpen(false);
    }
  }

  return (
    <Container className={embedded ? "rw-shell" : "rw-shell rw-shell-standalone"}>
      {!embedded ? (
        <div className="mb-3">
          <Link
            to={href("/reviews")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>{t("reviewWorkspace.backToCenter")}</span>
          </Link>
        </div>
      ) : null}

      <header className="rw-header">
        <div className="rw-header-main">
          <div className="rw-header-title-row">
            <h1>{workspace.assignment.submissionId.title}</h1>
            <Badge className="text-xs">{modeLabel(mode, t)}</Badge>
            <Badge variant="outline" className="text-xs">
              {t("reviewWorkspace.round", { round: workspace.roundNumber })}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {t("reviewWorkspace.revision", { version: revisionNum })}
            </Badge>
          </div>
          {workspace.delivery ? (
            <div className="rw-header-meta">
              <span>{workspace.delivery.authors.join(", ")}</span>
              <span>·</span>
              <span>
                {t("mentorWorkspace.sentAt")}{" "}
                {new Date(workspace.delivery.sentAt).toLocaleString(language)}
              </span>
            </div>
          ) : null}
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

          <div className="rw-layout-switch" role="group" aria-label={t("reviewWorkspace.layoutBalanced")}>
            <button
              type="button"
              data-active={layout === "reader"}
              title={t("reviewWorkspace.layoutReader")}
              onClick={() => setLayout("reader")}
            >
              60/40
            </button>
            <button
              type="button"
              data-active={layout === "balanced"}
              title={t("reviewWorkspace.layoutBalanced")}
              onClick={() => setLayout("balanced")}
            >
              <Columns2 size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-active={layout === "rubric"}
              title={t("reviewWorkspace.layoutRubric")}
              onClick={() => setLayout("rubric")}
            >
              40/60
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => setGuidelinesOpen(true)}>
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("reviewWorkspace.guidelines")}</span>
          </Button>
          {workspace.manuscriptSource ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/projects/${workspace.manuscriptSource.projectId}/manuscripts/${workspace.manuscriptSource.manuscriptId}?snapshot=${workspace.manuscriptSource.snapshotId}`}>
                {t("View manuscript source version")}
              </Link>
            </Button>
          ) : null}
          {workspace.artifactContent ? (
            <Button variant="outline" size="sm" onClick={() => setArtifactOpen(true)}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("reviewWorkspace.viewArtifact")}</span>
            </Button>
          ) : null}
          {workspace.artifactRevision?.contentType === "PDF" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                submissionsApi
                  .downloadRevision(
                    workspace.assignment.submissionId.id,
                    workspace.artifactRevision!.id,
                    workspace.artifactRevision!.revisionNumber,
                  )
                  .catch(() => toast.error(t("reviewWorkspace.pdfUnavailable")))
              }
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("reviewWorkspace.downloadPdf")}</span>
            </Button>
          ) : null}
          {workspace.request ? (
            <Button asChild variant="outline" size="sm">
              <Link to={href(`/review-requests/${encodeURIComponent(workspace.request.id)}`)}>
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("reviewWorkspace.reviewHistory")}</span>
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="rw-grid" data-layout={layout}>
        <aside className="rw-reader-pane">
          <div className="rw-reader-header">
            <div className="rw-reader-title">
              <Lock size={14} className="text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="truncate">{t("reviewWorkspace.assignedRevision", { version: revisionNum })}</span>
            </div>
            <div className="rw-reader-metrics">
              <span className="rw-metric-chip">
                {completedCount}/{workspace.criteria.length} ({coverage.coverage}%)
              </span>
              {mode === "RUBRIC_ASSESSMENT" ? (
                <span className="rw-metric-chip" data-accent={coverage.score !== null ? "true" : undefined}>
                  {t("reviewWorkspace.weightedScore")}:{" "}
                  {coverage.score === null
                    ? t("Not assessed")
                    : `${coverage.score.toFixed(2)}${fivePointScale ? " / 5" : ""}`}
                </span>
              ) : null}
            </div>
          </div>

          <AssignedRevisionReader
            compact
            submissionId={workspace.assignment.submissionId.id}
            revisionId={workspace.artifactRevision?.id}
            contentType={workspace.artifactRevision?.contentType}
            text={workspace.artifactContent}
          />

          <div className="rw-reader-footer">
            {t("reviewWorkspace.immutableHint")} · {t("reviewWorkspace.scoringFormula")}
          </div>
        </aside>

        <div className="rw-eval-pane">
          {workspace.criteria.length > 0 ? (
            <nav className="rw-jump-bar" aria-label={t("reviewWorkspace.jumpBarLabel")}>
              <div className="rw-jump-pills">
                {workspace.criteria.map((criterion, index) => {
                  const done = isCriterionComplete(criterion);
                  const missing = !commentOnly && criterion.required && !done;
                  return (
                    <button
                      key={criterion.key}
                      type="button"
                      className="rw-jump-pill"
                      title={criterion.title}
                      data-done={done ? "true" : undefined}
                      data-missing={missing ? "true" : undefined}
                      data-active={activeKey === criterion.key ? "true" : undefined}
                      onClick={() => focusCriterion(criterion.key, !allExpanded)}
                    >
                      {done ? <Check size={11} aria-hidden="true" /> : null}
                      <span>{index + 1}</span>
                    </button>
                  );
                })}
                {integrityRequired && !commentOnly ? (
                  <button
                    type="button"
                    className="rw-jump-pill"
                    onClick={() => scrollToSection("review-integrity")}
                  >
                    {t("reviewWorkspace.jumpIntegrity")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rw-jump-pill"
                  onClick={() => scrollToSection("review-summary")}
                >
                  {t("reviewWorkspace.jumpSummary")}
                </button>
              </div>
              <button type="button" className="rw-jump-toggle" onClick={toggleExpandAll}>
                {allExpanded ? t("reviewWorkspace.collapseOthers") : t("reviewWorkspace.expandAll")}
              </button>
            </nav>
          ) : null}

          <div ref={evalScrollRef} className="rw-eval-scroll">
            <ContentComparison
              id={workspace.assignment.submissionId.id}
              before={workspace.comparisonVersions?.filter(v => v.id !== workspace.artifactRevision?.id).at(-1)}
              after={workspace.comparisonVersions?.find(v => v.id === workspace.artifactRevision?.id)}
            />

            {workspace.previousRevisionItems?.length ? (
              <section className="rw-card p-4">
                <h2 className="text-sm font-semibold">{t("reviewWorkspace.verifyResponses")}</h2>
                <div className="mt-3 space-y-2.5">
                  {workspace.previousRevisionItems.map(item => (
                    <article key={item.id} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">
                        {item.description} · <span className="text-muted-foreground">{item.status}</span>
                      </p>
                      {item.responses.map(response => (
                        <p key={response.submissionRevisionId} className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {response.responseText} · {response.status}
                        </p>
                      ))}
                      {!completed && workspace.request && ["ADDRESSED", "ACCEPTED", "REOPENED"].includes(item.status) ? (
                        <div className="mt-3 flex gap-2">
                          {(["ACCEPTED", "REOPENED"] as const).map(status => (
                            <Button
                              key={status}
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await reviewsApi.verifyRevision(
                                    workspace.request!.id,
                                    item.id,
                                    status,
                                    workspace.artifactRevision?.id,
                                  );
                                  await query.refetch();
                                  await client.invalidateQueries({ queryKey: ["review-requests"] });
                                  await client.invalidateQueries({ queryKey: ["submissions"] });
                                } catch {
                                  toast.error(t("reviewWorkspace.verifyError"));
                                }
                              }}
                            >
                              {status === "ACCEPTED" ? t("reviewWorkspace.acceptChange") : t("reviewWorkspace.reopenIssue")}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <AssignedReviewAdvisory
              submissionId={workspace.assignment.submissionId.id}
              revisionId={workspace.artifactRevision?.id}
            />

            <div className="space-y-2.5">
            {workspace.criteria.map((criterion, index) => {
              const state = responses[criterion.key] ?? { comment: "", evidence: "", notApplicable: false };
              const done = isCriterionComplete(criterion);
              const isOpen = Boolean(openKeys[criterion.key]);
              const selectedLevel = criterion.levels.find(l => l.id === state.performanceLevelId);
              const nextCriterion = workspace.criteria[index + 1];

              return (
                <section
                  id={`criterion-${criterion.key}`}
                  key={criterion.key}
                  className="rw-card"
                  data-active={activeKey === criterion.key ? "true" : undefined}
                >
                  <details
                    open={isOpen}
                    onToggle={event => {
                      const nextOpen = event.currentTarget.open;
                      setOpenKeys(current => ({ ...current, [criterion.key]: nextOpen }));
                      if (nextOpen) setActiveKey(criterion.key);
                    }}
                  >
                    <summary className="rw-card-summary">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="rw-step-badge" data-done={done ? "true" : undefined}>
                          {done ? <Check size={13} aria-hidden="true" /> : index + 1}
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold leading-snug text-foreground">{criterion.title}</h2>
                          <div className="rw-criterion-tags">
                            {criterion.required && !commentOnly ? (
                              <span className="rw-req-tag">{t("reviewWorkspace.required")}</span>
                            ) : null}
                            {criterion.weight ? (
                              <span className="rw-weight-tag">
                                {t("reviewWorkspace.weight", { weight: criterion.weight })}
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
                      {criterion.description ? <p className="rw-criterion-desc">{criterion.description}</p> : null}

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
                                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    state.assessment === option.value
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
                          <div className="rw-score-strip" role="group" aria-label={criterion.title}>
                            {criterion.levels.map(level => {
                              const pressed = state.performanceLevelId === level.id && !state.notApplicable;
                              return (
                                <button
                                  key={level.id}
                                  type="button"
                                  disabled={completed}
                                  aria-pressed={pressed}
                                  title={level.description || shortLevelLabel(level.label, language)}
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

                          <div className="rw-descriptor-box">
                            {state.notApplicable ? (
                              <span>{t("reviewWorkspace.notApplicable")}</span>
                            ) : selectedLevel ? (
                              <>
                                <strong>
                                  {shortLevelLabel(selectedLevel.label, language)} ({selectedLevel.score})
                                </strong>
                                {selectedLevel.description ? (
                                  <span className="block mt-0.5">{selectedLevel.description}</span>
                                ) : null}
                              </>
                            ) : (
                              <span>{t("reviewWorkspace.selectScoreHint")}</span>
                            )}
                          </div>

                          <div className="rw-scale-controls">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setShowFullScale(c => ({ ...c, [criterion.key]: !c[criterion.key] }))
                              }
                            >
                              {showFullScale[criterion.key] ? (
                                <>
                                  <ChevronUp size={13} aria-hidden="true" />
                                  <span>{t("reviewWorkspace.hideAllLevels")}</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={13} aria-hidden="true" />
                                  <span>{t("reviewWorkspace.showAllLevels")}</span>
                                </>
                              )}
                            </button>

                            {criterion.allowNotApplicable ? (
                              <button
                                type="button"
                                disabled={completed}
                                onClick={() =>
                                  updateResponse(criterion.key, {
                                    performanceLevelId: undefined,
                                    notApplicable: !state.notApplicable,
                                  })
                                }
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  state.notApplicable
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {t("reviewWorkspace.notApplicable")}
                              </button>
                            ) : null}
                          </div>

                          {showFullScale[criterion.key] ? (
                            <div className="rw-full-scale-list">
                              {criterion.levels.map(level => (
                                <div
                                  key={level.id}
                                  className="rw-full-scale-row"
                                  data-selected={state.performanceLevelId === level.id ? "true" : undefined}
                                >
                                  <strong>
                                    {level.score} · {shortLevelLabel(level.label, language)}
                                  </strong>
                                  {level.description ? (
                                    <p className="mt-0.5 text-muted-foreground">{level.description}</p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <label className="block text-sm font-medium text-foreground">
                        {mode === "GUIDED_FEEDBACK"
                          ? t("reviewWorkspace.responseLabel")
                          : t("reviewWorkspace.commentLabel")}
                        <textarea
                          disabled={completed}
                          value={state.comment}
                          onChange={event => updateResponse(criterion.key, { comment: event.target.value })}
                          className="mt-1.5 min-h-[84px] w-full rounded-lg border bg-background px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder={
                            mode === "GUIDED_FEEDBACK"
                              ? t("reviewWorkspace.responsePlaceholder")
                              : t("reviewWorkspace.commentPlaceholder")
                          }
                        />
                      </label>

                      <label className="mt-3 block text-xs font-medium text-muted-foreground">
                        {t("reviewWorkspace.evidenceLabel")}{" "}
                        <span className="font-normal">{t("reviewWorkspace.optional")}</span>
                        <textarea
                          disabled={completed}
                          value={state.evidence}
                          onChange={event => updateResponse(criterion.key, { evidence: event.target.value })}
                          className="mt-1.5 min-h-[52px] w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder={t("reviewWorkspace.evidencePlaceholder")}
                        />
                      </label>

                      <div className="rw-criterion-footer">
                        {nextCriterion ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-xs"
                            onClick={() => focusCriterion(nextCriterion.key, !allExpanded)}
                          >
                            <span>
                              {t("reviewWorkspace.nextCriterion")} ({index + 2}/{workspace.criteria.length})
                            </span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-xs"
                            onClick={() => scrollToSection("review-summary")}
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

          {integrityRequired && !commentOnly ? (
            <ReviewIntegrityChecklist
              disabled={completed}
              value={integrityChecks}
              onChange={value => {
                setIntegrityChecks(value);
                markDirty();
              }}
            />
          ) : null}

          <section id="review-summary" className="rw-card scroll-mt-24 p-5">
            <h2 className="text-base font-semibold text-foreground">{t("reviewWorkspace.summaryTitle")}</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  className="mt-1.5 min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="mt-1.5 min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>

            <label className="mt-3 block text-sm font-medium">
              {t("reviewWorkspace.overallComment")} <span className="text-destructive">*</span>
              <textarea
                disabled={completed}
                value={overallComment}
                onChange={event => {
                  setOverallComment(event.target.value);
                  markDirty();
                }}
                placeholder={t("reviewWorkspace.overallCommentPlaceholder")}
                className="mt-1.5 min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            {workspace.request?.origin === "MENTOR_GUIDANCE" ? (
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
              <label className="mt-4 block text-sm font-medium">
                {t("reviewWorkspace.overallAssessment")}
                <select
                  disabled={completed}
                  value={overallAssessment ?? ""}
                  onChange={event => {
                    setOverallAssessment(event.target.value as OverallAcademicAssessment);
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

            {!commentOnly ? (
              <div className="mt-5 border-t pt-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-semibold">{t("reviewWorkspace.requiredRevisions")}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("reviewWorkspace.requiredRevisionsHint")}
                    </p>
                  </div>
                  {!completed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRequiredRevisions(current => [...current, { priority: "MAJOR", description: "" }]);
                        markDirty();
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t("reviewWorkspace.addRevisionItem")}</span>
                    </Button>
                  ) : null}
                </div>

                {requiredRevisions.length ? (
                  <div className="mt-3 space-y-2.5">
                    {requiredRevisions.map((item, index) => (
                      <div key={index} className="rw-revision-card">
                        <div className="rw-revision-row-1">
                          <select
                            disabled={completed}
                            value={item.priority}
                            onChange={event => {
                              setRequiredRevisions(current =>
                                current.map((cur, i) =>
                                  i === index ? { ...cur, priority: event.target.value as "MINOR" | "MAJOR" } : cur,
                                ),
                              );
                              markDirty();
                            }}
                            className="h-9 rounded-md border bg-background px-2.5 text-sm"
                          >
                            <option value="MAJOR">{t("reviewWorkspace.major")}</option>
                            <option value="MINOR">{t("reviewWorkspace.minor")}</option>
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
                            className="h-9"
                          />
                          {!completed ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:text-destructive"
                              aria-label={t("Remove revision item")}
                              onClick={() => {
                                setRequiredRevisions(current => current.filter((_, i) => i !== index));
                                markDirty();
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                        <div className="rw-revision-row-2">
                          <select
                            disabled={completed}
                            aria-label={t("Related rubric criterion")}
                            className="h-9 rounded-md border bg-background px-2 text-xs"
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
                            <option value="">{t("Related rubric criterion")}</option>
                            {workspace.criteria.map(c => (
                              <option key={c.key} value={c.key}>
                                {c.title}
                              </option>
                            ))}
                          </select>
                          <Input
                            disabled={completed}
                            aria-label={t("Page or section reference")}
                            value={item.locator ?? ""}
                            maxLength={500}
                            placeholder={t("Page or section reference")}
                            className="h-9 text-xs"
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
                            placeholder={t("Exact quoted excerpt (optional)")}
                            className="h-9 text-xs"
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
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed p-3.5 text-xs text-muted-foreground">
                    {t("reviewWorkspace.noRevisions")}
                  </p>
                )}
              </div>
            ) : null}
          </section>
          </div>
        </div>
      </div>

      {!completed ? (
        <div className="rw-footer-bar">
          <div className="rw-footer-progress">
            <div className="rw-footer-track" aria-hidden="true">
              <div
                className="rw-footer-fill"
                data-complete={missingRequiredCount === 0 && completedCount > 0 ? "true" : undefined}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm font-medium text-foreground">
              {t("reviewWorkspace.progressCount", {
                completed: completedCount,
                total: workspace.criteria.length,
              })}
            </span>
            {missingRequiredCount > 0 ? (
              <span className="rw-missing-note">
                · {t("reviewWorkspace.missingRequired", { count: missingRequiredCount })}
              </span>
            ) : (
              <span className="rw-ready-note">· {t("reviewWorkspace.readyToSubmit")}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveNow} disabled={save.isPending}>
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>{t("reviewWorkspace.saveDraft")}</span>
            </Button>
            <Button size="sm" onClick={() => setSubmitOpen(true)} disabled={submit.isPending || save.isPending}>
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>{t("reviewWorkspace.submitReview")}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {t("reviewWorkspace.submittedBanner")}
        </div>
      )}

      {completed && workspace.request?.origin === "MENTOR_GUIDANCE" ? (
        <NextMentorReview requestId={workspace.request.id} />
      ) : null}

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
                  <span>{item}</span>
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

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reviewWorkspace.submitDialogTitle")}</DialogTitle>
            <DialogDescription>{t("reviewWorkspace.submitDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border bg-muted/25 p-4 text-sm">
            <p className="font-medium">
              {t("reviewWorkspace.progressCount", {
                completed: completedCount,
                total: workspace.criteria.length,
              })}
              {mode === "RUBRIC_ASSESSMENT" && coverage.score !== null
                ? ` · ${t("reviewWorkspace.weightedScore")}: ${coverage.score.toFixed(2)}${fivePointScale ? " / 5" : ""}`
                : ""}
            </p>
            <p>
              {t("reviewWorkspace.submitSummaryAssessment")}:{" "}
              <strong>
                {commentOnly
                  ? t("mentorWorkspace.outcome.comment")
                  : t(internalAssessmentLabel(overallAssessment)) || t("Not selected")}
              </strong>
            </p>
            <p>
              {t("New revision items")}: {requiredRevisions.filter(item => item.description.trim()).length}
            </p>
            <p>
              {t("Unresolved earlier items")}:{" "}
              {workspace.previousRevisionItems.filter(item => item.status !== "ACCEPTED").length}
            </p>
            {missingRequiredCount > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                <span>{t("reviewWorkspace.submitMissingWarn", { count: missingRequiredCount })}</span>
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>
              {t("reviewWorkspace.continueEditing")}
            </Button>
            <Button onClick={submitNow} disabled={submit.isPending || save.isPending}>
              {submit.isPending ? t("reviewWorkspace.submitting") : t("reviewWorkspace.confirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
