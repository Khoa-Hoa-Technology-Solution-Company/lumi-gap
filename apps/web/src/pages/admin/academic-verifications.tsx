import { useState } from "react";
import type { AcademicProfile } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcademicVerifications, useDecideAcademicVerification } from "@/features/academic-profile";

export function AdminAcademicVerificationsPage() {
  const { data, isLoading, error } = useAcademicVerifications();
  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />;
  if (error) return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load verification requests.</p>;
  const requests = data?.data ?? [];
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Trust operations</p><h1 className="mt-1 text-2xl font-bold">Lecturer verification</h1><p className="mt-1 text-sm text-slate-500">Review private evidence and institutional identity before granting the public badge.</p></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Verification evidence is private. Do not copy institutional email, rejection details, or admin notes into public profile fields.</div>{requests.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No pending requests.</div> : <div className="space-y-4">{requests.map((profile) => <VerificationRequestCard key={profile.id} profile={profile} />)}</div>}</div>;
}

function VerificationRequestCard({ profile }: { profile: AcademicProfile }) {
  const decide = useDecideAcademicVerification();
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    setError("");
    if (mode === "reject" && !reason.trim()) { setError("A rejection reason is required."); return; }
    const input = mode === "approve"
      ? { decision: "approve" as const, method: "ADMIN_REVIEW", note: note.trim() || undefined }
      : { decision: "reject" as const, reason: reason.trim(), note: note.trim() || undefined };
    decide.mutate({ profileId: profile.id, input }, { onError: () => setError(`Could not ${mode} this request.`) });
  };
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-zinc-950"><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950 dark:text-white">{profile.displayName}</h2><Badge variant="secondary">{profile.academicType}</Badge><Badge variant="outline">{profile.verificationStatus}</Badge></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{profile.academicTitle || "Lecturer"} · {profile.affiliation.department || "Department not provided"}</p><p className="mt-1 text-sm text-slate-500">{profile.affiliation.institutionName || "Institution not provided"}</p>{profile.biography && <p className="mt-4 text-sm leading-6 text-slate-700 dark:text-slate-300">{profile.biography}</p>}<div className="mt-4 flex flex-wrap gap-2">{profile.expertiseAreas.map((area) => <Badge key={area} variant="secondary">{area}</Badge>)}</div><div className="mt-5 rounded-lg bg-slate-50 p-4 dark:bg-slate-900/60"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Private evidence</h3><dl className="mt-3 space-y-2 text-sm"><Evidence label="Institutional email" value={profile.affiliation.institutionalEmail || "Not provided"} />{profile.verificationEvidence.map((item, index) => <Evidence key={`${item.type}-${index}`} label={item.type.replaceAll("_", " ")} value={`${item.value || "No value"} · ${item.status}`} />)}</dl></div></div><div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-900"><button type="button" onClick={() => setMode("approve")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "approve" ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>Approve</button><button type="button" onClick={() => setMode("reject")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "reject" ? "bg-white text-red-700 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>Reject</button></div>{mode === "reject" && <div className="space-y-2"><Label>Reason shown to applicant</Label><Input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Explain what evidence is missing" /></div>}<div className="space-y-2"><Label>Internal admin note</Label><textarea className="min-h-24 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Never exposed publicly" /></div>{error && <p className="text-xs text-red-600">{error}</p>}<Button className="w-full" variant={mode === "reject" ? "outline" : "default"} disabled={decide.isPending} onClick={submit}>{decide.isPending ? "Saving decision…" : `${mode === "approve" ? "Approve" : "Reject"} verification`}</Button></div></div></article>;
}

function Evidence({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 sm:grid-cols-[10rem_1fr]"><dt className="text-slate-500">{label}</dt><dd className="break-all font-medium text-slate-800 dark:text-slate-200">{value}</dd></div>; }
