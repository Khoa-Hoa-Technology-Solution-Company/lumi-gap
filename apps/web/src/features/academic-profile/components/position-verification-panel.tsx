import { useEffect, useRef, useState, type FormEvent, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import type { AcademicProfile, PublicAcademicProfile, LecturerTrackingRequest, LecturerEvidenceType } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useInstitutionalEmailStatus, useRequestInstitutionalEmailChallenge, useVerifyInstitutionalEmail } from "../hooks/use-academic-profile";
import { enqueueLecturerDelivery } from "../services/lecturer-delivery";
import { useLecturerDelivery } from "../hooks/use-lecturer-delivery";
import { LegacyPositionVerificationPanel } from "./legacy-position-verification-panel";
import { AcademicVerificationRow } from "./academic-verification-row";
import { institutionalEmailIssue, lecturerVerificationError } from "../utils/lecturer-verification-form";
import { LecturerEvidenceEntry, evidenceDraftIssue, newEvidenceDraft, type EvidenceDraft } from "./lecturer-evidence-entry";

function LecturerForm({ profile, onDone, onQueued, onBusyChange, supplement }: { profile: AcademicProfile | PublicAcademicProfile; onDone: () => void; onQueued: () => void; onBusyChange: (busy: boolean) => void; supplement?: LecturerTrackingRequest }) {
  const { t } = useI18n(), identity = useInstitutionalEmailStatus();
  const challenge = useRequestInstitutionalEmailChallenge(), verify = useVerifyInstitutionalEmail();
  const [choice, setChoice] = useState<"EMAIL" | "MANUAL" | undefined>(() => supplement?.verificationMethod === "MANUAL_INSTITUTIONAL_EVIDENCE" ? "MANUAL" : undefined);
  const [email, setEmail] = useState(""), [code, setCode] = useState(""), [sent, setSent] = useState(false);
  const [sources, setSources] = useState<EvidenceDraft[]>(() => supplement?.evidence.length ? supplement.evidence.map((source, index) => ({ ...newEvidenceDraft(`source-${index + 1}`), type: (source.type === "DOCUMENT" ? "EMPLOYMENT_DOCUMENT" : source.type === "INSTITUTIONAL_PROFILE" ? "OFFICIAL_FACULTY_PROFILE" : source.type) as LecturerEvidenceType, sourceKind: source.sourceKind === "DOCUMENT" ? "DOCUMENT" : "URL", reference: source.reference ?? "", customEvidenceName: source.type === "OTHER_INSTITUTION_SOURCE" ? source.displayName : "", additionalExplanation: source.additionalExplanation ?? "", retainedSourceId: source.sourceKind === "DOCUMENT" && source.isAvailable && source.id !== supplement.id ? source.id : undefined, retainedFileName: source.displayName })) : [newEvidenceDraft("source-1")]);
  const nextSource = useRef(sources.length + 1);
  const sending = useRef(false);
  const userId = useAuthStore(state => state.user?.id);
  const [submitting, setSubmitting] = useState(false);
  const [resendAt, setResendAt] = useState(0), [expiresAt, setExpiresAt] = useState(0), [now, setNow] = useState(Date.now);
  useEffect(() => { if (!sent && !resendAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [sent, resendAt]);
  useEffect(() => { onBusyChange(submitting); return () => onBusyChange(false); }, [submitting, onBusyChange]);
  const [error, setError] = useState("");
  const status = identity.data, recognized = status?.verified && status.institutionId === profile.affiliation.institutionId;
  const manual = choice === "MANUAL", ready = recognized || manual;
  const busy = challenge.isPending || verify.isPending || submitting;
  const draftLocked = busy;
  const emailIssue = institutionalEmailIssue(email, status);
  const institutionName = profile.affiliation.institutionName || t("your institution");
  const localize = (key: string) => t(key, { institution: institutionName });
  const evidenceComplete = sources.length > 0 && sources.every(source => !evidenceDraftIssue(source));
  const canSubmit = !busy && (ready && evidenceComplete && status?.accountEmailVerified && !identity.isLoading && !identity.isError && profile.affiliation.institutionId && profile.positionTitle);
  function chooseEmailPath() {
    setError("");
    setChoice("EMAIL");
  }
  async function sendCode() {
    setError("");
    if (draftLocked || identity.isLoading || identity.isError || !status?.accountEmailVerified) return;
    if (emailIssue) return setError(localize(emailIssue));
    try { const result = await challenge.mutateAsync(email.trim()); if (result.alreadyVerified) await identity.refetch(); else { setSent(true); setCode(""); setNow(Date.now()); setExpiresAt(Date.parse(result.expiresAt ?? "")); setResendAt(Date.parse(result.resendAt ?? "") || Date.now() + 60000); } }
    catch (failure) { setError(localize(lecturerVerificationError(failure, "Could not send verification code.", "email"))); }
  }
  async function confirmCode() { setError(""); if (draftLocked || !sent || code.length !== 6 || expiresAt && expiresAt <= now) return; try { await verify.mutateAsync({ code, email: email.trim().toLowerCase() }); setCode(""); } catch (failure) { setError(localize(lecturerVerificationError(failure, "Could not verify this code.", "code"))); } }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (busy || sending.current) return;
    if (!ready || !status?.accountEmailVerified || identity.isLoading || identity.isError) return setError(t("Verify your institutional email before submitting, or choose manual verification."));
    if (!evidenceComplete) return setError(t(sources.map(evidenceDraftIssue).find(Boolean) ?? "Provide complete evidence for each entry."));
    if (!userId) return setError(t("Your session has expired. Sign in again before submitting."));
    sending.current = true; setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      await enqueueLecturerDelivery({
        userId, id, institutionName, state: "QUEUED", uploads: {},
        input: { type: "POSITION", path: manual ? "MANUAL" : "STANDARD", institutionId: profile.affiliation.institutionId!, evidenceType: "DOCUMENT", submissionKey: id,
          ...(supplement ? { supplementsRequestId: supplement.id, expectedReviewedAt: supplement.reviewedAt } : {}) },
        sources: sources.map(source => ({ ...source })),
      });
      onQueued();
    } catch (failure) {
      const duplicate = failure instanceof Error && failure.message === "A verification delivery is already saved. Check its status before starting another.";
      setError(t(duplicate ? failure.message : "Could not save evidence on this browser. Keep this form open and try again."));
    } finally { sending.current = false; setSubmitting(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    {supplement && <div className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">{t("Admin feedback")}</p><p className="mt-1 whitespace-pre-wrap">{supplement.applicantMessage}</p><p className="mt-2 break-all text-xs text-muted-foreground">{t("Request ID")}: {supplement.id} · {t("Revision")} {supplement.revision}</p></div>}
    {identity.isLoading ? <p className="text-sm text-muted-foreground" role="status">{t("Checking existing institutional identities…")}</p> : identity.isError ? <div role="alert" className="text-sm text-destructive">{t("Could not check institutional identity.")} <Button type="button" variant="link" onClick={() => void identity.refetch()}>{t("Try again")}</Button></div> : <>
      {!status?.accountEmailVerified && <p role="alert" className="text-sm text-amber-700">{t("Verify your LumiGap account email first.")}</p>}
      {recognized && <h4 className="text-sm font-medium">{t("Institutional identity")}</h4>}
      {recognized ? <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{status.email}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t(status.source === "ACCOUNT" ? "Institutional email already verified through your LumiGap account." : "Institutional email ownership verified. Your login email is unchanged.")}</p></div> : <section className="space-y-3"><h4 className="text-sm font-medium">{t("Institutional identity")}</h4><p className="text-sm text-muted-foreground">{t("Do you have an institutional work email?")}</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={draftLocked} variant={choice === "EMAIL" ? "default" : "outline"} onClick={chooseEmailPath}><Mail className="mr-1.5 h-4 w-4" />{t("Verify institutional email")}</Button><Button type="button" size="sm" disabled={draftLocked} variant={choice === "MANUAL" ? "default" : "outline"} onClick={() => { setChoice("MANUAL"); setError(""); }}>{t("I don't have an institutional email")}</Button></div>
        {choice === "EMAIL" && <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <Label htmlFor="lecturer-work-email">{t("Institutional email")}</Label>
          <Input id="lecturer-work-email" type="email" autoComplete="email" disabled={draftLocked} aria-invalid={Boolean(email.trim() && emailIssue)} aria-describedby="lecturer-email-help lecturer-email-issue" value={email} maxLength={320} onChange={e => { setEmail(e.target.value); setSent(false); setCode(""); setError(""); }} />
          <p id="lecturer-email-help" className="text-xs text-muted-foreground">{localize("Use an email issued by {{institution}}.")}{Boolean(status?.approvedEmailDomains?.length) && ` (${status!.approvedEmailDomains!.map(item => `@${item.domain}`).join(", ")})`}</p>
          <p id="lecturer-email-issue" className="text-xs text-destructive" aria-live="polite">{email.trim() && emailIssue ? localize(emailIssue) : status?.approvedEmailDomains?.length === 0 ? localize("Email verification is not configured for this institution. Use manual verification or contact support.") : null}</p>
          <Button type="button" size="sm" variant="outline" disabled={Boolean(emailIssue) || draftLocked || now < resendAt || !status?.accountEmailVerified || identity.isLoading || identity.isError} onClick={() => void sendCode()}>{t(challenge.isPending ? "Sending verification code…" : sent ? "Resend code" : "Send verification code")}{sent && now < resendAt ? ` (${t("{{seconds}}s", { seconds: Math.ceil((resendAt - now) / 1000) })})` : ""}</Button>
          {sent && Boolean(expiresAt) && <p role="status" className="text-xs text-muted-foreground">{t(expiresAt <= now ? "This code has expired. Request a new code." : "Code expires in {{minutes}} minutes.", { minutes: Math.max(1, Math.ceil((expiresAt - now) / 60000)) })}</p>}
          <p className="text-xs text-muted-foreground">{t("This email is linked to your existing account; your login email stays the same.")}</p>
          {sent && <p role="status" className="text-xs text-muted-foreground">{t("If this address is eligible, a verification code has been sent.")}</p>}
          {sent && <div className="flex items-end gap-2"><div className="flex-1 space-y-1"><Label htmlFor="lecturer-email-code">{t("Verification code")}</Label><Input id="lecturer-email-code" disabled={draftLocked} inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }} /></div><Button type="button" size="sm" disabled={code.length !== 6 || draftLocked || Boolean(expiresAt && expiresAt <= now)} onClick={() => void confirmCode()}>{t("Verify email")}</Button></div>}
        </div>}
      </section>}
      {ready && <div className="space-y-3 border-t pt-4">
        <h4 className="text-sm font-medium">{t(manual ? "Manual Lecturer Verification" : "Lecturer-position evidence")}</h4>
        <p className="text-xs leading-5 text-muted-foreground">{t(manual ? "Provide institution-backed evidence that connects you to your current position. An Admin may request more information if identity binding is insufficient." : "Provide an official source or institution-issued document confirming your current position. An Admin will review it.")}</p>
        {sources.map((source, index) => <LecturerEvidenceEntry key={source.id} value={source} index={index} disabled={Boolean(busy)} removable={sources.length > 1} requestId={supplement?.id} onChange={value => { setError(""); setSources(previous => previous.map(item => item.id === value.id ? value : item)); }} onRemove={() => { setError(""); setSources(previous => previous.filter(item => item.id !== source.id)); }} />)}
        <Button type="button" size="sm" variant="outline" disabled={draftLocked || sources.length >= 6} onClick={() => { const source = newEvidenceDraft(`source-${nextSource.current++}`); setSources(previous => [...previous, source]); }}>{t("Add evidence")}</Button>
        {sources.some(source => source.sourceKind === "URL") && (status?.officialDomains?.length ? <p className="break-words text-xs text-muted-foreground">{t("Approved institution websites")}: {status.officialDomains.join(", ")}</p> : <p className="text-xs text-muted-foreground">{t("Unregistered official website domains require additional Admin validation.")}</p>)}
      </div>}
    </>}
    {!ready && choice === "EMAIL" && <p className="text-xs text-muted-foreground">{t("Verify your institutional email before submitting, or choose manual verification.")}</p>}
    <p className="text-xs leading-5 text-muted-foreground">{t("After submitting, you can leave this form. We will send your saved evidence in the background and notify you if it needs retrying.")}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="ghost" disabled={submitting} onClick={onDone}>{t("Cancel")}</Button><Button type="submit" disabled={!canSubmit}>{t(submitting ? "Saving evidence…" : manual ? "Submit for manual review" : "Submit verification")}</Button></div>
  </form>;
}

type PanelProps = ComponentProps<typeof LegacyPositionVerificationPanel> & { trackingMode?: boolean; supplement?: LecturerTrackingRequest };
export function PositionVerificationPanel(props: PanelProps) { return props.profile.academicRole === "LECTURER" ? <LecturerPanel {...props} /> : <LegacyPositionVerificationPanel {...props} />; }
function LecturerPanel({ profile, editable, onEditPosition, open: controlledOpen, onOpenChange, trackingMode, supplement }: PanelProps) {
  const { t, language } = useI18n(), [localOpen, setLocalOpen] = useState(false), [formBusy, setFormBusy] = useState(false);
  const userId = useAuthStore(state => state.user?.id);
  const delivery = useLecturerDelivery(userId);
  const open = controlledOpen ?? localOpen;
  function setOpen(value: boolean) { if (!value && formBusy) return; if (onOpenChange) onOpenChange(value); else setLocalOpen(value); }
  function queued() { setFormBusy(false); if (onOpenChange) onOpenChange(false); else setLocalOpen(false); }
  const raw = profile.verificationStatuses?.position ?? "NOT_SUBMITTED", verified = raw === "VERIFIED" && profile.academicRoleVerificationStatus === "VERIFIED";
  const latest = "verificationRequests" in profile ? profile.verificationRequests.find(r => r.type === "POSITION") : undefined;
  const labels: Record<string, string> = { PENDING: "Verification pending", NEEDS_MORE_INFORMATION: "More information required", REJECTED: "Could not verify" };
  const canVerify = editable && !verified && raw !== "PENDING" && (!delivery || delivery.state === "SENT");
  const canTrack = !trackingMode && editable && Boolean(latest || raw === "PENDING" || verified || delivery);
  return <div data-no-i18n>
    <AcademicVerificationRow icon={ShieldCheck} title={t("Lecturer status")} status={verified ? "VERIFIED" : raw === "VERIFIED" ? "UNVERIFIED" : raw} statusLabel={t(verified ? "Verified" : labels[raw] ?? "Not verified")} description={t(verified ? "You can receive mentorship and academic review requests." : raw === "PENDING" ? "Your position evidence is being reviewed. We will notify you when a decision is available." : "Verify your academic position to access Lecturer-specific academic features.")} meta={editable && latest && raw === "PENDING" ? <>{t("Submitted on")} {new Date(latest.submittedAt).toLocaleDateString(language)}</> : undefined} feedback={editable && ["NEEDS_MORE_INFORMATION", "REJECTED"].includes(raw) ? latest?.rejectionReason : undefined} action={(canVerify || canTrack) && <>
      {canVerify && <Button type="button" size="sm" onClick={() => setOpen(true)}>{t(raw === "NEEDS_MORE_INFORMATION" ? "Update verification" : raw === "REJECTED" ? "Submit new verification" : "Verify Lecturer Status")}</Button>}
      {canTrack && <Button variant="outline" size="sm" asChild><Link to="/settings/verification/lecturer">{t("Track Lecturer verification")}</Link></Button>}
    </>} />
    <Dialog open={Boolean(open && editable && !verified && (raw !== "PENDING" || formBusy))} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" data-no-i18n><DialogHeader><DialogTitle>{t(supplement ? "Supplement evidence" : "Verify Lecturer Status")}</DialogTitle><DialogDescription>{t("Provide information and evidence of your current Lecturer position. Only you and authorized administrators can access verification documents.")}</DialogDescription></DialogHeader><div className="rounded-md bg-muted p-3 text-sm"><p>{t("Institution")}: {profile.affiliation.institutionName || t("Not provided")}</p><p className="mt-1">{t("Current Position")}: {profile.positionTitle || t("Not provided")}</p>{onEditPosition && <Button type="button" size="sm" variant="link" disabled={formBusy} className="mt-2 h-auto p-0" onClick={() => { setOpen(false); onEditPosition(); }}>{t("Edit details")}</Button>}</div>{open && <LecturerForm key={`${profile.affiliation.institutionId}:${profile.positionTitle}`} profile={profile} supplement={supplement} onDone={() => setOpen(false)} onQueued={queued} onBusyChange={setFormBusy} />}</DialogContent></Dialog>
  </div>;
}
