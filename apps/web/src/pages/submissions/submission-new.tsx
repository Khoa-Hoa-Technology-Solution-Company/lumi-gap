import { useState } from "react";
import type { StructuredSubmissionInput, SubmissionType } from "@trend/shared-types";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useCreateSubmission } from "@/features/submissions";

import { projectSubmissionPath } from "@/features/submissions/project-submission-path";

const types: Array<{ value: SubmissionType; label: string }> = [
  { value: "RESEARCH_PROPOSAL", label: "Research proposal" }, { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "THESIS_DRAFT", label: "Thesis draft" }, { value: "RESEARCH_PAPER", label: "Research paper" },
  { value: "SOFTWARE_RESEARCH_PROJECT", label: "Software research project" },
];
const csv = (value: string) => [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];

export function SubmissionNewPage({ projectId, projectTitle }: { projectId?: string; projectTitle?: string }) {
  const projects = useProjects({ enabled: !projectId });
  const backPath = projectId ? projectSubmissionPath(projectId) : "/submissions";
  const Heading = projectId ? "h2" : "h1";
  const create = useCreateSubmission();
  const navigate = useNavigate();
  const [file, setFile] = useState<File>();
  const [form, setForm] = useState({ projectId: projectId ?? "", title: "", abstract: "", submissionType: "RESEARCH_PAPER" as SubmissionType, researchField: "", researchGoal: "", researchQuestions: "", claimedResearchGap: "", claimedContribution: "", methodology: "", scope: "", keywords: "", expectedReviewWorkload: "2–4 hours" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return toast.error("Attach a PDF manuscript");
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) return toast.error("Use a PDF no larger than 10 MB");
    const input: StructuredSubmissionInput = { ...form, projectId: projectId ?? form.projectId, researchQuestions: csv(form.researchQuestions), keywords: csv(form.keywords) };
    try { const result = await create.mutateAsync({ input, file }); toast.success("Submission created with revision 1"); navigate(projectSubmissionPath(projectId ?? form.projectId, result.submission._id)); } catch { toast.error("Could not create the submission. Check the project and PDF."); }
  }

  return <div className={projectId ? "project-submission-editor" : "mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"}><Link to={backPath} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Back to submissions</Link><header className="mt-5 border-b border-border pb-6"><Heading className="text-3xl font-semibold tracking-tight">New research submission</Heading><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Describe the academic intent explicitly. A file alone is not enough for evidence-aware review.</p></header><form onSubmit={submit} className="mt-7 space-y-6"><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Submission context</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Research project">{projectId ? <Input className="mt-2" value={projectTitle ?? projectId} readOnly aria-readonly="true" /> : <select required className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.projectId} onChange={(event) => update("projectId", event.target.value)}><option value="">Select a project</option>{projects.data?.map((project) => <option key={project._id} value={project._id}>{project.title}</option>)}</select>}</Field><Field label="Submission type"><select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.submissionType} onChange={(event) => update("submissionType", event.target.value)}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field><Field label="Title" wide><Input required minLength={3} maxLength={300} className="mt-2" value={form.title} onChange={(event) => update("title", event.target.value)} /></Field><Field label="Research field"><Input className="mt-2" value={form.researchField} onChange={(event) => update("researchField", event.target.value)} placeholder="Software Engineering" /></Field><Field label="Expected reviewer workload"><Input className="mt-2" value={form.expectedReviewWorkload} onChange={(event) => update("expectedReviewWorkload", event.target.value)} /></Field><TextField label="Abstract" value={form.abstract} onChange={(value) => update("abstract", value)} wide /></div></section><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Research claim</h2><p className="mt-1 text-xs text-muted-foreground">These claims will be compared against the manuscript and reviewed by a human.</p><div className="mt-4 grid gap-4"><TextField label="Research goal" value={form.researchGoal} onChange={(value) => update("researchGoal", value)} /><TextField label="Research questions" hint="One per line" value={form.researchQuestions} onChange={(value) => update("researchQuestions", value)} /><TextField label="Claimed research gap" value={form.claimedResearchGap} onChange={(value) => update("claimedResearchGap", value)} /><TextField label="Claimed contribution" value={form.claimedContribution} onChange={(value) => update("claimedContribution", value)} /><TextField label="Methodology" value={form.methodology} onChange={(value) => update("methodology", value)} /><TextField label="Scope and boundaries" value={form.scope} onChange={(value) => update("scope", value)} /><Field label="Keywords" hint="Comma separated"><Input className="mt-2" value={form.keywords} onChange={(event) => update("keywords", event.target.value)} /></Field></div></section><section className="rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Manuscript revision 1</h2><label className="mt-4 flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border p-5"><FileText className="h-7 w-7 text-muted-foreground" /><span className="min-w-0 flex-1 text-sm"><span className="block font-medium">{file?.name || "Choose PDF manuscript"}</span><span className="mt-1 block text-xs text-muted-foreground">PDF only · maximum 10 MB</span></span><input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0])} /></label><div className="mt-4 flex gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />Historical revisions are immutable. Reviewer-facing views hide author identity.</div></section><div className="flex justify-end gap-2"><Button asChild variant="ghost"><Link to={backPath}>Cancel</Link></Button><Button type="submit" disabled={create.isPending || !form.projectId || !file}>{create.isPending ? "Creating…" : "Create submission"}</Button></div></form></div>;
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) { return <label className={`block text-sm font-medium ${wide ? "sm:col-span-2" : ""}`}>{label}{hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}{children}</label>; }
function TextField({ label, hint, value, onChange, wide }: { label: string; hint?: string; value: string; onChange: (value: string) => void; wide?: boolean }) { return <Field label={label} hint={hint} wide={wide}><textarea className="mt-2 min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)} /></Field>; }
