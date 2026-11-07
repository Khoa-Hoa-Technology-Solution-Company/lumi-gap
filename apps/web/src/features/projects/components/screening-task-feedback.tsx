import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { automaticTaskStatuses } from "../my-work-model";
import { ScreeningError } from "./screening-common";

function returnLink(projectId: string, value: string | null) {
  const fallback = `/projects/${encodeURIComponent(projectId)}?tab=tasks`;
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  const url = new URL(value, "https://lumigap.invalid");
  return url.origin === "https://lumigap.invalid" && [ `/projects/${encodeURIComponent(projectId)}`, `/academic-support/projects/${encodeURIComponent(projectId)}` ].includes(url.pathname) ? url.pathname + url.search : fallback;
}
/** A stale obligation can be read, but can never reopen its old action form. */
export function ScreeningTaskGuard({ projectId, roundId, children }: { projectId: string; roundId?: string; children: ReactNode }) {
  const [params] = useSearchParams(), location = useLocation(), id = params.get("automaticTask");
  const query = useResearchResource(projectId, ["automatic-tasks"], () => screeningApi.automaticTasks(projectId), Boolean(id), () => Boolean(id), 15000);
  if (!id) return <>{children}</>;
  if (query.isLoading) return <p role="status">Đang kiểm tra nhiệm vụ…</p>;
  if (query.isError) return <ScreeningError error={query.error} retry={() => void query.refetch()} />;
  const task = query.data?.find(row => row.id === id && (!roundId || row.roundId === roundId));
  const ended = !task || Boolean(task.endedAt) || Boolean(task.dueAt && Date.parse(task.dueAt) <= Date.now());
  if (!ended && task?.status !== "BLOCKED") return <>{children}</>;
  const current = new URLSearchParams(params); current.delete("automaticTask");
  return <section role="status" className="space-y-3 rounded-md border p-4 text-sm">
    <h3 className="font-semibold">{ended ? "Nhiệm vụ này đã kết thúc hoặc chuyển bước" : "Nhiệm vụ đang vướng mắc"}</h3>
    <p>{task ? `${automaticTaskStatuses[task.status]} · ${task.reason}` : "Nhiệm vụ không còn khả dụng với quyền hiện tại."}</p>
    <div className="flex flex-wrap gap-4"><Link className="text-primary underline" to={returnLink(projectId, params.get("taskReturn"))}>Quay lại Việc của tôi</Link>
      {task && <Link className="text-primary underline" to={`${location.pathname}?${current}`}>Xem trạng thái hiện tại</Link>}</div>
  </section>;
}
