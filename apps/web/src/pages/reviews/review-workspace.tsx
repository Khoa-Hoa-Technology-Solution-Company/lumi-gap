import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AssignedRevisionReader } from "@/features/reviews/components/assigned-revision-reader";
import { ContentComparison } from "@/features/submissions/components/content-comparison";
import { submissionsApi } from "@/features/submissions";
import { reviewsApi } from "@/features/reviews/api/reviews.api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requiresScientificIntegrity, type AcademicReviewInput, type OverallAcademicAssessment, type StructuredAssessment } from "@trend/shared-types";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, FileText, Plus, Save, Send, Trash2 } from "lucide-react";
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

type CriterionState = { comment: string; evidence: string; assessment?: StructuredAssessment; performanceLevelId?: string; notApplicable: boolean };
type ResponseState = Record<string, CriterionState>;
type RevisionDraft = { priority: "MINOR" | "MAJOR"; description: string; locator?: string; criterionKey?: string; quotation?: string };
const assessmentOptions: Array<{ value: StructuredAssessment; label: string }> = [
  { value: "MAJOR_ISSUES", label: "Major issues" }, { value: "NEEDS_IMPROVEMENT", label: "Needs improvement" },
  { value: "ADEQUATE", label: "Adequate" }, { value: "STRONG", label: "Strong" }, { value: "NOT_APPLICABLE", label: "N/A" },
];

