import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { MentorWorkQuery } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useMentorWorkspace } from "../hooks/use-mentor-workspace";
import { MentorWorkQueue, MentorQueueLoading } from "./mentor-work-queue";
import { DiscussionDetail } from "./workspace-discussions";
import { WorkspaceHeading } from "./workspace-common";

export function MentorProjectTasks({ projectId, readOnly = false }: { projectId: string; readOnly?: boolean }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<MentorWorkQuery>({ page: 1, status: "ACTIONABLE", sort: "priority" });
  const selected = params.get("workItem");
  const discussion = params.get("discussion");
  const query = useMentorWorkspace({ ...filters, projectId, ...(selected ? { item: selected, status: "ALL" } : {}) }, !discussion);
  const item = query.data?.items.find(row => row.id === selected);
  const close = () => setParams(current => { const next = new URLSearchParams(current); next.delete("workItem"); next.delete("discussion"); return next; });
  return <div className="coord-tasks mentor-project-work space-y-5" data-no-i18n>
    <Button asChild variant="ghost" size="sm"><Link to="/mentor-workspace?view=work">{t("mentorWorkspace.backGlobal")}</Link></Button>
    <WorkspaceHeading title={t("mentorWorkspace.projectWork")} description={t("mentorWorkspace.projectWorkHint")} />
    {discussion ? <DiscussionDetail projectId={projectId} selected={discussion} readOnly={readOnly} owner={false} mentor onClose={close} onSaved={() => undefined} onRecordDecision={() => undefined} />
      : selected ? <section className="mentor-task-detail"><Button variant="outline" size="sm" onClick={close}>{t("mentorWorkspace.backWork")}</Button>{query.isLoading ? <MentorQueueLoading /> : query.isError || !item ? <p role="status">{t("mentorWorkspace.unavailable")}</p> : <><h2 className="mt-5 text-xl font-semibold">{item.title}</h2><p>{item.description}</p><p>{item.sender} · {t(`mentorWorkspace.status.${item.status}`)}</p>
        {item.accessIssue && <div role="status" className="mt-4 rounded-md border bg-muted/30 p-4 text-sm"><strong>{t("mentorWorkspace.sharingRequired")}</strong><p>{t("mentorWorkspace.manuscriptNotShared")}</p><p>{t("mentorWorkspace.sharingInstructions")}</p></div>}
        {(item.href.startsWith("/submissions/") || item.href.startsWith("/reviews/") || item.href.startsWith("/review-requests/") || item.accessIssue && item.canContactTeam) && <Button asChild className="mt-4"><Link to={item.href}>{t(item.accessIssue ? "mentorWorkspace.contactTeam" : item.kind === "TASK" ? "mentorWorkspace.openManuscript" : "Open review workspace")}</Link></Button>}
      </>}</section>
      : <MentorWorkQueue projectOnly data={query.data} query={filters} onChange={setFilters} loading={query.isLoading} fetching={query.isFetching} error={query.error} retry={() => void query.refetch()} />}
  </div>;
}
