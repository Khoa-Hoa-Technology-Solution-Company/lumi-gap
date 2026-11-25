import { useState } from "react";
import { Link } from "react-router-dom";
import { useSubmissionRevisions } from "@/features/submissions";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/page-loading";
import type { ReviewRequestDetail, ReviewWorkspace } from "../api/reviews.api";
import { useReviewRequestAction, useVerifyReviewRevision } from "../hooks/use-reviews";
import { useReviewPageNavigation } from "../hooks/use-review-page-navigation";
import { internalAssessmentLabel } from "../scientific-review-model";
import { ReadOnlyReviewManuscript } from "./assigned-revision-reader";
import { ReviewIntegrityChecklist } from "./review-integrity-checklist";
import { isLumiGapSystemRubric, localizeSystemCriterion } from "../system-rubric-i18n";
import { formatSubmissionTypeLabel } from "@/features/submissions/submission-review-status";

export function ReadOnlyAssignmentView({ workspace, assignmentId }: { workspace: ReviewWorkspace; assignmentId: string }) {
  const { param, href } = useReviewPageNavigation();
  const { t } = useI18n();
  const oldReview = workspace.previousReviews?.find(review => param("reviewId") ? review.id === param("reviewId") : review.revisionId === param("revisionId"));
  const target = oldReview ? oldReview.revisionId : workspace.artifactRevision?.id;
  const version = workspace.comparisonVersions?.find(version => version.id === target) ?? (target === workspace.artifactRevision?.id && workspace.artifactRevision ? { ...workspace.artifactRevision, contentSnapshot: workspace.artifactContent } : undefined);
  if (!version || param("revisionId") && param("revisionId") !== target || param("reviewId") && !oldReview && param("reviewId") !== workspace.review?.id) return <section role="alert" className="p-6">{t("mentorLifecycle.unavailable")}</section>;
  return <ReadOnlyReviewManuscript title={workspace.assignment.submissionId.title} submissionId={workspace.assignment.submissionId.id} revision={version}
    text={version.contentSnapshot ?? undefined} roundNumber={oldReview?.roundNumber ?? workspace.roundNumber} backHref={href(workspace.request?.id ? `/review-requests/${workspace.request.id}` : `/reviews/${assignmentId}`)} />;
}

