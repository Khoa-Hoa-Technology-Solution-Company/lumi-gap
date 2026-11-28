import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CreateProjectRequest, ResearchApproach } from "@trend/shared-types";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, GraduationCap, LockKeyhole, Plus, Search, ShieldCheck, User, Users, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { api } from "@/services/api-client";
import { authApi } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";
import { projectsApi } from "../api/projects.api";
import { useCreateProject } from "../hooks/use-projects";

import { ResearchClassificationFields } from "@/features/academic-profile/components/research-classification-fields";
import { ResearchAreaSelect } from "./research-area-select";
import {
  DEFAULT_MAX_KEYWORD_LENGTH,
  DEFAULT_MAX_KEYWORDS,
  KeywordTagInput,
  mergeKeywordTerms,
  splitKeywordTerms,
} from "./keyword-tag-input";

const DEFAULT_RESEARCH_FIELDS = [
  "Artificial Intelligence",
  "Computer Science",
  "Software Engineering",
  "Data Science",
  "Information Systems",
  "Cybersecurity",
  "Education",
  "Business and Management",
];

const CUSTOM_FIELD_VALUE = "__custom__";

const INITIAL_RESEARCH_APPROACHES: Array<{ value: ResearchApproach; label: string }> = [
  { value: "EXPLORATORY", label: "Explore topic and define research direction" },
  { value: "LITERATURE_REVIEW", label: "Literature review and synthesis" },
  { value: "EMPIRICAL", label: "Empirical research" },
  { value: "UNDECIDED", label: "Not decided yet" },
];

type TeamMode = "SOLO" | "TEAM";
type MentorMode = "LATER" | "FIND" | "INVITE";

interface QueuedInvite {
  email: string;
  userId?: string;
  fullName?: string | null;
}

interface SearchUser {
  id: string;
  fullName: string | null;
  email: string;
}

interface SelectedMentor {
  id: string;
  fullName?: string;
  institutionName?: string;
  positionTitle?: string;
  expertiseAreas?: string[];
}

interface Draft {
  step: 1 | 2;
  title: string;
  researchField: string;
  customField: string;
  additionalAreas: string[];
  description: string;
  keywords: string[];
  keywordsInput: string;
  researchApproach: ResearchApproach;
  visibility: "PRIVATE";
  researchClassification?: CreateProjectRequest["researchClassification"];
  teamMode: TeamMode;
  invitedMembers: QueuedInvite[];
  mentorMode: MentorMode;
  selectedMentor?: SelectedMentor;
  mentorNote?: string;
  idempotencyKey: string;
  submitted?: boolean;
}

function isValidInvite(item: unknown): item is QueuedInvite {
  if (!item || typeof item !== "object") return false;
  const v = item as Record<string, unknown>;
  return typeof v.email === "string"
    && v.email.trim().length > 0
    && v.email.length <= 320
    && (v.userId === undefined || typeof v.userId === "string")
    && (v.fullName === undefined || v.fullName === null || typeof v.fullName === "string");
}

function isValidSelectedMentor(item: unknown): item is SelectedMentor {
  if (!item || typeof item !== "object") return false;
  const v = item as Record<string, unknown>;
  return typeof v.id === "string"
    && v.id.trim().length > 0
    && v.id.length <= 128
    && (v.fullName === undefined || typeof v.fullName === "string")
    && (v.institutionName === undefined || typeof v.institutionName === "string")
    && (v.positionTitle === undefined || typeof v.positionTitle === "string")
    && (v.expertiseAreas === undefined || (Array.isArray(v.expertiseAreas) && v.expertiseAreas.every(a => typeof a === "string")));
}

function defaultDraft(): Draft {
  return {
    step: 1,
    title: "",
    researchField: "",
    customField: "",
    additionalAreas: [],
    description: "",
    keywords: [],
    keywordsInput: "",
    researchApproach: "EXPLORATORY",
    visibility: "PRIVATE",
    teamMode: "SOLO",
    invitedMembers: [],
    mentorMode: "LATER",
    idempotencyKey: crypto.randomUUID(),
  };
}

