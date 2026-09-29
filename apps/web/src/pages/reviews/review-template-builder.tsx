import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { AcademicReviewMode, ReviewTemplateCriterionInput, ReviewTemplateSource } from "@trend/shared-types";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useCreateReviewTemplate, usePublishReviewTemplate, useReviewTemplate, useSaveReviewTemplateVersion } from "@/features/reviews";

const artifactTypes = ["RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "EVIDENCE_SYNTHESIS", "GAP_ANALYSIS", "RESEARCH_PLAN", "MANUSCRIPT", "GENERAL_REPORT"];
const defaultLevels = [
  { label: "Excellent", description: "Fully meets the criterion with strong evidence.", score: 4 },
  { label: "Good", description: "Mostly meets the criterion with minor issues.", score: 3 },
  { label: "Developing", description: "Requires significant refinement.", score: 2 },
  { label: "Poor", description: "Does not yet meet the criterion.", score: 1 },
];
const emptyCriterion = (): ReviewTemplateCriterionInput => ({ title: "", description: "", required: true, allowNotApplicable: false });

export function ReviewTemplateBuilderPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const detail = useReviewTemplate(templateId);
  const projects = useProjects();
  const create = useCreateReviewTemplate();
  const saveVersion = useSaveReviewTemplateVersion(templateId ?? "");
  const publish = usePublishReviewTemplate();
  const [name, setName] = useState("");
  const [source, setSource] = useState<ReviewTemplateSource>("PERSONAL");
  const [projectId, setProjectId] = useState("");
  const [artifactType, setArtifactType] = useState("RESEARCH_PROPOSAL");
  const [reviewMode, setReviewMode] = useState<AcademicReviewMode>("STRUCTURED_REVIEW");
  const [description, setDescription] = useState("");
  const [guidelines, setGuidelines] = useState("Base major concerns on specific evidence.\nExplain why an issue affects research quality.\nDeclare conflicts of interest.");
  const [criteria, setCriteria] = useState<ReviewTemplateCriterionInput[]>([emptyCriterion()]);
  const [preview, setPreview] = useState(false);
  const editing = Boolean(templateId);

  useEffect(() => {
    if (!detail.data) return;
    const draft = detail.data.versions.find((item) => item.status === "DRAFT") ?? detail.data.activeVersion;
    if (!draft) return;
    setName(detail.data.name); setSource(detail.data.source); setProjectId(detail.data.projectId ?? ""); setArtifactType(detail.data.artifactType ?? "GENERAL_REPORT");
    setReviewMode(draft.reviewMode); setDescription(draft.description ?? ""); setGuidelines(draft.guidelines.join("\n"));
    setCriteria(draft.criteria.map(({ id: _id, order: _order, key, levels, ...criterion }) => ({ ...criterion, key, levels: levels.map(({ id: _levelId, position: _position, ...level }) => level) })));
  }, [detail.data]);

  const payload = useMemo(() => ({
    reviewMode, description: description.trim() || undefined,
    guidelines: guidelines.split("\n").map((item) => item.trim()).filter(Boolean),
    criteria: criteria.map((criterion) => ({ ...criterion, title: criterion.title.trim(), description: criterion.description?.trim() || undefined, levels: reviewMode === "RUBRIC_ASSESSMENT" ? criterion.levels ?? defaultLevels : undefined })),
  }), [criteria, description, guidelines, reviewMode]);

  function updateCriterion(index: number, change: Partial<ReviewTemplateCriterionInput>) { setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item)); }
  function move(index: number, direction: -1 | 1) { setCriteria((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; const sourceItem = next[index]; const targetItem = next[target]; if (!sourceItem || !targetItem) return current; next[index] = targetItem; next[target] = sourceItem; return next; }); }
  function validate() {
    if (!name.trim()) return "Template name is required";
    if (!criteria.length || criteria.some((item) => item.title.trim().length < 2)) return "Give every criterion a clear title";
    if (source === "PROJECT" && !projectId) return "Select a project";
    return undefined;
  }
  async function save(publishNow: boolean) {
    const issue = validate(); if (issue) return toast.error(issue);
    try {
      if (!editing) {
        const created = await create.mutateAsync({ name: name.trim(), source, projectId: source === "PROJECT" ? projectId : undefined, artifactType, publish: publishNow, ...payload });
        toast.success(publishNow ? "Template published" : "Template draft saved");
        navigate(publishNow ? "/review-templates" : `/review-templates/${created.id}/edit`);
      } else {
        await saveVersion.mutateAsync(payload);
        if (publishNow) await publish.mutateAsync(templateId!);
        toast.success(publishNow ? "New template version published" : "Draft version saved");
        if (publishNow) navigate("/review-templates");
      }
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || "Could not save this review template");
    }
  }

  if (editing && detail.isLoading) return <main className="mx-auto max-w-5xl px-4 py-10"><div className="h-96 animate-pulse rounded-2xl bg-muted" /></main>;
  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <Button variant="ghost" onClick={() => navigate("/review-templates")}><ArrowLeft className="h-4 w-4" />Back to templates</Button>
    <header className="mt-4 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Template builder</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{editing ? "Edit Review Template" : "Create Review Template"}</h1><p className="mt-2 text-sm text-muted-foreground">Publishing creates an immutable version. Later edits become a new version.</p></div><Button variant="outline" onClick={() => setPreview((value) => !value)}><Eye className="h-4 w-4" />{preview ? "Edit" : "Preview"}</Button></header>

    {preview ? <TemplatePreview name={name} mode={reviewMode} description={description} guidelines={payload.guidelines} criteria={payload.criteria} /> : <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-8">
      <section><h2 className="text-lg font-semibold">Template details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Template Name *<Input className="mt-2" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} disabled={editing} placeholder="FPT SE Research Proposal Review" /></label><label className="text-sm font-medium">Artifact Type<select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={artifactType} onChange={(event) => setArtifactType(event.target.value)} disabled={editing}>{artifactTypes.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label className="text-sm font-medium">Review Mode<select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={reviewMode} onChange={(event) => { const mode = event.target.value as AcademicReviewMode; setReviewMode(mode); if (mode === "RUBRIC_ASSESSMENT") setCriteria((current) => current.map((item) => ({ ...item, levels: item.levels ?? defaultLevels }))); }}>{["GUIDED_FEEDBACK", "STRUCTURED_REVIEW", "RUBRIC_ASSESSMENT"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>{!editing ? <><label className="text-sm font-medium">Template source<select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={source} onChange={(event) => setSource(event.target.value as ReviewTemplateSource)}><option value="PERSONAL">My Templates</option><option value="PROJECT">Project Templates</option></select></label>{source === "PROJECT" ? <label className="text-sm font-medium">Project<select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.data?.filter((project) => project.accessRole === "OWNER").map((project) => <option key={project._id} value={project._id}>{project.title}</option>)}</select></label> : null}</> : null}<label className="text-sm font-medium sm:col-span-2">Description<textarea className="mt-2 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} /></label></div></section>

      <section><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Criteria</h2><p className="mt-1 text-sm text-muted-foreground">What the reviewer should evaluate.</p></div><Button variant="outline" size="sm" onClick={() => setCriteria((current) => [...current, { ...emptyCriterion(), levels: reviewMode === "RUBRIC_ASSESSMENT" ? defaultLevels : undefined }])}><Plus className="h-4 w-4" />Add Criterion</Button></div><div className="mt-4 space-y-3">{criteria.map((criterion, index) => <article key={index} className="rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><div className="grid flex-1 gap-3"><Input value={criterion.title} onChange={(event) => updateCriterion(index, { title: event.target.value })} placeholder="Criterion title" maxLength={160} /><textarea value={criterion.description ?? ""} onChange={(event) => updateCriterion(index, { description: event.target.value })} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="What should the reviewer consider?" /><div className="flex flex-wrap items-center gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={criterion.required} onChange={(event) => updateCriterion(index, { required: event.target.checked })} />Required</label><label className="flex items-center gap-2"><input type="checkbox" checked={criterion.allowNotApplicable} onChange={(event) => updateCriterion(index, { allowNotApplicable: event.target.checked })} />Allow N/A</label>{reviewMode === "RUBRIC_ASSESSMENT" ? <label className="flex items-center gap-2">Weight <Input type="number" min={0.1} max={100} className="h-8 w-20" value={criterion.weight ?? 1} onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })} /></label> : null}</div>{reviewMode === "RUBRIC_ASSESSMENT" ? <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Performance levels</p>{(criterion.levels ?? defaultLevels).map((level, levelIndex) => <div key={levelIndex} className="mt-2 grid grid-cols-[1fr_72px] gap-2"><Input value={level.label} onChange={(event) => updateCriterion(index, { levels: (criterion.levels ?? defaultLevels).map((item, itemIndex) => itemIndex === levelIndex ? { ...item, label: event.target.value } : item) })} /><Input type="number" value={level.score} onChange={(event) => updateCriterion(index, { levels: (criterion.levels ?? defaultLevels).map((item, itemIndex) => itemIndex === levelIndex ? { ...item, score: Number(event.target.value) } : item) })} /></div>)}</div> : null}</div><div className="flex flex-col gap-1"><Button variant="ghost" size="icon" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => move(index, 1)} disabled={index === criteria.length - 1}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => setCriteria((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={criteria.length === 1}><Trash2 className="h-4 w-4" /></Button></div></div></article>)}</div></section>

      <section><h2 className="text-lg font-semibold">Review Guidelines</h2><p className="mt-1 text-sm text-muted-foreground">How the reviewer should perform the review. Enter one guideline per line.</p><textarea className="mt-3 min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6" value={guidelines} onChange={(event) => setGuidelines(event.target.value)} /></section>
    </div><aside className="lg:sticky lg:top-24 lg:self-start"><div className="rounded-xl border bg-card p-4"><p className="text-sm font-semibold">Version policy</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Drafts remain editable. Publishing locks this version for historical reviews and makes it available in the review request picker.</p><div className="mt-4 grid gap-2"><Button variant="outline" onClick={() => save(false)} disabled={create.isPending || saveVersion.isPending}><Save className="h-4 w-4" />Save Draft</Button><Button onClick={() => save(true)} disabled={create.isPending || saveVersion.isPending || publish.isPending}><Send className="h-4 w-4" />Publish Template</Button></div></div></aside></div>}
  </main>;
}

