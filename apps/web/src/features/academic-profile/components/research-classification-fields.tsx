import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TECHNICAL_SKILLS, MENTOR_SUPPORT_AREAS, type ResearchSupportType, type ResearchClassificationInput, type ResearchClassification } from "@trend/shared-types";
import { classificationInput } from "../utils/research-classification";
import { api as apiClient } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

type Option = { id: string; name: string; context: string; source: string; labelVi?: string | null };
export function ResearchClassificationFields({ value, onChange }: { value?: ResearchClassificationInput; onChange: (value: ResearchClassificationInput) => void }) {
  const { t } = useI18n(), selected = classificationInput(value);
  return <section data-no-i18n className="min-w-0 space-y-4" aria-label={t("Shared research classification")}>
    <p className="text-xs leading-5 text-muted-foreground">{t("Use the same research catalogue as projects and lecturers. Expertise is self-declared; selections do not verify qualifications.")}</p>
    <CataloguePicker label="Research expertise" ids={selected.nodeIds} levels={["field", "subfield", "topic"]} onChange={nodeIds => onChange({ ...selected, nodeIds })} max={20} />
    <CataloguePicker label="Technical skills and methods" ids={selected.skillIds} levels={["skill"]} onChange={skillIds => onChange({ ...selected, skillIds })} max={30} />
    <CataloguePicker label="Catalogue keywords" ids={selected.keywordIds} levels={["keyword"]} onChange={keywordIds => onChange({ ...selected, keywordIds })} max={30} />
  </section>;
}
function CataloguePicker({ label, ids, levels, onChange, max }: { label: string; ids: string[]; levels: string[]; onChange: (ids: string[]) => void; max: number }) {
  const { t, language } = useI18n(), id = useId();
  const [showOptions, setShowOptions] = useState(false);
  const [level, setLevel] = useState(levels[0]!), [search, setSearch] = useState(""), [query, setQuery] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  const options = useQuery({ queryKey: ["research-catalog", level, query], queryFn: async () => (await apiClient.get<{ data: Option[] }>("/research-catalog", { params: { level, q: query } })).data.data, enabled: showOptions, staleTime: 300_000 });
  const resolved = useQuery({ queryKey: ["research-catalog", "selected", levels[0], ids], queryFn: async () => levels[0] === "skill" ? TECHNICAL_SKILLS.map(skill => ({ id: skill.id, name: skill.label, context: skill.kind, source: "LUMIGAP" })) : (await apiClient.get<{ data: Option[] }>("/research-catalog", { params: { level: levels[0], ids: ids.join(",") } })).data.data, enabled: ids.length > 0, staleTime: 300_000 });
  const choices = new Map([...(resolved.data ?? []), ...(options.data ?? [])].map(option => [option.id, option]));
  return <div className="min-w-0 space-y-2"><label className="text-sm font-medium" htmlFor={id}>{t(label)}</label>
    {ids.length > 0 && <div className="flex flex-wrap gap-2" aria-label={t("Selected classifications")}>{ids.map(selected => <Button key={selected} type="button" variant="secondary" size="sm" className="h-auto max-w-full whitespace-normal text-left" aria-label={`${t("Remove")} ${choices.get(selected)?.name ?? selected}`} onClick={() => onChange(ids.filter(item => item !== selected))}>{choices.get(selected)?.name ?? t("Saved catalogue selection")} <span aria-hidden="true">×</span></Button>)}</div>}
    <div className="flex flex-wrap gap-2">{levels.length > 1 && <select className="h-10 max-w-full rounded-md border bg-background px-2 text-sm" aria-label={t("Classification level")} value={level} onChange={event => { setLevel(event.target.value); setShowOptions(true); }}>{levels.map(item => <option key={item} value={item}>{t(item === "field" ? "Research field" : item === "subfield" ? "Research subfield" : "Research topic")}</option>)}</select>}<Input id={id} className="min-w-40 flex-1" value={search} onFocus={() => setShowOptions(true)} maxLength={120} placeholder={t("Search the research catalogue")} onChange={event => setSearch(event.target.value)} /><Button type="button" size="sm" variant="ghost" aria-expanded={showOptions} aria-controls={`${id}-options`} onClick={() => setShowOptions(!showOptions)}>{t(showOptions ? "Hide catalogue" : "Browse catalogue")}</Button></div>
    {showOptions && <div id={`${id}-options`} className="max-h-44 overflow-y-auto rounded-md border" aria-live="polite">{options.isPending ? <p className="p-3 text-xs text-muted-foreground">{t("Loading…")}</p> : options.isError ? <div className="p-3 text-xs"><p>{t("Catalogue unavailable. Your saved and custom terms are kept.")}</p><Button type="button" variant="ghost" size="sm" onClick={() => void options.refetch()}>{t("Retry")}</Button></div> : options.data?.length ? options.data.filter(option => !ids.includes(option.id)).map(option => <button key={option.id} type="button" disabled={ids.length >= max} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted focus-visible:bg-muted disabled:opacity-50" onClick={() => { onChange([...ids, option.id]); setSearch(""); setShowOptions(false); }}><span className="block break-words">{language === "vi" && option.labelVi ? option.labelVi : option.name}</span><span className="block text-xs text-muted-foreground">{t(option.context)} · {option.source === "OPENALEX" ? "OpenAlex" : t("Local catalogue")}</span></button>) : <p className="p-3 text-xs text-muted-foreground">{t("No catalogue results. Keep a custom term in the existing fields below.")}</p>}</div>}
  </div>;
}
export function ResearchClassificationSummary({ value }: { value?: ResearchClassification }) {
  const { t } = useI18n();
  if (!value?.nodes.length && !value?.skillIds.length && !value?.keywords.length) return null;
  return <dl data-no-i18n className="space-y-2 text-sm">{(["field", "subfield", "topic"] as const).map(level => { const names = value?.nodes.filter(node => node.level === level).map(node => node.name); return names?.length ? <div key={level}><dt className="text-xs text-muted-foreground">{t(level === "field" ? "Research field" : level === "subfield" ? "Research subfield" : "Research topic")}</dt><dd className="break-words">{names.join(" · ")}</dd></div> : null; })}{Boolean(value?.skillIds.length) && <div><dt className="text-xs text-muted-foreground">{t("Technical skills and methods")}</dt><dd>{value?.skillIds.map(id => TECHNICAL_SKILLS.find(skill => skill.id === id)?.label ?? id).join(" · ")}</dd></div>}{Boolean(value?.keywords.length) && <div><dt className="text-xs text-muted-foreground">{t("Catalogue keywords")}</dt><dd>{value?.keywords.map(keyword => keyword.name).join(" · ")}</dd></div>}</dl>;
}
export function MentoringSupportFields({ values, onChange }: { values: ResearchSupportType[]; onChange: (values: ResearchSupportType[]) => void }) {
  const { t } = useI18n();
  return <fieldset data-no-i18n className="space-y-2"><legend className="mb-2 text-sm font-medium">{t("Mentoring support areas")}</legend><div className="grid gap-2 sm:grid-cols-2">{MENTOR_SUPPORT_AREAS.map(area => <label key={area.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={values.includes(area.id)} onChange={event => onChange(event.target.checked ? [...values, area.id] : values.filter(value => value !== area.id))} /><span>{t(area.label)}</span></label>)}</div></fieldset>;
}
export function SupervisionTopicFields({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  return <CataloguePicker label="Topics I can supervise" levels={["topic"]} ids={ids} onChange={onChange} max={10} />;
}
