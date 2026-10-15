import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MentorDiscoverySettings as Settings } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { authApi } from "@/features/auth/api/auth.api";
import { academicSupportApi } from "../api/academic-support.api";
import { ResearchAreaSelect } from "./research-area-select";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import { MentorPreviewContent } from "./mentor-preview";
import { useAuthStore } from "@/stores/auth-store";

export function MentorDiscoverySettings({ projectId, activeMentors }: { projectId: string; activeMentors: number }) {
  const { t } = useI18n();
  const userId = useAuthStore(s => s.user?.id);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", projectId], queryFn: () => academicSupportApi.settings(projectId) });
  if (settings.isLoading) return <Skeleton className="h-16 w-full" />;
  if (!settings.data || settings.isError) return <div role="alert" className="space-y-2 text-sm"><p>{t("Could not load mentor discovery settings.")}</p><Button type="button" size="sm" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button></div>;
  return <DiscoveryEditor key={projectId} settings={settings.data} activeMentors={activeMentors} />;
}
const valueOf = (s: Settings) => ({ discovery: s.discovery, summary: s.summary, expertise: s.expertise, researchAreas: s.researchAreas, mentoringNeeds: s.mentoringNeeds });
function DiscoveryEditor({ settings, activeMentors }: { settings: Settings; activeMentors: number }) {
  const { t } = useI18n(), cache = useQueryClient(), lock = useRef(false);
  const userId = useAuthStore(s => s.user?.id);
  const [baseline, setBaseline] = useState(settings), [draft, setDraft] = useState(() => valueOf(settings)), [editing, setEditing] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(valueOf(baseline));
  const latest = settings.version > baseline.version;
  useUnsavedWorkspace(dirty);
  // Keep the preview live on clean refetches, while retaining a dirty draft's version.
  if (!dirty && latest) { setBaseline(settings); setDraft(valueOf(settings)); }
  const taxonomy = useQuery({ queryKey: ["academic-profile", "research-taxonomy"], queryFn: () => authApi.academicOnboardingOptions(), staleTime: 300_000 });
  const save = useMutation({ mutationFn: () => academicSupportApi.saveSettings(settings.id, { ...draft, summary: draft.summary.trim(), expectedVersion: baseline.version }), onSuccess: result => {
    setBaseline(result); setDraft(valueOf(result)); setEditing(false);
    cache.setQueryData(["academic-support", userId, "discovery-settings", settings.id], result);
    for (const key of [["project", settings.id], ["academic-support"], ["projects"]]) void cache.invalidateQueries({ queryKey: key });
    toast.success(t("Discovery settings saved"));
  } });
  const seeking = baseline.discovery === "SEEKING_MENTOR";
  const conflict = (save.error as { response?: { status?: number } } | null)?.response?.status === 409;
  return <section className="min-w-0 space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t("Mentor discovery")}</h3><span role="status" className="text-xs text-muted-foreground">{t(seeking ? "Seeking Mentor" : "Discovery is off")}</span></div>
    {!seeking && !editing && <><p className="text-sm leading-6 text-muted-foreground">{t(activeMentors ? "Discovery is independent of your active mentorship. Turning it on or off does not end a relationship." : "Find a suitable lecturer or let verified lecturers offer to mentor your project.")}</p><Button size="sm" type="button" variant="outline" onClick={() => { setDraft({ ...draft, discovery: "SEEKING_MENTOR" }); setEditing(true); }}>{t("Enable mentor discovery")}</Button></>}
    {!seeking && !editing && <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(true)}>{t("Edit shared preview")}</Button>}
    {seeking && !editing && <><MentorPreview settings={baseline} /><Button size="sm" type="button" variant="outline" onClick={() => setEditing(true)}>{t("Edit mentor discovery")}</Button></>}
    {editing && <form className="max-w-2xl space-y-4" onSubmit={async event => { event.preventDefault(); if (!dirty || lock.current) return; lock.current = true; try { await save.mutateAsync(); } catch { /* Keep input for retry. */ } finally { lock.current = false; } }}>
      {latest && <div role="status" className="space-y-2 text-sm"><p>{t("A newer version is available. Your draft has been kept.")}</p><Button size="sm" type="button" variant="outline" onClick={async () => { if ((await canLeaveWorkspace())) { setBaseline(settings); setDraft(valueOf(settings)); save.reset(); } }}>{t("Load latest version")}</Button></div>}
      <fieldset disabled={save.isPending} className="min-w-0 space-y-4"><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.discovery === "SEEKING_MENTOR"} onChange={event => setDraft({ ...draft, discovery: event.target.checked ? "SEEKING_MENTOR" : "CLOSED" })} />{t("Let verified lecturers discover this project")}</label>
        <div className="space-y-2"><Label htmlFor="mentor-safe-summary">{t("Safe discovery summary")}</Label><textarea autoFocus id="mentor-safe-summary" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={3} value={draft.summary} maxLength={2000} required={draft.discovery === "SEEKING_MENTOR"} minLength={draft.discovery === "SEEKING_MENTOR" ? 10 : undefined} onChange={event => setDraft({ ...draft, summary: event.target.value })} /></div>
        <ResearchAreaSelect label="Research areas shared with mentors" values={draft.researchAreas} onChange={researchAreas => setDraft({ ...draft, researchAreas })} max={10} options={taxonomy.data?.researchAreas} />
        <ResearchAreaSelect label="Expertise requested" values={draft.expertise} onChange={expertise => setDraft({ ...draft, expertise })} max={10} options={taxonomy.data?.researchAreas} />
        <div className="space-y-2"><Label htmlFor="mentor-needs">{t("Mentoring needs")}</Label><textarea id="mentor-needs" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={3} value={draft.mentoringNeeds} maxLength={2000} onChange={event => setDraft({ ...draft, mentoringNeeds: event.target.value })} placeholder={t("Describe the guidance your team needs.")} /></div>
        <MentorPreview settings={{ ...settings, ...draft }} />
        <p className="text-xs leading-5 text-muted-foreground">{t("Only this preview is shared with verified Lecturers. Keep confidential research out of it.")} {t("Project visibility and existing mentor relationships stay unchanged.")}</p>
      </fieldset>
      {save.error && <p role="alert" className="text-sm text-destructive">{t(conflict ? "Project settings changed. Refresh before saving again." : "Could not save discovery settings")}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" type="submit" disabled={!dirty || save.isPending || draft.discovery === "SEEKING_MENTOR" && draft.summary.trim().length < 10}>{t(save.isPending ? "Saving…" : "Save discovery settings")}</Button><Button size="sm" variant="ghost" type="button" disabled={save.isPending} onClick={async () => { if ((await canLeaveWorkspace())) { setDraft(valueOf(baseline)); setEditing(false); save.reset(); } }}>{t("Cancel")}</Button></div>
    </form>}
  </section>;
}
function MentorPreview({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  return <section aria-label={t("Mentor-facing preview")} className="min-w-0 space-y-2 rounded-md border bg-muted/30 p-3"><h4 className="text-xs font-semibold text-muted-foreground">{t("Mentor-facing preview")}</h4><MentorPreviewContent preview={settings} /></section>;
}
