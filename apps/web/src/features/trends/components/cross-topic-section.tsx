import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { DescriptiveStats, TrendCrossTopicAnalysis, TrendCrossTopicPoint, TrendSizeBand, TrendVerdict } from "@trend/shared-types";
import { TREND_SIZE_BANDS } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { formatSigned } from "../../../pages/trends.insights";
import { VERDICT_ORDER } from "./verdict-filter";
import { verdictLabel } from "./trend-verdict-badge";
import { VERDICT_COLORS, bandCutoffText, buildBandBoxes, buildRHistogram, hasCrossTopic, splitClearTopics, symlog, symlogTicks, type BandBox } from "../cross-topic";

type Translate = ReturnType<typeof useI18n>["t"];

const AXIS_TICK = { fontSize: 11, fill: "currentColor" };
const SERIES_COLOR = "#2563eb";

export function sizeBandLabel(band: TrendSizeBand, t: Translate): string {
  return band === "small" ? t("Small topics") : band === "medium" ? t("Medium topics") : t("Large topics");
}

function fixed(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

/**
 * Topics compared with each other over the whole Information Technology scope
 * (spec 2026-11-14 section 7.1). Descriptive only: it never changes a verdict.
 * Renders nothing when the overview carries no analysis (local corpus fallback).
 */
export function CrossTopicSection({ analysis, getTopicTrendTarget }: { analysis: TrendCrossTopicAnalysis | null | undefined; getTopicTrendTarget: (topic: string) => string }) {
  if (!hasCrossTopic(analysis)) return null;
  return <CrossTopicContent analysis={analysis} getTopicTrendTarget={getTopicTrendTarget} />;
}

function CrossTopicContent({ analysis, getTopicTrendTarget }: { analysis: TrendCrossTopicAnalysis; getTopicTrendTarget: (topic: string) => string }) {
  const { t } = useI18n();
  const boxes = buildBandBoxes(analysis);
  const clear = splitClearTopics(analysis.points);
  const anomalous = analysis.points.filter((point) => point.outlier).length;

  return (
    <section aria-labelledby="cross-topic-heading" data-testid="cross-topic-section" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <h3 id="cross-topic-heading" className="text-base font-bold text-slate-900 dark:text-white">{t("Topics compared with each other")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        {t("This compares the {{count}} topics of the whole Information Technology scope, whatever the filters above. It is descriptive: it never changes a topic's verdict.", { count: formatNumber(analysis.population) })}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        {t("r is the relative change of a topic's share per year. Topics are grouped by size (tertiles of total papers); a topic is anomalous when its r lies outside the Tukey fences of its group, and clear when it is rising above the upper fence or declining below the lower fence.")}
        {" "}
        {t("{{anomalous}} anomalous topics, {{clear}} clear.", { anomalous: formatNumber(anomalous), clear: formatNumber(clear.rising.length + clear.declining.length) })}
      </p>

      <div className="mt-5 space-y-6">
        <Block heading={t("Descriptive statistics of r")} note={t("Percent per year. Fences: Q1 − 1.5·IQR and Q3 + 1.5·IQR within each size group (Tukey 1977).")}>
          <StatsTable analysis={analysis} />
        </Block>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Block heading={t("Distribution of r")} note={t("Bars are coloured by verdict. The range is clipped at the 2nd and 98th percentile; the end bars count everything beyond.")}>
            <HistogramChart points={analysis.points} />
          </Block>
          <Block heading={t("r by size group")} note={t("Box: Q1, median, Q3. Whiskers: last value inside the fences. Dots: anomalous topics. Log-like axis, so one extreme topic does not flatten the rest.")}>
            <BandBoxPlot boxes={boxes} />
          </Block>
        </div>

        <Block heading={t("Size against change")} note={t("x: total papers in the window (log scale). y: r on a symmetric log axis, so one extreme topic does not flatten the rest. Ringed dots are clear topics; dashed lines are the size group cutoffs.")}>
          <ScatterPlot analysis={analysis} />
        </Block>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ClearList heading={t("Clear topics: rising")} topics={clear.rising} getTopicTrendTarget={getTopicTrendTarget} />
          <ClearList heading={t("Clear topics: declining")} topics={clear.declining} getTopicTrendTarget={getTopicTrendTarget} />
        </div>
      </div>
    </section>
  );
}

function Block({ heading, note, children }: { heading: string; note: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[13px] font-bold text-slate-800 dark:text-slate-200">{heading}</h4>
      <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-slate-500">{note}</p>
      {children}
    </div>
  );
}

function StatsTable({ analysis }: { analysis: TrendCrossTopicAnalysis }) {
  const { t } = useI18n();
  type Column = { id: string; label: string; stats: DescriptiveStats | null; fences: TrendCrossTopicAnalysis["fences"][TrendSizeBand] | null };
  const columns: Column[] = [
    { id: "all", label: t("All"), stats: analysis.rStats.all, fences: null },
    ...TREND_SIZE_BANDS.map((band) => ({ id: band, label: sizeBandLabel(band, t), stats: analysis.rStats[band], fences: analysis.fences[band] })),
  ];
  const rows: Array<{ label: string; cell: (c: Column) => string }> = [
    { label: t("Topics (n)"), cell: (c) => (c.stats ? formatNumber(c.stats.n) : "—") },
    { label: t("Mean"), cell: (c) => fixed(c.stats?.mean, 1) },
    { label: t("Median"), cell: (c) => fixed(c.stats?.median, 1) },
    { label: t("First and third quartile"), cell: (c) => (c.stats ? `${fixed(c.stats.q1, 1)} – ${fixed(c.stats.q3, 1)}` : "—") },
    { label: t("Standard deviation"), cell: (c) => fixed(c.stats?.standardDeviation, 1) },
    { label: t("Minimum and maximum"), cell: (c) => (c.stats ? `${fixed(c.stats.min, 1)} – ${fixed(c.stats.max, 1)}` : "—") },
    { label: t("Tukey fences"), cell: (c) => (c.fences ? `${fixed(c.fences.lower, 1)} – ${fixed(c.fences.upper, 1)}` : "—") },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
            <th className="py-1.5 pr-2 text-left font-semibold">{t("Statistic")}</th>
            {columns.map((c) => (
              <th key={c.id} className="px-2 py-1.5 text-right font-semibold" title={c.id === "all" ? undefined : bandCutoffText(c.id as TrendSizeBand, analysis.bandCutoffs, formatNumber, t)}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-50 dark:border-slate-900">
              <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-400">{row.label}</td>
              {columns.map((c) => (
                <td key={c.id} className="px-2 py-1.5 text-right font-mono text-slate-900 dark:text-white">{row.cell(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistogramChart({ points }: { points: TrendCrossTopicPoint[] }) {
  const { t } = useI18n();
  const histogram = buildRHistogram(points);
  const data = histogram.bins.map((bin, index) => ({
    index,
    label: bin.kind === "under" ? `< ${fixed(histogram.lo, 0)}` : bin.kind === "over" ? `> ${fixed(histogram.hi, 0)}` : `${fixed(bin.from, 0)}…${fixed(bin.to, 0)}`,
    ...Object.fromEntries(VERDICT_ORDER.map((verdict) => [verdict, bin.counts[verdict] ?? 0])),
  }));
  return (
    <div className="h-[240px] w-full text-slate-500 dark:text-slate-400">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" strokeOpacity={0.3} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...AXIS_TICK, fontSize: 9 }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
          <Tooltip
            formatter={(value, name) => [formatNumber(Number(value)), verdictLabel(name as TrendVerdict, t)]}
            labelFormatter={(label) => t("r in {{range}} % per year", { range: String(label) })}
          />
          {VERDICT_ORDER.map((verdict) => (
            <Bar key={verdict} dataKey={verdict} stackId="r" fill={VERDICT_COLORS[verdict]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal box plots, one per size group, on a symmetric log axis. Text uses currentColor so it follows dark mode. */
function BandBoxPlot({ boxes }: { boxes: BandBox[] }) {
  const { t } = useI18n();
  const width = 400;
  const left = 70;
  const right = width - 14;
  const rowHeight = 56;
  const height = boxes.length * rowHeight + 34;
  const values = boxes.flatMap((box) => [box.whiskerLow, box.whiskerHigh, ...box.outliers.map((p) => p.r)]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const sMin = symlog(min);
  const span = symlog(max) - sMin || 1;
  const x = (value: number) => left + ((symlog(value) - sMin) / span) * (right - left);
  const ticks = symlogTicks(min, max);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full text-slate-600 dark:text-slate-300" role="img" aria-label={t("Box plots of r per size group")}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={4} y2={height - 24} stroke="currentColor" strokeOpacity={tick === 0 ? 0.5 : 0.15} />
          <text x={x(tick)} y={height - 8} fontSize={10} fill="currentColor" textAnchor="middle">{tick}</text>
        </g>
      ))}
      {boxes.map((box, index) => {
        const cy = 4 + index * rowHeight + rowHeight / 2;
        return (
          <g key={box.band}>
            <text x={4} y={cy - 2} fontSize={11} fontWeight={700} fill="currentColor">{sizeBandLabel(box.band, t)}</text>
            <text x={4} y={cy + 11} fontSize={9} fill="currentColor" fillOpacity={0.7}>{`n = ${box.n}`}</text>
            <line x1={x(box.whiskerLow)} x2={x(box.whiskerHigh)} y1={cy} y2={cy} stroke="currentColor" strokeWidth={1.5} />
            <line x1={x(box.whiskerLow)} x2={x(box.whiskerLow)} y1={cy - 7} y2={cy + 7} stroke="currentColor" strokeWidth={1.5} />
            <line x1={x(box.whiskerHigh)} x2={x(box.whiskerHigh)} y1={cy - 7} y2={cy + 7} stroke="currentColor" strokeWidth={1.5} />
            <rect x={x(box.q1)} y={cy - 12} width={Math.max(x(box.q3) - x(box.q1), 1)} height={24} fill={SERIES_COLOR} fillOpacity={0.2} stroke={SERIES_COLOR} strokeWidth={1.5} rx={3} />
            <line x1={x(box.median)} x2={x(box.median)} y1={cy - 12} y2={cy + 12} stroke={SERIES_COLOR} strokeWidth={2.5} />
            {box.outliers.map((point) => (
              <circle key={point.topic} cx={x(point.r)} cy={cy} r={3} fill={VERDICT_COLORS[point.verdict]} fillOpacity={0.85}>
                <title>{`${point.topic}: ${formatSigned(point.r, 1)}%`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function ScatterPlot({ analysis }: { analysis: TrendCrossTopicAnalysis }) {
  const { t } = useI18n();
  const rows = analysis.points.map((point) => ({ ...point, x: Math.log10(Math.max(point.totalPapers, 1)), y: symlog(point.r) }));
  const rs = analysis.points.map((p) => p.r);
  const rMin = Math.min(...rs);
  const rMax = Math.max(...rs);
  const xs = rows.map((row) => row.x);
  const xMin = Math.floor(Math.min(...xs) * 10) / 10;
  const xMax = Math.ceil(Math.max(...xs) * 10) / 10;
  const xTicks = [2, 3, 4, 5, 6, 7].filter((tick) => tick >= xMin && tick <= xMax);
  return (
    <div className="w-full text-slate-500 dark:text-slate-400">
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 14, left: -6, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
            <XAxis type="number" dataKey="x" domain={[xMin, xMax]} ticks={xTicks} tickFormatter={(v: number) => formatNumber(Math.round(10 ** v))} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis
              type="number"
              dataKey="y"
              domain={[symlog(rMin) - 0.05, symlog(rMax) + 0.05]}
              ticks={symlogTicks(rMin, rMax).map((tick) => symlog(tick))}
              tickFormatter={(v: number) => String(Math.round(Math.sign(v) * 10 * (10 ** Math.abs(v) - 1)))}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
            />
            <ZAxis range={[28, 28]} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <ReferenceLine x={Math.log10(Math.max(analysis.bandCutoffs.smallMax, 1))} stroke="#94a3b8" strokeDasharray="5 4" />
            <ReferenceLine x={Math.log10(Math.max(analysis.bandCutoffs.mediumMax, 1))} stroke="#94a3b8" strokeDasharray="5 4" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip />} />
            {VERDICT_ORDER.map((verdict) => (
              <Scatter
                key={verdict}
                name={verdictLabel(verdict, t)}
                data={rows.filter((row) => row.verdict === verdict)}
                fill={VERDICT_COLORS[verdict]}
                isAnimationActive={false}
                shape={(props: unknown) => <ScatterDot {...(props as { cx: number; cy: number; payload: TrendCrossTopicPoint })} />}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        {VERDICT_ORDER.map((verdict) => (
          <li key={verdict} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: VERDICT_COLORS[verdict] }} aria-hidden="true" />
            {verdictLabel(verdict, t)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScatterDot({ cx, cy, payload }: { cx: number; cy: number; payload: TrendCrossTopicPoint }) {
  const color = VERDICT_COLORS[payload.verdict];
  return payload.clear ? (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={4.5} fill={color} />
    </g>
  ) : (
    <circle cx={cx} cy={cy} r={3.5} fill={color} fillOpacity={0.7} />
  );
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendCrossTopicPoint }> }) {
  const { t } = useI18n();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="max-w-[240px] rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <p className="font-bold text-slate-900 dark:text-white">{point.topic}</p>
      <p>{t("Papers")}: {formatNumber(point.totalPapers)}</p>
      <p>r: {formatSigned(point.r, 1)}% {t("per year")}</p>
      <p>{t("Size group")}: {sizeBandLabel(point.sizeBand, t)}</p>
      <p>{verdictLabel(point.verdict, t)}{point.clear ? ` · ${t("Clear change")}` : point.outlier ? ` · ${t("Anomalous")}` : ""}</p>
    </div>
  );
}

function ClearList({ heading, topics, getTopicTrendTarget }: { heading: string; topics: TrendCrossTopicPoint[]; getTopicTrendTarget: (topic: string) => string }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <h4 className="text-[13px] font-bold text-slate-800 dark:text-slate-200">{heading} <span className="font-mono text-slate-400">({topics.length})</span></h4>
      {topics.length === 0 ? (
        <p className="mt-2 text-xs italic text-slate-500">{t("None")}</p>
      ) : (
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
          {topics.map((point) => (
            <li key={point.topic} className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 dark:border-slate-800">
              <Link to={getTopicTrendTarget(point.topic)} className="min-w-0 truncate font-semibold text-blue-700 hover:underline dark:text-blue-400" title={point.topic}>{point.topic}</Link>
              <span className="shrink-0 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                {formatSigned(point.r, 1)}% <span className="text-[10px] text-slate-400">· {sizeBandLabel(point.sizeBand, t)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
