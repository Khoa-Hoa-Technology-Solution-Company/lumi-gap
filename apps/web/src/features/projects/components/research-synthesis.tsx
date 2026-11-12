import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AnalyzeGapRequest, ProjectSynthesis, SynthesisContent, SynthesisSource } from "@trend/shared-types";
import { Check, Copy, FileCode2, Scale, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { canLeaveWorkspace, useUnsavedWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";

export function useProjectSynthesis(projectId: string) {
  return useResearchResource(projectId, ["synthesis"], () => researchApi.synthesis(projectId), true, data => data?.status === "QUEUED");
}

function buildSourceCiteKey(source: SynthesisSource, index: number): string {
  const firstWord =
    (source.sourceTitle || "source")
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "study";
  return `${firstWord}_ref${index + 1}`;
}

function replaceBracketsWithLatexCite(text: string, sources: SynthesisSource[]): string {
  if (!text) return "";
  return text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const idx = Number.parseInt(numStr, 10) - 1;
    const source = sources[idx];
    if (!source) return match;
    return `\\cite{${buildSourceCiteKey(source, idx)}}`;
  });
}

const labels = [["commonFindings", "Shared findings"], ["contradictions", "Differences and contradictions"], ["openQuestions", "Unresolved questions"]] as const;
const statuses = { DRAFT: "Awaiting human review", ACCEPTED: "Human accepted", QUEUED: "Preparing synthesis…", FAILED: "Synthesis interrupted" } as const;
export function ResearchSynthesis({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const { t } = useI18n();
  const view = useProjectSynthesis(projectId);
  const [editing, setEditing] = useState(false), [rationale, setRationale] = useState("");
  const [reviewVersion, setReviewVersion] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useResearchResource(projectId, ["synthesis-history"], () => researchApi.synthesisHistory(projectId), historyOpen);
  const command = useResearchCommand(projectId);
  useUnsavedWorkspace(Boolean(rationale));
  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  const value = view.data;
  return <section className="research-synthesis"><header className="research-heading"><div><h2>{t("Cross-paper synthesis")}</h2><p>{t("Compare reviewed findings before proposing a research gap.")}</p></div>{!readOnly && value?.status !== "QUEUED" && !editing && <Button variant="outline" onClick={() => setEditing(true)}>{t(value ? "Revise synthesis" : "Prepare synthesis")}</Button>}</header>
    {editing ? <SynthesisEditor projectId={projectId} value={value ?? null} onClose={() => setEditing(false)} /> : value ? <>
      <p role="status" className="research-help">{t(statuses[value.status])} · v{value.version} · {t(value.origin === "AI_SUGGESTED" ? "AI-suggested draft" : "Team synthesis")}</p>
      {value.status === "DRAFT" && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5 my-2">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Human Review Required:</strong> This synthesis is currently a draft. Verify every cited claim against original source passages and methodology conditions before accepting it for gap discovery or manuscript export.
          </div>
        </div>
      )}
      {value.stale && <p role="alert" className="research-notice">{t("Evidence or source eligibility changed. Refresh the source selection and review this synthesis again.")}</p>}
      {value.errorMessage && <p role="alert">{t(value.errorMessage)}</p>}
      {labels.map(([key, label]) => value[key] && <section key={key} className="synthesis-section"><h3>{t(label)}</h3><p>{value[key]}</p></section>)}
      <SynthesisSources projectId={projectId} value={value} />
      <SynthesisComparisonAndLatex projectId={projectId} value={value} />
      {value.rationale && <p className="research-help">{t("Review rationale")}: {value.rationale}</p>}
      {!readOnly && value.status === "DRAFT" && !value.stale && <form className="research-form" onSubmit={async event => { event.preventDefault(); try { await command.mutateAsync(() => researchApi.acceptSynthesis(projectId, { expectedVersion: reviewVersion ?? value.version, rationale })); setRationale(""); setReviewVersion(null); } catch { /* Keep the review. */ } }}><label>{t("Review rationale")}<Input value={rationale} maxLength={2000} onChange={event => { setReviewVersion(version => version ?? value.version); setRationale(event.target.value); }} placeholder={t("What did the team check against the sources?")} /></label><Button className="justify-self-start" disabled={command.isPending || rationale.trim().length < 3}>{t("Accept synthesis")}</Button></form>}
      {value.status === "ACCEPTED" && !value.stale && <Button asChild><Link to={`/projects/${projectId}?tab=gaps&research=gaps`}>{t("Continue to gap analysis")}</Link></Button>}
    </> : <div className="research-empty"><h3>{t("Bring reviewed evidence together")}</h3><p>{t("Select accepted extractions from at least three relevant papers. Write a synthesis or ask AI for a draft, then review it.")}</p><Button variant="outline" asChild><Link to={`/projects/${projectId}?tab=gaps&research=evidence`}>{t("Review evidence first")}</Link></Button></div>}
    {command.isError && <WorkspaceError error={command.error} />}
    {value && <details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>{t("Synthesis history")}</summary>{history.isError && <WorkspaceError error={history.error} />}{history.data?.map(row => <details key={row.version}><summary>v{row.version} · {t(statuses[row.status])} · {new Date(row.createdAt).toLocaleString()}</summary>{labels.map(([key, label]) => row[key] && <div key={key} className="synthesis-section"><h3>{t(label)}</h3><p>{row[key]}</p></div>)}</details>)}</details>}
  </section>;
}

