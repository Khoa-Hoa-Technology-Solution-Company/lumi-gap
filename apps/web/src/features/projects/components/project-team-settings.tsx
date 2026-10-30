import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { IProject, ProjectStatus } from "@trend/shared-types";
import { MoreHorizontal, SlidersHorizontal, Users, Shield, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useArchiveProject, useDeleteProject, useLeaveProject, useProjectTeam, useRestoreProject, useUpdateProject } from "../hooks/use-projects";
import { ProjectMembersTab } from "./project-members-tab";
import { ProjectMentorSummary } from "./project-mentor-summary";
import { ProjectGeneralSettings, ProjectPrivacySettings } from "./project-settings-form";
import { ProjectSecurityPanel } from "./project-security-panel";
import { canLeaveWorkspace, projectSectionHref } from "./workspace-common";

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
        <ProjectLifecycle project={project} />
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
              <ProjectMembersTab
                projectId={project._id}
                projectTitle={project.title}
                members={team.data.members}
                pendingInvitations={team.data.invitations}
                ownerId={project.ownerId}
                currentUserId={userId}
                readOnly={project.status === "ARCHIVED"}
              />
              <Pagination label={t("Member pages")} page={page} totalPages={team.data.memberMeta.totalPages} onChange={setPage} />
              <Pagination label={t("Invitation pages")} page={invitationPage} totalPages={team.data.invitationMeta.totalPages} onChange={setInvitationPage} />
            </>
          )}
          <div className="mt-8">
            <ProjectMentorSummary projectId={project._id} />
          </div>
        </section>
      )}
    </div>
  );
}

function ProjectLifecycle({ project }: { project: IProject }) {
  const { t } = useI18n(), navigate = useNavigate();
  const owner = project.accessRole === "OWNER", archived = project.status === "ARCHIVED";
  const [action, setAction] = useState<"archive" | "restore" | "delete" | "leave" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const archive = useArchiveProject(project._id), restore = useRestoreProject(project._id), remove = useDeleteProject(project._id), leave = useLeaveProject(project._id);
  const pending = archive.isPending || restore.isPending || remove.isPending || leave.isPending;
  const lock = useRef(false);
  const needsTitle = action === "archive" || action === "delete";
  const labels = { archive: "Archive project", restore: "Restore project", delete: "Delete project", leave: "Leave project" };
  const confirm = async () => {
    if (!action || pending || lock.current || needsTitle && confirmation !== project.title) return;
    lock.current = true;
    try {
      if (action === "archive") await archive.mutateAsync();
      else if (action === "restore") await restore.mutateAsync();
      else if (action === "delete") await remove.mutateAsync();
      else await leave.mutateAsync();
      toast.success(t("Project updated")); setAction(null); setConfirmation("");
      if (action === "leave" || action === "delete") navigate("/projects");
    } catch (failure) { toast.error(t((failure as { response?: { status?: number } }).response?.status === 409 ? "This action is blocked to preserve project ownership or research history. Archive the project when appropriate." : "Could not update the project. Please try again.")); }
    finally { lock.current = false; }
  };
  return <details className="min-w-0 border-t pt-6"><summary className="cursor-pointer text-sm font-semibold">{t("Advanced actions")}</summary><div className="mt-4 space-y-5">
    {owner && !archived && <ProjectStatusControl key={`${project._id}:${project.version}`} project={project} />}
    <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="max-w-prose"><h3 className="text-base font-semibold">{t("Archive and deletion")}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{t(owner ? "Archiving preserves research and history and makes the workspace read-only. Empty projects can be deleted." : "Leaving removes your private workspace access. The owner can invite you again.")}</p></div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline">{t("Project actions")}<MoreHorizontal className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      {owner ? <><DropdownMenuItem onSelect={async () => { if ((await canLeaveWorkspace())) setAction(archived ? "restore" : "archive"); }}>{t(archived ? labels.restore : labels.archive)}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={async () => { if ((await canLeaveWorkspace())) setAction("delete"); }}>{t(labels.delete)}</DropdownMenuItem></>
        : <DropdownMenuItem className="text-destructive" onSelect={() => setAction("leave")}>{t(labels.leave)}</DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu>
    </div>
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !pending) { setAction(null); setConfirmation(""); } }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{action ? t(labels[action]) : ""}</DialogTitle><DialogDescription>{t(action === "archive" ? "Members can still read existing research. Pending invitations will be cancelled and discovery will close."
      : action === "restore" ? "Members can collaborate again. Cancelled invitations and closed discovery remain unchanged."
      : action === "delete" ? "Only an empty project without research or collaboration history can be permanently deleted."
      : "You will lose access to private project content. This cannot leave the project without an owner.")}</DialogDescription></DialogHeader>
      {needsTitle ? <div className="space-y-2"><Label htmlFor="project-action-confirm">{t("Type {{title}} to confirm", { title: project.title })}</Label><Input id="project-action-confirm" value={confirmation} disabled={pending} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></div> : null}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => { setAction(null); setConfirmation(""); }}>{t("Cancel")}</Button><Button type="button" variant={action === "restore" ? "default" : "destructive"} disabled={pending || needsTitle && confirmation !== project.title} onClick={() => void confirm()}>{t(pending ? "Updating…" : "Confirm")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div></details>;
}

function ProjectStatusControl({ project }: { project: IProject }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(project.status), update = useUpdateProject(project._id);
  return <form className="space-y-2" onSubmit={async event => {
    event.preventDefault(); if (update.isPending || status === project.status || !(await canLeaveWorkspace())) return;
    try { await update.mutateAsync({ status, expectedVersion: project.version }); toast.success(t("Project updated")); }
    catch { toast.error(t("Project settings changed. Refresh before saving again.")); }
  }}><label className="block space-y-2 text-sm"><span className="font-medium">{t("Project lifecycle")}</span><select className="project-form-select" value={status} disabled={update.isPending} onChange={event => setStatus(event.target.value as ProjectStatus)}>{Object.entries({ PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed" }).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label><p className="text-xs text-muted-foreground">{t("Research stage is managed in Overview. Lifecycle controls whether the project is ongoing, paused or completed.")}</p><Button variant="outline" type="submit" size="sm" disabled={status === project.status || update.isPending}>{t("Update lifecycle")}</Button></form>;
}
