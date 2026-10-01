import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CorpusPaperEvidence, GapAssessmentLevel, LiteratureCorpus, ResearchGapType } from "@trend/shared-types";
import { BookOpenCheck, FileSearch, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddCorpusPaper,
  useCreateLiteratureCorpus,
  useLiteratureCorpora,
  useLiteratureCorpus,
  useLiteratureEvidenceMap,
  useRemoveCorpusPaper,
} from "@/features/literature/hooks/use-literature";
import { api } from "@/services/api-client";
import { useCreateGapCandidate } from "@/features/gaps";

type SearchPaper = { _id: string; title: string; publicationYear?: number; journalName?: string };
const gapTypes: ResearchGapType[] = ["COVERAGE_GAP", "EMPIRICAL_VALIDATION_GAP", "CONTRADICTORY_EVIDENCE_GAP", "CONTEXT_GAP", "METHODOLOGICAL_GAP", "OUTCOME_GAP", "TEMPORAL_GAP", "EMERGING_GAP", "MISSING_CONNECTION_GAP", "ASSUMPTION_GAP", "OTHER"];

function usePaperSearch(query: string) {
  return useQuery({
    queryKey: ["literature", "paper-search", query],
    queryFn: async () => {
      const response = await api.get<{ data: SearchPaper[] }>("/papers", { params: { q: query, pageSize: 8 } });
      return response.data.data;
    },
    enabled: query.trim().length >= 3,
  });
}

