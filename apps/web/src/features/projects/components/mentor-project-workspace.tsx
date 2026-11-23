import { MentorAccessWorkspace } from "./mentor-access-workspace";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, ListChecks, MessageSquare, Users } from "lucide-react";
import type { MentorAccessWorkspace as Workspace } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { canLeaveWorkspace, WorkspaceHeading } from "./workspace-common";
import { ProjectDiscussionPanel } from "./project-discussion-panel";
import { ProjectSectionNav, type ProjectTab } from "./project-section-nav";
import { ProjectHorizontalTabs } from "./project-horizontal-tabs";
import { MentorProjectTasks } from "./mentor-project-tasks";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";
import { ResearchContributionsPanel } from "./research-contributions-panel";
import { WorkContributionsPanel } from "./work-contributions";
import { useI18n } from "@/i18n";
import { MentorRoleAssignments } from "./mentor-role-assignments";
import "../project-workspace.css";
import "../workspace-coordination.css";

export function MentorProjectNav({ contributions = false, horizontal = false }: { contributions?: boolean; horizontal?: boolean }) {
  const [params, setParams] = useSearchParams();
  const active: ProjectTab = params.get("tab") === "contributions" ? "contributions" : params.get("tab") === "chat" ? "chat" : params.get("tab") === "tasks" ? "tasks" : "overview";
  const Navigation = horizontal ? ProjectHorizontalTabs : ProjectSectionNav;
  return <Navigation activeTab={active} paperCount={0} memberCount={0} allowedTabs={contributions ? ["overview", "tasks", "chat", "contributions"] : ["overview", "tasks", "chat"]} onChange={async tab => {
      if (!await canLeaveWorkspace()) return;
      const next = new URLSearchParams(params);
      next.set("tab", tab);
      if (tab === "contributions") next.delete("contributionTab");
      if (tab === "chat") next.set("channel", "mentors"); else next.delete("channel");
      setParams(next);
    }} />;
}

