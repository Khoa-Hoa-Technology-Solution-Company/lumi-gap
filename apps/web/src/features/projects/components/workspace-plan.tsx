import { useRef, useState } from "react";
import type { PlanQuestion, ResearchPlanContent, ResearchPlanView, ResearchApproach, SaveResearchPlan } from "@trend/shared-types";
import { History, Save, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { gapsApi } from "@/features/gaps/api/gaps.api";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceOverview, useWorkspaceResource } from "../hooks/use-workspace";
import { approachLabels, canLeaveWorkspace, useUnsavedWorkspace, useWorkspaceSelection, WorkspaceArtifactLink, WorkspaceArtifactPicker, WorkspaceComments, WorkspaceDate, WorkspaceError, WorkspaceHeading, WorkspaceLoading, WorkspacePager } from "./workspace-common";

const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);
export function WorkspacePlanPanel({ projectId, mentor = false }: { projectId: string; mentor?: boolean }) {
  const { t } = useI18n(); const [revision, setRevision] = useWorkspaceSelection("revision"); const [historyOpen, setHistoryOpen] = useState(false);
  const plan = useWorkspaceResource(projectId, "plan", () => workspaceApi.plan(projectId, revision ?? undefined), revision);
  if (plan.isLoading) return <WorkspaceLoading />;
  if (!plan.data) return <WorkspaceError error={plan.error} retry={() => void plan.refetch()} />;
  const view = plan.data;
  return <div className="coord-plan" data-no-i18n><WorkspaceHeading title={t("Research plan")} description={t(mentor ? "Only the plan revision explicitly shared with you is visible here." : "Keep a working draft of the problem, questions and approach. Refine it as you learn.")} action={!mentor && <Button size="sm" variant="outline" onClick={() => setHistoryOpen(!historyOpen)} aria-expanded={historyOpen}><History className="mr-2 h-4 w-4" />{t("Version history")}</Button>} />
    <div className="coord-version-strip"><span>{t("Version {{version}}", { version: view.version })}</span><span>{t(view.access === "MENTOR" ? "Shared for feedback" : view.canEdit ? "Working draft" : view.archived ? "Archived, read only" : "Historical version")}</span>{revision && !mentor && <Button size="sm" variant="ghost" onClick={() => { if (canLeaveWorkspace()) setRevision(null); }}>{t("Back to current plan")}</Button>}</div>
    {historyOpen && !mentor && <PlanHistory projectId={projectId} onSelect={id => { if (canLeaveWorkspace()) setRevision(id); }} />}
    <PlanEditor key={`${projectId}:${revision ?? "current"}`} projectId={projectId} view={view} />
    {view.canShare && view.currentRevisionId && <PlanSharing projectId={projectId} revisionId={view.currentRevisionId} version={view.version} />}
    {view.currentRevisionId && <WorkspaceComments key={view.currentRevisionId} projectId={projectId} targetKind="PLAN_REVISION" targetId={view.currentRevisionId} readOnly={view.archived} mentor={view.access === "MENTOR"} />}
  </div>;
}
function PlanEditor({ projectId, view }: { projectId: string; view: ResearchPlanView }) {
  const { t } = useI18n(); const [content, setContent] = useState<ResearchPlanContent>(view.content); const [summary, setSummary] = useState(""); const [saved, setSaved] = useState(false); const [invalid, setInvalid] = useState(false);
  const [baseline, setBaseline] = useState(view);
  const busy = useRef(false); const save = useWorkspaceCommand(projectId, (data: SaveResearchPlan) => workspaceApi.savePlan(projectId, data));
  const dirty = JSON.stringify(content) !== JSON.stringify(baseline.content);
  useUnsavedWorkspace(dirty);
  const field = <K extends keyof ResearchPlanContent>(key: K, value: ResearchPlanContent[K]) => { setSaved(false); setContent(previous => ({ ...previous, [key]: value })); };
  if (!view.canEdit) return <PlanReader content={view.content} projectId={view.access === "TEAM" ? projectId : undefined} />;
  return <form className="coord-plan-form" onSubmit={async event => {
    event.preventDefault(); if (busy.current) return;
    const normalized = { ...content, objectives: lines(content.objectives.join("\n")), deliverables: lines(content.deliverables.join("\n")), inclusionCriteria: lines(content.inclusionCriteria.join("\n")), exclusionCriteria: lines(content.exclusionCriteria.join("\n")), questions: content.questions.filter(question => question.text.trim()).map(question => ({ ...question, text: question.text.trim() })) };
    if ([normalized.objectives, normalized.deliverables].some(items => items.length > 20 || items.some(item => item.length > 500)) || [normalized.inclusionCriteria, normalized.exclusionCriteria].some(items => items.length > 20 || items.some(item => item.length > 240))) { setInvalid(true); return; }
    setInvalid(false); busy.current = true;
    try { const result = await save.mutateAsync({ ...normalized, expectedVersion: baseline.version, changeSummary: summary }); setContent(normalized); setBaseline({ ...view, content: normalized, version: result.version, currentRevisionId: result.revisionId }); setSaved(true); } catch { /* Preserve the draft after validation or version conflicts. */ } finally { busy.current = false; }
  }}>
    {view.version !== baseline.version && <div role="status" className="coord-share-notice"><p>{t("A newer version is available. Your draft has been kept.")}</p><Button type="button" size="sm" variant="outline" onClick={() => { if (!dirty || canLeaveWorkspace()) { setContent(view.content); setBaseline(view); setSaved(false); } }}>{t("Load latest version")}</Button></div>}
    <fieldset disabled={save.isPending}>
      <section className="coord-plan-section"><div><h3>{t("Direction")}</h3><p>{t("A partial draft is enough to begin.")}</p></div><div className="coord-field-stack">
        <label>{t("Research approach")}<select value={content.approach} onChange={e => field("approach", e.target.value as ResearchApproach)}>{Object.entries(approachLabels).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}</select></label>
        <label>{t("Research problem")}<textarea rows={4} maxLength={5000} value={content.problem} onChange={e => field("problem", e.target.value)} placeholder={t("What problem are you investigating, and why does it matter?")} /></label>
        <label>{t("Objectives")}<textarea rows={3} value={content.objectives.join("\n")} onChange={e => field("objectives", e.target.value.split("\n"))} placeholder={t("One objective per line")} /><small>{t("Up to 20 items, 500 characters each.")}</small></label>
        <div className="coord-questions"><span className="coord-label">{t("Research questions")}</span>{content.questions.map((question, index) => <div className="coord-question" key={question.id}><div className="coord-question-content"><label><span>{t("Question {{number}}", { number: index + 1 })}</span><textarea rows={2} maxLength={1000} value={question.text} onChange={e => field("questions", content.questions.map(item => item.id === question.id ? { ...item, text: e.target.value } : item))} /></label><QuestionSources projectId={projectId} question={question} onChange={next => field("questions", content.questions.map(item => item.id === question.id ? next : item))} /></div><Button type="button" size="icon" variant="ghost" aria-label={t("Remove question {{number}}", { number: index + 1 })} onClick={() => field("questions", content.questions.filter(item => item.id !== question.id))}><X size={16} /></Button></div>)}<Button size="sm" type="button" variant="outline" disabled={content.questions.length >= 20} onClick={() => field("questions", [...content.questions, { id: crypto.randomUUID(), text: "" }])}>{t("Add research question")}</Button></div>
        <label>{t("Scope")}<textarea rows={3} maxLength={5000} value={content.scope} onChange={e => field("scope", e.target.value)} placeholder={t("Define the population, context or boundaries of the research.")} /></label>
      </div></section>
      <section className="coord-plan-section"><div><h3>{t("Research method")}</h3><p>{t("Changing the approach keeps everything you have written.")}</p></div><div className="coord-field-stack">
        <label>{t("Methodology")}<textarea rows={5} maxLength={20000} value={content.methodology} onChange={e => field("methodology", e.target.value)} /></label>
        <details open={content.approach === "LITERATURE_REVIEW" || undefined}><summary>{t("Literature search and study criteria")}</summary><div className="coord-field-stack">
          <label>{t("Search strategy")}<textarea rows={4} maxLength={5000} value={content.searchStrategy} onChange={e => field("searchStrategy", e.target.value)} placeholder={t("Databases, search terms and discovery strategy")} /></label>
          <div className="coord-form-pair"><label>{t("Inclusion criteria")}<textarea rows={4} value={content.inclusionCriteria.join("\n")} onChange={e => field("inclusionCriteria", e.target.value.split("\n"))} /><small>{t("One criterion per line, up to 20 items of 240 characters.")}</small></label><label>{t("Exclusion criteria")}<textarea rows={4} value={content.exclusionCriteria.join("\n")} onChange={e => field("exclusionCriteria", e.target.value.split("\n"))} /></label></div>
        </div></details>
      </div></section>
      <section className="coord-plan-section"><div><h3>{t("Expected outputs")}</h3><p>{t("Describe what your team hopes to produce.")}</p></div><label>{t("Deliverables")}<textarea rows={3} value={content.deliverables.join("\n")} onChange={e => field("deliverables", e.target.value.split("\n"))} placeholder={t("One deliverable per line")} /></label></section>
      <div className="coord-save-area"><label>{t("Revision note, optional")}<input value={summary} maxLength={500} onChange={e => setSummary(e.target.value)} placeholder={t("What changed and why?")} /></label>{save.isError && <WorkspaceError error={save.error} />}
        {invalid && <p role="alert" className="coord-overdue">{t("Use at most 20 items per list, 500 characters per objective or output, and 240 per criterion.")}</p>}
        <div className="coord-form-actions"><p role="status">{t(save.isPending ? "Saving…" : dirty ? "Unsaved changes" : saved ? "Research plan saved" : "All changes saved")}</p><Button type="submit" disabled={save.isPending || !dirty}><Save className="mr-2 h-4 w-4" />{t("Save research plan")}</Button></div>
        <p className="coord-footnote">{t("Saving a plan records a working revision. It is not formal academic approval.")}</p>
      </div>
    </fieldset>
  </form>;
}
function QuestionSources({ projectId, question, onChange }: { projectId: string; question: PlanQuestion; onChange: (question: PlanQuestion) => void }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false);
  const evidence = useWorkspaceResource(projectId, "question-evidence", () => gapsApi.evidence(question.sourceGapId!), question.sourceGapId, open && Boolean(question.sourceGapId));
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>{t("Question sources, optional")}{question.sourceGapId ? ` · ${t("Source linked")}` : ""}</summary>
    {open && <><WorkspaceArtifactPicker key={question.sourceGapId ?? "none"} projectId={projectId} value={question.sourceGapId ? { kind: "GAP", id: question.sourceGapId } : null} allowedKinds={["GAP"]} onChange={link => { const { sourceGapId: _gap, evidenceIds: _evidence, ...base } = question; onChange(link ? { ...base, sourceGapId: link.id } : base); }} />
      {question.sourceGapId && <fieldset className="coord-question-evidence"><legend>{t("Evidence informing this question")}</legend>{evidence.isLoading ? <WorkspaceLoading /> : evidence.isError ? <WorkspaceError error={evidence.error} retry={() => void evidence.refetch()} /> : evidence.data?.length ? evidence.data.map(item => <label key={item.id}><input type="checkbox" checked={question.evidenceIds?.includes(item.id) ?? false} disabled={!question.evidenceIds?.includes(item.id) && (question.evidenceIds?.length ?? 0) >= 30} onChange={event => onChange({ ...question, evidenceIds: event.target.checked ? [...(question.evidenceIds ?? []), item.id] : question.evidenceIds?.filter(id => id !== item.id) })} /><span><strong>{t(item.evidenceKind === "COUNTER" ? "Counterevidence" : "Supporting evidence")}</strong> · {item.paperId?.title}<small>{item.explanation}</small></span></label>) : <p className="coord-muted">{t("No evidence records linked to this gap yet.")}</p>}</fieldset>}
      <p className="coord-footnote">{t("Linking sources records your reasoning. It does not validate a gap or approve a research question.")}</p></>}
  </details>;
}
function PlanReader({ content, projectId }: { content: ResearchPlanContent; projectId?: string }) {
  const { t } = useI18n(); const entries: Array<[string, string | string[]]> = [["Research approach", t(approachLabels[content.approach])], ["Research problem", content.problem], ["Objectives", content.objectives], ["Research questions", content.questions.map(item => item.text)], ["Scope", content.scope], ["Methodology", content.methodology], ["Search strategy", content.searchStrategy], ["Inclusion criteria", content.inclusionCriteria], ["Exclusion criteria", content.exclusionCriteria], ["Deliverables", content.deliverables]];
  return <dl className="coord-plan-reader">{entries.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{Array.isArray(value) ? value.length ? <ol>{value.map((line, index) => <li key={index}>{line}{label === "Research questions" && projectId && content.questions[index]?.sourceGapId && <WorkspaceArtifactLink projectId={projectId} link={{ kind: "GAP", id: content.questions[index]!.sourceGapId! }} />}</li>)}</ol> : <span className="coord-muted">{t("Not drafted yet")}</span> : value || <span className="coord-muted">{t("Not drafted yet")}</span>}</dd></div>)}</dl>;
}
function PlanHistory({ projectId, onSelect }: { projectId: string; onSelect: (revision: string) => void }) {
  const { t } = useI18n(); const [page, setPage] = useState(1); const history = useWorkspaceResource(projectId, "plan-history", () => workspaceApi.planHistory(projectId, page), page);
  return <section className="coord-history-panel"><h3>{t("Version history")}</h3>{history.isLoading ? <WorkspaceLoading /> : history.isError ? <WorkspaceError error={history.error} retry={() => void history.refetch()} /> : <ul className="coord-action-list">{history.data?.items.map(item => <li key={item.id}><button type="button" onClick={() => onSelect(item.id)}><span><strong>{t("Version {{version}}", { version: item.version })} · {item.changedBy?.name ?? t("Imported research plan")}</strong><small>{item.changeSummary || t("Working revision")}</small></span><WorkspaceDate value={item.createdAt} /></button></li>)}</ul>}<WorkspacePager data={history.data} page={page} onPage={setPage} /></section>;
}
function PlanSharing({ projectId, revisionId, version }: { projectId: string; revisionId: string; version: number }) {
  const { t } = useI18n(); const overview = useWorkspaceOverview(projectId); const [relationshipId, setRelationshipId] = useState("");
  const shares = useWorkspaceResource(projectId, "plan-shares", () => workspaceApi.shares(projectId));
  const share = useWorkspaceCommand(projectId, (relationship: string) => workspaceApi.share(projectId, { revisionId, relationshipId: relationship }));
  const revoke = useWorkspaceCommand(projectId, (id: string) => workspaceApi.revokeShare(projectId, id));
  const active = shares.data?.filter(item => !item.revokedAt) ?? [];
  return <details className="coord-sharing"><summary><Share2 size={16} aria-hidden="true" />{t("Mentor access")}</summary><p>{t("Share this specific revision for feedback. Later edits stay private until you share them.")}</p>
    {overview.data?.mentors.length ? <form className="coord-share-form" onSubmit={e => { e.preventDefault(); if (relationshipId && !share.isPending) share.mutate(relationshipId); }}><label>{t("Active mentor")}<select value={relationshipId} onChange={e => setRelationshipId(e.target.value)} required><option value="">{t("Choose a mentor")}</option>{overview.data.mentors.map(mentor => <option key={mentor.relationshipId} value={mentor.relationshipId}>{mentor.name}</option>)}</select></label><Button size="sm" disabled={!relationshipId || share.isPending}>{t("Share version {{version}}", { version })}</Button></form> : <p className="coord-muted">{t("Connect an active mentor in Academic Support before sharing a plan.")}</p>}
    {(share.error || revoke.error || shares.error) && <WorkspaceError error={share.error || revoke.error || shares.error} />}
    <ul className="coord-share-list">{active.map(item => <li key={item.id}><span>{item.mentor.name} · {t("Version {{version}}", { version: item.version })}</span><Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(item.id)}>{t("Revoke access")}</Button></li>)}</ul><p className="coord-footnote">{t("Revoking access stops future reads and comments. Existing research history is kept.")}</p>
  </details>;
}
