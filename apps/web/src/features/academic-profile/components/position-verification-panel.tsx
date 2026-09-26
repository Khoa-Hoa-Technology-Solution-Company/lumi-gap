import { useRef, useState, type FormEvent } from "react";
import type { AcademicProfile, PublicAcademicProfile, VerificationStatus } from "@trend/shared-types";
import { BadgeCheck, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequestAcademicVerification } from "../hooks/use-academic-profile";

const statusStyle: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  UNVERIFIED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  REJECTED: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  EXPIRED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  INVALIDATED: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

const statusLabel: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: "Not submitted", UNVERIFIED: "Not submitted", PENDING: "Pending",
  VERIFIED: "Verified", REJECTED: "Rejected", EXPIRED: "Expired", INVALIDATED: "Invalidated",
};

type EvidenceMethod = "INSTITUTIONAL_EMAIL" | "INSTITUTIONAL_PROFILE" | "DOCUMENT" | "OTHER";

export function PositionVerificationPanel({ profile, editable, onEditPosition }: { profile: AcademicProfile | PublicAcademicProfile; editable: boolean; onEditPosition?: () => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<EvidenceMethod>("INSTITUTIONAL_EMAIL");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | undefined>();
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRequestAcademicVerification();
  const status = profile.verificationStatuses?.position ?? "NOT_SUBMITTED";
  const latestRequest = "verificationRequests" in profile ? profile.verificationRequests.find((item) => item.type === "POSITION") : undefined;
  const privateAffiliation = "institutionalEmailVerifiedAt" in profile.affiliation ? profile.affiliation : undefined;
  const institutionalEmailVerified = Boolean(privateAffiliation?.institutionalEmailVerifiedAt);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (method === "INSTITUTIONAL_EMAIL" && !institutionalEmailVerified) {
      setError("Verify your institutional email in Identity first.");
      return;
    }
    if (method === "INSTITUTIONAL_PROFILE") {
      try {
        const url = new URL(reference);
        if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
      } catch {
        setError("Enter a valid institutional profile URL.");
        return;
      }
    }
    if (method === "DOCUMENT" && !file) { setError("Choose a PDF document."); return; }
    if (method === "OTHER" && !reference.trim()) { setError("Describe your supporting evidence."); return; }
    try {
      await request.mutateAsync({ type: "POSITION", evidenceType: method, reference: method === "INSTITUTIONAL_PROFILE" || method === "OTHER" ? reference.trim() : undefined, file });
      setOpen(false);
      setFile(undefined);
      setReference("");
    } catch {
      setError("Could not submit the verification request. Please try again.");
    }
  }

  return (
    <section aria-labelledby="academic-position-verification-title" className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="academic-position-verification-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Academic Verification</h3>
          <p className="mt-2 text-xs font-medium text-slate-500">Current Position</p>
          <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-200">{profile.positionTitle || profile.affiliation.positionTitle || "Not provided"}</p>
          <Badge variant="outline" className={`mt-2 ${statusStyle[status]}`}>
            {status === "VERIFIED" && <BadgeCheck className="mr-1 h-3.5 w-3.5" />}
            Status: {statusLabel[status]}
          </Badge>
        </div>
        {editable && <div className="flex shrink-0 flex-wrap gap-2">
          {onEditPosition && <Button size="sm" variant="outline" onClick={onEditPosition}>Edit position</Button>}
          {status !== "PENDING" && status !== "VERIFIED" && profile.positionTitle && <Button size="sm" variant="outline" onClick={() => { setError(""); setOpen(true); }}><ShieldCheck className="mr-1.5 h-4 w-4" />Verify position</Button>}
        </div>}
      </div>
      {status === "REJECTED" && latestRequest?.rejectionReason && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:bg-red-950/30 dark:text-red-300">Review note: {latestRequest.rejectionReason}</p>}
      {status === "PENDING" && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Your evidence is being reviewed. Position verification is separate from system access and roles.</p>}
      {status === "VERIFIED" && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" />Position verified</p>}
      <dl className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800 sm:grid-cols-2">
        <VerificationSummary label="Current Affiliation" value={profile.affiliation.institutionName || "Not provided"} status={profile.verificationStatuses?.affiliation ?? "NOT_SUBMITTED"} />
        <VerificationSummary label="Email" value={privateAffiliation?.institutionalEmailVerifiedAt ? "Verified" : "Institutional email"} status={profile.verificationStatuses?.email ?? "NOT_SUBMITTED"} />
        <VerificationSummary label="Identity" value="Identity" status={profile.verificationStatuses?.identity ?? "NOT_SUBMITTED"} />
        <VerificationSummary label="ORCID" value="" status={profile.verificationStatuses?.orcid ?? "NOT_SUBMITTED"} stateLabel={profile.academicIdentityLinks.some((link) => link.provider === "ORCID") ? "Connected" : "Not connected"} />
      </dl>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify academic position</DialogTitle>
            <DialogDescription>Submit evidence for your declared profile position. This does not grant a system role or reviewer privileges.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
              <dt className="text-slate-500">Current position</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{profile.positionTitle}</dd>
              <dt className="text-slate-500">Institution</dt><dd className="font-medium text-slate-800 dark:text-slate-200">{profile.affiliation.institutionName || "Not provided"}</dd>
            </dl>
            <div className="space-y-2">
              <Label htmlFor="position-evidence-method">Verification method</Label>
              <select id="position-evidence-method" value={method} onChange={(event) => { setMethod(event.target.value as EvidenceMethod); setError(""); }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="INSTITUTIONAL_EMAIL">Institutional email</option>
                <option value="INSTITUTIONAL_PROFILE">Institutional profile URL</option>
                <option value="DOCUMENT">Supporting document (PDF)</option>
                <option value="OTHER">Other evidence</option>
              </select>
            </div>
            {method === "INSTITUTIONAL_EMAIL" && <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">{institutionalEmailVerified ? `Verified email: ${privateAffiliation?.institutionalEmail}` : "Verify an institutional email in Identity before using this method."}</p>}
            {method === "INSTITUTIONAL_PROFILE" && <div className="space-y-2"><Label htmlFor="position-evidence-url">Institutional profile URL</Label><Input id="position-evidence-url" type="url" required value={reference} onChange={(event) => setReference(event.target.value)} placeholder="https://university.edu/staff/your-name" /></div>}
            {method === "DOCUMENT" && <div className="space-y-2"><Label htmlFor="position-evidence-file">Supporting PDF</Label><Input ref={fileInput} id="position-evidence-file" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0])} /><p className="text-xs text-slate-500">PDF only, up to 10 MB. Visible only to authorized administrators.</p>{file && <p className="flex items-center gap-1 text-xs text-slate-600"><FileText className="h-3.5 w-3.5" />{file.name}</p>}</div>}
            {method === "OTHER" && <div className="space-y-2"><Label htmlFor="position-evidence-other">Describe evidence or provide a reference</Label><textarea id="position-evidence-other" required maxLength={500} value={reference} onChange={(event) => setReference(event.target.value)} className="min-h-24 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" /></div>}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={request.isPending}>{request.isPending ? "Submitting…" : "Submit verification"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function VerificationSummary({ label, value, status, stateLabel }: { label: string; value: string; status: VerificationStatus; stateLabel?: string }) {
  return <div className="flex min-w-0 items-center justify-between gap-2"><dt className="min-w-0 truncate text-slate-500">{label}{value && <>: <span className="text-slate-700 dark:text-slate-300">{value}</span></>}</dt><dd><Badge variant="outline" className={`whitespace-nowrap text-[10px] ${stateLabel ? statusStyle.NOT_SUBMITTED : statusStyle[status]}`}>{stateLabel ?? statusLabel[status]}</Badge></dd></div>;
}
