import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AvailableMentor } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { projectsApi } from "../api/projects.api";
import { academicSupportApi } from "../api/academic-support.api";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";

const Composer = lazy(() => import("@/pages/academics/academic-support").then(m => ({ default: m.ConsentComposer })));
export function InviteMentorFromProfile({ mentor }: { mentor: AvailableMentor }) {
  const { t } = useI18n(), user = useAuthStore(s => s.user), [open, setOpen] = useState(false), [projectId, setProjectId] = useState(""), [compose, setCompose] = useState(false);
  const projects = useQuery({ queryKey: ["projects", "mentor-invitation"], queryFn: projectsApi.list, enabled: open && Boolean(user) });
  const preview = useQuery({ queryKey: ["academic-support", "settings", projectId], queryFn: () => academicSupportApi.settings(projectId), enabled: open && Boolean(projectId) });
  if (!user) return null;
  const owned = projects.data?.filter(p => p.ownerId === user.id && !["ARCHIVED", "COMPLETED"].includes(p.status)) ?? [];
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("Invite as Mentor")}</Button>
    <Dialog open={open && !compose} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{t("Invite as Mentor")}</DialogTitle><DialogDescription>{t("Choose a project you own.")}</DialogDescription></DialogHeader>
      <select aria-label={t("Project")} className="h-10 rounded-md border bg-background px-3 text-sm" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">{t("Choose a project")}</option>{owned.map(p => <option key={p._id} value={p._id}>{p.title}</option>)}</select>
      {projects.isLoading && <p role="status">{t("Loading…")}</p>}{projects.isSuccess && !owned.length && <p className="text-sm text-muted-foreground">{t("Create or own an active project to invite a mentor.")}</p>}
      {(projects.isError || preview.isError) && <p role="alert">{t("Unable to load project. Please try again.")}</p>}<Button disabled={!preview.data || preview.isFetching} onClick={() => setCompose(true)}>{t("Continue")}</Button>
    </DialogContent></Dialog>
    {open && compose && preview.data && <Suspense fallback={<p role="status">{t("Loading…")}</p>}><Composer project={preview.data} mentor={mentor} onClose={() => { setOpen(false); setCompose(false); }} /></Suspense>}
  </>;
}
