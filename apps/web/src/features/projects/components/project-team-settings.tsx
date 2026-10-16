import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IProject, ProjectStatus, ResearchApproach } from "@trend/shared-types";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useArchiveProject, useDeleteProject, useLeaveProject, useProjectTeam, useRestoreProject, useUpdateProject } from "../hooks/use-projects";
import { academicSupportApi } from "../api/academic-support.api";
import { ProjectMembersTab } from "./project-members-tab";
import { ProjectMentorSummary } from "./project-mentor-summary";
import { ProjectResearchFields } from "./project-research-fields";

function Pagination({ page, totalPages, onChange, label }: { page: number; totalPages: number; onChange: (page: number) => void; label: string }) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  return <nav aria-label={label} className="flex flex-wrap items-center justify-end gap-3 py-3 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t("Previous")}</Button><span>{t("Page {{page}} of {{total}}", { page, total: totalPages })}</span><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>{t("Next")}</Button></nav>;
}

export function ProjectTeamSettings({ project }: { project: IProject }) {
  const { t } = useI18n();
  const userId = useAuthStore(state => state.user?.id);
  const [params, setParams] = useSearchParams();
  const settings = params.get("team") === "settings";
  const [page, setPage] = useState(1), [invitationPage, setInvitationPage] = useState(1);
  const team = useProjectTeam(project._id, page, invitationPage);
  return <div className="project-team-settings" data-no-i18n>
    <header className="mb-6"><h2 className="text-2xl font-semibold">{t("Team & settings")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Manage who works here and how your project is shared.")}</p></header>
    <div className="project-team-subnav" role="tablist" aria-label={t("Team & settings")}>
      {([false, true] as const).map(value => <button type="button" role="tab" key={String(value)} tabIndex={settings === value ? 0 : -1} id={value ? "project-settings-tab" : "project-people-tab"} aria-selected={settings === value} aria-controls={value ? "project-settings-panel" : "project-people-panel"} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === "Home" ? false : event.key === "End" ? true : !value;
        document.getElementById(target ? "project-settings-tab" : "project-people-tab")?.click();
        document.getElementById(target ? "project-settings-tab" : "project-people-tab")?.focus();
      }} onClick={() => { const next = new URLSearchParams(params); if (value) next.set("team", "settings"); else next.delete("team"); setParams(next, { replace: true }); }}>{t(value ? "Project settings" : "People")}</button>)}
    </div>
    {settings ? <section id="project-settings-panel" role="tabpanel" aria-labelledby="project-settings-tab"><ProjectSettingsForm key={`${project._id}:${project.version ?? project.updatedAt}`} project={project} /></section>
      : <section id="project-people-panel" role="tabpanel" aria-labelledby="project-people-tab">
        {team.isLoading ? <div role="status" aria-label={t("Loading team…")} className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-16 w-full" /></div>
          : team.isError || !team.data ? <div role="alert" className="py-8"><p className="text-sm text-muted-foreground">{t("Could not load the team. Try again.")}</p><Button type="button" variant="outline" className="mt-3" onClick={() => void team.refetch()}>{t("Try again")}</Button></div>
          : <><ProjectMembersTab projectId={project._id} projectTitle={project.title} members={team.data.members} pendingInvitations={team.data.invitations} ownerId={project.ownerId} currentUserId={userId} readOnly={project.status === "ARCHIVED"} />
            <Pagination label={t("Member pages")} page={page} totalPages={team.data.memberMeta.totalPages} onChange={setPage} />
            <Pagination label={t("Invitation pages")} page={invitationPage} totalPages={team.data.invitationMeta.totalPages} onChange={setInvitationPage} />
          </>}
        <div className="mt-8"><ProjectMentorSummary projectId={project._id} /></div>
      </section>}
  </div>;
}

