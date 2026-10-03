import { ArrowRight, CalendarDays, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import type { ForumPostView } from "../api/forum.api";

export function ForumLinkedPaper({ paper }: { paper: NonNullable<ForumPostView["linkedPaper"]> }) {
  const { t } = useI18n();
  return <Link to={`/papers/${paper.id}`} className="forum-linked-paper" aria-label={`${t("View paper")}: ${paper.title}`}>
    <span className="forum-linked-paper-icon" aria-hidden="true"><FileText /></span>
    <div className="forum-linked-paper-content">
      <p className="forum-linked-paper-label">{t("Linked Paper")}</p>
      <h2 className="forum-linked-paper-title">{paper.title}</h2>
      {paper.publicationYear || paper.doi ? <div className="forum-linked-paper-meta">
        {paper.publicationYear ? <span className="forum-linked-paper-year"><CalendarDays aria-hidden="true" />{paper.publicationYear}</span> : null}
        {paper.doi ? <span className="forum-linked-paper-doi"><span>DOI</span> {paper.doi}</span> : null}
      </div> : null}
      <span className="forum-linked-paper-action">{t("View paper")}<ArrowRight aria-hidden="true" /></span>
    </div>
  </Link>;
}
