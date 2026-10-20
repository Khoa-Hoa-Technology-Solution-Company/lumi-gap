import type { ClosureQueryLog } from "@trend/shared-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Every query that ran, with source, time, result count and the error when it failed. */
export function ClosureSearchLog({ queries }: { queries: ClosureQueryLog[] }) {
  const { t } = useI18n();
  const failed = queries.filter((query) => query.error).length;
  if (queries.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">{t("No query has run yet.")}</p>;
  }
  return (
    <div className="space-y-2">
      {failed > 0 && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {t("{{count}} search(es) failed. A failed search can hide a paper that answers the question, so the check cannot certify the gap as open.", { count: failed })}
        </p>
      )}
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>{t("Source")}</TableHead>
            <TableHead>{t("Query")}</TableHead>
            <TableHead>{t("Time")}</TableHead>
            <TableHead className="text-right">{t("Results")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queries.map((query, index) => (
            <TableRow key={`${query.source}-${index}`} className={cn(query.error && "bg-rose-50/70 dark:bg-rose-500/10")}>
              <TableCell className="whitespace-nowrap font-semibold">{query.source === "LOCAL" ? t("LumiGap corpus") : t("OpenAlex")}</TableCell>
              <TableCell className="min-w-40 break-words">
                {query.query}
                {query.error && <span className="mt-1 block font-semibold text-rose-700 dark:text-rose-300">{query.error}</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-slate-500">{formatTime(query.executedAt)}</TableCell>
              <TableCell className="text-right font-semibold">{query.error ? "-" : query.resultCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
