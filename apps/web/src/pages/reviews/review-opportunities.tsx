import { useEffect, useMemo, useState } from "react";
import type { ReviewAvailabilitySettings, SubmissionType } from "@trend/shared-types";
import { AlertTriangle, BookOpenCheck, CalendarClock, Check, Filter, Settings2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDeclareReviewConflict,
  useReviewAvailability,
  useReviewOpportunities,
  useUpdateReviewAvailability,
} from "@/features/reviews";

const submissionTypes: Array<{ value: SubmissionType; label: string }> = [
  { value: "RESEARCH_PROPOSAL", label: "Research proposal" },
  { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "THESIS_DRAFT", label: "Thesis draft" },
  { value: "RESEARCH_PAPER", label: "Research paper" },
  { value: "SOFTWARE_RESEARCH_PROJECT", label: "Software research project" },
];

const csv = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
const emptySettings: Omit<ReviewAvailabilitySettings, "activeReviewCount"> = {
  availableForReview: false,
  acceptedFields: [],
  acceptedTopics: [],
  acceptedSubmissionTypes: ["RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_PAPER"],
  maximumActiveReviews: 3,
  preferredReviewWorkload: "2–4 hours",
  availabilityNote: "",
  autoRecommendationEnabled: true,
};

export function ReviewOpportunitiesPage() {
  const availability = useReviewAvailability();
  const updateAvailability = useUpdateReviewAvailability();
  const [filters, setFilters] = useState({ researchField: "", topic: "", submissionType: "", sort: "relevance" });
  const opportunities = useReviewOpportunities({
    researchField: filters.researchField || undefined,
    topic: filters.topic || undefined,
    submissionType: filters.submissionType || undefined,
    sort: filters.sort,
  });
  const declareConflict = useDeclareReviewConflict();
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(emptySettings);
  const [fieldsText, setFieldsText] = useState("");
  const [topicsText, setTopicsText] = useState("");

  useEffect(() => {
    if (!availability.data) return;
    const { activeReviewCount: _count, ...editable } = availability.data;
    setSettings(editable);
    setFieldsText(editable.acceptedFields.join(", "));
    setTopicsText(editable.acceptedTopics.join(", "));
  }, [availability.data]);

  const errorStatus = (availability.error as { response?: { status?: number } } | null)?.response?.status;
  const isEligible = errorStatus !== 403;
  const workload = availability.data;
  const cards = opportunities.data?.opportunities ?? [];
  const selectedTypeLabels = useMemo(() => new Map(submissionTypes.map((item) => [item.value, item.label])), []);

  async function saveSettings() {
    try {
      await updateAvailability.mutateAsync({ ...settings, acceptedFields: csv(fieldsText), acceptedTopics: csv(topicsText) });
      toast.success("Review availability updated");
      setEditing(false);
    } catch {
      toast.error("Could not update review availability");
    }
  }

  if (availability.isLoading) return <main className="mx-auto max-w-6xl px-4 py-10"><div className="h-56 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" /></main>;
  if (!isEligible) return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-zinc-950"><AlertTriangle className="h-6 w-6 text-amber-600" /><h1 className="mt-4 text-2xl font-semibold">Formal Academic Review requires a verified Lecturer</h1><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">A verified Lecturer position and an explicit assignment are required. All academic roles can use normal research tools and provide collaboration feedback.</p></div></main>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Peer review</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Review opportunities</h1><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">Research explicitly opened for review, matched against your declared expertise and workload. Full content is available after you accept an assignment.</p></div>
        <Button variant="outline" onClick={() => setEditing((value) => !value)}><Settings2 /> Reviewer settings</Button>
      </header>

      {workload && <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Review capacity"><div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950"><p className="text-xs text-slate-500">Availability</p><p className="mt-1 font-semibold">{workload.availableForReview ? "Open to review" : "Not accepting reviews"}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950"><p className="text-xs text-slate-500">Active workload</p><p className="mt-1 font-semibold">{workload.activeReviewCount} of {workload.maximumActiveReviews}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-zinc-950"><p className="text-xs text-slate-500">Identity policy</p><p className="mt-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" />Assigned access</p></div></section>}

      {editing && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-zinc-950"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Reviewer availability</h2><p className="mt-1 text-xs text-slate-500">These settings are private except for your public Available for Review indicator.</p></div><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={settings.availableForReview} onChange={(event) => setSettings((value) => ({ ...value, availableForReview: event.target.checked }))} /> Available</label></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Accepted fields<Input className="mt-2" value={fieldsText} onChange={(event) => setFieldsText(event.target.value)} placeholder="Software Engineering, AI" /></label><label className="text-sm font-medium">Accepted topics<Input className="mt-2" value={topicsText} onChange={(event) => setTopicsText(event.target.value)} placeholder="LLM evaluation, requirements" /></label><label className="text-sm font-medium">Maximum active reviews<Input className="mt-2" type="number" min={1} max={20} value={settings.maximumActiveReviews} onChange={(event) => setSettings((value) => ({ ...value, maximumActiveReviews: Number(event.target.value) }))} /></label><label className="text-sm font-medium">Preferred workload<Input className="mt-2" value={settings.preferredReviewWorkload ?? ""} onChange={(event) => setSettings((value) => ({ ...value, preferredReviewWorkload: event.target.value }))} /></label></div><fieldset className="mt-4"><legend className="text-sm font-medium">Accepted submission types</legend><div className="mt-2 flex flex-wrap gap-2">{submissionTypes.map((type) => { const active = settings.acceptedSubmissionTypes.includes(type.value); return <button key={type.value} type="button" onClick={() => setSettings((value) => ({ ...value, acceptedSubmissionTypes: active ? value.acceptedSubmissionTypes.filter((item) => item !== type.value) : [...value.acceptedSubmissionTypes, type.value] }))} className={`rounded-full border px-3 py-1.5 text-xs ${active ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40" : "border-slate-200 text-slate-600 dark:border-slate-700"}`}>{active && <Check className="mr-1 inline h-3 w-3" />}{type.label}</button>; })}</div></fieldset><label className="mt-4 block text-sm font-medium">Availability note<textarea className="mt-2 min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={settings.availabilityNote ?? ""} onChange={(event) => setSettings((value) => ({ ...value, availabilityNote: event.target.value }))} /></label><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={saveSettings} disabled={updateAvailability.isPending}>Save settings</Button></div></section>}

      <section className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40"><div className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4" />Match filters</div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input value={filters.researchField} onChange={(event) => setFilters((value) => ({ ...value, researchField: event.target.value }))} placeholder="Research field" /><Input value={filters.topic} onChange={(event) => setFilters((value) => ({ ...value, topic: event.target.value }))} placeholder="Topic or keyword" /><select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filters.submissionType} onChange={(event) => setFilters((value) => ({ ...value, submissionType: event.target.value }))}><option value="">All submission types</option>{submissionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value }))}><option value="relevance">Best match</option><option value="newest">Newest first</option></select></div></section>

      {!workload?.availableForReview ? <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700"><BookOpenCheck className="mx-auto h-7 w-7 text-slate-400" /><h2 className="mt-3 font-semibold">You have not enabled Available for Review</h2><p className="mt-2 text-sm text-slate-500">Open reviewer settings to opt in and control your workload.</p><Button className="mt-5" onClick={() => setEditing(true)}>Configure availability</Button></div> : opportunities.isLoading ? <div className="mt-8 grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />)}</div> : cards.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700"><h2 className="font-semibold">No review opportunities match your expertise yet.</h2><p className="mt-2 text-sm text-slate-500">Try broadening the filters or accepted topics. LumiGap will never auto-assign a submission.</p></div> : <div className="mt-8 grid gap-4 md:grid-cols-2">{cards.map((card) => <article key={card.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-zinc-950"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><Badge variant="secondary">{card.submissionType ? selectedTypeLabels.get(card.submissionType) : "Submission"}</Badge><Badge variant="outline">{card.authorVisibility === "SUMMARY_ONLY" ? "Summary available" : "Assigned access"}</Badge></div><h2 className="mt-3 text-lg font-semibold leading-6">{card.title}</h2></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40">{card.matchScore}% match</span></div>{card.abstract && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{card.abstract}</p>}<dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Field</dt><dd className="mt-1 font-medium">{card.researchField || "Not specified"}</dd></div><div><dt className="text-slate-500">Expected workload</dt><dd className="mt-1 font-medium">{card.expectedWorkload || "Not specified"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-1.5">{card.keywords.slice(0, 5).map((keyword) => <Badge key={keyword} variant="outline" className="font-normal">{keyword}</Badge>)}</div>{card.matchReasons.length > 0 && <ul className="mt-4 space-y-1 text-xs text-emerald-700 dark:text-emerald-400">{card.matchReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>}<div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800"><span className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock className="h-3.5 w-3.5" />Revision {card.currentRevisionNumber}</span><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={async () => { const reason = window.prompt("Briefly describe the conflict of interest (minimum 10 characters)"); if (!reason) return; try { await declareConflict.mutateAsync({ submissionId: card.id, reason }); toast.success("Conflict recorded"); } catch { toast.error("Could not record conflict"); } }}>Declare conflict</Button><p className="text-xs text-muted-foreground">A project request and your acceptance are required for formal review.</p></div></div></article>)}</div>}
    </main>
  );
}
