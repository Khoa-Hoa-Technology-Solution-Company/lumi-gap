import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects, useCreateProject, useMyProjectInvitations, useRespondToProjectInvitation } from "@/features/projects/hooks/use-projects";
import { ArrowRight, BookOpen, CalendarClock, FolderKanban, FolderOpen, FolderPlus, Globe2, LockKeyhole, MailOpen, Search, UserPlus, Users, UsersRound } from "lucide-react";
import { toast } from "sonner";
import type { IProject, IncomingProjectInvitation, ProjectStatus, ProjectVisibility } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import "@/features/projects/project-workspace.css";

const PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "PLANNING", "ON_HOLD", "COMPLETED", "ARCHIVED"];

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  PLANNING: "Planning",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  PLANNING: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  ON_HOLD: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  COMPLETED: "bg-muted text-muted-foreground",
  ARCHIVED: "bg-muted text-muted-foreground",
};

function getVisibilityLabel(visibility: ProjectVisibility, t: (key: string) => string) {
  switch (visibility) {
    case "INVITE_ONLY": return t("Invite only");
    case "PUBLIC_SUMMARY": return t("Public summary");
    default: return t("Private");
  }
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-sm font-semibold ${PROJECT_STATUS_STYLES[status]}`}>
      {t(PROJECT_STATUS_LABELS[status])}
    </span>
  );
}

function ProjectRow({ project }: { project: IProject }) {
  const { t, language } = useI18n();
  const updated = new Date(project.updatedAt);
  const VisibilityIcon = project.visibility === "PUBLIC_SUMMARY"
    ? Globe2
    : project.visibility === "INVITE_ONLY"
      ? UsersRound
      : LockKeyhole;

  return <Link to={`/projects/${project._id}`} className="project-docket group">
    <div className="project-docket-main">
      <div className="project-docket-meta"><ProjectStatusBadge status={project.status} /><span><VisibilityIcon aria-hidden="true" />{getVisibilityLabel(project.visibility, t)}</span>{project.researchField ? <span className="project-docket-field">{project.researchField}</span> : null}</div>
      <div className="project-docket-identity">
        <span className="project-folder-icon"><FolderKanban aria-hidden="true" /></span>
        <div><h3>{project.title}</h3><p>{project.description || t("Build your research library and develop ideas with your team.")}</p></div>
      </div>
      <div className="project-docket-footer"><span>{t("Updated")} {!Number.isNaN(updated.getTime()) ? <time dateTime={project.updatedAt}>{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(updated)}</time> : "—"}</span><span className="project-docket-open">{t("Open workspace")}<ArrowRight aria-hidden="true" /></span></div>
    </div>
    <div className="project-docket-details">
      <span><BookOpen aria-hidden="true" /><strong>{project.paperCount}</strong><span>{t("Papers")}</span></span>
      <span><Users aria-hidden="true" /><strong>{project.memberCount}</strong><span>{t("Members")}</span></span>
    </div>
  </Link>;
}

function formatInvitationExpiry(expiresAt: string) {
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - Date.now();
  const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(expiry);
  if (diffMs <= 0) return { label: "Expired", detail: absolute, urgent: true };
  const hours = Math.ceil(diffMs / (60 * 60 * 1000));
  if (hours < 24) return { label: `Expires in ${hours} hour${hours === 1 ? "" : "s"}`, detail: absolute, urgent: true };
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, detail: absolute, urgent: days <= 1 };
}

function ProjectInvitationRow({
  invitation,
  busyAction,
  onAccept,
  onDecline,
}: {
  invitation: IncomingProjectInvitation;
  busyAction: "accept" | "decline" | null;
  onAccept: (invitation: IncomingProjectInvitation) => void;
  onDecline: (invitation: IncomingProjectInvitation) => void;
}) {
  const { t } = useI18n();
  const expiry = formatInvitationExpiry(invitation.expiresAt);
  const isBusy = Boolean(busyAction);

  return (
    <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Pending invitation")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {expiry.label}
          </span>
        </div>
        <div>
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">{invitation.projectTitle}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {invitation.inviterName ? `${invitation.inviterName} invited you to collaborate` : t("You were invited to collaborate")}
            {" "}
            {t("as")} <span className="font-medium text-foreground">{invitation.role.toLowerCase()}</span>.
          </p>
        </div>
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {invitation.message || invitation.projectDescription || t("Accepting adds this project to your workspace. Declining removes the invitation from your list.")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("Invite expires")}: <time dateTime={invitation.expiresAt} title={expiry.detail}>{expiry.detail}</time>
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isBusy}>
              {busyAction === "decline" ? t("Declining...") : t("Decline")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>{t("Decline project invitation?")}</DialogTitle>
              <DialogDescription>
                {t("This will remove the invitation from your pending list. You will need a new invitation if you want to join later.")}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border bg-muted/25 p-3">
              <p className="text-sm font-medium">{invitation.projectTitle}</p>
              <p className="mt-1 text-xs text-muted-foreground">{expiry.label}</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">{t("Keep invitation")}</Button>
              </DialogClose>
              <Button type="button" variant="destructive" disabled={isBusy} onClick={() => onDecline(invitation)}>
                {busyAction === "decline" ? t("Declining...") : t("Decline invitation")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button size="sm" disabled={isBusy} onClick={() => onAccept(invitation)}>
          {busyAction === "accept" ? t("Accepting...") : t("Accept and open")}
        </Button>
      </div>
    </div>
  );
}

export function ProjectsListPage() {
  const { data: projects, isLoading, isError, isFetching, refetch } = useProjects();
  const createProject = useCreateProject();
  const { data: invitations = [], refetch: refetchInvitations } = useMyProjectInvitations();
  const respondToInvitation = useRespondToProjectInvitation();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setDialogOpen] = useState(searchParams.get("create") === "1");
  const setIsDialogOpen = (open: boolean) => {
    setDialogOpen(open);
    if (!open && searchParams.has("create")) {
      const params = new URLSearchParams(searchParams);
      params.delete("create");
      setSearchParams(params, { replace: true });
    }
  };
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [researchField, setResearchField] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "INVITE_ONLY" | "PUBLIC_SUMMARY">("PRIVATE");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ALL");
  const [activeInvitationAction, setActiveInvitationAction] = useState<{ id: string; action: "accept" | "decline" } | null>(null);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (projects ?? []).filter((project) => {
      const matchesStatus = statusFilter === "ALL" || project.status === statusFilter;
      const searchableText = `${project.title} ${project.description ?? ""} ${project.researchField ?? ""}`.toLocaleLowerCase();
      return matchesStatus && (!query || searchableText.includes(query));
    });
  }, [projects, search, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const newProject = await createProject.mutateAsync({ title, description, researchField: researchField || undefined, visibility });
      toast.success("Project created successfully");
      setIsDialogOpen(false);
      setTitle("");
      setDescription("");
      setResearchField("");
      setVisibility("PRIVATE");
      navigate(`/projects/${newProject._id}`);
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleInvitationResponse = async (invitation: IncomingProjectInvitation, decision: "accept" | "decline") => {
    setActiveInvitationAction({ id: invitation.id, action: decision });
    try {
      await respondToInvitation.mutateAsync({ projectId: invitation.projectId, invitationId: invitation.id, decision });
      if (decision === "accept") {
        toast.success(t("Invitation accepted. Opening project..."));
        navigate(`/projects/${invitation.projectId}`);
      } else {
        toast.success(t("Invitation declined"));
      }
    } catch {
      toast.error(t("This invitation is no longer available. It may have expired or been cancelled by the project owner."));
      void refetchInvitations();
    } finally {
      setActiveInvitationAction(null);
    }
  };

  return (
    <div className="projects-page project-page-width">
      <header className="projects-intro">
      <p className="project-breadcrumb">{t("Workspace")}<span aria-hidden="true">/</span>{t("Projects")}</p>
      <PageHeader
        title="Research Projects"
        description="A home for your evidence, ideas and research team."
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="project-primary-action h-11 rounded-lg px-5 text-base">
                <FolderPlus className="h-4 w-4" aria-hidden="true" />
                New project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="text-xl tracking-tight">Create workspace</DialogTitle>
                <DialogDescription>
                  Give your new research project a clear focus.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Project Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. LLM in Education"
                    className="h-11 rounded-lg"
                    required
                  />
                </div>
                <div className="space-y-2"><Label htmlFor="research-field" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Research field <span className="opacity-50">(optional)</span></Label><Input id="research-field" value={researchField} onChange={(event) => setResearchField(event.target.value)} placeholder="e.g. Artificial intelligence" maxLength={200} /></div>
                <div className="space-y-2"><Label htmlFor="project-visibility-new" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Visibility</Label><select id="project-visibility-new" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="PRIVATE">Private</option><option value="INVITE_ONLY">Invite only</option><option value="PUBLIC_SUMMARY">Public summary</option></select></div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description <span className="opacity-50">(optional)</span></Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the goals"
                    className="h-11 rounded-lg"
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-full">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createProject.isPending || !title.trim()} className="rounded-full px-8">
                    {createProject.isPending ? "Creating..." : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      </header>

      {invitations.length > 0 ? (
        <section className="mb-7 overflow-hidden rounded-xl border bg-card shadow-sm" aria-labelledby="project-invitations-title">
          <div className="flex flex-col gap-3 border-b bg-muted/25 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
              <MailOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="project-invitations-title" className="text-sm font-semibold">Project invitations</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {invitations.length} {t("pending invitation")}{invitations.length === 1 ? "" : "s"}. {t("Accepting adds the project to your workspace. Owners can cancel pending invitations before you respond.")}
              </p>
            </div>
          </div>
          <div className="divide-y">
            {invitations.map((invitation) => (
              <ProjectInvitationRow
                key={invitation.id}
                invitation={invitation}
                busyAction={activeInvitationAction?.id === invitation.id ? activeInvitationAction.action : null}
                onAccept={(item) => void handleInvitationResponse(item, "accept")}
                onDecline={(item) => void handleInvitationResponse(item, "decline")}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label={t("Research Projects")}>
        <div className="project-collection-heading"><h2>{t("Your projects")}</h2><span>{isLoading ? t("Loading...") : !isError ? t(projects?.length === 1 ? "{{count}} workspace" : "{{count}} workspaces", { count: projects?.length ?? 0 }) : null}</span></div>
        <div className="project-list-toolbar">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Search projects by name or field")}
              aria-label={t("Search projects by name or field")}
              className="h-11 rounded-lg bg-background pl-10 text-base shadow-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="project-status-filter" className="shrink-0 text-sm text-muted-foreground">{t("Status")}</label>
            <select
              id="project-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "ALL")}
              className="h-11 min-w-36 rounded-lg border border-input bg-background px-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="ALL">{t("All statuses")}</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{t(PROJECT_STATUS_LABELS[status])}</option>
              ))}
            </select>
            <span className="pl-2 text-sm tabular-nums text-muted-foreground" aria-live="polite">
              {filteredProjects.length} {filteredProjects.length === 1 ? t("project") : t("projects")}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="overflow-hidden rounded-xl border bg-card" role="status" aria-label={t("Loading projects")}>
            <span className="sr-only">{t("Loading projects")}</span>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-center gap-3 border-b p-5 last:border-b-0">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
            <FolderOpen className="mb-4 h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <h2 className="font-semibold">{t("Could not load projects")}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("Please check your connection and try again.")}</p>
            <Button variant="outline" className="mt-5" onClick={() => void refetch()} disabled={isFetching}>{isFetching ? t("Loading...") : t("Try again")}</Button>
          </div>
        ) : !projects?.length ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/15 px-6 py-16 text-center sm:py-20">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border bg-background text-muted-foreground">
              <FolderOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold tracking-tight">{t("No projects yet")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {t("Collect papers, organise screening decisions, and work with collaborators in one research workspace.")}
            </p>
            <Button onClick={() => setIsDialogOpen(true)} className="mt-5 rounded-lg">
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              {t("Create your first project")}
            </Button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
            <Search className="mb-3 h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
            <h2 className="font-semibold">{t("No matching projects")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("Try another name or status.")}</p>
            <Button variant="ghost" className="mt-2" onClick={() => { setSearch(""); setStatusFilter("ALL"); }}>{t("Clear filters")}</Button>
          </div>
        ) : (
          <div className="project-docket-list">{filteredProjects.map((project) => <ProjectRow key={project._id} project={project} />)}</div>
        )}
      </section>
      <section className="project-discovery-link" aria-labelledby="project-discovery-title"><BookOpen aria-hidden="true" /><div><h2 id="project-discovery-title">{t("Looking for your next source?")}</h2><p>{t("Explore the literature, save useful papers and bring them into a project.")}</p></div><Link to="/literature">{t("Browse literature")}<ArrowRight aria-hidden="true" /></Link></section>
    </div>
  );
}

