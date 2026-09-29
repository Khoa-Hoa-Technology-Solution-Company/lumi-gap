import { useDeferredValue, useMemo, useState } from "react";
import { BookOpenCheck, CalendarDays, Check, Search, Send, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateReviewRequest, useReviewerCandidates, useReviewTemplates } from "@/features/reviews";

interface SubmitReviewDialogProps {
  reportId?: string;
  submissionId?: string;
  artifactTitle: string;
  artifactType?: string;
  trigger?: React.ReactNode;
  onSubmitted?: () => void;
}

const sourceLabel = { SYSTEM: "LumiGap Templates", PERSONAL: "My Templates", PROJECT: "Project Templates" } as const;

export function SubmitReviewDialog({ reportId, submissionId, artifactTitle, artifactType, trigger, onSubmitted }: SubmitReviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [preview, setPreview] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const templates = useReviewTemplates();
  const reviewers = useReviewerCandidates(deferredSearch);
  const create = useCreateReviewRequest();
  const grouped = useMemo(() => {
    const rows = (templates.data ?? []).filter((item) => item.status === "PUBLISHED" && item.activeVersion && (!artifactType || !item.artifactType || item.artifactType === artifactType));
    return Object.entries(sourceLabel).map(([source, label]) => ({ source, label, items: rows.filter((item) => item.source === source) })).filter((group) => group.items.length);
  }, [artifactType, templates.data]);
  const selectedTemplate = (templates.data ?? []).find((item) => item.activeVersion?.id === templateVersionId);
  const selectedReviewer = (reviewers.data ?? []).find((item) => item.id === reviewerId);

  async function submit() {
    if (!templateVersionId || !reviewerId) return toast.error("Select a review template and reviewer");
    try {
      await create.mutateAsync({
        reportId, submissionId, reviewerId, templateVersionId,
        message: message.trim() || undefined,
        dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : undefined,
      });
      toast.success("Review request sent");
      setOpen(false);
      onSubmitted?.();
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || "Could not send this review request");
    }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger ?? <Button><Send className="h-4 w-4" />Submit for Review</Button>}</DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>Submit for Review</DialogTitle><DialogDescription>Invite a qualified reviewer to assess this exact artifact version.</DialogDescription></DialogHeader>
      <div className="space-y-6 py-2">
        <section className="rounded-xl border bg-muted/30 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Artifact</p><p className="mt-1 font-semibold">{artifactTitle}</p>{artifactType ? <Badge variant="outline" className="mt-2">{artifactType.replaceAll("_", " ")}</Badge> : null}</section>

        <fieldset><legend className="text-sm font-semibold">Review Template</legend>
          {templates.isLoading ? <div className="mt-2 h-24 animate-pulse rounded-xl bg-muted" /> : grouped.length ? <div className="mt-3 space-y-4">{grouped.map((group) => <div key={group.source}><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p><div className="grid gap-2 sm:grid-cols-2">{group.items.map((template) => <button type="button" key={template.id} onClick={() => { setTemplateVersionId(template.activeVersion!.id); setPreview(false); }} className={`rounded-xl border p-3 text-left transition-colors ${templateVersionId === template.activeVersion!.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "hover:border-slate-300 hover:bg-muted/30"}`}><div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{template.name}</span>{templateVersionId === template.activeVersion!.id ? <Check className="h-4 w-4 text-blue-600" /> : null}</div><p className="mt-1 text-xs text-muted-foreground">{template.activeVersion!.reviewMode.replaceAll("_", " ")} · v{template.activeVersion!.versionNumber}</p></button>)}</div></div>)}</div> : <p className="mt-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No published template matches this artifact type.</p>}
          {selectedTemplate ? <div className="mt-3"><Button type="button" variant="ghost" size="sm" onClick={() => setPreview((value) => !value)}><BookOpenCheck className="h-4 w-4" />{preview ? "Hide preview" : "Preview Template"}</Button>{preview ? <div className="mt-2 rounded-xl border p-4"><p className="text-sm font-semibold">{selectedTemplate.name}</p><ol className="mt-3 space-y-2 text-sm">{selectedTemplate.activeVersion!.criteria.map((criterion, index) => <li key={criterion.id} className="flex gap-2"><span className="text-muted-foreground">{index + 1}.</span><span><span className="font-medium">{criterion.title}</span>{criterion.description ? <span className="block text-xs leading-5 text-muted-foreground">{criterion.description}</span> : null}</span></li>)}</ol></div> : null}</div> : null}
        </fieldset>

        <fieldset><legend className="text-sm font-semibold">Reviewer</legend><div className="relative mt-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search qualified reviewers" /></div>
          <div className="mt-2 max-h-52 divide-y overflow-y-auto rounded-xl border">{reviewers.isLoading ? <div className="h-20 animate-pulse bg-muted" /> : (reviewers.data ?? []).map((reviewer) => <button type="button" key={reviewer.id} onClick={() => setReviewerId(reviewer.id)} className={`flex w-full items-start gap-3 p-3 text-left transition-colors ${reviewerId === reviewer.id ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-muted/40"}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold dark:bg-slate-800">{reviewer.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{reviewer.name}</span>{reviewer.availableForReview ? <Badge variant="secondary">Available</Badge> : null}</div><p className="mt-0.5 text-xs text-muted-foreground">{reviewer.institution || "Institution not listed"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{reviewer.expertiseAreas.slice(0, 3).join(" · ") || "Expertise not listed"}</p></div>{reviewerId === reviewer.id ? <UserRoundCheck className="h-4 w-4 text-blue-600" /> : null}</button>)}{!reviewers.isLoading && reviewers.data?.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No qualified reviewer matches this search.</p> : null}</div>
          {selectedReviewer && !selectedReviewer.availableForReview ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">This reviewer has the required capability but is not currently advertising open availability. They may still decline.</p> : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Optional message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={3000} className="mt-2 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Context or focus for the reviewer" /></label><label className="text-sm font-medium">Optional due date<div className="relative mt-2"><CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input type="date" min={new Date().toISOString().slice(0, 10)} value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="pl-9" /></div></label></div>
      </div>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={submit} disabled={!templateVersionId || !reviewerId || create.isPending}>{create.isPending ? "Sending…" : "Send review request"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
