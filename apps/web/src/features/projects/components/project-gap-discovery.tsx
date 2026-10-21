import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Loader2, Search } from "lucide-react";
import type { GapAnalysisResult, ProjectGapDiscoveryResult } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAnalyzeGap, useGapAnalysisStatus } from "@/features/gaps/hooks/use-gaps";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";
import { WorkspaceError, WorkspaceLoading, WorkspacePager } from "./workspace-common";
import "../project-gap-discovery.css";

const stageLabels = { queued: "Waiting for analysis", extracting: "Analyzing source papers", synthesizing: "Comparing findings across papers", generating: "Generating candidate research gaps", ready: "Analysis complete" } as const;

export function ProjectGapDiscovery({ projectId, defaultTopic = "", readOnly = false, onAnalysisChange }: { projectId: string; defaultTopic?: string; readOnly?: boolean; onAnalysisChange?: (analysis: GapAnalysisResult | null) => void }) {
  const { t } = useI18n(), client = useQueryClient();
  const overview = useResearchResource(projectId, ["discovery"], () => researchApi.discovery(projectId), true, data => data?.latestAnalysis?.status === "queued" || data?.latestAnalysis?.status === "analyzing");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 250);
  const topic = defaultTopic.trim().length >= 3 ? defaultTopic.slice(0, 200) : "Research gaps";
  const papers = useResearchResource(projectId, ["discovery-papers", page, query], () => researchApi.library(projectId, { state: "INCLUDED", page, pageSize: 50, q: query }));
  const [selection, setSelection] = useState<Map<string, string> | null>(null), [runId, setRunId] = useState<string | null>(null);
  const analyze = useAnalyzeGap(), run = useGapAnalysisStatus(runId);
  const lastFinished = useRef<string | null>(null);
  const sharedLatest = overview.data?.latestAnalysis;
  const latest = sharedLatest && run.data && sharedLatest.id !== run.data.id && sharedLatest.createdAt > run.data.createdAt ? sharedLatest : run.data ?? sharedLatest;
  const running = latest?.status === "queued" || latest?.status === "analyzing" || Boolean(runId && !run.data && !run.isError);
  const maximum = overview.data?.maxPapers ?? 10, minimum = overview.data?.minPapers ?? 2;
  const eligible = papers.data?.items.filter(paper => !paper.dataStatus || paper.dataStatus === "active");
  const selected = selection ?? new Map(eligible?.slice(0, maximum).map(paper => [paper.paperId, paper.title]));
  const frozen = running || readOnly || analyze.isPending;
  const analysisPapers = latest?.discovery?.papers.map(paper => paper.id) ?? latest?.selectedPaperIds ?? [];
  const selectionChanged = latest?.status === "ready" && JSON.stringify([...selected.keys()].sort()) !== JSON.stringify([...analysisPapers].sort());
  useEffect(() => { onAnalysisChange?.(latest ?? null); }, [latest, onAnalysisChange]);
  useEffect(() => {
    if (!latest || (latest.status !== "ready" && latest.status !== "failed") || lastFinished.current === latest.id) return;
    lastFinished.current = latest.id;
    void client.invalidateQueries({ queryKey: ["gaps"] });
    void client.invalidateQueries({ queryKey: ["project-research"] });
    void client.invalidateQueries({ queryKey: ["credits"] });
  }, [latest?.id, latest?.status, client, projectId]);

  async function start() {
    if (running || analyze.isPending) return;
    try {
      const result = await analyze.mutateAsync({ projectId, topic: topic.trim(), projectDiscovery: true, evidenceMode: "selected", selectedPaperIds: [...selected.keys()] });
      setRunId(result.analysisId);
      void overview.refetch();
    } catch { /* Keep the selected papers and topic for retry. */ }
  }
  const errorMessage = isAxiosError(analyze.error) ? analyze.error.response?.data?.error?.message : undefined;
  return <section className="gap-discovery" data-no-i18n aria-busy={overview.isLoading} aria-label={t("Research gap discovery")}>
    <header className="gap-discovery-heading"><h2>{t("Research Gaps")}</h2><p>{t("Select papers, analyze and explore research gaps.")}</p></header>
    {overview.isLoading ? <WorkspaceLoading /> : overview.isError ? <WorkspaceError error={overview.error} retry={() => void overview.refetch()} /> : <>
      {(overview.data?.eligibleCount ?? 0) < minimum ? <div className="gap-discovery-empty" role="status"><p>{t("Mark at least {{count}} papers Relevant / Included in Literature, then return here to analyze them.", { count: minimum })}</p><Button asChild variant="outline"><Link to={`/projects/${projectId}?tab=papers`}>{t("Open Literature")}</Link></Button></div> : <div className="gap-discovery-selection">
        <div className="gap-discovery-selection-heading"><h3>{t("Choose papers")}</h3><span aria-live="polite">{t("{{count}} selected for analysis", { count: selected.size })}</span></div>
        <div className="gap-discovery-toolbar"><label className="gap-discovery-search"><Search size={16} aria-hidden="true" /><Input aria-label={t("Search relevant papers")} placeholder={t("Search title or DOI")} value={search} maxLength={200} disabled={frozen} onChange={event => { setSelection(new Map(selected)); setSearch(event.target.value); setPage(1); }} /></label><div>
          <Button variant="ghost" size="sm" disabled={frozen || papers.isLoading || !eligible?.length || selected.size >= maximum || eligible.every(paper => selected.has(paper.paperId))} onClick={() => { const next = new Map(selected); for (const paper of eligible ?? []) { if (next.size >= maximum) break; next.set(paper.paperId, paper.title); } setSelection(next); }}>{t(search || papers.data?.hasNext ? "Select shown" : "Select all")}</Button>
          <Button variant="ghost" size="sm" disabled={frozen || !selected.size} onClick={() => setSelection(new Map())}>{t("Clear selection")}</Button>
        </div></div>
        {papers.isLoading ? <WorkspaceLoading /> : papers.isError ? <WorkspaceError error={papers.error} retry={() => void papers.refetch()} /> : <>
          <div className="gap-discovery-paper-list">{eligible?.map(paper => <label key={paper.paperId} className="gap-discovery-paper" data-selected={selected.has(paper.paperId)}><input type="checkbox" checked={selected.has(paper.paperId)} disabled={frozen || (!selected.has(paper.paperId) && selected.size >= maximum)} onChange={event => { const next = new Map(selected); if (event.target.checked) next.set(paper.paperId, paper.title); else next.delete(paper.paperId); setSelection(next); }} /><span><span className="gap-discovery-paper-title" title={paper.title}>{paper.title}</span><small>{[paper.publicationYear, paper.authors?.slice(0, 2).join(", "), paper.journalName].filter(Boolean).join(" · ")}</small></span></label>)}</div>
          {eligible?.length === 0 && <p className="gap-discovery-no-match" role="status">{t("No matching papers. Try another search.")}</p>}
          <WorkspacePager data={papers.data} page={page} onPage={next => { setSelection(new Map(selected)); setPage(next); }} />
          {selection && [...selection].some(([id]) => !papers.data?.items.some(paper => paper.paperId === id)) && <details><summary>{t("Selected outside this view")} · {[...selection].filter(([id]) => !papers.data?.items.some(paper => paper.paperId === id)).length}</summary>{[...selection].filter(([id]) => !papers.data?.items.some(paper => paper.paperId === id)).map(([id, title]) => <label key={id} className="gap-discovery-paper"><input type="checkbox" checked disabled={frozen} onChange={() => setSelection(current => { const next = new Map(current); next.delete(id); return next; })} /><span>{title}</span></label>)}</details>}
        </>}
        <Link className="research-source-link" to={`/projects/${projectId}?tab=papers`}>{t("Open Literature")} · {overview.data?.eligibleCount}</Link>
      </div>}
    </>}
    <div className="gap-discovery-action"><Button disabled={readOnly || running || analyze.isPending || overview.isLoading || overview.isError || (overview.data?.eligibleCount ?? 0) < minimum || papers.isLoading || papers.isError || selected.size < minimum || selected.size > maximum} onClick={() => void start()}>
      {(running || analyze.isPending) && <Loader2 size={16} className="mr-2 animate-spin" aria-hidden="true" />}{t(running ? "Analysis in progress" : "Analyze papers")}
    </Button><small>{t("30 credits per analysis")} · {t("{{min}}–{{max}} papers", { min: minimum, max: maximum })}</small></div>
    {selected.size < minimum && !overview.isLoading && (overview.data?.eligibleCount ?? 0) >= minimum && <p className="gap-discovery-selection-help" role="status">{t("Choose {{count}} more papers to analyze.", { count: minimum - selected.size })}</p>}
    {analyze.isError && <div role="alert" className="research-notice"><p>{errorMessage ?? t("Could not start analysis. Your selection is kept.")}</p><Button variant="outline" onClick={() => { void overview.refetch(); void papers.refetch(); analyze.reset(); }}>{t("Refresh sources")}</Button></div>}
    {run.isError && <WorkspaceError error={run.error} retry={() => void run.refetch()} />}
    {(running || analyze.isPending) && <div className="gap-discovery-progress" role="status" aria-live="polite"><Loader2 size={18} className="animate-spin" aria-hidden="true" /><div><strong>{t(stageLabels[latest?.discovery?.stage ?? "queued"])}</strong><p>{t("{{done}} / {{total}} papers analyzed", { done: latest?.discovery?.completed ?? 0, total: latest?.discovery?.total ?? selected.size })}</p></div></div>}
    {!running && !analyze.isPending && latest?.status === "failed" && <p role="alert" className="research-notice">{t(!latest.errorMessage || latest.errorMessage === "Gap analysis failed. Please try again later." ? "The previous analysis failed. Try again with the selected papers." : latest.errorMessage)}</p>}
    {latest?.status === "ready" && <p className="gap-discovery-success" role="status">{t("{{count}} candidate gaps found", { count: latest.gapIds.length })} · {t("Based on {{count}} analyzed papers", { count: analysisPapers.length })}{selectionChanged && <span className="block">{t("Your current selection applies to the next analysis.")}</span>}{latest.gapIds.length === 0 && <span className="block">{t("No grounded gap found in these papers. Try a different selection.")}</span>}</p>}
  </section>;
}

