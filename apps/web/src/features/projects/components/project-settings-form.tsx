import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { IProject, ResearchApproach, UpdateProjectRequest } from "@trend/shared-types";
import { ArrowUpRight, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/features/auth/api/auth.api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useUpdateProject } from "../hooks/use-projects";
import { RESEARCH_APPROACHES } from "./project-research-fields";
import { ResearchAreaSelect } from "./research-area-select";
import { canLeaveWorkspace, projectSectionHref, useUnsavedWorkspace } from "./workspace-common";

const generalValue = (p: IProject) => ({
  title: p.title,
  description: p.description ?? "",
  areas: p.researchAreas ?? (p.researchField ? [p.researchField] : []),
});
const privacyValue = (p: IProject) => ({ visibility: p.visibility, summary: p.publicSummary ?? "" });
const isPublic = (visibility: string) => ["PUBLIC", "PUBLIC_SUMMARY"].includes(visibility);

// Refetches may update a clean form. A dirty form keeps its original version and input until explicitly reloaded.
export function useSettingsDraft<T>(project: IProject, value: (project: IProject) => T) {
  const [baseline, setBaseline] = useState(project), [draft, setDraft] = useState(() => value(project));
  const dirty = JSON.stringify(draft) !== JSON.stringify(value(baseline));
  const latest = (project.version ?? 0) > (baseline.version ?? 0);
  useUnsavedWorkspace(dirty);
  useEffect(() => { if (!dirty && latest) { setBaseline(project); setDraft(value(project)); } }, [project, dirty, latest, value]);
  const accept = (saved: IProject) => { setBaseline(saved); setDraft(value(saved)); };
  return { baseline, draft, setDraft, dirty, latest, accept, reload: async () => { if (!dirty || (await canLeaveWorkspace())) accept(project); } };
}

export function ChangedNotice({ visible, reload }: { visible: boolean; reload: () => void }) {
  const { t } = useI18n();
  return visible ? (
    <div role="status" className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <p>{t("A newer version is available. Your draft has been kept.")}</p>
      <Button type="button" size="sm" variant="outline" onClick={reload}>{t("Load latest version")}</Button>
    </div>
  ) : null;
}

export function settingsSaveError(failure: unknown) {
  return (failure as { response?: { status?: number } }).response?.status === 409
    ? "Project settings changed. Refresh before saving again."
    : "Could not save project settings. Your changes are still here.";
}

