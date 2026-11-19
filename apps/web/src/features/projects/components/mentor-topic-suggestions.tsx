import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ResearchClassificationInput, ResearchTopicSuggestionJob } from "@trend/shared-types";
import { TECHNICAL_SKILLS } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
export function MentorTopicSuggestions({ projectId, version, disabled, value, onChange }: { projectId: string; version: number; disabled: boolean; value: ResearchClassificationInput; onChange: (value: ResearchClassificationInput) => void }) {
  const { t } = useI18n(), userId = useAuthStore(state => state.user?.id), lock = useRef(false);
  const [authorized, setAuthorized] = useState(false), [jobId, setJobId] = useState<string>();
  const start = useMutation({ mutationFn: async () => (await api.post<{ data: ResearchTopicSuggestionJob }>(`/projects/${encodeURIComponent(projectId)}/mentorship-topic-suggestions`, { authorized: true, expectedVersion: version })).data.data, onSuccess: job => setJobId(job.jobId) });
  const result = useQuery({ queryKey: ["academic-support", userId, projectId, "topic-suggestions", jobId], queryFn: async () => (await api.get<{ data: ResearchTopicSuggestionJob }>(`/projects/${encodeURIComponent(projectId)}/mentorship-topic-suggestions/${encodeURIComponent(jobId!)}`)).data.data, enabled: Boolean(jobId), retry: false, refetchInterval: query => ["COMPLETED", "FAILED"].includes(query.state.data?.status ?? "") ? false : 2000 });
  const busy = start.isPending || Boolean(jobId && !["COMPLETED", "FAILED"].includes(result.data?.status ?? "") && !result.isError);
  const suggestions = result.data?.result;
  const add = (key: keyof ResearchClassificationInput, id: string) => onChange({ ...value, [key]: [...new Set([...value[key], id])].slice(0, key === "nodeIds" ? 20 : 30) });
  return <details data-no-i18n className="space-y-3 rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{t("Suggest Research Topics & Keywords")}</summary><div className="space-y-3 pt-2">
    <p className="text-xs leading-5 text-muted-foreground">{t("Send only the approved title and abstract to OpenAlex for classification. The service may incur provider costs; suggestions never change your selections automatically.")}</p>
    <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} /><span>{t("I authorize sharing this approved text with OpenAlex.")}</span></label>
    {disabled && <p className="text-xs text-muted-foreground">{t("Save your catalogue selections to refresh the shared preview before inviting.")}</p>}
    <Button size="sm" type="button" variant="outline" disabled={disabled || !authorized || busy} onClick={async () => { if (lock.current) return; lock.current = true; try { await start.mutateAsync(); } catch { /* Show the error below and keep selections. */ } finally { lock.current = false; } }}>{t(busy ? "Generating suggestions…" : "Suggest Research Topics & Keywords")}</Button>
    {(start.isError || result.isError || result.data?.status === "FAILED") && <p role="alert" className="text-xs text-destructive">{t("Suggestions unavailable. Your selections are kept; use local catalogue search.")}</p>}
    {suggestions && <section aria-label={t("Suggested classifications")} className="space-y-2"><p className="text-xs text-muted-foreground">{suggestions.source === "OPENALEX" ? "OpenAlex" : t("Local catalogue")} · {t("Select suggestions to add")}</p><div className="flex flex-wrap gap-2">
      {suggestions.classification.nodes.filter(node => suggestions.classification.nodeIds.includes(node.id)).map(node => <Button key={node.id} type="button" size="sm" variant="secondary" className="h-auto max-w-full whitespace-normal text-left" disabled={value.nodeIds.includes(node.id) || value.nodeIds.length >= 20} onClick={() => add("nodeIds", node.id)}>{node.name}</Button>)}
      {suggestions.classification.keywords.map(keyword => <Button key={keyword.id} type="button" size="sm" variant="secondary" disabled={value.keywordIds.includes(keyword.id) || value.keywordIds.length >= 30} onClick={() => add("keywordIds", keyword.id)}>{keyword.name}</Button>)}
      {suggestions.classification.skillIds.map(id => <Button key={id} type="button" size="sm" variant="secondary" disabled={value.skillIds.includes(id) || value.skillIds.length >= 30} onClick={() => add("skillIds", id)}>{TECHNICAL_SKILLS.find(skill => skill.id === id)?.label ?? id}</Button>)}
      {!suggestions.classification.nodeIds.length && !suggestions.classification.keywordIds.length && !suggestions.classification.skillIds.length && <p className="text-xs text-muted-foreground">{t("No suggestions are available. Search the local catalogue instead.")}</p>}
    </div></section>}
  </div></details>;
}
