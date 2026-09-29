import { Link } from "react-router-dom";
import { Archive, Copy, FilePlus2, Layers3, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArchiveReviewTemplate, useDuplicateReviewTemplate, useReviewTemplates } from "@/features/reviews";

const sourceLabel = { SYSTEM: "LumiGap Templates", PERSONAL: "My Templates", PROJECT: "Project Templates" } as const;

export function ReviewTemplatesPage() {
  const query = useReviewTemplates();
  const duplicate = useDuplicateReviewTemplate();
  const archive = useArchiveReviewTemplate();
  if (query.isLoading) return <main className="mx-auto max-w-6xl px-4 py-10"><div className="h-72 animate-pulse rounded-2xl bg-muted" /></main>;
  if (query.error) return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Review templates could not be loaded.</div></main>;
  const templates = query.data ?? [];

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
    <header className="flex flex-col gap-4 border-b pb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Academic review</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Review Templates</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Reusable criteria and guidelines for guided feedback, structured review, or rubric assessment.</p></div><Button asChild><Link to="/review-templates/new"><Plus className="h-4 w-4" />Create Review Template</Link></Button></header>
    {templates.length ? <div className="mt-8 space-y-10">{Object.entries(sourceLabel).map(([source, label]) => {
      const rows = templates.filter((item) => item.source === source);
      if (!rows.length) return null;
      return <section key={source}><div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-muted-foreground" /><h2 className="text-lg font-semibold">{label}</h2><Badge variant="secondary">{rows.length}</Badge></div><div className="mt-3 divide-y rounded-2xl border bg-card">{rows.map((template) => <article key={template.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{template.name}</h3><Badge variant={template.status === "PUBLISHED" ? "secondary" : "outline"}>{template.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{template.artifactType?.replaceAll("_", " ") || "Any artifact"} · {template.activeVersion?.reviewMode.replaceAll("_", " ") || "Draft"}{template.activeVersion ? ` · v${template.activeVersion.versionNumber}` : ""}</p><p className="mt-2 text-xs text-muted-foreground">{template.activeVersion?.criteria.length ?? 0} criteria</p></div><div className="flex flex-wrap gap-2">{template.source !== "SYSTEM" ? <Button asChild variant="outline" size="sm"><Link to={`/review-templates/${template.id}/edit`}><Pencil className="h-4 w-4" />Edit</Link></Button> : null}<Button variant="outline" size="sm" onClick={async () => { try { await duplicate.mutateAsync(template.id); toast.success("Template duplicated to My Templates"); } catch { toast.error("Could not duplicate template"); } }}><Copy className="h-4 w-4" />Duplicate</Button>{template.source !== "SYSTEM" ? <Button variant="ghost" size="sm" onClick={async () => { try { await archive.mutateAsync(template.id); toast.success("Template archived"); } catch { toast.error("Could not archive template"); } }}><Archive className="h-4 w-4" />Archive</Button> : null}</div></article>)}</div></section>;
    })}</div> : <div className="mt-8 rounded-2xl border border-dashed p-12 text-center"><FilePlus2 className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No Templates</h2><p className="mt-2 text-sm text-muted-foreground">Create a reusable review template or use a LumiGap template.</p><Button asChild className="mt-5"><Link to="/review-templates/new">Create template</Link></Button></div>}
  </main>;
}
