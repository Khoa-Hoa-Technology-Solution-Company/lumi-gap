import { BookOpen, Lock, Sparkles, Users } from "lucide-react";
import type { MentorProjectPreview, MentorshipPerson } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { ResearchClassificationSummary } from "@/features/academic-profile/components/research-classification-fields";
import { MENTOR_SUPPORT_AREAS } from "@trend/shared-types";

/** Render only the server's approved mentorship preview DTO. */
export function MentorPreviewContent({ preview }: { preview: MentorProjectPreview }) {
  const { t } = useI18n();
  const stages = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" };

  return (
    <section className="miv-topic-card min-w-0 space-y-3.5 text-sm [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <BookOpen size={13} aria-hidden="true" />
          <span>{t("Research topic")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            {t(stages[preview.stage])}
          </span>
          {preview.teamMemberCount !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Users size={11} aria-hidden="true" />
              <span>{preview.teamMemberCount} {t("team members, including the project owner")}</span>
            </span>
          ) : null}
        </div>
      </div>

      <h3 className="text-lg font-bold leading-snug tracking-tight text-foreground">{preview.title}</h3>

      {(preview.researchAreas.length > 0 || preview.expertise.length > 0) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {preview.researchAreas.map(area => (
            <span key={area} className="rounded-md border border-border/80 bg-background px-2.5 py-0.5 text-xs font-medium text-foreground/85">
              {t(area)}
            </span>
          ))}
          {preview.expertise.map(skill => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              <Sparkles size={11} aria-hidden="true" />
              <span>{t(skill)}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/70 bg-background/85 p-3 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Shared research abstract")}
        </p>
        <p className={`max-w-prose whitespace-pre-wrap text-sm leading-6 ${preview.summary ? "text-foreground/90" : "italic text-muted-foreground"}`}>
          {preview.summary || t("The team has not shared a research abstract yet.")}
        </p>
      </div>

      <ResearchClassificationSummary value={preview.researchClassification} />

      {Boolean(preview.supportTypes?.length) && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("Mentoring support areas")}</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.supportTypes?.map(type => (
              <span key={type} className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {t(MENTOR_SUPPORT_AREAS.find(area => area.id === type)?.label ?? type)}
              </span>
            ))}
          </div>
        </div>
      )}

      {preview.mentoringNeeds ? (
        <div className="rounded-lg bg-muted/40 p-3 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("Mentoring needs")}</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.mentoringNeeds}</p>
        </div>
      ) : null}
    </section>
  );
}

export function MentorInvitationAccessNotice() {
  const { t } = useI18n();
  return (
    <div className="space-y-1 rounded-xl border bg-muted/30 p-3.5 text-xs leading-5 text-muted-foreground">
      <p className="font-semibold text-foreground">{t("Project access starts after acceptance")}</p>
      <p>{t("Before acceptance, only this shared introduction, the sender's basic profile and explicitly attached files are available.")}</p>
      <p>{t("After acceptance, you can view and comment only on resources the owner shares and permissions they grant. The paper library, LaTeX source and confidential data are not automatically opened.")}</p>
    </div>
  );
}

/** Use the server-redacted sender DTO, never the signed-in user's full account object. */
export function MentorInvitationSender({ sender }: { sender: MentorshipPerson }) {
  const { t } = useI18n();
  const initials = sender.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("") || "SV";
  const roleText = sender.academicRole ? t(sender.academicRole) : undefined;
  const formattedRole = roleText && roleText === roleText.toLocaleUpperCase("vi-VN") && roleText.length > 3
    ? roleText[0] + roleText.slice(1).toLocaleLowerCase("vi-VN")
    : roleText;
  const meta = [formattedRole, sender.positionTitle, sender.institutionName].filter(Boolean).join(" · ");

  return (
    <div className="mentor-invitation-sender rounded-xl border border-border/80 bg-card p-3.5 space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Information about the sender")}
      </p>
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-bold text-primary"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{sender.fullName}</p>
          {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-[11.5px] leading-5 text-muted-foreground">
        <Lock size={12} className="shrink-0" aria-hidden="true" />
        <span>{t("Only the profile information shown here is shared with your invitation.")}</span>
      </p>
    </div>
  );
}
