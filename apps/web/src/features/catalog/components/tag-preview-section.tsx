import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useTagPreview } from "../hooks/use-tags";
import { ErrorState } from "./catalog-ui";

/** Matches of the saved rules (before embedding expansion and manual picks). */
export function TagPreviewSection({ tagId }: { tagId: string }) {
  const { t } = useI18n();
  const preview = useTagPreview(tagId);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="tag-preview-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="tag-preview-heading" className="text-lg font-semibold">{t("Preview")}</h2>
          <p className="text-sm text-muted-foreground">{t("Papers the saved rules match right now.")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => preview.refetch()} disabled={preview.isFetching}>
          <RefreshCw className={`h-4 w-4 ${preview.isFetching ? "animate-spin" : ""}`} />
          {t("Refresh preview")}
        </Button>
      </div>

      {preview.isError ? (
        <ErrorState onRetry={() => preview.refetch()} />
      ) : preview.isLoading || !preview.data ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums">
            {preview.data.matchedPapers.toLocaleString("en")}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{t("matching papers")}</span>
          </p>
          {preview.data.sample.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No papers match yet. Add an include rule.")}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {preview.data.sample.map((paper) => (
                <li key={paper.id} className="flex items-start gap-2">
                  <Link to={`/papers/${paper.id}`} className="min-w-0 flex-1 break-words hover:underline">{paper.title}</Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{paper.publicationYear}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
