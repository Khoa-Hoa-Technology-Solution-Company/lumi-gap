import { CheckCircle2, AlertCircle } from "lucide-react";
import type { GapGlobalEvidence, ResearchGapItem } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils/format";

/** Says how many corpus papers the probe counts were taken over; gaps saved before that was recorded say so. */
export function GapScopeNote({ evidenceScopeSize }: { evidenceScopeSize?: number }) {
  const { t } = useI18n();
  return (
    <p className="text-[10px] text-slate-500 dark:text-slate-400">
      {evidenceScopeSize !== undefined
        ? t("Counted over {{count}} corpus papers", { count: formatNumber(evidenceScopeSize) })
        : t("Counting scope not recorded (gap created before this update)")}
    </p>
  );
}

/** Probability with three decimals; very small values read "< 0.001". */
function formatPValue(p: number): string {
  return p < 0.001 ? "< 0.001" : `= ${p.toFixed(3)}`;
}

/** Expected count with one decimal below 1,000, as a rounded integer above. */
function formatExpected(expected: number): string {
  return expected >= 1000 ? formatNumber(Math.round(expected)) : expected.toFixed(1);
}

/**
 * Observed vs expected papers at the intersection and what the number means: the under-explored signal ranks gaps,
 * it does not decide that one is open (the closure check does).
 */
export function GapSignalNote({
  intersectionCount = 0,
  underExplored,
}: {
  intersectionCount?: number;
  underExplored?: ResearchGapItem["underExplored"];
}) {
  const { t } = useI18n();
  if (!underExplored) return null;
  const values = {
    count: formatNumber(intersectionCount),
    expected: formatExpected(underExplored.expected),
    ratio: underExplored.ratio.toFixed(2),
    p: formatPValue(underExplored.pValue),
  };
  return (
    <div className="space-y-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
      <p>
        {intersectionCount === 1
          ? t("{{count}} paper where {{expected}} would be expected (ratio {{ratio}}, p {{p}})", values)
          : t("{{count}} papers where {{expected}} would be expected (ratio {{ratio}}, p {{p}})", values)}
      </p>
      {underExplored.global && (
        <p>
          {t("OpenAlex: ratio {{ratio}}, p {{p}}", { ratio: underExplored.global.ratio.toFixed(2), p: formatPValue(underExplored.global.pValue) })}
        </p>
      )}
      {underExplored.vetoedByGlobal && (
        <p className="font-medium text-amber-700 dark:text-amber-400">
          {t("Rare in this corpus, but OpenAlex finds the intersection well covered, so it is not marked under-explored.")}
        </p>
      )}
      <p className="text-[10px] italic text-slate-500 dark:text-slate-400">
        {t("A ranking signal, not proof. Run a closure check to decide whether the gap is open.")}
      </p>
    </div>
  );
}

interface GapEvidenceSummaryProps {
  probe?: { topicA: string; topicB: string; yearFrom?: number; yearTo?: number; semanticMinSimilarity?: number };
  evidenceScopeSize?: number;
  intersectionCount?: number;
  parentCounts?: { a: number; b: number };
  parentTrend?: { topic: string; growthRatePct: number; cagrPct?: number | null } | null;
  underExplored?: ResearchGapItem["underExplored"];
  globalEvidence?: GapGlobalEvidence | null;
}

export function GapEvidenceSummary({
  probe,
  evidenceScopeSize,
  intersectionCount = 0,
  parentCounts,
  parentTrend,
  underExplored,
  globalEvidence,
}: GapEvidenceSummaryProps) {
  const { t } = useI18n();
  if (!probe) {
    return (
      <div className="flex items-center gap-1.5 p-2.5 bg-slate-50/50 dark:bg-slate-900/10 text-slate-500 dark:text-slate-400 italic rounded-xl border border-slate-100 dark:border-slate-800/40 text-xs">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
        <span>{t("No corpus probe attached. AI-derived hypothesis.")}</span>
      </div>
    );
  }

  const showParentInfo = parentTrend && parentCounts;
  const parentPaperCount = showParentInfo
    ? parentTrend.topic === probe.topicA
      ? parentCounts.a
      : parentCounts.b
    : null;

  return (
    <div className="bg-slate-50/30 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/45 rounded-xl p-3 space-y-2 text-xs">
      <span className="font-bold text-emerald-800 dark:text-emerald-400 text-[10px] uppercase tracking-wider block flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t("Evidence check")}
      </span>
      <div className="text-slate-600 dark:text-slate-350 leading-relaxed">
        <strong className="text-slate-900 dark:text-white">{formatNumber(intersectionCount)}</strong> {t("papers exist at the intersection of")}{" "}
        <code className="bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 px-1 rounded text-[10px] font-mono text-slate-800 dark:text-slate-200">
          "{probe.topicA}"
        </code>{" "}
        ×{" "}
        <code className="bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 px-1 rounded text-[10px] font-mono text-slate-800 dark:text-slate-200">
          "{probe.topicB}"
        </code>
        {showParentInfo && parentTrend && (
          <>
            {t(" — whereas ")}
            <code className="bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 px-1 rounded text-[10px] font-mono text-slate-800 dark:text-slate-200">
              "{parentTrend.topic}"
            </code>{" "}
            {t("has")} <strong className="text-slate-900 dark:text-white">{formatNumber(parentPaperCount ?? 0)}</strong> {t("papers")} (
            {t("raw growth")}{" "}
            <strong className="text-slate-900 dark:text-white" title={t("Raw paper counts, which also grow with the whole literature. Not a trend test.")}>
              {parentTrend.growthRatePct >= 0 ? "+" : ""}
              {Math.round(parentTrend.growthRatePct)}%
            </strong>
            {parentTrend.cagrPct != null ? ` ${t("CAGR")}` : t("/year")})
          </>
        )}
        .
      </div>
      <GapSignalNote intersectionCount={intersectionCount} underExplored={underExplored} />
      <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300" title={globalEvidence ? undefined : t("OpenAlex count unavailable")}>
        {t("Corpus: {{corpus}} · OpenAlex: {{global}}", {
          corpus: formatNumber(intersectionCount),
          global: globalEvidence ? formatNumber(globalEvidence.intersectionCount) : "—",
        })}
      </p>
      {probe.semanticMinSimilarity !== undefined && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          {t("Counts include papers whose meaning is close to a topic (cosine ≥ {{threshold}}), not only word matches", { threshold: probe.semanticMinSimilarity.toFixed(2) })}
        </p>
      )}
      <GapScopeNote evidenceScopeSize={evidenceScopeSize} />
    </div>
  );
}
