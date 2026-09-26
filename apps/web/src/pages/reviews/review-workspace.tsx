import { useEffect, useState } from "react";
import type { HumanReviewInput, HumanReviewRecommendation } from "@trend/shared-types";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useReviewWorkspace, useSaveReview, useSubmitReview } from "@/features/reviews";

type ResponseState = Record<string, { comment: string; evidence: string }>;

export function ReviewWorkspacePage() {
  const { assignmentId = "" } = useParams();
  const navigate = useNavigate();
  const query = useReviewWorkspace(assignmentId);
  const save = useSaveReview(assignmentId);
  const submit = useSubmitReview(assignmentId);
  const [overallComment, setOverallComment] = useState("");
  const [recommendation, setRecommendation] = useState<HumanReviewRecommendation>("MAJOR_REVISION");
  const [responses, setResponses] = useState<ResponseState>({});

  useEffect(() => {
    if (!query.data) return;
    setOverallComment(query.data.review?.overallComment ?? "");
    setRecommendation(query.data.review?.recommendation ?? "MAJOR_REVISION");
    setResponses(Object.fromEntries(query.data.criteria.map((criterion) => {
      const saved = query.data?.responses.find((response) => response.criterionKey === criterion.key);
      return [criterion.key, { comment: saved?.comment ?? "", evidence: saved?.evidence ?? "" }];
    })));
  }, [query.data]);

  if (query.isLoading) return <main className="mx-auto max-w-5xl px-4 py-10"><div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" /></main>;
  if (!query.data || query.error) return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">This review assignment is unavailable or does not belong to you.</div></main>;
  const workspace = query.data;
  const completed = workspace.review?.status === "SUBMITTED" || workspace.assignment.status === "completed";

  function payload(): HumanReviewInput {
    return { overallComment, recommendation, responses: workspace.criteria.map((criterion) => ({ criterionKey: criterion.key, comment: responses[criterion.key]?.comment ?? "", evidence: responses[criterion.key]?.evidence || undefined })) };
  }

  async function saveDraft() {
    try { await save.mutateAsync(payload()); toast.success("Review draft saved"); } catch { toast.error("Complete the required summary and comments before saving"); }
  }

  async function submitReview() {
    if (!window.confirm("Submit this review? Submitted reviews are immutable and will create a verified contribution record.")) return;
    try { await submit.mutateAsync(payload()); toast.success("Review submitted and contribution verified"); navigate("/reviews"); } catch { toast.error("Complete every rubric criterion before submitting"); }
  }

  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"><Link to="/reviews" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="h-4 w-4" />Back to reviews</Link><header className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-zinc-950"><div className="flex flex-wrap items-center gap-2"><Badge>Human assessment</Badge><Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3" />Double-blind</Badge><Badge variant="secondary">Revision {workspace.assignment.submissionId.currentRevisionNumber}</Badge></div><h1 className="mt-4 text-2xl font-semibold tracking-tight">{workspace.assignment.submissionId.title}</h1><p className="mt-2 text-sm text-slate-500">{workspace.assignment.submissionId.researchField || "Research field not specified"} · {workspace.assignment.submissionId.submissionType?.replaceAll("_", " ") || "Submission"}</p>{workspace.assignment.submissionId.abstract && <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">{workspace.assignment.submissionId.abstract}</p>}</header><aside className="mt-5 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><Bot className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">AI analysis is advisory</p><p className="mt-1 leading-5">Any AI pre-review findings are evidence pointers only. Your rubric responses below are the accountable academic assessment and remain stored separately.</p></div></aside><section className="mt-6 space-y-4">{workspace.criteria.map((criterion, index) => <article key={criterion.key} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-zinc-950"><div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold dark:bg-slate-800">{index + 1}</span><div><h2 className="font-semibold">{criterion.label}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{criterion.description}</p></div></div><label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">Assessment<textarea disabled={completed} className="mt-2 min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm normal-case tracking-normal" value={responses[criterion.key]?.comment ?? ""} onChange={(event) => setResponses((value) => ({ ...value, [criterion.key]: { comment: event.target.value, evidence: value[criterion.key]?.evidence ?? "" } }))} placeholder="Give specific, constructive academic reasoning." /></label><label className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-500">Evidence or manuscript reference <span className="normal-case">(optional)</span><textarea disabled={completed} className="mt-2 min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm normal-case tracking-normal" value={responses[criterion.key]?.evidence ?? ""} onChange={(event) => setResponses((value) => ({ ...value, [criterion.key]: { comment: value[criterion.key]?.comment ?? "", evidence: event.target.value } }))} placeholder="Section, page, table, citation, or reproducibility artifact." /></label></article>)}</section><section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-zinc-950"><h2 className="font-semibold">Overall assessment</h2><label className="mt-4 block text-sm font-medium">Recommendation<select disabled={completed} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={recommendation} onChange={(event) => setRecommendation(event.target.value as HumanReviewRecommendation)}><option value="ACCEPT">Accept</option><option value="MINOR_REVISION">Minor revision</option><option value="MAJOR_REVISION">Major revision</option><option value="REJECT">Reject</option></select></label><label className="mt-4 block text-sm font-medium">Overall comment<textarea disabled={completed} className="mt-2 min-h-36 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={overallComment} onChange={(event) => setOverallComment(event.target.value)} placeholder="Synthesize the most important findings and actionable next steps." /></label>{!completed && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={saveDraft} disabled={save.isPending}><Save />Save draft</Button><Button onClick={submitReview} disabled={submit.isPending}><Send />Submit final review</Button></div>}{completed && <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">This review is complete and immutable. Its LumiGap contribution record is verified from the completed assignment.</p>}</section></main>;
}
