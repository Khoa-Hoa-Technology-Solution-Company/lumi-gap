import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PROJECT_TRASH_RETENTION_DAYS, type TrashedProjectItem } from "@trend/shared-types";
import { ArrowLeft, CalendarClock, FileText, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { usePermanentDeleteProject, useRestoreProject, useTrashedProjects } from "../hooks/use-projects";

export function ProjectTrashView() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const trashQuery = useTrashedProjects();
  const restore = useRestoreProject("");
  const permanentDelete = usePermanentDeleteProject();

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TrashedProjectItem | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");

  const items = trashQuery.data ?? [];
  const number = new Intl.NumberFormat(language);
  const dateFormatter = new Intl.DateTimeFormat(language, { dateStyle: "medium" });

  const handleRestore = async (item: TrashedProjectItem) => {
    if (item.expired || restore.isPending) return;
    setRestoringId(item._id);
    try {
      await restore.mutateAsync(item._id);
      toast.success(t("Project restored"));
      navigate(`/projects/${encodeURIComponent(item._id)}`);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      toast.error(
        t(
          status === 410
            ? "The 30-day restore window has expired for this project."
            : "Could not update the project. Please try again.",
        ),
      );
      void trashQuery.refetch();
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmTarget || !confirmTarget.expired || permanentDelete.isPending) return;
    if (confirmTitle.trim() !== confirmTarget.title.trim()) return;
    try {
      await permanentDelete.mutateAsync(confirmTarget._id);
      toast.success(t("Project permanently deleted"));
      setConfirmTarget(null);
      setConfirmTitle("");
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      toast.error(
        t(
          status === 409
            ? "Permanent deletion is locked until the 30-day retention period expires."
            : "Could not update the project. Please try again.",
        ),
      );
    }
  };

  return (
    <div className="projects-page project-page-width project-directory-page space-y-6" data-no-i18n>
      <header className="project-directory-heading space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
            <Link to="/projects">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("Back to projects")}
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Trash2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Trash")}</h1>
          {!trashQuery.isLoading && !trashQuery.isError ? (
            <Badge variant="secondary">{number.format(items.length)}</Badge>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "Deleted projects are kept for {{days}} days with all papers, members, reviews, and research history intact. Permanent deletion is only available after the retention period ends.",
            { days: PROJECT_TRASH_RETENTION_DAYS },
          )}
        </p>
      </header>

      {trashQuery.isLoading ? (
        <div className="space-y-3" role="status" aria-label={t("Loading…")}>
          {[0, 1].map((key) => (
            <div key={key} className="rounded-xl border p-5 space-y-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : trashQuery.isError ? (
        <div role="alert" className="rounded-xl border p-6 space-y-3">
          <p className="text-sm font-medium">{t("Could not load Trash.")}</p>
          <Button variant="outline" size="sm" disabled={trashQuery.isFetching} onClick={() => void trashQuery.refetch()}>
            {t("Try again")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="project-directory-empty">
          <Trash2 aria-hidden="true" />
          <h2 className="text-lg font-semibold">{t("No deleted projects")}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {t("Projects you move to Trash appear here for {{days}} days before permanent deletion.", { days: PROJECT_TRASH_RETENTION_DAYS })}
          </p>
          <Button variant="outline" className="mt-5" asChild>
            <Link to="/projects">{t("Back to projects")}</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((item) => {
            const deletedDate = new Date(item.deletedAt);
            const formattedDeletedDate = Number.isFinite(deletedDate.getTime())
              ? dateFormatter.format(deletedDate)
              : item.deletedAt.slice(0, 10);
            const isRestoring = restoringId === item._id;

            return (
              <li key={item._id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-foreground">{item.title}</h2>
                    {item.expired ? (
                      <Badge variant="destructive">{t("Retention period ended — ready for permanent deletion")}</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <CalendarClock className="h-3 w-3" aria-hidden="true" />
                        {t("{{days}} days remaining", { days: item.daysRemaining })}
                      </Badge>
                    )}
                  </div>
                  {item.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>{t("Deleted on {{date}}", { date: formattedDeletedDate })}</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      {number.format(item.paperCount)} {t("Papers")}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      {number.format(item.memberCount)} {t("Members")}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={item.expired || isRestoring || permanentDelete.isPending}
                    onClick={() => void handleRestore(item)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(isRestoring ? "Restoring…" : "Restore")}
                  </Button>
                  <Button
                    type="button"
                    variant={item.expired ? "destructive" : "ghost"}
                    size="sm"
                    className="gap-1.5"
                    disabled={!item.expired || isRestoring || permanentDelete.isPending}
                    title={!item.expired ? t("Permanent deletion is locked until the 30-day retention period expires.") : undefined}
                    onClick={() => {
                      setConfirmTitle("");
                      setConfirmTarget(item);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(item.expired ? "Delete forever" : "Available after {{days}} days", { days: PROJECT_TRASH_RETENTION_DAYS })}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !permanentDelete.isPending) {
            setConfirmTarget(null);
            setConfirmTitle("");
          }
        }}
      >
        <DialogContent closeLabel={t("Close")} data-no-i18n>
          <DialogHeader>
            <DialogTitle>{t("Permanently delete project")}</DialogTitle>
            <DialogDescription>
              {t("This permanently removes the project and all of its research records, papers, reviews, and history. This cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          {confirmTarget ? (
            <div className="space-y-2">
              <Label htmlFor="project-permanent-delete-confirm">
                {t("Type {{title}} to confirm", { title: confirmTarget.title })}
              </Label>
              <Input
                id="project-permanent-delete-confirm"
                value={confirmTitle}
                disabled={permanentDelete.isPending}
                onChange={(event) => setConfirmTitle(event.target.value)}
                autoComplete="off"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={permanentDelete.isPending}
              onClick={() => {
                setConfirmTarget(null);
                setConfirmTitle("");
              }}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={permanentDelete.isPending || !confirmTarget || confirmTitle.trim() !== confirmTarget.title.trim()}
              onClick={() => void handlePermanentDelete()}
            >
              {t(permanentDelete.isPending ? "Updating…" : "Delete forever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
