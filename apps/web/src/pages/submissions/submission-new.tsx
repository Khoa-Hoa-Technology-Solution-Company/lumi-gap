import { useId, useRef, useState } from "react";
import type { StructuredSubmissionInput, SubmissionType } from "@trend/shared-types";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject, useProjects } from "@/features/projects/hooks/use-projects";
import { useCreateSubmission } from "@/features/submissions";
import { useI18n } from "@/i18n";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";

const types: Array<{ value: SubmissionType; label: string }> = [
  { value: "RESEARCH_PROPOSAL", label: "Research proposal" }, { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "THESIS_DRAFT", label: "Thesis draft" }, { value: "RESEARCH_PAPER", label: "Research paper" },
  { value: "SOFTWARE_RESEARCH_PROJECT", label: "Software research project" },
];
const controlClass = "mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function SubmissionNewPage({ projectId, projectTitle }: { projectId?: string; projectTitle?: string }) {
  const { t } = useI18n();
  const projects = useProjects({ enabled: !projectId });
  const backPath = projectId ? projectSubmissionPath(projectId) : "/submissions";
  const Heading = projectId ? "h2" : "h1";
  const create = useCreateSubmission();
  const navigate = useNavigate();
  const submitting = useRef(false);
  const introductionId = useId();
  const [showIntroduction, setShowIntroduction] = useState(false);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [form, setForm] = useState({ projectId: projectId ?? "", title: undefined as string | undefined, abstract: "", submissionType: "RESEARCH_PAPER" as SubmissionType, researchField: undefined as string | undefined });
  const selectedProjectId = projectId ?? form.projectId;
  const project = useProject(selectedProjectId || undefined);
  const selectedProject = project.data ?? projects.data?.find(item => item._id === selectedProjectId);
  // Derive defaults from the current project without overwriting text the author has edited.
  const title = form.title ?? projectTitle ?? selectedProject?.title ?? "";
  const researchField = form.researchField ?? (selectedProject?.researchField || selectedProject?.researchAreas?.join(", ") || "").slice(0, 200);
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || create.isPending) return;
    if (!selectedProjectId || title.trim().length < 3 || title.trim().length > 300) { setError(t("Choose a project and enter a title of 3–300 characters.")); return; }
    if (!file) { setError(t("Attach a PDF manuscript")); return; }
    if (file.type !== "application/pdf" || file.size === 0 || file.size > 10 * 1024 * 1024) { setError(t("Use a PDF no larger than 10 MB")); return; }
    const input: StructuredSubmissionInput = { ...form, projectId: selectedProjectId, title: title.trim(), researchField };
    submitting.current = true; setError("");
    try {
      const result = await create.mutateAsync({ input, file });
      toast.success(t("Submission saved. Choose a lecturer to request feedback."));
      navigate(projectSubmissionPath(selectedProjectId, result.submission._id));
    } catch { setError(t("Could not create the submission. Your PDF and entered information are retained; try again.")); }
    finally { submitting.current = false; }
  }

  return <div className={projectId ? "project-submission-editor" : "mx-auto w-full max-w-3xl px-4 py-8 sm:px-6"} data-no-i18n>
    <Link to={backPath} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />{t("Back to submissions")}</Link>
    <header className="mt-5 border-b border-border pb-5">
      <Heading className="text-2xl font-semibold tracking-tight">{t("Prepare a manuscript for lecturer review")}</Heading>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("Add your PDF and check the title. You will choose a lecturer in the next step.")}</p>
    </header>
    <form onSubmit={submit} className="mt-6 max-w-3xl space-y-6" aria-busy={create.isPending}>
      <fieldset disabled={create.isPending} className="min-w-0 space-y-5">
        {projectId ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="text-muted-foreground">{t("Research project")}</span><span className="font-medium break-words">{projectTitle ?? selectedProject?.title ?? projectId}</span></div> : <Field label={t("Research project")}><select required className={controlClass} value={form.projectId} onChange={event => setForm(current => ({ ...current, projectId: event.target.value, title: undefined, researchField: undefined }))}><option value="">{t("Select a project")}</option>{projects.data?.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}</select>{projects.error ? <p role="alert" className="mt-2 text-xs text-destructive">{t("Unable to load projects. Please try again.")} <button type="button" className="underline" onClick={() => void projects.refetch()}>{t("Retry")}</button></p> : null}</Field>}
        <Field label={t("Title")}><Input required minLength={3} maxLength={300} className="mt-2" value={title} onChange={event => update("title", event.target.value)} /></Field>
        <div>
          <label className="flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-input bg-muted/20 p-4 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
            <FileText className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm"><span className="block break-words font-medium">{file?.name || t("Choose PDF manuscript")}</span><span className="mt-1 block text-xs text-muted-foreground">{t("PDF only · maximum 10 MB")}{file ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : ""}</span></span>
            <input className="sr-only" type="file" accept="application/pdf,.pdf" aria-label={t("Choose PDF manuscript")} onChange={event => { const selected = event.target.files?.[0]; if (selected) { setFile(selected); setError(""); } }} />
          </label>
          {file ? <button type="button" className="mt-2 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={event => { setFile(undefined); const input = event.currentTarget.parentElement?.querySelector<HTMLInputElement>('input[type="file"]'); if (input) input.value = ""; }}>{t("Remove PDF")}</button> : null}
        </div>
        <details className="group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-sm py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 break-words text-muted-foreground"><span className="sr-only">{t("Submission type")}: </span>{t(types.find(type => type.value === form.submissionType)!.label)}{researchField ? ` · ${researchField}` : ""}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{t("Edit details")}<ChevronDown className="h-3.5 w-3.5 group-open:rotate-180" aria-hidden="true" /></span>
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label={t("Submission type")}><select className={controlClass} value={form.submissionType} onChange={event => update("submissionType", event.target.value)}>{types.map(type => <option key={type.value} value={type.value}>{t(type.label)}</option>)}</select></Field>
            <Field label={t("Research field")}><Input maxLength={200} className="mt-2" value={researchField} onChange={event => update("researchField", event.target.value)} /></Field>
          </div>
        </details>
        <div>
          <button type="button" aria-expanded={showIntroduction} aria-controls={introductionId} onClick={() => setShowIntroduction(current => !current)} className="inline-flex items-center gap-2 rounded-sm py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {showIntroduction ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {t(showIntroduction ? "Short introduction (optional)" : form.abstract.trim() ? "Edit introduction" : "Add a short introduction")}
          </button>
          <div id={introductionId} hidden={!showIntroduction}>
            <textarea aria-label={t("Short introduction (optional)")} value={form.abstract} onChange={event => update("abstract", event.target.value)} maxLength={10000} rows={3} placeholder={t("A few sentences about the manuscript, if needed.")} className="mt-2 block min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <footer className="flex justify-end border-t border-border pt-5">
        <div className="flex shrink-0 justify-end gap-2"><Button asChild variant="ghost"><Link to={backPath}>{t("Cancel")}</Link></Button><Button type="submit" disabled={create.isPending || !selectedProjectId || !file || title.trim().length < 3}>{create.isPending ? t("Creating…") : t("Save and continue")}</Button></div>
      </footer>
    </form>
  </div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-sm font-medium">{label}{hint ? <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span> : null}{children}</label>;
}
