import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useSearchParams } from "react-router-dom";
import type { ResearchPlanView } from "@trend/shared-types";
import { Check, History, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { usePlanDraft } from "../hooks/use-plan-draft";
import { canLeaveWorkspace, projectSectionHref, useUnsavedWorkspace, WorkspaceComments, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import { PlanDocument } from "./plan-document";
import { PlanConflict, ProjectReadme } from "./project-readme";
import { PlanHistory, PlanSharing } from "./plan-history-panel";
import "../research-plan.css";

export function WorkspacePlanPanel({ projectId, mentor = false }: { projectId: string; mentor?: boolean }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const revision = params.get("revision");
  const plan = useWorkspaceResource(projectId, "plan", () => workspaceApi.plan(projectId, revision ?? undefined), revision);
  if (plan.isLoading) return <WorkspaceLoading />;
  if (mentor && isAxiosError(plan.error) && plan.error.response?.data?.error?.message === "No research plan has been shared with you") return <div className="space-y-3 rounded-lg border border-dashed p-6" role="status" data-no-i18n><h2 className="text-lg font-semibold">{t("No shared plan yet")}</h2><p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("Ask the team leader to create a plan version and share it with your mentoring role. Their working draft remains private until shared.")}</p><Button variant="outline" size="sm" onClick={() => void plan.refetch()}>{t("Check for a shared plan")}</Button></div>;
  if (!plan.data || plan.isError) return <WorkspaceError error={plan.error} retry={() => void plan.refetch()} />;
  if (!mentor && !params.has("question")) return <ProjectReadme key={`${projectId}:${revision ?? "draft"}`} projectId={projectId} view={plan.data} />;
  return <LivingPlan key={`${projectId}:${revision ?? "draft"}`} projectId={projectId} mentor={mentor} view={plan.data} revision={revision} onRevision={async (id, saved = false) => {
    if (!saved && !(await canLeaveWorkspace())) return;
    const next = new URLSearchParams(params); if (id) next.set("revision", id); else next.delete("revision"); setParams(next, { replace: true });
  }} />;
}

function LivingPlan({ projectId, mentor, view, revision, onRevision }: { projectId: string; mentor: boolean; view: ResearchPlanView; revision: string | null; onRevision: (id: string | null, saved?: boolean) => void }) {
  const { t } = useI18n();
  const state = usePlanDraft(projectId, view);
  const [editing, setEditing] = useState(state.recovered), [finishing, setFinishing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false), [snapshotOpen, setSnapshotOpen] = useState(false), [note, setNote] = useState("");
  const [snapshotError, setSnapshotError] = useState<unknown>(null), [snapshotBusy, setSnapshotBusy] = useState(false);
  const snapshotAttempt = useRef<{ expectedVersion: number; clientKey: string; changeSummary: string } | null>(null);
  useUnsavedWorkspace(Boolean(note.trim()) || snapshotBusy);
  const snapshotId = revision ?? (mentor ? view.currentRevisionId : null);
  const currentContent = view.canEdit ? state.draft : view.content;
  const status = state.saving ? "Saving…" : state.error ? "Could not sync changes" : state.dirty ? "Changes waiting to sync" : view.archived ? "Archived, read only" : "Draft saved";
  const finishEditing = async () => {
    if (finishing) return;
    setFinishing(true);
    try { if (await state.flush()) setEditing(false); } finally { setFinishing(false); }
  };
  return <div className="coord-plan living-plan project-about" data-no-i18n>
    <header className="about-project-header">
      <span className="about-project-eyebrow">{t("About project")}</span>
      <h2>{view.projectTitle}</h2>
      <div className="about-project-toolbar">
        <div className="about-project-save-state">
          <span role="status" aria-live="polite">{t(snapshotId ? "Immutable version {{version}}" : status, { version: view.version })}</span>
          {editing && view.canEdit && <small>{t("Changes save automatically.")}</small>}
        </div>
        <div className="about-project-edit-actions">
          {Boolean(state.error) && !state.conflict && view.canEdit && <Button type="button" size="sm" variant="outline" disabled={state.saving} onClick={() => void state.retry()}>{t("Retry sync")}</Button>}
          {snapshotId && !mentor && <Button type="button" size="sm" variant="ghost" onClick={() => onRevision(null)}>{t("Back to current plan")}</Button>}
          {view.canEdit && <Button type="button" size="sm" variant={editing ? "default" : "outline"} disabled={finishing || (editing && (!state.valid || Boolean(state.conflict)))} onClick={() => editing ? void finishEditing() : setEditing(true)}>
            {editing ? <Check size={15} className="mr-2" aria-hidden="true" /> : <Pencil size={15} className="mr-2" aria-hidden="true" />}{t(finishing ? "Saving…" : editing ? "Done editing" : "Edit")}
          </Button>}
        </div>
      </div>
      {mentor && <p className="about-project-access-note">{t("Only the plan revision explicitly shared with you is visible here.")}</p>}
    </header>
    {state.recovered && <p role="status" className="mb-4 text-sm text-muted-foreground">{t("Recovered your unsynced draft from the expired session in this tab.")}</p>}
    {Boolean(state.error) && !state.conflict && view.canEdit && <WorkspaceError error={state.error} />}
    {!state.valid && view.canEdit && <p role="alert" className="text-sm text-destructive">{t("Use at most 20 items per list, 500 characters per objective or output, and 240 per criterion.")}</p>}
    {state.conflict && <PlanConflict conflict={state.conflict} draft={state.draft} onResolve={state.reconcile} />}
    <PlanDocument projectId={projectId} content={currentContent} editable={view.canEdit && editing} onEdit={view.canEdit ? () => setEditing(true) : undefined} revisionId={snapshotId ?? undefined} version={view.canEdit ? state.version : view.version} archived={view.archived} mentor={mentor} field={state.field} />
    {!mentor && <footer className="about-project-footer">
      <details className="about-project-versions"><summary>{t("Versions & mentor feedback")}</summary>
        <p>{t("Save a version when you want to share this introduction with a mentor.")}</p>
        <div className="living-plan-version-actions">
          <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}><History size={15} className="mr-2" />{t("Version history")}</Button>
          {view.canEdit && <Button type="button" size="sm" variant="outline" disabled={state.saving || !state.valid || Boolean(state.conflict)} onClick={async () => { if (await state.flush()) setSnapshotOpen(true); }}><Plus size={15} className="mr-2" />{t("Create version")}</Button>}
        </div>
      </details>
      <nav aria-label={t("Related research work")} className="living-plan-links">
        <Link to={projectSectionHref(projectId, "papers")}>{t("Literature")}</Link><Link to={projectSectionHref(projectId, "gaps")}>{t("Research gaps")}</Link><Link to={projectSectionHref(projectId, "manuscripts")}>{t("Manuscripts")}</Link>
      </nav>
    </footer>}
    {snapshotId && view.canShare && <PlanSharing projectId={projectId} revisionId={snapshotId} version={view.version} />}
    {snapshotId && <details className="living-plan-legacy"><summary>{t("Earlier general version comments")}</summary><WorkspaceComments key={snapshotId} projectId={projectId} targetKind="PLAN_REVISION" targetId={snapshotId} readOnly={view.archived} mentor={mentor} /></details>}
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto" closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("Version history")}</DialogTitle><DialogDescription>{t("Autosaves update the draft. Only created versions appear here.")}</DialogDescription></DialogHeader><PlanHistory projectId={projectId} current={view} onSelect={async id => { if (!(await canLeaveWorkspace())) return; setHistoryOpen(false); onRevision(id, true); }} /></DialogContent></Dialog>
    <Dialog open={snapshotOpen} onOpenChange={async open => { if (!snapshotBusy && (!note || open || (await canLeaveWorkspace()))) setSnapshotOpen(open); }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("Create version")}</DialogTitle><DialogDescription>{t("Capture the saved plan and its research questions for reference or mentor feedback. This is not academic approval.")}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (snapshotBusy) return;
        setSnapshotBusy(true); setSnapshotError(null);
        try {
          if (!snapshotAttempt.current) {
            if (!await state.flush()) return;
            snapshotAttempt.current = { expectedVersion: state.current.current.version, clientKey: crypto.randomUUID(), changeSummary: note.trim() };
          }
          const result = await workspaceApi.snapshotPlan(projectId, snapshotAttempt.current);
          snapshotAttempt.current = null; setNote(""); setSnapshotOpen(false); state.invalidate(); onRevision(result.revisionId, true);
        } catch (failure) { setSnapshotError(failure); const statusCode = (failure as { response?: { status: number } }).response?.status; if (statusCode && statusCode >= 400 && statusCode < 500) snapshotAttempt.current = null; }
        finally { setSnapshotBusy(false); }
      }}><label className="block space-y-2 text-sm">{t("Change note, optional")}<textarea className="project-form-textarea" rows={3} maxLength={500} value={note} disabled={snapshotBusy || Boolean(snapshotAttempt.current)} onChange={event => setNote(event.target.value)} placeholder={t("What changed and why?")} /></label>{Boolean(snapshotError) && <WorkspaceError error={snapshotError} />}<Button type="submit" disabled={snapshotBusy}>{t(snapshotBusy ? "Saving…" : "Create version")}</Button></form>
    </DialogContent></Dialog>
  </div>;
}
