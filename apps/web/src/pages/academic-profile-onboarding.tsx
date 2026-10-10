import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AcademicRole, User } from "@trend/shared-types";
import { MAX_ONBOARDING_RESEARCH_AREAS, MAX_ONBOARDING_RESEARCH_INTERESTS, MAX_ONBOARDING_RESEARCH_SKILLS } from "@trend/shared-types";
import { ArrowLeft, ArrowRight, Check, ChevronDown, GraduationCap, Microscope, Presentation, Loader2, X } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import logoImage from "@/assets/logo.png";
import logoDarkImage from "@/assets/logo-dark.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/features/auth/api/auth.api";
import { requiresAcademicProfile, resolvePostAuthPath, useCurrentUser, useLogout, useUpdateAcademicProfile } from "@/features/auth";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageSwitcher, useI18n } from "@/i18n";
import { ResearchCheckboxField } from "@/features/academic-profile/components/research-checkbox-field";
import { getResearchSuggestions, researchInterestOptions, researchSkillOptions } from "@/features/academic-profile/utils/research-suggestions";
import { OnboardingOptionalSection } from "@/features/academic-profile/components/onboarding-optional-section";
import { OnboardingAreaPicker } from "@/features/academic-profile/components/onboarding-area-picker";
import "./academic-profile-onboarding.css";

type FocusSelections = { researchAreas: string[]; researchInterests: string[]; skills: string[] };
type Draft = FocusSelections & { step: number; expandedFocus: "interests" | "skills" | null; institutionId: string; institutionName: string; institutionSearch: string; customInstitution: boolean; academicRole: AcademicRole | ""; programId: string; programName: string; positionTitle: string };
const roles = ["STUDENT", "LECTURER", "RESEARCHER"] as const;
const roleQuestions = {
  STUDENT: { details: "Your studies", institution: "Where are you studying?", search: "Search your school or university", institutionName: "School or university name", position: "Program / Major / Field of Study", focus: "Your learning interests", areas: "Fields you want to explore", help: "Choose fields you want to learn about. You do not need prior research experience.", interests: "Topics you want to explore", example: "e.g. Building accessible mobile apps" },
  LECTURER: { details: "Your teaching role", institution: "Where do you teach?", search: "Search your teaching institution", institutionName: "Teaching institution name", position: "Teaching position or academic title", focus: "Your teaching and research", areas: "Teaching and research fields", help: "Choose the fields you teach or research to personalize your workspace.", interests: "Current teaching or research topics", example: "e.g. AI in software engineering education" },
  RESEARCHER: { details: "Your research role", institution: "Which organization do you research with?", search: "Search your research organization", institutionName: "Research organization name", position: "Research position", focus: "Your research focus", areas: "Research Areas", help: "Choose the fields you currently research or want to work on.", interests: "Current research topics", example: "e.g. LLM for Software Engineering" },
} as const;
const positions = { RESEARCHER: ["Research Assistant", "Research Fellow", "Research Engineer", "Research Staff", "Independent Researcher"], LECTURER: ["Lecturer", "Senior Lecturer", "Assistant Professor", "Associate Professor", "Professor"] };
function readDraft(key: string, institutionName: string, academicRole: AcademicRole | ""): Draft {
  const empty: Draft = { step: 1, expandedFocus: null, institutionId: "", institutionName, institutionSearch: institutionName, customInstitution: false, academicRole, programId: "", programName: "", positionTitle: "", researchAreas: [], researchInterests: [], skills: [] };
  try {
    const current = sessionStorage.getItem(key);
    const legacy = current === null;
    const value = JSON.parse(current ?? sessionStorage.getItem(key.replace(".v4.", ".v3.")) ?? sessionStorage.getItem(key.replace(".v4.", ".v2.")) ?? "null") as (Partial<Draft> & { focusTab?: string }) | null;
    if (!value || ![1, 2, 3].includes(value.step ?? 0)) return empty;
    const strings = (values: unknown, max = 20): string[] => Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(v => v.length > 0 && v.length <= 80))].slice(0, max) : [];
    const expandedFocus = value.expandedFocus === "interests" || value.expandedFocus === "skills" ? value.expandedFocus : value.expandedFocus === null ? null : value.focusTab === "interests" || value.focusTab === "skills" ? value.focusTab : null;
    const focus = (source: Partial<FocusSelections>): FocusSelections => ({ researchAreas: strings(source.researchAreas), researchInterests: strings(source.researchInterests), skills: strings(source.skills, 30) });
    const selections = focus(value);
    return { ...empty, step: value.step!, expandedFocus: legacy ? null : expandedFocus, academicRole: roles.includes(value.academicRole as AcademicRole) ? value.academicRole! : "", customInstitution: value.customInstitution === true,
      ...Object.fromEntries(["institutionId", "institutionName", "programId", "programName", "positionTitle"].flatMap(k => typeof value[k as keyof Draft] === "string" ? [[k, value[k as keyof Draft]]] : [])),
      institutionSearch: typeof value.institutionSearch === "string" ? value.institutionSearch : typeof value.institutionName === "string" ? value.institutionName : institutionName,
      ...(legacy ? { researchAreas: [], researchInterests: [], skills: [] } : selections) };
  } catch { return empty; }
}