/** The [n] numbering is shared with the stored synthesis and never changes on sorting. */
export function DiscoveryResults({ projectId, result }: { projectId: string; result: ProjectGapDiscoveryResult }) {
  const { t } = useI18n();
  return <div className="gap-discovery-results-body"><p className="research-help">{t("AI interpretations await human review. Quotations are indexed source text; abstract-only coverage is limited.")}</p>
    {result.synthesis && <section className="gap-discovery-synthesis"><h3>{t("Cross-paper findings")}</h3>{([["commonFindings", "Shared findings"], ["contradictions", "Differences and contradictions"], ["openQuestions", "Unresolved questions"]] as const).map(([key, label]) => <div key={key}><h4>{t(label)}</h4><p>{result.synthesis?.[key] || t("Not reported in the available sources")}</p></div>)}</section>}
    {result.papers.map((paper, index) => <details key={paper.id}><summary>[{index + 1}] {paper.title}</summary><div className="gap-discovery-extraction"><Link className="research-source-link" to={`/projects/${projectId}?tab=papers&source=${paper.id}`}>{t("Open source paper")}</Link><p className="research-help">{t("Source coverage")}: {paper.sourceKind}{paper.warnings.map((warning, number) => <span className="block" key={number}>{warning}</span>)}</p>
      {([["researchQuestions", "Research questions"], ["methods", "Methods"], ["findings", "Findings"], ["limitations", "Limitations"], ["futureWork", "Future work"]] as const).map(([key, label]) => { const value = paper.analysis[key]; return <div key={key}><h4>{t(label)}</h4>{Array.isArray(value) && value.length ? <ul>{value.map((text, number) => <li key={number}>{text}</li>)}</ul> : <p>{typeof value === "string" && value ? value : t("Not reported in the available sources")}</p>}</div>; })}
      {!!paper.relations?.length && <><h4>{t("Source-linked statements")}</h4>{paper.relations.map((relation, number) => <figure key={number}><blockquote>{relation.quote}</blockquote><figcaption>{t(relation.kind)} · {relation.pageNumber ? t("Page {{page}}", { page: relation.pageNumber }) : t("Indexed source")} · {relation.chunkId}</figcaption></figure>)}</>}
      <h4>{t("Source passages")}</h4>{paper.passages.length ? paper.passages.map(passage => <figure key={passage.id}><blockquote>{passage.text}</blockquote><figcaption>{passage.pageNumber ? t("Page {{page}}", { page: passage.pageNumber }) : t("Indexed source")} · {passage.id}</figcaption></figure>) : <p>{t("No source passage available. Verify the original paper.")}</p>}
    </div></details>)}
  </div>;
}