export function ReviewWorkspacePage() {
  const { t } = useI18n();
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
  useUnsavedWorkspace(dirty);

  useEffect(() => {
    if (!query.data || initialized.current === `${assignmentId}:${query.data.roundNumber}:${query.data.artifactRevision?.id}`) return;
    initialized.current = `${assignmentId}:${query.data.roundNumber}:${query.data.artifactRevision?.id}`;
    setIntegrityChecks(query.data.review?.integrityChecks ?? {});
    submitKey.current = crypto.randomUUID();
    setKeyStrengths(query.data.review?.keyStrengths ?? ""); setKeyConcerns(query.data.review?.keyConcerns ?? "");
    setOverallComment(query.data.review?.overallComment ?? ""); setOverallAssessment(query.data.review?.overallAssessment);
    setCommentOnly(query.data.request?.origin === "MENTOR_GUIDANCE" && (query.data.review?.recommendation === "COMMENT_ONLY" || (query.data.review?.status === "SUBMITTED" && !query.data.review.overallAssessment)));
    setRequiredRevisions(query.data.requiredRevisions.map((item) => ({ priority: item.priority, description: item.description, locator: item.locator, criterionKey: item.criterionKey, quotation: item.quotation })));
    setResponses(Object.fromEntries(query.data.criteria.map((criterion) => {
      const stored = query.data!.responses.find((item) => item.criterionKey === criterion.key);
      return [criterion.key, { comment: stored?.comment ?? "", evidence: stored?.evidence ?? "", assessment: stored?.assessment as StructuredAssessment | undefined, performanceLevelId: stored?.performanceLevelId, notApplicable: stored?.notApplicable ?? false }];
    })));
    setDirty(false); setSaveState("saved");
  }, [assignmentId, query.data]);

  const payload = useCallback((): AcademicReviewInput => ({
    integrityChecks,
    expectedRevisionId: query.data?.artifactRevision?.id, expectedRoundNumber: query.data?.roundNumber,
    keyStrengths: keyStrengths.trim() || undefined, keyConcerns: keyConcerns.trim() || undefined,
    overallComment: overallComment.trim() || undefined, overallAssessment, commentOnly: commentOnly || undefined,
    responses: (query.data?.criteria ?? []).map((criterion) => ({
      criterionKey: criterion.key, comment: responses[criterion.key]?.comment.trim() || undefined,
      evidence: responses[criterion.key]?.evidence.trim() || undefined, assessment: responses[criterion.key]?.assessment,
      performanceLevelId: responses[criterion.key]?.performanceLevelId, notApplicable: responses[criterion.key]?.notApplicable,
    })),
    requiredRevisions: commentOnly ? [] : requiredRevisions.filter((item) => item.description.trim()).map((item) => ({ ...item, description: item.description.trim() })),
  }), [commentOnly, integrityChecks, keyConcerns, keyStrengths, overallAssessment, overallComment, query.data?.criteria, query.data?.artifactRevision?.id, query.data?.roundNumber, requiredRevisions, responses]);

  useEffect(() => {
    if (!dirty || !query.data || query.data.review?.status === "SUBMITTED") return;
    const generation = editGeneration.current;
    const timer = window.setTimeout(async () => {
      if (save.isPending || sending.current) return;
      setSaveState("saving");
      try { await save.mutateAsync(payload()); if (editGeneration.current === generation) { setDirty(false); setSaveState("saved"); } }
      catch { setSaveState("error"); }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, payload, query.data, save]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const markDirty = () => { editGeneration.current += 1; submitKey.current = crypto.randomUUID(); setDirty(true); setSaveState("saving"); };
  const completedCount = useMemo(() => (query.data?.criteria ?? []).filter((criterion) => {
    const response = responses[criterion.key];
    if (!response) return false;
    if (response.notApplicable) return criterion.allowNotApplicable;
    if (query.data?.templateVersion?.reviewMode === "RUBRIC_ASSESSMENT") return Boolean(response.performanceLevelId);
    if (query.data?.templateVersion?.reviewMode === "STRUCTURED_REVIEW") return Boolean(response.assessment && response.comment.trim());
    return Boolean(response.comment.trim());
  }).length, [query.data, responses]);

  if (query.isLoading) return <Container className="mx-auto max-w-6xl px-4 py-10"><div className="h-96 animate-pulse rounded-2xl bg-muted" /></Container>;
  if (!query.data || query.error) return <Container className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">This review assignment is unavailable or does not belong to you.</div></Container>;
  const workspace = query.data;
  const mode = workspace.templateVersion?.reviewMode ?? "GUIDED_FEEDBACK";
  const coverage = rubricCoverage(workspace.criteria, responses);
  const fivePointScale = workspace.criteria.every(c=>c.levels.length > 0 && Math.max(...c.levels.map(l=>l.score)) === 5);
  const integrityRequired = requiresScientificIntegrity(workspace.templateVersion?.guidelines, workspace.request?.origin);
  const completed = workspace.review?.status === "SUBMITTED" && workspace.request?.status !== "RESUBMITTED";

  function updateResponse(key: string, change: Partial<CriterionState>) { setResponses((current) => ({ ...current, [key]: { ...current[key], comment: current[key]?.comment ?? "", evidence: current[key]?.evidence ?? "", notApplicable: current[key]?.notApplicable ?? false, ...change } })); markDirty(); }
  async function saveNow() { const generation = editGeneration.current; setSaveState("saving"); try { await save.mutateAsync(payload()); if (editGeneration.current === generation) { setDirty(false); setSaveState("saved"); } toast.success("Review draft saved"); } catch { setSaveState("error"); toast.error("Could not save the review draft"); } }
  async function submitNow() { if (sending.current) return; sending.current = true; try { if (dirty) await save.mutateAsync(payload()); await submit.mutateAsync({ ...payload(), clientKey: submitKey.current }); toast.success("Review submitted"); setDirty(false); setSaveState("saved"); if (workspace.request?.origin !== "MENTOR_GUIDANCE") navigate("/reviews"); } catch (error) { const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message; toast.error(message || "Complete every required criterion before submitting"); } finally { sending.current = false; setSubmitOpen(false); } }

  return <Container className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
    <div className="flex items-center justify-between"><Link to={href("/reviews")} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Review Center</Link><span className={`text-xs ${saveState === "error" ? "text-red-600" : "text-muted-foreground"}`}>{saveState === "saving" ? "Saving draft…" : saveState === "error" ? "Autosave failed. Use Save draft." : "Draft saved"}</span></div>
    <header className="mt-5 border-b pb-6"><div className="flex flex-wrap items-center gap-2"><Badge>{mode.replaceAll("_", " ")}</Badge><Badge variant="outline">Round {workspace.roundNumber}</Badge><Badge variant="secondary">Revision {workspace.artifactRevision?.revisionNumber ?? workspace.assignment.submissionId.currentRevisionNumber}</Badge></div><h1 className="mt-4 text-2xl font-semibold tracking-tight">{workspace.assignment.submissionId.title}</h1><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setGuidelinesOpen(true)}><BookOpen className="h-4 w-4" />View Guidelines</Button>{workspace.manuscriptSource ? <Button asChild variant="outline" size="sm"><Link to={`/projects/${workspace.manuscriptSource.projectId}/manuscripts/${workspace.manuscriptSource.manuscriptId}?snapshot=${workspace.manuscriptSource.snapshotId}`}>{t("View manuscript source version")}</Link></Button> : null}{workspace.artifactContent ? <Button variant="outline" size="sm" onClick={() => setArtifactOpen(true)}><FileText className="h-4 w-4" />View Submitted Artifact</Button> : null}{workspace.artifactRevision?.contentType === "PDF" ? <Button variant="outline" size="sm" onClick={() => submissionsApi.downloadRevision(workspace.assignment.submissionId.id, workspace.artifactRevision!.id, workspace.artifactRevision!.revisionNumber).catch(() => toast.error("PDF download unavailable"))}>Download assigned PDF</Button> : null}{workspace.request ? <Button asChild variant="outline" size="sm"><Link to={href(`/review-requests/${encodeURIComponent(workspace.request.id)}`)}>Review history</Link></Button> : null}</div></header>
    {workspace.delivery && <p className="mt-3 text-sm text-muted-foreground">{workspace.delivery.authors.join(", ")} · {t("mentorWorkspace.sentAt")} {new Date(workspace.delivery.sentAt).toLocaleString()}</p>}
    <ContentComparison id={workspace.assignment.submissionId.id} before={workspace.comparisonVersions?.filter(v => v.id !== workspace.artifactRevision?.id).at(-1)} after={workspace.comparisonVersions?.find(v => v.id === workspace.artifactRevision?.id)} />
    {workspace.previousRevisionItems?.length ? <section className="mt-6 rounded-xl border p-5"><h2 className="font-semibold">Verify author responses</h2><div className="mt-3 space-y-3">{workspace.previousRevisionItems.map((item) => <article key={item.id} className="rounded-lg border p-3 text-sm"><p>{item.description} · {item.status}</p>{item.responses.map((response) => <p key={response.submissionRevisionId} className="mt-2 whitespace-pre-wrap text-muted-foreground">{response.responseText} · {response.status}</p>)}{!completed && workspace.request && ["ADDRESSED", "ACCEPTED", "REOPENED"].includes(item.status) ? <div className="mt-3 flex gap-2">{(["ACCEPTED", "REOPENED"] as const).map((status) => <Button key={status} size="sm" variant="outline" onClick={async () => { try { await reviewsApi.verifyRevision(workspace.request!.id, item.id, status, workspace.artifactRevision?.id); await query.refetch(); await client.invalidateQueries({ queryKey: ["review-requests"] }); await client.invalidateQueries({ queryKey: ["submissions"] }); } catch { toast.error("Could not verify the response"); } }}>{status === "ACCEPTED" ? "Accept change" : "Reopen issue"}</Button>)}</div> : null}</article>)}</div></section> : null}

    <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.85fr)_minmax(360px,1fr)]"><aside className="min-w-0"><div className="sticky top-24"><h2 className="font-semibold">{t("Assigned manuscript revision") } {workspace.artifactRevision?.revisionNumber}</h2><p className="mt-2 text-xs text-muted-foreground">{t("Only this immutable revision is being reviewed.")}</p><AssignedRevisionReader submissionId={workspace.assignment.submissionId.id} revisionId={workspace.artifactRevision?.id} contentType={workspace.artifactRevision?.contentType} text={workspace.artifactContent} /><p className="mt-4 text-sm">{t("Scoring coverage")}: {coverage.coverage}% · {completedCount}/{workspace.criteria.length}</p>{mode === "RUBRIC_ASSESSMENT" && <p className="text-sm">{t("Weighted average")}: {coverage.score === null ? t("Not assessed") : coverage.score.toFixed(2)}{fivePointScale ? " / 5" : ""}</p>}<p className="mt-2 text-xs text-muted-foreground">{t("Average = sum(score × weight) / assessed applicable weight. Unassessed items are not zero; N/A is excluded. Scores never grant approval.")}</p></div></aside>

      <div className="min-w-0"><AssignedReviewAdvisory submissionId={workspace.assignment.submissionId.id} revisionId={workspace.artifactRevision?.id} /><div className="mt-4 space-y-4">{workspace.criteria.map((criterion, index) => {
        const state = responses[criterion.key] ?? { comment: "", evidence: "", notApplicable: false };
        return <section id={`criterion-${criterion.key}`} key={criterion.key} className="scroll-mt-24 rounded-xl border bg-card"><details open={index === 0}><summary className="cursor-pointer p-4 marker:text-muted-foreground"><div className="inline-flex w-[95%] items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{criterion.title}</h2>{criterion.required && !commentOnly ? <span className="text-xs text-red-600">Required</span> : null}{criterion.weight ? <Badge variant="outline">Weight {criterion.weight}</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{state.notApplicable ? t("Not applicable") : criterion.levels.find(l=>l.id === state.performanceLevelId)?.label ?? (state.assessment ? state.assessment.replaceAll("_"," ") : state.comment.trim() ? t("Draft response") : t("Not assessed"))}</p></div></div></summary><div className="border-t px-5 pb-5">{criterion.description ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{criterion.description}</p> : null}
          {mode === "STRUCTURED_REVIEW" ? <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assessment</p><div className="mt-2 flex flex-wrap gap-2">{assessmentOptions.filter((option) => option.value !== "NOT_APPLICABLE" || criterion.allowNotApplicable).map((option) => <button key={option.value} type="button" disabled={completed} onClick={() => updateResponse(criterion.key, { assessment: option.value, notApplicable: option.value === "NOT_APPLICABLE" })} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${state.assessment === option.value ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/30" : "hover:bg-muted"}`}>{option.label}</button>)}</div></div> : null}
          {mode === "RUBRIC_ASSESSMENT" && !state.performanceLevelId && !state.notApplicable ? <p className="mt-3 text-xs text-muted-foreground">{t("Not assessed")}</p> : null}{mode === "RUBRIC_ASSESSMENT" ? <div className="mt-5 grid gap-2">{criterion.levels.map((level) => <button key={level.id} type="button" disabled={completed} aria-pressed={state.performanceLevelId === level.id && !state.notApplicable} onClick={() => updateResponse(criterion.key, { performanceLevelId: level.id, notApplicable: false })} className={`rounded-lg border p-3 text-left ${state.performanceLevelId === level.id ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30" : "hover:bg-muted/40"}`}><span className="text-sm font-semibold">{level.label} · {level.score}</span>{level.description ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{level.description}</span> : null}</button>)}{criterion.allowNotApplicable ? <button type="button" disabled={completed} onClick={() => updateResponse(criterion.key, { performanceLevelId: undefined, notApplicable: true })} className={`rounded-lg border p-3 text-left text-sm font-medium ${state.notApplicable ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30" : "hover:bg-muted/40"}`}>Not applicable</button> : null}</div> : null}
          <label className="mt-5 block text-sm font-medium">{mode === "GUIDED_FEEDBACK" ? "Response" : "Comment"}<textarea disabled={completed} value={state.comment} onChange={(event) => updateResponse(criterion.key, { comment: event.target.value })} className="mt-2 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6" placeholder={mode === "GUIDED_FEEDBACK" ? "Provide specific, constructive feedback." : "Explain the assessment with specific academic reasoning."} /></label><label className="mt-3 block text-sm font-medium">Evidence or artifact reference <span className="font-normal text-muted-foreground">(optional)</span><textarea disabled={completed} value={state.evidence} onChange={(event) => updateResponse(criterion.key, { evidence: event.target.value })} className="mt-2 min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Section, claim, table, citation, or source" /></label>
        </div></details></section>;
      })}</div>

      {integrityRequired && !commentOnly && <ReviewIntegrityChecklist disabled={completed} value={integrityChecks} onChange={value => {setIntegrityChecks(value);markDirty();}} />}
      <section className="mt-6 rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Review Summary</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Key Strengths<textarea disabled={completed} value={keyStrengths} onChange={(event) => { setKeyStrengths(event.target.value); markDirty(); }} className="mt-2 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label><label className="text-sm font-medium">Key Concerns<textarea disabled={completed} value={keyConcerns} onChange={(event) => { setKeyConcerns(event.target.value); markDirty(); }} className="mt-2 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label></div><label className="mt-4 block text-sm font-medium">Overall Comment <span className="font-normal text-muted-foreground">*</span><textarea disabled={completed} value={overallComment} onChange={(event) => { setOverallComment(event.target.value); markDirty(); }} className="mt-2 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>{workspace.request?.origin === "MENTOR_GUIDANCE" ? <MentorReviewOutcome commentOnly={commentOnly} assessment={overallAssessment} disabled={completed} onChange={(only, assessment) => { setCommentOnly(only); setOverallAssessment(assessment); markDirty(); }} /> : <label className="mt-4 block text-sm font-medium">Overall Assessment<select disabled={completed} value={overallAssessment ?? ""} onChange={(event) => { setOverallAssessment(event.target.value as OverallAcademicAssessment); markDirty(); }} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select assessment</option><option value="STRONG">{t("Ready to advance internally")}</option><option value="MINOR_REVISION">Minor revision</option><option value="MAJOR_REVISION">Major revision</option><option value="NOT_READY">Not ready</option></select></label>}
        {!commentOnly && <div className="mt-6"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Required Revisions</h3><p className="mt-1 text-xs text-muted-foreground">Actionable changes the researcher must address before resubmission.</p></div>{!completed ? <Button variant="outline" size="sm" onClick={() => { setRequiredRevisions((current) => [...current, { priority: "MAJOR", description: "" }]); markDirty(); }}><Plus className="h-4 w-4" />Add revision item</Button> : null}</div>{requiredRevisions.length ? <div className="mt-3 space-y-2">{requiredRevisions.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[120px_1fr_auto]"><select disabled={completed} value={item.priority} onChange={(event) => { setRequiredRevisions((current) => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, priority: event.target.value as "MINOR" | "MAJOR" } : currentItem)); markDirty(); }} className="h-10 rounded-md border bg-background px-2 text-sm"><option value="MAJOR">Major</option><option value="MINOR">Minor</option></select><Input disabled={completed} aria-label={t("Required change")} value={item.description} onChange={(event) => { setRequiredRevisions((current) => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, description: event.target.value } : currentItem)); markDirty(); }} placeholder="Describe the required change" /><select disabled={completed} aria-label={t("Related rubric criterion")} className="h-10 rounded-md border bg-background px-2 text-sm" value={item.criterionKey ?? ""} onChange={event => {setRequiredRevisions(current=>current.map((r,i)=>i === index ? {...r,criterionKey:event.target.value || undefined} : r));markDirty();}}><option value="">{t("Related rubric criterion")}</option>{workspace.criteria.map(c=><option key={c.key} value={c.key}>{c.title}</option>)}</select><Input disabled={completed} aria-label={t("Page or section reference")} value={item.locator ?? ""} maxLength={500} placeholder={t("Page or section reference")} onChange={event => { setRequiredRevisions(current => current.map((r,i) => i === index ? {...r,locator:event.target.value} : r));markDirty();}} /><Input disabled={completed} aria-label={t("Exact quoted excerpt (optional)")} value={item.quotation ?? ""} maxLength={5000} placeholder={t("Exact quoted excerpt (optional)")} onChange={event => { setRequiredRevisions(current => current.map((r,i) => i === index ? {...r,quotation:event.target.value || undefined} : r));markDirty();}} />{!completed ? <Button variant="ghost" size="icon" className="text-red-600" aria-label={t("Remove revision item")} onClick={() => { setRequiredRevisions((current) => current.filter((_, itemIndex) => itemIndex !== index)); markDirty(); }}><Trash2 className="h-4 w-4" /></Button> : null}</div>)}</div> : <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">This review does not require additional revisions.</p>}</div>}
      </section></div>
    </div>

    {!completed ? <div className="sticky bottom-3 z-20 mt-6 flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{completedCount} of {workspace.criteria.length} criteria completed</p><div className="flex gap-2"><Button variant="outline" onClick={saveNow} disabled={save.isPending}><Save className="h-4 w-4" />Save draft</Button><Button onClick={() => setSubmitOpen(true)} disabled={submit.isPending || save.isPending}><Send className="h-4 w-4" />Submit Review</Button></div></div> : <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">This review round is submitted and immutable.</div>}

    {completed && workspace.request?.origin === "MENTOR_GUIDANCE" && <NextMentorReview requestId={workspace.request.id} />}
    <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}><DialogContent><DialogHeader><DialogTitle>Review Guidelines</DialogTitle><DialogDescription>How to perform this review. Criteria describe what to evaluate.</DialogDescription></DialogHeader><ul className="space-y-3 text-sm leading-6">{workspace.templateVersion?.guidelines.length ? workspace.templateVersion.guidelines.map((item) => <li key={item} className="flex gap-2"><span className="text-blue-600">•</span>{item}</li>) : <li>No additional guidelines were provided.</li>}</ul><DialogFooter><Button onClick={() => setGuidelinesOpen(false)}>Start Review</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={artifactOpen} onOpenChange={setArtifactOpen}><DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Submitted Artifact</DialogTitle><DialogDescription>Immutable content snapshot for revision {workspace.artifactRevision?.revisionNumber ?? workspace.assignment.submissionId.currentRevisionNumber}.</DialogDescription></DialogHeader><div className="whitespace-pre-wrap rounded-xl border bg-muted/20 p-5 text-sm leading-7">{workspace.artifactContent}</div></DialogContent></Dialog>
    <Dialog open={submitOpen} onOpenChange={setSubmitOpen}><DialogContent><DialogHeader><DialogTitle>Submit this review?</DialogTitle><DialogDescription>Submitted responses are locked for this review round. Required revisions will be sent to the researcher.</DialogDescription></DialogHeader><div className="rounded-xl border bg-muted/20 p-4 text-sm"><p>{completedCount} / {workspace.criteria.length} criteria completed</p><p className="mt-1">Overall assessment: {commentOnly ? t("mentorWorkspace.outcome.comment") : t(internalAssessmentLabel(overallAssessment)) || t("Not selected")}</p><p className="mt-1">{t("New revision items")}: {requiredRevisions.filter((item) => item.description.trim()).length}</p><p className="mt-1">{t("Unresolved earlier items")}: {workspace.previousRevisionItems.filter(item=>item.status !== "ACCEPTED").length}</p></div><DialogFooter><Button variant="ghost" onClick={() => setSubmitOpen(false)}>Continue editing</Button><Button onClick={submitNow} disabled={submit.isPending || save.isPending}>{submit.isPending ? "Submitting…" : "Submit final review"}</Button></DialogFooter></DialogContent></Dialog>
  </Container>;
}
