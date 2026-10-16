import type { MouseEventHandler } from "react";
import { Link } from "react-router-dom";
import type { ManuscriptFeedbackSummary } from "@trend/shared-types";
import { useI18n } from "@/i18n";

const feedbackLabels: Record<ManuscriptFeedbackSummary["status"], string> = {
  PENDING: "Mentor feedback pending",
  RESPONDED: "Mentor feedback received",
  RESOLVED: "Mentor feedback addressed",
  ENDED: "Mentor relationship ended",
};

export function ManuscriptFeedbackLink({ projectId, manuscriptId, feedback, onClick }: {
  projectId: string; manuscriptId: string; feedback: ManuscriptFeedbackSummary;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const { t } = useI18n();
  return <Link className="writing-feedback-link" onClick={onClick} to={`/projects/${projectId}/manuscripts/${manuscriptId}?snapshot=${feedback.snapshotId}`}>
    {t(feedbackLabels[feedback.status])} · {feedback.snapshotLabel}
  </Link>;
}
