import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { activityLabels } from "./contribution-activity";

/** A scoped view over source records. It never assigns authorship to an uploader. */
export function ResearchAttribution({ projectId, kind, resourceId }: { projectId: string; kind: "PAPER" | "GAP" | "TASK" | "MANUSCRIPT" | "EVIDENCE"; resourceId: string }) {
  const { t, language } = useI18n();
  const query = useWorkspaceResource(projectId, "research-attribution", () => contributionsApi.research(projectId, { grouped: "true", artifactKind: kind, artifactId: resourceId, page: 1, pageSize: 5 }), { kind, resourceId });
  if (query.isError) return <p className="text-xs text-muted-foreground">{t("Research attribution")} · <button type="button" className="underline" onClick={() => void query.refetch()}>{t("Retry")}</button></p>;
  if (!query.data?.items.length) return null;
  return <details className="my-4 border-y py-3 text-sm"><summary className="cursor-pointer font-medium">{t("Research attribution")}</summary><p className="my-2 max-w-prose text-xs text-muted-foreground">{t("Recorded actions identify their actors, not authorship or independent verification.")}</p><ul className="space-y-2">{query.data.items.map(record => <li key={record.id} className="flex flex-wrap gap-x-2 gap-y-1"><strong className="font-medium">{record.actor.name}</strong><span>{t(record.type === "CONTRIBUTION_DECLARED" ? "Declared contributions" : activityLabels[record.category])}</span><time className="text-xs text-muted-foreground" dateTime={record.createdAt}>{new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(record.createdAt))}</time></li>)}</ul><Link className="mt-3 inline-block text-primary underline-offset-4 hover:underline" to={`/projects/${encodeURIComponent(projectId)}?tab=contributions&artifactKind=${kind}&artifactId=${encodeURIComponent(resourceId)}`}>{t("View contribution evidence")}</Link></details>;
}
