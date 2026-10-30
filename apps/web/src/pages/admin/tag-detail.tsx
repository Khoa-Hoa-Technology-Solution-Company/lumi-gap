import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArchiveRestore, ArrowLeft, Archive, CalendarClock, DatabaseZap, Pencil, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BackfillDialog } from "@/features/catalog/components/backfill-dialog";
import { BackfillRunsSection } from "@/features/catalog/components/backfill-runs-section";
import { StatusBadge } from "@/features/catalog/components/catalog-badges";
import { apiErr, ErrorState } from "@/features/catalog/components/catalog-ui";
import { EditTagDialog, RETAG_TOAST } from "@/features/catalog/components/tag-dialogs";
import { TagCampaignDialog } from "@/features/catalog/components/tag-campaign-dialog";
import { TagCampaignsSection } from "@/features/catalog/components/tag-campaigns-section";
import { TagPapersSection } from "@/features/catalog/components/tag-papers-section";
import { TagPreviewSection } from "@/features/catalog/components/tag-preview-section";
import { TagRulesSection } from "@/features/catalog/components/tag-rules-section";
import {
  useAdminTag,
  useApplyTag,
  useArchiveTag,
  useDelayedTagRefresh,
  useUpdateTag,
} from "@/features/catalog/hooks/use-tags";
import { tagSearchHref } from "@/features/catalog/utils/tag-rules";
import { useI18n } from "@/i18n";

export function AdminTagDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const query = useAdminTag(id);
  const [editOpen, setEditOpen] = useState(false);
  const [fetchOpen, setFetchOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const apply = useApplyTag();
  const archive = useArchiveTag();
  const update = useUpdateTag();
  const scheduleRefresh = useDelayedTagRefresh();
  const tag = query.data;

  async function retag() {
    if (!tag) return;
    try {
      await apply.mutateAsync(tag.id);
      toast.success(t("Re-tagging started in the background. Paper counts update in a few seconds."));
      scheduleRefresh();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  async function toggleArchive() {
    if (!tag) return;
    try {
      if (tag.status === "archived") {
        await update.mutateAsync({ id: tag.id, input: { status: "active" } });
        toast.success(t(RETAG_TOAST));
      } else {
        await archive.mutateAsync(tag.id);
        toast.success(t("Tag archived."));
      }
      scheduleRefresh();
    } catch (error) {
      toast.error(t(apiErr(error)));
    }
  }

  return (
    <main className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/admin/tags">
          <ArrowLeft className="h-4 w-4" />
          {t("All tags")}
        </Link>
      </Button>

      {query.isError ? (
        <div className="rounded-xl border bg-card"><ErrorState onRetry={() => query.refetch()} message={t("Could not load this tag.")} /></div>
      ) : !tag ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-1/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <header className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded-full border"
                  style={{ backgroundColor: tag.color ?? "transparent" }}
                />
                <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{tag.name}</h1>
                <StatusBadge status={tag.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{tag.slug}</span>
                {" · "}
                {t("{{count}} papers", { count: tag.paperCount.toLocaleString("en") })}
                {" · "}
                {t("{{count}} rules", { count: tag.ruleCount })}
              </p>
              {tag.description ? <p className="max-w-2xl text-sm">{tag.description}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                {t("Edit")}
              </Button>
              <Button variant="outline" size="sm" onClick={retag} disabled={apply.isPending || tag.status === "archived"}>
                <RefreshCw className="h-4 w-4" />
                {t("Re-tag now")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFetchOpen(true)} disabled={tag.status === "archived"}>
                <DatabaseZap className="h-4 w-4" />
                {t("Fetch from OpenAlex")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCampaignOpen(true)} disabled={tag.status === "archived"}>
                <CalendarClock className="h-4 w-4" />
                {t("Plan campaign")}
              </Button>
              <Button variant="outline" size="sm" onClick={toggleArchive} disabled={archive.isPending || update.isPending}>
                {tag.status === "archived" ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {tag.status === "archived" ? t("Restore") : t("Archive")}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={tagSearchHref(tag)}>
                  <Search className="h-4 w-4" />
                  {t("Search with this tag")}
                </Link>
              </Button>
            </div>
          </header>

          <TagRulesSection key={tag.id} tag={tag} />
          <TagPreviewSection tagId={tag.id} />
          <BackfillRunsSection targetKind="tag" targetId={tag.id} />
          <TagCampaignsSection tagId={tag.id} />
          <TagPapersSection tag={tag} />
          <EditTagDialog tag={tag} open={editOpen} onOpenChange={setEditOpen} />
          <BackfillDialog
            target={fetchOpen ? { kind: "tag", id: tag.id, name: tag.name } : undefined}
            onClose={() => setFetchOpen(false)}
          />
          <TagCampaignDialog
            tag={campaignOpen ? { id: tag.id, name: tag.name } : undefined}
            onClose={() => setCampaignOpen(false)}
          />
        </>
      )}
    </main>
  );
}
