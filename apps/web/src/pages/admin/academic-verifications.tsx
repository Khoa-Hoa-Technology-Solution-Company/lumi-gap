import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAcademicVerifications, useDecideAcademicVerification } from "@/features/academic-profile";

export function AdminAcademicVerificationsPage() {
  const { data, isLoading } = useAcademicVerifications();
  const decide = useDecideAcademicVerification();
  const [error, setError] = useState("");

  if (isLoading) return <p className="text-sm text-slate-500">Loading verification requests…</p>;
  const requests = data?.data ?? [];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Lecturer verification</h1><p className="mt-1 text-sm text-slate-500">Review institutional identity before granting trusted lecturer status.</p></div>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {requests.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No pending requests.</div> : requests.map((profile) => (
        <article key={profile.id} className="rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-950">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2"><h2 className="font-semibold">{profile.displayName}</h2><Badge>{profile.academicType}</Badge></div><p className="mt-1 text-sm text-slate-500">{profile.academicTitle || "Lecturer"} · {profile.department || "Department not provided"}</p><p className="text-sm text-slate-500">{profile.institution || "Institution not provided"} · {profile.institutionalEmail}</p></div>
            <div className="flex gap-2"><Button disabled={decide.isPending} onClick={() => decide.mutate({ profileId: profile.id, input: { decision: "approve" } }, { onError: () => setError("Could not approve this request.") })}>Approve</Button><Button variant="outline" disabled={decide.isPending} onClick={() => { const reason = window.prompt("Rejection reason"); if (reason?.trim()) decide.mutate({ profileId: profile.id, input: { decision: "reject", reason: reason.trim() } }, { onError: () => setError("Could not reject this request.") }); }}>Reject</Button></div>
          </div>
          {profile.bio && <p className="mt-4 text-sm leading-6 text-slate-700 dark:text-slate-300">{profile.bio}</p>}
          <div className="mt-4 flex flex-wrap gap-2">{profile.expertiseAreas.map((area) => <Badge key={area} variant="secondary">{area}</Badge>)}</div>
        </article>
      ))}
    </div>
  );
}
