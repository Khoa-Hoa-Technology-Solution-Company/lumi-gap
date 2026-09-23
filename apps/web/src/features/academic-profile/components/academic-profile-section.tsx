import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  AcademicProfile,
  AcademicReviewType,
  AcademicVerificationStatus,
  FeaturedWorkSource,
  ResearchSupportType,
  UpdateAcademicProfileDetailsRequest,
} from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  ExternalLink,
  GraduationCap,
  HandHeart,
  MailCheck,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  useAcademicProfile,
  useInstitutionalEmailStatus,
  useRequestAcademicVerification,
  useRequestInstitutionalEmailChallenge,
  useUpdateAcademicProfile,
  useVerifyInstitutionalEmail,
} from "../hooks/use-academic-profile";

const statusStyle: Record<AcademicVerificationStatus, string> = {
  SELF_DECLARED: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  REJECTED: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
};

const academicTitles = ["Lecturer", "Senior Lecturer", "Assistant Professor", "Associate Professor", "Professor", "Research Fellow", "Other"] as const;
const supportOptions: Array<{ value: ResearchSupportType; label: string }> = [
  { value: "RESEARCH_DIRECTION", label: "Research direction" },
  { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "RESEARCH_GAP_VALIDATION", label: "Research-gap validation" },
  { value: "RESEARCH_METHODOLOGY", label: "Research methodology" },
  { value: "EXPERIMENT_DESIGN", label: "Experiment design" },
  { value: "DATA_ANALYSIS", label: "Data analysis" },
  { value: "ACADEMIC_WRITING", label: "Academic writing" },
  { value: "SOFTWARE_TECHNICAL_GUIDANCE", label: "Software technical guidance" },
];
const reviewOptions: Array<{ value: AcademicReviewType; label: string }> = [
  { value: "RESEARCH_PROPOSAL", label: "Research proposal" },
  { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "RESEARCH_GAP", label: "Research gap" },
  { value: "METHODOLOGY", label: "Methodology" },
  { value: "EXPERIMENTAL_RESULTS", label: "Experimental results" },
  { value: "RESEARCH_PAPER", label: "Research paper" },
  { value: "SOFTWARE_RESEARCH_PROJECT", label: "Software research project" },
];

type EditableWork = NonNullable<UpdateAcademicProfileDetailsRequest["featuredWorks"]>[number];

type FormState = {
  displayName: string;
  headline: string;
  biography: string;
  academicTitle: "" | (typeof academicTitles)[number];
  institutionName: string;
  rorId: string;
  department: string;
  position: string;
  startYear: string;
  institutionalEmail: string;
  researchInterests: string;
  expertiseAreas: string;
  skills: string;
  researchKeywords: string;
  orcid: string;
  github: string;
  openAlex: string;
  googleScholar: string;
  semanticScholar: string;
  featuredWorks: EditableWork[];
  supportEnabled: boolean;
  supportTypes: ResearchSupportType[];
  supportTopics: string;
  supportNote: string;
  reviewEnabled: boolean;
  reviewTypes: AcademicReviewType[];
  reviewTopics: string;
  reviewNote: string;
};