/** Mentor presentation inside the existing request page; all commands use its existing APIs. */
export function MentorReviewFollowUp({ detail }: { detail: ReviewRequestDetail }) {
  const { t, language } = useI18n();
  const { param, href, navigate, returnTo } = useReviewPageNavigation();
  const versions = useSubmissionRevisions(detail.artifact.submissionId, detail.artifact.revisionId);
  const actions = useReviewRequestAction();
  const verification = useVerifyReviewRevision();
  const [actionError, setActionError] = useState(false);
  const submitted = detail.reviews.filter(review => review.status === "SUBMITTED").sort((a,b) => b.roundNumber - a.roundNumber);
  const latest = submitted[0];
  const selectedReview = submitted.find(review => review.id === param("reviewId"));
  const typeKey = `reviewTemplates.artifact.${detail.artifact.type}`;
  const artifactType = detail.artifact.type ? t(typeKey) : "";
  const artifactTypeLabel = artifactType === typeKey ? language === "vi" ? formatSubmissionTypeLabel(detail.artifact.type) : detail.artifact.type?.replaceAll("_", " ") : artifactType;
  const feedbackLabel = (review: ReviewRequestDetail["reviews"][number]) => t(internalAssessmentLabel(review.overallAssessment, review.status, review.recommendation));
  const scoreLabel = (review: ReviewRequestDetail["reviews"][number]) => review.templateVersion?.reviewMode === "RUBRIC_ASSESSMENT" && review.responses.some(response => response.score != null) && review.weightedScore != null
    ? ` · ${review.weightedScore.toLocaleString(language)}` : "";
  const currentRound = detail.reviews.find(review => review.revisionId === detail.artifact.revisionId)?.roundNumber ?? Math.max(0, ...detail.reviews.map(review => review.roundNumber)) + 1;
  const tracking = submitted.flatMap(review => review.requiredRevisions.map(item => ({ ...item, roundNumber: review.roundNumber })))
    .sort((a,b) => Number(a.status === "ACCEPTED") - Number(b.status === "ACCEPTED") || b.roundNumber - a.roundNumber);
  const requestedTab = param("detailTab");
  const tab = requestedTab === "feedback" || requestedTab === "revisions" && tracking.length ? requestedTab : "overview";
  const requestHref = (nextTab = "overview") => href(`/review-requests/${encodeURIComponent(detail.id)}?detailTab=${nextTab}`);
  const selectTab = (nextTab: string) => navigate(requestHref(nextTab), { replace: true });
  const canRead = ["accepted", "completed"].includes(detail.assignment.status) && ["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"].includes(detail.status);
  const canReview = detail.assignment.status === "accepted" && ["ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(detail.status);
  const canAccept = detail.status === "REQUESTED" && detail.assignment.status === "assigned";
  const manuscriptHref = (revisionId: string, reviewId?: string) => href(`/mentor-workspace?${new URLSearchParams({ view: "review-request", requestId: detail.id, reader: "1", revisionId, ...(reviewId ? { reviewId } : {}) })}`);
  const versionFor = (id: string) => versions.data?.find(version => version._id === id || "id" in version && version.id === id);

  if (param("reader") === "1") {
    const historical = param("reviewId") ? submitted.find(review => review.id === param("reviewId")) : undefined;
    const targetId = historical ? historical.revisionId : detail.artifact.revisionId;
    const invalid = !canRead || param("reviewId") && !historical || param("revisionId") && param("revisionId") !== targetId;
    const version = versionFor(targetId);
    if (!invalid && versions.isLoading) return <PageLoading />;
    if (invalid || versions.isError || !version) return <section className="p-6 space-y-4"><p role="alert">{t("mentorLifecycle.unavailable")}</p><Button asChild variant="outline"><Link to={requestHref(historical ? "feedback" : "overview")}>{t("mentorLifecycle.backRequest")}</Link></Button></section>;
    return <ReadOnlyReviewManuscript title={detail.artifact.title} submissionId={detail.artifact.submissionId}
      revision={{ id: targetId, revisionNumber: version.revisionNumber, contentType: version.contentType }} text={version.contentSnapshot}
      roundNumber={historical?.roundNumber ?? currentRound} backHref={requestHref(historical ? "feedback" : "overview")} />;
  }

  const approved = latest?.overallAssessment === "STRONG" || latest?.overallAssessment === "READY_TO_ADVANCE";
  const statusKey = detail.status === "REVISION_REQUESTED" ? "waiting" : detail.status === "RESUBMITTED" ? "resubmitted" : detail.status === "COMPLETED" ? approved ? "completed" : "feedbackCompleted" : undefined;
  const bodyKey = statusKey ? `${statusKey}Body` : canAccept ? "pendingBody" : canReview ? "activeBody" : "closedBody";
  const statusTitle = statusKey ? t(`mentorLifecycle.${statusKey}Title`) : t(`reviewWorkspace.requestStatus.${detail.status}`);
  const date = (value: string) => new Date(value).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" });
  async function invitation(accept: boolean) {
    setActionError(false);
    try {
      if (accept) { await actions.accept.mutateAsync(detail.id); navigate(`/reviews/${detail.assignment.id}`); }
      else { await actions.decline.mutateAsync({ id: detail.id }); navigate(returnTo ?? "/mentor-workspace?view=work"); }
    } catch { setActionError(true); }
  }

  const timeline = [
    { at: detail.createdAt, text: t("mentorLifecycle.requested") },
    ...(detail.respondedAt ? [{ at: detail.respondedAt, text: t("mentorLifecycle.accepted") }] : []),
    ...submitted.filter(review => review.submittedAt).map(review => ({ at: review.submittedAt!, text: t("mentorLifecycle.sentRound", { round: review.roundNumber, version: review.artifactRevision?.revisionNumber ?? versionFor(review.revisionId)?.revisionNumber ?? "—" }) })),
  ].sort((a,b) => a.at.localeCompare(b.at)).slice(-6);

  return <section className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6" data-no-i18n>
    <Button asChild size="sm" variant="ghost"><Link to={returnTo ?? "/mentor-workspace?view=work"}>{t("mentorLifecycle.backWork")}</Link></Button>
    <header className="space-y-3 border-b pb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2"><h1 className="break-words text-xl font-semibold">{detail.artifact.title}</h1><p className="text-sm text-muted-foreground">{[detail.artifact.projectTitle, artifactTypeLabel, t("mentorWorkspace.version", { version: detail.artifact.revisionNumber }), t("mentorWorkspace.round", { round: currentRound })].filter(Boolean).join(" · ")}</p></div>
        <div className="flex flex-wrap gap-2">
          {canReview && <Button asChild size="sm"><Link to={href(`/reviews/${detail.assignment.id}`)}>{t(detail.status === "IN_REVIEW" ? "mentorLifecycle.continue" : detail.status === "RESUBMITTED" ? "mentorLifecycle.reviewRevision" : "mentorLifecycle.start")}</Link></Button>}
          {canRead && <Button asChild size="sm" variant="outline"><Link to={manuscriptHref(detail.artifact.revisionId)}>{t("mentorLifecycle.viewVersion", { version: detail.artifact.revisionNumber })}</Link></Button>}
          {canAccept && <><Button size="sm" disabled={actions.accept.isPending || actions.decline.isPending} onClick={() => void invitation(true)}>{t("mentorLifecycle.accept")}</Button><Button size="sm" variant="outline" disabled={actions.accept.isPending || actions.decline.isPending} onClick={() => void invitation(false)}>{t("mentorLifecycle.decline")}</Button></>}
        </div>
      </div>
      <div role="status" className="space-y-1 rounded-lg bg-muted/50 p-4"><h2 className="font-medium">{statusTitle}</h2><p className="max-w-prose text-sm leading-6 text-muted-foreground">{t(`mentorLifecycle.${bodyKey}`, { version: detail.artifact.revisionNumber })}</p></div>
      {selectedReview && <p className="text-sm text-muted-foreground" role="status">{t("mentorLifecycle.savedRound", { round: selectedReview.roundNumber, version: selectedReview.artifactRevision?.revisionNumber ?? versionFor(selectedReview.revisionId)?.revisionNumber ?? "—" })}</p>}
      {actionError && <p role="alert" className="text-sm text-destructive">{t("mentorWorkspace.reviewResponseError")}</p>}
    </header>
    <nav className="flex flex-wrap gap-1 border-b" aria-label={t("mentorLifecycle.results")}>
      {["overview", "feedback", ...(tracking.length ? ["revisions"] : [])].map(value => <Button key={value} variant="ghost" aria-current={tab === value ? "page" : undefined} className={tab === value ? "rounded-none border-b-2 border-primary" : ""} onClick={() => selectTab(value)}>{t(`mentorLifecycle.${value}`)}</Button>)}
    </nav>
    {tab === "overview" && <div className="space-y-6">
      {latest ? <section className="space-y-3"><h3 className="font-medium">{t("mentorLifecycle.latestFeedback")} · {t("mentorWorkspace.round", { round: latest.roundNumber })}</h3><p className="text-sm">{feedbackLabel(latest)}{scoreLabel(latest)}</p><p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6">{latest.overallComment}</p><Button size="sm" variant="outline" onClick={() => selectTab("feedback")}>{t("mentorLifecycle.feedback")}</Button></section> : <p className="text-sm text-muted-foreground">{t("mentorLifecycle.noFeedback")}</p>}
      {tracking.length > 0 && <Button size="sm" variant="outline" onClick={() => selectTab("revisions")}>{t("mentorLifecycle.revisionCount", { count: tracking.filter(item => item.priority !== "SUGGESTION" && item.status !== "ACCEPTED").length })}</Button>}
      <section><h3 className="mb-4 text-sm font-medium">{t("mentorLifecycle.timeline")}</h3><ol className="space-y-4 border-l pl-4">{timeline.map((event,index) => <li key={index} className="text-sm"><span>{event.text}</span><time dateTime={event.at} className="block text-xs text-muted-foreground">{date(event.at)}</time></li>)}</ol></section>
    </div>}
    {tab === "feedback" && <section className="divide-y">
      {!submitted.length && <p className="py-5 text-sm text-muted-foreground">{t("mentorLifecycle.noFeedback")}</p>}
      {submitted.map(review => <article key={review.id}>
        <details className="py-4" open={selectedReview?.id === review.id || undefined}><summary className="flex cursor-pointer flex-wrap items-start justify-between gap-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><div><h3 className="font-medium">{t("mentorWorkspace.round", { round: review.roundNumber })} · {t("mentorWorkspace.version", { version: review.artifactRevision?.revisionNumber ?? versionFor(review.revisionId)?.revisionNumber ?? "—" })}</h3><p className="mt-1 text-sm text-muted-foreground">{feedbackLabel(review)}{scoreLabel(review)}</p></div>{review.submittedAt && <time className="text-xs text-muted-foreground" dateTime={review.submittedAt}>{date(review.submittedAt)}</time>}</summary>
          <div className="space-y-5 pt-4">
            {canRead && <Button size="sm" variant="outline" asChild><Link to={manuscriptHref(review.revisionId, review.id)}>{t("mentorLifecycle.viewVersion", { version: review.artifactRevision?.revisionNumber ?? versionFor(review.revisionId)?.revisionNumber ?? "—" })}</Link></Button>}
            {([['strengths',review.keyStrengths],['concerns',review.keyConcerns],['comments',review.overallComment]] as const).map(([key,value]) => value ? <div key={key}><h4 className="text-sm font-medium">{t(`mentorLifecycle.${key}`)}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{value}</p></div> : null)}
            <div className="divide-y">{review.responses.map(response => {
              const criterion = review.templateVersion?.criteria.find(item => item.key === response.criterionKey);
              const label = criterion && review.templateVersion ? localizeSystemCriterion(criterion, language, isLumiGapSystemRubric(review.templateVersion.guidelines)).title : response.criterionKey;
              return <section key={response.criterionKey} className="space-y-2 py-3"><h4 className="text-sm font-medium">{label}{response.score != null ? ` · ${response.score}` : ""}</h4>{response.comment && <p className="whitespace-pre-wrap text-sm leading-6">{response.comment}</p>}{response.evidence && <blockquote className="border-l pl-3 text-sm text-muted-foreground">{t("mentorLifecycle.evidence")}: {response.evidence}</blockquote>}</section>;
            })}</div>
            {review.integrityChecks && Object.keys(review.integrityChecks).length > 0 && <details><summary className="cursor-pointer py-2 text-sm font-medium">{t("mentorLifecycle.integrity")}</summary><ReviewIntegrityChecklist variant="readonly" disabled value={review.integrityChecks} onChange={() => {}} /></details>}
            {review.requiredRevisions.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm">{review.requiredRevisions.map(item => <li key={item.id}>{item.description}{item.locator ? ` · ${item.locator}` : ""}</li>)}</ul>}
          </div>
        </details>
      </article>)}
    </section>}
    {tab === "revisions" && <section className="divide-y">{tracking.map(item => {
      const response = item.responses?.filter(response => response.status !== "DRAFT").at(-1);
      const version = response ? versionFor(response.submissionRevisionId) : undefined;
      const sourceReview = response ? submitted.find(review => review.revisionId === response.submissionRevisionId) : undefined;
      const canVerify = canReview && ["RESUBMITTED", "IN_REVIEW"].includes(detail.status) && response?.submissionRevisionId === detail.artifact.revisionId;
      const state = item.status === "ACCEPTED" ? "verified" : item.status === "REOPENED" ? "reopened" : item.priority === "SUGGESTION" ? "optional" : response ? "awaitMentor" : "awaitTeam";
      return <article key={item.id} className="space-y-3 py-5"><h3 className="font-medium">{item.description}</h3><p className="text-xs text-muted-foreground">{t("mentorWorkspace.round", { round: item.roundNumber })} · {t(item.priority === "SUGGESTION" ? "mentorLifecycle.optional" : item.priority === "MAJOR" ? "Major revision" : "Minor revision")}{item.locator ? ` · ${item.locator}` : ""}</p><p className="text-sm font-medium">{t(`mentorLifecycle.${state}`)}</p>{item.quotation && <blockquote className="border-l pl-3 text-sm text-muted-foreground">{item.quotation}</blockquote>}{response && <div className="space-y-2 bg-muted/40 p-3"><p className="text-xs font-medium">{t("mentorLifecycle.teamResponse", { version: version?.revisionNumber ?? "—" })}</p><p className="whitespace-pre-wrap text-sm leading-6">{response.responseText}</p>{version && (response.submissionRevisionId === detail.artifact.revisionId || sourceReview) && <Link className="inline-block text-sm text-primary underline" to={manuscriptHref(response.submissionRevisionId, sourceReview?.id)}>{t("mentorLifecycle.viewVersion", { version: version.revisionNumber })}</Link>}</div>}{canVerify && <div className="flex flex-wrap gap-2">{(["ACCEPTED","REOPENED"] as const).map(status => <Button key={status} size="sm" variant="outline" disabled={verification.isPending} onClick={() => verification.mutate({ requestId: detail.id, itemId: item.id, status, expectedRevisionId: detail.artifact.revisionId })}>{t(status === "ACCEPTED" ? "mentorLifecycle.verify" : "mentorLifecycle.reopen")}</Button>)}</div>}</article>;
    })}{verification.isError && <p role="alert" className="py-4 text-sm text-destructive">{t("mentorWorkspace.loadError")}</p>}</section>}
  </section>;
}