export function AcademicProfileOnboardingPage() {
  const { t } = useI18n();
  const location = useLocation();
  const requestedPath = typeof location.state?.from === "string" ? location.state.from : undefined;
  const accessToken = useAuthStore(s => s.tokens?.accessToken);
  const storedUser = useAuthStore(s => s.user);
  const current = useCurrentUser();
  const user = current.data?.user ?? storedUser;
  if (!accessToken) return <Navigate to="/login" replace />;
  if (current.isLoading || current.isPlaceholderData) return <div role="status" aria-busy="true" className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!user || current.isError) return <div className="p-8"><Button onClick={() => void current.refetch()}>{t("Retry")}</Button></div>;
  if (user.systemRole !== "ADMIN" && !user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  if (!requiresAcademicProfile(user)) return <Navigate to={resolvePostAuthPath(user, requestedPath)} replace />;
  return <AcademicProfileOnboardingForm key={user.id} user={user} accessToken={accessToken} requestedPath={requestedPath} />;
}

function AcademicProfileOnboardingForm({ user, accessToken, requestedPath }: { user: User; accessToken: string; requestedPath?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const save = useUpdateAcademicProfile();
  const logout = useLogout();
  const draftKey = `lumigap.onboarding.v4.${user.id}`;
  const [draft, setDraft] = useState(() => readDraft(draftKey, user.institution ?? "", user.academicRole ?? ""));
  const institutionSearch = draft.institutionSearch;
  const setInstitutionSearch = (value: string) => setDraft(prev => ({ ...prev, institutionSearch: value }));
  const [query, setQuery] = useState(institutionSearch);
  const [fieldsExpanded, setFieldsExpanded] = useState(() => !draft.expandedFocus || !draft.researchAreas.length || draft.researchAreas.length > MAX_ONBOARDING_RESEARCH_AREAS);
  const [otherPosition, setOtherPosition] = useState(false);
  const [showLecturerTitle, setShowLecturerTitle] = useState(() => draft.academicRole === "LECTURER" && Boolean(draft.positionTitle && draft.positionTitle !== "Lecturer"));
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(draft.step);
  useEffect(() => {
    if (previousStep.current === draft.step) return;
    previousStep.current = draft.step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: "nearest" });
  }, [draft.step]);
  const update = (value: Partial<Draft>) => { setDraft(prev => ({ ...prev, ...value })); setError(""); };
  const updateFocus = (value: Partial<FocusSelections>) => update(value);
  useEffect(() => { const timer = setTimeout(() => setQuery(institutionSearch), 200); return () => clearTimeout(timer); }, [institutionSearch]);
  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Storage can be disabled. */ } }, [draft, draftKey]);
  const options = useQuery({ queryKey: ["academic-onboarding-options", query, draft.institutionId], queryFn: () => authApi.academicOnboardingOptions({ q: query, ...(draft.institutionId ? { institutionId: draft.institutionId } : {}) }), enabled: Boolean(accessToken && draft.step >= 2 && draft.academicRole), staleTime: 60_000 });
  const names: Record<AcademicRole, string> = { STUDENT: "Student", RESEARCHER: "Researcher", LECTURER: "Lecturer" };
  const descriptions: Record<AcademicRole, string> = { STUDENT: "Enrolled in an educational program", RESEARCHER: "Research is my professional position", LECTURER: "Teaching or academic staff" };
  const isStudent = draft.academicRole === "STUDENT";
  const isLecturer = draft.academicRole === "LECTURER";
  const currentPosition = isLecturer && !otherPosition ? draft.positionTitle.trim() || "Lecturer" : draft.positionTitle.trim();
  const questions = draft.academicRole ? roleQuestions[draft.academicRole] : undefined;
  const identityValid = Boolean(draft.academicRole);
  const institutionValid = Boolean(draft.institutionName.trim().length >= 2 && (draft.institutionId || draft.customInstitution));
  const detailsValid = institutionValid && (isStudent ? Boolean(draft.programId || draft.programName.trim().length >= 2) : currentPosition.length >= 2);
  const areasValid = draft.researchAreas.length > 0 && draft.researchAreas.length <= MAX_ONBOARDING_RESEARCH_AREAS;
  const focusValid = areasValid && draft.researchInterests.length <= MAX_ONBOARDING_RESEARCH_INTERESTS && draft.skills.length <= MAX_ONBOARDING_RESEARCH_SKILLS;
  const titles = ["Choose your role", questions?.details ?? "Academic details", questions?.focus ?? "Research focus"];
  const programs = draft.institutionId ? options.data?.programs ?? [] : [];
  const positionOptions = draft.academicRole && !isStudent ? positions[draft.academicRole as "RESEARCHER" | "LECTURER"] : [];
  const suggestions = getResearchSuggestions(draft.researchAreas, draft.researchInterests);
  const suggestedSkills = suggestions.skillGroups.flatMap(group => group.options);
  const displayArea = (area: string) => { const translated = t(area); return typeof translated === "string" ? translated : area; };
  const progressLabels = ["Your role", "Setup details", "Setup focus"];
  const stepHelp = ["Choose the role that best describes you today.", "Tell us where you study or work. You can update these details later.", "Start with your main fields, then add interests and skills if you wish."];
  const roleIcons = { STUDENT: GraduationCap, LECTURER: Presentation, RESEARCHER: Microscope };

  function next() {
    if (draft.step === 1 && !identityValid) { setError(t("Choose your academic role to continue.")); return; }
    if (draft.step === 2 && !institutionValid) { setError(t("Select an institution or enter its name.")); return; }
    if (draft.step === 2 && !detailsValid) { setError(t(isStudent ? "Enter your program or major." : "Enter your current position.")); return; }
    update({ step: draft.step + 1 });
  }
  async function finish() {
    if (save.isPending) return;
    if (draft.researchAreas.length > MAX_ONBOARDING_RESEARCH_AREAS) { setError(t("Keep at most {{limit}} fields to continue.", { limit: MAX_ONBOARDING_RESEARCH_AREAS })); return; }
    if (draft.researchInterests.length > MAX_ONBOARDING_RESEARCH_INTERESTS || draft.skills.length > MAX_ONBOARDING_RESEARCH_SKILLS) {
      update({ expandedFocus: draft.researchInterests.length > MAX_ONBOARDING_RESEARCH_INTERESTS ? "interests" : "skills" });
      setError(t("Keep at most {{limit}} selections in each optional section to continue.", { limit: MAX_ONBOARDING_RESEARCH_INTERESTS })); return;
    }
    if (!identityValid || !detailsValid || !draft.researchAreas.length) { setError(t("Complete your academic identity, details and research areas.")); return; }
    setError("");
    try {
      const result = await save.mutateAsync({ academicRole: draft.academicRole as AcademicRole, institutionName: draft.institutionName.trim(), ...(draft.institutionId ? { institutionId: draft.institutionId } : {}), ...(isStudent ? (draft.programId ? { programId: draft.programId } : { programName: draft.programName.trim() }) : { positionTitle: currentPosition }), researchAreas: draft.researchAreas, researchInterests: draft.researchInterests, skills: draft.skills });
      try { for (const version of ["v4", "v3", "v2"]) sessionStorage.removeItem(`lumigap.onboarding.${version}.${user.id}`); } catch { /* Optional persistence. */ }
      navigate(resolvePostAuthPath(result.user, requestedPath), { replace: true });
    } catch (failure) {
      const status = (failure as { response?: { status?: number } }).response?.status;
      setError(t(status === 403 ? "Verify your email before completing onboarding." : "Could not save your profile. Your progress has been kept; please try again."));
    }
  }
  const positionLabel = isLecturer ? "Additional academic title" : questions?.position ?? "Current Position";
  const customPosition = otherPosition || Boolean(draft.positionTitle && !positionOptions.includes(draft.positionTitle));
  const positionFields = <div id="onboarding-position-fields" className="space-y-3">
    <Label htmlFor="current-position">{t(positionLabel)}{!isLecturer && " *"}</Label>
    <select id="current-position" className="w-full rounded-md border bg-background p-2 text-sm"
      value={customPosition ? "OTHER" : isLecturer ? draft.positionTitle || "Lecturer" : draft.positionTitle}
      onChange={event => { setOtherPosition(event.target.value === "OTHER"); update({ positionTitle: event.target.value === "OTHER" ? "" : event.target.value }); }}>
      <option value={isLecturer ? "Lecturer" : ""}>{t(isLecturer ? "No additional title" : "Select current position")}</option>
      {positionOptions.filter(position => !isLecturer || position !== "Lecturer").map(position => <option key={position} value={position}>{t(position)}</option>)}
      <option value="OTHER">{t("Other")}</option>
    </select>
    {customPosition && <Input aria-label={t(positionLabel)} maxLength={160} value={draft.positionTitle} onChange={event => update({ positionTitle: event.target.value })} />}
  </div>;
  return <div className="academic-onboarding" data-no-i18n>
    <header className="onboarding-header"><div className="onboarding-header-inner"><Link to="/" aria-label="LumiGap"><img src={logoImage} alt="LumiGap" className="h-8 w-auto dark:hidden" /><img src={logoDarkImage} alt="LumiGap" className="hidden h-8 w-auto dark:block" /></Link><div className="flex items-center gap-2 sm:gap-3"><LanguageSwitcher /><Button variant="ghost" size="sm" disabled={logout.isPending} onClick={() => logout.mutate()}>{t("Sign out")}</Button></div></div></header>
    <main className="onboarding-shell">
      <nav className="onboarding-progress" aria-label={t("Onboarding progress")}>
        <ol className="onboarding-steps">{progressLabels.map((title, index) => <li key={index}>
          <button type="button" aria-current={index + 1 === draft.step ? "step" : undefined} data-complete={index + 1 < draft.step}
            disabled={index + 1 >= draft.step || save.isPending} onClick={() => update({ step: index + 1 })}>
            <span className="onboarding-step-number" aria-hidden="true">{index + 1 < draft.step ? <Check /> : `0${index + 1}`}</span>
            <span className="onboarding-step-label">{t(title)}</span>
          </button>
        </li>)}</ol>
      </nav>
      <div className="min-w-0">
      <form onSubmit={event => { event.preventDefault(); if (draft.step < 3) next(); else void finish(); }} className="onboarding-form">
        <div className="onboarding-form-heading"><p>{t("Step")} {draft.step} {t("of")} 3</p><h1 ref={heading} tabIndex={-1}>{t(titles[draft.step - 1]!)}</h1><p className="onboarding-step-help">{t(stepHelp[draft.step - 1]!)}</p></div>
        <div key={draft.step} className="onboarding-step-content onboarding-motion">
        {draft.step === 1 && <fieldset className="space-y-3"><legend className="mb-4 text-sm font-medium">{t("Academic Role")} *</legend>{roles.map(role => {
          const Icon = roleIcons[role];
          return <label key={role} className="onboarding-role-choice" data-selected={draft.academicRole === role}>
            <span className="onboarding-role-icon" aria-hidden="true"><Icon /></span>
            <span><span className="onboarding-role-title">{t(names[role])}</span><span className="onboarding-role-description">{t(descriptions[role])}</span></span>
            <input type="radio" name="academic-role" value={role} checked={draft.academicRole === role} onChange={() => { if (draft.academicRole !== role) { update({ academicRole: role, programId: "", programName: "", positionTitle: role === "LECTURER" ? "Lecturer" : "", researchAreas: [], researchInterests: [], skills: [], expandedFocus: null }); setShowLecturerTitle(false); setFieldsExpanded(true); } setOtherPosition(false); }} />
          </label>;
        })}</fieldset>}
        {draft.step === 2 && <div className="space-y-6"><p className="text-sm text-muted-foreground">{t(names[draft.academicRole as AcademicRole] || "Academic Role")} · {t("You can change your role in the previous step.")}</p><div className="space-y-2"><Label htmlFor="institution-search">{t(questions?.institution ?? "Institution")} *</Label><Input id="institution-search" maxLength={200} value={institutionSearch} placeholder={t(questions?.search ?? "Search your institution")} onChange={event => { setInstitutionSearch(event.target.value); update({ institutionId: "", institutionName: "", customInstitution: false, programId: "", programName: "" }); }} />
          {!draft.institutionId && !draft.customInstitution && <div className="max-h-40 overflow-y-auto rounded-lg border" aria-label={t("Institutions")}>{options.isLoading ? <p className="p-3 text-sm" role="status">{t("Loading institution…")}</p> : (options.data?.institutions ?? []).map(item => <button key={item.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { update({ institutionId: item.id, institutionName: item.name, customInstitution: false }); setInstitutionSearch(item.name); }}>{item.name}</button>)}{options.isError && <Button type="button" variant="ghost" onClick={() => void options.refetch()}>{t("Retry")}</Button>}{!options.isLoading && !options.isError && !options.data?.institutions?.length && <p className="p-3 text-sm text-muted-foreground">{t("Institution not found. You can add it below.")}</p>}</div>}
          {!draft.institutionId && <button type="button" className="text-sm text-blue-600 dark:text-blue-400" onClick={() => update({ customInstitution: true, institutionName: institutionSearch.trim(), programId: "" })}>{t("Other institution")}</button>}{draft.customInstitution && <Input aria-label={t(questions?.institutionName ?? "Institution name")} value={draft.institutionName} maxLength={200} placeholder={t(questions?.institutionName ?? "Institution name")} onChange={event => update({ institutionName: event.target.value })} />}
        </div><div className="space-y-3">{isStudent ? <>
          <Label htmlFor={programs.length && draft.programId ? "program-select" : "program-name"}>{t("Program / Major / Field of Study")} *</Label>
          {programs.length > 0 && <select id="program-select" aria-label={t("Available programs")} className="w-full rounded-md border bg-background p-2 text-sm" value={draft.programId} onChange={event => update({ programId: event.target.value, programName: programs.find(p => p.id === event.target.value)?.name ?? "" })}><option value="">{t("Other program or major")}</option>{programs.map(program => <option key={program.id} value={program.id}>{t(program.name)}</option>)}</select>}
          {!draft.programId && <Input id="program-name" maxLength={160} value={draft.programName} placeholder={t("e.g. Software Engineering")} onChange={event => update({ programName: event.target.value })} />}
          <p className="text-xs text-muted-foreground">{t("Student ID is only requested later for optional affiliation verification.")}</p>
        </> : isLecturer ? <>
          <div className="border-t pt-4">
            <button type="button" aria-expanded={showLecturerTitle} aria-controls="onboarding-position-fields"
              className="flex w-full items-start justify-between gap-3 rounded text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => { if (showLecturerTitle && currentPosition.length < 2) { update({ positionTitle: "Lecturer" }); setOtherPosition(false); } setShowLecturerTitle(value => !value); }}>
              {t("Add an academic title (optional)")}<ChevronDown aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${showLecturerTitle ? "rotate-180" : ""}`} />
            </button>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("Your Lecturer role is already selected. Add a more specific title only if it applies.")}</p>
          </div>
          {showLecturerTitle ? positionFields : currentPosition !== "Lecturer" && <p className="text-sm">{t(currentPosition)}</p>}
          <p className="text-xs leading-5 text-muted-foreground">{t("These details are self-declared. Position verification is available after onboarding.")}</p>
        </> : positionFields}</div></div>}
        {draft.step === 3 && <div className="onboarding-focus">
          <section id="onboarding-fields" aria-labelledby="onboarding-fields-label" className="space-y-4">
          <div className="onboarding-field-heading"><Label id="onboarding-fields-label" htmlFor="area-search">{t(questions?.areas ?? "Research Areas")}</Label><span className="onboarding-required">{t("Required")}</span></div>
          {(fieldsExpanded || !areasValid) && <p className="text-sm leading-6 text-muted-foreground">{t("Choose between 1 and {{limit}} primary fields.", { limit: MAX_ONBOARDING_RESEARCH_AREAS })}</p>}
          {draft.researchAreas.length > 0 && <div className="flex flex-wrap gap-2">{draft.researchAreas.map(area => <button type="button" key={area} className="onboarding-area-chip" onClick={() => updateFocus({ researchAreas: draft.researchAreas.filter(value => value !== area) })}>{displayArea(area)}<X aria-hidden="true" /><span className="sr-only">{t("Remove")}</span></button>)}</div>}
          <div id="onboarding-field-choices" hidden={!fieldsExpanded && areasValid} className="space-y-3">
          <OnboardingAreaPicker options={options.data?.researchAreas ?? []} values={draft.researchAreas} max={MAX_ONBOARDING_RESEARCH_AREAS}
            onChange={researchAreas => updateFocus({ researchAreas })} loading={options.isLoading} failed={options.isError} onRetry={() => void options.refetch()} />
          </div>
          <div id="area-limit" className="onboarding-selection-limit text-xs" aria-live="polite"><p className="text-muted-foreground">{draft.researchAreas.length}/{MAX_ONBOARDING_RESEARCH_AREAS} {t("fields selected")}</p>
            {draft.researchAreas.length >= MAX_ONBOARDING_RESEARCH_AREAS && <p className={draft.researchAreas.length > MAX_ONBOARDING_RESEARCH_AREAS ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{t(draft.researchAreas.length > MAX_ONBOARDING_RESEARCH_AREAS ? "Keep at most {{limit}} fields to continue." : "You have reached the field limit. Remove a field to choose another.", { limit: MAX_ONBOARDING_RESEARCH_AREAS })}</p>}
            {!fieldsExpanded && areasValid && <button type="button" id="edit-onboarding-fields" aria-controls="onboarding-field-choices" aria-expanded={false} className="onboarding-text-action" onClick={() => { setFieldsExpanded(true); update({ expandedFocus: null }); }}>{t("Edit fields")}</button>}
          </div>{options.isError && <Button type="button" variant="ghost" onClick={() => void options.refetch()}>{t("Retry")}</Button>}
          </section>
          <div className="onboarding-optional-intro"><p>{t("Optional. You can add these in your profile later.")}</p></div>
          <OnboardingOptionalSection id="interests" label="Research Interests" count={draft.researchInterests.length} max={MAX_ONBOARDING_RESEARCH_INTERESTS}
            expanded={draft.expandedFocus === "interests"} onToggle={() => { if (areasValid) setFieldsExpanded(false); update({ expandedFocus: draft.expandedFocus === "interests" ? null : "interests" }); }}>
          <ResearchCheckboxField id="research-interest" label="Research Interests" description="Choose up to 5 topics you want to explore."
            options={suggestions.interests} allOptions={researchInterestOptions} searchLabel="Search topics"
            values={draft.researchInterests} onChange={researchInterests => updateFocus({ researchInterests })} max={MAX_ONBOARDING_RESEARCH_INTERESTS}
            placeholder="Search or add a topic" />
          </OnboardingOptionalSection>
          <OnboardingOptionalSection id="skills" label="Research skills" count={draft.skills.length} max={MAX_ONBOARDING_RESEARCH_SKILLS}
            expanded={draft.expandedFocus === "skills"} onToggle={() => { if (areasValid) setFieldsExpanded(false); update({ expandedFocus: draft.expandedFocus === "skills" ? null : "skills" }); }}>
          <ResearchCheckboxField id="research-skill" label="Research skills" description="Choose up to 5 skills you use."
            options={suggestedSkills} allOptions={researchSkillOptions} groups={suggestions.skillGroups} searchLabel="Search skills"
            values={draft.skills} onChange={skills => updateFocus({ skills })} max={MAX_ONBOARDING_RESEARCH_SKILLS}
            placeholder="Search or add a skill" />
          </OnboardingOptionalSection>
        </div>}
        {error && <p role="alert" className="mt-5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="onboarding-form-footer"><Button type="button" variant="ghost" disabled={draft.step === 1 || save.isPending} onClick={() => update({ step: draft.step - 1 })}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />{t("Back")}</Button><Button type="submit" disabled={save.isPending || (draft.step === 1 ? !identityValid : draft.step === 2 ? !detailsValid : !focusValid)}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(draft.step === 3 ? "Complete onboarding" : "Continue")}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Button></div>
      </form>
      </div>
    </main>
  </div>;
}
