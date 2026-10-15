import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ResearchPlanContent, ResearchPlanView } from "@trend/shared-types";
import { History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { planFields, usePlanDraft } from "../hooks/use-plan-draft";
import { canLeaveWorkspace, projectSectionHref, useUnsavedWorkspace, WorkspaceComments, WorkspaceError, WorkspaceHeading, WorkspaceLoading } from "./workspace-common";
import { PlanDocument } from "./plan-document";
import { PlanHistory, PlanSharing } from "./plan-history-panel";
import "../research-plan.css";

export function WorkspacePlanPanel({ projectId, mentor = false }: { projectId: string; mentor?: boolean }) {
  const [params, setParams] = useSearchParams();
  const revision = params.get("revision");
  const plan = useWorkspaceResource(projectId, "plan", () => workspaceApi.plan(projectId, revision ?? undefined), revision);
  if (plan.isLoading) return <WorkspaceLoading />;
  if (!plan.data || plan.isError) return <WorkspaceError error={plan.error} retry={() => void plan.refetch()} />;
  return <LivingPlan key={`${projectId}:${revision ?? "draft"}`} projectId={projectId} mentor={mentor} view={plan.data} revision={revision} onRevision={async (id, saved = false) => {
    if (!saved && !(await canLeaveWorkspace())) return;
    const next = new URLSearchParams(params); if (id) next.set("revision", id); else next.delete("revision"); setParams(next, { replace: true });
  }} />;
}

function LivingPlan({ projectId, mentor, view, revision, onRevision }: { projectId: string; mentor: boolean; view: ResearchPlanView; revision: string | null; onRevision: (id: string | null, saved?: boolean) => void }) {
  const { t } = useI18n();
  const state = usePlanDraft(projectId, view);
  const [historyOpen, setHistoryOpen] = useState(false), [snapshotOpen, setSnapshotOpen] = useState(false), [note, setNote] = useState("");
  const [snapshotError, setSnapshotError] = useState<unknown>(null), [snapshotBusy, setSnapshotBusy] = useState(false);
  const snapshotAttempt = useRef<{ expectedVersion: number; clientKey: string; changeSummary: string } | null>(null);
  useUnsavedWorkspace(Boolean(note.trim()) || snapshotBusy);
  const snapshotId = revision ?? (mentor ? view.currentRevisionId : null);
  const currentContent = view.canEdit ? state.draft : view.content;
  const status = state.saving ? "Saving…" : state.error ? "Could not sync changes" : state.dirty ? "Changes waiting to sync" : view.archived ? "Archived, read only" : "Draft saved";
  return <div className="coord-plan living-plan" data-no-i18n>
    <WorkspaceHeading title={t("Research plan")} description={t(mentor ? "Only the plan revision explicitly shared with you is visible here." : "Define the problem, set objectives and refine your research questions.")} />
    <div className="living-plan-status"><div className="living-plan-save-state"><span role="status" aria-live="polite">{t(snapshotId ? "Immutable version {{version}}" : "Working draft", { version: view.version })}{!snapshotId && <> · {t(status)}</>}</span>{view.canEdit && <small>{t("Changes save automatically. Create a version when ready to share.")}</small>}</div>
      <div className="living-plan-version-actions">
      {snapshotId && !mentor && <Button type="button" size="sm" variant="ghost" onClick={() => onRevision(null)}>{t("Back to current plan")}</Button>}
      {Boolean(state.error) && !state.conflict && view.canEdit && <Button type="button" size="sm" variant="outline" disabled={state.saving} onClick={() => void state.retry()}>{t("Retry sync")}</Button>}
      {!mentor && <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}><History size={15} className="mr-2" />{t("Version history")}</Button>}
      {view.canEdit && <Button type="button" size="sm" variant="outline" disabled={state.saving || !state.valid || Boolean(state.conflict)} onClick={async () => { if (await state.flush()) setSnapshotOpen(true); }}><Plus size={15} className="mr-2" />{t("Create version")}</Button>}
      </div>
    </div>
    {state.recovered && <p role="status" className="mb-4 text-sm text-muted-foreground">{t("Recovered your unsynced draft from the expired session in this tab.")}</p>}
    {Boolean(state.error) && !state.conflict && view.canEdit && <WorkspaceError error={state.error} />}
    {!state.valid && view.canEdit && <p role="alert" className="text-sm text-destructive">{t("Use at most 20 items per list, 500 characters per objective or output, and 240 per criterion.")}</p>}
    {state.conflict && <PlanConflict conflict={state.conflict} draft={state.draft} onResolve={state.reconcile} />}
    <PlanDocument projectId={projectId} content={currentContent} editable={view.canEdit} revisionId={snapshotId ?? undefined} version={view.canEdit ? state.version : view.version} archived={view.archived} mentor={mentor} field={state.field} />
    {!mentor && <nav aria-label={t("Related research work")} className="living-plan-links">
      <Link to={projectSectionHref(projectId, "papers")}>{t("View research literature")}</Link><Link to={projectSectionHref(projectId, "gaps")}>{t("View research gaps")}</Link><Link to={projectSectionHref(projectId, "manuscripts")}>{t("Open research manuscripts")}</Link>
    </nav>}
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

function PlanConflict({ conflict, draft, onResolve }: { conflict: { latest: ResearchPlanView; fields: Array<keyof ResearchPlanContent> }; draft: ResearchPlanContent; onResolve: (choices: Partial<Record<keyof ResearchPlanContent, "mine" | "server">>) => void }) {
  const { t } = useI18n(); const [choices, setChoices] = useState<Partial<Record<keyof ResearchPlanContent, "mine" | "server">>>({});
  const display = (value: unknown) => typeof value === "string" ? value || t("Not drafted yet") : JSON.stringify(value, null, 2);
  return <section role="alert" className="living-plan-conflict"><h3>{t("Resolve overlapping changes")}</h3><p>{t("Your draft is kept. Choose which content to use for each conflicting section. Other edits will be merged.")}</p>
    {conflict.fields.filter(key => planFields.includes(key)).map(key => <fieldset key={key}><legend>{t(key)}</legend><div className="grid gap-3 sm:grid-cols-2">{(["mine", "server"] as const).map(choice => <label key={choice}><span className="flex gap-2"><input type="radio" name={`conflict-${key}`} checked={choices[key] === choice} onChange={() => setChoices({ ...choices, [key]: choice })} />{t(choice === "mine" ? "Use my draft" : "Use saved content")}</span><pre>{display(choice === "mine" ? draft[key] : conflict.latest.content[key])}</pre></label>)}</div></fieldset>)}
    <Button type="button" size="sm" disabled={conflict.fields.some(key => !choices[key])} onClick={() => onResolve(choices)}>{t("Merge and continue")}</Button>
  </section>;
}
