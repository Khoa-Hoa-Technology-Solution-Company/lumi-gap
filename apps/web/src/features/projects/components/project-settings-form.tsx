import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { IProject, ResearchApproach, UpdateProjectRequest } from "@trend/shared-types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useUpdateProject } from "../hooks/use-projects";
import { ProjectResearchFields } from "./project-research-fields";
import { canLeaveWorkspace, projectSectionHref, useUnsavedWorkspace } from "./workspace-common";

const generalValue = (p: IProject) => ({ title: p.title, description: p.description ?? "", areas: p.researchAreas ?? (p.researchField ? [p.researchField] : []), approach: p.researchApproach ?? "UNDECIDED" as ResearchApproach });
const privacyValue = (p: IProject) => ({ visibility: p.visibility, summary: p.publicSummary ?? "" });
const isPublic = (visibility: string) => ["PUBLIC", "PUBLIC_SUMMARY"].includes(visibility);

// Refetches may update a clean form. A dirty form keeps its original version and input until explicitly reloaded.
function useSettingsDraft<T>(project: IProject, value: (project: IProject) => T) {
  const [baseline, setBaseline] = useState(project), [draft, setDraft] = useState(() => value(project));
  const dirty = JSON.stringify(draft) !== JSON.stringify(value(baseline));
  const latest = (project.version ?? 0) > (baseline.version ?? 0);
  useUnsavedWorkspace(dirty);
  useEffect(() => { if (!dirty && latest) { setBaseline(project); setDraft(value(project)); } }, [project, dirty, latest, value]);
  const accept = (saved: IProject) => { setBaseline(saved); setDraft(value(saved)); };
  return { baseline, draft, setDraft, dirty, latest, accept, reload: () => { if (!dirty || canLeaveWorkspace()) accept(project); } };
}

function ChangedNotice({ visible, reload }: { visible: boolean; reload: () => void }) {
  const { t } = useI18n();
  return visible ? <div role="status" className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm"><p>{t("A newer version is available. Your draft has been kept.")}</p><Button type="button" size="sm" variant="outline" onClick={reload}>{t("Load latest version")}</Button></div> : null;
}
function saveError(failure: unknown) {
  return (failure as { response?: { status?: number } }).response?.status === 409 ? "Project settings changed. Refresh before saving again." : "Could not save project settings. Your changes are still here.";
}

