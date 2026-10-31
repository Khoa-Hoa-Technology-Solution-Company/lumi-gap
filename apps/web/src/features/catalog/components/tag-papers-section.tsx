import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { PaperTagSource, TaggedPaper, TagDetail } from "@trend/shared-types";
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
import { useI18n } from "@/i18n";
import { useDelayedTagRefresh, useRemoveTagPaper, useTagPapers, useUnblockTagPaper } from "../hooks/use-tags";
import { AddPapersDialog } from "./add-papers-dialog";
import { SOURCE_LABELS, SourceBadge } from "./catalog-badges";
import { apiErr, ErrorState, PaginationBar, TableMessageRow, TableSkeletonRows } from "./catalog-ui";

const SOURCE_FILTERS: Array<PaperTagSource | "all"> = ["all", "rule", "embedding", "manual", "blocked"];

export function TagPapersSection({ tag }: { tag: TagDetail }) {
  const { t } = useI18n();
  const [source, setSource] = useState<PaperTagSource | "all">("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const remove = useRemoveTagPaper();
  const unblock = useUnblockTagPaper();
  const scheduleRefresh = useDelayedTagRefresh();

  useEffect(() => setPage(1), [source, q]);

  const papers = useTagPapers(tag.id, {
    ...(source !== "all" ? { source } : {}),
    ...(q ? { q } : {}),
    page,
    pageSize: 20,
  });
  const rows = papers.data?.data;

  async function removePaper(paper: TaggedPaper) {
    try {
      const result = await remove.mutateAsync({ id: tag.id, paperId: paper.paperId });
      toast.success(result.source === "blocked" ? t("Paper blocked from this tag.") : t("Paper removed from this tag."));
      scheduleRefresh();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  async function unblockPaper(paper: TaggedPaper) {
    try {
      await unblock.mutateAsync({ id: tag.id, paperId: paper.paperId });
      toast.success(t("Paper unblocked. It is being re-evaluated in the background."));
      scheduleRefresh();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  const removeHint = (paper: TaggedPaper) =>
    paper.source === "manual"
      ? t("Removes the manually added paper from this tag.")
      : t("Blocks this paper so automatic tagging does not add it back.");

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="tag-papers-heading">
      <div className="flex flex-col gap-3 border-b p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="tag-papers-heading" className="text-lg font-semibold">{t("Papers")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("Rule and embedding papers are removed by blocking them; manual papers are simply removed.")}
            </p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={tag.status === "archived"}>
            <Plus className="h-4 w-4" />
            {t("Add papers")}
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div role="group" aria-label={t("Filter by source")} className="flex flex-wrap gap-1.5">
            {SOURCE_FILTERS.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={item === source ? "default" : "outline"}
                aria-pressed={item === source}
                onClick={() => setSource(item)}
              >
                {item === "all" ? t("All") : t(SOURCE_LABELS[item])}
              </Button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("Search tagged papers")}
              placeholder={t("Search by title…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {papers.isError ? (
        <ErrorState onRetry={() => papers.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Title")}</TableHead>
                <TableHead>{t("Year")}</TableHead>
                <TableHead className="text-right">{t("Citations")}</TableHead>
                <TableHead>{t("Source")}</TableHead>
                <TableHead className="text-right">{t("Confidence")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {papers.isLoading ? (
                <TableSkeletonRows columns={6} />
              ) : rows?.length ? (
                rows.map((paper) => (
                  <TableRow key={paper.paperId}>
                    <TableCell className="max-w-[380px]">
                      <Link to={`/papers/${paper.paperId}`} className="break-words font-medium hover:underline">{paper.title}</Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{paper.publicationYear}</TableCell>
                    <TableCell className="text-right tabular-nums">{paper.citationCount.toLocaleString("en")}</TableCell>
                    <TableCell><SourceBadge source={paper.source} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {paper.source === "embedding" && paper.confidence !== null
                        ? `${Math.round(paper.confidence * 100)}%`
                        : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {paper.source === "blocked" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("Lets automatic tagging consider this paper again.")}
                          aria-label={t("Unblock {{title}}", { title: paper.title })}
                          disabled={unblock.isPending}
                          onClick={() => unblockPaper(paper)}
                        >
                          <Undo2 className="h-4 w-4" />
                          {t("Unblock")}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          title={removeHint(paper)}
                          aria-label={t("Remove {{title}} from this tag", { title: paper.title })}
                          disabled={remove.isPending}
                          onClick={() => removePaper(paper)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("Remove")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableMessageRow columns={6}>
                  {source === "all" && !q
                    ? t("No papers carry this tag yet. Add rules or add papers by hand.")
                    : t("No papers match the current filters.")}
                </TableMessageRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationBar meta={papers.data?.meta} page={page} onPage={setPage} isFetching={papers.isFetching} noun="papers" />

      <AddPapersDialog tagId={tag.id} tagName={tag.name} open={addOpen} onOpenChange={setAddOpen} />
    </section>
  );
}