export function MentorProjectWorkspace({ data, standalone = false, embedded = false }: { data: Workspace; standalone?: boolean; embedded?: boolean }) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const href = (path: string) => embedded ? mentorWorkspaceDestination(path) : path;
  const chat = params.get("tab") === "chat";
  const ownPolicy = data.policies.find(p => p.mentorId === data.viewerId && p.policy.effective);
  const contributionAccess = Boolean(ownPolicy?.policy.permissions.includes("CONTRIBUTIONS_VIEW"));
  const panelProps = (tab: ProjectTab) => standalone && embedded ? { role: "tabpanel", id: `project-panel-${tab}`, "aria-labelledby": `project-content-tab-${tab}` } : {};
  if (params.get("section") === "resources" || params.get("view") === "resources") return <MentorAccessWorkspace projectId={data.projectId} mentorView embedded />;
  const statuses: Record<string, string> = { PLANNING: "Đang lập kế hoạch", ACTIVE: "Đang thực hiện", COMPLETED: "Đã hoàn thành", ARCHIVED: "Đã lưu trữ" };
  if (params.get("tab") === "contributions") return <div className="project-workspace coord-mentor-page" data-no-i18n><div className="project-page-width py-6 space-y-4">
    {standalone && <MentorProjectNav contributions={contributionAccess} horizontal={embedded} />}
    <div {...panelProps("contributions")}>{params.get("contributionTab")==="declarations" ? <><Button asChild variant="ghost"><Link to={href(`/projects/${data.projectId}?tab=contributions`)}>← {t("researchContribution.research")}</Link></Button><WorkContributionsPanel projectId={data.projectId} currentUserId={data.viewerId} readOnly={data.readOnly} mentorView /></> : <ResearchContributionsPanel projectId={data.projectId} />}</div>
  </div></div>;
  if (params.get("tab") === "tasks") return <div className="project-workspace coord-mentor-page" data-no-i18n><div className="project-page-width py-6 space-y-4">
    {standalone && <MentorProjectNav contributions={contributionAccess} horizontal={embedded} />}
    <div {...panelProps("tasks")}><MentorProjectTasks key={`${data.projectId}:${data.viewerId}`} projectId={data.projectId} readOnly={data.readOnly} /></div>
  </div></div>;
  if (chat) return <div className="project-workspace coord-mentor-page" data-no-i18n><div className="project-page-width py-2 space-y-3 coord-discussions">
    {standalone && <MentorProjectNav contributions={contributionAccess} horizontal={embedded} />}
    <div {...panelProps("chat")}>
      {!embedded && <WorkspaceHeading title="Trò chuyện nhóm" description={data.title} />}
      <ProjectDiscussionPanel projectId={data.projectId} paperCount={0} mentorView />
    </div>
  </div></div>;
  return <div className="project-workspace coord-mentor-page" data-no-i18n>
    <div className="project-page-width space-y-6 py-6">
      <header className="mentor-project-context">
        <div>
        {!embedded && <Link to="/academic-support?view=active" className="text-sm text-muted-foreground hover:text-primary">Nhóm đang cố vấn</Link>}
        <p className="mentor-project-context-label">Dự án hướng dẫn</p>
        <h1>{data.title}</h1>
        {data.basics?.researchField && <p className="mentor-project-field">{data.basics.researchField}</p>}
        </div>
        {statuses[data.basics?.status ?? ""] && <span className="mentor-project-stage">{statuses[data.basics?.status ?? ""]}</span>}
      </header>
      {standalone && <MentorProjectNav contributions={contributionAccess} horizontal={embedded} />}
      <div className="mentor-project-overview-grid" {...panelProps("overview")}>
        <section className="mentor-project-overview-main">
          <MentorRoleAssignments projectId={data.projectId} />
          <div className="mentor-project-summary"><h2>Thông tin dự án</h2><p className={!data.basics?.summary ? "text-muted-foreground" : undefined}>{data.basics?.summary || "Nhóm chưa thêm giới thiệu. Bạn có thể trao đổi với các thành viên để làm rõ mục tiêu nghiên cứu."}</p></div>
          <section className="mentor-project-collaboration" aria-label="Trao đổi với nhóm"><h3>Trao đổi với nhóm</h3><p>Góp ý và theo dõi công việc của bạn trong dự án.</p><div className="mentor-project-actions"><Button asChild><Link to={href(`/projects/${encodeURIComponent(data.projectId)}?tab=chat&channel=mentors`)}><MessageSquare size={16} aria-hidden="true" />Mở trao đổi</Link></Button><Button asChild variant="outline"><Link to={href(`/projects/${encodeURIComponent(data.projectId)}?tab=tasks`)}><ListChecks size={16} aria-hidden="true" />Xem công việc của tôi</Link></Button></div></section>
          {data.readOnly && <p role="status" className="text-sm text-muted-foreground">Dự án đang ở chế độ chỉ đọc.</p>}
          {ownPolicy?.shares.length ? <Button asChild variant="outline" className="mentor-project-resource-action"><Link to={href(`/academic-support/projects/${encodeURIComponent(data.projectId)}?view=resources`)}><FileText size={16} aria-hidden="true" />Xem nội dung nhóm đã chia sẻ ({ownPolicy.shares.length})</Link></Button> : null}
        </section>
        <section aria-label="Thành viên nhóm" className="mentor-project-roster">
          <h2 className="flex items-center gap-2 font-semibold"><Users size={18} aria-hidden="true" />Thành viên nhóm{data.basics?.team.length ? ` (${data.basics.team.length})` : ""}</h2>
          {data.basics?.team.length ? <ul>{data.basics.team.map(person => <li key={person.id}><span className="mentor-project-person-avatar" aria-hidden="true">{person.name.trim().split(/\s+/).slice(-2).map(word => word[0]).join("")}</span><span className="mentor-project-person-copy"><strong>{person.name}</strong><small>{person.role === "OWNER" ? "Chủ dự án" : "Thành viên"}</small></span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Chưa có thông tin thành viên để hiển thị.</p>}
        </section>
      </div>
      <details className="mentor-project-contributions"><summary>Ghi nhận và xác nhận đóng góp nghiên cứu của tôi</summary><div className="mt-4"><WorkContributionsPanel mentorView projectId={data.projectId} currentUserId={data.viewerId} readOnly={data.readOnly} /></div></details>
    </div>
  </div>;
}
