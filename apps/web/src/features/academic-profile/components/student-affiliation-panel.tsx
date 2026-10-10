import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AcademicProfile, PublicAcademicProfile } from "@trend/shared-types";
import { Building2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { authApi } from "@/features/auth/api/auth.api";
import { useCurrentUser } from "@/features/auth";
import { useRequestAcademicVerification } from "../hooks/use-academic-profile";
import { AcademicVerificationRow } from "./academic-verification-row";

const STATUS_LABELS: Record<string, string> = {
  NOT_SUBMITTED: "Not verified", UNVERIFIED: "Not verified", PENDING: "Awaiting verification",
  NEEDS_MORE_INFORMATION: "More information needed", VERIFIED: "FPT Education affiliation verified", REJECTED: "Unable to verify",
};

export function StudentAffiliationPanel({ profile, editable }: { profile: AcademicProfile | PublicAcademicProfile; editable: boolean }) {
  const { t, language } = useI18n();
  const user = useCurrentUser();
  const options = useQuery({ queryKey: ["academic-onboarding-options", profile.affiliation.institutionId], queryFn: () => authApi.academicOnboardingOptions({ q: profile.affiliation.institutionName }), enabled: editable });
  const submit = useRequestAcademicVerification();
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File>();
  const isStudent = profile.academicRole === "STUDENT" || profile.primaryPosition === "STUDENT";
  const [proofType, setProofType] = useState<"STUDENT_CARD" | "ENROLLMENT" | "STAFF" | "APPOINTMENT">(isStudent ? "STUDENT_CARD" : "STAFF");
  const [error, setError] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const hostInstitution = options.data?.institutions?.find(item => item.id === profile.affiliation.institutionId && item.hostInstitution) ?? (options.data?.hostInstitution?.name === profile.affiliation.institutionName ? options.data?.hostInstitution : undefined);
  const requests = "verificationRequests" in profile ? profile.verificationRequests.filter((item) => item.type === "AFFILIATION") : [];
  const request = requests[0];
  const status = profile.verificationStatuses?.affiliation ?? "UNVERIFIED";
  const emailVerified = Boolean(user.data?.user.emailVerifiedAt);
  const pending = status === "PENDING";
  const verified = status === "VERIFIED";
  const canSend = emailVerified && !pending && !verified;
  async function send() {
    setError("");
    if ((isStudent && !studentId.trim()) || !file || !hostInstitution) { setError(t("Choose an institution, enter Student ID and upload evidence.")); return; }
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) { setError(t("Upload one PDF document up to 10 MB.")); return; }
    try {
      await submit.mutateAsync({ type: "AFFILIATION", evidenceType: "DOCUMENT", institutionId: hostInstitution.id, ...(isStudent ? { studentId: studentId.trim() } : {}), additionalNote: note.trim(), proofType, file });
      setOpen(false);
      setFile(undefined);
    } catch (failure) {
      const code = (failure as { response?: { status?: number } }).response?.status;
      setError(t(code === 409 ? "A request is already pending or your profile changed. Refresh to view its status." : "Could not submit evidence. Your entered information has been kept; please try again."));
    }
  }
  const hasHostAffiliation = Boolean(profile.affiliation.hostInstitution || hostInstitution);
  return <div data-no-i18n>
    {editable && <AcademicVerificationRow icon={Mail} title={t("Account email ownership")} status={user.isLoading ? "LOADING" : emailVerified ? "VERIFIED" : "UNVERIFIED"} statusLabel={t(user.isLoading ? "Checking email status…" : emailVerified ? "Verified" : "Not verified")} description={user.data?.user.email || t("Account email unavailable")} meta={emailNotice || (!user.isLoading && !emailVerified ? t("Verify your email before submitting affiliation evidence.") : undefined)} action={!user.isLoading && !emailVerified && <Button type="button" variant="outline" size="sm" disabled={sendingEmail} onClick={async () => {
      if (!user.data?.user.email) return;
      setSendingEmail(true);
      try { await authApi.resendEmailVerification(user.data.user.email); setEmailNotice(t("Verification email requested. Check your inbox.")); }
      catch { setEmailNotice(t("Could not send verification email. Please try again.")); }
      finally { setSendingEmail(false); }
    }}>{t(sendingEmail ? "Sending…" : "Resend verification email")}</Button>} />}
    {hasHostAffiliation && <AcademicVerificationRow icon={Building2} title={t("FPT Education membership")} status={status} statusLabel={t(verified ? "Verified" : STATUS_LABELS[status] ?? "Not verified")} statusDescription={verified ? t("FPT Education affiliation verified") : undefined} description={t(verified ? "Your membership at this institution has been verified." : pending ? "Your affiliation evidence is being reviewed." : "FPT verification is optional for core research tools.")} meta={editable && request ? <>{t("Submitted on")} {new Date(request.submittedAt).toLocaleDateString(language)}</> : undefined} feedback={editable && ["NEEDS_MORE_INFORMATION", "REJECTED"].includes(status) ? request?.rejectionReason : undefined} action={editable && !verified && <Button type="button" size="sm" variant="outline" disabled={!emailVerified} onClick={() => setOpen(true)}>{t(pending ? "View request" : status === "NEEDS_MORE_INFORMATION" ? "Add missing information" : status === "REJECTED" ? "Resubmit request" : "Verify FPT affiliation")}</Button>} />}
    {editable && hasHostAffiliation && <Dialog open={open} onOpenChange={(next) => { if (!submit.isPending) setOpen(next); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{t("Verify FPT affiliation")}</DialogTitle><DialogDescription>{t("An administrator reviews your private evidence. Email ownership and affiliation are separate.")}</DialogDescription></DialogHeader>
      {pending ? <p className="text-sm">{t("Your request is awaiting review.")}</p> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void send(); }}>
        <div className="space-y-1"><Label htmlFor="student-institution">{t("Institution")} *</Label><select id="student-institution" required className="w-full rounded-md border bg-background p-2 text-sm" disabled={options.isLoading || !hostInstitution}><option value={hostInstitution?.id ?? ""}>{hostInstitution?.name ?? t("Loading institution…")}</option></select>{options.error && <Button type="button" variant="link" onClick={() => void options.refetch()}>{t("Retry")}</Button>}</div>
        <div className="space-y-1"><Label>{t("Academic Position")}</Label><p className="text-sm">{t(isStudent ? "Student" : profile.academicRole === "LECTURER" ? "Lecturer" : "Researcher")}</p></div>
        {isStudent && <div className="space-y-1"><Label htmlFor="student-code">{t("Student ID")} *</Label><Input id="student-code" required maxLength={80} value={studentId} onChange={(event) => setStudentId(event.target.value)} /></div>}
        <div className="space-y-1"><Label htmlFor="student-proof-type">{t("Proof of affiliation")} *</Label><select id="student-proof-type" className="w-full rounded-md border bg-background p-2 text-sm" value={proofType} onChange={(event) => setProofType(event.target.value as typeof proofType)}>{isStudent ? <><option value="STUDENT_CARD">{t("Student card")}</option><option value="ENROLLMENT">{t("Current enrollment evidence")}</option></> : <><option value="STAFF">{t("Institutional or research staff evidence")}</option><option value="APPOINTMENT">{t("Appointment evidence")}</option></>}</select></div>
        <div className="space-y-1"><Label htmlFor="student-proof-file">{t("Private evidence (PDF, up to 10 MB)")} *</Label><Input id="student-proof-file" type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0])} />{file && <p className="text-xs text-slate-500">{file.name}</p>}</div>
        <div className="space-y-1"><Label htmlFor="student-note">{t("Additional note (optional)")}</Label><textarea id="student-note" className="w-full rounded-md border bg-background p-2 text-sm" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={!canSend || submit.isPending || !hostInstitution}>{t(submit.isPending ? "Submitting…" : "Submit verification request")}</Button>
      </form>}
    </DialogContent></Dialog>}
  </div>;
}
