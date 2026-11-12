import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { mentorAccessApi } from "../api/mentor-access.api";
import { MentorAdjudicationTasks } from "./mentor-access-workspace";
import { taskLabels, WorkspaceDate, WorkspaceError, WorkspaceHeading, WorkspaceLoading, WorkspacePager } from "./workspace-common";
import "../research-tasks.css";

export function MentorProjectTasks({ projectId }: { projectId: string }) {
  return <div className="coord-tasks research-tasks space-y-6" data-no-i18n>
    <WorkspaceHeading title="Công việc của tôi" description="Chỉ hiển thị công việc được giao cho bạn trong dự án này." />
    <AssignedTasks projectId={projectId} />
    <MentorAdjudicationTasks projectId={projectId} />
  </div>;
}

function AssignedTasks({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const actorId = useAuthStore(state => state.user?.id);
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["mentor-access", actorId, projectId, "assigned-tasks", page], queryFn: () => mentorAccessApi.tasks(projectId, page), enabled: Boolean(actorId), retry: false, refetchInterval: 10000 });
  const columns = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
  if (query.isLoading) return <WorkspaceLoading />;
  if (query.isError) return <WorkspaceError error={query.error} retry={() => void query.refetch()} />;
  if (!query.data?.items.length) return <p className="rounded-lg border p-5 text-sm text-muted-foreground">Bạn chưa có công việc được giao trong dự án này. Nhiệm vụ mới sẽ xuất hiện tại đây.</p>;
  return <section aria-label="Công việc được giao" className="space-y-4">
    <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">{columns.map(status => {
      const items = query.data.items.filter(task => task.status === status);
      return <section key={status} className="min-w-0 rounded-lg bg-muted/30 p-3"><h3 className="mb-3 flex items-center justify-between text-sm font-semibold">{t(taskLabels[status])}<span className="text-xs font-normal text-muted-foreground">{items.length}</span></h3>
        <ul className="space-y-3">{items.map(task => <li key={task.id} className="task-card !block space-y-3">
          <h4 className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{task.title}</h4>
          {task.description && <details><summary className="cursor-pointer text-xs text-muted-foreground">Xem nội dung</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{task.description}</p></details>}
          {task.blockedReason && <p className="break-words text-xs text-muted-foreground">{task.blockedReason}</p>}
          {task.dueAt && <p className="text-xs text-muted-foreground">Hạn: <WorkspaceDate value={task.dueAt} /></p>}
          {task.submissionId && <Button asChild size="sm" variant="outline"><Link to={`/submissions/${encodeURIComponent(task.submissionId)}`}>{status === "DONE" ? "Xem bản thảo" : "Góp ý bản thảo"}</Link></Button>}
        </li>)}</ul>
        {!items.length && <p className="text-xs text-muted-foreground">Chưa có công việc.</p>}
      </section>;
    })}</div>
    <WorkspacePager data={query.data} page={page} onPage={setPage} />
  </section>;
}
