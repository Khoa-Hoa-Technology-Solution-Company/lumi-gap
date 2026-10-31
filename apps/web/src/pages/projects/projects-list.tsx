import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreateProjectForm } from "@/features/projects/components/create-project-form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects, useMyProjectInvitations, useRespondToProjectInvitation } from "@/features/projects/hooks/use-projects";
import { ArrowDownWideNarrow, CalendarClock, FolderOpen, FolderPlus, MailOpen, Plus, Search, SlidersHorizontal, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { IncomingProjectInvitation } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { ProjectDirectory } from "@/features/projects/components/project-directory";
import { ProjectSwitcher } from "@/features/projects/components/project-switcher";
import { ownsProject, PROJECT_STATUSES, PROJECT_STATUS_LABELS, readProjectDirectoryFilters, readProjectSearchFilters, selectDirectoryProjects } from "@/features/projects/utils/project-directory";
import "@/features/projects/project-workspace.css";
import "@/features/projects/project-directory.css";

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
  const { t, language } = useI18n();
  const expiryDate = new Date(invitation.expiresAt);
  const validExpiry = Number.isFinite(expiryDate.getTime());
  const expiry = validExpiry ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(expiryDate) : t("Date unavailable");
  const isBusy = Boolean(busyAction);

  return (
    <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Pending invitation")}
          </span>
          {validExpiry && expiryDate.getTime() <= Date.now() ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-200">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Expired")}
          </span> : null}
        </div>
        <div>
          <p className="break-words text-lg font-semibold tracking-tight text-foreground">{invitation.projectTitle}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {invitation.inviterName ? t("{{name}} invited you to collaborate", { name: invitation.inviterName }) : t("You were invited to collaborate")}
            {" "}
            {t("as")} <span className="font-medium text-foreground">{t(invitation.role === "OWNER" ? "Owner" : "Member")}</span>.
          </p>
        </div>
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {invitation.message || invitation.projectDescription || t("Accepting adds this project to your workspace. Declining removes the invitation from your list.")}
        </p>
        {invitation.invitedEmail && <p className="break-all text-sm text-muted-foreground">{t("Recipient email")}: <span className="font-medium text-foreground">{invitation.invitedEmail}</span></p>}
        <p className="text-sm text-muted-foreground">
          {t("Invite expires")}: {validExpiry ? <time dateTime={invitation.expiresAt}>{expiry}</time> : expiry}
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
              <p className="mt-1 text-sm text-muted-foreground">{t("Invite expires")}: {expiry}</p>
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

