import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AcademicFeaturedWork, AcademicFeaturedWorkInput, AcademicFeaturedWorkKind } from "@trend/shared-types";
import { Trash2 } from "lucide-react";
import { academicProfileApi } from "../api/academic-profile.api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export const workKindLabels: Record<AcademicFeaturedWorkKind, string> = { PAPER: "Paper", PROJECT: "Research Project", RESEARCH_PROPOSAL: "Research Proposal", RESEARCH_ARTIFACT: "Research Artifact", CANDIDATE_GAP: "Candidate Research Gap", DATASET: "Dataset", CONTRIBUTION: "Research contribution", OTHER: "Other scholarly output" };
const internalKinds: AcademicFeaturedWorkKind[] = ["PAPER", "PROJECT", "RESEARCH_PROPOSAL", "RESEARCH_ARTIFACT", "CANDIDATE_GAP"];
export function editableWork(work: AcademicFeaturedWork): AcademicFeaturedWorkInput {
  return work.source === "LUMIGAP" ? { source: "LUMIGAP", kind: work.kind ?? "PAPER", paperId: work.paperId, projectId: work.projectId, submissionId: work.submissionId, reportId: work.reportId, gapId: work.gapId } : { source: work.source, kind: work.kind ?? "PAPER", title: work.title, doi: work.doi, year: work.year };
}
function workKey(work: AcademicFeaturedWorkInput) { return work.paperId ?? work.projectId ?? work.submissionId ?? work.reportId ?? work.gapId ?? work.doi?.toLocaleLowerCase() ?? work.title?.toLocaleLowerCase(); }

export function FeaturedWorksEditor({ original, values, onChange }: { original: AcademicFeaturedWork[]; values: AcademicFeaturedWorkInput[]; onChange: (values: AcademicFeaturedWorkInput[]) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<AcademicFeaturedWorkKind>("PROJECT"), [source, setSource] = useState<"LUMIGAP" | "MANUAL">("LUMIGAP");
  const [query, setQuery] = useState(""), [debounced, setDebounced] = useState(""), [title, setTitle] = useState(""), [doi, setDoi] = useState("");
  const [added, setAdded] = useState<AcademicFeaturedWork[]>([]);
  useEffect(() => { const timer = setTimeout(() => setDebounced(query), 200); return () => clearTimeout(timer); }, [query]);
  const options = useQuery({ queryKey: ["academic-profile", "featured-work-options", kind, debounced], queryFn: ({ signal }) => academicProfileApi.featuredWorkOptions(kind, debounced, signal), enabled: source === "LUMIGAP" && internalKinds.includes(kind), staleTime: 15_000 });
  function add(work: AcademicFeaturedWorkInput, resolved?: AcademicFeaturedWork) {
    if (values.length >= 10 || values.some(item => workKey(item) === workKey(work))) return;
    onChange([...values, work]); if (resolved) setAdded(current => [...current, resolved]); setTitle(""); setDoi("");
  }
  return <div className="space-y-4">{values.length > 0 && <ul className="divide-y">{values.map((work, index) => { const resolved = [...original, ...added].find(item => workKey(item) === workKey(work)); return <li key={`${workKey(work)}-${index}`} className="flex items-start justify-between gap-3 py-2"><div className="min-w-0"><p className="break-words text-sm">{resolved?.title ?? work.title ?? work.doi ?? t("Research work")}</p><p className="text-xs text-muted-foreground">{t(workKindLabels[work.kind ?? "PAPER"])}</p></div><Button type="button" variant="ghost" size="icon" aria-label={t("Remove work")} onClick={() => onChange(values.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></li>; })}</ul>}
    <label className="block space-y-1.5 text-sm"><span>{t("Work type")}</span><select className="h-10 w-full rounded-md border bg-background px-3" value={kind} onChange={event => { const value = event.target.value as AcademicFeaturedWorkKind; setKind(value); if (!internalKinds.includes(value)) setSource("MANUAL"); setQuery(""); }}>{Object.entries(workKindLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
    {internalKinds.includes(kind) && <label className="block space-y-1.5 text-sm"><span>{t("Source")}</span><select className="h-10 w-full rounded-md border bg-background px-3" value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="LUMIGAP">{t("Choose from LumiGap")}</option><option value="MANUAL">{t("Manual reference")}</option></select></label>}
    {source === "LUMIGAP" ? <div className="space-y-2"><Input aria-label={t("Search research works")} value={query} maxLength={200} onChange={event => setQuery(event.target.value)} placeholder={t("Search research works")} /><div className="max-h-48 overflow-y-auto rounded-md border">{options.isFetching && <p role="status" className="p-3 text-xs text-muted-foreground">{t("Loading…")}</p>}{options.isError && <Button type="button" variant="ghost" onClick={() => void options.refetch()}>{t("Retry")}</Button>}{!options.isFetching && !options.isError && !options.data?.length && <p className="p-3 text-xs text-muted-foreground">{t("No accessible works found.")}</p>}{options.data?.map(work => <button key={workKey(work)} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50" disabled={values.length >= 10 || values.some(item => workKey(item) === workKey(work))} onClick={() => add(editableWork(work), work)}>{work.title}<span className="mt-0.5 block text-xs text-muted-foreground">{work.visibility === "RESTRICTED" ? t("Only viewers with access can see this work.") : t("Public summary")}</span></button>)}</div></div> : <div className="space-y-2"><Input aria-label={t("Title")} placeholder={t("Title")} value={title} maxLength={500} onChange={event => setTitle(event.target.value)} /><Input aria-label="DOI" placeholder={t("DOI (optional)")} value={doi} maxLength={300} onChange={event => setDoi(event.target.value)} /><Button type="button" variant="outline" disabled={values.length >= 10 || (!title.trim() && !doi.trim())} onClick={() => add({ kind, source: "MANUAL", title: title.trim() || undefined, doi: doi.trim() || undefined })}>{t("Add work")}</Button></div>}
    <p className="text-xs leading-5 text-muted-foreground">{t("Featuring a work does not change its visibility or verify authorship.")}</p></div>;
}