export function ProjectGeneralSettings({ project }: { project: IProject }) {
  const { t } = useI18n(), state = useSettingsDraft(project, generalValue), update = useUpdateProject(project._id), lock = useRef(false);
  const { draft, setDraft, baseline } = state;
  const [error, setError] = useState("");
  const writable = project.accessRole === "OWNER" && project.status !== "ARCHIVED";
  async function save(event: FormEvent) {
    event.preventDefault(); if (!writable || lock.current || !state.dirty) return;
    if (!draft.title.trim() || draft.title.trim().length > 100) { setError(t("Enter a project title.")); return; }
    const original = generalValue(baseline);
    if (JSON.stringify(draft.areas) !== JSON.stringify(original.areas) && (draft.areas.length > 3 || draft.areas.some(area => !area.trim() || area.length > 120))) { setError(t("Choose up to 3 research areas.")); return; }
    if (draft.description !== original.description && draft.description.trim().length > 5000) { setError(t("Keep the description under 5000 characters.")); return; }
    const patch: UpdateProjectRequest = { expectedVersion: baseline.version };
    if (draft.title !== original.title) patch.title = draft.title.trim();
    if (draft.description !== original.description) patch.description = draft.description;
    if (JSON.stringify(draft.areas) !== JSON.stringify(original.areas)) patch.researchAreas = draft.areas;
    if (draft.approach !== original.approach) patch.researchApproach = draft.approach;
    lock.current = true; setError("");
    try { const saved = await update.mutateAsync(patch); state.accept(saved); toast.success(t("Project settings saved")); }
    catch (failure) { setError(t(saveError(failure))); } finally { lock.current = false; }
  }
  return <form onSubmit={save} className="space-y-4" aria-labelledby="project-general-heading">
    <h3 id="project-general-heading" className="text-lg font-semibold">{t("General information")}</h3>
    <ChangedNotice visible={state.latest} reload={state.reload} />
    <fieldset disabled={!writable || update.isPending} className="min-w-0 space-y-4">
      <div className="space-y-2"><Label htmlFor="project-settings-title">{t("Project name")} *</Label><Input id="project-settings-title" value={draft.title} maxLength={100} required onChange={event => setDraft({ ...draft, title: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="project-settings-description">{t("Short description")}</Label><textarea id="project-settings-description" rows={3} className="project-form-textarea" value={draft.description} maxLength={Math.max(5000, baseline.description?.length ?? 0)} onChange={event => setDraft({ ...draft, description: event.target.value })} /><p className="text-xs leading-5 text-muted-foreground">{t("Summarize the research problem or goal. Detailed objectives and methodology belong in the Research Plan.")}</p></div>
      <ProjectResearchFields areas={draft.areas} approach={draft.approach} onAreasChange={areas => setDraft({ ...draft, areas })} onApproachChange={approach => setDraft({ ...draft, approach })} />
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">{writable && <Button type="submit" disabled={!state.dirty || update.isPending}>{t(update.isPending ? "Saving…" : "Save general information")}</Button>}<Link className="text-sm text-primary underline-offset-4 hover:underline" to={projectSectionHref(project._id, "plan")}>{t("Open Research Plan")}</Link></div>
  </form>;
}

/** Mirrors the explicit public DTO: title, summary, areas, lifecycle status and record dates. */
export function ProjectPublicPreview({ project, summary }: { project: IProject; summary: string }) {
  const { t, language } = useI18n();
  const status = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" };
  return <section aria-label={t("Public preview")} className="min-w-0 space-y-2 rounded-md border bg-muted/30 p-4 text-sm [overflow-wrap:anywhere]">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Public preview")}</h4><p className="font-semibold">{project.title}</p>
    <p className="whitespace-pre-wrap">{summary || t("No public description yet.")}</p>
    <p className="text-muted-foreground">{(project.researchAreas ?? (project.researchField ? [project.researchField] : [])).map(area => t(area)).join(" · ") || t("No research areas selected")}</p>
    <p>{t("Project status")}: {t(status[project.status])}</p>
    <p className="text-xs text-muted-foreground">{t("Created")}: {new Date(project.createdAt).toLocaleDateString(language)} · {t("Updated")}: {new Date(project.updatedAt).toLocaleDateString(language)}</p>
  </section>;
}

export function ProjectPrivacySettings({ project }: { project: IProject }) {
  const { t } = useI18n(), state = useSettingsDraft(project, privacyValue), update = useUpdateProject(project._id), lock = useRef(false);
  const { draft, setDraft, baseline } = state;
  const [error, setError] = useState(""), [confirm, setConfirm] = useState(false);
  const writable = project.accessRole === "OWNER" && project.status !== "ARCHIVED";
  const publicDraft = isPublic(draft.visibility), publishing = publicDraft && !isPublic(baseline.visibility);
  async function save() {
    if (!writable || lock.current || !state.dirty) return;
    if (publicDraft && !draft.summary.trim()) { setError(t("Write a public description before publishing.")); return; }
    const patch: UpdateProjectRequest = { expectedVersion: baseline.version };
    if (draft.visibility !== baseline.visibility) patch.visibility = draft.visibility;
    if (draft.summary !== (baseline.publicSummary ?? "")) patch.publicSummary = draft.summary.trim();
    lock.current = true; setError("");
    try { const saved = await update.mutateAsync(patch); state.accept(saved); setConfirm(false); toast.success(t("Privacy settings saved")); }
    catch (failure) { setError(t(saveError(failure))); setConfirm(false); } finally { lock.current = false; }
  }
  return <form className="space-y-4 border-t pt-6" aria-labelledby="project-privacy-heading" onSubmit={event => { event.preventDefault(); if (!writable || !state.dirty) return; if (publicDraft && !draft.summary.trim()) { setError(t("Write a public description before publishing.")); return; } if (publishing) setConfirm(true); else void save(); }}>
    <h3 id="project-privacy-heading" className="text-lg font-semibold">{t("Privacy")}</h3>
    <ChangedNotice visible={state.latest} reload={state.reload} />
    <fieldset disabled={!writable || update.isPending} className="min-w-0 space-y-4"><legend className="sr-only">{t("Project visibility")}</legend>
      {([false, true] as const).map(value => <label key={String(value)} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"><input type="radio" name="project-visibility" className="mt-1 accent-primary" checked={publicDraft === value} onChange={() => setDraft({ ...draft, visibility: value ? "PUBLIC" : "PRIVATE" })} /><span className="min-w-0 text-sm"><strong className="block font-medium">{t(value ? "Public" : "Private")}</strong><span className="mt-1 block leading-5 text-muted-foreground">{t(value ? "Others can see the information selected for the project introduction." : "Only people with permission can view internal project content.")}</span></span></label>)}
      {publicDraft && <><div className="space-y-2"><Label htmlFor="project-public-summary">{t("Public description")}</Label><textarea id="project-public-summary" className="project-form-textarea" rows={3} value={draft.summary} maxLength={2000} required aria-describedby="public-summary-help" onChange={event => setDraft({ ...draft, summary: event.target.value })} /><p id="public-summary-help" className="text-xs text-muted-foreground">{t("This text appears on the project introduction page.")}</p></div><ProjectPublicPreview project={project} summary={draft.summary} /><p className="text-xs leading-5 text-muted-foreground">{t("Papers, files, team details, evidence, tasks, manuscripts, contributions and mentor feedback stay private.")}</p></>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {writable && <Button type="submit" variant="outline" disabled={!state.dirty || update.isPending}>{t(update.isPending ? "Saving…" : "Save privacy")}</Button>}
    <Dialog open={confirm} onOpenChange={open => { if (!update.isPending) setConfirm(open); }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("Publish project introduction?")}</DialogTitle><DialogDescription>{t("Anyone with the project link can view this introduction. Internal research remains private.")}</DialogDescription></DialogHeader><ProjectPublicPreview project={project} summary={draft.summary} /><DialogFooter><Button type="button" variant="outline" disabled={update.isPending} onClick={() => setConfirm(false)}>{t("Cancel")}</Button><Button type="button" disabled={update.isPending} onClick={() => void save()}>{t(update.isPending ? "Saving…" : "Confirm publication")}</Button></DialogFooter></DialogContent></Dialog>
  </form>;
}
