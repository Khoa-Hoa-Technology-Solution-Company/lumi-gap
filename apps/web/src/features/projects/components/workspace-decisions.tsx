import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { SaveWorkspaceDecision, WorkspaceDecision } from "@trend/shared-types";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { canLeaveWorkspace, projectSectionHref, useUnsavedWorkspace, WorkspaceArtifactLink, WorkspaceArtifactPicker, WorkspaceDate, WorkspaceEmpty, WorkspaceError, WorkspaceHistory, WorkspaceLoading, WorkspacePager } from "./workspace-common";

export function WorkspaceDecisions({ projectId, readOnly, fromThread }: { projectId: string; readOnly: boolean; fromThread: string | null }) {
  const { t } = useI18n(); const [editing, setEditing] = useState<WorkspaceDecision | "new" | null>(fromThread && !readOnly ? "new" : null); const [q, setQ] = useState(""); const [draftQ, setDraftQ] = useState(""); const [page, setPage] = useState(1);
  const query = { q, page }; const decisions = useWorkspaceResource(projectId, "decisions", () => workspaceApi.decisions(projectId, query), query);
  return <section className="coord-decisions"><div className="coord-section-title"><p className="coord-muted">{t("Keep the context, alternatives and reasoning behind research choices.")}</p>{!readOnly && <Button size="sm" variant="outline" onClick={() => { if (canLeaveWorkspace()) setEditing("new"); }}><Plus className="mr-2 h-4 w-4" />{t("Record decision")}</Button>}</div>
    <p className="coord-footnote">{t("Decisions record team reasoning. They do not replace formal academic review.")}</p>
    {editing && <DecisionEditor key={editing === "new" ? `new:${fromThread}` : `${editing.id}:${editing.version}`} projectId={projectId} decision={editing === "new" ? undefined : editing} fromThread={fromThread} onClose={() => setEditing(null)} />}
    <form className="coord-search" onSubmit={e => { e.preventDefault(); setQ(draftQ.trim()); setPage(1); }}><input type="search" aria-label={t("Search decisions")} placeholder={t("Search decisions…")} value={draftQ} maxLength={200} onChange={e => setDraftQ(e.target.value)} /><Button size="sm" variant="ghost">{t("Search")}</Button>{q && <Button type="button" size="sm" variant="ghost" onClick={() => { setQ(""); setDraftQ(""); setPage(1); }}>{t("Reset")}</Button>}</form>
    {decisions.isLoading ? <WorkspaceLoading /> : decisions.isError ? <WorkspaceError error={decisions.error} retry={() => void decisions.refetch()} /> : !decisions.data?.items.length ? <WorkspaceEmpty title={t("Keep the reason behind each decision")}><p>{t("Record why a paper was excluded, a question changed or a gap was not selected.")}</p></WorkspaceEmpty> : <ol className="coord-decision-list">{decisions.data.items.map(decision => <li key={decision.id}><article><header><h3>{decision.decision}</h3><p>{t("Recorded by")} {decision.recordedBy.name} · <WorkspaceDate value={decision.createdAt} /> · {t("Version {{version}}", { version: decision.version })}</p></header><dl>{([["Context", decision.context], ["Alternatives considered", decision.alternatives], ["Rationale", decision.rationale]] as const).map(([label, value]) => value && <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl><div className="coord-provenance"><WorkspaceArtifactLink projectId={projectId} link={decision.link} />{decision.threadId && <Link className="coord-inline-link" to={projectSectionHref(projectId, "chat", { discussion: decision.threadId })}>{t("Source discussion")}</Link>}{!readOnly && <Button size="sm" variant="ghost" onClick={() => { if (canLeaveWorkspace()) setEditing(decision); }}>{t("Revise decision")}</Button>}</div><DecisionHistory projectId={projectId} decisionId={decision.id} /></article></li>)}</ol>}
    <WorkspacePager data={decisions.data} page={page} onPage={setPage} />
  </section>;
}
function DecisionEditor({ projectId, decision, fromThread, onClose }: { projectId: string; decision?: WorkspaceDecision; fromThread: string | null; onClose: () => void }) {
  const { t } = useI18n(); const [clientKey] = useState(() => crypto.randomUUID()); const initial: SaveWorkspaceDecision = { decision: decision?.decision ?? "", context: decision?.context ?? "", alternatives: decision?.alternatives ?? "", rationale: decision?.rationale ?? "", threadId: decision?.threadId ?? fromThread, link: decision?.link ?? null, ...(!decision ? { clientKey } : {}) };
  const [form, setForm] = useState(initial); const [threadSearch, setThreadSearch] = useState(""); const [page, setPage] = useState(1); const [saved, setSaved] = useState(false); const busy = useRef(false);
  const threads = useWorkspaceResource(projectId, "discussions", () => workspaceApi.discussions(projectId, { q: threadSearch, page }), { q: threadSearch, page });
  const save = useWorkspaceCommand(projectId, () => workspaceApi.saveDecision(projectId, { ...form, ...(decision ? { expectedVersion: decision.version } : {}) }, decision?.id));
  useUnsavedWorkspace(!saved && JSON.stringify(form) !== JSON.stringify(initial));
  return <form className="coord-editor" onSubmit={async e => { e.preventDefault(); if (busy.current) return; busy.current = true; try { await save.mutateAsync(); setSaved(true); onClose(); } catch { /* Keep the research rationale after failure. */ } finally { busy.current = false; } }}><h3>{t(decision ? "Revise decision" : "Record decision")}</h3><fieldset className="coord-field-stack" disabled={save.isPending}>
    <label>{t("Decision")}<textarea rows={2} required maxLength={500} value={form.decision} onChange={e => setForm({ ...form, decision: e.target.value })} /></label>
    <label>{t("Context")}<textarea rows={3} maxLength={10000} value={form.context} onChange={e => setForm({ ...form, context: e.target.value })} /></label>
    <label>{t("Alternatives considered")}<textarea rows={3} maxLength={10000} value={form.alternatives} onChange={e => setForm({ ...form, alternatives: e.target.value })} /></label>
    <label>{t("Rationale")}<textarea rows={4} required maxLength={10000} value={form.rationale} onChange={e => setForm({ ...form, rationale: e.target.value })} /></label>
    <label>{t("Source discussion, optional")}<input type="search" aria-label={t("Find a source discussion")} value={threadSearch} onChange={e => { setThreadSearch(e.target.value); setPage(1); }} maxLength={200} /><select value={form.threadId ?? ""} onChange={e => setForm({ ...form, threadId: e.target.value || null })}><option value="">{t("No source discussion")}</option>{form.threadId && !threads.data?.items.some(thread => thread.id === form.threadId) && <option value={form.threadId}>{t("Current source discussion")}</option>}{threads.data?.items.map(thread => <option key={thread.id} value={thread.id}>{thread.title}</option>)}</select><WorkspacePager data={threads.data} page={page} onPage={setPage} /></label>
    <WorkspaceArtifactPicker projectId={projectId} value={form.link} onChange={link => setForm({ ...form, link })} />
    </fieldset>{save.error && <WorkspaceError error={save.error} />}<div className="coord-form-actions"><Button type="button" variant="ghost" onClick={() => { if (canLeaveWorkspace()) onClose(); }}>{t("Cancel")}</Button><Button disabled={save.isPending || !form.decision.trim() || !form.rationale.trim()}>{t("Save decision")}</Button></div>
  </form>;
}
function DecisionHistory({ projectId, decisionId }: { projectId: string; decisionId: string }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false); const [page, setPage] = useState(1);
  const history = useWorkspaceResource(projectId, "decision-history", () => workspaceApi.history(projectId, "decisions", decisionId, page), { decisionId, page }, open);
  return <details className="coord-history-panel" onToggle={e => setOpen(e.currentTarget.open)}><summary>{t("Decision history")}</summary>{history.isLoading ? <WorkspaceLoading /> : history.isError ? <WorkspaceError error={history.error} retry={() => void history.refetch()} /> : <WorkspaceHistory items={history.data?.items ?? []} />}<WorkspacePager data={history.data} page={page} onPage={setPage} /></details>;
}
