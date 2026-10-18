import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import type { TopicTrendStatistics, TrendTermShift } from "@trend/shared-types";
import { DOCS_SECTIONS } from "@/features/docs";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { formatSigned } from "../../../pages/trends.insights";
import { TrendFigures, TrendHowLink, TrendReasons, TrendVerdictBadge } from "./trend-verdict-badge";

export function formatPValue(p: number): string {
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

export function TrendEvidencePanel({ statistics }: { statistics: TopicTrendStatistics }) {
  const { t } = useI18n();
  const { classification } = statistics;
  const mk = statistics.mannKendall;
  const first = statistics.yearsUsed[0];
  const last = statistics.yearsUsed[statistics.yearsUsed.length - 1];
  const baselineLabel = statistics.baseline.level === "field"
    ? t("Field: {{name}}", { name: statistics.baseline.label })
    : t(statistics.baseline.label);
  const ci = classification.senSlopeCi95;

  const shareData = statistics.shareSeries.map((row) => ({ year: String(row.year), share: Number(row.sharePct.toFixed(3)), count: row.count, total: row.total }));
  const impactData = statistics.impact.map((row) => ({ year: String(row.year), pp: row.ppTop10Pct === null ? null : Number(row.ppTop10Pct.toFixed(2)), top: row.topPapers, n: row.papers }));
  const hasImpact = impactData.some((row) => row.pp !== null);

  const rows: Array<{ label: string; value: string }> = [
    { label: t("p-value"), value: mk ? formatPValue(mk.pValue) : "—" },
    {
      label: t("Sen's slope of share"),
      value: classification.senSlope === null
        ? "—"
        : `${t("{{value}} percentage points/year", { value: formatSigned(classification.senSlope, 3) })}${ci ? ` [${formatSigned(ci[0], 3)}, ${formatSigned(ci[1], 3)}]` : ""}`,
    },
    {
      label: t("Complete years used"),
      value: first !== undefined && last !== undefined
        ? t("{{n}} ({{from}}–{{to}})", { n: classification.yearsUsed, from: first, to: last })
        : String(classification.yearsUsed),
    },
    { label: t("Papers in the years used"), value: formatNumber(classification.totalPapers) },
    { label: t("Reference population"), value: baselineLabel },
  ];

  return (
    <section className="mb-8 space-y-6">
      {/* 1. Conclusion: badge, one number, one sentence, link to the docs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TrendVerdictBadge classification={classification} />
          <TrendHowLink />
        </div>
        <div className="mt-3">
          <TrendFigures classification={classification} source={statistics.source} />
        </div>
        <TrendReasons classification={classification} className="mt-2" />
      </div>

      {/* 2. Share series */}
      <ChartCard heading={t("Share of the reference population (%)")} note={baselineLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={shareData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip
              formatter={(value, _name, item) => [`${value}% (${item.payload.count}/${item.payload.total})`, t("Share")]}
              labelFormatter={(label) => t("Year {{year}}", { year: String(label) })}
            />
            <Line type="monotone" dataKey="share" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 3. Numbers behind the conclusion, collapsed; the formulas live in /docs */}
      <Collapsible heading={t("Statistical details")}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
              <dd className="text-right font-mono text-slate-900 dark:text-white">{row.value}</dd>
            </div>
          ))}
        </dl>
        <TrendHowLink className="mt-3 inline-block" />
      </Collapsible>

      {/* 4. Supplementary information, collapsed */}
      <Collapsible heading={t("Supplementary information: does not affect the conclusion")}>
        <div className="space-y-4">
          <ChartCard heading={t("Share of highly cited papers, PP(top 10%)")} note={t("10% = world average")}>
            {hasImpact ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={impactData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <ReferenceLine y={10} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Tooltip
                    formatter={(value, _name, item) => [t("{{value}}% ({{top}} of {{n}} papers)", { value: String(value), top: item.payload.top, n: item.payload.n }), "PP(top 10%)"]}
                    labelFormatter={(label) => t("Year {{year}}", { year: String(label) })}
                  />
                  <Bar dataKey="pp" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-xs italic text-slate-500">{t("No citation percentile data for these papers.")}</p>
            )}
          </ChartCard>
          <TermShiftSection statistics={statistics} />
          <TrendHowLink section={DOCS_SECTIONS.trendSupplementary} anchor="" />
        </div>
      </Collapsible>
    </section>
  );
}

function Collapsible({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
        {heading}
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function TermShiftSection({ statistics }: { statistics: TopicTrendStatistics }) {
  const { t } = useI18n();
  const shift = statistics.termShift;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">{t("What is changing inside the topic")}</h3>
      {shift ? (
        <>
          <p className="mt-1 text-xs text-slate-500">
            {t("Share of the topic's papers carrying each keyword: period A ({{a1}}–{{a2}}, {{pa}} papers) versus period B ({{b1}}–{{b2}}, {{pb}} papers). {{n}} frequent keywords tested.", {
              a1: shift.periodA.yearFrom, a2: shift.periodA.yearTo, pa: shift.periodA.papers,
              b1: shift.periodB.yearFrom, b2: shift.periodB.yearTo, pb: shift.periodB.papers,
              n: shift.termsTested,
            })}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TermTable heading={t("Used more in period B")} rows={shift.rising} alpha={statistics.significanceLevel} tone="rising" />
            <TermTable heading={t("Used less in period B")} rows={shift.falling} alpha={statistics.significanceLevel} tone="falling" />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">{t("Grey rows are not significant after the Benjamini–Hochberg correction (q ≥ α).")}</p>
        </>
      ) : (
        <p className="mt-2 text-xs italic text-slate-500">{t("Not enough keyword data to compare two periods (at least 4 complete years with keywords are needed).")}</p>
      )}
    </div>
  );
}

function TermTable({ heading, rows, alpha, tone }: { heading: string; rows: TrendTermShift[]; alpha: number; tone: "rising" | "falling" }) {
  const { t } = useI18n();
  const accent = tone === "rising" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <div>
      <h4 className={`mb-2 text-xs font-extrabold uppercase tracking-wider ${accent}`}>{heading}</h4>
      {rows.length === 0 ? (
        <p className="text-xs italic text-slate-500">{t("No keywords in this direction.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
                <th className="py-1.5 pr-2 font-semibold">{t("Keyword")}</th>
                <th className="px-2 py-1.5 text-right font-semibold">A</th>
                <th className="px-2 py-1.5 text-right font-semibold">B</th>
                <th className="px-2 py-1.5 text-right font-semibold">z</th>
                <th className="py-1.5 pl-2 text-right font-semibold">q</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const significant = row.qValue < alpha;
                return (
                  <tr key={row.term} className={`border-b border-slate-50 dark:border-slate-900 ${significant ? "" : "text-slate-400 dark:text-slate-600"}`}>
                    <td className={`py-1.5 pr-2 font-semibold capitalize ${significant ? "text-slate-800 dark:text-slate-200" : ""}`}>{row.term}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{row.papersA.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{row.papersB.toLocaleString()}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${significant ? accent : ""}`}>{row.z.toFixed(2)}</td>
                    <td className="py-1.5 pl-2 text-right font-mono">{formatPValue(row.qValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChartCard({ heading, note, children }: { heading: string; note: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">{heading}</h3>
        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800">{note}</span>
      </div>
      <div className="h-[260px] w-full">{children}</div>
    </div>
  );
}
