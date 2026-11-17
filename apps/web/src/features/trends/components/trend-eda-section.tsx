import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { DescriptiveStats, TopicTrendStatistics } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { formatSigned } from "../../../pages/trends.insights";

type Translate = ReturnType<typeof useI18n>["t"];

const AXIS_TICK = { fontSize: 11, fill: "#64748b" };
const OUTLIER_COLOR = "#dc2626";
const SERIES_COLOR = "#2563eb";

function fixed(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

/**
 * Exploratory data analysis of one topic, in the order of the method: check the
 * data, describe it, draw it, look for anomalous years. It only describes the
 * series; the conclusion below it is decided by the trend test.
 */
export function TrendEdaSection({ statistics, baselineLabel }: { statistics: TopicTrendStatistics; baselineLabel: string }) {
  const { t } = useI18n();
  const { eda, classification } = statistics;
  const first = statistics.yearsUsed[0];
  const last = statistics.yearsUsed[statistics.yearsUsed.length - 1];

  const chartData = eda.years.map((row, index) => {
    const share = statistics.shareSeries[index];
    return {
      year: row.year,
      share: Number(row.sharePct.toFixed(4)),
      fitted: row.fitted === null ? null : Number(row.fitted.toFixed(4)),
      residual: row.residual === null ? null : Number(row.residual.toFixed(4)),
      anomaly: row.outlier ? Number(row.sharePct.toFixed(4)) : null,
      outlier: row.outlier,
      count: share?.count ?? 0,
      total: share?.total ?? 0,
    };
  });
  const hasLine = eda.trendLine !== null;

  return (
    <div className="space-y-6">
      <Step number={1} heading={t("Understand and check the data")}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <Fact label={t("Complete years used")} value={first !== undefined && last !== undefined ? t("{{n}} ({{from}}–{{to}})", { n: statistics.yearsUsed.length, from: first, to: last }) : "0"} />
          <Fact label={t("Papers in the years used")} value={formatNumber(statistics.totalPapers)} />
          <Fact label={t("Reference population")} value={statistics.baseline.scopeVersion ? `${baselineLabel} · ${statistics.baseline.scopeVersion}` : baselineLabel} />
          <Fact label={t("Data source")} value={statistics.source === "openalex" ? "OpenAlex" : t("Local corpus")} />
          <Fact
            label={t("Years left out")}
            value={eda.excludedYears.length === 0
              ? t("None")
              : eda.excludedYears.map((row) => `${row.year} (${row.reason === "incomplete" ? t("still running") : t("no papers in the reference population")})`).join(", ")}
          />
          <Fact label={t("Years without a paper of the topic")} value={eda.zeroCountYears.length === 0 ? t("None") : eda.zeroCountYears.join(", ")} />
        </dl>
      </Step>

      <Step number={2} heading={t("Descriptive statistics")}>
        {eda.share && eda.papers ? (
          <>
            <DescriptiveTable share={eda.share} papers={eda.papers} t={t} />
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {t("Skewness and kurtosis are shown for description only: on a series this short they vary a lot, and they do not take part in the conclusion.")}
            </p>
          </>
        ) : (
          <Empty>{t("No complete year to describe.")}</Empty>
        )}
      </Step>

      <Step number={3} heading={t("Visualise the series")}>
        {chartData.length === 0 ? (
          <Empty>{t("No complete year to draw.")}</Empty>
        ) : (
          <div className="space-y-6">
            <Chart
              heading={t("Share over time with its trend line")}
              note={t("Dashed: Theil–Sen line. Shaded: the recent years the plateau check looks at. Red: anomalous years.")}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} allowDecimals={false} tickCount={chartData.length} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                  <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} />
                  {eda.recentWindow && <ReferenceArea x1={eda.recentWindow.yearFrom} x2={eda.recentWindow.yearTo} fill="#94a3b8" fillOpacity={0.12} />}
                  <Tooltip
                    formatter={(value, name, item) => {
                      if (name === "share") return [`${value}% (${formatNumber(item.payload.count)}/${formatNumber(item.payload.total)})`, t("Share of papers")];
                      if (name === "fitted") return [`${value}%`, t("Trend line")];
                      return [`${value}%`, t("Anomalous year")];
                    }}
                    labelFormatter={(label) => t("Year {{year}}", { year: String(label) })}
                  />
                  {hasLine && <Line type="linear" dataKey="fitted" stroke="#64748b" strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
                  <Line type="monotone" dataKey="share" stroke={SERIES_COLOR} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                  <Scatter dataKey="anomaly" fill={OUTLIER_COLOR} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Chart>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Chart heading={t("Residuals: share minus trend line")} note={t("Percentage points. A bar far from the others is an anomalous year.")}>
                {hasLine ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                      <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Tooltip formatter={(value) => [formatSigned(Number(value), 3), t("Residual")]} labelFormatter={(label) => t("Year {{year}}", { year: String(label) })} />
                      <Bar dataKey="residual" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {chartData.map((row) => (
                          <Cell key={row.year} fill={row.outlier ? OUTLIER_COLOR : "#93c5fd"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>{t("At least 2 years are needed to fit a line.")}</Empty>
                )}
              </Chart>
              <Chart heading={t("Distribution of the yearly share")} note={t("Box: first quartile, median, third quartile. Whiskers: minimum and maximum. Dots: each year.")}>
                {eda.share ? <BoxPlot stats={eda.share} values={chartData.map((row) => ({ value: row.share, outlier: row.outlier, label: String(row.year) }))} /> : <Empty>{t("No complete year to draw.")}</Empty>}
              </Chart>
            </div>
          </div>
        )}
      </Step>

      <Step number={4} heading={t("Anomalous years")}>
        {eda.outlierYears.length === 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">{t("No year stands out from the trend line.")}</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
            {eda.years.filter((row) => row.outlier).map((row) => (
              <li key={row.year}>
                <span className="font-bold text-red-700 dark:text-red-400">{row.year}</span>
                {": "}
                {t("share {{share}}%, {{residual}} percentage points from the trend line (score {{score}}).", {
                  share: fixed(row.sharePct, 3),
                  residual: row.residual === null ? "—" : formatSigned(row.residual, 3),
                  score: row.outlierScore === null ? "—" : formatSigned(row.outlierScore, 1),
                })}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {t("A year is anomalous when its residual lies more than 2.5 median absolute deviations from the median residual. Anomalous years are a caution when reading the conclusion; they never change it.")}
        </p>
        {classification.peakRatio !== null && (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <Fact label={t("Recent change of the share, per year")} value={classification.recentRelativeChangePct === null ? "—" : `${formatSigned(classification.recentRelativeChangePct, 1)}%`} />
            <Fact label={t("Recent share compared with its peak")} value={`${fixed(classification.peakRatio * 100, 0)}%`} />
          </dl>
        )}
      </Step>
    </div>
  );
}

function DescriptiveTable({ share, papers, t }: { share: DescriptiveStats; papers: DescriptiveStats; t: Translate }) {
  const rows: Array<{ label: string; share: string; papers: string }> = [
    { label: t("Mean"), share: fixed(share.mean, 3), papers: fixed(papers.mean, 1) },
    { label: t("Median"), share: fixed(share.median, 3), papers: fixed(papers.median, 1) },
    { label: t("First and third quartile"), share: `${fixed(share.q1, 3)} – ${fixed(share.q3, 3)}`, papers: `${fixed(papers.q1, 1)} – ${fixed(papers.q3, 1)}` },
    { label: t("Minimum and maximum"), share: `${fixed(share.min, 3)} – ${fixed(share.max, 3)}`, papers: `${formatNumber(papers.min)} – ${formatNumber(papers.max)}` },
    { label: t("Range"), share: fixed(share.range, 3), papers: formatNumber(papers.range) },
    { label: t("Variance"), share: fixed(share.variance, 4), papers: fixed(papers.variance, 1) },
    { label: t("Standard deviation"), share: fixed(share.standardDeviation, 3), papers: fixed(papers.standardDeviation, 1) },
    { label: t("Coefficient of variation"), share: fixed(share.coefficientOfVariation, 2), papers: fixed(papers.coefficientOfVariation, 2) },
    { label: t("Skewness"), share: fixed(share.skewness, 2), papers: fixed(papers.skewness, 2) },
    { label: t("Excess kurtosis"), share: fixed(share.kurtosis, 2), papers: fixed(papers.kurtosis, 2) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
            <th className="py-1.5 pr-2 font-semibold">{t("Statistic")}</th>
            <th className="px-2 py-1.5 text-right font-semibold">{t("Share (%)")}</th>
            <th className="py-1.5 pl-2 text-right font-semibold">{t("Papers per year")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-50 dark:border-slate-900">
              <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-400">{row.label}</td>
              <td className="px-2 py-1.5 text-right font-mono text-slate-900 dark:text-white">{row.share}</td>
              <td className="py-1.5 pl-2 text-right font-mono text-slate-900 dark:text-white">{row.papers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal box plot drawn directly in SVG: min, Q1, median, Q3, max and one dot per value. */
function BoxPlot({ stats, values }: { stats: DescriptiveStats; values: Array<{ value: number; outlier: boolean; label: string }> }) {
  const width = 400;
  const left = 16;
  const right = width - 16;
  const span = stats.max - stats.min;
  const x = (value: number) => (span === 0 ? (left + right) / 2 : left + ((value - stats.min) / span) * (right - left));
  return (
    <svg viewBox={`0 0 ${width} 150`} className="h-full w-full" role="img" aria-label={`min ${fixed(stats.min, 3)}, Q1 ${fixed(stats.q1, 3)}, median ${fixed(stats.median, 3)}, Q3 ${fixed(stats.q3, 3)}, max ${fixed(stats.max, 3)}`}>
      <line x1={x(stats.min)} x2={x(stats.max)} y1={60} y2={60} stroke="#64748b" strokeWidth={1.5} />
      <line x1={x(stats.min)} x2={x(stats.min)} y1={48} y2={72} stroke="#64748b" strokeWidth={1.5} />
      <line x1={x(stats.max)} x2={x(stats.max)} y1={48} y2={72} stroke="#64748b" strokeWidth={1.5} />
      <rect x={x(stats.q1)} y={40} width={Math.max(x(stats.q3) - x(stats.q1), 1)} height={40} fill="#dbeafe" stroke={SERIES_COLOR} strokeWidth={1.5} rx={3} />
      <line x1={x(stats.median)} x2={x(stats.median)} y1={40} y2={80} stroke={SERIES_COLOR} strokeWidth={2.5} />
      {values.map((point) => (
        <circle key={point.label} cx={x(point.value)} cy={104} r={3.5} fill={point.outlier ? OUTLIER_COLOR : SERIES_COLOR} fillOpacity={0.75}>
          <title>{`${point.label}: ${point.value}%`}</title>
        </circle>
      ))}
      <text x={left} y={134} fontSize={11} fill="#64748b" textAnchor="start">{`${fixed(stats.min, 3)}%`}</text>
      <text x={x(stats.median)} y={30} fontSize={11} fill="currentColor" className="text-slate-700 dark:text-slate-200" textAnchor="middle">{`${fixed(stats.median, 3)}%`}</text>
      <text x={right} y={134} fontSize={11} fill="#64748b" textAnchor="end">{`${fixed(stats.max, 3)}%`}</text>
    </svg>
  );
}

function Step({ number, heading, children }: { number: number; heading: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <h3 className="mb-4 flex items-center gap-2.5 text-[15px] font-bold text-slate-900 dark:text-white">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white" aria-hidden="true">{number}</span>
        {heading}
      </h3>
      {children}
    </div>
  );
}

function Chart({ heading, note, children }: { heading: string; note: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-[13px] font-bold text-slate-800 dark:text-slate-200">{heading}</h4>
      <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-slate-500">{note}</p>
      <div className="h-[240px] w-full">{children}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 dark:border-slate-800">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-mono text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="flex h-full items-center justify-center text-xs italic text-slate-500">{children}</p>;
}