function readDraft(key: string): Draft {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) || "null");
    if (parsed && typeof parsed === "object") {
      const value = parsed as Record<string, unknown>;
      if (value.step === undefined && typeof value.title === "string" && value.title.length <= 100 && typeof value.description === "string" && value.description.length <= 5000 && typeof value.idempotencyKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey) && Array.isArray(value.researchAreas) && value.researchAreas.every(area => typeof area === "string" && area.length <= 120)) {
        const legacyAreas = (value.researchAreas as string[]).map(a => a.trim()).filter(Boolean);
        return {
          ...defaultDraft(),
          title: value.title,
          description: value.description,
          researchField: legacyAreas[0] ?? "",
          additionalAreas: legacyAreas.slice(1, 3),
          researchApproach: ["UNDECIDED","EXPLORATORY","LITERATURE_REVIEW","EMPIRICAL"].includes(String(value.researchApproach)) ? value.researchApproach as ResearchApproach : "UNDECIDED",
          idempotencyKey: value.idempotencyKey,
          visibility: "PRIVATE",
        };
      }
      if (
        (value.step === 1 || value.step === 2)
        && typeof value.title === "string" && value.title.length <= 100
        && typeof value.researchField === "string" && value.researchField.length <= 200
        && typeof value.customField === "string" && value.customField.length <= 120
        && typeof value.description === "string" && value.description.length <= 5000
        && typeof value.keywordsInput === "string" && value.keywordsInput.length <= 500
        && (value.keywords === undefined || (Array.isArray(value.keywords) && value.keywords.length <= 10 && value.keywords.every(k => typeof k === "string" && k.length <= 80)))
        && (value.additionalAreas === undefined || (Array.isArray(value.additionalAreas) && value.additionalAreas.length <= 2 && value.additionalAreas.every(a => typeof a === "string" && a.length <= 120)))
        && typeof value.idempotencyKey === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey)
        && (value.visibility === "PRIVATE" || value.visibility === "PUBLIC")
        && typeof value.researchApproach === "string"
        && ["UNDECIDED", "EXPLORATORY", "LITERATURE_REVIEW", "EMPIRICAL"].includes(value.researchApproach)
        && (value.teamMode === "SOLO" || value.teamMode === "TEAM")
        && Array.isArray(value.invitedMembers) && value.invitedMembers.length <= 10 && value.invitedMembers.every(isValidInvite)
        && (value.mentorMode === "LATER" || value.mentorMode === "FIND" || value.mentorMode === "INVITE")
        && (value.selectedMentor === undefined || isValidSelectedMentor(value.selectedMentor))
        && (value.mentorNote === undefined || (typeof value.mentorNote === "string" && value.mentorNote.length <= 1000))
        && (value.submitted === undefined || typeof value.submitted === "boolean")
      ) {
        return {
          step: value.step,
          title: value.title,
          researchField: value.researchField,
          customField: value.customField,
          additionalAreas: Array.isArray(value.additionalAreas) ? (value.additionalAreas as string[]) : [],
          description: value.description,
          keywords: Array.isArray(value.keywords) ? (value.keywords as string[]) : [],
          keywordsInput: value.keywordsInput,
          researchApproach: value.researchApproach as ResearchApproach,
          visibility: "PRIVATE",
          ...(value.researchClassification && typeof value.researchClassification === "object" ? { researchClassification: value.researchClassification as Draft["researchClassification"] } : {}),
          teamMode: value.teamMode,
          invitedMembers: value.invitedMembers,
          mentorMode: value.mentorMode,
          selectedMentor: value.selectedMentor,
          mentorNote: value.mentorNote,
          idempotencyKey: value.idempotencyKey,
          submitted: value.submitted,
        };
      }
    }
  } catch { /* Storage is optional. Submission still uses an in-memory stable key. */ }
  return defaultDraft();
}

