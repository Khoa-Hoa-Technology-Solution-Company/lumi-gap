import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, Search, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import type { TagStatus } from "@trend/shared-types";
import { PageHeader } from "@/components/page-header";
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
import { StatusBadge } from "@/features/catalog/components/catalog-badges";
import {
  apiErr,
  ErrorState,
  formatDate,
  PaginationBar,
  SELECT_CLASS,
  TableMessageRow,
  TableSkeletonRows,
} from "@/features/catalog/components/catalog-ui";
import { CreateTagDialog } from "@/features/catalog/components/tag-dialogs";
import { useAdminTags, useApplyAllTags } from "@/features/catalog/hooks/use-tags";
import { useI18n } from "@/i18n";

export function AdminTagsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<TagStatus>("active");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const applyAll = useApplyAllTags();

  useEffect(() => setPage(1), [q, status]);

  const tags = useAdminTags({ ...(q ? { q } : {}), status, page, pageSize: 20 });
  const rows = tags.data?.data;
  const filtered = Boolean(q) || status !== "active";

  async function retagAll() {
    try {
      await applyAll.mutateAsync();
      toast.success(t("Re-tagging every tag in the background. Paper counts update in a few seconds."));
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <main className="space-y-6">
      <PageHeader
        title="Tags"
        description="Curated tags group papers by rules over taxonomy topics and keywords, expanded by embedding similarity."
        actions={(
          <>
            <Button variant="outline" onClick={retagAll} disabled={applyAll.isPending}>
              <RefreshCw className="h-4 w-4" />
              {applyAll.isPending ? t("Starting…") : t("Re-tag all")}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("New tag")}
            </Button>
          </>
        )}
      />

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search tags")}
              placeholder={t("Search by name or slug…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <select
            aria-label={t("Filter by status")}
            className={SELECT_CLASS}
            value={status}
            onChange={(event) => setStatus(event.target.value as TagStatus)}
          >
            <option value="active">{t("Active")}</option>
            <option value="archived">{t("Archived")}</option>
          </select>
        </div>

        {tags.isError ? (
          <ErrorState onRetry={() => tags.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Tag")}</TableHead>
                  <TableHead>{t("Slug")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-right">{t("Papers")}</TableHead>
                  <TableHead className="text-right">{t("Rules")}</TableHead>
                  <TableHead>{t("Updated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.isLoading ? (
                  <TableSkeletonRows columns={6} />
                ) : rows?.length ? (
                  rows.map((tag) => (
                    <TableRow key={tag.id}>
                      <TableCell className="max-w-[300px]">
                        <Link to={`/admin/tags/${tag.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 shrink-0 rounded-full border"
                            style={{ backgroundColor: tag.color ?? "transparent" }}
                          />
                          <span className="break-words">{tag.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{tag.slug}</TableCell>
                      <TableCell><StatusBadge status={tag.status} /></TableCell>
                      <TableCell className="text-right tabular-nums">{tag.paperCount.toLocaleString("en")}</TableCell>
                      <TableCell className="text-right tabular-nums">{tag.ruleCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(tag.updatedAt)}</TableCell>
                    </TableRow>
                  ))
                ) : filtered ? (
                  <TableMessageRow columns={6}>{t("No tags match the current filters.")}</TableMessageRow>
                ) : (
                  <TableMessageRow columns={6}>
                    <div className="flex flex-col items-center gap-3">
                      <TagIcon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
                      <p>{t("No tags yet. Create the first one to start grouping papers.")}</p>
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t("New tag")}
                      </Button>
                    </div>
                  </TableMessageRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar meta={tags.data?.meta} page={page} onPage={setPage} isFetching={tags.isFetching} noun="tags" />
      </section>

      <CreateTagDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
