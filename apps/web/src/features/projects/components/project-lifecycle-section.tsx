import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PROJECT_TRASH_RETENTION_DAYS, type IProject, type ProjectStatus, type UpdateProjectRequest } from "@trend/shared-types";
import { Archive, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import {
  useArchiveProject,
  useDeleteProject,
  useLeaveProject,
  useRestoreProject,
  useUpdateProject,
} from "../hooks/use-projects";
import { ChangedNotice, settingsSaveError, useSettingsDraft } from "./project-settings-form";
import { canLeaveWorkspace } from "./workspace-common";

type LifecycleAction = "archive" | "restore" | "delete" | "leave";

const ACTION_TITLES: Record<LifecycleAction, string> = {
  archive: "Archive project",
  restore: "Restore archived project",
  delete: "Move project to Trash",
  leave: "Leave project",
};

const statusValue = (p: IProject) => ({ status: p.status });

export function ProjectLifecycleSection({ project }: { project: IProject }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const owner = project.accessRole === "OWNER";
  const archived = project.status === "ARCHIVED";

  const statusState = useSettingsDraft(project, statusValue);
  const updateProject = useUpdateProject(project._id);
  const statusLock = useRef(false);
  const [statusError, setStatusError] = useState("");

  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const archive = useArchiveProject(project._id);
  const restore = useRestoreProject(project._id);
  const softDelete = useDeleteProject(project._id);
  const leave = useLeaveProject(project._id);
  const pending = archive.isPending || restore.isPending || softDelete.isPending || leave.isPending;
  const lock = useRef(false);

  const needsTitleConfirmation = action === "archive" || action === "delete";
  const confirmMatches = !needsTitleConfirmation || confirmation.trim() === project.title.trim();

  const saveStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!owner || archived || statusLock.current || !statusState.dirty) return;
    if (statusState.draft.status === "ARCHIVED") return;
    const patch: UpdateProjectRequest = {
      expectedVersion: statusState.baseline.version,
      status: statusState.draft.status,
    };
    statusLock.current = true;
    setStatusError("");
    try {
      const saved = await updateProject.mutateAsync(patch);
      statusState.accept(saved);
      toast.success(t("Project status saved"));
    } catch (failure) {
      setStatusError(t(settingsSaveError(failure)));
    } finally {
      statusLock.current = false;
    }
  };

  const openAction = async (next: LifecycleAction) => {
    if (next !== "leave" && !(await canLeaveWorkspace())) return;
    setConfirmation("");
    setAction(next);
  };

  const confirm = async () => {
    if (!action || pending || lock.current || !confirmMatches) return;
    lock.current = true;
    try {
      if (action === "archive") {
        await archive.mutateAsync();
        toast.success(t("Project updated"));
      } else if (action === "restore") {
        await restore.mutateAsync(undefined);
        toast.success(t("Project restored"));
      } else if (action === "delete") {
        await softDelete.mutateAsync();
        toast.success(t("Project moved to Trash"));
        setAction(null);
        setConfirmation("");
        navigate("/projects?view=trash");
        return;
      } else {
        await leave.mutateAsync();
        toast.success(t("Project updated"));
        setAction(null);
        setConfirmation("");
        navigate("/projects");
        return;
      }
      setAction(null);
      setConfirmation("");
    } catch (failure) {
      const status = (failure as { response?: { status?: number } }).response?.status;
      toast.error(
        t(
          status === 409
            ? "This action is blocked to preserve project ownership or research history. Archive the project when appropriate."
            : "Could not update the project. Please try again.",
        ),
      );
    } finally {
      lock.current = false;
    }
  };

  return (
    <div className="space-y-6" data-no-i18n>
      {owner ? (
        <section
          aria-labelledby="project-management-heading"
          className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-6"
        >
          <div className="space-y-1">
            <h3 id="project-management-heading" className="text-base font-semibold text-foreground">
              {t("Project management")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("Control project status, archive read-only snapshots, or move the project to Trash.")}
            </p>
          </div>

          {!archived ? (
            <form onSubmit={saveStatus} className="space-y-3 rounded-lg border border-border/70 bg-background p-4">
              <ChangedNotice visible={statusState.latest} reload={statusState.reload} />
              <div className="space-y-1.5">
                <Label htmlFor="project-lifecycle-status" className="text-sm font-medium">
                  {t("Project status")}
                </Label>
                <select
                  id="project-lifecycle-status"
                  className="project-form-select"
                  disabled={updateProject.isPending}
                  value={statusState.draft.status}
                  onChange={e => statusState.setDraft({ status: e.target.value as ProjectStatus })}
                >
                  {Object.entries({
                    PLANNING: "Planning",
                    ACTIVE: "Active",
                    ON_HOLD: "On hold",
                    COMPLETED: "Completed",
                  }).map(([key, label]) => (
                    <option key={key} value={key}>
                      {t(label)}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("Research stage is managed in Overview. Lifecycle controls whether the project is ongoing, paused or completed.")}
                </p>
              </div>
              {statusError ? <p role="alert" className="text-xs text-destructive">{statusError}</p> : null}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {statusState.dirty ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={updateProject.isPending}
                    onClick={() => {
                      statusState.setDraft(statusValue(statusState.baseline));
                      setStatusError("");
                    }}
                  >
                    {t("Discard changes")}
                  </Button>
                ) : null}
                <Button type="submit" size="sm" disabled={!statusState.dirty || updateProject.isPending}>
                  {t(updateProject.isPending ? "Saving…" : "Save status")}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Archiving and trash")}
            </h4>
            <div className="divide-y divide-border/70 rounded-lg border border-border/70 bg-background">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="max-w-prose">
                  <p className="text-sm font-semibold text-foreground">
                    {t(archived ? "Restore archived project" : "Archive this project")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t("Archiving preserves research and history and makes the workspace read-only. You can restore an archived project at any time.")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-2"
                  disabled={pending}
                  onClick={() => void openAction(archived ? "restore" : "archive")}
                >
                  {archived ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                  {t(archived ? "Restore archived project" : "Archive project")}
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="max-w-prose">
                  <p className="text-sm font-semibold text-foreground">
                    {t("Move project to Trash")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(
                      "Moving this project to Trash removes it from active workspaces and keeps papers, members, reviews, and research history recoverable for {{days}} days.",
                      { days: PROJECT_TRASH_RETENTION_DAYS },
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="shrink-0 gap-2"
                  disabled={pending}
                  onClick={() => void openAction("delete")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t("Move to Trash")}
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="project-membership-leave-heading"
          className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-prose">
              <h3 id="project-membership-leave-heading" className="text-base font-semibold text-foreground">
                {t("Leave project")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("Leaving removes your private workspace access. The owner can invite you again.")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={pending}
              onClick={() => void openAction("leave")}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t("Leave project")}
            </Button>
          </div>
        </section>
      )}

      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setAction(null);
            setConfirmation("");
          }
        }}
      >
        <DialogContent closeLabel={t("Close")} data-no-i18n>
          <DialogHeader>
            <DialogTitle>{action ? t(ACTION_TITLES[action]) : ""}</DialogTitle>
            <DialogDescription>
              {action === "archive"
                ? t("Members can still read existing research. Pending invitations will be cancelled and discovery will close.")
                : action === "restore"
                ? t("Members can collaborate again. Cancelled invitations and closed discovery remain unchanged.")
                : action === "delete"
                ? t(
                    "This action moves the project to Trash and blocks normal workspace access. Papers, members, reviews, and research history are preserved and can be restored within {{days}} days. Permanent deletion is only allowed after {{days}} days.",
                    { days: PROJECT_TRASH_RETENTION_DAYS },
                  )
                : t("You will lose access to private project content. This cannot leave the project without an owner.")}
            </DialogDescription>
          </DialogHeader>

          {needsTitleConfirmation ? (
            <div className="space-y-2">
              <Label htmlFor="project-action-confirm">{t("Type {{title}} to confirm", { title: project.title })}</Label>
              <Input
                id="project-action-confirm"
                value={confirmation}
                disabled={pending}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setAction(null);
                setConfirmation("");
              }}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant={action === "restore" ? "default" : "destructive"}
              disabled={pending || !confirmMatches}
              onClick={() => void confirm()}
            >
              {t(pending ? "Updating…" : "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
