import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Eye,
  FileText,
  GitCompare,
  Lock,
  RefreshCw,
  Shapes,
  ShieldCheck,
  User,
} from "lucide-react";
import { useSubmissionRevisions } from "@/features/submissions";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/page-loading";
import { resolveManuscriptDestination } from "@/features/projects/utils/mentor-workspace-navigation";
import type { ReviewRequestDetail, ReviewWorkspace } from "../api/reviews.api";
import { useReviewRequestAction, useVerifyReviewRevision } from "../hooks/use-reviews";
import { useReviewPageNavigation } from "../hooks/use-review-page-navigation";
import { internalAssessmentLabel } from "../scientific-review-model";
import { ReadOnlyReviewManuscript } from "./assigned-revision-reader";
import { ReviewIntegrityChecklist } from "./review-integrity-checklist";
import {
  formatFriendlyTemplateName,
  ReviewTemplatePreviewDialog,
  ReviewTemplateSelectorDialog,
} from "./review-template-selector-dialog";
import { isLumiGapSystemRubric, localizeSystemCriterion } from "../system-rubric-i18n";
import { formatSubmissionTypeLabel } from "@/features/submissions/submission-review-status";
import {
  buildRoundScoreComparison,
  buildVerifiedTimeline,
  collectTrackedRevisionItems,
  computeRevisionProgress,
  criterionMaxScore,
  deriveCurrentRoundNumber,
  hasOfficialRubricScore,
  humanizeCriterionFallback,
  isRevisionItemVerifiable,
  rubricMaxScale,
  selectRevisionResponses,
  summarizeIntegrityChecks,
} from "../mentor-follow-up-helpers";

const STATUS_BADGE_CLASSES: Record<string, string> = {
  REQUESTED: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  ACCEPTED: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  IN_REVIEW: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  REVISION_REQUESTED: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  RESUBMITTED: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  DECLINED: "border-border bg-muted/60 text-muted-foreground",
  CANCELLED: "border-border bg-muted/60 text-muted-foreground",
  EXPIRED: "border-border bg-muted/60 text-muted-foreground",
};

