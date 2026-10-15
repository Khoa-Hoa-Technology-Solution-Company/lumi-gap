import type { MentorProjectPreview } from "@trend/shared-types";
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
