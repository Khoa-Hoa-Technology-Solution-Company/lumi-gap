import { Link, useSearchParams } from "react-router-dom";
import { MessageSquare, Users } from "lucide-react";
import type { MentorAccessWorkspace as Workspace } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { canLeaveWorkspace, WorkspaceHeading } from "./workspace-common";
import { ProjectDiscussionPanel } from "./project-discussion-panel";
import { ProjectSectionNav, type ProjectTab } from "./project-section-nav";
import { MentorProjectTasks } from "./mentor-project-tasks";
import { WorkContributionsPanel } from "./work-contributions";
import "../project-workspace.css";
import "../workspace-coordination.css";

export function MentorProjectNav() {
  const [params, setParams] = useSearchParams();
  const active: ProjectTab = params.get("tab") === "chat" ? "chat" : params.get("tab") === "tasks" ? "tasks" : "overview";
  return <ProjectSectionNav activeTab={active} paperCount={0} memberCount={0} allowedTabs={["overview", "tasks", "chat"]} onChange={async tab => {
      if (!await canLeaveWorkspace()) return;
      const next = new URLSearchParams(params);
      next.set("tab", tab);
      if (tab === "chat") next.set("channel", "mentors"); else next.delete("channel");
      setParams(next);
    }} />;
}

export function MentorProjectWorkspace({ data, standalone = false }: { data: Workspace; standalone?: boolean }) {
  const [params] = useSearchParams();
  const chat = params.get("tab") === "chat";
  const ownPolicy = data.policies.find(p => p.mentorId === data.viewerId && p.policy.effective);
  const statuses: Record<string, string> = { PLANNING: "Đang lập kế hoạch", ACTIVE: "Đang thực hiện", COMPLETED: "Đã hoàn thành", ARCHIVED: "Đã lưu trữ" };
  if (params.get("tab") === "tasks") return <div className="project-workspace coord-mentor-page" data-no-i18n><div className="project-page-width py-6 space-y-4">
    {standalone && <MentorProjectNav />}
    <MentorProjectTasks key={`${data.projectId}:${data.viewerId}`} projectId={data.projectId} />
  </div></div>;
  if (chat) return <div className="project-workspace coord-mentor-page" data-no-i18n><div className="project-page-width py-6 space-y-4 coord-discussions">
    {standalone && <MentorProjectNav />}
    <WorkspaceHeading title="Trò chuyện nhóm" description={data.title} />
    <ProjectDiscussionPanel projectId={data.projectId} paperCount={0} mentorView />
  </div></div>;
  return <div className="project-workspace coord-mentor-page" data-no-i18n>
    <div className="project-page-width space-y-6 py-6">
      <header className="space-y-2 border-b pb-5">
        <Link to="/academic-support?view=active" className="text-sm text-muted-foreground hover:text-primary">Nhóm đang cố vấn</Link>
        <div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-semibold">{data.title}</h1><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Không gian cố vấn</span></div>
        <p className="text-sm text-muted-foreground">{data.basics?.researchField}{data.basics?.researchField && data.basics.status ? " · " : ""}{statuses[data.basics?.status ?? ""] ?? ""}</p>
      </header>
      {standalone && <MentorProjectNav />}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <section className="min-w-0 space-y-5">
          <div><h2 className="text-lg font-semibold">Thông tin dự án</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{data.basics?.summary || "Nhóm chưa thêm giới thiệu. Bạn có thể trao đổi trực tiếp với các thành viên để hiểu mục tiêu nghiên cứu."}</p></div>
          <div className="rounded-lg border p-4"><h3 className="flex items-center gap-2 font-medium"><MessageSquare size={18} aria-hidden="true" />Trao đổi với nhóm</h3><p className="my-3 text-sm leading-6 text-muted-foreground">Cuộc trao đổi riêng giữa bạn và các thành viên dự án, sẵn sàng khi quyền chat có hiệu lực.</p><Button asChild><Link to={`/projects/${encodeURIComponent(data.projectId)}?tab=chat&channel=mentors`}>Mở trao đổi</Link></Button></div>
          {data.readOnly && <p role="status" className="text-sm text-muted-foreground">Dự án đang ở chế độ chỉ đọc.</p>}
          <Button asChild variant="outline"><Link to={`/projects/${encodeURIComponent(data.projectId)}?tab=tasks`}>Xem công việc của tôi</Link></Button>
          {ownPolicy?.shares.length ? <Button asChild variant="outline"><Link to={`/academic-support/projects/${encodeURIComponent(data.projectId)}?view=resources`}>Xem nội dung nhóm đã chia sẻ ({ownPolicy.shares.length})</Link></Button> : null}
        </section>
        <section aria-label="Thành viên nhóm" className="min-w-0 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Users size={18} aria-hidden="true" />Thành viên nhóm{data.basics?.team.length ? ` (${data.basics.team.length})` : ""}</h2>
          <ul className="mt-3 divide-y">{data.basics?.team.map(person => <li key={person.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words font-medium">{person.name}</span><span className="shrink-0 text-xs text-muted-foreground">{person.role === "OWNER" ? "Chủ dự án" : "Thành viên"}</span></li>)}</ul>
        </section>
      </div>
      <details><summary className="cursor-pointer text-sm font-medium">Ghi nhận và xác nhận đóng góp nghiên cứu của tôi</summary><div className="mt-4"><WorkContributionsPanel mentorView projectId={data.projectId} currentUserId={data.viewerId} readOnly={data.readOnly} /></div></details>
    </div>
  </div>;
}