function CorpusCreateDialog({ onCreated }: { onCreated: (corpus: LiteratureCorpus) => void }) {
  const create = useCreateLiteratureCorpus();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", topic: "", researchGoal: "", domain: "", keywords: "", population: "", intervention: "", comparison: "", outcome: "", context: "", searchStrategy: "" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const corpus = await create.mutateAsync({
        name: form.name,
        topic: form.topic,
        researchGoal: form.researchGoal || undefined,
        domain: form.domain || undefined,
        keywords: form.keywords.split(",").map((value) => value.trim()).filter(Boolean),
        picoc: { population: form.population || undefined, intervention: form.intervention || undefined, comparison: form.comparison || undefined, outcome: form.outcome || undefined, context: form.context || undefined },
        searchStrategy: form.searchStrategy || undefined,
      });
      toast.success("Literature corpus created");
      setOpen(false);
      onCreated(corpus);
    } catch {
      toast.error("Could not create the literature corpus");
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New corpus</Button></DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Define research scope</DialogTitle><DialogDescription>Create a traceable corpus before proposing a research gap.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="corpus-name">Corpus name</Label><Input id="corpus-name" value={form.name} onChange={(event) => update("name", event.target.value)} minLength={3} required /></div>
            <div className="space-y-2"><Label htmlFor="corpus-domain">Domain</Label><Input id="corpus-domain" value={form.domain} onChange={(event) => update("domain", event.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="corpus-topic">Research topic</Label><Input id="corpus-topic" value={form.topic} onChange={(event) => update("topic", event.target.value)} minLength={3} required /></div>
          <div className="space-y-2"><Label htmlFor="corpus-goal">Research goal</Label><textarea id="corpus-goal" value={form.researchGoal} onChange={(event) => update("researchGoal", event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
          <div className="space-y-2"><Label htmlFor="corpus-keywords">Keywords</Label><Input id="corpus-keywords" value={form.keywords} onChange={(event) => update("keywords", event.target.value)} placeholder="requirements engineering, LLM, industrial study" /></div>
          <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">PICOC scope</legend><div className="grid gap-3 sm:grid-cols-2">{(["population", "intervention", "comparison", "outcome", "context"] as const).map((key) => <div key={key} className="space-y-1.5"><Label htmlFor={`picoc-${key}`} className="capitalize">{key}</Label><Input id={`picoc-${key}`} value={form[key]} onChange={(event) => update(key, event.target.value)} /></div>)}</div></fieldset>
          <div className="space-y-2"><Label htmlFor="search-strategy">Search strategy</Label><textarea id="search-strategy" value={form.searchStrategy} onChange={(event) => update("searchStrategy", event.target.value)} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Databases, query string, years, inclusion and exclusion criteria" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create corpus"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EvidenceMap({ corpusId }: { corpusId: string }) {
  const { data, isLoading } = useLiteratureEvidenceMap(corpusId);
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.includedPaperCount === 0) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Add included papers with structured evidence to populate the evidence map.</div>;
  const dimensions = Object.entries(data.dimensions) as Array<[string, Array<{ value: string; count: number }>]>
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{dimensions.map(([name, buckets]) => <section key={name} className="rounded-xl border bg-card p-4"><h3 className="capitalize font-semibold">{name}</h3><div className="mt-3 space-y-2">{buckets.length ? buckets.slice(0, 8).map((item) => <div key={item.value} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-muted-foreground">{item.value}</span><Badge variant="secondary">{item.count}</Badge></div>) : <p className="text-sm text-muted-foreground">Not recorded</p>}</div></section>)}</div>;
}

function CandidateGapDialog({ corpus }: { corpus: LiteratureCorpus }) {
  const create = useCreateGapCandidate();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", gapType: "COVERAGE_GAP" as ResearchGapType, establishedKnowledge: "", observedLimitation: "", missingEvidence: "", significanceExplanation: "", suggestedResearchQuestion: "", gapConfidence: "LOW" as GapAssessmentLevel, researchPriority: "MODERATE" as GapAssessmentLevel });
  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ topic: corpus.topic, corpusId: corpus._id, projectId: corpus.projectId, scope: Object.values(corpus.picoc).filter(Boolean).join("; ") || undefined, ...form });
      toast.success("Candidate research gap created");
      setOpen(false);
      navigate("/research-gaps");
    } catch { toast.error("Could not create the candidate gap"); }
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline">Create candidate gap</Button></DialogTrigger><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Document a candidate research gap</DialogTitle><DialogDescription>This remains a candidate until evidence is linked and a qualified expert validates it.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="gap-title">Title</Label><Input id="gap-title" value={form.title} onChange={(event) => update("title", event.target.value)} minLength={3} required /></div><div className="space-y-2"><Label htmlFor="gap-type">Gap type</Label><select id="gap-type" value={form.gapType} onChange={(event) => update("gapType", event.target.value as ResearchGapType)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{gapTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></div></div>
    {(["establishedKnowledge", "observedLimitation", "missingEvidence", "significanceExplanation"] as const).map((key) => <div key={key} className="space-y-2"><Label htmlFor={`gap-${key}`}>{({ establishedKnowledge: "What is established", observedLimitation: "Observed limitation", missingEvidence: "Missing evidence", significanceExplanation: "Why it matters" })[key]}</Label><textarea id={`gap-${key}`} value={form[key]} onChange={(event) => update(key, event.target.value)} minLength={10} required className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>)}
    <div className="space-y-2"><Label htmlFor="gap-rq">Suggested research question</Label><Input id="gap-rq" value={form.suggestedResearchQuestion} onChange={(event) => update("suggestedResearchQuestion", event.target.value)} /></div>
    <div className="grid gap-4 sm:grid-cols-2">{(["gapConfidence", "researchPriority"] as const).map((key) => <div key={key} className="space-y-2"><Label htmlFor={`gap-${key}`}>{key === "gapConfidence" ? "Gap confidence" : "Research priority"}</Label><select id={`gap-${key}`} value={form[key]} onChange={(event) => update(key, event.target.value as GapAssessmentLevel)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{(["LOW", "MODERATE", "HIGH"] as const).map((level) => <option key={level}>{level}</option>)}</select></div>)}</div>
    <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create candidate"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

function CorpusWorkspace({ corpusId }: { corpusId: string }) {
  const { data, isLoading, isError } = useLiteratureCorpus(corpusId);
  const addPaper = useAddCorpusPaper(corpusId);
  const removePaper = useRemoveCorpusPaper(corpusId);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchPaper | null>(null);
  const [evidence, setEvidence] = useState<CorpusPaperEvidence>({});
  const { data: results = [], isLoading: searching } = usePaperSearch(query);
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-60 w-full" /></div>;
  if (isError || !data) return <div className="rounded-xl border border-destructive/30 p-8 text-sm text-destructive">Could not load this literature corpus.</div>;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try {
      await addPaper.mutateAsync({ paperId: selected._id, evidence });
      toast.success("Paper added to corpus");
      setSelected(null); setQuery(""); setEvidence({});
    } catch { toast.error("Could not add this paper"); }
  };
  return <div className="space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">{data.corpus.name}</h2><Badge variant="outline">{data.corpus.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{data.corpus.topic}</p></div><CandidateGapDialog corpus={data.corpus} /></header>
    <section className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Add a LumiGap paper</h3><p className="mt-1 text-sm text-muted-foreground">Record only evidence present in the paper. Leave unknown fields empty.</p><form onSubmit={submit} className="mt-4 space-y-4">
      <div className="relative space-y-2"><Label htmlFor="corpus-paper-search">Search papers</Label><Input id="corpus-paper-search" value={selected ? selected.title : query} onChange={(event) => { setSelected(null); setQuery(event.target.value); }} placeholder="Search by paper title" />{!selected && query.length >= 3 ? <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover shadow-lg">{searching ? <p className="p-3 text-sm text-muted-foreground">Searching...</p> : results.length ? results.map((paper) => <button type="button" key={paper._id} onClick={() => setSelected(paper)} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"><span className="font-medium">{paper.title}</span><span className="ml-2 text-xs text-muted-foreground">{paper.publicationYear ?? "Year unavailable"}</span></button>) : <p className="p-3 text-sm text-muted-foreground">No papers found</p>}</div> : null}</div>
      <div className="grid gap-3 sm:grid-cols-2">{(["methodology", "context", "outcome", "researchType", "limitations", "futureWork"] as const).map((key) => <div key={key} className="space-y-1.5"><Label htmlFor={`evidence-${key}`} className="capitalize">{key === "researchType" ? "Research type" : key === "futureWork" ? "Future work" : key}</Label><Input id={`evidence-${key}`} value={evidence[key] ?? ""} onChange={(event) => setEvidence((current) => ({ ...current, [key]: event.target.value }))} /></div>)}</div>
      <Button type="submit" size="sm" disabled={!selected || addPaper.isPending}>{addPaper.isPending ? "Adding..." : "Add paper"}</Button>
    </form></section>
    <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Corpus papers</h3><Badge variant="secondary">{data.papers.length}</Badge></div>{data.papers.length ? <div className="space-y-2">{data.papers.map((record) => { const paper = typeof record.paperId === "string" ? undefined : record.paperId; const id = typeof record.paperId === "string" ? record.paperId : record.paperId._id; return <article key={record._id} className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"><div><h4 className="font-medium">{paper?.title ?? id}</h4><p className="mt-1 text-xs text-muted-foreground">{[record.evidence.methodology, record.evidence.context, record.evidence.researchType].filter(Boolean).join(" / ") || "Structured evidence not recorded"}</p></div><Button size="icon" variant="ghost" aria-label="Remove paper from corpus" disabled={removePaper.isPending} onClick={() => removePaper.mutate(id)}><Trash2 className="h-4 w-4" /></Button></article>; })}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No papers have been attached to this corpus.</div>}</section>
    <section><div className="mb-3 flex items-center gap-2"><BookOpenCheck className="h-5 w-5" /><h3 className="font-semibold">Evidence map</h3></div><EvidenceMap corpusId={corpusId} /></section>
  </div>;
}

export function ResearchGapDiscoverPage() {
  const [searchParams] = useSearchParams();
  const { data = [], isLoading, isError } = useLiteratureCorpora();
  const [selectedId, setSelectedId] = useState<string>(() => searchParams.get("corpus") ?? "");
  useEffect(() => { if (!selectedId && data[0]) setSelectedId(data[0]._id); }, [data, selectedId]);
  return <main className="container max-w-7xl py-8"><div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300"><FileSearch className="h-4 w-4" />Evidence-backed discovery</div><h1 className="mt-2 text-3xl font-bold tracking-tight">Research gap workspace</h1><p className="mt-2 max-w-2xl text-muted-foreground">Define scope, curate literature, structure per-study evidence, then inspect coverage before claiming a candidate gap.</p></div><CorpusCreateDialog onCreated={(corpus) => setSelectedId(corpus._id)} /></div>
    <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]"><aside><h2 className="mb-3 text-sm font-semibold">Literature corpora</h2>{isLoading ? <Skeleton className="h-40 w-full" /> : isError ? <div className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Could not load literature corpora.</div> : data.length ? <div className="space-y-2">{data.map((corpus) => <button key={corpus._id} onClick={() => setSelectedId(corpus._id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === corpus._id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "bg-card hover:bg-muted/60"}`}><span className="block font-medium">{corpus.name}</span><span className="mt-1 block text-xs text-muted-foreground">{corpus.paperCount ?? 0} papers</span></button>)}</div> : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Create a corpus to start an evidence-backed research gap workflow.</div>}</aside><section>{selectedId ? <CorpusWorkspace corpusId={selectedId} /> : <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">Select or create a literature corpus.</div>}</section></div>
  </main>;
}
