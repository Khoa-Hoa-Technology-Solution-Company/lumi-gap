import { BadgeCheck } from "lucide-react";
import type { ForumAuthorView } from "../api/forum.api";
import { useI18n } from "@/i18n";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ForumAuthorPopover } from "./forum-author-popover";

export function ForumAuthorByline({ author, isOP = false, compact = false, onReply, canReply, onFilterPosts, authorTopicPostCount }: { author: ForumAuthorView; isOP?: boolean; compact?: boolean; onReply?: () => void; canReply?: boolean; onFilterPosts?: () => void; authorTopicPostCount?: number }) {
  const { t } = useI18n();
  const position = author.positionTitle ? t(author.positionTitle) : (author.primaryPosition ? t(author.primaryPosition === "STUDENT" ? "Student" : author.primaryPosition === "LECTURER" ? "Lecturer" : "Researcher") : author.academicProfileType ? t(author.academicProfileType === "student" ? "Student" : "Researcher") : author.academicTitle);
  const verification = [author.affiliationVerified && author.institution ? t("Affiliation verified") : "", author.positionVerified && position ? t("Position verified") : ""].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ForumAuthorPopover author={author} authorTopicPostCount={authorTopicPostCount} className="text-left" onReply={onReply} canReply={canReply} onFilterPosts={onFilterPosts}><span className={compact ? "text-sm font-semibold text-foreground hover:text-primary" : "text-base font-semibold text-foreground hover:text-primary"}>{author.fullName}</span></ForumAuthorPopover>
        {isOP ? <span className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>{t("Author")}</span> : null}
      </div>
      {position || author.institution ? <div className={`${compact ? "text-xs leading-4" : "text-sm leading-5"} mt-0.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-300`}>
        <span>{[position, author.institution].filter(Boolean).join(" · ")}</span>
        {verification ? <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" aria-label={verification} className="shrink-0 rounded text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400"><BadgeCheck className="h-4 w-4" /></button></TooltipTrigger><TooltipContent className="max-w-64"><p>{verification}</p><p className="mt-1">{t("Identity verification is not scientific validation.")}</p></TooltipContent></Tooltip></TooltipProvider> : null}
      </div> : null}
    </div>
  );
}
