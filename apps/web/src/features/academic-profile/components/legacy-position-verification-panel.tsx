import { useState, type FormEvent } from "react";
import type { AcademicProfile, PublicAcademicProfile } from "@trend/shared-types";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useRequestAcademicVerification } from "../hooks/use-academic-profile";
import { AcademicVerificationRow } from "./academic-verification-row";

export function LegacyPositionVerificationPanel({ profile, editable, onEditPosition, open: controlledOpen, onOpenChange }: { profile: AcademicProfile | PublicAcademicProfile; editable: boolean; onEditPosition?: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { t, language } = useI18n();
  const request = useRequestAcademicVerification();
  const [localOpen, setLocalOpen] = useState(false), [method, setMethod] = useState<"DOCUMENT" | "INSTITUTIONAL_PROFILE">("DOCUMENT");
  const open = controlledOpen ?? localOpen;
  function setOpen(value: boolean) { if (onOpenChange) onOpenChange(value); else setLocalOpen(value); }
  const [file, setFile] = useState<File>(), [reference, setReference] = useState(""), [staffId, setStaffId] = useState(""), [note, setNote] = useState(""), [error, setError] = useState("");
  const lecturer = profile.academicRole === "LECTURER";
  const raw = profile.verificationStatuses?.position ?? "NOT_SUBMITTED";
  const verified = raw === "VERIFIED" && (!lecturer || profile.academicRoleVerificationStatus === "VERIFIED");
  const latest = "verificationRequests" in profile ? profile.verificationRequests.find(r => r.type === "POSITION") : undefined;
  const labels: Record<string, string> = { PENDING: "Verification pending", NEEDS_MORE_INFORMATION: "More information required", REJECTED: "Could not verify" };
  const label = verified ? "Verified" : labels[raw] ?? "Not verified";
  const institution = profile.affiliation.institutionName ?? "", position = profile.positionTitle ?? "";
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (!institution || !position) return setError(t("Add your institution and current position first."));
    if (method === "DOCUMENT" && (!file || file.size > 10 * 1024 * 1024 || file.type !== "application/pdf")) return setError(t("Choose a PDF of up to 10 MB."));
    try {
      await request.mutateAsync({ type: "POSITION", evidenceType: method, file: method === "DOCUMENT" ? file : undefined, reference: method === "INSTITUTIONAL_PROFILE" ? reference.trim() : undefined, staffId: staffId.trim() || undefined, additionalNote: note.trim() || undefined });
      setOpen(false); setFile(undefined); setReference(""); setNote(""); setStaffId("");
    } catch (failure) { setError((failure as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? t("Could not submit the verification request. Please try again.")); }
  }
  return <div data-no-i18n>
    <AcademicVerificationRow icon={ShieldCheck} title={t(lecturer ? "Lecturer status" : "Academic position status")} status={verified ? "VERIFIED" : raw === "VERIFIED" ? "UNVERIFIED" : raw} statusLabel={t(label)} description={t(verified ? "Academic position verified." : raw === "PENDING" ? "Your position evidence is being reviewed. We will notify you when a decision is available." : "Submit official evidence of your current academic position.")} meta={editable && latest && raw === "PENDING" ? <>{t("Submitted on")} {new Date(latest.submittedAt).toLocaleDateString(language)}</> : undefined} feedback={editable && ["NEEDS_MORE_INFORMATION", "REJECTED"].includes(raw) ? latest?.rejectionReason : undefined} action={editable && !verified && raw !== "PENDING" && <Button type="button" size="sm" onClick={() => setOpen(true)}>{t(raw === "NEEDS_MORE_INFORMATION" ? "Update verification" : raw === "REJECTED" ? "Submit new verification" : lecturer ? "Verify Lecturer Status" : "Verify position")}</Button>} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{t(lecturer ? "Verify Lecturer Status" : "Verify academic position")}</DialogTitle><DialogDescription>{t("An administrator reviews your academic-position evidence. Documents remain private.")}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2 rounded-md bg-muted p-3 text-sm"><p>{t("Institution")} *: {institution || t("Not provided")}</p><p>{t("Current Position")} *: {position || t("Not provided")}</p>{onEditPosition && <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(false); onEditPosition(); }}>{t("Edit details")}</Button>}</div><div className="space-y-1.5"><Label htmlFor="lecturer-staff-id">{t("Staff ID (optional)")}</Label><Input id="lecturer-staff-id" value={staffId} maxLength={80} onChange={e => setStaffId(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="lecturer-evidence-method">{t("Proof of academic/staff position")} *</Label><select id="lecturer-evidence-method" value={method} onChange={e => setMethod(e.target.value as typeof method)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="DOCUMENT">{t("Private PDF document")}</option><option value="INSTITUTIONAL_PROFILE">{t("Institutional staff profile")}</option></select></div>{method === "DOCUMENT" ? <div className="space-y-1.5"><Label htmlFor="lecturer-evidence">{t("Supporting PDF")} *</Label><Input id="lecturer-evidence" type="file" accept="application/pdf,.pdf" required onChange={e => setFile(e.target.files?.[0])} /><p className="text-xs text-muted-foreground">{t("PDF only, up to 10 MB. Visible only to authorized administrators.")}</p></div> : <div className="space-y-1.5"><Label htmlFor="lecturer-staff-url">{t("Institutional staff profile URL")} *</Label><Input id="lecturer-staff-url" type="url" required value={reference} maxLength={500} onChange={e => setReference(e.target.value)} /></div>}<div className="space-y-1.5"><Label htmlFor="lecturer-note">{t("Additional note (optional)")}</Label><textarea id="lecturer-note" className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button disabled={request.isPending} type="submit">{t(request.isPending ? "Submitting…" : "Submit verification")}</Button></div></form></DialogContent></Dialog>
  </div>;
}
