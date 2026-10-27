import { Link } from "react-router-dom";
import { CircleHelp, Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { TrendClassification, TrendConfidence, TrendDataSource, TrendReasonCode, TrendVerdict } from "@trend/shared-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DOCS_SECTIONS, docsPath } from "@/features/docs";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { formatSigned } from "../../../pages/trends.insights";

type Translate = ReturnType<typeof useI18n>["t"];

/** Icon + text + border style per verdict, so the meaning never relies on colour alone. */
const VERDICT_STYLE: Record<TrendVerdict, { icon: LucideIcon; classes: string }> = {
  rising: {
    icon: TrendingUp,
    classes: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  declining: {
    icon: TrendingDown,
    classes: "border-red-300 bg-red-50 text-red-800 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-300",
  },
  stable: {
    icon: Minus,
    classes: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300",
  },
  insufficient: {
    icon: CircleHelp,
    classes: "border-dashed border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-300",
  },
};

export function verdictLabel(verdict: TrendVerdict, t: Translate): string {
  switch (verdict) {
    case "rising": return t("Rising");
    case "declining": return t("Declining");
    case "stable": return t("Stable");
    default: return t("Insufficient data");
  }
}

export function confidenceLabel(confidence: TrendConfidence, t: Translate): string {
  return confidence === "high" ? t("High confidence") : t("Medium confidence");
}

/** `unit` "period": the verdict was computed on months or quarters (GET /trends/periods). */
export function reasonText(code: TrendReasonCode, t: Translate, unit: "year" | "period" = "year"): string {
  switch (code) {
    case "LOCAL_CORPUS":
      return t("Data comes from the local corpus, so only descriptive figures are shown.");
    case "TOO_FEW_YEARS":
      return unit === "period" ? t("Fewer than 5 complete periods of data.") : t("Fewer than 5 complete years of data.");
    case "TOO_FEW_PAPERS":
      return t("Fewer than 30 papers.");
    case "SIGNIFICANT_INCREASE":
      return unit === "period" ? t("Its share of the field grew clearly over these periods.") : t("Its share of the field grew clearly over the years.");
    case "SIGNIFICANT_DECREASE":
      return unit === "period" ? t("Its share of the field shrank clearly over these periods.") : t("Its share of the field shrank clearly over the years.");
    default:
      return t("No clear change in its share of the field.");
  }
}

/** Verdict and confidence as one badge. Hover or focus shows the reasons. */
export function TrendVerdictBadge({
  classification,
  size = "md",
  unit = "year",
  className = "",
}: {
  classification: TrendClassification;
  size?: "sm" | "md";
  unit?: "year" | "period";
  className?: string;
}) {
  const { t } = useI18n();
  const { icon: Icon, classes } = VERDICT_STYLE[classification.verdict];
  const label = verdictLabel(classification.verdict, t);
  const confidence = classification.confidence ? confidenceLabel(classification.confidence, t) : null;
  const sizing = size === "sm" ? "gap-1 px-2 py-0.5 text-[10.5px]" : "gap-1.5 px-2.5 py-1 text-xs";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-verdict={classification.verdict}
          className={`inline-flex cursor-help items-center whitespace-nowrap rounded-full border font-bold leading-none select-none ${sizing} ${classes} ${className}`}
        >
          <Icon className={size === "sm" ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden="true" />
          <span>{label}</span>
          {confidence && <span className="font-semibold opacity-80">· {confidence}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1 bg-popover p-2.5 text-xs text-popover-foreground">
        <ul className="list-disc space-y-1 pl-4">
          {classification.reasons.map((code) => (
            <li key={code}>{reasonText(code, t, unit)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/** The reasons behind a verdict as visible text (detail page, expanded cards). */
export function TrendReasons({ classification, className = "" }: { classification: TrendClassification; className?: string }) {
  const { t } = useI18n();
  if (classification.reasons.length === 0) return null;
  return (
    <ul className={`space-y-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400 ${className}`}>
      {classification.reasons.map((code) => (
        <li key={code}>{reasonText(code, t)}</li>
      ))}
    </ul>
  );
}

/** Link to a section of the documentation; by default the "decision rules" of the verdict. */
export function TrendHowLink({ section = DOCS_SECTIONS.trendVerdict, anchor = "rules", label, className = "" }: {
  section?: Parameters<typeof docsPath>[0];
  anchor?: string;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={docsPath(section, anchor || undefined)}
      onClick={(event) => event.stopPropagation()}
      className={`text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400 ${className}`}
    >
      {label ?? t("How it is calculated")}
    </Link>
  );
}

export function formatRelativeChange(classification: TrendClassification, t: Translate): string | null {
  const value = classification.relativeChangePct;
  if (value === null || !Number.isFinite(value)) return null;
  return t("{{value}}% per year", { value: formatSigned(value, 1) });
}

export function formatDataLine(classification: TrendClassification, source: TrendDataSource | undefined, t: Translate): string {
  const values = { years: classification.yearsUsed, papers: formatNumber(classification.totalPapers) };
  if (source === "openalex") return t("Source: OpenAlex · {{years}} complete years · {{papers}} papers", values);
  if (source === "local") return t("Source: local corpus · {{years}} complete years · {{papers}} papers", values);
  return t("{{years}} complete years · {{papers}} papers", values);
}

/** Primary number (relative change per year) and a one-line data note. */
export function TrendFigures({
  classification,
  source,
  className = "",
}: {
  classification: TrendClassification;
  source?: TrendDataSource;
  className?: string;
}) {
  const { t } = useI18n();
  const relative = formatRelativeChange(classification, t);
  return (
    <div className={`space-y-1 ${className}`}>
      {classification.verdict === "insufficient" ? (
        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{t("Descriptive only: no trend conclusion")}</p>
      ) : (
        <p className="text-lg font-black leading-tight text-slate-900 dark:text-white" title={t("Relative change of the topic's share, per year")}>
          {relative ?? "—"}
        </p>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDataLine(classification, source, t)}</p>
    </div>
  );
}

/** One plain-language sentence on what a trend means, with a link to the docs for the formulas. */
export function TrendIntro({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={`text-xs leading-relaxed text-slate-500 dark:text-slate-400 ${className}`}>
      {t("A trend means a topic's share of its field rose or fell clearly over recent years. The percentage is the change per year.")}{" "}
      <TrendHowLink className="whitespace-nowrap" />
    </p>
  );
}
