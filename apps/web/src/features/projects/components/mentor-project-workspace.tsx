import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Calendar,
  ChevronRight,
  FileText,
  GraduationCap,
  ListChecks,
  Lock,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  mentorRoleLabelKeys,
  type MentorAccessWorkspace as Workspace,
  type MentorProjectTeamMember,
  type MentorRole,
} from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { canLeaveWorkspace, WorkspaceHeading } from "./workspace-common";
import { MentorAccessWorkspace } from "./mentor-access-workspace";
import { ProjectDiscussionPanel } from "./project-discussion-panel";
import { ProjectSectionNav, type ProjectTab } from "./project-section-nav";
import { ProjectHorizontalTabs } from "./project-horizontal-tabs";
import { MentorProjectTasks } from "./mentor-project-tasks";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";
import { ResearchContributionsPanel } from "./research-contributions-panel";
import { WorkContributionsPanel } from "./work-contributions";
import { PersonalContributionProfile } from "./personal-contribution-profile";
import { MentorRoleAssignments } from "./mentor-role-assignments";
import { formatPermissionLabel } from "./research-team-dossier-sheet";
import { useI18n } from "@/i18n";
import "../project-workspace.css";
import "../workspace-coordination.css";
import "@/pages/academics/mentor-project.css";

const MENTOR_PROJECT_TAB_LABELS: Partial<Record<ProjectTab, string>> = {
  contributions: "mentorWorkspace.myContributions",
};

export function MentorProjectNav({
  contributions = true,
  horizontal = false,
}: {
  contributions?: boolean;
  horizontal?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const active: ProjectTab =
    params.get("tab") === "contributions"
      ? "contributions"
      : params.get("tab") === "chat"
        ? "chat"
        : params.get("tab") === "tasks"
          ? "tasks"
          : "overview";
  const allowed: readonly ProjectTab[] = contributions
    ? ["overview", "tasks", "chat", "contributions"]
    : ["overview", "tasks", "chat"];

  const handleChange = async (tab: ProjectTab) => {
    if (!(await canLeaveWorkspace())) return;
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    if (tab === "contributions") next.delete("contributionTab");
    if (tab === "chat") next.set("channel", "mentors");
    else next.delete("channel");
    setParams(next);
  };

  if (horizontal) {
    return (
      <ProjectHorizontalTabs
        activeTab={active}
        paperCount={0}
        memberCount={0}
        allowedTabs={allowed}
        labelOverrides={MENTOR_PROJECT_TAB_LABELS}
        onChange={handleChange}
      />
    );
  }
  return (
    <ProjectSectionNav
      activeTab={active}
      paperCount={0}
      memberCount={0}
      allowedTabs={allowed}
      onChange={handleChange}
    />
  );
}

function personInitials(name: string): string {
  const cleaned = name.replace(/\([^)]*\)/g, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toLocaleUpperCase("vi-VN");
  }
  return parts[0]?.slice(0, 2).toLocaleUpperCase("vi-VN") || "TV";
}

function formatAcademicRole(role: string | null | undefined, isVi: boolean): string | null {
  if (!role) return null;
  if (role === "STUDENT") return isVi ? "Sinh viên nghiên cứu" : "Student researcher";
  if (role === "RESEARCHER") return isVi ? "Nghiên cứu viên" : "Researcher";
  if (role === "LECTURER") return isVi ? "Giảng viên" : "Lecturer";
  return role;
}