export function ProjectsListPage({ compact = false, invitationsOnly = false }: { compact?: boolean; invitationsOnly?: boolean }) {
  const { data: projects, isLoading, isError, isFetching, refetch } = useProjects();
  const { data: invitations = [], isLoading: invitationsLoading, isError: invitationsError, isFetching: invitationsFetching, refetch: refetchInvitations } = useMyProjectInvitations();
  const respondToInvitation = useRespondToProjectInvitation();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const userId = useAuthStore(state => state.user?.id);
  const { id: selectedId } = useParams();

  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setDialogOpen] = useState(searchParams.get("create") === "1");
  const requestCreate = searchParams.get("create") === "1";
  useEffect(() => { if (requestCreate) setDialogOpen(true); }, [requestCreate]);
  const setIsDialogOpen = (open: boolean) => {
    setDialogOpen(open);
    if (!open && searchParams.has("create")) {
      const params = new URLSearchParams(searchParams);
      params.delete("create");
      setSearchParams(params, { replace: true });
    }
  };
  const [createBusy, setCreateBusy] = useState(false);
  const [activeInvitationAction, setActiveInvitationAction] = useState<{ id: string; action: "accept" | "decline" } | null>(null);

  const filters = useMemo(() => compact ? readProjectSearchFilters(searchParams) : readProjectDirectoryFilters(searchParams), [compact, searchParams]);
  const filteredProjects = useMemo(() => selectDirectoryProjects(projects ?? [], filters, userId, language), [projects, filters, userId, language]);
  const ownedCount = projects?.filter(project => ownsProject(project, userId)).length ?? 0;
  const scopes = [
    { key: "ALL", label: "All projects", count: projects?.length },
    { key: "OWNED", label: "Owned by me", count: ownedCount },
    { key: "SHARED", label: "Shared with me", count: projects ? projects.length - ownedCount : undefined },
  ] as const;
  const hasFilters = Boolean(filters.search || filters.status !== "ALL" || filters.scope !== "ALL");
  const number = new Intl.NumberFormat(language);
  const InvitationContainer = compact ? "details" : "section";
  const updateFilter = (key: string, value: string, defaultValue = "") => {
    setSearchParams(previous => {
      const params = new URLSearchParams(previous);
      if (value === defaultValue) params.delete(key);
      else params.set(key, value);
      return params;
    }, { replace: true });
  };
  const clearFilters = () => {
    setSearchParams(previous => {
      const params = new URLSearchParams(previous);
      ["q", "scope", "status"].forEach(key => params.delete(key));
      return params;
    }, { replace: true });
  };

  const handleInvitationResponse = async (invitation: IncomingProjectInvitation, decision: "accept" | "decline") => {
    setActiveInvitationAction({ id: invitation.id, action: decision });
    try {
      await respondToInvitation.mutateAsync({ projectId: invitation.projectId, invitationId: invitation.id, decision });
      if (decision === "accept") {
        toast.success(t("Invitation accepted. Opening project..."));
        navigate(`/projects/${encodeURIComponent(invitation.projectId)}`);
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

  const searchControl = <div className="project-directory-search">
    <Search aria-hidden="true" />
    <Input type="search" name="q" autoComplete="off" value={filters.search}
      onChange={event => updateFilter("q", event.target.value)}
      placeholder={t(compact ? "Search projects…" : "Search by project name or field…")} aria-label={t("Search projects by name or field")} />
    {filters.search ? <button type="button" aria-label={t("Clear search")} onClick={() => updateFilter("q", "")}><X aria-hidden="true" /></button> : null}
  </div>;

  const invitationSection = invitations.length > 0 && !(compact && searchParams.get("view") === "invitations") ? (
    <InvitationContainer className="project-directory-invitations" aria-label={t("Project invitations")}>
      {compact ? <summary><MailOpen aria-hidden="true" />{t("Project invitations")}<span>{number.format(invitations.length)}</span></summary> : <div className="flex items-center gap-3 border-b bg-muted/25 px-4 py-4 sm:px-5">
        <MailOpen className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t("Project invitations")}</h2>
        <span className="text-sm text-muted-foreground">{number.format(invitations.length)}</span>
      </div>}
      <div className="divide-y">{invitations.map(invitation => <ProjectInvitationRow key={invitation.id} invitation={invitation}
        busyAction={activeInvitationAction?.id === invitation.id ? activeInvitationAction.action : null}
        onAccept={item => void handleInvitationResponse(item, "accept")} onDecline={item => void handleInvitationResponse(item, "decline")} />)}</div>
    </InvitationContainer>
  ) : null;

  if (invitationsOnly) return <div className="projects-page project-page-width project-directory-page" data-no-i18n>
    <header className="project-directory-heading"><h1 className="text-2xl font-semibold">{t("Project invitations")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("Opening a notification does not accept an invitation. Review the recipient email and accept to join.")}</p>
    </header>
    {invitationsLoading ? <p role="status">{t("Loading...")}</p> : invitationsError ? <div role="alert" className="space-y-3">
      <p>{t("Could not load project invitations.")}</p><Button variant="outline" disabled={invitationsFetching} onClick={() => void refetchInvitations()}>{t("Try again")}</Button>
    </div> : invitationSection ?? <p className="rounded-xl border p-5 text-muted-foreground">{t("No pending project invitations for this account.")}</p>}
  </div>;

  return (
    <div className={compact ? "projects-page project-switcher" : "projects-page project-page-width project-directory-page"} data-no-i18n>
      <header className="project-directory-heading">
        {!compact ? <p className="project-directory-breadcrumb">{t("Workspace")}</p> : null}
        <div className="project-directory-heading-row">
          <div>
            <div className="project-directory-heading-title">{compact ? <h2>{t("Projects")}</h2> : <h1>{t("Your projects")}</h1>}{!isLoading && !isError && projects ? <span>{number.format(projects.length)}</span> : null}</div>
            {!compact ? <p>{t("Review your research projects and pick up where you left off.")}</p> : null}
          </div>
          <Dialog open={isDialogOpen} onOpenChange={next => { if (!createBusy) setIsDialogOpen(next); }}>
            <DialogTrigger asChild>
              <Button variant={compact ? "outline" : "default"} className={compact ? "project-switcher-create" : "project-primary-action h-11 px-5 text-base"} aria-label={t("New project")} title={compact ? t("New project") : undefined}>
                {compact ? <Plus className="h-4 w-4" aria-hidden="true" /> : <FolderPlus className="h-4 w-4" aria-hidden="true" />}
                <span>{t(compact ? "Create" : "New project")}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="project-directory-create max-h-[90dvh] overflow-y-auto sm:max-w-[550px]" onInteractOutside={event => { if (createBusy) event.preventDefault(); }} onEscapeKeyDown={event => { if (createBusy) event.preventDefault(); }}>
              <CreateProjectForm onClose={() => setIsDialogOpen(false)} onBusyChange={setCreateBusy} />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {invitationSection}

      <section aria-label={t("Your research projects")}>
        {compact ? <div className="project-switcher-search">{searchControl}</div> : <div className="project-directory-toolbar">
          <div className="project-switcher-filters">
            <div className="project-switcher-filter-fields">
          <div className="project-directory-scopes" role="group" aria-label={t("Filter projects by ownership")}>
            {scopes.map(scope => <button type="button" key={scope.key} aria-pressed={filters.scope === scope.key} onClick={() => updateFilter("scope", scope.key, "ALL")}>
              {t(scope.label)}{!isLoading && !isError && scope.count !== undefined ? <span>{number.format(scope.count)}</span> : null}
            </button>)}
          </div>
          {!compact ? searchControl : null}
          <div className="project-directory-filter">
            <label htmlFor="project-status-filter" className="sr-only">{t("Status")}</label>
            <SlidersHorizontal aria-hidden="true" />
            <select
              id="project-status-filter"
              name="status"
              value={filters.status}
              onChange={event => updateFilter("status", event.target.value, "ALL")}
            >
              <option value="ALL">{t("All statuses")}</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{t(PROJECT_STATUS_LABELS[status])}</option>
              ))}
            </select>
          </div>
          <div className="project-directory-filter project-directory-sort">
            <label htmlFor="project-sort" className="sr-only">{t("Sort by")}</label>
            <ArrowDownWideNarrow aria-hidden="true" />
            <select id="project-sort" name="sort" value={filters.sort} onChange={event => updateFilter("sort", event.target.value, "UPDATED")}>
              <option value="UPDATED">{t("Recently updated")}</option>
              <option value="NAME">{t("Project name")}</option>
              <option value="OLDEST">{t("Oldest updated")}</option>
            </select>
          </div>
          </div>
          </div>
        </div>}

        {compact && filters.search.trim() && !isLoading && !isError && projects?.length ? <div className="project-search-feedback">
          <p role="status">{t(filteredProjects.length === 1 ? "{{count}} project found" : "{{count}} projects found", { count: number.format(filteredProjects.length) })}</p>
        </div> : null}

        {compact && !isLoading && !isError && projects?.length ? <ProjectSwitcher projects={filteredProjects} allProjects={projects} selectedId={selectedId} /> : null}

        {isLoading ? (
          <div className="project-directory-loading" role="status" aria-label={t("Loading projects")}>
            <span className="sr-only">{t("Loading projects")}</span>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-center gap-4 border-b py-6">
                <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="project-directory-empty">
            <FolderOpen aria-hidden="true" />
            <h2 className="font-semibold">{t("Could not load projects")}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("Please check your connection and try again.")}</p>
            <Button variant="outline" className="mt-5" onClick={() => void refetch()} disabled={isFetching}>{isFetching ? t("Loading...") : t("Try again")}</Button>
          </div>
        ) : !projects?.length ? (
          <div className="project-directory-empty">
            <FolderOpen aria-hidden="true" />
            <h2 className="text-lg font-semibold tracking-tight">{t("No projects yet")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {t("Collect papers, organise screening decisions, and work with collaborators in one research workspace.")}
            </p>
            <Button onClick={() => setIsDialogOpen(true)} className="project-primary-action mt-5">
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              {t("Create your first project")}
            </Button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="project-directory-empty project-switcher-no-matches">
            <Search aria-hidden="true" />
            <h2>{t(filters.scope === "SHARED" && !filters.search && filters.status === "ALL" ? "No shared projects yet" : "No matching projects")}</h2>
            <p>{t(compact ? "Try another project name or research field." : filters.scope === "SHARED" && !filters.search && filters.status === "ALL" ? "Projects you join will appear here after you accept an invitation." : "Try a different search, status or ownership filter.")}</p>
            <Button variant="outline" className="mt-5" onClick={compact && filters.search ? () => updateFilter("q", "") : clearFilters}>{t(compact && filters.search ? "Clear search" : "View all projects")}</Button>
          </div>
        ) : (
          compact ? null : <ProjectDirectory projects={filteredProjects} userId={userId} />
        )}
        {!compact && !isLoading && !isError && projects?.length ? <div className="project-directory-results">
          <p role="status">{t("Showing {{shown}} of {{total}} projects", { shown: number.format(filteredProjects.length), total: number.format(projects.length) })}</p>
          {hasFilters ? <button type="button" onClick={clearFilters}>{t("Clear filters")}<X aria-hidden="true" /></button> : null}
        </div> : null}
      </section>
    </div>
  );
}

