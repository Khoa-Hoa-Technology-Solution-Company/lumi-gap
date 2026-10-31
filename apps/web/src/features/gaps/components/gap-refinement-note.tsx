import { Link } from "react-router-dom";
import { CircleSlash, ListChecks, Scissors } from "lucide-react";
import type { GapRefinement, GapSupportingPaper } from "@trend/shared-types";
import { useI18n } from "@/i18n";

/** What the self-check did with this gap after reading the papers that may already answer it. */
export function GapRefinementNote({ refinement, papers }: { refinement?: GapRefinement; papers?: GapSupportingPaper[] }) {
  const { t } = useI18n();
  if (!refinement) return null;
  if (refinement.action === "drop") {
    const paper = papers?.find((item) => item.id === refinement.answeredByPaperId);
    return (
      <div className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        <p className="flex items-center gap-1.5 font-semibold"><CircleSlash className="h-3.5 w-3.5" />{t("Removed by the self-check: a paper already answers this gap")}</p>
        {paper && <p><Link to={`/papers/${paper.id}`} className="font-semibold underline">{paper.title}</Link>{paper.publicationYear ? ` (${paper.publicationYear})` : ""}</p>}
        {refinement.quote && <blockquote className="border-l-2 border-rose-300 pl-2 italic">&ldquo;{refinement.quote}&rdquo;</blockquote>}
        {refinement.reason && <p>{refinement.reason}</p>}
      </div>
    );
  }
  if (refinement.action === "narrow") {
    return (
      <details className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        <summary className="flex cursor-pointer items-center gap-1.5 font-semibold"><Scissors className="h-3.5 w-3.5" />{t("Narrowed by the self-check after reading {{count}} related papers", { count: refinement.counterCount })}</summary>
        {refinement.reason && <p className="mt-2">{refinement.reason}</p>}
        {refinement.original && <p className="mt-2 opacity-80"><strong>{t("Originally proposed:")}</strong> {refinement.original.title}. {refinement.original.description}</p>}
      </details>
    );
  }
  return (
    <p className="flex items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300">
      <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{t("Checked against {{count}} related papers: none answers this gap.", { count: refinement.counterCount })}{refinement.reason ? ` ${refinement.reason}` : ""}</span>
    </p>
  );
}
