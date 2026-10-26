import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/services/confirmation";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { useProjectTrendSnapshots, useRemoveProjectTrendSnapshot } from "../hooks/use-trends";
import { getTopicTrendTarget } from "../trend-navigation";
import { TrendVerdictBadge } from "./trend-verdict-badge";

/**
 * Trend evidence frozen into a project from a topic page. Each row keeps the verdict of its window at the time it
 * was added, so the team can cite why the research direction matters; the link opens the live trend.
 */
export function ProjectTrendEvidence({ projectId, currentUserId, ownerId }: { projectId: string; currentUserId?: string; ownerId?: string }) {
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const highlighted = params.get("trend");
  const snapshots = useProjectTrendSnapshots(projectId);
  const remove = useRemoveProjectTrendSnapshot(projectId);

  // A workspace link (?trend=<id>) scrolls to its snapshot once the list is loaded.
  useEffect(() => {
    if (highlighted && snapshots.data) document.getElementById(`trend-${highlighted}`)?.scrollIntoView({ block: "center" });
  }, [highlighted, snapshots.data]);

  if (!snapshots.data || snapshots.data.length === 0) return null;

  const onRemove = async (id: string, topic: string) => {
    if (!await confirmAction({ kind: "delete", description: t("\"{{topic}}\" will no longer be listed as trend evidence of this project.", { topic }) })) return;
    remove.mutate(id, { onError: () => toast.error(t("Could not remove the trend evidence.")) });
  };

  return (
    <section className="bg-card rounded-2xl border border-border/80 p-6 sm:p-7 shadow-xs" aria-labelledby="project-trend-evidence">
      <div className="mb-4 flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-emerald-600" />
        <div>
          <h3 id="project-trend-evidence" className="font-bold text-lg text-foreground leading-snug">{t("Trend evidence")}</h3>
          <p className="text-xs text-muted-foreground">{t("Topic trends saved from the Trends page, with the verdict at the time they were added.")}</p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {snapshots.data.map((snapshot) => (
          <li key={snapshot.id} id={`trend-${snapshot.id}`} className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${highlighted === snapshot.id ? "rounded-lg bg-blue-50/60 px-2 dark:bg-blue-950/20" : ""}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={getTopicTrendTarget(snapshot.topic, snapshot.openalexTopicId, { yearFrom: snapshot.yearFrom, yearTo: snapshot.yearTo })} className="font-semibold text-foreground hover:text-blue-600">{snapshot.topic}</Link>
                {snapshot.classification && <TrendVerdictBadge classification={snapshot.classification} size="sm" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("{{yearFrom}}–{{yearTo}} · {{count}} papers · saved {{date}}", { yearFrom: snapshot.yearFrom, yearTo: snapshot.yearTo, count: formatNumber(snapshot.totalPapers), date: new Date(snapshot.createdAt).toLocaleDateString(language) })}
                {snapshot.baseline && ` · ${t("compared with {{label}}", { label: snapshot.baseline.label })}`}
              </p>
              {snapshot.note && <p className="mt-1 text-sm text-foreground/80">{snapshot.note}</p>}
            </div>
            {(snapshot.createdById === currentUserId || ownerId === currentUserId) && (
              <button type="button" className="self-start rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 sm:self-center" aria-label={t("Remove trend evidence")} disabled={remove.isPending} onClick={() => void onRemove(snapshot.id, snapshot.topic)}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
