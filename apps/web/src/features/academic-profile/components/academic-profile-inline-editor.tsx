import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ACADEMIC_POSITION_OPTIONS, ACADEMIC_BIOGRAPHY_MAX_CHARACTERS, ACADEMIC_BIOGRAPHY_MAX_WORDS, countAcademicBiographyWords, type AcademicAvailability, type AcademicProfile, type AcademicReviewType, type ResearchSupportType, type UpdateAcademicProfileDetailsRequest } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { authApi } from "@/features/auth/api/auth.api";
import { toast } from "sonner";
import { useUpdateAcademicProfile, useSetPublicHandle, useUploadAcademicCover, useRemoveAcademicCover } from "../hooks/use-academic-profile";
import { ResearchFocusFields, ResearchTagField } from "./research-focus-fields";
import { FeaturedWorksEditor, editableWork } from "./featured-works-editor";
import { combineAcademicBio } from "../utils/academic-bio";

export type EditSection = "intro" | "cover" | "research" | "works" | "affiliation" | "availability" | "link";
type WorkInput = NonNullable<UpdateAcademicProfileDetailsRequest["featuredWorks"]>[number];
export function suggestPublicHandle(name: string): string {
  return name.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
function errorMessage(error: unknown): string {
  return (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? "Could not save these changes.";
}
const supportOptions: Array<{ value: ResearchSupportType; label: string }> = [
  { value: "RESEARCH_DIRECTION", label: "Research direction" }, { value: "LITERATURE_REVIEW", label: "Literature review" }, { value: "RESEARCH_GAP_VALIDATION", label: "Research gap validation" }, { value: "RESEARCH_METHODOLOGY", label: "Research methodology" }, { value: "EXPERIMENT_DESIGN", label: "Experiment design" }, { value: "DATA_ANALYSIS", label: "Data analysis" }, { value: "ACADEMIC_WRITING", label: "Academic writing" }, { value: "SOFTWARE_TECHNICAL_GUIDANCE", label: "Software guidance" },
];
const reviewOptions: Array<{ value: AcademicReviewType; label: string }> = [
  { value: "RESEARCH_PROPOSAL", label: "Research proposal" }, { value: "LITERATURE_REVIEW", label: "Literature review" }, { value: "THESIS_DRAFT", label: "Thesis draft" }, { value: "RESEARCH_GAP", label: "Research gap" }, { value: "METHODOLOGY", label: "Methodology" }, { value: "EXPERIMENTAL_RESULTS", label: "Experimental results" }, { value: "RESEARCH_PAPER", label: "Research paper" }, { value: "SOFTWARE_RESEARCH_PROJECT", label: "Software research project" },
];

export function AcademicProfileInlineEditor({ section, profile, onClose }: { section: EditSection; profile: AcademicProfile; onClose: () => void }) {
  const { t } = useI18n();
  const update = useUpdateAcademicProfile(), setHandle = useSetPublicHandle(), uploadCover = useUploadAcademicCover(), removeCover = useRemoveAcademicCover();
  const [message, setMessage] = useState("");
  const [areas, setAreas] = useState(profile.expertiseAreas), [interests, setInterests] = useState(profile.researchInterests), [skills, setSkills] = useState(profile.skills), [keywords, setKeywords] = useState(profile.researchKeywords);
  const [works, setWorks] = useState<WorkInput[]>(() => profile.featuredWorks.map(editableWork));
  const [institutionName, setInstitutionName] = useState(profile.affiliation.institutionName ?? "");
  const [academicRole, setAcademicRole] = useState<"STUDENT" | "RESEARCHER" | "LECTURER">(profile.academicRole ?? (profile.academicType === "student" ? "STUDENT" : profile.academicType === "lecturer" ? "LECTURER" : "RESEARCHER"));
  const [programName, setProgramName] = useState(profile.affiliation.programName ?? ""), [position, setPosition] = useState(profile.positionTitle ?? ""), [department, setDepartment] = useState(profile.affiliation.department ?? "");
  const [name, setName] = useState(profile.displayName), [bio, setBio] = useState(combineAcademicBio(profile.headline, profile.biography, profile.bio));
  const [visibility, setVisibility] = useState(profile.profileVisibility), [privacy, setPrivacy] = useState(profile.privacy);
  const [discoverable, setDiscoverable] = useState(profile.discoverability.showInResearcherSearch), [collaboration, setCollaboration] = useState(profile.discoverability.allowCollaborationRequests);
  const [support, setSupport] = useState(profile.supportAvailability), [review, setReview] = useState(profile.reviewAvailability);
  const [handle, setHandleInput] = useState(profile.publicHandle ?? suggestPublicHandle(profile.displayName));
  const [coverFile, setCoverFile] = useState<File | null>(null), [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [institutionQuery, setInstitutionQuery] = useState(institutionName);
  useEffect(() => { const timer = setTimeout(() => setInstitutionQuery(institutionName), 200); return () => clearTimeout(timer); }, [institutionName]);
  const institutions = useQuery({ queryKey: ["academic-profile", "institutions", institutionQuery], queryFn: () => authApi.academicOnboardingOptions({ q: institutionQuery }), enabled: section === "affiliation", staleTime: 60_000 });
  useEffect(() => { if (!coverFile) { setCoverPreview(null); return; } const url = URL.createObjectURL(coverFile); setCoverPreview(url); return () => URL.revokeObjectURL(url); }, [coverFile]);
  const busy = update.isPending || setHandle.isPending || uploadCover.isPending || removeCover.isPending;
  function patch(): UpdateAcademicProfileDetailsRequest {
    switch (section) {
      case "intro": return { displayName: name.trim(), biography: bio.trim(), headline: "", profileVisibility: visibility, privacy, discoverability: { showInResearcherSearch: discoverable, allowCollaborationRequests: collaboration } };
      case "research": return { expertiseAreas: areas, researchInterests: interests, skills, researchKeywords: keywords };
      case "works": return { featuredWorks: works };
      case "affiliation": {
        const selected = institutions.data?.institutions?.find(item => item.name.toLocaleLowerCase() === institutionName.trim().toLocaleLowerCase());
        const sameInstitution = institutionName.trim().toLocaleLowerCase() === profile.affiliation.institutionName?.trim().toLocaleLowerCase();
        const institutionId = selected?.id ?? (sameInstitution ? profile.affiliation.institutionId : undefined);
        return { academicRole, ...(academicRole !== "STUDENT" ? { positionTitle: position.trim() } : {}), affiliation: { ...(institutionId ? { institutionId } : {}), institutionName: institutionName.trim(), department: department.trim(), ...(academicRole === "STUDENT" ? { programName: programName.trim() } : {}) } };
      }
      case "availability": return { supportAvailability: support, ...(academicRole === "LECTURER" ? { reviewAvailability: review } : {}) };
      default: return {};
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (section === "affiliation" && (!institutionName.trim() || (academicRole === "STUDENT" ? !programName.trim() : !position.trim()))) { setMessage(t(academicRole === "STUDENT" ? "Institution and program / major are required." : "Institution / organization and current position are required.")); return; }
    if (section === "intro" && (bio.length > ACADEMIC_BIOGRAPHY_MAX_CHARACTERS || countAcademicBiographyWords(bio) > ACADEMIC_BIOGRAPHY_MAX_WORDS)) { setMessage(t("Biography is too long.")); return; }
    try {
      if (section === "link") await setHandle.mutateAsync(handle.trim().toLowerCase());
      else if (section === "cover") { if (!coverFile) return; await uploadCover.mutateAsync(coverFile); }
      else await update.mutateAsync(patch());
      toast.success(t("Profile changes saved")); onClose();
    } catch (error) { setMessage(t(errorMessage(error))); }
  }
  const student = academicRole === "STUDENT";
  return <form onSubmit={save} className="space-y-5">
    {section === "intro" && <><Field label={t("Full name")}><Input value={name} maxLength={120} required disabled={profile.displayNamePolicy?.remainingChanges === 0} onChange={event => setName(event.target.value)} /></Field><p className="text-xs text-muted-foreground">{t("{{remaining}} of {{max}} display name changes available in the last {{days}} days.", { remaining: profile.displayNamePolicy?.remainingChanges ?? 2, max: profile.displayNamePolicy?.maxChanges ?? 2, days: profile.displayNamePolicy?.windowDays ?? 30 })}</p><Field label={`${t("Academic Biography")} (${t("Optional")})`}><textarea className="min-h-32 w-full rounded-md border bg-background p-3 text-sm" maxLength={ACADEMIC_BIOGRAPHY_MAX_CHARACTERS} value={bio} onChange={event => setBio(event.target.value)} /></Field><p className="text-xs text-muted-foreground">{countAcademicBiographyWords(bio)} / {ACADEMIC_BIOGRAPHY_MAX_WORDS} {t("words")}</p><Field label={t("Profile visibility")}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)}><option value="PUBLIC">{t("Public")}</option><option value="MEMBERS_ONLY">{t("LumiGap members")}</option><option value="PRIVATE">{t("Private")}</option></select></Field><div className="space-y-3">{(["expertise", "researchInterests", "orcid"] as const).map(key => <Field key={key} label={t(key === "expertise" ? "Research focus visibility" : key === "researchInterests" ? "Research interests visibility" : "Legacy ORCID visibility")}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={privacy[key]} onChange={event => setPrivacy(current => ({ ...current, [key]: event.target.value }))}><option value="PUBLIC">{t("Public")}</option><option value="REGISTERED_USERS">{t("LumiGap members")}</option><option value="PRIVATE">{t("Private")}</option></select></Field>)}</div><label className="flex gap-2 text-sm"><input type="checkbox" checked={discoverable} onChange={event => setDiscoverable(event.target.checked)} />{t("Show in researcher search")}</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={collaboration} onChange={event => setCollaboration(event.target.checked)} />{t("Allow collaboration requests")}</label></>}
    {section === "research" && <ResearchFocusFields areas={areas} interests={interests} skills={skills} keywords={keywords} onAreas={setAreas} onInterests={setInterests} onSkills={setSkills} onKeywords={setKeywords} />}
    {section === "works" && <FeaturedWorksEditor original={profile.featuredWorks} values={works} onChange={setWorks} />}
    {section === "affiliation" && <><Field label={t("Academic Role")}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={academicRole} onChange={event => { const role = event.target.value as typeof academicRole; setAcademicRole(role); setPosition(role === "LECTURER" ? "Lecturer" : role === "RESEARCHER" ? "Research Staff" : "Student"); }}><option value="STUDENT">{t("Student")}</option><option value="RESEARCHER">{t("Researcher")}</option><option value="LECTURER">{t("Lecturer")}</option></select></Field><Field label={`${t("Institution / organization")} *`}><Input list="profile-institutions" value={institutionName} maxLength={200} required onChange={event => setInstitutionName(event.target.value)} /><datalist id="profile-institutions">{institutions.data?.institutions?.map(item => <option key={item.id} value={item.name} />)}</datalist></Field>{student ? <Field label={`${t("Program / Major / Field of Study")} *`}><Input value={programName} maxLength={160} required onChange={event => setProgramName(event.target.value)} /></Field> : <Field label={`${t("Current Position")} *`}><Input list="profile-position-options" value={position} maxLength={160} required onChange={event => setPosition(event.target.value)} /><datalist id="profile-position-options">{ACADEMIC_POSITION_OPTIONS.filter(option => option.category === (academicRole === "LECTURER" ? "LECTURER" : "RESEARCH_STAFF") || option.title === "Independent Researcher").map(option => <option key={option.title} value={option.title} />)}</datalist></Field>}{!student && <Field label={`${t("Department")} (${t("Optional")})`}><Input value={department} maxLength={200} onChange={event => setDepartment(event.target.value)} /></Field>}<p className="text-xs leading-5 text-muted-foreground">{t("Academic identity is self-declared. Changes may require verification again.")}</p></>}
    {section === "availability" && <><Availability title={t(academicRole === "LECTURER" ? "Open to Mentoring" : "Research support")} disabledEnable={academicRole === "LECTURER" && (profile.academicRoleVerificationStatus !== "VERIFIED" || profile.verificationStatuses?.position !== "VERIFIED")} value={support} onChange={setSupport} options={supportOptions} />{academicRole === "LECTURER" && <><Availability title={t("Academic review")} value={review} onChange={setReview} options={reviewOptions} /><p className="text-xs text-muted-foreground">{t("Mentoring requires verified Lecturer status and mutual consent. Formal review requires a separate artifact assignment.")}</p></>}</>}
    {section === "link" && <Field label={t("Your public URL")}><Input value={handle} maxLength={40} required onChange={event => setHandleInput(event.target.value.toLowerCase())} /><p className="text-xs text-muted-foreground">{t("3–40 letters, numbers or single hyphens. Previous links continue to work.")}</p></Field>}
    {section === "cover" && <><Field label={t("Cover image")}><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setCoverFile(event.target.files?.[0] ?? null)} /></Field>{coverPreview && <img src={coverPreview} alt={t("Cover preview")} className="h-32 w-full rounded-md object-cover" />}{profile.coverUrl && <Button type="button" variant="outline" disabled={busy} onClick={async () => { try { await removeCover.mutateAsync(); onClose(); } catch (error) { setMessage(t(errorMessage(error))); } }}>{t("Remove cover")}</Button>}</>}
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}<div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button><Button type="submit" disabled={busy || (section === "cover" && (!coverFile || coverFile.size > 5 * 1024 * 1024))}>{busy ? t("Saving…") : t("Save changes")}</Button></div>
  </form>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1.5"><span className="block text-sm font-medium">{label}</span>{children}</label>; }
function Availability<T extends string>({ title, value, onChange, options, disabledEnable }: { disabledEnable?: boolean; title: string; value: AcademicAvailability<T>; onChange: (value: AcademicAvailability<T>) => void; options: Array<{ value: T; label: string }> }) {
  const { t } = useI18n();
  return <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.enabled} disabled={disabledEnable && !value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} />{title}: {t("open to requests")}</label>{value.enabled && <><div className="flex flex-wrap gap-3">{options.map(option => <label key={option.value} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={value.types.includes(option.value)} onChange={() => onChange({ ...value, types: value.types.includes(option.value) ? value.types.filter(item => item !== option.value) : [...value.types, option.value] })} />{t(option.label)}</label>)}</div><ResearchTagField label={t("Preferred topics")} values={value.preferredTopics} onChange={preferredTopics => onChange({ ...value, preferredTopics })} /><Field label={t("Note")}><Input value={value.note ?? ""} maxLength={1000} onChange={event => onChange({ ...value, note: event.target.value })} /></Field></>}</div>;
}
