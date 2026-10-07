import { useEffect, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { formatForumRelativeTime } from "../utils/forum-helpers";
import { forumApi } from "../api/forum.api";
import type { ForumPostRevisionView } from "../api/forum.api";
import { ForumMarkdown } from "./forum-markdown";

type ForumEditHistoryProps = {
  kind: "post" | "comment";
  id: string;
  editedAt?: string;
  className?: string;
};

/** Inline, public revision history. The old body is rendered through the same
 * Markdown pipeline as a live post so revision content never becomes raw HTML. */
export function ForumEditHistory({ kind, id, editedAt, className }: ForumEditHistoryProps) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<Awaited<ReturnType<typeof forumApi.postRevisions>> | Awaited<ReturnType<typeof forumApi.commentRevisions>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  useEffect(() => {
    if (!editedAt || !open) return;
    let active = true;
    setRevisions([]);
    setIsLoading(true);
    setIsError(false);
    const request = kind === "post" ? forumApi.postRevisions(id) : forumApi.commentRevisions(id);
    request.then((next) => { if (active) setRevisions(next); }).catch(() => { if (active) setIsError(true); }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [editedAt, id, kind, open]);
  if (!editedAt) return null;
  const toggle = () => setOpen((value) => !value);

  return (
    <div className={cn("inline-flex max-w-full flex-wrap items-center gap-1.5", className)}>
      <Button type="button" variant="ghost" size="sm" onClick={toggle} aria-expanded={open} className="h-auto min-h-0 gap-1 px-1 py-0.5 text-xs font-normal text-muted-foreground hover:text-foreground">
        <History aria-hidden="true" className="h-3 w-3" />
        <span>{t("Edited")}</span>
        <span aria-hidden="true">·</span>
        <span>{t("View edit history")}</span>
        <ChevronDown aria-hidden="true" className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <section className="forum-edit-history basis-full rounded-md border border-border bg-muted/20 p-3" aria-label={t("Edit history")}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Edit history")}</h3>
            <time dateTime={editedAt} className="text-xs text-muted-foreground">{formatForumRelativeTime(editedAt, language)}</time>
          </div>
          {isLoading ? <div className="h-16 animate-pulse rounded bg-muted" role="status" aria-label={t("Loading edit history")} /> : null}
          {isError ? <p role="alert" className="text-xs text-muted-foreground">{t("Could not load edit history.")}</p> : null}
          {!isLoading && !isError && !revisions?.length ? <p className="text-xs text-muted-foreground">{t("No earlier revision is available.")}</p> : null}
          {!isLoading && !isError && revisions?.length ? <ol className="space-y-3">
            {revisions.map((revision) => (
              <li key={revision.id} className="rounded border border-border/70 bg-background/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">{t("Revision")} {revision.revision} · {revision.editedBy.fullName}</span>
                  <time dateTime={revision.createdAt} title={new Date(revision.createdAt).toLocaleString(language)}>{formatForumRelativeTime(revision.createdAt, language)}</time>
                </div>
                {kind === "post" ? <h4 className="mt-2 font-semibold">{(revision as ForumPostRevisionView).title}</h4> : null}
                <div className="mt-2 text-sm text-foreground/90"><ForumMarkdown content={revision.content} /></div>
                {kind === "post" && (revision as ForumPostRevisionView).tags.length ? <p className="mt-2 text-xs text-muted-foreground">{(revision as ForumPostRevisionView).tags.map((tag: string) => `#${tag}`).join("  ")}</p> : null}
              </li>
            ))}
          </ol> : null}
        </section>
      ) : null}
    </div>
  );
}