export function ProjectGeneralSettings({ project }: { project: IProject }) {
  const { t } = useI18n();
  const state = useSettingsDraft(project, generalValue);
  const update = useUpdateProject(project._id);
  const lock = useRef(false);
  const { draft, setDraft, baseline } = state;
  const [error, setError] = useState("");
  const writable = project.accessRole === "OWNER" && project.status !== "ARCHIVED";
  const taxonomy = useQuery({
    queryKey: ["academic-profile", "research-taxonomy"],
    queryFn: () => authApi.academicOnboardingOptions(),
    staleTime: 300_000,
  });
  const approachKey: ResearchApproach = project.researchApproach ?? "UNDECIDED";
  const approachLabel = RESEARCH_APPROACHES[approachKey] ?? RESEARCH_APPROACHES.UNDECIDED;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!writable || lock.current || !state.dirty) return;
    if (!draft.title.trim() || draft.title.trim().length > 100) {
      setError(t("Enter a project title."));
      return;
    }
    const original = generalValue(baseline);
    if (
      JSON.stringify(draft.areas) !== JSON.stringify(original.areas) &&
      (draft.areas.length > 3 || draft.areas.some(area => !area.trim() || area.length > 120))
    ) {
      setError(t("Choose up to 3 research areas."));
      return;
    }
    if (draft.description !== original.description && draft.description.trim().length > 5000) {
      setError(t("Keep the description under 5000 characters."));
      return;
    }
    const patch: UpdateProjectRequest = { expectedVersion: baseline.version };
    if (draft.title !== original.title) patch.title = draft.title.trim();
    if (draft.description !== original.description) patch.description = draft.description;
    if (JSON.stringify(draft.areas) !== JSON.stringify(original.areas)) patch.researchAreas = draft.areas;
    lock.current = true;
    setError("");
    try {
      const saved = await update.mutateAsync(patch);
      state.accept(saved);
      toast.success(t("Project settings saved"));
    } catch (failure) {
      setError(t(settingsSaveError(failure)));
    } finally {
      lock.current = false;
    }
  }

  return (
    <form
      onSubmit={save}
      className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-5"
      aria-labelledby="project-general-heading"
    >
      <div className="space-y-1">
        <h3 id="project-general-heading" className="text-base font-semibold text-foreground">
          {t("General information")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("Summarize the research problem or goal. Detailed objectives and methodology belong in the Research Plan.")}
        </p>
      </div>

      <ChangedNotice visible={state.latest} reload={state.reload} />

      <fieldset disabled={!writable || update.isPending} className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="project-settings-title">{t("Project name")} *</Label>
          <Input
            id="project-settings-title"
            value={draft.title}
            maxLength={100}
            required
            onChange={event => setDraft({ ...draft, title: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="project-settings-description">{t("Short description")}</Label>
          <textarea
            id="project-settings-description"
            rows={3}
            className="project-form-textarea"
            value={draft.description}
            maxLength={Math.max(5000, baseline.description?.length ?? 0)}
            onChange={event => setDraft({ ...draft, description: event.target.value })}
          />
        </div>

        <div className="space-y-1">
          <ResearchAreaSelect
            values={draft.areas}
            onChange={areas => setDraft({ ...draft, areas })}
            options={taxonomy.data?.researchAreas}
          />
          <p className="text-xs text-muted-foreground">{t("Choose a suggested area or add your own.")}</p>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3.5 py-2.5 text-sm">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("Research approach")}:</span>
            <Badge variant="secondary" className="font-medium">{t(approachLabel)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Research approach is managed in your Research Plan.")}
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline shrink-0"
          to={projectSectionHref(project._id, "plan")}
        >
          <span>{t("Open Research Plan")}</span>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {writable ? (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-1 border-t border-border/60">
          <Button type="submit" disabled={!state.dirty || update.isPending}>
            {t(update.isPending ? "Saving…" : "Save changes")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/** Mirrors the explicit public DTO: title, summary, areas, lifecycle status and record dates. */
export function ProjectPublicPreview({ project, summary }: { project: IProject; summary: string }) {
  const { t, language } = useI18n();
  const status = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" };
  return (
    <section
      aria-label={t("Public preview")}
      className="min-w-0 space-y-2 rounded-lg border bg-muted/30 p-4 text-sm [overflow-wrap:anywhere]"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Public preview")}</h4>
      <p className="font-semibold">{project.title}</p>
      <p className="whitespace-pre-wrap">{summary || t("No public description yet.")}</p>
      <p className="text-muted-foreground">
        {(project.researchAreas ?? (project.researchField ? [project.researchField] : [])).map(area => t(area)).join(" · ") || t("No research areas selected")}
      </p>
      <p>{t("Project status")}: {t(status[project.status])}</p>
      <p className="text-xs text-muted-foreground">
        {t("Created")}: {new Date(project.createdAt).toLocaleDateString(language)} · {t("Updated")}: {new Date(project.updatedAt).toLocaleDateString(language)}
      </p>
    </section>
  );
}

export function ProjectPrivacySettings({ project }: { project: IProject }) {
  const { t } = useI18n();
  const state = useSettingsDraft(project, privacyValue);
  const update = useUpdateProject(project._id);
  const lock = useRef(false);
  const { draft, setDraft, baseline } = state;
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const writable = project.accessRole === "OWNER" && project.status !== "ARCHIVED";
  const publicDraft = isPublic(draft.visibility);
  const publishing = publicDraft && !isPublic(baseline.visibility);

  async function save() {
    if (!writable || lock.current || !state.dirty) return;
    if (publicDraft && !draft.summary.trim()) {
      setError(t("Write a public description before publishing."));
      return;
    }
    const patch: UpdateProjectRequest = { expectedVersion: baseline.version };
    if (draft.visibility !== baseline.visibility) patch.visibility = draft.visibility;
    if (draft.summary !== (baseline.publicSummary ?? "")) patch.publicSummary = draft.summary.trim();
    lock.current = true;
    setError("");
    try {
      const saved = await update.mutateAsync(patch);
      state.accept(saved);
      setConfirm(false);
      toast.success(t("Privacy settings saved"));
    } catch (failure) {
      setError(t(settingsSaveError(failure)));
      setConfirm(false);
    } finally {
      lock.current = false;
    }
  }

  return (
    <form
      className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-5"
      aria-labelledby="project-privacy-heading"
      onSubmit={event => {
        event.preventDefault();
        if (!writable || !state.dirty) return;
        if (publicDraft && !draft.summary.trim()) {
          setError(t("Write a public description before publishing."));
          return;
        }
        if (publishing) setConfirm(true);
        else void save();
      }}
    >
      <div className="space-y-1">
        <h3 id="project-privacy-heading" className="text-base font-semibold text-foreground">
          {t("Privacy")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("Public visitors can only see the project title, public description, research areas, and status. Team chat, manuscripts, library, evidence matrix, screening, files, and private reviews always stay private.")}
        </p>
      </div>

      <ChangedNotice visible={state.latest} reload={state.reload} />

      <fieldset disabled={!writable || update.isPending} className="min-w-0 space-y-4">
        <legend className="sr-only">{t("Project visibility")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([false, true] as const).map(value => {
            const Icon = value ? Globe : Lock;
            return (
              <label
                key={String(value)}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="project-visibility"
                  className="mt-1 accent-primary shrink-0"
                  checked={publicDraft === value}
                  onChange={() => setDraft({ ...draft, visibility: value ? "PUBLIC" : "PRIVATE" })}
                />
                <span className="min-w-0 text-sm">
                  <strong className="flex items-center gap-1.5 font-medium text-foreground">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>{t(value ? "Public" : "Private")}</span>
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {t(
                      value
                        ? "Others can see the information selected for the project introduction."
                        : "Only people with permission can view internal project content.",
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {publicDraft ? (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="project-public-summary">{t("Public description")}</Label>
              <textarea
                id="project-public-summary"
                className="project-form-textarea"
                rows={3}
                value={draft.summary}
                maxLength={2000}
                required
                aria-describedby="public-summary-help"
                onChange={event => setDraft({ ...draft, summary: event.target.value })}
              />
              <p id="public-summary-help" className="text-xs text-muted-foreground">
                {t("This text appears on the project introduction page.")}
              </p>
            </div>
            <ProjectPublicPreview project={project} summary={draft.summary} />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("Papers, files, team details, evidence, tasks, manuscripts, contributions and mentor feedback stay private.")}
            </p>
          </div>
        ) : null}
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {writable ? (
        <div className="flex justify-end pt-1 border-t border-border/60">
          <Button type="submit" variant="outline" disabled={!state.dirty || update.isPending}>
            {t(update.isPending ? "Saving…" : "Save privacy")}
          </Button>
        </div>
      ) : null}

      <Dialog open={confirm} onOpenChange={open => { if (!update.isPending) setConfirm(open); }}>
        <DialogContent closeLabel={t("Close")} data-no-i18n>
          <DialogHeader>
            <DialogTitle>{t("Publish project introduction?")}</DialogTitle>
            <DialogDescription>
              {t("Anyone with the project link can view this introduction. Internal research remains private.")}
            </DialogDescription>
          </DialogHeader>
          <ProjectPublicPreview project={project} summary={draft.summary} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={update.isPending} onClick={() => setConfirm(false)}>
              {t("Cancel")}
            </Button>
            <Button type="button" disabled={update.isPending} onClick={() => void save()}>
              {t(update.isPending ? "Saving…" : "Confirm publication")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
