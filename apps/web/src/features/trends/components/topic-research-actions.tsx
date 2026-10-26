import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useAddProjectTrendSnapshot, useToggleTrendFollow, useTrendFollowStatus } from "../hooks/use-trends";

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return message || fallback;
}

/** Follow a topic: the daily check notifies the user when its trend verdict changes. */
export function FollowTopicButton({ topic, openalexTopicId }: { topic: string; openalexTopicId?: string }) {
  const { t } = useI18n();
  const signedIn = useAuthStore((state) => Boolean(state.user));
  const status = useTrendFollowStatus(topic, signedIn);
  const toggle = useToggleTrendFollow();
  const followId = status.data?.follow?.id;
  const following = Boolean(status.data?.following);

  const onClick = () => {
    if (!signedIn) {
      toast.info(t("Sign in to follow topics."));
      return;
    }
    toggle.mutate(
      { topic, openalexTopicId, followId },
      {
        onSuccess: () => toast.success(following ? t("Stopped following this topic.") : t("Following. You will be notified when its trend changes.")),
        onError: (error) => toast.error(errorMessage(error, t("Could not update the followed topic."))),
      },
    );
  };

  return (
    <Button variant="outline" size="sm" className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs shadow-sm" onClick={onClick} disabled={toggle.isPending || (signedIn && status.isLoading)} aria-pressed={following}>
      {toggle.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : following ? <BellOff className="w-3.5 h-3.5 text-slate-500" /> : <Bell className="w-3.5 h-3.5 text-blue-600" />}
      {following ? t("Unfollow") : t("Follow topic")}
    </Button>
  );
}

/** Freeze the topic's current trend verdict into one of the user's projects as evidence. */
export function AddTrendToProjectButton({ topic, openalexTopicId, yearFrom, yearTo }: { topic: string; openalexTopicId?: string; yearFrom?: number; yearTo?: number }) {
  const { t } = useI18n();
  const signedIn = useAuthStore((state) => Boolean(state.user));
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const projects = useProjects({ enabled: open && signedIn });
  const add = useAddProjectTrendSnapshot();
  const choices = (projects.data ?? []).filter((project) => project.status !== "ARCHIVED");

  const submit = () => {
    if (!projectId) return;
    add.mutate(
      { projectId, input: { topic, openalexTopicId, yearFrom, yearTo, note: note.trim() || undefined } },
      {
        onSuccess: () => {
          toast.success(t("Trend evidence added to the project."));
          setOpen(false);
          setNote("");
        },
        onError: (error) => toast.error(errorMessage(error, t("Could not add the trend to the project."))),
      },
    );
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs shadow-sm"
        onClick={() => (signedIn ? setOpen(true) : toast.info(t("Sign in to add trends to a project.")))}
      >
        <FolderPlus className="w-3.5 h-3.5 text-emerald-600" /> {t("Add to project")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Add trend evidence to a project")}</DialogTitle>
            <DialogDescription>
              {t("The current verdict of \"{{topic}}\" for {{yearFrom}}–{{yearTo}} is saved in the project, so the team can cite it as the reason for the research direction.", { topic, yearFrom: yearFrom ?? "…", yearTo: yearTo ?? "…" })}
            </DialogDescription>
          </DialogHeader>
          {projects.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {t("Loading projects...")}</div>
          ) : choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("You have no active project yet.")} <Link className="font-semibold text-blue-600 hover:underline" to="/projects?create=1">{t("Create a project")}</Link>
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-foreground">
                {t("Project")}
                <select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">{t("Choose a project")}</option>
                  {choices.map((project) => <option key={project._id} value={project._id}>{project.title}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-foreground">
                {t("Note (optional)")}
                <textarea className="mt-1 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("Why this trend matters for the project")} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={submit} disabled={!projectId || add.isPending}>
              {add.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {t("Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
