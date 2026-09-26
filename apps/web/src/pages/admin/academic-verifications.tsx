import { useState } from "react";
import { Download, ExternalLink, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAcademicVerificationDetails,
  useAcademicVerificationEvidenceFile,
  useAcademicVerifications,
  useDecideAcademicVerification,
} from "@/features/academic-profile";

export function AdminAcademicVerificationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error } = useAcademicVerifications();
  const detail = useAcademicVerificationDetails(selectedId);
  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />;
  if (error) return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load verification requests.</p>;
  const requests = data?.data ?? [];
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Trust operations</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Academic position verification</h1>
        <p className="mt-1 text-sm text-slate-500">Review declared positions against private supporting evidence. Approval verifies profile information only, never system permissions.</p>
      </header>
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Evidence is private. Access is restricted to administrators and audited. Do not copy private evidence into public profile fields.</p>
      {requests.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">No pending verification requests.</div> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900"><tr>{["User", "Position", "Institution", "Method", "Submitted", "Status", ""].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requests.map(({ profile, request }) => <tr key={request.id} className="text-slate-700 dark:text-slate-200">
                <td className="px-4 py-3"><span className="font-medium">{profile.displayName}</span><span className="mt-0.5 block text-xs text-slate-500">{profile.affiliation.institutionalEmail || ""}</span></td>
                <td className="px-4 py-3">{request.type === "POSITION" ? request.targetValue || profile.positionTitle || "Not provided" : "Affiliation review"}</td>
                <td className="px-4 py-3">{String(request.metadata?.institutionName || profile.affiliation.institutionName || "Not provided")}</td>
                <td className="px-4 py-3">{evidenceMethod(request.evidenceType)}</td>
                <td className="px-4 py-3 tabular-nums">{new Date(request.submittedAt).toLocaleString()}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Pending</Badge></td>
                <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => setSelectedId(request.id)}>Review</Button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Review academic verification</DialogTitle><DialogDescription>Confirm the evidence supports the declared information listed below.</DialogDescription></DialogHeader>
          {detail.isLoading ? <div className="h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" /> : detail.error || !detail.data ? <p role="alert" className="text-sm text-red-600">Could not load this request.</p> : <ReviewDetail item={detail.data} onDone={() => setSelectedId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewDetail({ item, onDone }: { item: NonNullable<ReturnType<typeof useAcademicVerificationDetails>["data"]>; onDone: () => void }) {
  const decide = useDecideAcademicVerification();
  const evidenceFile = useAcademicVerificationEvidenceFile();
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const { profile, request, history } = item;
  const subject = request.type === "POSITION" ? "position" : "affiliation";

  async function submit() {
    setError("");
    if (mode === "reject" && !reason.trim()) { setError("A rejection reason is required."); return; }
    try {
      await decide.mutateAsync({ requestId: request.id, input: mode === "approve"
        ? { decision: "approve", method: "ADMIN_REVIEW", note: note.trim() || undefined }
        : { decision: "reject", reason: reason.trim(), note: note.trim() || undefined } });
      onDone();
    } catch {
      setError("Could not save this decision. The position may have changed or another administrator may have reviewed it.");
    }
  }

  async function downloadEvidence() {
    setError("");
    try {
      const blob = await evidenceFile.mutateAsync(request.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = request.evidenceFileName || "position-evidence.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not retrieve private evidence.");
    }
  }

  return (
    <div className="space-y-5">
      <dl className="grid gap-x-5 gap-y-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-slate-900">
        <Detail label="User" value={profile.displayName} /><Detail label={request.type === "POSITION" ? "Position" : "Affiliation"} value={request.targetValue || profile.positionTitle || "Not provided"} />
        <Detail label="Institution" value={String(request.metadata?.institutionName || profile.affiliation.institutionName || "Not provided")} /><Detail label="Method" value={evidenceMethod(request.evidenceType)} />
        <Detail label="Submitted" value={new Date(request.submittedAt).toLocaleString()} /><Detail label="Status" value={request.status} />
      </dl>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Submitted evidence</h3>
        {request.reference && request.evidenceType !== "OTHER" && <EvidenceReference value={request.reference} />}
        {request.evidenceFileName && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"><span>{request.evidenceFileName} <span className="text-xs text-slate-500">{request.evidenceSizeBytes ? `${(request.evidenceSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}</span></span><Button size="sm" variant="outline" disabled={evidenceFile.isPending} onClick={() => void downloadEvidence()}><Download className="mr-1.5 h-4 w-4" />{evidenceFile.isPending ? "Loading…" : "Download private PDF"}</Button></div>}
        {!request.reference && !request.evidenceFileName && request.evidenceType === "INSTITUTIONAL_EMAIL" && <p className="text-sm text-slate-600 dark:text-slate-300">Institutional email verified: {profile.affiliation.institutionalEmail || "email address unavailable"}</p>}
        {request.evidenceType === "OTHER" && request.reference && <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{request.reference}</p>}
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{subject === "position" ? "Position" : "Affiliation"} verification history</h3>
        <ol className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {history.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span>{entry.evidenceType.replaceAll("_", " ")} · {new Date(entry.submittedAt).toLocaleDateString()}</span><Badge variant="outline">{entry.status.replaceAll("_", " ")}</Badge>{entry.rejectionReason && <p className="w-full text-xs text-red-700">{entry.rejectionReason}</p>}</li>)}
        </ol>
      </section>
      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-900"><button type="button" onClick={() => setMode("approve")} aria-pressed={mode === "approve"} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "approve" ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>Approve</button><button type="button" onClick={() => setMode("reject")} aria-pressed={mode === "reject"} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "reject" ? "bg-white text-red-700 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>Reject</button></div>
        {mode === "reject" && <div className="space-y-2"><Label htmlFor="verification-rejection-reason">Reason for applicant</Label><Input id="verification-rejection-reason" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Explain what evidence is missing" /></div>}
        <div className="space-y-2"><Label htmlFor="verification-admin-note">Internal admin note</Label><textarea id="verification-admin-note" className="min-h-20 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Private, not shown on the profile" /></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" variant={mode === "reject" ? "outline" : "default"} disabled={decide.isPending || evidenceFile.isPending} onClick={() => void submit()}><ShieldCheck className="mr-1.5 h-4 w-4" />{decide.isPending ? "Saving decision…" : mode === "approve" ? `Approve ${subject}` : `Reject ${subject} request`}</Button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 break-words font-medium text-slate-800 dark:text-slate-200">{value}</dd></div>; }
function EvidenceReference({ value }: { value: string }) {
  let url: URL | null = null;
  try { const parsed = new URL(value); if (["https:", "http:"].includes(parsed.protocol)) url = parsed; } catch { /* Render non-URL evidence as text. */ }
  return url ? <a href={url.toString()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-sm text-blue-700 underline dark:text-blue-300">{url.toString()}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a> : <p className="whitespace-pre-wrap break-all text-sm text-slate-700 dark:text-slate-300">{value}</p>;
}
function evidenceMethod(value: string) { return ({ INSTITUTIONAL_EMAIL: "Institutional email", INSTITUTIONAL_PROFILE: "Institutional profile", DOCUMENT: "Supporting document", ORCID: "ORCID", EXTERNAL_ACADEMIC_PROFILE: "Academic profile", OTHER: "Other evidence" } as Record<string, string>)[value] ?? value.replaceAll("_", " "); }
