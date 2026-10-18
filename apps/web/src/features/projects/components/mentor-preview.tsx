import type { MentorProjectPreview, MentorshipPerson } from "@trend/shared-types";
import { useI18n } from "@/i18n";

/** Render only the server's approved mentorship preview DTO. */
export function MentorPreviewContent({ preview }: { preview: MentorProjectPreview }) {
  const { t } = useI18n();
  const stages = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" };
  return <div className="min-w-0 space-y-3 text-sm [overflow-wrap:anywhere]">
    <p className="font-medium">{preview.title}</p>
    <p className="whitespace-pre-wrap leading-6">{preview.summary || t("No public description yet.")}</p>
    <p className="text-xs text-muted-foreground">{t(stages[preview.stage])}{preview.researchAreas.length > 0 && ` · ${preview.researchAreas.map(area => t(area)).join(" · ")}`}</p>
    {preview.expertise.length > 0 && <p><span className="text-muted-foreground">{t("Expertise requested")}: </span>{preview.expertise.map(area => t(area)).join(" · ")}</p>}
    {preview.mentoringNeeds && <div><p className="mb-1 text-xs font-medium text-muted-foreground">{t("Mentoring needs")}</p><p className="whitespace-pre-wrap leading-6">{preview.mentoringNeeds}</p></div>}
  </div>;
}

/** Use the server-redacted sender DTO, never the signed-in user's full account object. */
export function MentorInvitationSender({ sender }: { sender: MentorshipPerson }) {
  const { t } = useI18n();
  return <div className="mentor-invitation-sender">
    <p className="text-xs font-medium text-muted-foreground">{t("Information about the sender")}</p>
    <p className="mt-1 text-sm font-medium">{sender.fullName}</p>
    <p className="mt-1 text-xs text-muted-foreground">{[sender.academicRole && t(sender.academicRole), sender.positionTitle, sender.institutionName].filter(Boolean).join(" · ")}</p>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("Only the profile information shown here is shared with your invitation.")}</p>
  </div>;
}
