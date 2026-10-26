import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useTrendsDiscover } from "@/features/trends";
import { useI18n } from "@/i18n";
import { formatSigned } from "../../../pages/trends.insights";
import { getTopicTrendTarget } from "../../../pages/trends.navigation";

/**
 * Homepage teaser of Discover Trends (P2.2): the top rising topics of the
 * active precomputed OpenAlex snapshot, field baseline. Renders nothing when no
 * snapshot is available, so the homepage never shows library counts as trends.
 */
export function HomeDiscoverTrends() {
  const { t, language } = useI18n();
  const query = useTrendsDiscover({ collection: "trending", baseline: "field", pageSize: 3 });
  const data = query.data;
  if (query.isLoading || query.isError || !data || data.status !== "available" || !data.provenance || data.items.length === 0) return null;
  const collected = data.provenance.lastFetchedAt ? new Date(data.provenance.lastFetchedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium" }) : "—";
  return (
    <div className="home-discover-trends" aria-labelledby="home-discover-trends-heading">
      <h3 id="home-discover-trends-heading">{t("Rising in research (OpenAlex)")}</h3>
      <ol>
        {data.items.map((item) => (
          <li key={item.topicId}>
            <Link to={getTopicTrendTarget(item.topicName, item.topicId)}>{item.topicName}</Link>
            <span>{t("{{field}} · share {{value}}%/year · q = {{q}}", { field: item.taxonomy.fieldName, value: item.relativeChangePct === null ? "—" : formatSigned(item.relativeChangePct, 1), q: item.qValue === null ? "—" : item.qValue < 0.001 ? "< 0.001" : item.qValue.toFixed(3) })}</span>
          </li>
        ))}
      </ol>
      <p>{t("Compared with each topic's field, {{from}}–{{to}}. OpenAlex data collected {{date}}; historical counts may be revised.", { from: data.provenance.yearFrom, to: data.provenance.lastCompleteYear, date: collected })}</p>
      <Link to="/trends?tab=discover" className="academic-text-link">{t("Discover trends")}<ArrowUpRight aria-hidden="true" /></Link>
    </div>
  );
}
