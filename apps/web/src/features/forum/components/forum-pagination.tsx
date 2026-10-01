import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { FORUM_PAGE_SIZES, forumPageNumbers } from "../utils/forum-pagination";
import { formatForumNumber } from "../utils/forum-helpers";

export function ForumPagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange }: {
  page: number; pageSize: number; total: number; totalPages: number;
  onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void;
}) {
  const { t, language } = useI18n();
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3 text-base text-muted-foreground">
        <span>{formatForumNumber(total, language)} {t("discussions")}</span>
        <label className="flex items-center gap-2">
          {t("Per page")}
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-11 rounded-md border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {FORUM_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <nav aria-label={t("Topic pagination")} className="flex max-w-full flex-wrap items-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-11 min-w-11 gap-1 px-3 text-base" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">{t("Previous")}</span><span className="sr-only sm:hidden">{t("Previous")}</span></Button>
        {forumPageNumbers(page, totalPages).map((item) => typeof item === "number" ? (
          <Button key={item} variant={item === page ? "secondary" : "ghost"} size="sm" className="h-11 min-w-11 px-3 text-base tabular-nums" aria-label={`${t("Page")} ${item}`} aria-current={item === page ? "page" : undefined} onClick={() => onPageChange(item)}>{item}</Button>
        ) : <span key={item} aria-hidden="true" className="px-1 text-muted-foreground">…</span>)}
        <Button variant="ghost" size="sm" className="h-11 min-w-11 gap-1 px-3 text-base" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><span className="hidden sm:inline">{t("Next")}</span><span className="sr-only sm:hidden">{t("Next")}</span><ChevronRight className="h-4 w-4" /></Button>
      </nav>
    </footer>
  );
}