const REV_STATE_BADGE_CLASSES: Record<string, string> = {
  verified: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  reopened: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  awaitMentor: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  awaitTeam: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  optional: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  MAJOR: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  MINOR: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  SUGGESTION: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

type RevisionFilterKey = "ALL" | "NEEDS_REVIEW" | "NEEDS_TEAM" | "VERIFIED";

function returnLabelKey(returnTo?: string): string {
  if (!returnTo) return "mentorLifecycle.backWork";
  const query = new URLSearchParams(returnTo.slice(returnTo.indexOf("?") + 1));
  const view = query.get("view");
  if (view === "resources") return "mentorLifecycle.backResources";
  if (view === "reviews") return "mentorLifecycle.backReviews";
  if (view === "overview") return "mentorLifecycle.backOverview";
  if (view === "project") return "mentorLifecycle.backProject";
  return "mentorLifecycle.backWork";
}

export function ReadOnlyAssignmentView({ workspace, assignmentId }: { workspace: ReviewWorkspace; assignmentId: string }) {
  const { param, href } = useReviewPageNavigation();
  const { t } = useI18n();
  const oldReview = workspace.previousReviews?.find(review =>
    param("reviewId") ? review.id === param("reviewId") : review.revisionId === param("revisionId"),
  );
  const target = oldReview ? oldReview.revisionId : workspace.artifactRevision?.id;
  const version =
    workspace.comparisonVersions?.find(version => version.id === target) ??
    (target === workspace.artifactRevision?.id && workspace.artifactRevision
      ? { ...workspace.artifactRevision, contentSnapshot: workspace.artifactContent }
      : undefined);
  if (!version || (param("revisionId") && param("revisionId") !== target) || (param("reviewId") && !oldReview && param("reviewId") !== workspace.review?.id)) {
    return (
      <section role="alert" className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive space-y-3">
          <p>{t("mentorLifecycle.unavailable")}</p>
          <Button asChild variant="outline" size="sm">
            <Link to={href(workspace.request?.id ? `/review-requests/${workspace.request.id}` : `/reviews/${assignmentId}`)}>
              {t("mentorLifecycle.backRequest")}
            </Link>
          </Button>
        </div>
      </section>
    );
  }
  return (
    <ReadOnlyReviewManuscript
      title={workspace.assignment.submissionId.title}
      submissionId={workspace.assignment.submissionId.id}
      revision={version}
      projectTitle={workspace.projectTitle}
      text={version.contentSnapshot ?? undefined}
      roundNumber={oldReview?.roundNumber ?? workspace.roundNumber}
      backHref={href(workspace.request?.id ? `/review-requests/${workspace.request.id}` : `/reviews/${assignmentId}`)}
    />
  );
}

/** Mentor presentation inside the existing request page; all commands use its existing APIs. */
export function MentorReviewFollowUp({
  detail,
  forceReader = false,
}: {
  detail: ReviewRequestDetail;
  forceReader?: boolean;
}) {
  const { t, language } = useI18n();
  const { param, href, navigate, returnTo } = useReviewPageNavigation();
  const canRead =
    ["accepted", "completed"].includes(detail.assignment.status) &&
    ["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"].includes(detail.status);
  const canReview =
    detail.assignment.status === "accepted" &&
    ["ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(detail.status);
  const canAccept = detail.status === "REQUESTED" && detail.assignment.status === "assigned";

  const versions = useSubmissionRevisions(detail.artifact.submissionId, canRead ? detail.artifact.revisionId : undefined);
  const actions = useReviewRequestAction();
  const verification = useVerifyReviewRevision();
  const [actionError, setActionError] = useState(false);

  // Scoped UI disclosure states
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({});
  const [showIntegrityDetails, setShowIntegrityDetails] = useState(false);
  const [revFilter, setRevFilter] = useState<RevisionFilterKey>("ALL");
  const [revRoundFilter, setRevRoundFilter] = useState<string>("ALL");
  const [pendingVerifyId, setPendingVerifyId] = useState<string | null>(null);
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({});
  const [verifySuccess, setVerifySuccess] = useState<Record<string, boolean>>({});
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);

  const submitted = useMemo(
    () =>
      detail.reviews
        .filter(review => review.status === "SUBMITTED")
        .sort((a, b) => b.roundNumber - a.roundNumber),
    [detail.reviews],
  );
  const latest = submitted[0];
  const requestedReviewId = param("reviewId");
  const selectedReview = requestedReviewId ? submitted.find(review => review.id === requestedReviewId) : undefined;
  const invalidReviewSelection = Boolean(requestedReviewId && !selectedReview);
  const activeFeedbackReview = invalidReviewSelection ? undefined : (selectedReview ?? latest);

  const typeKey = `reviewTemplates.artifact.${detail.artifact.type}`;
  const artifactType = detail.artifact.type ? t(typeKey) : "";
  const artifactTypeLabel =
    artifactType === typeKey
      ? language === "vi"
        ? formatSubmissionTypeLabel(detail.artifact.type)
        : detail.artifact.type?.replaceAll("_", " ")
      : artifactType;

  const feedbackLabel = (review: ReviewRequestDetail["reviews"][number]) =>
    t(internalAssessmentLabel(review.overallAssessment, review.status, review.recommendation));

  const formatScore = (value: number) =>
    value.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const currentRound = deriveCurrentRoundNumber(detail);

  const tracking = useMemo(
    () => collectTrackedRevisionItems(submitted, versions.data),
    [submitted, versions.data],
  );

  const progress = useMemo(
    () => computeRevisionProgress(tracking, detail.artifact.revisionId, versions.data),
    [tracking, detail.artifact.revisionId, versions.data],
  );

  const roundComparison = useMemo(
    () => buildRoundScoreComparison(submitted, detail.reviewer.id),
    [submitted, detail.reviewer.id],
  );

  const fullTimeline = useMemo(
    () => buildVerifiedTimeline(detail, submitted, versions.data),
    [detail, submitted, versions.data],
  );

  const revisionRoundNumbers = useMemo(
    () => [...new Set(tracking.map(i => i.roundNumber))].sort((a, b) => b - a),
    [tracking],
  );

  const revisionFilterCounts = useMemo(() => {
    const byRound = revRoundFilter === "ALL" ? tracking : tracking.filter(i => String(i.roundNumber) === revRoundFilter);
    let needsReview = 0;
    let needsTeam = 0;
    let verified = 0;
    for (const item of byRound) {
      const { currentResponse } = selectRevisionResponses(item, detail.artifact.revisionId, versions.data);
      if (item.status === "ACCEPTED") verified += 1;
      else if (item.status === "ADDRESSED" && currentResponse) needsReview += 1;
      else needsTeam += 1;
    }
    return { ALL: byRound.length, NEEDS_REVIEW: needsReview, NEEDS_TEAM: needsTeam, VERIFIED: verified };
  }, [tracking, revRoundFilter, detail.artifact.revisionId, versions.data]);

  const filteredTracking = useMemo(() => {
    const byRound = revRoundFilter === "ALL" ? tracking : tracking.filter(i => String(i.roundNumber) === revRoundFilter);
    if (revFilter === "ALL") return byRound;
    return byRound.filter(item => {
      const { currentResponse } = selectRevisionResponses(item, detail.artifact.revisionId, versions.data);
      if (revFilter === "VERIFIED") return item.status === "ACCEPTED";
      if (revFilter === "NEEDS_REVIEW") return item.status === "ADDRESSED" && Boolean(currentResponse);
      return item.status !== "ACCEPTED" && !(item.status === "ADDRESSED" && Boolean(currentResponse));
    });
  }, [tracking, revFilter, revRoundFilter, detail.artifact.revisionId, versions.data]);

  const requestedTab = param("detailTab");
  const tab = requestedTab === "feedback" || (requestedTab === "revisions" && tracking.length > 0) ? requestedTab : "overview";

  const requestHref = (nextTab = "overview", nextReviewId?: string) => {
    const query = new URLSearchParams({ detailTab: nextTab });
    if (nextReviewId) query.set("reviewId", nextReviewId);
    return href(`/review-requests/${encodeURIComponent(detail.id)}?${query}`);
  };
  const selectTab = (nextTab: string, nextReviewId?: string) =>
    navigate(requestHref(nextTab, nextReviewId), { replace: true });

  const manuscriptHref = (revisionId: string, reviewId?: string, originTab?: string) =>
    resolveManuscriptDestination({
      actorRole: "REVIEWER",
      requestId: detail.id,
      revisionId,
      reviewId,
      detailTab: originTab ?? tab,
      returnTo,
    }) ?? requestHref(originTab ?? tab, reviewId);

  const versionFor = (id: string) => versions.data?.find(version => version._id === id || version.id === id);
  const date = (value: string) => new Date(value).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" });
  const statusBadgeClass = STATUS_BADGE_CLASSES[detail.status] ?? STATUS_BADGE_CLASSES.CANCELLED;
  const statusShortLabel = t(`reviewCenter.status.${detail.status}`);

  async function invitation(accept: boolean) {
    setActionError(false);
    try {
      if (accept) {
        await actions.accept.mutateAsync(detail.id);
        navigate(href(`/reviews/${encodeURIComponent(detail.assignment.id)}`));
      } else {
        await actions.decline.mutateAsync({ id: detail.id });
        navigate(returnTo ?? "/mentor-workspace?view=work");
      }
    } catch {
      setActionError(true);
    }
  }

  async function handleVerifyItem(itemId: string, nextStatus: "ACCEPTED" | "REOPENED") {
    if (pendingVerifyId) return;
    setPendingVerifyId(itemId);
    setVerifyErrors(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setVerifySuccess(prev => ({ ...prev, [itemId]: false }));
    try {
      await verification.mutateAsync({
        requestId: detail.id,
        itemId,
        status: nextStatus,
        expectedRevisionId: detail.artifact.revisionId,
      });
      setVerifySuccess(prev => ({ ...prev, [itemId]: true }));
    } catch (err) {
      const serverMsg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setVerifyErrors(prev => ({ ...prev, [itemId]: serverMsg || t("mentorLifecycle.revVerifyError") }));
    } finally {
      setPendingVerifyId(null);
    }
  }

  const isReaderMode = forceReader || param("reader") === "1";

  if (isReaderMode) {
    const requestedRevisionId = param("revisionId");
    const historical = requestedReviewId ? submitted.find(review => review.id === requestedReviewId) : undefined;
    const readerOriginTab = param("detailTab") ?? (historical ? "feedback" : "overview");

    if (canAccept) {
      return (
        <section className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6" data-no-i18n>
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-xs">
            <Link to={requestHref("overview")}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("mentorLifecycle.backRequest")}
            </Link>
          </Button>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-6 space-y-4">
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold text-foreground">{detail.artifact.title}</h1>
              <p className="text-sm text-muted-foreground">{t("mentorLifecycle.pendingReadNotice")}</p>
            </div>
            {actionError ? <p role="alert" className="text-sm text-destructive">{t("mentorWorkspace.reviewResponseError")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={actions.accept.isPending || actions.decline.isPending} onClick={() => void invitation(true)}>
                {t("mentorLifecycle.accept")}
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={requestHref("overview")}>{t("mentorLifecycle.backRequest")}</Link>
              </Button>
            </div>
          </div>
        </section>
      );
    }

    const allowedRevisionIds = new Set<string>([
      detail.artifact.revisionId,
      ...submitted.map(review => review.revisionId),
    ]);
    const targetId = historical
      ? historical.revisionId
      : requestedRevisionId ?? detail.artifact.revisionId;

    const invalid =
      !canRead ||
      Boolean(requestedReviewId && !historical) ||
      Boolean(historical && requestedRevisionId && requestedRevisionId !== historical.revisionId) ||
      !allowedRevisionIds.has(targetId);

    if (!invalid && versions.isLoading) {
      return (
        <section className="mx-auto max-w-5xl space-y-4 p-6" role="status" data-no-i18n>
          <p className="text-sm text-muted-foreground">
            {t("mentorLifecycle.loadingVersion", { version: historical?.artifactRevision?.revisionNumber ?? detail.artifact.revisionNumber })}
          </p>
          <PageLoading />
        </section>
      );
    }

    if (!invalid && versions.isError) {
      return (
        <section className="mx-auto max-w-3xl space-y-4 p-6" data-no-i18n>
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
            <div className="flex items-start gap-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{t("mentorLifecycle.networkError")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void versions.refetch()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Try again")}
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to={requestHref(readerOriginTab, historical?.id)}>{t("mentorLifecycle.backRequest")}</Link>
              </Button>
            </div>
          </div>
        </section>
      );
    }

    const version = versionFor(targetId);
    if (invalid || !version) {
      return (
        <section className="mx-auto max-w-3xl space-y-4 p-6" data-no-i18n>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
            <p role="alert" className="text-sm font-medium text-destructive">
              {t("mentorLifecycle.unavailable")}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={requestHref(readerOriginTab, historical?.id)}>{t("mentorLifecycle.backRequest")}</Link>
            </Button>
          </div>
        </section>
      );
    }

    const authorizedVersions = (versions.data ?? [])
      .flatMap(v => {
        const revId = v._id || v.id;
        if (!revId || !allowedRevisionIds.has(revId)) return [];
        const round = submitted.find(r => r.revisionId === revId)?.roundNumber;
        return {
          id: revId,
          revisionNumber: v.revisionNumber,
          label: `${t("mentorWorkspace.version", { version: v.revisionNumber })}${
            revId === detail.artifact.revisionId
              ? ""
              : round
                ? ` · ${t("mentorWorkspace.round", { round })}`
                : ""
          }`,
        };
      })
      .sort((a, b) => b.revisionNumber - a.revisionNumber);

    const hasPreviousForCompare = canReview && authorizedVersions.length >= 2;
    const compareHref = hasPreviousForCompare
      ? href(`/reviews/${encodeURIComponent(detail.assignment.id)}?mode=compare`)
      : undefined;
    const prevVersionNum = authorizedVersions[1]?.revisionNumber ?? Math.max(1, detail.artifact.revisionNumber - 1);

    const primaryAction = canReview ? (
      <Button asChild size="sm" className="h-8 text-xs">
        <Link to={href(`/reviews/${encodeURIComponent(detail.assignment.id)}`)}>
          {t(
            detail.status === "IN_REVIEW"
              ? "mentorLifecycle.continue"
              : detail.status === "RESUBMITTED"
                ? "mentorLifecycle.reviewRevision"
                : "mentorLifecycle.start",
          )}
        </Link>
      </Button>
    ) : detail.status === "COMPLETED" && submitted.length > 0 ? (
      <Button asChild size="sm" variant="secondary" className="h-8 text-xs">
        <Link to={requestHref("feedback", historical?.id)}>{t("mentorLifecycle.results")}</Link>
      </Button>
    ) : undefined;

    const historicalBanner =
      historical && targetId !== detail.artifact.revisionId
        ? t("mentorLifecycle.historicalNotice", { version: version.revisionNumber, round: historical.roundNumber })
        : undefined;

    const contextPanel = (
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium text-muted-foreground">{t("mentorLifecycle.requester")}</dt>
          <dd className="mt-0.5 font-medium text-foreground">{detail.requester.fullName}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-muted-foreground">{t("mentorLifecycle.dueDate")}</dt>
          <dd className="mt-0.5 font-medium text-foreground tabular-nums">
            {detail.dueAt ? new Date(detail.dueAt).toLocaleDateString(language) : t("mentorLifecycle.noDeadline")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-muted-foreground">{t("mentorLifecycle.templateInfo")}</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {t("mentorLifecycle.templateValue", {
              version: detail.templateVersion.versionNumber,
              count: detail.templateVersion.criteria.length,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-muted-foreground">{t("mentorLifecycle.feedback")}</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            <Link to={requestHref("feedback", historical?.id)} className="text-primary hover:underline">
              {submitted.length} {t("mentorLifecycle.reviewHistory")}
            </Link>
          </dd>
        </div>
        {detail.message ? (
          <div className="sm:col-span-2 lg:col-span-4 border-t border-border/60 pt-2">
            <dt className="text-[11px] font-medium text-muted-foreground">{t("mentorLifecycle.senderMessage")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap leading-5 text-foreground/90">{detail.message}</dd>
          </div>
        ) : null}
      </dl>
    );

    const matchedRound =
      historical?.roundNumber ??
      submitted.find(r => r.revisionId === targetId)?.roundNumber ??
      (targetId === detail.artifact.revisionId ? currentRound : undefined);

    const fromResources = Boolean(
      !historical &&
      returnTo &&
      new URLSearchParams(returnTo.slice(returnTo.indexOf("?") + 1)).get("view") === "resources",
    );

    return (
      <ReadOnlyReviewManuscript
        title={detail.artifact.title}
        submissionId={detail.artifact.submissionId}
        revision={{ id: targetId, revisionNumber: version.revisionNumber, contentType: version.contentType }}
        artifactTypeLabel={artifactTypeLabel}
        projectTitle={detail.artifact.projectTitle}
        statusLabel={statusShortLabel}
        statusClassName={statusBadgeClass}
        text={version.contentSnapshot}
        roundNumber={matchedRound}
        backHref={fromResources ? returnTo! : requestHref(readerOriginTab, historical?.id)}
        backLabel={fromResources ? t("mentorLifecycle.backResources") : undefined}
        primaryAction={primaryAction}
        compareHref={compareHref}
        compareLabel={
          hasPreviousForCompare
            ? t("mentorLifecycle.compareVersions", { prev: prevVersionNum, curr: detail.artifact.revisionNumber })
            : undefined
        }
        availableVersions={!historical && authorizedVersions.length > 1 ? authorizedVersions : undefined}
        onSelectVersion={
          !historical
            ? nextRevId => {
                const matchedReview = submitted.find(r => r.revisionId === nextRevId);
                navigate(manuscriptHref(nextRevId, matchedReview?.id, readerOriginTab), { replace: true });
              }
            : undefined
        }
        historicalBanner={historicalBanner}
        contextPanel={contextPanel}
      />
    );
  }

  const approved = latest?.overallAssessment === "STRONG" || latest?.overallAssessment === "READY_TO_ADVANCE";
  const statusKey =
    detail.status === "REVISION_REQUESTED"
      ? "waiting"
      : detail.status === "RESUBMITTED"
        ? "resubmitted"
        : detail.status === "COMPLETED"
          ? approved
            ? "completed"
            : "feedbackCompleted"
          : undefined;
  const bodyKey = statusKey ? `${statusKey}Body` : canAccept ? "pendingBody" : canReview ? "activeBody" : "closedBody";
  const statusTitle = statusKey ? t(`mentorLifecycle.${statusKey}Title`) : t(`reviewCenter.status.${detail.status}`);

  const visibleTimeline = showFullTimeline ? fullTimeline : fullTimeline.slice(-6);

  const canCompare = canReview && (versions.data?.length ?? 0) >= 2;
  const prevVersion = versions.data?.find(v => (v._id || v.id) !== detail.artifact.revisionId)?.revisionNumber ?? Math.max(1, detail.artifact.revisionNumber - 1);

  // Deduplicate project title when identical to artifact title
  const distinctProjectTitle =
    detail.artifact.projectTitle &&
    detail.artifact.projectTitle.trim().toLowerCase() !== detail.artifact.title.trim().toLowerCase()
      ? detail.artifact.projectTitle
      : null;

  const renderTimelineText = (event: (typeof fullTimeline)[number]) => {
    if (event.kind === "requested") return t("mentorLifecycle.requested");
    if (event.kind === "accepted") return t("mentorLifecycle.accepted");
    if (event.kind === "resubmitted") return t("mentorLifecycle.timelineResubmitted", { version: event.versionNumber ?? detail.artifact.revisionNumber });
    if (event.kind === "completed") return t("mentorLifecycle.timelineCompleted");
    const base = t("mentorLifecycle.sentRound", { round: event.roundNumber ?? "—", version: event.versionNumber ?? "—" });
    const outcome = event.assessment || event.recommendation
      ? t(internalAssessmentLabel(event.assessment ?? undefined, event.status ?? "SUBMITTED", event.recommendation))
      : null;
    return outcome ? `${base} · ${outcome}` : base;
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6" data-no-i18n>
      {/* Top contextual back bar preserving returnTo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild size="sm" variant="ghost" className="-ml-2 h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
          <Link to={returnTo ?? "/mentor-workspace?view=work"}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t(returnLabelKey(returnTo))}</span>
          </Link>
        </Button>
      </div>

      {/* Unified Contextual Request Header Card */}
      <header className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
                {detail.artifact.title}
              </h1>
              <Badge variant="outline" className={`h-5 px-2 text-[11px] font-medium ${statusBadgeClass}`}>
                {statusShortLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                distinctProjectTitle,
                artifactTypeLabel,
                t("mentorWorkspace.version", { version: detail.artifact.revisionNumber }),
                t("mentorLifecycle.reviewRoundMeta", { round: currentRound }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {/* Clear CTA hierarchy: 1 Primary CTA + subtle Secondary actions */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canRead ? (
              <Button asChild size="sm" variant={canReview || canAccept ? "outline" : "default"} className="h-8 gap-1.5 text-xs">
                <Link to={manuscriptHref(detail.artifact.revisionId)}>
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("mentorLifecycle.viewVersion", { version: detail.artifact.revisionNumber })}</span>
                </Link>
              </Button>
            ) : null}
            {canCompare ? (
              <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground">
                <Link to={href(`/reviews/${encodeURIComponent(detail.assignment.id)}?mode=compare`)}>
                  <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("mentorLifecycle.compareVersions", { prev: prevVersion, curr: detail.artifact.revisionNumber })}</span>
                </Link>
              </Button>
            ) : null}
            {canReview ? (
              <Button asChild size="sm" className="h-8 text-xs">
                <Link to={href(`/reviews/${encodeURIComponent(detail.assignment.id)}`)}>
                  {t(
                    detail.status === "IN_REVIEW"
                      ? "mentorLifecycle.continue"
                      : detail.status === "RESUBMITTED"
                        ? "mentorLifecycle.reviewRevision"
                        : "mentorLifecycle.start",
                  )}
                </Link>
              </Button>
            ) : null}
            {canAccept ? (
              <>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={actions.accept.isPending || actions.decline.isPending}
                  onClick={() => void invitation(true)}
                >
                  {t("mentorLifecycle.accept")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={actions.accept.isPending || actions.decline.isPending}
                  onClick={() => void invitation(false)}
                >
                  {t("mentorLifecycle.decline")}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Structured Metadata Strip with clear template vs manuscript distinction */}
        <dl className="grid grid-cols-1 gap-3 border-t border-border/75 bg-muted/20 px-5 py-3 text-xs sm:grid-cols-3">
          <div className="min-w-0 space-y-0.5">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <User className="h-3 w-3 shrink-0" aria-hidden="true" />
              {t("mentorLifecycle.requester")}
            </dt>
            <dd className="truncate font-medium text-foreground">{detail.requester.fullName}</dd>
          </div>
          <div className="min-w-0 space-y-0.5">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
              {t("mentorLifecycle.dueDate")}
            </dt>
            <dd className="font-medium text-foreground tabular-nums">
              {detail.dueAt ? new Date(detail.dueAt).toLocaleDateString(language) : t("mentorLifecycle.noDeadline")}
            </dd>
          </div>
          <div className="min-w-0 space-y-1">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <ClipboardList className="h-3 w-3 shrink-0" aria-hidden="true" />
              {t("mentorLifecycle.templateInfo")}
            </dt>
            <dd className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                <span className="truncate">
                  {detail.templateVersion.templateName
                    ? formatFriendlyTemplateName(detail.templateVersion.templateName, detail.artifact.type, t)
                    : t("mentorLifecycle.templateValue", {
                        version: detail.templateVersion.versionNumber,
                        count: detail.templateVersion.criteria.length,
                      })}
                </span>
                {detail.templateSelection?.mandatoryProjectTemplate ? (
                  <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[10px] text-amber-800 dark:text-amber-300">
                    <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                    {t("reviewTemplates.selector.mandatoryBadge")}
                  </Badge>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("mentorLifecycle.templateValue", {
                  version: detail.templateVersion.versionNumber,
                  count: detail.templateVersion.criteria.length,
                })}
                {detail.templateVersion.reviewMode
                  ? ` · ${t(`reviewTemplates.mode.${detail.templateVersion.reviewMode}`)}`
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setTemplatePreviewOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  <span>{t("reviewTemplates.selector.previewAction")}</span>
                </button>
                {detail.templateSelection?.canChangeTemplate ? (
                  <button
                    type="button"
                    onClick={() => setTemplateSelectorOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Shapes className="h-3 w-3" aria-hidden="true" />
                    <span>{t("reviewTemplates.selector.changeAction")}</span>
                  </button>
                ) : null}
              </div>
            </dd>
          </div>
        </dl>

        {/* Next-step status guidance banner */}
        <div className="space-y-2 border-t border-border/75 px-5 py-3.5">
          <div role="status" className="flex items-start gap-2.5 rounded-lg bg-muted/45 px-3.5 py-3">
            {detail.status === "COMPLETED" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            <div className="min-w-0 space-y-0.5">
              <h2 className="text-sm font-semibold text-foreground">{statusTitle}</h2>
              <p className="max-w-prose text-xs leading-5 text-muted-foreground">
                {t(`mentorLifecycle.${bodyKey}`, { version: detail.artifact.revisionNumber })}
              </p>
            </div>
          </div>

          {detail.message ? (
            <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/90">
              <span className="font-semibold text-muted-foreground">{t("mentorLifecycle.senderMessage")}: </span>
              {detail.message}
            </p>
          ) : null}

          {selectedReview ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300" role="status">
              {t("mentorLifecycle.savedRound", {
                round: selectedReview.roundNumber,
                version: selectedReview.artifactRevision?.revisionNumber ?? versionFor(selectedReview.revisionId)?.revisionNumber ?? "—",
              })}
            </p>
          ) : null}

          {actionError ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t("mentorWorkspace.reviewResponseError")}
            </p>
          ) : null}
        </div>
      </header>

      {/* Three Primary Tabs */}
      <nav className="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label={t("mentorLifecycle.results")}>
        {["overview", "feedback", ...(tracking.length ? ["revisions"] : [])].map(value => {
          const badgeCount =
            value === "feedback"
              ? submitted.length
              : value === "revisions"
                ? tracking.length
                : null;
          return (
            <Button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              variant="ghost"
              size="sm"
              className={
                tab === value
                  ? "gap-1.5 rounded-none border-b-2 border-primary font-semibold text-primary"
                  : "gap-1.5 rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }
              onClick={() => selectTab(value, value === "feedback" ? requestedReviewId : undefined)}
            >
              <span>{t(`mentorLifecycle.${value}`)}</span>
              {badgeCount !== null && badgeCount > 0 ? (
                <span className="rounded-full bg-muted px-1.5 py-0.2 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {badgeCount}
                </span>
              ) : null}
            </Button>
          );
        })}
      </nav>

      {/* ═══ TAB 1: OVERVIEW ═══ */}
      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-4">
            {/* Actionable Revision Progress Summary when resubmitted or in review with prior requirements */}
            {canReview && progress.mandatoryTotal > 0 && ["RESUBMITTED", "IN_REVIEW"].includes(detail.status) ? (
              <section className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.04] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("mentorLifecycle.actionSummaryTitle")}
                  </h3>
                  <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-700 dark:text-indigo-300 tabular-nums">
                    {t("mentorLifecycle.revProgressReviewed", {
                      reviewed: progress.verifiedCount + progress.reopenedCount,
                      total: progress.mandatoryTotal,
                    })}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs leading-5 text-muted-foreground">
                  <p>
                    {t("mentorLifecycle.actionSummaryResponded", {
                      count: progress.respondedCurrentCount,
                      version: detail.artifact.revisionNumber,
                    })}
                  </p>
                  <p>
                    {t("mentorLifecycle.actionSummaryReviewed", {
                      reviewed: progress.verifiedCount + progress.reopenedCount,
                      total: progress.mandatoryTotal,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" className="h-8 text-xs">
                    <Link to={href(`/reviews/${encodeURIComponent(detail.assignment.id)}`)}>
                      {t(detail.status === "IN_REVIEW" ? "mentorLifecycle.continue" : "mentorLifecycle.reviewRevision")}
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => selectTab("revisions")}>
                    {t("mentorLifecycle.viewTeamResponses")}
                  </Button>
                </div>
              </section>
            ) : null}

            {/* Latest Submitted Feedback Summary */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              {latest ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("mentorLifecycle.latestFeedback")} · {t("mentorWorkspace.round", { round: latest.roundNumber })}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("mentorWorkspace.version", {
                          version: latest.artifactRevision?.revisionNumber ?? versionFor(latest.revisionId)?.revisionNumber ?? "—",
                        })}
                        {latest.submittedAt ? ` · ${date(latest.submittedAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-medium">
                        {feedbackLabel(latest)}
                      </Badge>
                      {hasOfficialRubricScore(latest) ? (
                        <Badge variant="outline" className="font-semibold tabular-nums text-xs">
                          {formatScore(latest.weightedScore!)} / {rubricMaxScale(latest.templateVersion)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {latest.overallComment ? (
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                      {latest.overallComment}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => selectTab("feedback", latest.id)}>
                      {t("mentorLifecycle.viewFullFeedback")}
                    </Button>
                    {tracking.length > 0 ? (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => selectTab("revisions")}>
                        {progress.mandatoryTotal - progress.verifiedCount > 0
                          ? t("mentorLifecycle.revisionCount", {
                              count: progress.mandatoryTotal - progress.verifiedCount,
                            })
                          : t("mentorLifecycle.openRevisionTracking")}
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("mentorLifecycle.noFeedback")}</p>
              )}
            </section>
          </div>

          {/* Verified Review Lifecycle Timeline */}
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("mentorLifecycle.timeline")}</h3>
            <ol className="space-y-3.5 border-l border-border pl-4">
              {visibleTimeline.map(event => (
                <li key={event.id} className="text-xs">
                  <span className="font-medium text-foreground">{renderTimelineText(event)}</span>
                  <time dateTime={event.at} className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                    {date(event.at)}
                  </time>
                </li>
              ))}
            </ol>
            {fullTimeline.length > 6 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-primary"
                onClick={() => setShowFullTimeline(v => !v)}
              >
                {showFullTimeline
                  ? t("mentorLifecycle.timelineCollapse")
                  : t("mentorLifecycle.timelineShowAll", { count: fullTimeline.length })}
              </Button>
            ) : null}
          </section>
        </div>
      )}

      {/* ═══ TAB 2: SUBMITTED FEEDBACK HISTORY ═══ */}
      {tab === "feedback" && (
        <div className="space-y-4">
          {!submitted.length ? (
            <section className="rounded-xl border border-border bg-card px-6 py-10 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">{t("mentorLifecycle.noFeedback")}</p>
              {canReview ? (
                <p className="text-xs text-muted-foreground">
                  {t("mentorLifecycle.currentRoundDraftNote", { round: currentRound })}
                </p>
              ) : null}
            </section>
          ) : invalidReviewSelection ? (
            <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
              <p className="text-sm font-medium text-destructive">{t("mentorLifecycle.invalidReviewId")}</p>
              {latest ? (
                <Button size="sm" variant="outline" onClick={() => selectTab("feedback", latest.id)}>
                  {t("mentorLifecycle.viewLatestRound")}
                </Button>
              ) : null}
            </section>
          ) : activeFeedbackReview ? (() => {
            const review = activeFeedbackReview;
            const revNumber = review.artifactRevision?.revisionNumber ?? versionFor(review.revisionId)?.revisionNumber ?? "—";
            const reviewScored = hasOfficialRubricScore(review);
            const scaleMax = rubricMaxScale(review.templateVersion);
            const reviewModeKey = review.templateVersion?.reviewMode
              ? `mentorLifecycle.reviewMode.${review.templateVersion.reviewMode}`
              : null;
            const integritySummary = summarizeIntegrityChecks(review.integrityChecks, language);
            const hasExpandableCriteria = review.responses.some(r => {
              const linked = review.requiredRevisions.some(item => item.criterionKey === r.criterionKey);
              return Boolean(r.comment?.trim() || r.evidence?.trim() || linked);
            });
            const allExpanded =
              hasExpandableCriteria &&
              review.responses
                .filter(r => Boolean(r.comment?.trim() || r.evidence?.trim() || review.requiredRevisions.some(item => item.criterionKey === r.criterionKey)))
                .every(r => expandedCriteria[`${review.id}:${r.criterionKey}`]);

            const toggleAllCriteria = () => {
              const next: Record<string, boolean> = { ...expandedCriteria };
              for (const r of review.responses) {
                next[`${review.id}:${r.criterionKey}`] = !allExpanded;
              }
              setExpandedCriteria(next);
            };

            return (
              <>
                {/* Round Selector Bar (only dropdown when > 1 submitted round) */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {submitted.length > 1 ? (
                      <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span>{t("mentorLifecycle.roundSelectorLabel")}</span>
                        <select
                          aria-label={t("mentorLifecycle.roundSelectorLabel")}
                          value={review.id}
                          onChange={e => selectTab("feedback", e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {submitted.map(r => {
                            const vNum = r.artifactRevision?.revisionNumber ?? versionFor(r.revisionId)?.revisionNumber ?? "—";
                            return (
                              <option key={r.id} value={r.id}>
                                {t("mentorLifecycle.roundOptionLabel", { round: r.roundNumber, version: vNum })}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ) : (
                      <h2 className="text-sm font-semibold text-foreground">
                        {t("mentorLifecycle.roundOptionLabel", { round: review.roundNumber, version: revNumber })}
                      </h2>
                    )}
                    {canReview && !submitted.some(r => r.revisionId === detail.artifact.revisionId) ? (
                      <span className="text-xs text-muted-foreground">
                        · {t("mentorLifecycle.currentRoundDraftNote", { round: currentRound })}
                      </span>
                    ) : null}
                  </div>

                  {canRead ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                      <Link to={manuscriptHref(review.revisionId, review.id, "feedback")}>
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("mentorLifecycle.viewVersion", { version: revNumber })}</span>
                      </Link>
                    </Button>
                  ) : null}
                </div>

                {/* Focused Result Summary Card */}
                <section className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/75 pb-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {reviewModeKey ? t(reviewModeKey) : t("mentorLifecycle.feedback")}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t("mentorLifecycle.conclusionLabel")}:</span>
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {feedbackLabel(review)}
                        </Badge>
                      </div>
                      {review.submittedAt ? (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t("mentorLifecycle.submittedAtLabel")}: <time dateTime={review.submittedAt}>{date(review.submittedAt)}</time>
                        </p>
                      ) : null}
                    </div>

                    {reviewScored ? (
                      <div className="rounded-lg border border-border/80 bg-muted/30 px-4 py-2.5 text-right">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {t("mentorLifecycle.weightedScoreLabel")}
                        </p>
                        <p className="mt-0.5 text-xl font-bold tracking-tight text-foreground tabular-nums">
                          {formatScore(review.weightedScore!)}
                          <span className="text-sm font-medium text-muted-foreground"> / {scaleMax}</span>
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* Narrative Feedback Blocks (only rendered when non-empty) */}
                  {(
                    [
                      ["comments", review.overallComment],
                      ["strengths", review.keyStrengths],
                      ["concerns", review.keyConcerns],
                    ] as const
                  ).map(([key, value]) =>
                    value ? (
                      <div key={key} className="space-y-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(`mentorLifecycle.${key}`)}
                        </h3>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{value}</p>
                      </div>
                    ) : null,
                  )}
                </section>

                {/* Compact Rubric Result Table (historical template snapshot) */}
                {review.responses.length > 0 ? (
                  <section className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/75 px-5 py-3.5">
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("mentorLifecycle.rubricTableTitle")}
                      </h3>
                      {hasExpandableCriteria ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={toggleAllCriteria}
                        >
                          {t(allExpanded ? "mentorLifecycle.rubricCollapseAll" : "mentorLifecycle.rubricExpandAll")}
                        </Button>
                      ) : null}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-border/75 bg-muted/30 text-xs font-medium text-muted-foreground">
                            <th scope="col" className="px-4 py-2.5">{t("mentorLifecycle.rubricColCriterion")}</th>
                            {review.templateVersion?.criteria.some(c => c.weight != null) ? (
                              <th scope="col" className="w-24 px-3 py-2.5 text-right">{t("mentorLifecycle.rubricColWeight")}</th>
                            ) : null}
                            <th scope="col" className="w-40 px-3 py-2.5 text-right">{t("mentorLifecycle.rubricColResult")}</th>
                            <th scope="col" className="w-24 px-4 py-2.5 text-right">{t("mentorLifecycle.rubricColDetail")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/70">
                          {review.responses.map(response => {
                            const criterion = review.templateVersion?.criteria.find(item => item.key === response.criterionKey);
                            const label =
                              (criterion && review.templateVersion
                                ? localizeSystemCriterion(
                                    criterion,
                                    language,
                                    isLumiGapSystemRubric(review.templateVersion.guidelines),
                                    {
                                      artifactType: detail.artifact.type,
                                      versionNumber: review.templateVersion.versionNumber,
                                      guidelines: review.templateVersion.guidelines,
                                    },
                                  ).title
                                : "") || humanizeCriterionFallback(response.criterionKey);
                            const maxScore = criterionMaxScore(criterion) ?? scaleMax;
                            const matchedLevel = criterion?.levels?.find(
                              l => (response.performanceLevelId && l.id === response.performanceLevelId) || (response.score != null && l.score === response.score),
                            );
                            const linkedRevisions = review.requiredRevisions.filter(item => item.criterionKey === response.criterionKey);
                            const hasDetail = Boolean(response.comment?.trim() || response.evidence?.trim() || linkedRevisions.length > 0);
                            const rowKey = `${review.id}:${response.criterionKey}`;
                            const isOpen = Boolean(expandedCriteria[rowKey]);
                            const showWeightCol = Boolean(review.templateVersion?.criteria.some(c => c.weight != null));

                            const resultDisplay = response.notApplicable
                              ? t("mentorLifecycle.rubricNotApplicable")
                              : response.score != null
                                ? `${response.score}/${maxScore}`
                                : response.assessment
                                  ? t(`reviewWorkspace.assessment.${response.assessment}`)
                                  : "—";

                            return (
                              <Fragment key={response.criterionKey}>
                                <tr className="hover:bg-muted/20">
                                  <td className="px-4 py-3 font-medium text-foreground">{label}</td>
                                  {showWeightCol ? (
                                    <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                                      {criterion?.weight != null ? `${criterion.weight}%` : "—"}
                                    </td>
                                  ) : null}
                                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">
                                    {resultDisplay}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {hasDetail ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        aria-expanded={isOpen}
                                        className="h-7 gap-1 px-2 text-xs text-primary"
                                        onClick={() => setExpandedCriteria(prev => ({ ...prev, [rowKey]: !prev[rowKey] }))}
                                      >
                                        <span>{t(isOpen ? "mentorLifecycle.rubricCollapse" : "mentorLifecycle.rubricExpand")}</span>
                                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                                      </Button>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                                {hasDetail && isOpen ? (
                                  <tr className="bg-muted/20">
                                    <td colSpan={showWeightCol ? 4 : 3} className="px-4 py-3.5">
                                      <div className="space-y-2 text-xs">
                                        {matchedLevel ? (
                                          <p className="text-muted-foreground">
                                            <span className="font-semibold text-foreground">{t("mentorLifecycle.rubricLevel")}:</span>{" "}
                                            {matchedLevel.label}
                                          </p>
                                        ) : null}
                                        {response.comment ? (
                                          <div>
                                            <p className="font-semibold text-foreground">{t("mentorLifecycle.rubricComment")}</p>
                                            <p className="mt-0.5 whitespace-pre-wrap leading-5 text-foreground/90">{response.comment}</p>
                                          </div>
                                        ) : null}
                                        {response.evidence ? (
                                          <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
                                            {t("mentorLifecycle.evidence")}: {response.evidence}
                                          </blockquote>
                                        ) : null}
                                        {linkedRevisions.length > 0 ? (
                                          <div className="space-y-1 pt-1">
                                            <p className="font-semibold text-foreground">{t("mentorLifecycle.rubricLinkedRevisions")}</p>
                                            <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                                              {linkedRevisions.map(lr => (
                                                <li key={lr.id}>{lr.description}{lr.locator ? ` · ${lr.locator}` : ""}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {/* Round-to-Round Score Comparison (only when >= 2 compatible official rubric rounds exist) */}
                {roundComparison ? (
                  <section className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="border-b border-border/75 px-5 py-3.5 space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">{t("mentorLifecycle.compareRoundsTitle")}</h3>
                      <p className="text-xs text-muted-foreground">{t("mentorLifecycle.compareRoundsNote")}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-border/75 bg-muted/30 font-medium text-muted-foreground">
                            <th scope="col" className="px-4 py-2.5">{t("mentorLifecycle.rubricColCriterion")}</th>
                            <th scope="col" className="w-28 px-3 py-2.5 text-right">{t("mentorWorkspace.round", { round: roundComparison.beforeRound.roundNumber })}</th>
                            <th scope="col" className="w-28 px-3 py-2.5 text-right">{t("mentorWorkspace.round", { round: roundComparison.afterRound.roundNumber })}</th>
                            <th scope="col" className="w-28 px-4 py-2.5 text-right">{t("mentorLifecycle.compareColDelta")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/70">
                          {roundComparison.rows.map(row => {
                            const criterion = roundComparison.afterRound.templateVersion?.criteria.find(c => c.key === row.criterionKey);
                            const label =
                              (criterion && roundComparison.afterRound.templateVersion
                                ? localizeSystemCriterion(
                                    criterion,
                                    language,
                                    isLumiGapSystemRubric(roundComparison.afterRound.templateVersion.guidelines),
                                    {
                                      artifactType: detail.artifact.type,
                                      versionNumber: roundComparison.afterRound.templateVersion.versionNumber,
                                      guidelines: roundComparison.afterRound.templateVersion.guidelines,
                                    },
                                  ).title
                                : "") || humanizeCriterionFallback(row.criterionKey);
                            const max = criterionMaxScore(criterion) ?? scaleMax;
                            return (
                              <tr key={row.criterionKey}>
                                <td className="px-4 py-2.5 font-medium text-foreground">{label}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                  {row.beforeNa ? "N/A" : row.beforeScore != null ? `${row.beforeScore}/${max}` : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                                  {row.afterNa ? "N/A" : row.afterScore != null ? `${row.afterScore}/${max}` : "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                                  {row.delta === undefined ? "—" : row.delta > 0 ? `+${row.delta}` : String(row.delta)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {/* Independent Integrity Summary Card */}
                {integritySummary ? (
                  <section className="rounded-xl border border-border bg-card p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                          <h3 className="text-sm font-semibold text-foreground">{t("mentorLifecycle.integritySummaryTitle")}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">{t("mentorLifecycle.integrityIndependentNote")}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-expanded={showIntegrityDetails}
                        className="h-8 text-xs"
                        onClick={() => setShowIntegrityDetails(v => !v)}
                      >
                        {t(showIntegrityDetails ? "mentorLifecycle.integrityHideDetails" : "mentorLifecycle.integrityShowDetails")}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary" className="font-medium tabular-nums">
                        {t("mentorLifecycle.integrityCheckedSummary", { total: integritySummary.total })}
                      </Badge>
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 tabular-nums">
                        {t("mentorLifecycle.integrityNoIssue", { count: integritySummary.checked })}
                      </Badge>
                      {integritySummary.concern > 0 ? (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300 tabular-nums">
                          {t("mentorLifecycle.integrityConcern", { count: integritySummary.concern })}
                        </Badge>
                      ) : null}
                      {integritySummary.notApplicable > 0 ? (
                        <Badge variant="outline" className="text-muted-foreground tabular-nums">
                          {t("mentorLifecycle.integrityNa", { count: integritySummary.notApplicable })}
                        </Badge>
                      ) : null}
                    </div>

                    {/* Never hide concerns: surface concern details directly in summary */}
                    {integritySummary.concerns.length > 0 ? (
                      <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3.5">
                        {integritySummary.concerns.map(c => (
                          <div key={c.key} className="flex items-start gap-2 text-xs">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                            <div className="min-w-0 space-y-0.5">
                              <p className="font-semibold text-foreground">{c.title}</p>
                              {c.note ? <p className="whitespace-pre-wrap text-muted-foreground">{c.note}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {showIntegrityDetails && review.integrityChecks ? (
                      <div className="border-t border-border/75 pt-3">
                        <ReviewIntegrityChecklist variant="readonly" disabled value={review.integrityChecks} onChange={() => {}} />
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {/* Immutable Historical Revision Items Raised in This Round */}
                {review.requiredRevisions.length > 0 ? (
                  <section className="rounded-xl border border-border bg-card p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("mentorLifecycle.roundRevisionsTitle", { round: review.roundNumber })}
                      </h3>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => selectTab("revisions")}>
                        {t("mentorLifecycle.openRevisionTracking")}
                      </Button>
                    </div>
                    <ul className="divide-y divide-border/70 rounded-lg border border-border/75">
                      {review.requiredRevisions.map((item, idx) => {
                        const statusKeyMap: Record<string, string> = {
                          ACCEPTED: "verified",
                          REOPENED: "reopened",
                          ADDRESSED: "awaitMentor",
                          OPEN: "awaitTeam",
                        };
                        const st = statusKeyMap[item.status] ?? "awaitTeam";
                        return (
                          <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-xs">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="font-medium text-foreground">
                                {idx + 1}. {item.description}
                              </p>
                              {item.locator ? <p className="text-muted-foreground">{item.locator}</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <span className="text-[11px] text-muted-foreground">{t("mentorLifecycle.currentResolutionStatus")}:</span>
                              <Badge variant="outline" className={`text-[11px] ${REV_STATE_BADGE_CLASSES[st] ?? ""}`}>
                                {t(`mentorLifecycle.${st}`)}
                              </Badge>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
              </>
            );
          })() : null}
        </div>
      )}

      {/* ═══ TAB 3: REVISION TRACKING ═══ */}
      {tab === "revisions" && (
        <div className="space-y-4">
          {/* Progress Summary + Compact Filters */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="font-semibold tabular-nums">
                  {t("mentorLifecycle.revProgressMandatory", { count: progress.mandatoryTotal })}
                </Badge>
                {progress.mandatoryTotal > 0 ? (
                  <Badge variant="outline" className="font-medium tabular-nums">
                    {t("mentorLifecycle.revProgressReviewed", {
                      reviewed: progress.verifiedCount + progress.reopenedCount,
                      total: progress.mandatoryTotal,
                    })}
                  </Badge>
                ) : null}
                {progress.suggestionTotal > 0 ? (
                  <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 tabular-nums">
                    {t("mentorLifecycle.revProgressSuggestions", { count: progress.suggestionTotal })}
                  </Badge>
                ) : null}
              </div>

              {revisionRoundNumbers.length > 1 ? (
                <select
                  aria-label={t("mentorLifecycle.roundSelectorLabel")}
                  value={revRoundFilter}
                  onChange={e => setRevRoundFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="ALL">{t("mentorLifecycle.revFilterRoundAll")}</option>
                  {revisionRoundNumbers.map(rn => (
                    <option key={rn} value={String(rn)}>
                      {t("mentorWorkspace.round", { round: rn })}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t("mentorLifecycle.revisions")}>
              {(
                [
                  ["ALL", "mentorLifecycle.revFilterAll", revisionFilterCounts.ALL],
                  ["NEEDS_REVIEW", "mentorLifecycle.revFilterNeedsReview", revisionFilterCounts.NEEDS_REVIEW],
                  ["NEEDS_TEAM", "mentorLifecycle.revFilterNeedsTeam", revisionFilterCounts.NEEDS_TEAM],
                  ["VERIFIED", "mentorLifecycle.revFilterVerified", revisionFilterCounts.VERIFIED],
                ] as const
              ).map(([key, labelKey, count]) => {
                const active = revFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRevFilter(key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{t(labelKey)}</span>
                    <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {!filteredTracking.length ? (
            <section className="rounded-xl border border-border bg-card px-6 py-10 text-center space-y-2" role="status">
              <p className="text-sm text-muted-foreground">{t("mentorLifecycle.revEmptyFilter")}</p>
              {revFilter !== "ALL" || revRoundFilter !== "ALL" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRevFilter("ALL");
                    setRevRoundFilter("ALL");
                  }}
                >
                  {t("mentorWorkspace.clearFilters")}
                </Button>
              ) : null}
            </section>
          ) : (
            <section className="space-y-3">
              {filteredTracking.map(item => {
                const { currentResponse, latestSubmittedResponse, historicalResponses } = selectRevisionResponses(
                  item,
                  detail.artifact.revisionId,
                  versions.data,
                );
                const displayResponse =
                  currentResponse ??
                  (["COMPLETED", "REVISION_REQUESTED"].includes(detail.status) ? latestSubmittedResponse : undefined);
                const displayVersion = displayResponse ? versionFor(displayResponse.submissionRevisionId) : undefined;
                const displaySourceReview = displayResponse
                  ? submitted.find(review => review.revisionId === displayResponse.submissionRevisionId)
                  : undefined;

                const canVerify = isRevisionItemVerifiable({
                  canReview,
                  requestStatus: detail.status,
                  itemStatus: item.status,
                  hasCurrentResponse: Boolean(currentResponse),
                });

                const lifecycleState =
                  item.status === "ACCEPTED"
                    ? "verified"
                    : item.status === "REOPENED"
                      ? "reopened"
                      : currentResponse || (item.status === "ADDRESSED" && displayResponse)
                        ? "awaitMentor"
                        : "awaitTeam";

                const isBusy = pendingVerifyId === item.id;
                const itemError = verifyErrors[item.id];
                const itemSaved = verifySuccess[item.id];

                return (
                  <article key={item.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {t("mentorLifecycle.revItemIndex", { index: String(item.displayOrder).padStart(2, "0") })}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{t("mentorWorkspace.round", { round: item.roundNumber })}</span>
                          <span aria-hidden="true">·</span>
                          <Badge variant="outline" className={`h-5 px-2 text-[11px] font-medium ${PRIORITY_BADGE_CLASSES[item.priority] ?? ""}`}>
                            {t(
                              item.priority === "SUGGESTION"
                                ? "mentorLifecycle.optional"
                                : item.priority === "MAJOR"
                                  ? "Major revision"
                                  : "Minor revision",
                            )}
                          </Badge>
                          {item.locator ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.locator}</span>
                            </>
                          ) : null}
                        </div>
                        <h3 className="text-sm font-semibold leading-snug text-foreground">{item.description}</h3>
                      </div>

                      <Badge variant="outline" className={`shrink-0 text-[11px] font-medium ${REV_STATE_BADGE_CLASSES[lifecycleState] ?? ""}`}>
                        {t(`mentorLifecycle.${lifecycleState}`)}
                      </Badge>
                    </div>

                    {item.quotation ? (
                      <blockquote className="border-l-2 border-border pl-3 text-xs italic text-muted-foreground">
                        {item.quotation}
                      </blockquote>
                    ) : null}

                    {/* Current-revision author response */}
                    {displayResponse ? (
                      <div className="space-y-2 rounded-lg border border-border/75 bg-muted/30 p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground">
                            {t("mentorLifecycle.teamResponse", { version: displayVersion?.revisionNumber ?? "—" })}
                          </p>
                          {displayVersion && (displayResponse.submissionRevisionId === detail.artifact.revisionId || displaySourceReview) ? (
                            <Link
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              to={manuscriptHref(displayResponse.submissionRevisionId, displaySourceReview?.id, "revisions")}
                            >
                              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{t("mentorLifecycle.viewVersion", { version: displayVersion.revisionNumber })}</span>
                            </Link>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{displayResponse.responseText}</p>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3.5 py-2.5 text-xs text-muted-foreground">
                        {t("mentorLifecycle.revNoCurrentResponse", { version: detail.artifact.revisionNumber })}
                      </p>
                    )}

                    {/* Earlier historical responses (when any exist outside the current revision) */}
                    {historicalResponses.length > 0 && currentResponse ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                          {t("mentorLifecycle.revOlderResponses", { count: historicalResponses.length })}
                        </summary>
                        <div className="mt-2 space-y-2">
                          {historicalResponses.map((hr, idx) => {
                            const hVer = versionFor(hr.submissionRevisionId);
                            return (
                              <div key={`${hr.submissionRevisionId}-${idx}`} className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-1">
                                <p className="font-semibold text-muted-foreground">
                                  {t("mentorLifecycle.teamResponse", { version: hVer?.revisionNumber ?? "—" })}
                                </p>
                                <p className="whitespace-pre-wrap text-foreground/85">{hr.responseText}</p>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}

                    {/* Per-item verification controls reusing useVerifyReviewRevision() */}
                    {canVerify ? (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {(["ACCEPTED", "REOPENED"] as const).map(nextStatus => {
                            const isCurrent = item.status === nextStatus;
                            return (
                              <Button
                                key={nextStatus}
                                type="button"
                                size="sm"
                                variant={nextStatus === "ACCEPTED" ? (isCurrent ? "secondary" : "default") : "outline"}
                                className="h-8 text-xs"
                                disabled={isBusy || Boolean(pendingVerifyId) || isCurrent}
                                onClick={() => void handleVerifyItem(item.id, nextStatus)}
                              >
                                {t(nextStatus === "ACCEPTED" ? "mentorLifecycle.verify" : "mentorLifecycle.reopen")}
                              </Button>
                            );
                          })}
                          <Button asChild size="sm" variant="ghost" className="ml-auto h-8 text-xs text-muted-foreground hover:text-foreground">
                            <Link to={href(`/reviews/${encodeURIComponent(detail.assignment.id)}`)}>
                              {t("mentorLifecycle.revInWorkspace")}
                            </Link>
                          </Button>
                        </div>
                        {itemError ? (
                          <p role="alert" className="text-xs font-medium text-destructive">{itemError}</p>
                        ) : null}
                        {itemSaved && !itemError ? (
                          <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {t("mentorLifecycle.revVerifySuccess")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}
        </div>
      )}

      <ReviewTemplatePreviewDialog
        open={templatePreviewOpen}
        onOpenChange={setTemplatePreviewOpen}
        templateVersion={detail.templateVersion}
        artifactType={detail.artifact.type}
      />

      {detail.templateSelection?.canChangeTemplate ? (
        <ReviewTemplateSelectorDialog
          open={templateSelectorOpen}
          onOpenChange={setTemplateSelectorOpen}
          requestId={detail.id}
          artifactType={detail.artifact.type}
        />
      ) : null}
    </section>
  );
}
