import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { IProject } from "@trend/shared-types";
import { FileText, FolderCog, History, Lock, RotateCcw, Shield, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectTeam } from "../hooks/use-projects";
import { ProjectMembersTab } from "./project-members-tab";
import { ProjectMentorSummary } from "./project-mentor-summary";
import { ProjectGeneralSettings, ProjectPrivacySettings } from "./project-settings-form";
import { ProjectSecurityPanel } from "./project-security-panel";
import { canLeaveWorkspace } from "./workspace-common";
import { ProjectLifecycleSection } from "./project-lifecycle-section";

type SettingsSection = "general" | "privacy" | "security" | "audit" | "lifecycle";

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string; icon: typeof FileText }> = [
  { id: "general", label: "General information", icon: FileText },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "security", label: "Security & AI", icon: ShieldCheck },
  { id: "audit", label: "Activity log", icon: History },
  { id: "lifecycle", label: "Project management", icon: FolderCog },
];

const VALID_SECTIONS = new Set<SettingsSection>(SETTINGS_SECTIONS.map(item => item.id));

function resolveSettingsSection(raw: string | null): SettingsSection {
  return raw && VALID_SECTIONS.has(raw as SettingsSection) ? (raw as SettingsSection) : "general";
}

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
  const activeSection = resolveSettingsSection(params.get("section"));
  const [page, setPage] = useState(1);
  const [invitationPage, setInvitationPage] = useState(1);
  const team = useProjectTeam(project._id, page, invitationPage);
  useEffect(() => {
    if (!team.data) return;
    setPage(current => Math.min(current, Math.max(1, team.data.memberMeta.totalPages)));
    setInvitationPage(current => Math.min(current, Math.max(1, team.data.invitationMeta.totalPages)));
  }, [team.data]);

  const selectSection = async (nextSection: SettingsSection) => {
    if (nextSection === activeSection) return;
    if (!(await canLeaveWorkspace())) return;
    const next = new URLSearchParams(params);
    next.set("team", "settings");
    if (nextSection === "general") next.delete("section");
    else next.set("section", nextSection);
    setParams(next, { replace: true });
  };

  return (
    <div className="project-team-settings space-y-5" data-no-i18n>
      <header className="project-team-hero rounded-2xl border border-border/80 bg-card px-5 py-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <SlidersHorizontal className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">{t("Team & settings")}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">{t("Manage members, project details, and access permissions.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap shrink-0">
          <Badge variant="outline" className="gap-1.5 font-medium py-1 px-2.5 bg-card border-border/80">
            <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>{project.accessRole === "OWNER" ? t("Project owner") : t("Member")}</span>
          </Badge>
          <Badge variant="secondary" className="gap-1.5 font-medium py-1 px-2.5 border border-border/40">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                project.status === "ACTIVE"
                  ? "bg-emerald-500"
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
              if (value) {
                next.set("team", "settings");
              } else {
                next.delete("team");
                next.delete("section");
              }
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
        <section id="project-settings-panel" role="tabpanel" aria-labelledby="project-settings-tab" className="min-w-0">
          <div className="grid grid-cols-1 lg:grid-cols-[216px_minmax(0,1fr)] gap-6 items-start">
            <nav
              aria-label={t("Project settings sections")}
              className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0 lg:sticky lg:top-20"
            >
              {SETTINGS_SECTIONS.map(item => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => void selectSection(item.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t(item.label)}</span>
                  </button>
                );
              })}
            </nav>

            <div className="min-w-0 space-y-5">
              {project.accessRole !== "OWNER" ? (
                <div role="status" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  {t("Only the owner can change project settings.")}
                </div>
              ) : null}

              {activeSection === "general" ? (
                <ProjectGeneralSettings key={`general:${project._id}`} project={project} />
              ) : null}
              {activeSection === "privacy" ? (
                <ProjectPrivacySettings key={`privacy:${project._id}`} project={project} />
              ) : null}
              {activeSection === "security" ? (
                <ProjectSecurityPanel key={`security:${project._id}`} project={project} section="security" />
              ) : null}
              {activeSection === "audit" ? (
                <ProjectSecurityPanel key={`audit:${project._id}`} project={project} section="audit" />
              ) : null}
              {activeSection === "lifecycle" ? (
                <ProjectLifecycleSection key={`lifecycle:${project._id}`} project={project} />
              ) : null}
            </div>
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
                showInviteAction={true}
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
