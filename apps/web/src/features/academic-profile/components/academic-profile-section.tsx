import { useEffect, useState, type FormEvent } from "react";
import type { AcademicProfile, AcademicVerificationStatus } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcademicProfile, useRequestAcademicVerification, useUpdateAcademicProfile } from "../hooks/use-academic-profile";

const statusStyle: Record<AcademicVerificationStatus, string> = {
  SELF_DECLARED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  VERIFIED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

const supportTypes = ["RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_GAP_VALIDATION", "METHODOLOGY", "EXPERIMENT_DESIGN", "DATA_ANALYSIS", "ACADEMIC_WRITING", "PAPER_REVIEW", "SOFTWARE_TECHNICAL_REVIEW"] as const;
const reviewTypes = ["RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "RESEARCH_GAP", "METHODOLOGY", "EXPERIMENT_REPORT", "MANUSCRIPT", "SOFTWARE_RESEARCH_PROJECT"] as const;
const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export function AcademicProfileSection() {
  const { data, isLoading, error } = useAcademicProfile();
  const update = useUpdateAcademicProfile();
  const request = useRequestAcademicVerification();
  const [form, setForm] = useState({ bio: "", department: "", academicTitle: "", institutionalEmail: "", expertise: "", skills: "", orcid: "", github: "", supportEnabled: false, supportTopics: "", supportNote: "", reviewEnabled: false, reviewTopics: "", reviewNote: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!data) return;
    setForm({
      bio: data.bio ?? "", department: data.department ?? "", academicTitle: data.academicTitle ?? "",
      institutionalEmail: data.institutionalEmail ?? "", expertise: data.expertiseAreas.join(", "), skills: data.skills.join(", "),
      orcid: data.externalIdentities.find((identity) => identity.provider === "ORCID")?.profileUrl ?? "",
      github: data.externalIdentities.find((identity) => identity.provider === "GITHUB")?.profileUrl ?? "",
      supportEnabled: data.supportAvailability.enabled, supportTopics: data.supportAvailability.preferredTopics.join(", "), supportNote: data.supportAvailability.note ?? "",
      reviewEnabled: data.reviewAvailability.enabled, reviewTopics: data.reviewAvailability.preferredTopics.join(", "), reviewNote: data.reviewAvailability.note ?? "",
    });
  }, [data]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading academic profile…</p>;
  if (error || !data) return <p className="text-sm text-red-600">Unable to load the academic profile.</p>;

  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    try {
      const externalIdentities: Array<{ provider: "ORCID" | "GITHUB"; profileUrl?: string }> = [];
      if (form.orcid) externalIdentities.push({ provider: "ORCID", profileUrl: form.orcid });
      if (form.github) externalIdentities.push({ provider: "GITHUB", profileUrl: form.github });
      await update.mutateAsync({
        bio: form.bio, department: form.department, academicTitle: form.academicTitle,
        institutionalEmail: form.institutionalEmail || undefined, expertiseAreas: split(form.expertise), skills: split(form.skills), externalIdentities,
        supportAvailability: { enabled: form.supportEnabled, types: form.supportEnabled ? [...supportTypes] : [], preferredTopics: split(form.supportTopics), note: form.supportNote },
        reviewAvailability: { enabled: form.reviewEnabled, types: form.reviewEnabled ? [...reviewTypes] : [], preferredTopics: split(form.reviewTopics), note: form.reviewNote },
      });
      setMessage("Academic profile saved.");
    } catch { setMessage("Could not save the academic profile. Check the fields and try again."); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div><h2 className="text-xl font-bold">Academic profile</h2><p className="mt-1 text-sm text-slate-500">Research identity, expertise, and availability.</p></div>
        <Badge className={statusStyle[data.verificationStatus]}>{data.verificationStatus.replace("_", " ")}</Badge>
      </div>
      {data.verificationStatus === "REJECTED" && data.rejectionReason && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Rejected: {data.rejectionReason}</p>}
      <form onSubmit={save} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department"><Input value={form.department} onChange={(e) => set("department", e.target.value)} /></Field>
          <Field label="Academic title"><Input value={form.academicTitle} onChange={(e) => set("academicTitle", e.target.value)} /></Field>
          <Field label="Institutional email"><Input type="email" value={form.institutionalEmail} onChange={(e) => set("institutionalEmail", e.target.value)} /></Field>
          <Field label="Expertise areas (comma separated)"><Input value={form.expertise} onChange={(e) => set("expertise", e.target.value)} /></Field>
          <Field label="Skills (comma separated)"><Input value={form.skills} onChange={(e) => set("skills", e.target.value)} /></Field>
          <Field label="ORCID profile URL"><Input type="url" placeholder="https://orcid.org/…" value={form.orcid} onChange={(e) => set("orcid", e.target.value)} /></Field>
          <Field label="GitHub profile URL"><Input type="url" placeholder="https://github.com/…" value={form.github} onChange={(e) => set("github", e.target.value)} /></Field>
        </div>
        <Field label="Biography"><textarea className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
        {data.academicType === "lecturer" && <div className="grid gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 lg:grid-cols-2">
          <Availability title="Research support" enabled={form.supportEnabled} onEnabled={(value) => set("supportEnabled", value)} topics={form.supportTopics} onTopics={(value) => set("supportTopics", value)} note={form.supportNote} onNote={(value) => set("supportNote", value)} />
          <Availability title="Academic review" enabled={form.reviewEnabled} onEnabled={(value) => set("reviewEnabled", value)} topics={form.reviewTopics} onTopics={(value) => set("reviewTopics", value)} note={form.reviewNote} onNote={(value) => set("reviewNote", value)} />
        </div>}
        {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save academic profile"}</Button>
          {data.academicType === "lecturer" && ["SELF_DECLARED", "REJECTED"].includes(data.verificationStatus) && <Button type="button" variant="outline" disabled={request.isPending} onClick={async () => { try { await request.mutateAsync(); setMessage("Verification request submitted."); } catch { setMessage("Add institution, department, and institutional email before requesting verification."); } }}>{request.isPending ? "Submitting…" : "Request verification"}</Button>}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Availability({ title, enabled, onEnabled, topics, onTopics, note, onNote }: { title: string; enabled: boolean; onEnabled: (value: boolean) => void; topics: string; onTopics: (value: string) => void; note: string; onNote: (value: string) => void }) {
  return <div className="space-y-3"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />{title}</label><Field label="Preferred topics"><Input value={topics} onChange={(e) => onTopics(e.target.value)} placeholder="NLP, data ethics" /></Field><Field label="Note"><textarea className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={note} onChange={(e) => onNote(e.target.value)} /></Field></div>;
}
