import { AlertTriangle, Database, Info } from "lucide-react";
import type { TrendDataProvenance, TrendDataSource, TrendScopeNotice } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { ignoredFilterLabel } from "../trend-source";

/** Says where the numbers come from and, for OpenAlex, when they were fetched.
 *  Renders nothing when the backend does not report a source (older API
 *  responses). */
export function DataSourceBadge({ source, provenance, className = "" }: { source?: TrendDataSource; provenance?: TrendDataProvenance; className?: string }) {
  const { t, language } = useI18n();
  if (!source) return null;
  const openalex = source === "openalex";
  const fetchedAt = openalex && provenance?.fetchedAt ? new Date(provenance.fetchedAt) : null;
  const fetchedLabel = fetchedAt && !Number.isNaN(fetchedAt.getTime())
    ? t("OpenAlex data fetched {{date}}", { date: fetchedAt.toLocaleString(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }) })
    : null;
  const tone = openalex
    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300"
    : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300";
  return (
    <span
      role={openalex ? undefined : "status"}
      title={openalex
        ? t("Counts come from OpenAlex aggregate queries over every indexed work, not from the local corpus.")
        : t("OpenAlex could not be reached, so these numbers come from the smaller local corpus and may be incomplete.")}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold select-none ${tone} ${className}`}
    >
      {openalex ? <Database className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
      {openalex ? t("Data: OpenAlex (whole database)") : t("Data: local corpus (OpenAlex unavailable)")}
      {fetchedLabel ? <span className="font-medium opacity-80">· {fetchedLabel}</span> : null}
    </span>
  );
}

/** Lists the Data Scope filters the data source could not apply. */
export function ScopeNotice({ notice, className = "" }: { notice?: TrendScopeNotice; className?: string }) {
  const { t } = useI18n();
  const items = notice?.ignoredFilters ?? [];
  if (items.length === 0) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200 ${className}`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="space-y-1">
        <p className="font-bold">{t("These Data Scope filters are not applied to the OpenAlex counts:")}</p>
        <ul className="space-y-0.5 font-medium">
          {items.map((item) => (
            <li key={`${item.filter}:${item.values.join("|")}`}>
              <strong>{t(ignoredFilterLabel(item.filter))}</strong>: {item.values.join(", ")} — {item.reason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