const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function toForm(profile: AcademicProfile): FormState {
  return {
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    biography: profile.biography ?? profile.bio ?? "",
    academicTitle: profile.academicTitle ?? "",
    institutionName: profile.affiliation.institutionName ?? profile.institution ?? "",
    rorId: profile.affiliation.rorId ?? "",
    department: profile.affiliation.department ?? profile.department ?? "",
    position: profile.affiliation.position ?? "",
    startYear: profile.affiliation.startYear?.toString() ?? "",
    institutionalEmail: profile.affiliation.institutionalEmail ?? profile.institutionalEmail ?? "",
    researchInterests: profile.researchInterests.join(", "),
    expertiseAreas: profile.expertiseAreas.join(", "),
    skills: profile.skills.join(", "),
    researchKeywords: profile.researchKeywords.join(", "),
    orcid: profile.externalIdentities.find((item) => item.provider === "ORCID")?.externalId
      ?? profile.externalIdentities.find((item) => item.provider === "ORCID")?.profileUrl ?? "",
    github: profile.externalIdentities.find((item) => item.provider === "GITHUB")?.profileUrl ?? "",
    openAlex: profile.externalIdentities.find((item) => item.provider === "OPENALEX")?.externalId
      ?? profile.externalIdentities.find((item) => item.provider === "OPENALEX")?.profileUrl ?? "",
    googleScholar: profile.externalIdentities.find((item) => item.provider === "GOOGLE_SCHOLAR")?.profileUrl ?? "",
    semanticScholar: profile.externalIdentities.find((item) => item.provider === "SEMANTIC_SCHOLAR")?.externalId
      ?? profile.externalIdentities.find((item) => item.provider === "SEMANTIC_SCHOLAR")?.profileUrl ?? "",
    featuredWorks: profile.featuredWorks.map(({ canonical: _canonical, ...work }) => work),
    supportEnabled: profile.supportAvailability.enabled,
    supportTypes: profile.supportAvailability.types,
    supportTopics: profile.supportAvailability.preferredTopics.join(", "),
    supportNote: profile.supportAvailability.note ?? "",
    reviewEnabled: profile.reviewAvailability.enabled,
    reviewTypes: profile.reviewAvailability.types,
    reviewTopics: profile.reviewAvailability.preferredTopics.join(", "),
    reviewNote: profile.reviewAvailability.note ?? "",
  };
}

