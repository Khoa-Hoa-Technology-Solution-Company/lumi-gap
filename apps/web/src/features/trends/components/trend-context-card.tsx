import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { useI18n } from "@/i18n";
import { useTopicTrend } from "../hooks/use-trends";
import { getTopicTrendTarget } from "../trend-navigation";
import { TrendVerdictBadge } from "./trend-verdict-badge";

/**
 * The trend verdict of the topic a page was opened for (e.g. gap analysis from a topic page). Context only: it does
 * not feed the gap signal, which is decided by its own observed/expected test. Renders nothing without trend data.
 */
export function TrendContextCard({ topic, topicId, yearFrom, yearTo }: { topic: string; topicId?: string; yearFrom?: number; yearTo?: number }) {
  const { t } = useI18n();
  const { data } = useTopicTrend(topic, topicId || yearFrom || yearTo ? { topicId, yearFrom, yearTo } : undefined);
  const classification = data?.statistics?.classification;
  if (!classification) return null;
  const years = data.yearlyBreakdown;
  const from = yearFrom ?? years[0]?.year, to = yearTo ?? years.at(-1)?.year;

  return (
    <aside className="mb-6 flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label={t("Trend context")}>
      <div className="flex flex-wrap items-center gap-2">
        <TrendingUp className="h-4 w-4 text-blue-600" aria-hidden="true" />
        <span className="font-semibold text-foreground">{t("Trend context")}:</span>
        <span className="text-foreground">{topic}</span>
        <TrendVerdictBadge classification={classification} size="sm" />
        {from && to && <span className="text-xs text-muted-foreground">{from}–{to}</span>}
      </div>
      <Link to={getTopicTrendTarget(topic, topicId ?? data.taxonomy?.openalexTopicId, { yearFrom, yearTo })} className="text-xs font-bold text-blue-600 hover:underline">{t("Open trend")}</Link>
    </aside>
  );
}
