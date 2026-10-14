import { useRef, useState, type FormEvent } from "react";
import type { CreateProjectRequest, ResearchApproach } from "@trend/shared-types";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Globe2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useCreateProject } from "../hooks/use-projects";
import { ProjectResearchFields } from "./project-research-fields";

interface Draft extends CreateProjectRequest { idempotencyKey: string; submitted?: boolean }
function readDraft(key: string): Draft {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) || "null");
    if (parsed && typeof parsed === "object") {
      const value = parsed as Record<string, unknown>;
      if (typeof value.title === "string" && value.title.length <= 100
        && typeof value.description === "string" && value.description.length <= 5000
        && typeof value.idempotencyKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey)
        && (value.visibility === "PRIVATE" || value.visibility === "PUBLIC")
        && Array.isArray(value.researchAreas) && value.researchAreas.length <= 3
        && value.researchAreas.every(area => typeof area === "string" && area.trim().length > 0 && area.length <= 120)
        && new Set(value.researchAreas.map(area => (area as string).trim().toLocaleLowerCase())).size === value.researchAreas.length
        && typeof value.researchApproach === "string" && ["UNDECIDED", "EXPLORATORY", "LITERATURE_REVIEW", "EMPIRICAL"].includes(value.researchApproach)
        && (value.submitted === undefined || typeof value.submitted === "boolean")) {
        return { title: value.title, description: value.description, idempotencyKey: value.idempotencyKey,
          visibility: value.visibility, researchAreas: value.researchAreas as string[],
          researchApproach: value.researchApproach as ResearchApproach, submitted: value.submitted as boolean | undefined };
      }
    }
  } catch { /* Storage is optional. Submission still uses an in-memory stable key. */ }
  return { title: "", description: "", visibility: "PRIVATE", researchAreas: [], researchApproach: "UNDECIDED", idempotencyKey: crypto.randomUUID() };
}

export function CreateProjectForm({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { t } = useI18n(), navigate = useNavigate();
  const userId = useAuthStore(state => state.user?.id);
  const storageKey = `lumigap.project-create.v1.${userId}`;
  const [draft, setDraft] = useState(() => readDraft(storageKey));
  const [error, setError] = useState("");
  const [titleError, setTitleError] = useState("");
  const lock = useRef(false);
  const create = useCreateProject();
  const change = (next: Partial<Draft>) => {
    const value = { ...draft, ...next };
    setDraft(value);
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Optional draft storage. */ }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (!draft.title.trim()) { setTitleError(t("Enter a project title.")); return; }
    lock.current = true; onBusyChange(true); setError(""); setTitleError("");
    const { submitted: _submitted, ...payload } = draft;
    change({ submitted: true });
    try {
      const project = await create.mutateAsync({ ...payload, title: payload.title.trim(), description: payload.description?.trim() });
      try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
      toast.success(t("Project created successfully"));
      onClose(); navigate(`/projects/${encodeURIComponent(project._id)}?tab=papers&welcome=1`);
    } catch (failure) {
      const response = (failure as { response?: { status: number; data?: { error?: { code?: string } } } }).response;
      if (response?.status && response.status < 500) change({ submitted: false });
      setError(t(response?.data?.error?.code === "ONBOARDING_REQUIRED" ? "Complete your academic profile before creating a project."
        : response?.status === 401 ? "Please sign in again. Your project details are saved."
        : response?.status === 403 ? "Your account cannot create projects yet. Check your email verification and profile."
        : response?.status === 409 ? "This request was already used. Retry with the original project details."
        : "We could not confirm creation. Retry to safely recover the same project."));
    } finally { lock.current = false; onBusyChange(false); }
  };
  return <div data-no-i18n>
    <DialogHeader><DialogTitle className="text-2xl">{t("Create project")}</DialogTitle><DialogDescription>{t("Start with an idea. Bring in your team and evidence when you are ready.")}</DialogDescription></DialogHeader>
    <form onSubmit={submit} noValidate className="mt-5 space-y-5">
      <fieldset disabled={create.isPending || draft.submitted} className="min-w-0 space-y-5">
        <div className="space-y-2"><Label htmlFor="project-create-title">{t("Project title")}</Label>
          <Input id="project-create-title" name="title" autoComplete="off" autoFocus maxLength={100} required value={draft.title} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? "project-title-error" : undefined} onChange={event => { change({ title: event.target.value }); setTitleError(""); }} placeholder={t("What would you like to investigate?")} />
          {titleError ? <p id="project-title-error" role="alert" className="text-sm text-destructive">{titleError}</p> : null}
        </div>
        <div className="space-y-2"><Label htmlFor="project-create-description">{t("Research problem or objective")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span></Label>
          <textarea id="project-create-description" className="project-form-textarea" rows={3} maxLength={5000} value={draft.description ?? ""} onChange={event => change({ description: event.target.value })} placeholder={t("A few sentences about the idea you want to explore.")} />
        </div>
        <fieldset><legend className="mb-2 text-sm font-medium">{t("Visibility")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">{(["PRIVATE", "PUBLIC"] as const).map(value => <label key={value} className="project-privacy-choice" data-selected={draft.visibility === value}>
            <input type="radio" name="visibility" value={value} checked={draft.visibility === value} onChange={() => change({ visibility: value })} />
            {value === "PRIVATE" ? <LockKeyhole aria-hidden="true" /> : <Globe2 aria-hidden="true" />}<span>{t(value === "PRIVATE" ? "Private" : "Public summary")}</span>
          </label>)}</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t(draft.visibility === "PRIVATE" ? "Only your team can open the workspace. Mentor discovery starts off."
            : "Publishes the title and research areas. You can approve a public summary later. Research content stays private.")}</p>
        </fieldset>
        <details className="project-form-optional"><summary>{t("Research direction (optional)")}</summary><div className="pt-4"><ProjectResearchFields areas={draft.researchAreas ?? []} approach={draft.researchApproach ?? "UNDECIDED"} onAreasChange={researchAreas => change({ researchAreas })} onApproachChange={(researchApproach: ResearchApproach) => change({ researchApproach })} /></div></details>
      </fieldset>
      {error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}
      {draft.submitted && !create.isPending ? <p className="text-xs text-muted-foreground">{t("Your submitted details are kept for a safe retry.")}</p> : null}
      <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>{t("Cancel")}</Button><Button type="submit" disabled={create.isPending || !draft.title.trim()}>{t(create.isPending ? "Creating…" : error ? "Retry creation" : "Create project")}</Button></DialogFooter>
    </form>
  </div>;
}
