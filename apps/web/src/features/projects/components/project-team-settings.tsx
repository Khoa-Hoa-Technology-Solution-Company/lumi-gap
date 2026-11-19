import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { IProject } from "@trend/shared-types";
import { SlidersHorizontal, Users, Shield, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectTeam } from "../hooks/use-projects";
import { ProjectMembersTab } from "./project-members-tab";
import { ProjectMemberInvite } from "./project-member-invite";
import { ProjectMentorSummary } from "./project-mentor-summary";
import { ProjectGeneralSettings, ProjectPrivacySettings } from "./project-settings-form";
import { ProjectSecurityPanel } from "./project-security-panel";
import { canLeaveWorkspace, projectSectionHref } from "./workspace-common";
import { ProjectLifecycleSection } from "./project-lifecycle-section";

function Pagination({ page, totalPages, onChange, label }: { page: number; totalPages: number; onChange: (page: number) => void; label: string }) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-end gap-3 py-3 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t("Previous")}
      </Button>
      <span className="text-xs text-muted-foreground">{t("Page {{page}} of {{total}}", { page, total: totalPages })}</span>
      <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        {t("Next")}
      </Button>
    </nav>
  );
}

export function ProjectTeamSettings({ project }: { project: IProject }) {
  const { t } = useI18n();
  const userId = useAuthStore(state => state.user?.id);
  const [params, setParams] = useSearchParams();
  const settings = params.get("team") === "settings";
  const [page, setPage] = useState(1);
  const [invitationPage, setInvitationPage] = useState(1);
  const team = useProjectTeam(project._id, page, invitationPage);
  useEffect(() => {
    if (!team.data) return;
    setPage(current => Math.min(current, Math.max(1, team.data.memberMeta.totalPages)));
    setInvitationPage(current => Math.min(current, Math.max(1, team.data.invitationMeta.totalPages)));
  }, [team.data]);

  return (
    <div className="project-team-settings space-y-6" data-no-i18n>
      <header className="project-team-hero rounded-2xl border border-border/80 bg-card p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs shrink-0 mt-0.5">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 mb-1">
              <Shield className="h-3 w-3" />
              <span>{t("Team & Workspace")}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("Team & settings")}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("Manage who works here and how your project is shared.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 self-start md:self-center flex-wrap">
          {project.accessRole === "OWNER" && project.status !== "ARCHIVED" && (
            <ProjectMemberInvite projectId={project._id} projectTitle={project.title} ownerId={project.ownerId} members={project.members} />
          )}
          <Badge variant="outline" className="gap-1.5 font-medium py-1.5 px-3 bg-card border-border/80 shadow-xs">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span>{project.accessRole === "OWNER" ? t("Owner") : t("Member")}</span>
          </Badge>
          <Badge variant="secondary" className="gap-2 font-medium py-1.5 px-3 border border-border/40">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                project.status === "ACTIVE"
                  ? "bg-emerald-500 animate-pulse"
                  : project.status === "COMPLETED"
                  ? "bg-blue-500"
                  : project.status === "ARCHIVED"
                  ? "bg-slate-400"
                  : project.status === "ON_HOLD"
                  ? "bg-amber-400"
                  : "bg-amber-500"
              )}
            />
            <span>{t({ PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" }[project.status] ?? project.status)}</span>
          </Badge>
        </div>
      </header>

      <div className="project-team-subnav" role="tablist" aria-label={t("Team & settings")}>
        {([false, true] as const).map(value => (
          <button
            type="button"
            role="tab"
            key={String(value)}
            tabIndex={settings === value ? 0 : -1}
            id={value ? "project-settings-tab" : "project-people-tab"}
            aria-selected={settings === value}
            aria-controls={value ? "project-settings-panel" : "project-people-panel"}
            onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const target = event.key === "Home" ? false : event.key === "End" ? true : !value;
              document.getElementById(target ? "project-settings-tab" : "project-people-tab")?.click();
              document.getElementById(target ? "project-settings-tab" : "project-people-tab")?.focus();
            }}
            onClick={async () => {
              if (!(await canLeaveWorkspace())) return;
              const next = new URLSearchParams(params);
              if (value) next.set("team", "settings");
              else next.delete("team");
              setParams(next, { replace: true });
            }}
          >
            {value ? <SlidersHorizontal className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            <span>{t(value ? "Project settings" : "People")}</span>
            {!value && team.data?.members?.length ? (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                {team.data.memberMeta.total || team.data.members.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {settings ? (
        <section id="project-settings-panel" role="tabpanel" aria-labelledby="project-settings-tab">
          <div className="max-w-2xl min-w-0 space-y-7">
        {project.accessRole !== "OWNER" && <p className="text-sm text-muted-foreground">{t("Only the owner can change project settings.")}</p>}
        <ProjectGeneralSettings key={`general:${project._id}`} project={project} />
        <ProjectPrivacySettings key={`privacy:${project._id}`} project={project} />
        <ProjectSecurityPanel project={project} />
        <p className="text-sm text-muted-foreground"><Link to={projectSectionHref(project._id, "support")} className="text-primary underline-offset-4 hover:underline">{t("Looking for a mentor? Manage discovery in Academic Support → Mentor.")}</Link></p>
        <ProjectLifecycleSection project={project} />
      </div>
        </section>
      ) : (
        <section id="project-people-panel" role="tabpanel" aria-labelledby="project-people-tab">
          {team.isLoading ? (
            <div role="status" aria-label={t("Loading team…")} className="space-y-4">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : team.isError || !team.data ? (
            <div role="alert" className="rounded-xl border border-border/80 bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("Could not load the team. Try again.")}</p>
              <Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => void team.refetch()}>
                <RotateCcw className="h-4 w-4" />
                {t("Try again")}
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <ProjectMentorSummary projectId={project._id} />
              </div>
              <ProjectMembersTab
                projectId={project._id}
                projectTitle={project.title}
                members={team.data.members}
                pendingInvitations={team.data.invitations}
                ownerId={project.ownerId}
                currentUserId={userId}
                readOnly={project.status === "ARCHIVED"}
                showInviteAction={false}
              />
              <Pagination label={t("Member pages")} page={page} totalPages={team.data.memberMeta.totalPages} onChange={setPage} />
              <Pagination label={t("Invitation pages")} page={invitationPage} totalPages={team.data.invitationMeta.totalPages} onChange={setInvitationPage} />
            </>
          )}

        </section>
      )}
    </div>
  );
}
