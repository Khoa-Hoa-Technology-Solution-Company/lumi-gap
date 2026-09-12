import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, ArrowRight } from "lucide-react";
import type { GapSupportingPaper } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils/format";

interface SupportingPaperListProps {
  papers?: GapSupportingPaper[];
  totalPaperCount?: number;
  max?: number;
}

export function SupportingPaperList({ papers = [], totalPaperCount = 0, max = 2 }: SupportingPaperListProps) {
  const { t } = useI18n();
  if (papers.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic">
        {t("No supporting papers attached")}
      </div>
    );
  }

  // Display max papers inline
  const visiblePapers = papers.slice(0, max);
  const remainingCount = totalPaperCount > max ? totalPaperCount - max : papers.length > max ? papers.length - max : 0;

  return (
    <div className="space-y-2.5">
      <span className="font-bold text-slate-700 dark:text-slate-300 text-xs block mb-1.5 flex items-center gap-1.5">
        <BookOpen className="w-3.5 h-3.5 text-slate-400" /> {t("Supporting papers:")}
      </span>
      <div className="space-y-2">
        {visiblePapers.map((paper) => (
          <div
            key={paper.id}
            className="flex items-start justify-between gap-3 text-xs p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Link
                to={`/papers/${paper.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-start gap-1 group leading-snug break-words max-w-full"
              >
                <span>{paper.title}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </Link>
              <div className="flex flex-wrap gap-x-3 text-[10px] text-slate-500 dark:text-slate-500 font-semibold">
                {paper.publicationYear && <span>{paper.publicationYear}</span>}
                {paper.journalName && <span>{paper.journalName}</span>}
                {paper.citationCount !== undefined && <span>{formatNumber(paper.citationCount)} {t("citations")}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {remainingCount > 0 && (
        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 px-2.5 py-1 rounded-lg border border-blue-100/50 dark:border-blue-900/30">
          <span>{t("+{{count}} more supporting papers", { count: remainingCount })}</span>
        </div>
      )}
    </div>
  );
}
