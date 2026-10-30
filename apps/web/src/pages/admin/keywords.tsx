import { useDeferredValue, useEffect, useState } from "react";
import { DatabaseZap, GitMerge, Pencil, Search } from "lucide-react";
import type { CatalogKeyword, KeywordStatus } from "@trend/shared-types";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BackfillDialog, type BackfillTarget } from "@/features/catalog/components/backfill-dialog";
import { BackfillRunWatcher } from "@/features/catalog/components/backfill-runs-section";
import { AliasBadges, StatusBadge } from "@/features/catalog/components/catalog-badges";
import {
  ErrorState,
  PaginationBar,
  SELECT_CLASS,
  TableMessageRow,
  TableSkeletonRows,
} from "@/features/catalog/components/catalog-ui";
import { EditKeywordDialog, MergeKeywordDialog } from "@/features/catalog/components/keyword-dialogs";
import { useCatalogKeywords } from "@/features/catalog/hooks/use-taxonomy";
import { useI18n } from "@/i18n";

type Sort = "paperCount" | "name";

export function AdminKeywordsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<KeywordStatus>("active");
  const [sort, setSort] = useState<Sort>("paperCount");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CatalogKeyword>();
  const [merging, setMerging] = useState<CatalogKeyword>();
  const [fetching, setFetching] = useState<BackfillTarget>();
  const [watchedRunId, setWatchedRunId] = useState<string>();

  useEffect(() => setPage(1), [q, status, sort]);

  const keywords = useCatalogKeywords({ ...(q ? { q } : {}), status, sort, page, pageSize: 20 });
  const rows = keywords.data?.data;

  return (
    <main className="space-y-6">
      <PageHeader
        title="Keywords"
        description="Clean up the keyword catalogue: rename, add aliases, hide noise and merge duplicates."
      />

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search keywords")}
              placeholder={t("Search keywords…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <select
            aria-label={t("Filter by status")}
            className={SELECT_CLASS}
            value={status}
            onChange={(event) => setStatus(event.target.value as KeywordStatus)}
          >
            <option value="active">{t("Active")}</option>
            <option value="hidden">{t("Hidden")}</option>
            <option value="merged">{t("Merged")}</option>
          </select>
          <select aria-label={t("Sort keywords")} className={SELECT_CLASS} value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="paperCount">{t("Most papers")}</option>
            <option value="name">{t("Name")}</option>
          </select>
        </div>

        {keywords.isError ? (
          <ErrorState onRetry={() => keywords.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Keyword")}</TableHead>
                  <TableHead>{t("Normalized name")}</TableHead>
                  <TableHead className="text-right">{t("Papers")}</TableHead>
                  <TableHead>{t("Aliases")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.isLoading ? (
                  <TableSkeletonRows columns={6} />
                ) : rows?.length ? (
                  rows.map((keyword) => (
                    <TableRow key={keyword.id}>
                      <TableCell className="max-w-[260px] font-medium">{keyword.keywordName}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">{keyword.normalizedName}</TableCell>
                      <TableCell className="text-right tabular-nums">{keyword.paperCount.toLocaleString("en")}</TableCell>
                      <TableCell><AliasBadges aliases={keyword.aliases} /></TableCell>
                      <TableCell>
                        {keyword.status === "merged" ? (
                          <Badge variant="outline" className="font-normal" title={keyword.mergedIntoId ?? undefined}>
                            {keyword.mergedIntoId
                              ? t("Merged into #{{id}}", { id: keyword.mergedIntoId.slice(0, 8) })
                              : t("Merged")}
                          </Badge>
                        ) : (
                          <StatusBadge status={keyword.status} />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {keyword.status === "merged" ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" aria-label={t("Edit keyword {{name}}", { name: keyword.keywordName })} onClick={() => setEditing(keyword)}>
                              <Pencil className="h-4 w-4" />
                              {t("Edit")}
                            </Button>
                            {keyword.status === "active" ? (
                              <Button variant="ghost" size="sm" aria-label={t("Merge keyword {{name}}", { name: keyword.keywordName })} onClick={() => setMerging(keyword)}>
                                <GitMerge className="h-4 w-4" />
                                {t("Merge")}
                              </Button>
                            ) : null}
                            {keyword.status === "active" ? (
                              <Button variant="ghost" size="sm" aria-label={t("Fetch papers for keyword {{name}}", { name: keyword.keywordName })} onClick={() => setFetching({ kind: "keyword", id: keyword.id, name: keyword.keywordName })}>
                                <DatabaseZap className="h-4 w-4" />
                                {t("Fetch")}
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableMessageRow columns={6}>{t("No keywords match the current filters.")}</TableMessageRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar meta={keywords.data?.meta} page={page} onPage={setPage} isFetching={keywords.isFetching} noun="keywords" />
      </section>

      <EditKeywordDialog keyword={editing} onClose={() => setEditing(undefined)} />
      <MergeKeywordDialog keyword={merging} onClose={() => setMerging(undefined)} />
      <BackfillDialog target={fetching} onClose={() => setFetching(undefined)} onStarted={(run) => setWatchedRunId(run.id)} />
      <BackfillRunWatcher runId={watchedRunId} />
    </main>
  );
}
