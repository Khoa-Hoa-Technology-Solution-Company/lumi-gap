import type { AcademicPageMeta } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export function MentorSearchPagination({ meta, busy, onPage, onPageSize }: { meta: AcademicPageMeta; busy: boolean; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const { t } = useI18n();
  if (!meta.total) return null;
  const last = Math.max(1, meta.totalPages), page = Math.min(meta.page, last);
  // Keep the control bounded even when the directory has thousands of pages.
  const pages = [...new Set([1, page - 1, page, page + 1, last])].filter(value => value >= 1 && value <= last).sort((a, b) => a - b);
  return <nav className="mentor-search-pagination" aria-label={t("Mentor pagination")}>
    <div className="mentor-pagination-summary"><span role="status">{t("Showing {{from}}–{{to}} of {{total}} mentors", { from: (page - 1) * meta.pageSize + 1, to: Math.min(page * meta.pageSize, meta.total), total: meta.total })}</span>
      <label>{t("Mentors per page")}<select value={meta.pageSize} disabled={busy} onChange={event => onPageSize(Number(event.target.value))}>{[6, 12, 24].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    </div>
    <div className="mentor-pagination-pages">
      <Button type="button" size="sm" variant="outline" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{t("Previous")}</Button>
      {pages.map((value, index) => <span key={value} className="mentor-pagination-page">{index > 0 && value - pages[index - 1]! > 1 && <span aria-hidden="true">…</span>}<Button type="button" size="sm" variant={value === page ? "default" : "ghost"} aria-label={t("Page {{page}}", { page: value })} aria-current={value === page ? "page" : undefined} disabled={busy} onClick={() => onPage(value)}>{value}</Button></span>)}
      <Button type="button" size="sm" variant="outline" disabled={busy || page >= last} onClick={() => onPage(page + 1)}>{t("Next")}</Button>
    </div>
  </nav>;
}
