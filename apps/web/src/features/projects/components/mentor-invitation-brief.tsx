import type { MentorInvitationContext } from "@trend/shared-types";
import { useI18n } from "@/i18n";

/** Same projection for the live composing preview and the persisted recipient brief. */
export function MentorInvitationBrief({ context, summary, message, support = [] }: { context: Omit<MentorInvitationContext, "token">; summary: string; message: string; support?: string[] }) {
  const { t } = useI18n();
  return <dl className="supervisor-brief space-y-4 text-sm [overflow-wrap:anywhere]" data-no-i18n>
    <div><dt className="text-xs text-muted-foreground">{t("Research project")}</dt><dd className="mt-1 font-semibold">{context.title}</dd></div>
    {Boolean(context.researchField || context.researchAreas.length) && <div><dt className="text-xs text-muted-foreground">{t("supervisor.sharedTopics")}</dt><dd className="mt-1">{[...new Set([context.researchField, ...context.researchAreas].filter(Boolean))].join(" · ")}</dd></div>}
    <div><dt className="text-xs text-muted-foreground">{t("supervisor.representative")}</dt><dd className="mt-1">{context.senderDisplayName} · {context.memberCount} {t("supervisor.members")}</dd></div>
    <div><dt className="text-xs text-muted-foreground">{t("supervisor.summary")}</dt><dd data-testid="invitation-summary-preview" className="mt-1 whitespace-pre-wrap leading-6">{summary.trim()}</dd></div>
    <div><dt className="text-xs text-muted-foreground">{t("supervisor.reason")}</dt><dd data-testid="invitation-message-preview" className="mt-1 whitespace-pre-wrap leading-6">{message.trim()}</dd></div>
    {support.length > 0 && <div><dt className="text-xs text-muted-foreground">{t("supervisor.support")}</dt><dd className="mt-1">{support.map(area => t(`supervisor.support.${area}`)).join(" · ")}</dd></div>}
  </dl>;
}
