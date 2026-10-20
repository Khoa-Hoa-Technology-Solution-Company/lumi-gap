import { useState } from "react";
import { Link } from "react-router-dom";
import type { AnalyzeGapRequest, ProjectSynthesis, SynthesisContent } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { canLeaveWorkspace, useUnsavedWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";

export function useProjectSynthesis(projectId: string) {
  return useResearchResource(projectId, ["synthesis"], () => researchApi.synthesis(projectId), true, data => data?.status === "QUEUED");
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
      {value.stale && <p role="alert" className="research-notice">{t("Evidence or source eligibility changed. Refresh the source selection and review this synthesis again.")}</p>}
      {value.errorMessage && <p role="alert">{t(value.errorMessage)}</p>}
      {labels.map(([key, label]) => value[key] && <section key={key} className="synthesis-section"><h3>{t(label)}</h3><p>{value[key]}</p></section>)}
      <SynthesisSources projectId={projectId} value={value} />
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
