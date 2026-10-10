import type { ForumAuthorView } from "../api/forum.api";
import { useI18n } from "@/i18n";
import { AcademicIdentitySummary } from "@/features/academic-profile/components/academic-identity-summary";
import { ForumAuthorPopover } from "./forum-author-popover";

export function ForumAuthorByline({ author, isOP = false, compact = false, onReply, canReply, onFilterPosts, authorTopicPostCount }: { author: ForumAuthorView; isOP?: boolean; compact?: boolean; onReply?: () => void; canReply?: boolean; onFilterPosts?: () => void; authorTopicPostCount?: number }) {
  const { t } = useI18n();
  const academicRole = author.academicRole ?? (author.academicProfileType === "student" ? "STUDENT" : author.academicProfileType === "lecturer" ? "LECTURER" : "RESEARCHER");
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ForumAuthorPopover author={author} authorTopicPostCount={authorTopicPostCount} className="text-left" onReply={onReply} canReply={canReply} onFilterPosts={onFilterPosts}><span className={compact ? "text-sm font-semibold text-foreground hover:text-primary" : "text-base font-semibold text-foreground hover:text-primary"}>{author.fullName}</span></ForumAuthorPopover>
        {isOP ? <span className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>{t("Author")}</span> : null}
      </div>
      {author.academicRole || author.academicProfileType || author.institution ? <div className="mt-0.5">
        <AcademicIdentitySummary identity={{ academicRole, institutionName: author.institution, programMajor: author.programMajor, currentPosition: author.positionTitle, fptAffiliationVerified: author.fptAffiliationVerified === true }} showDetails={false} />
      </div> : null}
    </div>
  );
}
