import { useRef, useState } from "react";
import type { CreatePlanThread, PlanSection } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { canLeaveWorkspace, useUnsavedWorkspace, WorkspaceDate, WorkspaceError, WorkspaceLoading, WorkspacePager, WorkspacePeoplePicker } from "./workspace-common";
import { DiscussionDetail } from "./workspace-discussions";
import { planSectionLabels } from "./plan-section-labels";

export function PlanSectionFeedback({ projectId, section, revisionId, version, archived, mentor, onClose }: { projectId: string; section: PlanSection; revisionId?: string; version: number; archived: boolean; mentor: boolean; onClose: () => void }) {
  const { t } = useI18n(); const [selected, setSelected] = useState<string | null>(null), [page, setPage] = useState(1), [body, setBody] = useState(""), [mentions, setMentions] = useState<string[]>([]);
  const key = useRef(crypto.randomUUID()), busy = useRef(false);
  const attempt = useRef<CreatePlanThread | null>(null);
  const threads = useWorkspaceResource(projectId, "plan-threads", () => workspaceApi.planThreads(projectId, section, revisionId, page), { section, revisionId, page });
  const create = useWorkspaceCommand(projectId, async () => {
    attempt.current ??= { section, revisionId, body: body.trim(), clientKey: key.current, mentions };
    try { return await workspaceApi.createPlanThread(projectId, attempt.current); }
    catch (failure) {
      const status = (failure as { response?: { status: number } }).response?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) { attempt.current = null; key.current = crypto.randomUUID(); }
      throw failure;
    }
  });
  useUnsavedWorkspace(Boolean(body.trim()) || create.isPending || Boolean(attempt.current));
  return <Dialog open onOpenChange={open => { if (!open && canLeaveWorkspace()) onClose(); }}><DialogContent closeLabel={t("Close")} className="max-w-2xl max-h-[85dvh] overflow-y-auto" data-no-i18n><DialogHeader><DialogTitle>{t("Comments on {{section}}", { section: t(planSectionLabels[section]) })}</DialogTitle><DialogDescription>{t(revisionId ? "Feedback stays with immutable version {{version}}." : "Team discussion, anchored to the working draft revision at posting time.", { version })}</DialogDescription></DialogHeader>
    {selected ? <DiscussionDetail projectId={projectId} selected={selected} readOnly={archived} owner={false} mentor={mentor} onClose={() => { if (canLeaveWorkspace()) setSelected(null); }} onSaved={setSelected} onRecordDecision={() => undefined} /> : <>
      {threads.isLoading ? <WorkspaceLoading /> : threads.isError ? <WorkspaceError error={threads.error} retry={() => void threads.refetch()} /> : threads.data?.items.length ? <ul className="living-plan-feedback-list">{threads.data.items.map(thread => <li key={thread.id}><button type="button" onClick={() => { if (canLeaveWorkspace()) setSelected(thread.id); }}><span className="text-xs text-muted-foreground">{thread.author.name} · <WorkspaceDate value={thread.createdAt} /> · {t(thread.status === "OPEN" ? "Open" : "Resolved")}</span><p>{thread.body}</p><small>{t("{{count}} replies", { count: thread.replyCount })} · {t(thread.planContext?.revisionId ? "Immutable version {{version}}" : "Draft at revision {{version}}", { version: thread.planContext?.draftVersion ?? version })}</small></button></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("No comments on this section yet.")}</p>}
      <WorkspacePager data={threads.data} page={page} onPage={setPage} />
      {!archived && <form className="space-y-3 border-t pt-4" onSubmit={async event => { event.preventDefault(); if (busy.current || !body.trim()) return; busy.current = true; try { await create.mutateAsync(); attempt.current = null; setBody(""); setMentions([]); key.current = crypto.randomUUID(); } catch { /* Keep comment and key for retry. */ } finally { busy.current = false; } }}>
        <label className="block space-y-2 text-sm">{t("Add section comment")}<textarea className="project-form-textarea" rows={3} required maxLength={10000} disabled={create.isPending || Boolean(attempt.current)} value={body} onChange={event => setBody(event.target.value)} /></label>
        {!mentor && <details><summary className="text-xs cursor-pointer">{t("Notify a teammate")}</summary><WorkspacePeoplePicker projectId={projectId} value={mentions} onChange={setMentions} multiple /></details>}
        {create.error && <WorkspaceError error={create.error} />}<Button type="submit" size="sm" disabled={create.isPending || !body.trim()}>{t(create.isPending ? "Saving…" : "Post comment")}</Button>
      </form>}
    </>}
  </DialogContent></Dialog>;
}
