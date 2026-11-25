import { Link } from "react-router-dom";
import type { AvailableMentor } from "@trend/shared-types";
import { useI18n } from "@/i18n";

export type InvitationLecturer = Pick<AvailableMentor, "_id"> & Partial<Pick<AvailableMentor, "fullName" | "avatarUrl" | "positionTitle" | "institutionName" | "expertiseAreas" | "isDemo" | "verifiedLecturer">>;

/** One compact identity card for proposing and inviting, with no inferred credentials. */
export function LecturerInvitationCard({ mentor, onChooseAgain, disabled }: { mentor: InvitationLecturer; onChooseAgain?: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  const name = mentor.fullName || t("supervisor.profile");
  return <section className="supervisor-recipient" aria-label={t("supervisor.profile")}>
    <div><span className="supervisor-avatar" aria-hidden="true">{mentor.avatarUrl ? <img src={mentor.avatarUrl} alt="" /> : name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><p>{[mentor.positionTitle, mentor.institutionName].filter(Boolean).join(" · ")}</p><small>{t(mentor.isDemo || /\bdemo\b/i.test(`${name} ${mentor.institutionName ?? ""}`) ? "supervisor.demo" : mentor.verifiedLecturer ? "supervisor.verified" : "supervisor.profile")}</small></div></div>
    {Boolean(mentor.expertiseAreas?.length) && <p>{mentor.expertiseAreas!.slice(0, 3).join(" · ")}</p>}
    <div className="supervisor-recipient-actions"><Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>{t("View profile")}</Link>{onChooseAgain && <button type="button" disabled={disabled} onClick={onChooseAgain}>{t("supervisor.chooseAgain")}</button>}</div>
  </section>;
}
