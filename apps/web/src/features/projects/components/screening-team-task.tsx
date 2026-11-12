import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BookOpen, Clock, MessageSquare, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { automaticTaskStatuses, sectionForTask, screeningWorkLink, type MyWorkTask } from "../my-work-model";

export const screeningTeamAction = (task: MyWorkTask) => task.obligation?.endedAt ? "Xem lại" : task.obligation?.status === "BLOCKED" ? "Xem trạng thái" : task.kind === "STATEMENT" ? "Bổ sung quan điểm" : task.kind === "ADJUDICATION" ? "Đưa ra kết luận" : task.kind === "DISCUSSION" ? task.obligation?.actionLabel === "Làm rõ đánh giá" ? "Làm rõ đánh giá" : "Thảo luận và giải quyết" : task.action;
export function ScreeningTeamTaskDeadline({ task }: { task: MyWorkTask }) {
  if (!task.deadline) return null;
  return <span className="task-due"><Clock size={13} aria-hidden="true" /><time dateTime={task.deadline}>{new Date(task.deadline).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</time></span>;
}

/** A read projection of real Screening work; never draggable or manually marked done. */
export function ScreeningTeamTask({ projectId, task }: { projectId: string; task: MyWorkTask }) {
  const location = useLocation();
  const Icon = task.kind === "REVIEW" ? BookOpen : task.kind === "ADJUDICATION" || task.kind === "COORDINATION" ? Scale : MessageSquare;
  const href = withTaskReturn(screeningWorkLink(projectId, task, sectionForTask(task)), task, location.pathname + location.search);
  return <article className="task-card task-screening-card" data-screening-round={task.roundId}>
    <div className="task-card-top"><span className="task-screening-kind"><Icon size={13} aria-hidden="true" />{task.label}</span></div>
    {task.obligation && <small className="text-muted-foreground">Vòng {task.obligation.roundNumber} · {task.obligation.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / tóm tắt"}</small>}
    <Link className="task-card-title" to={href}>{task.title}</Link>
    {task.obligation && <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"><span className="font-medium">{automaticTaskStatuses[task.obligation.status]}</span> · {task.description}</p>}
    <div className="task-card-footer"><ScreeningTeamTaskDeadline task={task} /><span className="task-person">Bạn</span></div>
    <Button size="sm" variant="outline" asChild><Link to={href}>{screeningTeamAction(task)}<ArrowRight size={13} aria-hidden="true" /></Link></Button>
  </article>;
}

export function withTaskReturn(href: string, task: MyWorkTask, returnTo: string) {
  return task.obligation ? `${href}&taskReturn=${encodeURIComponent(returnTo)}` : href;
}