function ProjectSettingsForm({ project }: { project: IProject }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(project.title), [description, setDescription] = useState(project.description ?? "");
  const [areas, setAreas] = useState(project.researchAreas ?? (project.researchField ? [project.researchField] : []));
  const [approach, setApproach] = useState<ResearchApproach>(project.researchApproach ?? "UNDECIDED");
  const [status, setStatus] = useState(project.status);
  const [visibility, setVisibility] = useState(["PUBLIC", "PUBLIC_SUMMARY"].includes(project.visibility) ? "PUBLIC" : "PRIVATE");
  const [summary, setSummary] = useState(project.publicSummary ?? "");
  const [error, setError] = useState("");
  const update = useUpdateProject(project._id), lock = useRef(false);
  const owner = project.accessRole === "OWNER", archived = project.status === "ARCHIVED";
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!owner || archived || lock.current) return;
    if (!title.trim()) { setError(t("Enter a project title.")); return; }
    lock.current = true; setError("");
    try { await update.mutateAsync({ title: title.trim(), description: description.trim(), researchAreas: areas, researchApproach: approach, status, visibility: visibility as "PRIVATE" | "PUBLIC", publicSummary: summary.trim(), expectedVersion: project.version }); toast.success(t("Project settings saved")); }
    catch (failure) { setError(t((failure as { response?: { status?: number } }).response?.status === 409 ? "Project settings changed. Refresh before saving again." : "Could not save project settings. Your changes are still here.")); }
    finally { lock.current = false; }
  };
  return <div className="space-y-8">
    {!owner ? <p className="text-sm text-muted-foreground">{t("Only the owner can change project settings.")}</p> : null}
    <form onSubmit={save} className="space-y-5">
      <fieldset disabled={!owner || archived || update.isPending} className="min-w-0 space-y-5">
        <h3 className="text-lg font-semibold">{t("Project overview")}</h3>
        <div className="space-y-2"><Label htmlFor="project-settings-title">{t("Project title")}</Label><Input id="project-settings-title" value={title} maxLength={100} required onChange={event => setTitle(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="project-settings-objective">{t("Research problem or objective")}</Label><textarea id="project-settings-objective" rows={3} className="project-form-textarea" value={description} maxLength={5000} onChange={event => setDescription(event.target.value)} /></div>
        <ProjectResearchFields areas={areas} approach={approach} onAreasChange={setAreas} onApproachChange={setApproach} />
        <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium"><span>{t("Project status")}</span><select className="project-form-select" value={status} onChange={event => setStatus(event.target.value as ProjectStatus)}>{Object.entries({ PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ...(archived ? { ARCHIVED: "Archived" } : {}) }).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
          <label className="space-y-2 text-sm font-medium"><span>{t("Visibility")}</span><select className="project-form-select" value={visibility} onChange={event => setVisibility(event.target.value)}><option value="PRIVATE">{t("Private")}</option><option value="PUBLIC">{t("Public summary")}</option></select></label>
        </div>
        <div className="space-y-2"><Label htmlFor="project-public-summary">{t("Approved public summary")}</Label><textarea id="project-public-summary" className="project-form-textarea" value={summary} maxLength={2000} rows={3} onChange={event => setSummary(event.target.value)} /><p className="text-xs leading-5 text-muted-foreground">{t("When public, only the title, research areas, status and this summary are published. Papers, notes, team and research outputs stay private.")}</p></div>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {owner && !archived ? <Button type="submit" disabled={update.isPending || !title.trim()}>{t(update.isPending ? "Saving…" : "Save project settings")}</Button> : null}
    </form>
    {owner ? <DiscoverySettings project={project} /> : null}
    <ProjectLifecycle project={project} />
  </div>;
}

function DiscoverySettings({ project }: { project: IProject }) {
  const { t } = useI18n();
  const readOnly = project.status === "ARCHIVED" || project.status === "COMPLETED";
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["project", project._id, "discovery-settings"], queryFn: () => academicSupportApi.settings(project._id) });
  const [draft, setDraft] = useState<{ discovery: string; summary: string; expertise: string[] } | null>(null);
  const [needsText, setNeedsText] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (input: { discovery: string; summary: string; expertise: string[] }) => academicSupportApi.saveSettings(project._id, input), onSuccess: () => { client.invalidateQueries({ queryKey: ["project", project._id] }); toast.success(t("Discovery settings saved")); }, onError: () => toast.error(t("Could not save discovery settings")) });
  const value = draft ?? settings.data;
  const expertise = (needsText ?? value?.expertise.join(", ") ?? "").split(",").map(term => term.trim()).filter(Boolean);
  const validNeeds = expertise.length <= 10 && expertise.every(term => term.length <= 120);
  return <section className="space-y-3 border-t pt-6"><h3 className="text-lg font-semibold">{t("Mentor discovery")}</h3><p className="text-sm leading-6 text-muted-foreground">{t("Independent of project visibility. Verified lecturers see only the summary and mentoring needs you approve here.")}</p>
    {settings.isLoading ? <Skeleton className="h-20 w-full" /> : settings.isError || !value ? <Button type="button" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button>
      : <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (validNeeds) save.mutate({ discovery: value.discovery, summary: value.summary, expertise }); }}>
        <fieldset disabled={readOnly || save.isPending} className="min-w-0 space-y-4">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={value.discovery === "SEEKING_MENTOR"} onChange={event => setDraft({ ...value, discovery: event.target.checked ? "SEEKING_MENTOR" : "CLOSED" })} />{t("Let verified lecturers discover this project")}</label>
          <label className="block space-y-2 text-sm font-medium"><span>{t("Safe discovery summary")}</span><textarea className="project-form-textarea" value={value.summary} rows={3} minLength={value.discovery === "SEEKING_MENTOR" ? 10 : undefined} maxLength={2000} required={value.discovery === "SEEKING_MENTOR"} onChange={event => setDraft({ ...value, summary: event.target.value })} /></label>
          <label className="block space-y-2 text-sm font-medium"><span>{t("Mentoring needs")}</span><Input value={needsText ?? value.expertise.join(", ")} maxLength={1200} onChange={event => setNeedsText(event.target.value)} placeholder={t("e.g. study design, data analysis")} /></label>
          {!validNeeds ? <p role="alert" className="text-sm text-destructive">{t("Use up to 10 needs, each under 120 characters, separated by commas.")}</p> : null}
        </fieldset>
        {!readOnly ? <Button variant="outline" type="submit" disabled={save.isPending || !validNeeds || value.discovery === "SEEKING_MENTOR" && value.summary.trim().length < 10}>{t(save.isPending ? "Saving…" : "Save discovery settings")}</Button> : null}
      </form>}
  </section>;
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
  const labels = { archive: "Archive project", restore: "Restore project", delete: "Delete empty project", leave: "Leave project" };
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
  return <section className="flex flex-wrap items-start justify-between gap-4 border-t pt-6">
    <div className="max-w-prose"><h3 className="text-base font-semibold">{t("Lifecycle & danger zone")}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{t(owner ? "Archiving preserves research and history and makes the workspace read-only. Empty projects can be deleted." : "Leaving removes your private workspace access. The owner can invite you again.")}</p></div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline">{t("Project actions")}<MoreHorizontal className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      {owner ? <><DropdownMenuItem onSelect={() => setAction(archived ? "restore" : "archive")}>{t(archived ? labels.restore : labels.archive)}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => setAction("delete")}>{t(labels.delete)}</DropdownMenuItem></>
        : <DropdownMenuItem className="text-destructive" onSelect={() => setAction("leave")}>{t(labels.leave)}</DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu>
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !pending) { setAction(null); setConfirmation(""); } }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{action ? t(labels[action]) : ""}</DialogTitle><DialogDescription>{t(action === "archive" ? "Members can still read existing research. Pending invitations will be cancelled and discovery will close."
      : action === "restore" ? "Members can collaborate again. Cancelled invitations and closed discovery remain unchanged."
      : action === "delete" ? "Only an empty project without research or collaboration history can be permanently deleted."
      : "You will lose access to private project content. This cannot leave the project without an owner.")}</DialogDescription></DialogHeader>
      {needsTitle ? <div className="space-y-2"><Label htmlFor="project-action-confirm">{t("Type {{title}} to confirm", { title: project.title })}</Label><Input id="project-action-confirm" value={confirmation} disabled={pending} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></div> : null}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => { setAction(null); setConfirmation(""); }}>{t("Cancel")}</Button><Button type="button" variant={action === "restore" ? "default" : "destructive"} disabled={pending || needsTitle && confirmation !== project.title} onClick={() => void confirm()}>{t(pending ? "Updating…" : "Confirm")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
