import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { authApi } from "@/features/auth/api/auth.api";
import { getResearchSuggestions } from "../utils/research-suggestions";

export function ResearchTagField({ label, values, onChange, options = [], allowCustom = true, max = 30, maxLength = 120 }: { label: string; values: string[]; onChange: (values: string[]) => void; options?: string[]; allowCustom?: boolean; max?: number; maxLength?: number }) {
  const { t } = useI18n();
  const id = useId(), [query, setQuery] = useState("");
  const selectedKeys = new Set(values.flatMap(selected => [selected.toLocaleLowerCase(), t(selected).toLocaleLowerCase()]));
  const seenChoiceLabels = new Set<string>();
  const choices = options.filter(value => {
    const rawKey = value.toLocaleLowerCase();
    const labelKey = t(value).toLocaleLowerCase();
    if (selectedKeys.has(rawKey) || selectedKeys.has(labelKey)) return false;
    if (seenChoiceLabels.has(labelKey)) return false;
    if (!labelKey.includes(query.toLocaleLowerCase()) && !rawKey.includes(query.toLocaleLowerCase())) return false;
    seenChoiceLabels.add(labelKey);
    return true;
  }).slice(0, 8);
  function add(value: string) {
    const clean = value.trim();
    const cleanKey = clean.toLocaleLowerCase();
    const cleanLabelKey = t(clean).toLocaleLowerCase();
    if (!clean || clean.length > maxLength || values.length >= max || selectedKeys.has(cleanKey) || selectedKeys.has(cleanLabelKey)) return;
    onChange([...values, clean]); setQuery("");
  }
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><div className="flex flex-wrap gap-2">{values.map(value => <button key={value} type="button" onClick={() => onChange(values.filter(item => item !== value))} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs" aria-label={`${t("Remove")} ${t(value)}`}><span className="break-words text-left">{t(value)}</span><X className="h-3 w-3 shrink-0" /></button>)}</div><div className="flex gap-2"><Input id={id} value={query} maxLength={maxLength} placeholder={t("Search or add a topic")} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (allowCustom) add(query); else if (choices.length === 1) add(choices[0]!); } }} />{allowCustom && <Button type="button" variant="outline" disabled={!query.trim() || values.length >= max} onClick={() => add(query)}>{t("Add")}</Button>}</div>{choices.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label={`${label} ${t("Suggestions")}`}>{choices.map(value => <button type="button" key={value} onClick={() => add(value)} disabled={values.length >= max} className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">{t(value)}</button>)}</div>}</div>;
}

export function ResearchFocusFields({ areas, interests, skills, keywords, onAreas, onInterests, onSkills, onKeywords, specializations = [], onSpecializations }: { specializations?: string[]; onSpecializations?: (values: string[]) => void; areas: string[]; interests: string[]; skills: string[]; keywords: string[]; onAreas: (values: string[]) => void; onInterests: (values: string[]) => void; onSkills: (values: string[]) => void; onKeywords: (values: string[]) => void }) {
  const { t } = useI18n();
  const suggestions = getResearchSuggestions(areas, interests);
  const taxonomy = useQuery({ queryKey: ["academic-profile", "research-taxonomy"], queryFn: () => authApi.academicOnboardingOptions(), staleTime: 5 * 60_000 });
  return <div className="space-y-5"><ResearchTagField label={t("Research Areas")} values={areas} onChange={onAreas} options={taxonomy.data?.researchAreas} allowCustom={false} />{taxonomy.isError && <Button variant="ghost" type="button" size="sm" onClick={() => void taxonomy.refetch()}>{t("Retry")}</Button>}{onSpecializations && <ResearchTagField label={t("Research Specializations")} values={specializations} onChange={onSpecializations} options={taxonomy.data?.researchSpecializations} />}<ResearchTagField label={t("Research topics & interests")} values={interests} onChange={onInterests} options={[...taxonomy.data?.researchTopics ?? [], ...suggestions.interests]} /><ResearchTagField label={t("Research skills")} values={skills} onChange={onSkills} max={40} options={suggestions.skillGroups.flatMap(group => group.options)} /><ResearchTagField label={t("Keywords")} values={keywords} onChange={onKeywords} max={40} /></div>;
}
