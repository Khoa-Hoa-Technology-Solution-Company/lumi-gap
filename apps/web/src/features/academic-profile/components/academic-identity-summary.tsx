import type { AcademicProfile, CompactAcademicProfile, PublicAcademicProfile } from "@trend/shared-types";
import { BadgeCheck } from "lucide-react";
import { useI18n } from "@/i18n";

export function profileIdentity(profile: AcademicProfile | PublicAcademicProfile): Pick<CompactAcademicProfile, "academicRole" | "institutionName" | "programMajor" | "currentPosition" | "affiliationVerification" | "fptAffiliationVerified" | "positionVerification"> {
  const academicRole = profile.academicRole ?? (profile.academicType === "student" ? "STUDENT" : profile.academicType === "lecturer" ? "LECTURER" : "RESEARCHER");
  return { academicRole, institutionName: profile.affiliation.institutionName, programMajor: academicRole === "STUDENT" ? profile.affiliation.programName : undefined, currentPosition: academicRole !== "STUDENT" ? profile.positionTitle ?? profile.affiliation.positionTitle : undefined, affiliationVerification: profile.affiliation.affiliationVerificationStatus, fptAffiliationVerified: profile.affiliation.hostInstitution === true && profile.affiliation.isCurrent === true && profile.affiliation.affiliationVerificationStatus === "VERIFIED", positionVerification: profile.verificationStatuses?.position };
}
export function AcademicIdentitySummary({ identity, showDetails = true }: { identity: ReturnType<typeof profileIdentity>; showDetails?: boolean }) {
  const { t } = useI18n();
  const role = identity.academicRole === "STUDENT" ? "Student" : identity.academicRole === "LECTURER" ? "Lecturer" : "Researcher";
  const detail = identity.academicRole === "STUDENT" ? identity.programMajor : identity.currentPosition;
  return <div className="min-w-0 space-y-1 text-sm text-muted-foreground"><p className="flex flex-wrap items-center gap-x-1.5 gap-y-1"><span>{t(role)}</span>{identity.institutionName && <><span aria-hidden>·</span><span className="break-words">{identity.institutionName}</span></>}{identity.fptAffiliationVerified && <span title={t("FPT Education affiliation verified")}><BadgeCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-label={t("FPT Education affiliation verified")} /></span>}</p>{showDetails && detail && <p className="break-words text-slate-700 dark:text-slate-300">{t(detail)}</p>}</div>;
}
