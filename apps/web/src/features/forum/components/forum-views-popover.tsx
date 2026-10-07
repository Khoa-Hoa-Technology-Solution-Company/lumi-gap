import { useI18n } from "@/i18n";
import { useForumRecentViews } from "../hooks/use-forum";
import { formatForumNumber } from "../utils/forum-helpers";
import type { ForumRecentViews } from "../api/forum.api";

export function ForumViewsChart({ daily }: Pick<ForumRecentViews, "daily">) {
  const { t, language } = useI18n();
  const max = Math.max(1, ...daily.map((day) => day.count));
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = Math.max(1, Math.ceil(max / magnitude / 4) * magnitude);
  const ceiling = step * 4;
  const x = (index: number) => daily.length === 1 ? 168 : 36 + index * 272 / (daily.length - 1);
  const y = (count: number) => 152 - count / ceiling * 124;
  const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(language, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return <figure className="forum-views-chart">
    <svg viewBox="0 0 324 184" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => <g key={index}><line x1="36" x2="308" y1={y(index * step)} y2={y(index * step)} className="forum-views-grid" /><text x="27" y={y(index * step) + 3} textAnchor="end" className="forum-views-axis">{formatForumNumber(index * step, language)}</text></g>)}
      {daily.map((day, index) => <g key={day.date}><line x1={x(index)} x2={x(index)} y1="28" y2="152" className="forum-views-grid" />{daily.length <= 4 || index % 2 === 0 || index === daily.length - 1 ? <text x={x(index)} y="172" textAnchor="middle" className="forum-views-axis">{date(day.date)}</text> : null}</g>)}
      {daily.length > 1 ? <polyline points={daily.map((day, index) => `${x(index)},${y(day.count)}`).join(" ")} fill="none" className="forum-views-line" /> : null}
      {daily.map((day, index) => <circle key={day.date} cx={x(index)} cy={y(day.count)} r="3" className="forum-views-point"><title>{date(day.date)}: {day.count} {t("views")}</title></circle>)}
    </svg>
    <figcaption className="sr-only">{t("Daily views")} (UTC)</figcaption>
    <table className="sr-only"><caption>{t("Daily views")} (UTC)</caption><thead><tr><th scope="col">{t("Date")}</th><th scope="col">{t("Views")}</th></tr></thead><tbody>{daily.map((day) => <tr key={day.date}><th scope="row">{date(day.date)}</th><td>{formatForumNumber(day.count, language)}</td></tr>)}</tbody></table>
  </figure>;
}

export function ForumViewsPopoverContent({ postId }: { postId: string }) {
  const { t, language } = useI18n();
  const query = useForumRecentViews(postId);
  return <>
    <h3 className="forum-stat-popover-heading">{t("Recent views")}</h3>
    {query.isLoading ? <div role="status" className="forum-stat-popover-loading">{t("Loading…")}</div> : query.isError ? <div role="alert" className="forum-stat-popover-message"><p>{t("Could not load recent views.")}</p><button type="button" className="mt-2 text-primary hover:underline" onClick={() => void query.refetch()}>{t("Try again")}</button></div> : query.data ? <>
      <ForumViewsChart daily={query.data.daily} />
      <p className="forum-stat-popover-note">{t("Each visitor is counted once every")} {query.data.cooldownHours} {t("hours")}.</p>
      <p className="forum-stat-popover-note pt-0">{t("Daily history recorded since")} {new Date(query.data.trackingStartedAt).toLocaleDateString(language)} (UTC).</p>
    </> : null}
  </>;
}
