import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ACADEMIC_POSITION_OPTIONS } from "@trend/shared-types";
import type {
  AcademicProfile,
  AcademicReviewType,
  ResearchSupportType,
  UpdateAcademicProfileDetailsRequest,
} from "@trend/shared-types";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSetPublicHandle,
  useUpdateAcademicProfile,
  useUploadAcademicCover,
  useRemoveAcademicCover,
} from "../hooks/use-academic-profile";

export type EditSection = "cover" | "intro" | "research" | "works" | "affiliation" | "availability" | "link";

type WorkInput = NonNullable<UpdateAcademicProfileDetailsRequest["featuredWorks"]>[number];

const supportOptions: Array<{ value: ResearchSupportType; label: string }> = [
  { value: "RESEARCH_DIRECTION", label: "Research direction" },
  { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "RESEARCH_GAP_VALIDATION", label: "Research gap validation" },
  { value: "RESEARCH_METHODOLOGY", label: "Research methodology" },
  { value: "EXPERIMENT_DESIGN", label: "Experiment design" },
  { value: "DATA_ANALYSIS", label: "Data analysis" },
  { value: "ACADEMIC_WRITING", label: "Academic writing" },
  { value: "SOFTWARE_TECHNICAL_GUIDANCE", label: "Software guidance" },
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

const toCsv = (items: string[]) => items.join(", ");
const fromCsv = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

export function suggestPublicHandle(name: string): string {
  return name.toLowerCase().replace(/đ/g, "d").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function errorMessage(error: unknown): string {
  const response = error as { response?: { data?: { error?: { message?: string } } } };
  return response.response?.data?.error?.message || "Could not save these changes.";
}

function toEditableWorks(profile: AcademicProfile): WorkInput[] {
  return profile.featuredWorks.map((work) => work.source === "LUMIGAP"
    ? { source: "LUMIGAP", paperId: work.paperId }
    : { source: work.source, title: work.title, doi: work.doi, year: work.year });
}

export function AcademicProfileInlineEditor({
  section,
  profile,
  onClose,
}: {
  section: Exclude<EditSection, "intro">;
  profile: AcademicProfile;
  onClose: () => void;
}) {
  const update = useUpdateAcademicProfile();
  const setHandle = useSetPublicHandle();
  const uploadCover = useUploadAcademicCover();
  const removeCover = useRemoveAcademicCover();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const [researchInterests, setResearchInterests] = useState(toCsv(profile.researchInterests));
  const [expertiseAreas, setExpertiseAreas] = useState(toCsv(profile.expertiseAreas));
  const [skills, setSkills] = useState(toCsv(profile.skills));
  const [researchKeywords, setResearchKeywords] = useState(toCsv(profile.researchKeywords));
  const [works, setWorks] = useState<WorkInput[]>(() => toEditableWorks(profile));
  const [draftWork, setDraftWork] = useState({ source: "MANUAL" as "MANUAL" | "LUMIGAP", paperId: "", title: "", doi: "", year: "" });
  const [institutionName, setInstitutionName] = useState(profile.affiliation.institutionName ?? "");
  const [department, setDepartment] = useState(profile.affiliation.department ?? "");
  const [position, setPosition] = useState(profile.positionTitle ?? profile.affiliation.position ?? "");
  const [supportEnabled, setSupportEnabled] = useState(profile.supportAvailability.enabled);
  const [supportTypes, setSupportTypes] = useState(profile.supportAvailability.types);
  const [supportTopics, setSupportTopics] = useState(toCsv(profile.supportAvailability.preferredTopics));
  const [supportNote, setSupportNote] = useState(profile.supportAvailability.note ?? "");
  const [reviewEnabled, setReviewEnabled] = useState(profile.reviewAvailability.enabled);
  const [reviewTypes, setReviewTypes] = useState(profile.reviewAvailability.types);
  const [reviewTopics, setReviewTopics] = useState(toCsv(profile.reviewAvailability.preferredTopics));
  const [reviewNote, setReviewNote] = useState(profile.reviewAvailability.note ?? "");
  const [handle, setHandleInput] = useState(profile.publicHandle ?? (suggestPublicHandle(profile.displayName) || `researcher-${profile.userId.slice(-6)}`));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const busy = update.isPending || setHandle.isPending || uploadCover.isPending || removeCover.isPending;

  function buildPatch(): UpdateAcademicProfileDetailsRequest {
    switch (section) {
      case "research": return {
        researchInterests: fromCsv(researchInterests),
        expertiseAreas: fromCsv(expertiseAreas),
        skills: fromCsv(skills),
        researchKeywords: fromCsv(researchKeywords),
      };
      case "works": return { featuredWorks: works };
      case "affiliation": return {
        positionTitle: position.trim(),
        affiliation: {
          institutionName: institutionName.trim(),
          department: department.trim(),
          position: position.trim(),
        },
      };
      case "availability": return {
        supportAvailability: {
          enabled: supportEnabled,
          types: supportEnabled ? supportTypes : [],
          preferredTopics: fromCsv(supportTopics),
          note: supportNote.trim(),
        },
        reviewAvailability: {
          enabled: reviewEnabled,
          types: reviewEnabled ? reviewTypes : [],
          preferredTopics: fromCsv(reviewTopics),
          note: reviewNote.trim(),
        },
      };
      case "link": return {};
      case "cover": return {};
    }
  }

  const dirty = (() => {
    if (section === "cover") return Boolean(coverFile);
    if (section === "link") return handle.trim().toLowerCase() !== (profile.publicHandle ?? "");
    if (section === "research") return researchInterests !== toCsv(profile.researchInterests) || expertiseAreas !== toCsv(profile.expertiseAreas) || skills !== toCsv(profile.skills) || researchKeywords !== toCsv(profile.researchKeywords);
    if (section === "works") return JSON.stringify(works) !== JSON.stringify(toEditableWorks(profile));
    if (section === "affiliation") return institutionName.trim() !== (profile.affiliation.institutionName ?? "") || department.trim() !== (profile.affiliation.department ?? "") || position.trim() !== (profile.positionTitle ?? profile.affiliation.position ?? "");
    return supportEnabled !== profile.supportAvailability.enabled || JSON.stringify(supportTypes) !== JSON.stringify(profile.supportAvailability.types) || supportTopics !== toCsv(profile.supportAvailability.preferredTopics) || supportNote !== (profile.supportAvailability.note ?? "") || reviewEnabled !== profile.reviewAvailability.enabled || JSON.stringify(reviewTypes) !== JSON.stringify(profile.reviewAvailability.types) || reviewTopics !== toCsv(profile.reviewAvailability.preferredTopics) || reviewNote !== (profile.reviewAvailability.note ?? "");
  })();

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function closeEditor() {
    onClose();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (section === "affiliation" && (!institutionName.trim() || !position.trim())) {
      setMessage({ text: "Institution / organization and current position are required.", tone: "error" });
      return;
    }
    try {
      if (section === "link") {
        await setHandle.mutateAsync(handle.trim().toLowerCase());
      } else if (section === "cover") {
        if (!coverFile) {
          setMessage({ text: "Choose a cover image first.", tone: "error" });
          return;
        }
        await uploadCover.mutateAsync(coverFile);
      } else {
        await update.mutateAsync(buildPatch());
      }
      onClose();
      toast.success(section === "cover" ? "Cover image updated" : "Profile changes saved");
    } catch (error) {
      setMessage({ text: errorMessage(error), tone: "error" });
    }
  }

  function addWork() {
    if (works.length >= 10) return;
    if (draftWork.source === "LUMIGAP" && !draftWork.paperId.trim()) return;
    if (draftWork.source === "MANUAL" && !draftWork.title.trim() && !draftWork.doi.trim()) return;
    const next: WorkInput = draftWork.source === "LUMIGAP"
      ? { source: "LUMIGAP", paperId: draftWork.paperId.trim() }
      : { source: "MANUAL", title: draftWork.title.trim() || undefined, doi: draftWork.doi.trim() || undefined, year: draftWork.year ? Number(draftWork.year) : undefined };
    setWorks((current) => [...current, next]);
    setDraftWork({ source: "MANUAL", paperId: "", title: "", doi: "", year: "" });
  }

  return (
    <form onSubmit={save} className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
      {section === "cover" && <div className="space-y-3">
        <label className="block space-y-2 text-xs font-medium text-slate-700 dark:text-slate-300"><span>Cover image</span><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setCoverFile(file); setMessage(file && file.size > 5 * 1024 * 1024 ? { text: "Cover image must be 5MB or smaller.", tone: "error" } : null); }} className="h-auto py-2" /></label>
        <p className="text-xs leading-5 text-slate-500">JPEG, PNG or WebP, up to 5MB. A wide image around 1600 × 480 works best. The image is cropped to fit.</p>
        {coverPreview && <img src={coverPreview} alt="Cover preview" className="h-32 w-full rounded-lg object-cover" />}
        {profile.coverUrl && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={async () => { setMessage(null); try { await removeCover.mutateAsync(); onClose(); } catch (error) { setMessage({ text: errorMessage(error), tone: "error" }); } }}>Remove cover</Button>}
      </div>}
      {section === "research" && <div className="grid gap-4 sm:grid-cols-2">
        <CsvField label={profile.academicType === "student" ? "Topics you are exploring" : "Research interests"} value={researchInterests} onChange={setResearchInterests} />
        <CsvField label={profile.academicType === "student" ? "Developing expertise" : "Expertise"} value={expertiseAreas} onChange={setExpertiseAreas} />
        <CsvField label="Skills" value={skills} onChange={setSkills} />
        <CsvField label="Keywords" value={researchKeywords} onChange={setResearchKeywords} />
      </div>}

      {section === "works" && <div className="space-y-4">
        {works.length > 0 && <ul className="divide-y divide-slate-100 dark:divide-slate-800">{works.map((work, index) => <li key={`${work.paperId ?? work.doi ?? work.title}-${index}`} className="flex items-start justify-between gap-3 py-2"><div className="min-w-0"><p className="break-words text-sm font-medium text-slate-800 dark:text-slate-200">{work.title || work.paperId || work.doi}</p><p className="text-xs text-slate-500">{work.source}{work.year ? ` · ${work.year}` : ""}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Remove work" onClick={() => setWorks((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Source"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#101923]" value={draftWork.source} onChange={(event) => setDraftWork((current) => ({ ...current, source: event.target.value as "MANUAL" | "LUMIGAP" }))}><option value="MANUAL">Manual reference</option><option value="LUMIGAP">LumiGap paper</option></select></TextField>
          {draftWork.source === "LUMIGAP" ? <TextField label="LumiGap paper ID"><Input value={draftWork.paperId} onChange={(event) => setDraftWork((current) => ({ ...current, paperId: event.target.value }))} /></TextField> : <><TextField label="Title"><Input value={draftWork.title} onChange={(event) => setDraftWork((current) => ({ ...current, title: event.target.value }))} /></TextField><TextField label="DOI"><Input value={draftWork.doi} onChange={(event) => setDraftWork((current) => ({ ...current, doi: event.target.value }))} /></TextField><TextField label="Year"><Input type="number" min={1000} max={new Date().getFullYear() + 1} value={draftWork.year} onChange={(event) => setDraftWork((current) => ({ ...current, year: event.target.value }))} /></TextField></>}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={works.length >= 10} onClick={addWork} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add work</Button>
      </div>}

      {section === "affiliation" && <div className="space-y-5">
        <div className="grid gap-4">
          <TextField label="Institution / organization *"><Input value={institutionName} maxLength={200} required onChange={(event) => setInstitutionName(event.target.value)} placeholder="e.g. FPT University" /></TextField>
          <TextField label="Current position *"><Input list="academic-position-options" value={position} maxLength={160} required onChange={(event) => setPosition(event.target.value)} placeholder="Student / Lecturer / PhD Candidate / …" /><datalist id="academic-position-options">{ACADEMIC_POSITION_OPTIONS.map((option) => <option key={option.title} value={option.title} />)}</datalist></TextField>
          <TextField label="Program / major" hint="Optional, most useful for students and PhD candidates"><Input value={department} maxLength={200} onChange={(event) => setDepartment(event.target.value)} placeholder="e.g. Software Engineering" /></TextField>
        </div>
      </div>}

      {section === "availability" && <div className="space-y-6">
        <AvailabilityFields title="Research support" enabled={supportEnabled} onEnabled={setSupportEnabled} selected={supportTypes} onSelected={setSupportTypes} options={supportOptions} topics={supportTopics} onTopics={setSupportTopics} note={supportNote} onNote={setSupportNote} />
        <AvailabilityFields title="Academic review" enabled={reviewEnabled} onEnabled={setReviewEnabled} selected={reviewTypes} onSelected={setReviewTypes} options={reviewOptions} topics={reviewTopics} onTopics={setReviewTopics} note={reviewNote} onNote={setReviewNote} />
      </div>}

      {section === "link" && <div className="space-y-3"><TextField label="Your public URL"><div className="flex min-w-0 items-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#101923]"><span className="shrink-0 border-r border-slate-200 px-2 text-xs text-slate-500 dark:border-slate-700">/</span><Input value={handle} maxLength={40} required onChange={(event) => setHandleInput(event.target.value.toLowerCase())} className="min-w-0 border-0 shadow-none focus-visible:ring-0" /></div></TextField><p className="text-xs leading-5 text-slate-500">3–40 letters, numbers or single hyphens. Use your name or professional focus. Previous links continue to work after a change.</p></div>}

      {message && <p role="status" className={`text-xs leading-5 ${message.tone === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{message.text}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={closeEditor}>Cancel</Button><Button type="submit" size="sm" disabled={busy || !dirty || (section === "cover" && (!coverFile || coverFile.size > 5 * 1024 * 1024))}>{busy ? "Saving…" : section === "cover" ? "Save cover" : section === "affiliation" ? "Save" : "Save changes"}</Button></div>
    </form>
  );
}

function TextField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>{children}{hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}</label>;
}

function CsvField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField label={label}><Input value={value} onChange={(event) => onChange(event.target.value)} /><p className="text-[11px] text-slate-500">Separate topics with commas.</p></TextField>;
}

function AvailabilityFields<T extends string>({ title, enabled, onEnabled, selected, onSelected, options, topics, onTopics, note, onNote }: {
  title: string; enabled: boolean; onEnabled: (value: boolean) => void; selected: T[]; onSelected: (value: T[]) => void;
  options: Array<{ value: T; label: string }>; topics: string; onTopics: (value: string) => void; note: string; onNote: (value: string) => void;
}) {
  return <div className="space-y-3"><label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200"><input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} className="h-4 w-4 accent-blue-700" />{title}: open to requests</label>{enabled && <><div className="flex flex-wrap gap-x-4 gap-y-2">{options.map((option) => <label key={option.value} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selected.includes(option.value)} onChange={() => onSelected(selected.includes(option.value) ? selected.filter((item) => item !== option.value) : [...selected, option.value])} className="h-3.5 w-3.5 accent-blue-700" />{option.label}</label>)}</div><CsvField label="Preferred topics" value={topics} onChange={onTopics} /><TextField label="Note"><textarea className="min-h-20 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" maxLength={1000} value={note} onChange={(event) => onNote(event.target.value)} /></TextField></>}</div>;
}
