import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { PaperReadingContext } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { useI18n } from "@/i18n";

type Related = PaperReadingContext["related"][number];
const REASON_LABEL: Record<Related["reason"], string> = {
  same_topic_newer: "Newer work on the same topic", same_topic_most_cited: "Most cited on the same topic", semantic_neighbor: "Similar in content",
};

async function fetchReadingContext(paperId: string, topic: string, query: string, signal?: AbortSignal): Promise<PaperReadingContext> {
  const params: Record<string, string> = {};
  if (topic) params.topic = topic;
  if (query) params.query = query;
  const res = await api.get<{ success: boolean; data: PaperReadingContext }>(`/quality/paper/${encodeURIComponent(paperId)}/reading-context`, { params, signal });
  return res.data.data;
}

const pct = (value: number | null) => value === null ? null : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

/** Where the paper sits in a topic and what to read next. Deterministic, so it loads with the page. */
export function PaperReadingContextCard({ paperId }: { paperId: string }) {
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const topic = params.get("topic")?.trim() ?? ""; const query = params.get("q")?.trim() ?? "";
  const { data, isPending, isError } = useQuery({
    queryKey: ["quality", "reading-context", paperId, topic, query],
    queryFn: ({ signal }) => fetchReadingContext(paperId, topic, query, signal),
    staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false,
  });
  if (isError) return null;
  if (isPending) return <p role="status" className="text-sm text-slate-500 dark:text-slate-400">{t("Loading reading context...")}</p>;
  const { trend, related } = data;
  if (!trend && related.length === 0) return null;
  const linkSearch = topic ? `?topic=${encodeURIComponent(topic)}` : query ? `?q=${encodeURIComponent(query)}` : "";
  const figures = trend ? [
    trend.growthRatePct !== null && t("Growth {{pct}}", { pct: pct(trend.growthRatePct)! }),
    trend.cagr3yPct != null && t("3-year CAGR {{pct}}", { pct: pct(trend.cagr3yPct)! }),
    trend.momentum !== null && t("Momentum {{value}}", { value: trend.momentum.toFixed(2) }),
  ].filter(Boolean) as string[] : [];
  const partialPoint = trend?.partialYear == null ? undefined : trend.yearlyBreakdown.find((item) => item.year === trend.partialYear);
  const paperPoint = trend?.paperYear == null ? undefined : trend.yearlyBreakdown.find((item) => item.year === trend.paperYear);
  return <section aria-labelledby="reading-context-title" className="min-w-0 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#11161F] sm:p-6">
    <h3 id="reading-context-title" className="text-base font-bold tracking-tight text-slate-900 dark:text-white">{t("Where this paper sits")}</h3>
    {trend && <div className="space-y-2">
      <p className="text-sm font-semibold [overflow-wrap:anywhere]"><span data-no-i18n>{t("Topic: {{topic}}", { topic: trend.topic })}</span></p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t(trend.source === "requested" ? "Topic you opened this paper from" : "This paper's strongest topic")} · {t("{{count}} papers", { count: trend.totalPapers.toLocaleString(language) })}</p>
      {trend.yearlyBreakdown.length > 1 && <div role="img" aria-label={`${t("Papers per year")}${trend.paperYear ? `. ${t("Paper published in {{year}}", { year: trend.paperYear })}` : ""}${trend.partialYear != null ? `. ${t("Data for {{year}} is still incomplete", { year: trend.partialYear })}` : ""}`} className="h-36 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend.yearlyBreakdown} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={16} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
          <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.08} isAnimationActive={false} />
          {partialPoint && <ReferenceDot x={partialPoint.year} y={partialPoint.count} r={4} fill="#ffffff" stroke="#64748b" strokeWidth={2} strokeDasharray="2 2" />}
          {paperPoint && <ReferenceDot x={paperPoint.year} y={paperPoint.count} r={5} fill="#c2410c" stroke="#fff" strokeWidth={2} />}
        </AreaChart></ResponsiveContainer>
      </div>}
      {trend.paperYear !== null && <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-orange-700" />{t("Paper published in {{year}}", { year: trend.paperYear })}</p>}
      {trend.partialYear != null && <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-slate-500" />{t("Data for {{year}} is still incomplete", { year: trend.partialYear })}</p>}
      {figures.length > 0 && <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-700 dark:text-slate-300">{figures.map((item) => <li key={item}>{item}</li>)}</ul>}
    </div>}
    {related.length > 0 && <div className="space-y-2">
      <h4 className="text-sm font-semibold">{t("Keep reading")}</h4>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">{related.map((item) => <li key={item.id} className="py-2.5">
        <Link to={`/papers/${encodeURIComponent(item.id)}${linkSearch}`} className="block min-h-6 rounded-sm text-sm font-semibold text-indigo-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 [overflow-wrap:anywhere]" data-no-i18n>{item.title}</Link>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t(REASON_LABEL[item.reason])}{item.publicationYear ? ` · ${item.publicationYear}` : ""}{item.citationCount !== null ? ` · ${t("{{count}} citations", { count: item.citationCount.toLocaleString(language) })}` : ""}</p>
        {item.sharedTopics.length > 0 && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]" data-no-i18n>{item.sharedTopics.join(", ")}</p>}
      </li>)}</ul>
    </div>}
  </section>;
}
