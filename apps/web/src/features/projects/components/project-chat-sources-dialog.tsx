import { Link } from "react-router-dom";
import type { ProjectChatCitation, ProjectChatSourcesOverview } from "@trend/shared-types";
import { AlertCircle, BookOpen, Clipboard, ExternalLink, FileText, Library, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

export function sourceCoverageLabel(sourceKind: ProjectChatCitation["sourceKind"], t: (key: string) => string): string {
  if (sourceKind === "FULLTEXT") return t("Full-text Excerpt");
  if (sourceKind === "METADATA") return t("Metadata only");
  return t("Abstract");
}

function formatBibliographicCitation(citation: ProjectChatCitation): string {
  const authors = citation.authors.length ? citation.authors.slice(0, 5).join(", ") : "Unknown authors";
  const year = citation.publicationYear ? ` (${citation.publicationYear})` : "";
  const venue = citation.journalName ? `. ${citation.journalName}` : "";
  const doi = citation.doi ? `. DOI: ${citation.doi}` : "";
  return `${authors}${year}. ${citation.title}${venue}${doi}`;
}

export function ProjectChatSourcesDialog({
  open,
  onOpenChange,
  projectId,
  sources,
  isLoading,
  isError,
  onRetry,
  onAddPapers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sources?: ProjectChatSourcesOverview;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onAddPapers?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t("Close")} data-no-i18n>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Library className="h-4.5 w-4.5 text-primary shrink-0" aria-hidden="true" />
            <span>{t("Research Sources")}</span>
          </DialogTitle>
          <DialogDescription>
            {t("LumiGap AI helps you understand and cross-check research papers within the project's available sources.")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">{t("Loading…")}</p>
        ) : isError || !sources ? (
          <div role="alert" className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>{t("Could not load this conversation")}</p>
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t("Try again")}</Button>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {sources.aiDataPolicy === "DISABLED" ? (
              <div role="status" className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t("AI processing is disabled by this project's security policy.")}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-border/80 bg-muted/25 p-3">
                <p className="text-xs text-muted-foreground">{t("Project library")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{sources.totalLibraryCount}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-muted/25 p-3">
                <p className="text-xs text-muted-foreground">{t("Eligible for AI retrieval")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{sources.eligibleCount}</p>
                {sources.excludedCount > 0 ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {sources.excludedCount} {t("Excluded from retrieval").toLowerCase()}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-border/80 bg-card p-3.5 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Source Coverage")}
              </h4>
              <dl className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t("Indexed full-text")}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{sources.coverage.fullTextIndexed}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t("Abstract available")}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{sources.coverage.abstractAvailable}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t("Metadata only")}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{sources.coverage.metadataOnly}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers`} onClick={() => onOpenChange(false)}>
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("View in project library")}</span>
                </Link>
              </Button>
              {sources.eligibleCount === 0 && onAddPapers ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onAddPapers();
                  }}
                >
                  {t("Add research papers")}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProjectChatCitationPreviewDialog({
  citation,
  projectId,
  onClose,
}: {
  citation: ProjectChatCitation | null;
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={Boolean(citation)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg" closeLabel={t("Close")} data-no-i18n>
        {citation ? (
          <>
            <DialogHeader className="space-y-1.5 pr-6">
              <div className="flex flex-wrap items-center gap-1.5">
                {citation.citationNumber !== null ? (
                  <Badge variant="secondary" className="font-mono text-xs">[{citation.citationNumber}]</Badge>
                ) : null}
                <Badge variant="outline" className="text-xs font-normal">
                  {sourceCoverageLabel(citation.sourceKind, t)}
                </Badge>
                {citation.pageNumber ? (
                  <Badge variant="outline" className="text-xs font-normal">
                    {t("Page {{page}}", { page: citation.pageNumber })}
                  </Badge>
                ) : null}
                {!citation.available ? (
                  <Badge variant="destructive" className="text-xs font-normal">
                    {t("Source unavailable")}
                  </Badge>
                ) : null}
              </div>
              <DialogTitle className="text-base leading-snug text-left">
                {citation.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-left">
                {[
                  citation.authors.length ? citation.authors.slice(0, 5).join(", ") : null,
                  citation.publicationYear ? String(citation.publicationYear) : null,
                  citation.journalName,
                ].filter(Boolean).join(" · ") || t("Source details")}
              </DialogDescription>
            </DialogHeader>

            {!citation.available ? (
              <div role="status" className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3.5 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t("This paper was removed from the project or is no longer accessible.")}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {citation.doi ? (
                  <p className="text-xs text-muted-foreground break-all">
                    DOI: <span className="font-mono text-foreground">{citation.doi}</span>
                  </p>
                ) : null}

                {citation.excerpt ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {sourceCoverageLabel(citation.sourceKind, t)}
                    </p>
                    <blockquote className="max-h-56 overflow-y-auto rounded-lg border border-border/80 bg-muted/25 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                      {citation.excerpt}
                    </blockquote>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                  <Button asChild size="sm" variant="default" className="gap-1.5">
                    <Link to={`/papers/${encodeURIComponent(citation.paperId)}`} onClick={onClose}>
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t("Open paper")}</span>
                      <ExternalLink className="h-3 w-3 opacity-75" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers`} onClick={onClose}>
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t("View in project library")}</span>
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 ml-auto"
                    onClick={() => {
                      void navigator.clipboard?.writeText(formatBibliographicCitation(citation));
                      toast.success(t("Copied"));
                    }}
                  >
                    <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("Copy")}</span>
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