function SynthesisSources({ projectId, value }: { projectId: string; value: ProjectSynthesis }) {
  const { t } = useI18n();
  return <details className="synthesis-sources"><summary>{t("Pinned source evidence")} · {value.sources.length}</summary><ol>{value.sources.map((source, index) => <li key={source.id} value={index + 1}>
    <Link to={`/projects/${projectId}?tab=gaps&research=evidence&evidence=${source.id}`}>[{index + 1}] {source.sourceTitle}</Link><p>{source.claim}</p><small>v{source.version}{source.locator ? ` · ${source.locator}` : ""}</small>
  </li>)}</ol></details>;
}

function SynthesisComparisonAndLatex({ projectId, value }: { projectId: string; value: ProjectSynthesis }) {
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);

  const latexBlock = useMemo(() => {
    const lines: string[] = [
      `% LumiGap Literature Synthesis (v${value.version} - ${value.status})`,
      "\\section{Literature Review and Cross-Paper Synthesis}",
    ];
    if (value.commonFindings) {
      lines.push(
        "\\subsection{Shared Findings}",
        replaceBracketsWithLatexCite(value.commonFindings, value.sources)
      );
    }
    if (value.contradictions) {
      lines.push(
        "\\subsection{Methodological Differences and Contradictions}",
        replaceBracketsWithLatexCite(value.contradictions, value.sources)
      );
    }
    if (value.openQuestions) {
      lines.push(
        "\\subsection{Research Gaps and Unanswered Questions}",
        replaceBracketsWithLatexCite(value.openQuestions, value.sources)
      );
    }
    return lines.join("\n\n");
  }, [value]);

  const bibtexBlock = useMemo(() => {
    return value.sources
      .map((s, idx) => {
        const key = buildSourceCiteKey(s, idx);
        const safeTitle = (s.sourceTitle || "Untitled Study").replace(/[{}]/g, "");
        return `@misc{${key},\n  title = {${safeTitle}},\n  note = {Pinned Evidence v${s.version}${s.locator ? `, Locator: ${s.locator}` : ""}}\n}`;
      })
      .join("\n\n");
  }, [value.sources]);

  const copySnippet = async (text: string, label: string, setFlag: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlag(true);
      toast.success(label);
      setTimeout(() => setFlag(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  if (!value.sources.length) return null;

  return (
    <div className="space-y-3 my-3">
      {/* Methodology, Findings & Limitations Comparison Table */}
      <details className="rounded-xl border border-border/80 bg-card p-3.5 text-xs">
        <summary className="cursor-pointer font-semibold text-foreground flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <Scale className="h-4 w-4 text-indigo-500" />
            <span>Methodology, Findings & Limitations Comparison ({value.sources.length} pinned sources)</span>
          </span>
          <span className="text-[11px] text-muted-foreground">Expand ▾</span>
        </summary>
        <div className="mt-3 space-y-3 pt-3 border-t border-border/60">
          <p className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-amber-900 dark:text-amber-200 leading-relaxed">
            <strong>Comparability Note:</strong> When studies evaluate different datasets, populations, or experimental conditions, synthesize trade-offs in context rather than declaring a single method universally best.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-left">
                  <th className="p-2 font-bold text-muted-foreground">Ref</th>
                  <th className="p-2 font-bold text-muted-foreground">Source Paper</th>
                  <th className="p-2 font-bold text-muted-foreground">Methodology & Sample</th>
                  <th className="p-2 font-bold text-muted-foreground">Claim / Key Findings</th>
                  <th className="p-2 font-bold text-muted-foreground">Limitations</th>
                  <th className="p-2 font-bold text-muted-foreground">LaTeX Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {value.sources.map((source, idx) => {
                  const key = buildSourceCiteKey(source, idx);
                  return (
                    <tr key={source.id}>
                      <td className="p-2 font-bold align-top">[{idx + 1}]</td>
                      <td className="p-2 align-top">
                        <Link
                          to={`/projects/${projectId}?tab=papers&view=library&paper=${encodeURIComponent(source.paperId)}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {source.sourceTitle}
                        </Link>
                        {source.locator && (
                          <span className="block text-[11px] text-muted-foreground">
                            Locator: {source.locator}
                          </span>
                        )}
                      </td>
                      <td className="p-2 align-top text-muted-foreground">
                        {source.methodology || "Not specified"}
                        {source.population ? ` · Sample: ${source.population}` : ""}
                      </td>
                      <td className="p-2 align-top text-foreground">
                        {source.claim}
                        {source.results ? ` — ${source.results}` : ""}
                      </td>
                      <td className="p-2 align-top text-amber-800 dark:text-amber-300">
                        {source.limitations || "—"}
                      </td>
                      <td className="p-2 align-top font-mono text-[11px]">
                        \cite&#123;{key}&#125;
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      {/* LaTeX Manuscript Integration */}
      <details className="rounded-xl border border-border/80 bg-card p-3.5 text-xs">
        <summary className="cursor-pointer font-semibold text-foreground flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-emerald-600" />
            <span>LaTeX Manuscript Integration (\section + Traceable \cite&#123;&#125; & BibTeX)</span>
          </span>
          <span className="text-[11px] text-muted-foreground">Expand ▾</span>
        </summary>
        <div className="mt-3 space-y-3 pt-3 border-t border-border/60">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => void copySnippet(latexBlock, "Copied LaTeX synthesis section!", setCopiedLatex)}
            >
              {copiedLatex ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLatex ? "Copied LaTeX" : "Copy LaTeX \\section"}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => void copySnippet(bibtexBlock, "Copied BibTeX references!", setCopiedBibtex)}
            >
              {copiedBibtex ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedBibtex ? "Copied BibTeX" : "Copy BibTeX Entries"}</span>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
              <Link to={`/projects/${encodeURIComponent(projectId)}?tab=manuscripts`}>
                Open LaTeX Manuscript Editor →
              </Link>
            </Button>
          </div>
          <pre className="max-h-48 overflow-auto rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {latexBlock}
          </pre>
        </div>
      </details>
    </div>
  );
}

function SynthesisEditor({ projectId, value, onClose }: { projectId: string; value: ProjectSynthesis | null; onClose: () => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [baseVersion] = useState(value?.version ?? 0);
  const [selected, setSelected] = useState(() => value?.stale ? [] : value?.sources.map(source => ({ id: source.id, version: source.version, paperId: source.paperId, title: source.sourceTitle, claim: source.claim })) ?? []);
  const [content, setContent] = useState<SynthesisContent>(() => ({ commonFindings: value?.commonFindings ?? "", contradictions: value?.contradictions ?? "", openQuestions: value?.openQuestions ?? "" }));
  const [dirty, setDirty] = useState(false);
  useUnsavedWorkspace(dirty);
  const command = useResearchCommand(projectId);
  const evidence = useResearchResource(projectId, ["synthesis-evidence", query, page], () => researchApi.evidence(projectId, { state: "ACCEPTED", q: query, page, pageSize: 20 }));
  const paperCount = new Set(selected.map(item => item.paperId)).size;
  const eligible = paperCount >= 3 && paperCount <= 10 && selected.length <= 30;
  const payload = { expectedVersion: baseVersion, evidence: selected.map(item => ({ id: item.id, version: item.version })) };
  const changeSelection = async (next: typeof selected) => {
    if (dirty && Object.values(content).some(value => value.trim()) && !(await canLeaveWorkspace())) return;
    setSelected(next); setContent({ commonFindings: "", contradictions: "", openQuestions: "" }); setDirty(true);
  };
  const run = async (ai: boolean) => {
    if (ai && dirty && Object.values(content).some(value => value.trim()) && !(await canLeaveWorkspace())) return;
    try { await command.mutateAsync(() => ai ? researchApi.generateSynthesis(projectId, payload) : researchApi.saveSynthesis(projectId, { ...payload, ...content })); setDirty(false); onClose(); } catch { /* Retain selection and text. */ }
  };
  return <form className="research-form synthesis-editor" onSubmit={event => { event.preventDefault(); void run(false); }}>
    <h3>{t("Select accepted evidence")}</h3><p className="research-help">{t("Use 3–10 papers and up to 30 extractions. Source numbers follow the order below; changing sources clears the draft to keep citations accurate.")}</p>
    <Input type="search" value={query} maxLength={200} aria-label={t("Search accepted evidence")} placeholder={t("Search accepted evidence")} onChange={event => { setQuery(event.target.value); setPage(1); }} />
    {evidence.isLoading ? <WorkspaceLoading /> : evidence.isError ? <WorkspaceError error={evidence.error} retry={() => void evidence.refetch()} /> : <>
      <div className="synthesis-picker">{evidence.data?.items.map(item => <label key={item.id}><input type="checkbox" disabled={command.isPending || (selected.length >= 30 && !selected.some(source => source.id === item.id))} checked={selected.some(source => source.id === item.id)} onChange={event => void changeSelection(event.target.checked ? [...selected, { id: item.id, version: item.version, paperId: item.paperId, title: item.sourceTitle, claim: item.claim }] : selected.filter(source => source.id !== item.id))} /><span><strong>{item.sourceTitle}</strong><span>{item.claim} · v{item.version}</span></span></label>)}</div>
      {!evidence.data?.items.length && <p>{t("No accepted evidence matches. Extract and review evidence from relevant papers first.")}</p>}
      <div className="research-pagination"><Button type="button" variant="ghost" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t("Previous")}</Button><span>{t("Page {{page}}", { page })}</span><Button type="button" variant="ghost" disabled={!evidence.data?.hasNext} onClick={() => setPage(value => value + 1)}>{t("Next")}</Button></div>
    </>}
    <p role="status" className="research-help">{t("{{count}} papers selected", { count: paperCount })}</p>
    {selected.length > 0 && <ol className="synthesis-selected">{selected.map((source, index) => <li key={source.id}>[{index + 1}] {source.title} · v{source.version}<Button type="button" size="sm" variant="ghost" disabled={command.isPending} onClick={() => void changeSelection(selected.filter(item => item.id !== source.id))}>{t("Remove")}</Button></li>)}</ol>}
    <p className="research-help">{t("Cite your sources as [1], [2]. Leave sections empty when the evidence does not support a conclusion.")}</p>
    {labels.map(([key, label]) => <label key={key}>{t(label)}<textarea value={content[key]} maxLength={10000} rows={3} disabled={command.isPending} onChange={event => { setContent(value => ({ ...value, [key]: event.target.value })); setDirty(true); }} /></label>)}
    {command.isError && <WorkspaceError error={command.error} />}
    <div className="research-actions"><Button type="submit" disabled={command.isPending || !eligible || !Object.values(content).some(value => value.trim())}>{t("Save synthesis draft")}</Button><Button type="button" variant="outline" disabled={command.isPending || !eligible} onClick={() => void run(true)}>{t("Draft with AI · 20 credits")}</Button><Button type="button" variant="ghost" disabled={command.isPending} onClick={async () => { if (await canLeaveWorkspace()) onClose(); }}>{t("Cancel")}</Button></div>
  </form>;
}

export function ProjectGapAnalysisForm({ projectId, defaultTopic, isAnalyzing, onAnalyze }: { projectId: string; defaultTopic?: string; isAnalyzing: boolean; onAnalyze: (value: AnalyzeGapRequest) => void }) {
  const { t } = useI18n(); const view = useProjectSynthesis(projectId);
  const [topic, setTopic] = useState(defaultTopic ?? "");
  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  const value = view.data;
  if (!value || value.status !== "ACCEPTED" || value.stale) return <div className="research-notice"><h4>{t("Review the synthesis before finding gaps")}</h4><p>{t("Gap analysis uses accepted source evidence and a current, human-reviewed cross-paper synthesis.")}</p><Button variant="outline" asChild><Link to={`/projects/${projectId}?tab=gaps&research=synthesis`}>{t("Open synthesis")}</Link></Button></div>;
  const ids = [...new Set(value.sources.map(source => source.paperId))];
  return <form className="research-form synthesis-gap-form" onSubmit={event => { event.preventDefault(); onAnalyze({ projectId, topic: topic.trim(), synthesisRevisionId: value.revisionId, evidenceMode: "selected", selectedPaperIds: ids }); }}>
    <label>{t("Research topic")}<Input value={topic} minLength={3} maxLength={200} required onChange={event => setTopic(event.target.value)} /></label>
    <p className="research-help">{t("Using synthesis v{{version}} and {{count}} reviewed papers. No extra papers will be added.", { version: value.version, count: ids.length })}</p>
    <SynthesisSources projectId={projectId} value={value} />
    <Button className="justify-self-start" disabled={isAnalyzing || topic.trim().length < 3}>{t(isAnalyzing ? "Queuing analysis…" : "Find candidate gaps · 30 credits")}</Button>
  </form>;
}
