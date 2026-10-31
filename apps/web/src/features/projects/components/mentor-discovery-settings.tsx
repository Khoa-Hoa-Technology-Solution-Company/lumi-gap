import { useEffect, useId, useRef, useState } from "react";
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

type EditorOptions = { startEditing?: boolean; onDone?: () => void; onEditingChange?: (editing: boolean) => void };
export function MentorDiscoverySettings({ projectId, ...options }: { projectId: string } & EditorOptions) {
  const { t } = useI18n();
  const userId = useAuthStore(s => s.user?.id);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", projectId], queryFn: () => academicSupportApi.settings(projectId) });
  if (settings.isLoading) return <Skeleton className="h-16 w-full" />;
  if (!settings.data) return <div role="alert" className="space-y-2 text-sm"><p>{t("Could not load mentor discovery settings.")}</p><Button type="button" size="sm" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button></div>;
  return <>{settings.isError && <p role="alert">{t("Could not load mentor discovery settings.")}</p>}<DiscoveryEditor key={`${userId}:${projectId}`} settings={settings.data} {...options} /></>;
}
const valueOf = (s: Settings) => ({ discovery: s.discovery, summary: s.summary, expertise: s.expertise, researchAreas: s.researchAreas, mentoringNeeds: s.mentoringNeeds });
function DiscoveryEditor({ settings, startEditing = false, onDone, onEditingChange }: { settings: Settings } & EditorOptions) {
  const { t } = useI18n(), cache = useQueryClient(), lock = useRef(false);
  const userId = useAuthStore(s => s.user?.id);
  const editorId = useId();
  const [baseline, setBaseline] = useState(settings), [draft, setDraft] = useState(() => valueOf(settings)), [editing, setEditing] = useState(startEditing);
  useEffect(() => { onEditingChange?.(editing); return () => onEditingChange?.(false); }, [editing, onEditingChange]);
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
    toast.success(t("Mentor preferences saved"));
    onDone?.();
  } });
  const seeking = baseline.discovery === "SEEKING_MENTOR";
  const conflict = (save.error as { response?: { status?: number } } | null)?.response?.status === 409;
  const configured = baseline.researchAreas.length > 0 || baseline.expertise.length > 0 || Boolean(baseline.mentoringNeeds.trim());
  return <section className="mentor-preferences min-w-0 space-y-3" aria-label={t("Mentor preferences")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t("Mentor preferences")}</h3>{!editing && <Button size="sm" type="button" variant="outline" onClick={() => setEditing(true)}>{t(configured ? "Edit preferences" : "Set up mentor preferences")}</Button>}</div>
    {!editing && <>{configured ? <><div className="mentor-preference-terms">{[...new Set([...baseline.researchAreas, ...baseline.expertise])].map(term => <span key={term}>{t(term)}</span>)}</div>{baseline.mentoringNeeds && <p className="line-clamp-2 whitespace-pre-wrap text-sm leading-6">{baseline.mentoringNeeds}</p>}</> : <p className="text-sm leading-6 text-muted-foreground">{t("Tell us which fields and expertise your team needs. We will prioritize matching lecturers.")}</p>}<p className="text-xs leading-5 text-muted-foreground">{t(seeking ? "Verified lecturers can discover your shared project preview." : "Only lecturers you invite will see this preview. Project discovery is off.")}</p></>}
    {editing && <form className="space-y-5" onSubmit={async event => { event.preventDefault(); if (!dirty || lock.current) return; lock.current = true; try { await save.mutateAsync(); } catch { /* Keep input for retry. */ } finally { lock.current = false; } }}>
      {latest && <div role="status" className="space-y-2 text-sm"><p>{t("A newer version is available. Your draft has been kept.")}</p><Button size="sm" type="button" variant="outline" onClick={async () => { if ((await canLeaveWorkspace())) { setBaseline(settings); setDraft(valueOf(settings)); save.reset(); } }}>{t("Load latest version")}</Button></div>}
      <fieldset disabled={save.isPending} className="min-w-0 space-y-5"><p className="text-xs leading-5 text-muted-foreground">{t("Saved fields and expertise are used to rank lecturers. Describe the support you need in your invitation.")}</p>
        <ResearchAreaSelect label="Mentor research fields" values={draft.researchAreas} onChange={researchAreas => setDraft({ ...draft, researchAreas })} max={10} options={taxonomy.data?.researchAreas} />
        <ResearchAreaSelect label="Expertise requested" values={draft.expertise} onChange={expertise => setDraft({ ...draft, expertise })} max={10} options={taxonomy.data?.researchAreas} />
        <div className="space-y-2"><Label htmlFor={`${editorId}-needs`}>{t("Mentoring needs")}</Label><textarea id={`${editorId}-needs`} className="min-h-24 w-full rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={3} value={draft.mentoringNeeds} maxLength={2000} onChange={event => setDraft({ ...draft, mentoringNeeds: event.target.value })} placeholder={t("For example: study design, weekly feedback, or help evaluating results.")} /></div>
        <div className="space-y-2"><Label htmlFor={`${editorId}-summary`}>{t("Shared research abstract")}</Label><textarea id={`${editorId}-summary`} aria-describedby={`${editorId}-summary-help`} className="min-h-32 w-full rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={5} value={draft.summary} maxLength={2000} required={draft.discovery === "SEEKING_MENTOR"} minLength={draft.discovery === "SEEKING_MENTOR" ? 10 : undefined} onChange={event => setDraft({ ...draft, summary: event.target.value })} placeholder={t("Describe the research problem, objectives and proposed approach. Share only what lecturers may read before accepting.")} /><p id={`${editorId}-summary-help`} className="text-xs leading-5 text-muted-foreground">{t("This approved abstract is visible before acceptance. Private project descriptions and manuscript source are never copied automatically.")}</p></div>
        <details><summary className="cursor-pointer text-sm text-primary">{t("Preview what lecturers will see")}</summary><div className="mt-3"><MentorPreview settings={{ ...settings, ...draft }} /></div></details>
        <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1.5" type="checkbox" checked={draft.discovery === "SEEKING_MENTOR"} onChange={event => setDraft({ ...draft, discovery: event.target.checked ? "SEEKING_MENTOR" : "CLOSED" })} /><span>{t("Let verified lecturers discover this project")}<span className="block text-xs text-muted-foreground">{t("Optional. You can save preferences and invite lecturers while discovery is off.")}</span></span></label>
        <p className="text-xs leading-5 text-muted-foreground">{t("Your project introduction, fields and mentoring needs are included in invitations.")}</p>
      </fieldset>
      {save.error && <p role="alert" className="text-sm text-destructive">{t(conflict ? "Project settings changed. Refresh before saving again." : "Could not save discovery settings")}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" type="submit" disabled={!dirty || save.isPending || draft.discovery === "SEEKING_MENTOR" && draft.summary.trim().length < 10}>{t(save.isPending ? "Saving…" : "Save mentor preferences")}</Button><Button size="sm" variant="ghost" type="button" disabled={save.isPending} onClick={async () => { if ((await canLeaveWorkspace())) { setDraft(valueOf(baseline)); setEditing(false); save.reset(); onDone?.(); } }}>{t("Cancel")}</Button></div>
    </form>}
  </section>;
}
function MentorPreview({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  return <section aria-label={t("Mentor-facing preview")} className="min-w-0 space-y-2 rounded-md border bg-muted/30 p-3"><h4 className="text-xs font-semibold text-muted-foreground">{t("Mentor-facing preview")}</h4><MentorPreviewContent preview={settings} /></section>;
}
