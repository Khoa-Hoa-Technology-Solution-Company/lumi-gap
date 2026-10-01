import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, FileText, Sparkles, FolderGit2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import type { ForumReferenceView } from "../api/forum.api";

interface ForumContextCardProps {
  type: "paper" | "gap" | "project" | "reference";
  title: string;
  subtitle?: string;
  doi?: string;
  year?: number;
  url?: string;
  href?: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  verified?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  className?: string;
  compact?: boolean;
}

export function ForumContextCard({
  type,
  title,
  subtitle,
  doi,
  year,
  url,
  href,
  badge,
  badgeVariant = "outline",
  verified = false,
  onAction,
  actionLabel,
  actionDisabled = false,
  className,
  compact = false,
}: ForumContextCardProps) {
  const { t } = useI18n();

  const ICONS = {
    paper: FileText,
    gap: Sparkles,
    project: FolderGit2,
    reference: BookOpen,
  };

  const Icon = ICONS[type] || BookOpen;

  const THEMES = {
    paper: "border-amber-200/80 bg-amber-50/30 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100",
    gap: "border-emerald-200/80 bg-emerald-50/30 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100",
    project: "border-blue-200/80 bg-blue-50/30 text-blue-950 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100",
    reference: "border-border/80 bg-card text-foreground",
  };

  const ICON_COLORS = {
    paper: "text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 ring-1 ring-amber-300/40",
    gap: "text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-900/40 ring-1 ring-emerald-300/40",
    project: "text-blue-700 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/40 ring-1 ring-blue-300/40",
    reference: "text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-zinc-800 ring-1 ring-slate-300/40",
  };

  const displayTitle =
    title?.trim() ||
    (type === "gap"
      ? t("Candidate Research Gap")
      : type === "paper"
      ? t("Academic Paper")
      : type === "project"
      ? t("Research Project")
      : t("Reference Citation"));

  const doiUrl = doi ? `https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, "")}` : url;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border shadow-2xs transition-all duration-200",
        THEMES[type],
        compact ? "p-3" : "p-4",
        href ? "hover:border-primary/50 hover:shadow-sm" : "",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl p-2.5 shadow-2xs",
            ICON_COLORS[type]
          )}
        >
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {badge && (
              <Badge variant={badgeVariant} className="text-[10px] font-semibold h-4.5 px-1.5 rounded">
                {t(badge)}
              </Badge>
            )}
            {year && (
              <span className="text-[11px] font-medium text-muted-foreground">
                ({year})
              </span>
            )}
            {verified && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("Verified Paper")}
              </span>
            )}
          </div>

          <h4 className={cn("mt-1 font-semibold text-foreground tracking-tight", compact ? "text-xs line-clamp-1" : "text-sm line-clamp-2")}>
            {href ? (
              <Link to={href} className="hover:text-primary transition-colors hover:underline">
                {displayTitle}
              </Link>
            ) : (
              displayTitle
            )}
          </h4>

          {subtitle && (
            <p className={cn("mt-1 text-muted-foreground", compact ? "text-[11px] line-clamp-1" : "text-xs line-clamp-2")}>
              {subtitle}
            </p>
          )}

          {doi && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href={doiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
              >
                <span>DOI: {doi}</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-80" />
              </a>
            </div>
          )}

          {onAction && actionLabel && (
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actionDisabled}
                onClick={onAction}
                className="h-7 text-xs rounded-lg border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
              >
                {t(actionLabel)}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ForumReferenceItem({
  reference, linkedGapId, onReviewEvidence, index = 1,
}: {
  reference: ForumReferenceView;
  linkedGapId?: string;
  onReviewEvidence?: (ref: ForumReferenceView) => void;
  index?: number;
}) {
  const { t } = useI18n();
  const url = reference.doi ? `https://doi.org/${reference.doi.replace(/^https?:\/\/doi\.org\//i, "")}` : reference.url;
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : undefined;
  return (
    <div className="flex gap-3 text-sm">
      <span className="pt-0.5 tabular-nums text-muted-foreground">[{index}]</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-relaxed text-foreground">{reference.title || reference.doi || t("Academic Reference")}</p>
        {reference.authors?.length || reference.year ? <p className="mt-0.5 text-[13px] text-muted-foreground">{[reference.authors?.join(", "), reference.year].filter(Boolean).join(" · ")}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          {reference.paperId ? <Link to={`/papers/${reference.paperId}`} className="text-primary hover:underline">{t("View paper")}</Link> : null}
          {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all text-primary hover:underline">{reference.doi ? "DOI: " + reference.doi : t("View source")}<ExternalLink className="h-3 w-3 shrink-0" /></a> : null}
          {linkedGapId && reference.id && reference.paperId && onReviewEvidence ? <button type="button" className="rounded py-1 text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onReviewEvidence(reference)}>{t("Review as Evidence")}</button> : null}
        </div>
      </div>
    </div>
  );
}