function TemplatePreview({ name, mode, description, guidelines, criteria }: { name: string; mode: AcademicReviewMode; description: string; guidelines: string[]; criteria: ReviewTemplateCriterionInput[] }) {
  return <div className="mx-auto mt-8 max-w-4xl"><div className="border-b pb-5"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{mode.replaceAll("_", " ")}</p><h2 className="mt-2 text-2xl font-semibold">{name || "Untitled review template"}</h2>{description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}</div>{guidelines.length ? <section className="mt-6 rounded-xl border bg-muted/20 p-5"><h3 className="font-semibold">Review Guidelines</h3><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{guidelines.map((item) => <li key={item}>• {item}</li>)}</ul></section> : null}<section className="mt-6 divide-y rounded-xl border bg-card">{criteria.map((criterion, index) => <article key={index} className="p-5"><p className="text-xs text-muted-foreground">Criterion {index + 1}{criterion.required ? " · Required" : ""}</p><h3 className="mt-1 font-semibold">{criterion.title || "Untitled criterion"}</h3>{criterion.description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{criterion.description}</p> : null}{mode === "RUBRIC_ASSESSMENT" ? <div className="mt-3 flex flex-wrap gap-2">{criterion.levels?.map((level) => <span key={level.label} className="rounded-full border px-3 py-1 text-xs">{level.label} · {level.score}</span>)}</div> : null}</article>)}</section></div>;
}