export function MentorProjectWorkspace({
  data,
  standalone = false,
  embedded = false,
}: {
  data: Workspace;
  standalone?: boolean;
  embedded?: boolean;
}) {
  const { t, language } = useI18n();
  const isVi = language !== "en";
  const [params] = useSearchParams();
  const [selectedMember, setSelectedMember] = useState<MentorProjectTeamMember | null>(null);

  const href = (path: string) => (embedded ? mentorWorkspaceDestination(path) : path);
  if (params.get("section") === "resources" || params.get("view") === "resources") {
    return <MentorAccessWorkspace projectId={data.projectId} mentorView embedded />;
  }

  const activeTab: ProjectTab =
    params.get("tab") === "contributions"
      ? "contributions"
      : params.get("tab") === "chat"
        ? "chat"
        : params.get("tab") === "tasks"
          ? "tasks"
          : "overview";

  const ownPolicy = data.policies.find(p => p.mentorId === data.viewerId && p.policy.effective);
  const contributionAccess = Boolean(ownPolicy?.policy.permissions.includes("CONTRIBUTIONS_VIEW"));
  const panelProps = (tab: ProjectTab) =>
    standalone && embedded
      ? { role: "tabpanel" as const, id: `project-panel-${tab}`, "aria-labelledby": `project-content-tab-${tab}` }
      : {};

  const statuses: Record<string, { vi: string; en: string }> = {
    PLANNING: { vi: "Đang lập kế hoạch", en: "Planning" },
    ACTIVE: { vi: "Đang thực hiện", en: "Active" },
    PAUSED: { vi: "Tạm dừng", en: "Paused" },
    COMPLETED: { vi: "Đã hoàn thành", en: "Completed" },
    ARCHIVED: { vi: "Đã lưu trữ", en: "Archived" },
  };
  const statusLabel = statuses[data.basics?.status ?? ""]
    ? isVi
      ? statuses[data.basics?.status ?? ""]!.vi
      : statuses[data.basics?.status ?? ""]!.en
    : null;

  const mentorRole = (ownPolicy?.mentorRole as MentorRole | undefined) ?? undefined;
  const mentorRoleLabel = mentorRole && mentorRole in mentorRoleLabelKeys
    ? t(mentorRoleLabelKeys[mentorRole])
    : isVi ? "Cố vấn nghiên cứu" : "Research mentor";
  const teamCount = data.basics?.team.length ?? 0;

  return (
    <div className="project-workspace coord-mentor-page" data-no-i18n>
      <div className="project-page-width mentor-project-shell-inner">
        {/* Persistent Shared Project Header — identical position & chrome across every tab */}
        <header className="mentor-project-context">
          <div className="min-w-0 flex-1 space-y-1.5">
            {!embedded && (
              <Link to="/academic-support?view=active" className="text-sm text-muted-foreground hover:text-primary">
                {isVi ? "Nhóm đang hướng dẫn" : "Mentored teams"}
              </Link>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="mentor-project-context-label">
                {isVi ? "Dự án hướng dẫn" : "Mentored project"}
              </span>
              {statusLabel ? (
                <span className="mentor-project-stage">{statusLabel}</span>
              ) : null}
              <Badge variant="secondary" className="h-5 px-2 text-[11px] font-medium gap-1">
                <GraduationCap className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{mentorRoleLabel}</span>
              </Badge>
              {teamCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isVi ? `${teamCount} thành viên` : `${teamCount} members`}</span>
                </span>
              ) : null}
              {data.readOnly ? (
                <Badge variant="outline" className="h-5 px-2 text-[11px] text-muted-foreground">
                  {isVi ? "Chỉ đọc" : "Read-only"}
                </Badge>
              ) : null}
            </div>
            <h1>{data.title}</h1>
            {data.basics?.researchField ? (
              <p className="mentor-project-field">{data.basics.researchField}</p>
            ) : null}
          </div>

          {ownPolicy?.shares.length ? (
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5 mt-1">
              <Link to={href(`/academic-support/projects/${encodeURIComponent(data.projectId)}?view=resources`)}>
                <FileText size={14} aria-hidden="true" />
                <span>
                  {isVi ? `Tài liệu chia sẻ (${ownPolicy.shares.length})` : `Shared items (${ownPolicy.shares.length})`}
                </span>
              </Link>
            </Button>
          ) : null}
        </header>

        {/* Persistent Shared Project Tab Navigation — fixed position across Overview, Tasks, Chat, Contributions */}
        {standalone ? (
          <MentorProjectNav contributions={contributionAccess} horizontal={embedded} />
        ) : null}

        {/* Active Tab Content Region */}
        <div className="mentor-project-tab-body">
          {activeTab === "contributions" ? (
            <div {...panelProps("contributions")} className="space-y-6">
              {params.get("contributionTab") === "declarations" && contributionAccess ? (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={href(`/projects/${data.projectId}?tab=contributions`)}>
                      ← {isVi ? "Đóng góp của tôi" : "My contributions"}
                    </Link>
                  </Button>
                  <WorkContributionsPanel
                    projectId={data.projectId}
                    currentUserId={data.viewerId}
                    readOnly={data.readOnly}
                    mentorView
                  />
                </>
              ) : params.get("contributionTab") === "team" && contributionAccess ? (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={href(`/projects/${data.projectId}?tab=contributions`)}>
                      ← {isVi ? "Đóng góp của tôi" : "My contributions"}
                    </Link>
                  </Button>
                  <ResearchContributionsPanel projectId={data.projectId} />
                </>
              ) : (
                <>
                  <PersonalContributionProfile scope="project" projectId={data.projectId} embedded />
                  {contributionAccess ? (
                    <div className="flex flex-wrap gap-2 border-t pt-4">
                      <Button asChild variant="outline" size="sm">
                        <Link to={href(`/projects/${encodeURIComponent(data.projectId)}?tab=contributions&contributionTab=team`)}>
                          {t("researchContribution.research")}
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to={href(`/projects/${encodeURIComponent(data.projectId)}?tab=contributions&contributionTab=declarations`)}>
                          {t("Declared contributions")}
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : activeTab === "tasks" ? (
            <div {...panelProps("tasks")}>
              <MentorProjectTasks
                key={`${data.projectId}:${data.viewerId}`}
                projectId={data.projectId}
                readOnly={data.readOnly}
              />
            </div>
          ) : activeTab === "chat" ? (
            <div {...panelProps("chat")} className="coord-discussions">
              <WorkspaceHeading
                title={isVi ? "Trò chuyện nhóm" : "Group chat"}
                description={isVi ? "Trao đổi trực tiếp với nhóm nghiên cứu trong kênh cố vấn." : "Collaborate with the research team in the mentor channel."}
              />
              <ProjectDiscussionPanel projectId={data.projectId} paperCount={0} mentorView />
            </div>
          ) : (
            <div className="space-y-6" {...panelProps("overview")}>
              <div className="mentor-project-overview-grid">
                <section className="mentor-project-overview-main">
                  <MentorRoleAssignments projectId={data.projectId} />

                  {/* Project Information */}
                  <div className="mentor-project-summary space-y-3">
                    <h2>{isVi ? "Thông tin dự án" : "Project information"}</h2>
                    <p className={!data.basics?.summary ? "text-muted-foreground" : undefined}>
                      {data.basics?.summary ||
                        (isVi
                          ? "Nhóm chưa thêm giới thiệu. Bạn có thể trao đổi với các thành viên để làm rõ mục tiêu nghiên cứu."
                          : "The team has not added a project summary yet. Use the mentor conversation to align on goals.")}
                    </p>
                    {data.basics?.researchAreas?.length ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {data.basics.researchAreas.map(area => (
                          <span
                            key={area}
                            className="rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/85"
                          >
                            {t(area)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* My Mentoring Relationship & Effective Permissions */}
                  {ownPolicy ? (
                    <section className="mentor-project-summary space-y-3" aria-label={isVi ? "Quan hệ hướng dẫn của tôi" : "My mentoring relationship"}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                          <span>{isVi ? "Quan hệ hướng dẫn & quyền truy cập hiện tại" : "My mentoring relationship & effective access"}</span>
                        </h2>
                        <Badge variant="outline" className="text-[11px] border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          {isVi ? "Đang hiệu lực" : "Active"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          <strong className="text-foreground">{isVi ? "Vai trò: " : "Role: "}</strong>
                          {mentorRoleLabel}
                        </span>
                        {ownPolicy.startedAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {isVi ? "Bắt đầu: " : "Started: "}
                              {new Date(ownPolicy.startedAt).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                            </span>
                          </span>
                        ) : null}
                        {ownPolicy.policy.expiresAt ? (
                          <span>
                            {isVi ? "Hiệu lực đến: " : "Valid until: "}
                            {new Date(ownPolicy.policy.expiresAt).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                          </span>
                        ) : null}
                      </div>
                      {ownPolicy.policy.permissions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {ownPolicy.policy.permissions.map(perm => (
                            <span
                              key={perm}
                              className="rounded-md border border-border/75 bg-muted/30 px-2 py-0.5 text-[11px] text-foreground/90"
                            >
                              {formatPermissionLabel(perm, language)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {/* Quick Collaboration Actions */}
                  <section className="mentor-project-collaboration" aria-label={isVi ? "Trao đổi với nhóm" : "Group collaboration"}>
                    <h3>{isVi ? "Phối hợp & công việc cần chú ý" : "Collaboration & work requiring attention"}</h3>
                    <p>
                      {isVi
                        ? "Trao đổi trực tiếp trong kênh cố vấn hoặc xem các công việc và bản thảo được giao cho bạn."
                        : "Message the team in the mentor channel or review tasks and manuscripts assigned to you."}
                    </p>
                    <div className="mentor-project-actions">
                      <Button asChild size="sm">
                        <Link to={href(`/projects/${encodeURIComponent(data.projectId)}?tab=chat&channel=mentors`)}>
                          <MessageSquare size={15} aria-hidden="true" />
                          <span>{isVi ? "Mở trao đổi" : "Open conversation"}</span>
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link to={href(`/projects/${encodeURIComponent(data.projectId)}?tab=tasks`)}>
                          <ListChecks size={15} aria-hidden="true" />
                          <span>{isVi ? "Xem công việc của tôi" : "View my tasks"}</span>
                        </Link>
                      </Button>
                    </div>
                  </section>

                  {data.readOnly ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      {isVi ? "Dự án đang ở chế độ chỉ đọc." : "This project is currently read-only."}
                    </p>
                  ) : null}

                  {ownPolicy ? (
                    <details className="mentor-project-contributions">
                      <summary>
                        {isVi ? "Tài liệu được chia sẻ & thỏa thuận ghi nhận" : "Shared materials & recognition agreements"}
                      </summary>
                      <div className="pt-3">
                        <MentorAccessWorkspace projectId={data.projectId} mentorView embedded />
                      </div>
                    </details>
                  ) : null}
                </section>

                {/* Clickable Team Members Roster (respects Academic Profile privacy) */}
                <section aria-label={isVi ? "Thành viên nhóm" : "Team members"} className="mentor-project-roster">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Users size={18} aria-hidden="true" />
                    <span>
                      {isVi ? "Thành viên nhóm" : "Team members"}
                      {teamCount ? ` (${teamCount})` : ""}
                    </span>
                  </h2>
                  {data.basics?.team.length ? (
                    <ul>
                      {data.basics.team.map(person => {
                        const accessible = person.profileAccessible !== false;
                        const roleText = person.role === "OWNER" ? (isVi ? "Chủ dự án" : "Project Owner") : (isVi ? "Thành viên" : "Member");
                        const acadRoleText = formatAcademicRole(person.academicRole, isVi);
                        const subtitle = [roleText, acadRoleText].filter(Boolean).join(" · ");

                        if (!accessible) {
                          return (
                            <li key={person.id} className="mentor-project-member-row">
                              <span className="mentor-project-person-avatar" aria-hidden="true">
                                {personInitials(person.name)}
                              </span>
                              <span className="mentor-project-person-copy">
                                <strong>{person.name}</strong>
                                <small>{subtitle}</small>
                                <small className="inline-flex items-center gap-1 text-[11px]">
                                  <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  <span>{isVi ? "Hồ sơ học thuật giới hạn" : "Limited profile"}</span>
                                </small>
                              </span>
                            </li>
                          );
                        }

                        return (
                          <li key={person.id} className="mentor-project-member-row">
                            <button
                              type="button"
                              className="mentor-project-member-trigger"
                              onClick={() => setSelectedMember(person)}
                              aria-label={isVi ? `Xem hồ sơ học thuật của ${person.name}` : `View Academic Profile for ${person.name}`}
                            >
                              <span className="mentor-project-person-avatar" aria-hidden="true">
                                {person.avatarUrl ? (
                                  <img
                                    src={person.avatarUrl}
                                    alt=""
                                    className="h-full w-full rounded-full object-cover"
                                  />
                                ) : (
                                  personInitials(person.name)
                                )}
                              </span>
                              <span className="mentor-project-person-copy">
                                <strong className="mentor-project-member-name">{person.name}</strong>
                                <small>{subtitle}</small>
                                {person.institutionName ? (
                                  <small className="truncate">{person.institutionName}</small>
                                ) : null}
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {isVi ? "Chưa có thông tin thành viên để hiển thị." : "No team member information available."}
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compact Authorized Academic Profile Preview Drawer for Clicked Team Member */}
      <Sheet open={Boolean(selectedMember)} onOpenChange={open => { if (!open) setSelectedMember(null); }}>
        <SheetContent className="flex flex-col p-0 sm:max-w-md" closeLabel={t("Close")} data-no-i18n>
          {selectedMember ? (
            <>
              <div className="border-b border-border/80 px-6 py-4 pr-12">
                <div className="flex items-center gap-3">
                  <span className="mentor-project-person-avatar h-11 w-11 text-sm" aria-hidden="true">
                    {selectedMember.avatarUrl ? (
                      <img
                        src={selectedMember.avatarUrl}
                        alt=""
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      personInitials(selectedMember.name)
                    )}
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="text-base truncate">{selectedMember.name}</SheetTitle>
                    <SheetDescription className="text-xs">
                      {[
                        selectedMember.role === "OWNER" ? (isVi ? "Chủ dự án" : "Project Owner") : (isVi ? "Thành viên dự án" : "Team member"),
                        formatAcademicRole(selectedMember.academicRole, isVi),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </SheetDescription>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 px-6 py-5 text-sm">
                {(selectedMember.institutionName || selectedMember.department || selectedMember.programName) ? (
                  <div className="space-y-1.5 rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                      <span>{selectedMember.institutionName || (isVi ? "Đơn vị học thuật" : "Academic affiliation")}</span>
                    </p>
                    {(selectedMember.department || selectedMember.programName) ? (
                      <p className="text-muted-foreground">
                        {[selectedMember.department, selectedMember.programName].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {selectedMember.headline ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Giới thiệu học thuật" : "Academic headline"}
                    </p>
                    <p className="text-sm leading-6 text-foreground/90">{selectedMember.headline}</p>
                  </div>
                ) : null}

                {selectedMember.researchInterests?.length ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Hướng quan tâm nghiên cứu" : "Research interests"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMember.researchInterests.map(item => (
                        <span key={item} className="rounded-md border border-border/80 bg-muted/35 px-2 py-0.5 text-xs">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedMember.skills?.length ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Kỹ năng nghiên cứu" : "Research skills"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMember.skills.map(item => (
                        <span key={item} className="rounded-md border border-border/80 bg-background px-2 py-0.5 text-xs">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="text-xs leading-5 text-muted-foreground">
                  {isVi
                    ? "Chỉ hiển thị thông tin học thuật được phép chia sẻ theo thiết lập quyền riêng tư của thành viên."
                    : "Only academic details permitted by this member's privacy settings are shown."}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border/80 bg-muted/15 px-6 py-3.5">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMember(null)}>
                  {t("Close")}
                </Button>
                <Button asChild size="sm" className="gap-1.5">
                  <Link
                    to={
                      selectedMember.publicHandle
                        ? `/u/${encodeURIComponent(selectedMember.publicHandle)}`
                        : `/academics/${encodeURIComponent(selectedMember.id)}`
                    }
                    onClick={() => setSelectedMember(null)}
                  >
                    <span>{isVi ? "Xem hồ sơ học thuật" : "View Academic Profile"}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
