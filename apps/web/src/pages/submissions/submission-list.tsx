import { Link } from "react-router-dom";
import { ArrowRight, FileCheck2, FilePlus2, History, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSubmissions } from "@/features/submissions";

const statusTone: Record<string, string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  under_review: "border-blue-200 bg-blue-50 text-blue-700",
  revision_requested: "border-amber-200 bg-amber-50 text-amber-800",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

export function SubmissionListPage() {
  const query = useSubmissions();
  if (query.isLoading) return <main className="mx-auto max-w-6xl px-4 py-10"><div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" /></main>;
  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><header className="flex flex-col gap-5 border-b border-slate-200 pb-7 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Research workflow</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Submissions</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">Structured goals, research questions, evidence claims and immutable manuscript revisions in one audit trail.</p></div><Button asChild><Link to="/submissions/new"><FilePlus2 />New submission</Link></Button></header>{query.error ? <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Unable to load your submissions.</div> : query.data?.length ? <div className="mt-8 space-y-4">{query.data.map((submission) => <Link key={submission._id} to={`/submissions/${submission._id}`} className="group grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-zinc-950 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{submission.submissionType?.replaceAll("_", " ") || "Submission"}</Badge><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusTone[submission.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{submission.status.replaceAll("_", " ")}</span></div><h2 className="mt-3 text-lg font-semibold group-hover:text-blue-700">{submission.title}</h2><p className="mt-1 text-sm text-slate-500">{submission.researchField || "Research field not specified"}</p><div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Revision {submission.currentRevisionNumber}</span><span className="flex items-center gap-1.5"><SearchCheck className="h-3.5 w-3.5" />Updated {new Date(submission.updatedAt).toLocaleDateString()}</span></div></div><ArrowRight className="hidden h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 md:block" /></Link>)}</div> : <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700"><FileCheck2 className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-4 font-semibold">No research submissions yet.</h2><p className="mt-2 text-sm text-slate-500">Start with a project, define the academic claim, then attach the manuscript revision.</p><Button asChild className="mt-5"><Link to="/submissions/new">Create submission</Link></Button></div>}</main>;
}