export function CreateProjectForm({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const userId = useAuthStore(state => state.user?.id);
  const currentUserEmail = useAuthStore(state => state.user?.email)?.trim().toLowerCase();
  const profileInterests = useAuthStore(state => state.user?.researchInterests);
  const storageKey = `lumigap.project-create.v1.${userId}`;
  const [draft, setDraft] = useState(() => readDraft(storageKey));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; researchField?: string; description?: string; keywords?: string }>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteValidation, setInviteValidation] = useState("");
  const [mentorSearchInput, setMentorSearchInput] = useState("");
  const lock = useRef(false);
  const create = useCreateProject();

  const taxonomy = useQuery({
    queryKey: ["academic-profile", "research-taxonomy"],
    queryFn: () => authApi.academicOnboardingOptions(),
    staleTime: 300_000,
  });

  const fieldOptions = Array.from(new Set([...DEFAULT_RESEARCH_FIELDS, ...(taxonomy.data?.researchAreas ?? [])]));
  const profileFieldSuggestions = (profileInterests ?? [])
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length <= 120)
    .slice(0, 3);

  const resolvedField = (draft.researchField === CUSTOM_FIELD_VALUE ? draft.customField : draft.researchField).trim();
  const pendingKeywordResult = draft.keywordsInput.trim()
    ? mergeKeywordTerms(draft.keywords, splitKeywordTerms(draft.keywordsInput), {
        max: DEFAULT_MAX_KEYWORDS,
        maxLength: DEFAULT_MAX_KEYWORD_LENGTH,
        language,
      })
    : { next: draft.keywords };
  const effectiveKeywords = pendingKeywordResult.next;
  const disabledForm = create.isPending || Boolean(draft.submitted);

  const queryEmail = useDebouncedValue(inviteEmail.trim(), 250);
  const userSearch = useQuery({
    queryKey: ["searchUsers", queryEmail],
    queryFn: async ({ signal }) => (await api.get<{ data: SearchUser[] }>(`/auth/search?email=${encodeURIComponent(queryEmail)}`, { signal })).data.data,
    enabled: draft.step === 2 && draft.teamMode === "TEAM" && queryEmail.length >= 2,
    staleTime: 60_000,
  });

  const debouncedMentorQuery = useDebouncedValue(mentorSearchInput.trim(), 250);
  const mentorSearchEnabled = draft.step === 2 && (
    draft.mentorMode === "FIND"
    || (draft.mentorMode === "INVITE" && debouncedMentorQuery.length >= 2)
  );
  const mentorSearch = useQuery({
    queryKey: ["project-create", "available-mentors", draft.mentorMode, resolvedField, debouncedMentorQuery],
    queryFn: () => academicSupportApi.searchMentors({
      ...(debouncedMentorQuery ? { q: debouncedMentorQuery } : {}),
      ...(draft.mentorMode === "FIND" && resolvedField ? { area: resolvedField } : {}),
      pageSize: 5,
    }),
    enabled: mentorSearchEnabled,
    staleTime: 60_000,
  });

  const change = (next: Partial<Draft>) => {
    const value = { ...draftRef.current, ...next };
    draftRef.current = value;
    setDraft(value);
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Optional draft storage. */ }
  };

  const validateStep1 = (): boolean => {
    const nextErrors: typeof fieldErrors = {};
    if (!draft.title.trim()) nextErrors.title = t("Enter a project title.");
    if (!resolvedField) nextErrors.researchField = t("Select a primary research area.");
    if (!draft.description.trim()) nextErrors.description = t("Enter a topic or research problem.");
    if (pendingKeywordResult.error) {
      nextErrors.keywords = pendingKeywordResult.error;
    } else if (effectiveKeywords.length === 0) {
      nextErrors.keywords = t("Enter at least one research keyword.");
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleContinue = () => {
    if (disabledForm) return;
    if (!validateStep1()) return;
    // Commit any pending keyword draft cleanly before advancing to Step 2.
    change({
      step: 2,
      keywords: effectiveKeywords,
      keywordsInput: "",
      additionalAreas: draft.additionalAreas.filter(a => a.trim().toLocaleLowerCase() !== resolvedField.toLocaleLowerCase()).slice(0, 2),
    });
  };

  const addQueuedInvite = (candidate: QueuedInvite) => {
    const email = candidate.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteValidation(t("Enter a valid email address."));
      return;
    }
    if ((currentUserEmail && email === currentUserEmail) || (candidate.userId && candidate.userId === userId)) {
      setInviteValidation(t("You cannot invite yourself to a project."));
      return;
    }
    if (draft.invitedMembers.some(item => item.email.toLowerCase() === email)) {
      setInviteValidation(t("This email has already been added."));
      return;
    }
    if (draft.invitedMembers.length >= 10) return;
    change({ invitedMembers: [...draft.invitedMembers, { ...candidate, email }] });
    setInviteEmail("");
    setInviteValidation("");
  };

  const removeQueuedInvite = (email: string) => {
    change({ invitedMembers: draft.invitedMembers.filter(item => item.email !== email) });
  };

  const buildPayload = (): CreateProjectRequest => {
    // Research areas contain ONLY explicitly selected disciplines — never keywords.
    const areas = [
      resolvedField,
      ...draft.additionalAreas.filter(a => a.trim().toLocaleLowerCase() !== resolvedField.toLocaleLowerCase()),
    ]
      .map(a => a.trim())
      .filter(Boolean)
      .slice(0, 3);
    return {
      title: draft.title.trim(),
      description: draft.description.trim(),
      researchField: resolvedField || undefined,
      researchAreas: areas,
      ...(effectiveKeywords.length ? { keywords: effectiveKeywords } : {}),
      researchApproach: draft.researchApproach,
      visibility: "PRIVATE",
      ...(draft.researchClassification ? { researchClassification: draft.researchClassification } : {}),
      idempotencyKey: draft.idempotencyKey,
    };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (draft.step === 1) {
      handleContinue();
      return;
    }
    if (!validateStep1()) {
      change({ step: 1 });
      return;
    }
    lock.current = true;
    onBusyChange(true);
    setError("");
    const payload = buildPayload();
    change({ submitted: true });
    try {
      const project = await create.mutateAsync(payload);
      const invitesToSend = draft.teamMode === "TEAM" ? draft.invitedMembers : [];
      if (invitesToSend.length > 0) {
        const results = await Promise.allSettled(
          invitesToSend.map(inv =>
            projectsApi.inviteMember(project._id, inv.userId ? { userId: inv.userId } : { email: inv.email }),
          ),
        );
        const failed = results.filter(r => r.status === "rejected").length;
        if (failed > 0) {
          toast.warning(t("Project created, but {{count}} invitations could not be sent. You can resend them in Team & settings.", { count: failed }));
        }
      }
      if (draft.mentorMode !== "LATER" && draft.selectedMentor) {
        try { sessionStorage.setItem(`lumigap-supervisor-invite:${userId}:${project._id}:${draft.selectedMentor.id}`, JSON.stringify({ summary: draft.description.trim().slice(0, 2000), reason: draft.mentorNote?.trim() || "", support: [], additional: "", period: "", role: "PRIMARY" })); } catch { /* The form can still load defaults from the created project. */ }
      }
      // Create the private project first, then open the same reviewed invitation form as Support.
      // A selected lecturer is not a sent invitation and never receives an automatic template.
      try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
      toast.success(t("Project created successfully"));
      onClose();
      const targetUrl = draft.mentorMode !== "LATER"
        ? `/projects/${encodeURIComponent(project._id)}?tab=support${draft.selectedMentor ? `&inviteMentor=${encodeURIComponent(draft.selectedMentor.id)}` : ""}`
        : `/projects/${encodeURIComponent(project._id)}?tab=papers&welcome=1`;
      navigate(targetUrl);
    } catch (failure) {
      const response = (failure as { response?: { status: number; data?: { error?: { code?: string } } } }).response;
      if (response?.status && response.status < 500) change({ submitted: false });
      setError(t(response?.data?.error?.code === "ONBOARDING_REQUIRED" ? "Complete your academic profile before creating a project."
        : response?.status === 401 ? "Please sign in again. Your project details are saved."
        : response?.status === 403 ? "Your account cannot create projects yet. Check your email verification and profile."
        : response?.status === 409 ? "This request was already used. Retry with the original project details."
        : "We could not confirm creation. Retry to safely recover the same project."));
    } finally {
      lock.current = false;
      onBusyChange(false);
    }
  };

  const mentorSummaryLabel = draft.mentorMode === "LATER"
    ? t("None yet")
    : draft.selectedMentor
    ? `${draft.selectedMentor.fullName || draft.selectedMentor.id} (${t("Selected")})`
    : draft.mentorMode === "FIND"
    ? t("Find a matching supervisor")
    : t("I already have a supervisor to invite");

  const teamSummaryLabel = draft.teamMode === "TEAM"
    ? (draft.invitedMembers.length > 0
      ? t("1 Owner + {{count}} invitations", { count: draft.invitedMembers.length })
      : t("Team mode (invite after creation)"))
    : t("1 person (Owner)");

  return (
    <div className="project-create-wizard" data-no-i18n>
      {draft.step === 1 ? (
        <>
          <DialogHeader className="space-y-1.5 pb-4 border-b border-border/80 text-left">
            <div className="flex items-center justify-between gap-3 pr-8">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                {t("Create research project")}
              </DialogTitle>
              <span className="shrink-0 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                {t("Step 1/2")}
              </span>
            </div>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {t("Start with the topic you want to research. You can add members, lecturers and papers later.")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} noValidate className="mt-5 space-y-4">
            <fieldset disabled={disabledForm} className="min-w-0 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="project-create-title" className="text-sm font-medium text-foreground">
                  {t("Project title")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="project-create-title"
                  name="title"
                  autoComplete="off"
                  autoFocus
                  maxLength={100}
                  required
                  value={draft.title}
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={fieldErrors.title ? "project-title-error" : undefined}
                  onChange={event => {
                    change({ title: event.target.value });
                    if (fieldErrors.title) setFieldErrors(prev => ({ ...prev, title: undefined }));
                  }}
                  placeholder={t("e.g. AI-powered vulnerability detection")}
                  className="h-11 rounded-full px-4 text-sm"
                />
                {fieldErrors.title ? (
                  <p id="project-title-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.title}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-create-field" className="text-sm font-medium text-foreground">
                  {t("Primary research area")} <span className="text-destructive">*</span>
                </Label>
                <select
                  id="project-create-field"
                  name="researchField"
                  value={draft.researchField}
                  aria-invalid={Boolean(fieldErrors.researchField)}
                  aria-describedby={fieldErrors.researchField ? "project-field-error" : undefined}
                  onChange={event => {
                    const nextField = event.target.value;
                    const normalizedNext = nextField === CUSTOM_FIELD_VALUE ? draft.customField.trim().toLocaleLowerCase() : nextField.trim().toLocaleLowerCase();
                    change({
                      researchField: nextField,
                      additionalAreas: draft.additionalAreas.filter(area => area.trim().toLocaleLowerCase() !== normalizedNext),
                    });
                    if (fieldErrors.researchField) setFieldErrors(prev => ({ ...prev, researchField: undefined }));
                  }}
                  className="flex h-11 w-full rounded-full border border-input bg-background px-4 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{t("Select a primary research area")}</option>
                  {fieldOptions.map(area => (
                    <option key={area} value={area}>
                      {t(area)}
                    </option>
                  ))}
                  <option value={CUSTOM_FIELD_VALUE}>{t("Custom research field")}</option>
                </select>
                {!resolvedField && profileFieldSuggestions.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-xs text-muted-foreground">{t("From your profile")}:</span>
                    {profileFieldSuggestions.map(suggestion => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          const matched = fieldOptions.find(opt => opt.toLocaleLowerCase() === suggestion.toLocaleLowerCase());
                          change({
                            researchField: matched ?? CUSTOM_FIELD_VALUE,
                            customField: matched ? "" : suggestion,
                            additionalAreas: draft.additionalAreas.filter(area => area.trim().toLocaleLowerCase() !== suggestion.toLocaleLowerCase()),
                          });
                          if (fieldErrors.researchField) setFieldErrors(prev => ({ ...prev, researchField: undefined }));
                        }}
                        className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        {t(suggestion)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {draft.researchField === CUSTOM_FIELD_VALUE ? (
                  <Input
                    id="project-create-custom-field"
                    aria-label={t("Enter research field")}
                    maxLength={120}
                    value={draft.customField}
                    onChange={event => {
                      change({ customField: event.target.value });
                      if (fieldErrors.researchField) setFieldErrors(prev => ({ ...prev, researchField: undefined }));
                    }}
                    placeholder={t("Enter research field")}
                    className="mt-2 h-11 rounded-full px-4 text-sm"
                  />
                ) : null}
                {fieldErrors.researchField ? (
                  <p id="project-field-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.researchField}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <ResearchAreaSelect
                  values={draft.additionalAreas}
                  max={2}
                  label="Additional research areas"
                  options={fieldOptions.filter(area => area.toLocaleLowerCase() !== resolvedField.toLocaleLowerCase())}
                  onChange={additionalAreas =>
                    change({
                      additionalAreas: additionalAreas.filter(
                        area => area.trim().toLocaleLowerCase() !== resolvedField.toLocaleLowerCase(),
                      ),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("Optional. Select up to 2 related disciplines.")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="project-create-description" className="text-sm font-medium text-foreground">
                  {t("Topic or research problem")} <span className="text-destructive">*</span>
                </Label>
                <textarea
                  id="project-create-description"
                  name="description"
                  rows={3}
                  maxLength={5000}
                  required
                  value={draft.description}
                  aria-invalid={Boolean(fieldErrors.description)}
                  aria-describedby={fieldErrors.description ? "project-description-error" : undefined}
                  onChange={event => {
                    change({ description: event.target.value });
                    if (fieldErrors.description) setFieldErrors(prev => ({ ...prev, description: undefined }));
                  }}
                  placeholder={t("What problem do you want to research? Which solution direction are you currently interested in?")}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  {t("You do not need a complete research gap, hypothesis, or methodology yet.")}
                </p>
                {fieldErrors.description ? (
                  <p id="project-description-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.description}
                  </p>
                ) : null}
              </div>

              <KeywordTagInput
                id="project-create-keywords"
                label={t("Research keywords")}
                required
                disabled={disabledForm}
                values={draft.keywords}
                draftInput={draft.keywordsInput}
                onChange={keywords => {
                  change({ keywords });
                  if (fieldErrors.keywords) setFieldErrors(prev => ({ ...prev, keywords: undefined }));
                }}
                onDraftInputChange={keywordsInput => {
                  change({ keywordsInput });
                  if (fieldErrors.keywords) setFieldErrors(prev => ({ ...prev, keywords: undefined }));
                }}
                error={fieldErrors.keywords}
                errorId="project-keywords-error"
              />

              <details className="project-form-optional rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  {t("Additional research classification")}
                </summary>
                <div className="pt-4">
                  <ResearchClassificationFields
                    mode="project"
                    value={draft.researchClassification}
                    onChange={researchClassification => change({ researchClassification })}
                  />
                </div>
              </details>

              <fieldset className="space-y-2.5 pt-1">
                <legend className="text-sm font-medium text-foreground">{t("Initial research approach")}</legend>
                <div className="space-y-2">
                  {INITIAL_RESEARCH_APPROACHES.map(goal => (
                    <label key={goal.value} className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                      <input
                        type="radio"
                        name="researchApproach"
                        value={goal.value}
                        checked={draft.researchApproach === goal.value}
                        onChange={() => change({ researchApproach: goal.value })}
                        className="h-4 w-4 accent-foreground cursor-pointer"
                      />
                      <span>{t(goal.label)}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("A starting direction. You can change it later in the Research Plan.")}
                </p>
              </fieldset>

              <div className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold text-foreground"><LockKeyhole className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><span>{t("Privacy: Private")}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("Your project starts private. Invite people when you are ready.")}</p></div>
            </fieldset>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={disabledForm}
                className="h-11 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 font-semibold text-sm gap-2"
              >
                <span>{t("Continue to team setup")}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </>
      ) : (
        <>
          <DialogHeader className="space-y-1.5 pb-4 border-b border-border/80 text-left">
            <div className="flex items-center justify-between gap-3 pr-8">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                {t("Set up research team")}
              </DialogTitle>
              <span className="shrink-0 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                {t("Optional")}
              </span>
            </div>
            <p className="text-xs font-medium text-muted-foreground">{t("Step 2/2 · Collaboration & mentoring")}</p>
            <div className="grid grid-cols-2 gap-2 pt-1.5" aria-hidden="true">
              <div className="h-1 rounded-full bg-foreground" />
              <div className="h-1 rounded-full bg-foreground" />
            </div>
            <DialogDescription className="pt-2 text-sm text-muted-foreground leading-relaxed">
              {t("You can invite members, find a supervisor, or start researching right away. Everything can be changed later.")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} noValidate className="mt-5 space-y-5">
            <fieldset disabled={disabledForm} className="min-w-0 space-y-5">
              {/* Section A: Research team */}
              <section className="space-y-3 pb-4 border-b border-border/70">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>{t("A. Research team")}</span>
                </h3>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <User className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{t("You (project creator)")}</p>
                      <p className="text-xs text-muted-foreground truncate">{t("Manage project and invitations")}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                    Owner
                  </span>
                </div>

                <div className="space-y-2.5">
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                    <input
                      type="radio"
                      name="teamMode"
                      value="SOLO"
                      checked={draft.teamMode === "SOLO"}
                      onChange={() => change({ teamMode: "SOLO" })}
                      className="h-4 w-4 accent-foreground cursor-pointer"
                    />
                    <span>{t("Individual research — add members later")}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                    <input
                      type="radio"
                      name="teamMode"
                      value="TEAM"
                      checked={draft.teamMode === "TEAM"}
                      onChange={() => change({ teamMode: "TEAM" })}
                      className="h-4 w-4 accent-foreground cursor-pointer"
                    />
                    <span>{t("Team research — invite members")}</span>
                  </label>
                </div>

                {draft.teamMode === "TEAM" ? (
                  <div className="space-y-2.5 rounded-2xl border border-border/80 bg-muted/20 p-3.5">
                    <Label htmlFor="project-wizard-invite-email" className="text-xs font-medium text-foreground">
                      {t("Teammate email")}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="project-wizard-invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={event => {
                          setInviteEmail(event.target.value);
                          if (inviteValidation) setInviteValidation("");
                        }}
                        onKeyDown={event => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (inviteEmail.trim()) addQueuedInvite({ email: inviteEmail });
                          }
                        }}
                        placeholder="user@example.com"
                        className="h-9 rounded-full px-3.5 text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addQueuedInvite({ email: inviteEmail })}
                        disabled={!inviteEmail.trim()}
                        className="h-9 rounded-full px-3.5 shrink-0 gap-1 text-xs font-medium"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("Add teammate")}</span>
                      </Button>
                    </div>
                    {inviteValidation ? (
                      <p role="alert" className="text-xs text-destructive">{inviteValidation}</p>
                    ) : null}
                    {inviteEmail.trim().length >= 2 && userSearch.data && userSearch.data.length > 0 ? (
                      <ul className="space-y-1 rounded-xl border bg-background p-1.5">
                        {userSearch.data
                          .filter(u => u.id !== userId && !draft.invitedMembers.some(m => m.email.toLowerCase() === u.email.toLowerCase()))
                          .slice(0, 4)
                          .map(u => (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => addQueuedInvite({ email: u.email, userId: u.id, fullName: u.fullName })}
                                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                              >
                                <span className="font-medium text-foreground">{u.fullName || u.email}</span>
                                <span className="text-muted-foreground">{u.email}</span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    ) : null}
                    {draft.invitedMembers.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {draft.invitedMembers.map(member => (
                          <span key={member.email} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground">
                            <span>{member.fullName ? `${member.fullName} (${member.email})` : member.email}</span>
                            <button
                              type="button"
                              aria-label={`${t("Remove")} ${member.email}`}
                              onClick={() => removeQueuedInvite(member.email)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("Enter an email or search by account to queue invitations when creating the project.")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("Invited teammates join as Members only after accepting their invitation.")}
                    </p>
                  </div>
                ) : null}
              </section>

              {/* Section B: Research supervisor */}
              <section className="space-y-3 pb-4 border-b border-border/70">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>{t("B. Research supervisor")}</span>
                </h3>
                <div className="space-y-2.5">
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                    <input
                      type="radio"
                      name="mentorMode"
                      value="LATER"
                      checked={draft.mentorMode === "LATER"}
                      onChange={() => {
                        setMentorSearchInput("");
                        change({ mentorMode: "LATER", selectedMentor: undefined, mentorNote: undefined });
                      }}
                      className="h-4 w-4 accent-foreground cursor-pointer"
                    />
                    <span>{t("No supervisor yet — choose later")}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                    <input
                      type="radio"
                      name="mentorMode"
                      value="FIND"
                      checked={draft.mentorMode === "FIND"}
                      onChange={() => change({ mentorMode: "FIND" })}
                      className="h-4 w-4 accent-foreground cursor-pointer"
                    />
                    <span>{t("Find a matching supervisor")}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                    <input
                      type="radio"
                      name="mentorMode"
                      value="INVITE"
                      checked={draft.mentorMode === "INVITE"}
                      onChange={() => change({ mentorMode: "INVITE" })}
                      className="h-4 w-4 accent-foreground cursor-pointer"
                    />
                    <span>{t("I already have a supervisor to invite")}</span>
                  </label>
                </div>

                {draft.mentorMode === "FIND" || draft.mentorMode === "INVITE" ? (
                  <div className="space-y-2.5 rounded-2xl border border-border/80 bg-muted/20 p-3.5">
                    <Label htmlFor="project-wizard-mentor-search" className="text-xs font-medium text-foreground">
                      {t("Search verified lecturers")}
                    </Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="project-wizard-mentor-search"
                        value={mentorSearchInput}
                        onChange={event => setMentorSearchInput(event.target.value)}
                        placeholder={t(draft.mentorMode === "FIND" ? "Search by name, field, or keyword" : "Search by lecturer name or exact email")}
                        className="h-9 rounded-full pl-8 pr-3.5 text-sm"
                      />
                    </div>

                    {draft.selectedMentor ? (
                      <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <a href={`/academics/${encodeURIComponent(draft.selectedMentor.id)}`} target="_blank" rel="noopener noreferrer" title={t("View profile")} className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{draft.selectedMentor.fullName || draft.selectedMentor.id}</a>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                <span>{t("Verified Lecturer")}</span>
                              </span>
                            </div>
                            {draft.selectedMentor.positionTitle || draft.selectedMentor.institutionName ? (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {[draft.selectedMentor.positionTitle, draft.selectedMentor.institutionName].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            aria-label={`${t("Remove")} ${draft.selectedMentor.fullName || draft.selectedMentor.id}`}
                            onClick={() => change({ selectedMentor: undefined, mentorNote: undefined })}
                            className="text-muted-foreground hover:text-foreground p-1"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <Input
                          value={draft.mentorNote ?? ""}
                          onChange={event => change({ mentorNote: event.target.value.slice(0, 1000) })}
                          placeholder={t("Optional message for supervisor invitation…")}
                          className="h-8 text-xs"
                        />
                      </div>
                    ) : null}

                    {mentorSearchEnabled ? (
                      mentorSearch.isLoading ? (
                        <p className="text-xs text-muted-foreground">{t("Searching lecturers…")}</p>
                      ) : mentorSearch.data && mentorSearch.data.items.length > 0 ? (
                        <ul className="space-y-1.5" role="list">
                          {mentorSearch.data.items.slice(0, 4).map(mentor => {
                            const selected = draft.selectedMentor?.id === mentor._id;
                            return (
                              <li key={mentor._id} className="flex items-start justify-between gap-2 rounded-xl border border-border/80 bg-background p-2.5">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <a href={`/academics/${encodeURIComponent(mentor._id)}`} target="_blank" rel="noopener noreferrer" title={t("View profile")} className="text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{mentor.fullName || mentor._id}</a>
                                    {mentor.verifiedLecturer ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                                        <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />
                                        <span>{t("Verified Lecturer")}</span>
                                      </span>
                                    ) : null}
                                  </div>
                                  {mentor.positionTitle || mentor.institutionName ? (
                                    <p className="text-[11px] text-muted-foreground truncate">
                                      {[mentor.positionTitle, mentor.institutionName].filter(Boolean).join(" · ")}
                                    </p>
                                  ) : null}
                                  {mentor.expertiseAreas.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {mentor.expertiseAreas.slice(0, 3).map(area => (
                                        <span key={area} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                          {area}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={selected ? "secondary" : "outline"}
                                  className="h-7 rounded-full px-2.5 text-xs shrink-0 gap-1"
                                  onClick={() => change({
                                    selectedMentor: selected ? undefined : {
                                      id: mentor._id,
                                      fullName: mentor.fullName,
                                      institutionName: mentor.institutionName,
                                      positionTitle: mentor.positionTitle,
                                      expertiseAreas: mentor.expertiseAreas,
                                    },
                                  })}
                                >
                                  {selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                                  <span>{t(selected ? "Selected" : "Select")}</span>
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t("No matching verified lecturers found right now. You can continue and invite from Academic Support later.")}
                        </p>
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("Type at least 2 characters to search verified lecturers, or leave blank to invite after creation.")}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {t("The lecturer reviews a safe research summary and only gains Supervisor access after accepting.")}
                    </p>
                  </div>
                ) : null}
              </section>

              <div className="flex items-center gap-3 rounded-2xl border border-border/80 px-4 py-3"><LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div><p className="text-sm font-semibold text-foreground">{t("Private project")}</p><p className="text-xs text-muted-foreground">{t("Your project starts private. Invite people when you are ready.")}</p></div></div>

              {/* Configuration summary */}
              <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 space-y-1.5 text-sm">
                <p className="font-semibold text-foreground">{t("Configuration summary")}</p>
                <p className="text-muted-foreground">
                  {t("Project title")}: <span className="text-foreground">{draft.title.trim() || "—"}</span>
                </p>
                <p className="text-muted-foreground line-clamp-2">
                  {t("Field & topic")}:{" "}
                  <span className="text-foreground">
                    {[resolvedField, ...draft.additionalAreas].filter(Boolean).map(area => t(area)).join(" · ") || "—"}
                    {draft.description.trim() ? ` — ${draft.description.trim()}` : ""}
                  </span>
                </p>
                {effectiveKeywords.length > 0 ? (
                  <p className="text-muted-foreground line-clamp-2">
                    {t("Research keywords")}:{" "}
                    <span className="text-foreground">{effectiveKeywords.join(", ")}</span>
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  {t("Team size")}: <span className="text-foreground">{teamSummaryLabel}</span>
                </p>
                <p className="text-muted-foreground">
                  {t("Supervisor")}: <span className="text-foreground">{mentorSummaryLabel}</span>
                </p>
                <p className="text-muted-foreground">
                  {t("Display visibility")}: <span className="text-foreground">{draft.visibility === "PRIVATE" ? "Private" : "Public"}</span>
                </p>
              </div>
            </fieldset>

            {error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}
            {draft.submitted && !create.isPending ? (
              <p className="text-xs text-muted-foreground">{t("Your submitted details are kept for a safe retry.")}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                disabled={disabledForm}
                onClick={() => change({ step: 1 })}
                className="h-11 rounded-full text-sm font-medium"
              >
                {t("Back")}
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                className="h-11 rounded-full bg-foreground text-background hover:bg-foreground/90 font-semibold text-sm gap-2"
              >
                <span>{t(create.isPending ? "Creating…" : error ? "Retry creation" : "Create project")}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
