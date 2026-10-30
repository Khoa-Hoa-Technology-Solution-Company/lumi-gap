import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ResearchPlanContent, ResearchPlanView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { planFields } from "../hooks/use-plan-draft";
import { canLeaveWorkspace, projectSectionHref, WorkspaceDate, WorkspaceError, WorkspaceLoading, WorkspacePager } from "./workspace-common";

export function PlanHistory({ projectId, current, onSelect }: { projectId: string; current: ResearchPlanView; onSelect: (id: string) => void }) {
  const { t } = useI18n(); const [page, setPage] = useState(1), [compare, setCompare] = useState<string[]>([]), [restoreId, setRestoreId] = useState("");
  const history = useWorkspaceResource(projectId, "plan-history", () => workspaceApi.planHistory(projectId, page), page);
  const attempt = useRef<{ revisionId: string; expectedVersion: number; clientKey: string } | null>(null);
  const [selectionError, setSelectionError] = useState<unknown>(null), [restoreChanged, setRestoreChanged] = useState(false);
  const restore = useWorkspaceCommand(projectId, async () => {
    if (!attempt.current) throw new Error("Choose a version before restoring");
    const { revisionId, ...input } = attempt.current;
    try { return await workspaceApi.restorePlan(projectId, revisionId, input); }
    catch (failure) {
      const status = (failure as { response?: { status: number } }).response?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        attempt.current = null; setRestoreId(""); setSelectionError(failure); setRestoreChanged(status === 409);
      }
      throw failure;
    }
  });
  const compared = history.data?.items.filter(item => compare.includes(item.id)) ?? [];
  return <section className="living-plan-history">
    {history.isLoading ? <WorkspaceLoading /> : history.isError ? <WorkspaceError error={history.error} retry={() => void history.refetch()} /> : <ul>{history.data?.items.map(item => <li key={item.id}>
      <div className="flex min-w-0 items-start justify-between gap-3"><button type="button" className="min-w-0 text-left" onClick={() => onSelect(item.id)}><strong>{t("Version {{version}}", { version: item.version })}</strong><p className="text-xs text-muted-foreground">{item.changedBy?.name ?? t("Imported research plan")} · <WorkspaceDate value={item.createdAt} /></p><p className="text-sm whitespace-pre-wrap break-words">{item.changeSummary || t("No change note")}</p><small>{t("{{count}} feedback threads", { count: item.feedbackCount ?? 0 })}</small></button>
      <label className="flex shrink-0 items-center gap-2 text-xs"><input type="checkbox" checked={compare.includes(item.id)} disabled={!compare.includes(item.id) && compare.length >= 2} onChange={event => setCompare(event.target.checked ? [...compare, item.id] : compare.filter(id => id !== item.id))} />{t("Compare")}</label></div>
      {!current.archived && <Button size="sm" variant="ghost" type="button" disabled={restore.isPending} onClick={async () => { if (!(await canLeaveWorkspace())) return; setSelectionError(null); setRestoreChanged(false); try { const latest = await workspaceApi.plan(projectId); attempt.current = { revisionId: item.id, expectedVersion: latest.version, clientKey: crypto.randomUUID() }; setRestoreId(item.id); restore.reset(); } catch (failure) { setSelectionError(failure); } }}>{t("Restore to draft")}</Button>}
    </li>)}</ul>}
    <WorkspacePager data={history.data} page={page} onPage={next => { setPage(next); setCompare([]); }} />
    {Boolean(selectionError) && <WorkspaceError error={selectionError} />}
    {restoreChanged && <p role="alert" className="text-sm">{t("The draft changed. Review the current plan, then confirm restore again.")}</p>}
    {compared.length === 2 && <section className="living-plan-comparison"><h3>{t("Version comparison")}</h3>{planFields.filter(key => JSON.stringify(compared[0]!.content[key]) !== JSON.stringify(compared[1]!.content[key])).map(key => <div key={key}><h4>{t(key)}</h4><div className="grid gap-3 sm:grid-cols-2">{compared.map(item => <div key={item.id}><strong className="text-xs">{t("Version {{version}}", { version: item.version })}</strong><pre>{readable(item.content[key])}</pre></div>)}</div></div>)}{JSON.stringify(compared[0]!.content) === JSON.stringify(compared[1]!.content) && <p>{t("These versions contain the same plan content.")}</p>}</section>}
    {restoreId && <form className="space-y-3 rounded-md border p-4" onSubmit={async event => { event.preventDefault(); if (restore.isPending) return; try { await restore.mutateAsync(); attempt.current = null; setRestoreId(""); } catch { /* Keep target and safe retry receipt. */ } }}><p className="text-sm">{t("Restore this version to a new working draft revision? Existing versions and feedback remain unchanged.")}</p>{restore.error && <WorkspaceError error={restore.error} />}{restore.isSuccess && <p role="status">{t("Version restored to working draft")}</p>}<div className="flex gap-2"><Button type="submit" size="sm" disabled={restore.isPending}>{t(restore.isPending ? "Saving…" : "Confirm restore")}</Button><Button type="button" variant="ghost" size="sm" disabled={restore.isPending} onClick={() => { setRestoreId(""); }}>{t("Cancel")}</Button></div></form>}
    {restore.isSuccess && !restoreId && <p role="status" className="text-sm">{t("Version restored to working draft")}</p>}
  </section>;
}
function readable(value: ResearchPlanContent[keyof ResearchPlanContent]) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }

export function PlanSharing({ projectId }: { projectId: string; revisionId: string; version: number }) {
  const { t } = useI18n();
  const shares = useWorkspaceResource(projectId, "plan-shares", () => workspaceApi.shares(projectId));
  const revoke = useWorkspaceCommand(projectId, (id: string) => workspaceApi.revokeShare(projectId, id));
  return <details className="living-plan-sharing" data-no-i18n><summary>{t("Request mentor feedback")}</summary><div className="space-y-3 pt-4"><p className="text-sm text-muted-foreground">Chọn và duyệt nội dung tổng quan trong mục Tìm cố vấn. Chỉ nội dung được duyệt mới hiển thị trong không gian cố vấn.</p>
    <Button size="sm" variant="outline" asChild><Link to={projectSectionHref(projectId, "support")}>Quản lý quyền và nội dung chia sẻ</Link></Button>
    {(revoke.error || shares.error) && <WorkspaceError error={revoke.error || shares.error} />}
    {shares.data?.some(item => !item.revokedAt) && <p className="text-sm text-muted-foreground">Các bản chia sẻ cũ dưới đây được giữ làm lịch sử, không mở quyền đọc trong không gian cố vấn mới.</p>}
    <ul className="space-y-2">{shares.data?.filter(item => !item.revokedAt).map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{item.mentor.name} · {t("Version {{version}}", { version: item.version })}</span><Button type="button" size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(item.id)}>{t("Revoke access")}</Button></li>)}</ul>
    <p className="text-xs text-muted-foreground">{t("Mentor feedback is advisory. Formal academic review requires a separate assignment to an exact artifact version.")}</p>
    </div></details>;
}
