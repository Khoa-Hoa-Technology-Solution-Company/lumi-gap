import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";

/**
 * Shown while a new year window or scope is loading and the page still displays the previous result
 * (react-query keeps it as placeholder data). States which years the visible figures belong to, so nobody reads
 * them as the answer for the new selection.
 */
export function StaleDataNotice({ requested, shown }: { requested: { yearFrom: number; yearTo: number }; shown: { yearFrom: number; yearTo: number } }) {
  const { t } = useI18n();
  const sameYears = requested.yearFrom === shown.yearFrom && requested.yearTo === shown.yearTo;
  return (
    <div role="status" aria-live="polite" className="sticky top-2 z-20 mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-md dark:border-amber-700/60 dark:bg-amber-950/80 dark:text-amber-100">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-bold">{t("Loading trends for {{yearFrom}}–{{yearTo}}…", requested)}</p>
        <p className="text-xs">
          {sameYears
            ? t("The figures below are for the previous filters and are replaced when loading finishes.")
            : t("The figures below are still for {{yearFrom}}–{{yearTo}} and are replaced when loading finishes.", shown)}{" "}
          {t("A scope used for the first time is computed from OpenAlex and can take up to about 20 seconds.")}
        </p>
      </div>
    </div>
  );
}