export function AcademicProfileSection() {
  const { data, isLoading, error } = useAcademicProfile();
  const update = useUpdateAcademicProfile();
  const request = useRequestAcademicVerification();
  const emailStatus = useInstitutionalEmailStatus();
  const emailChallenge = useRequestInstitutionalEmailChallenge();
  const emailVerify = useVerifyInstitutionalEmail();
  const [form, setForm] = useState<FormState | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeDestination, setChallengeDestination] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const canRequest = data?.academicType === "lecturer"
    && emailStatus.data?.verified === true
    && (data.verificationStatus === "SELF_DECLARED" || data.verificationStatus === "REJECTED");

  if (isLoading) return <AcademicProfileSkeleton />;
  if (error || !data || !form) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load the academic profile.</p>;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const externalIdentities: NonNullable<UpdateAcademicProfileDetailsRequest["externalIdentities"]> = [];
    if (form.orcid) externalIdentities.push({ provider: "ORCID", externalId: form.orcid });
    if (form.github) externalIdentities.push({ provider: "GITHUB", profileUrl: form.github });
    if (form.openAlex) externalIdentities.push(/^https:\/\//i.test(form.openAlex)
      ? { provider: "OPENALEX", profileUrl: form.openAlex }
      : { provider: "OPENALEX", externalId: form.openAlex });
    if (form.googleScholar) externalIdentities.push({ provider: "GOOGLE_SCHOLAR", profileUrl: form.googleScholar });
    if (form.semanticScholar) externalIdentities.push(/^https:\/\//i.test(form.semanticScholar)
      ? { provider: "SEMANTIC_SCHOLAR", profileUrl: form.semanticScholar }
      : { provider: "SEMANTIC_SCHOLAR", externalId: form.semanticScholar });
    try {
      await update.mutateAsync({
        displayName: form.displayName.trim(),
        headline: form.headline || undefined,
        biography: form.biography || undefined,
        academicTitle: form.academicTitle || undefined,
        affiliation: {
          institutionName: form.institutionName || undefined,
          rorId: form.rorId || undefined,
          department: form.department || undefined,
          position: form.position || undefined,
          startYear: form.startYear ? Number(form.startYear) : undefined,
          institutionalEmail: form.institutionalEmail || undefined,
        },
        researchInterests: split(form.researchInterests),
        expertiseAreas: split(form.expertiseAreas),
        skills: split(form.skills),
        researchKeywords: split(form.researchKeywords),
        externalIdentities,
        featuredWorks: form.featuredWorks,
        supportAvailability: {
          enabled: form.supportEnabled,
          types: form.supportEnabled ? form.supportTypes : [],
          preferredTopics: split(form.supportTopics),
          note: form.supportNote || undefined,
        },
        reviewAvailability: {
          enabled: form.reviewEnabled,
          types: form.reviewEnabled ? form.reviewTypes : [],
          preferredTopics: split(form.reviewTopics),
          note: form.reviewNote || undefined,
        },
      });
      setMessage({ tone: "success", text: "Academic profile saved." });
    } catch {
      setMessage({ tone: "error", text: "Could not save. Check ORCID, ROR, email, and list limits." });
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Academic identity</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Edit academic profile</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Build a trustworthy research identity without exposing private verification data.</p>
        </div>
        <Badge variant="outline" className={`gap-1.5 px-3 py-1.5 ${statusStyle[data.verificationStatus]}`}>
          {data.verificationStatus === "VERIFIED" && <BadgeCheck className="h-3.5 w-3.5" />}
          {data.verificationStatus.replace("_", " ")}
        </Badge>
      </header>

      <Section icon={<UserRound />} title="Overview" description="How your academic identity is introduced across LumiGap.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Display name"><Input value={form.displayName} maxLength={120} required onChange={(event) => set("displayName", event.target.value)} placeholder="Your name" /></Field>
          <Field label="Headline"><Input value={form.headline} maxLength={180} onChange={(event) => set("headline", event.target.value)} placeholder="Empirical software engineering researcher" /></Field>
          <Field label="Academic title">
            <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-zinc-950" value={form.academicTitle} onChange={(event) => set("academicTitle", event.target.value as FormState["academicTitle"])}>
              <option value="">Select title</option>
              {academicTitles.map((title) => <option key={title} value={title}>{title}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Biography" hint={`${form.biography.length}/3000`}><textarea className="min-h-28 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm leading-6 dark:border-slate-700" maxLength={3000} value={form.biography} onChange={(event) => set("biography", event.target.value)} /></Field>
      </Section>

      <Section icon={<GraduationCap />} title="Academic identity" description="Institutional affiliation is reviewed independently from your selected account role.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Institution"><Input value={form.institutionName} onChange={(event) => set("institutionName", event.target.value)} /></Field>
          <Field label="ROR ID" hint="Optional"><Input value={form.rorId} onChange={(event) => set("rorId", event.target.value)} placeholder="https://ror.org/03yrm5c26" /></Field>
          <Field label="Department"><Input value={form.department} onChange={(event) => set("department", event.target.value)} /></Field>
          <Field label="Position"><Input value={form.position} onChange={(event) => set("position", event.target.value)} /></Field>
          <Field label="Start year"><Input type="number" min={1900} max={new Date().getFullYear()} value={form.startYear} onChange={(event) => set("startYear", event.target.value)} /></Field>
          <Field label="Institutional email" hint="Private by default"><Input type="email" value={form.institutionalEmail} onChange={(event) => set("institutionalEmail", event.target.value)} /></Field>
        </div>
        <InstitutionalEmailVerification
          savedEmail={data.affiliation.institutionalEmail}
          formEmail={form.institutionalEmail}
          status={emailStatus.data}
          code={verificationCode}
          challengeDestination={challengeDestination}
          pending={emailChallenge.isPending || emailVerify.isPending}
          onCode={setVerificationCode}
          onSend={async () => {
            setMessage(null);
            try {
              const result = await emailChallenge.mutateAsync();
              setChallengeDestination(result.email);
              setMessage({ tone: "success", text: `Verification code sent to ${result.email}.` });
            } catch {
              setMessage({ tone: "error", text: "Save a supported institutional email first, then try again." });
            }
          }}
          onVerify={async () => {
            setMessage(null);
            try {
              await emailVerify.mutateAsync(verificationCode);
              setVerificationCode("");
              setChallengeDestination(null);
              setMessage({ tone: "success", text: "Institutional email verified." });
            } catch {
              setMessage({ tone: "error", text: "The verification code is invalid or expired." });
            }
          }}
        />
      </Section>

      <Section icon={<BriefcaseBusiness />} title="Research expertise" description="Use concise, specific terms to support future expertise matching.">
        <div className="grid gap-4 md:grid-cols-2">
          <CommaField label="Research interests" value={form.researchInterests} onChange={(value) => set("researchInterests", value)} placeholder="Software Engineering, Artificial Intelligence" />
          <CommaField label="Expertise areas" value={form.expertiseAreas} onChange={(value) => set("expertiseAreas", value)} placeholder="Empirical Software Engineering, Automated Testing" />
          <CommaField label="Skills" value={form.skills} onChange={(value) => set("skills", value)} placeholder="Experimental Design, Python, Statistical Analysis" />
          <CommaField label="Research keywords" value={form.researchKeywords} onChange={(value) => set("researchKeywords", value)} placeholder="mutation testing, defect prediction" />
        </div>
      </Section>

      <Section icon={<BookOpen />} title="Research outputs" description="LumiGap papers use canonical metadata. Manually entered works remain self-asserted.">
        <FeaturedWorksEditor works={form.featuredWorks} onChange={(works) => set("featuredWorks", works)} />
      </Section>

      {data.academicType === "lecturer" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Section icon={<HandHeart />} title="Research support" description="Availability only. LumiGap will never auto-assign you.">
            <AvailabilityEditor enabled={form.supportEnabled} onEnabled={(value) => set("supportEnabled", value)} values={form.supportTypes} onValues={(value) => set("supportTypes", value)} options={supportOptions} topics={form.supportTopics} onTopics={(value) => set("supportTopics", value)} note={form.supportNote} onNote={(value) => set("supportNote", value)} />
          </Section>
          <Section icon={<ShieldCheck />} title="Academic review" description="Review preferences are separate from mentoring and support.">
            <AvailabilityEditor enabled={form.reviewEnabled} onEnabled={(value) => set("reviewEnabled", value)} values={form.reviewTypes} onValues={(value) => set("reviewTypes", value)} options={reviewOptions} topics={form.reviewTopics} onTopics={(value) => set("reviewTopics", value)} note={form.reviewNote} onNote={(value) => set("reviewNote", value)} />
          </Section>
        </div>
      )}

      <Section icon={<ExternalLink />} title="External identities" description="Manual links remain unverified until a real provider or admin verification step succeeds.">
        <div className="grid gap-4 lg:grid-cols-2">
          <IdentityField label="ORCID iD" priority="Primary" identity={data.externalIdentities.find((item) => item.provider === "ORCID")}><Input value={form.orcid} onChange={(event) => set("orcid", event.target.value)} placeholder="0000-0002-1825-0097" /></IdentityField>
          <IdentityField label="GitHub" priority="Recommended for Software / CS" identity={data.externalIdentities.find((item) => item.provider === "GITHUB")}><Input type="url" value={form.github} onChange={(event) => set("github", event.target.value)} placeholder="https://github.com/username" /></IdentityField>
          <IdentityField label="OpenAlex Author ID" priority="Recommended" identity={data.externalIdentities.find((item) => item.provider === "OPENALEX")}><Input value={form.openAlex} onChange={(event) => set("openAlex", event.target.value)} placeholder="A123456789" /></IdentityField>
          <IdentityField label="Google Scholar" priority="Optional" identity={data.externalIdentities.find((item) => item.provider === "GOOGLE_SCHOLAR")}><Input type="url" value={form.googleScholar} onChange={(event) => set("googleScholar", event.target.value)} placeholder="https://scholar.google.com/citations?user=..." /></IdentityField>
          <IdentityField label="Semantic Scholar" priority="Optional" identity={data.externalIdentities.find((item) => item.provider === "SEMANTIC_SCHOLAR")}><Input value={form.semanticScholar} onChange={(event) => set("semanticScholar", event.target.value)} placeholder="Author ID or https://www.semanticscholar.org/author/..." /></IdentityField>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">Added means self-asserted. A verified connection requires OAuth or a trusted system check. ORCID linked never means Lecturer verified.</p>
      </Section>

      <Section icon={<BadgeCheck />} title="Verification" description="Lecturer verification is an admin-reviewed trust decision.">
        <VerificationPanel profile={data} canRequest={canRequest} pending={request.isPending} onRequest={async () => {
          setMessage(null);
          try {
            await request.mutateAsync();
            setMessage({ tone: "success", text: "Verification request submitted for admin review." });
          } catch {
            setMessage({ tone: "error", text: "Verify your institutional email and complete institution details before requesting verification." });
          }
        }} />
      </Section>

      {message && <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message.text}</p>}
      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" disabled={update.isPending} className="gap-2 shadow-lg"><Save className="h-4 w-4" />{update.isPending ? "Saving…" : "Save academic profile"}</Button>
      </div>
    </form>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-zinc-950"><div className="mb-5 flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 [&>svg]:h-4 [&>svg]:w-4 dark:bg-blue-950/40 dark:text-blue-300">{icon}</span><div><h3 className="font-semibold text-slate-950 dark:text-white">{title}</h3><p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p></div></div><div className="space-y-4">{children}</div></section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label>{label}</Label>{hint && <span className="text-[11px] text-slate-400">{hint}</span>}</div>{children}</div>;
}

function CommaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const count = useMemo(() => split(value).length, [value]);
  return <Field label={label} hint={`${count} items`}><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><p className="text-[11px] text-slate-400">Separate values with commas.</p></Field>;
}

function AvailabilityEditor<T extends string>({ enabled, onEnabled, values, onValues, options, topics, onTopics, note, onNote }: { enabled: boolean; onEnabled: (value: boolean) => void; values: T[]; onValues: (value: T[]) => void; options: Array<{ value: T; label: string }>; topics: string; onTopics: (value: string) => void; note: string; onNote: (value: string) => void }) {
  const toggle = (value: T) => onValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  return <><label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-semibold dark:border-slate-700"><input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} className="h-4 w-4 accent-blue-600" />Open to requests</label>{enabled && <><div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <label key={option.value} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:text-slate-300"><input type="checkbox" className="mt-0.5 accent-blue-600" checked={values.includes(option.value)} onChange={() => toggle(option.value)} />{option.label}</label>)}</div><CommaField label="Preferred topics" value={topics} onChange={onTopics} placeholder="NLP, software testing" /><Field label="Availability note"><textarea className="min-h-20 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" maxLength={1000} value={note} onChange={(event) => onNote(event.target.value)} /></Field></>}</>;
}

function FeaturedWorksEditor({ works, onChange }: { works: EditableWork[]; onChange: (works: EditableWork[]) => void }) {
  const [draft, setDraft] = useState({ paperId: "", title: "", doi: "", year: "", source: "MANUAL" as FeaturedWorkSource });
  const add = () => {
    if (draft.source === "LUMIGAP" && !draft.paperId) return;
    if (draft.source !== "LUMIGAP" && !draft.title && !draft.doi) return;
    onChange([...works, { paperId: draft.paperId || undefined, title: draft.title || undefined, doi: draft.doi || undefined, year: draft.year ? Number(draft.year) : undefined, source: draft.source }]);
    setDraft({ paperId: "", title: "", doi: "", year: "", source: "MANUAL" });
  };
  return <div className="space-y-3">{works.map((work, index) => <div key={`${work.paperId ?? work.doi ?? work.title}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div><p className="text-sm font-medium text-slate-900 dark:text-white">{work.title || work.paperId || work.doi}</p><p className="mt-1 text-xs text-slate-500">{work.source}{work.year ? ` · ${work.year}` : ""}{work.doi ? ` · ${work.doi}` : ""}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Remove work" onClick={() => onChange(works.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}<div className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-900/60 md:grid-cols-2"><Field label="Source"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-zinc-950" value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value as FeaturedWorkSource }))}><option value="MANUAL">Manual</option><option value="LUMIGAP">LumiGap paper</option><option value="ORCID">Imported from ORCID</option></select></Field>{draft.source === "LUMIGAP" ? <Field label="LumiGap Paper ID"><Input value={draft.paperId} onChange={(event) => setDraft((current) => ({ ...current, paperId: event.target.value }))} /></Field> : <><Field label="Title"><Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></Field><Field label="DOI"><Input value={draft.doi} onChange={(event) => setDraft((current) => ({ ...current, doi: event.target.value }))} /></Field><Field label="Year"><Input type="number" value={draft.year} onChange={(event) => setDraft((current) => ({ ...current, year: event.target.value }))} /></Field></>}<div className="flex items-end"><Button type="button" variant="outline" className="gap-2" onClick={add} disabled={works.length >= 10}><Plus className="h-4 w-4" />Add featured work</Button></div></div></div>;
}

function IdentityField({
  label,
  priority,
  identity,
  children,
}: {
  label: string;
  priority: string;
  identity?: AcademicProfile["externalIdentities"][number];
  children: ReactNode;
}) {
  const state = identity?.status === "VERIFIED"
    ? "Verified connection"
    : identity?.status === "LINKED"
      ? "Linked"
      : identity
        ? "Added · unverified"
        : "Not added";
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>{label}</Label>
          <p className="mt-1 text-[11px] text-slate-500">{priority}</p>
        </div>
        <Badge variant="outline" className={identity?.status === "VERIFIED" ? statusStyle.VERIFIED : "text-slate-500"}>{state}</Badge>
      </div>
      {children}
    </div>
  );
}

function InstitutionalEmailVerification({
  savedEmail,
  formEmail,
  status,
  code,
  challengeDestination,
  pending,
  onCode,
  onSend,
  onVerify,
}: {
  savedEmail?: string;
  formEmail: string;
  status?: { verified: boolean; trustedInstitution: boolean; institutionName?: string };
  code: string;
  challengeDestination: string | null;
  pending: boolean;
  onCode: (value: string) => void;
  onSend: () => void;
  onVerify: () => void;
}) {
  const hasUnsavedEmail = formEmail.trim().toLowerCase() !== (savedEmail ?? "").trim().toLowerCase();
  if (status?.verified && !hasUnsavedEmail) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div><p className="text-sm font-semibold">Institutional email verified</p><p className="mt-1 text-xs">{status.institutionName ?? "Trusted institution"}. This is necessary evidence, but it does not verify Lecturer status by itself.</p></div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-900 dark:text-white">Verify institutional email</p><p className="mt-1 text-xs text-slate-500">Only registered institution domains are accepted. Save email changes before sending a code.</p></div>
        <Button type="button" variant="outline" disabled={pending || !savedEmail || hasUnsavedEmail} onClick={onSend}>Send code</Button>
      </div>
      {challengeDestination && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => onCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" aria-label="Institutional email verification code" />
          <Button type="button" disabled={pending || code.length !== 6} onClick={onVerify}>Verify email</Button>
        </div>
      )}
    </div>
  );
}

function VerificationPanel({ profile, canRequest, pending, onRequest }: { profile: AcademicProfile; canRequest: boolean; pending: boolean; onRequest: () => void }) {
  return <div className={`rounded-xl border p-4 ${statusStyle[profile.verificationStatus]}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{profile.verificationStatus.replace("_", " ")}</p><p className="mt-1 text-xs opacity-80">Verified institutional email is required. ORCID, GitHub, or the Lecturer profile type alone never grants this badge.</p></div>{canRequest && <Button type="button" variant="outline" disabled={pending} onClick={onRequest}>{pending ? "Submitting…" : "Request verification"}</Button>}</div>{profile.verificationStatus === "REJECTED" && profile.verification.rejectionReason && <p className="mt-3 border-t border-current/15 pt-3 text-sm">Reason: {profile.verification.rejectionReason}</p>}</div>;
}

function AcademicProfileSkeleton() {
  return <div className="space-y-5" role="status" aria-label="Loading academic profile">{[120, 240, 220].map((height) => <div key={height} className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" style={{ height }} />)}</div>;
}
