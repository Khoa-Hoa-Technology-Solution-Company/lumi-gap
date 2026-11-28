import { classificationInput } from "@/features/academic-profile/utils/research-classification";
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MentorDiscoverySettings as Settings, MentorPolicyInput, MentorRecruitmentProfile, MentorshipAttachment } from "@trend/shared-types";
import { Eye, FileText, ShieldCheck, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { authApi } from "@/features/auth/api/auth.api";
import { academicSupportApi } from "../api/academic-support.api";
import { MentoringSupportFields, ResearchClassificationFields, ResearchClassificationSummary } from "@/features/academic-profile/components/research-classification-fields";
import { ResearchAreaSelect } from "./research-area-select";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import { MentorTopicSuggestions } from "./mentor-topic-suggestions";
import { defaultMentorPolicy, MentorPolicyFields } from "./mentor-access-workspace";
import { ResearchTeamDossierSheet } from "./research-team-dossier-sheet";
import { useAuthStore } from "@/stores/auth-store";

type EditorOptions = { startEditing?: boolean; onDone?: () => void; onEditingChange?: (editing: boolean) => void };
export function MentorDiscoverySettings({ projectId, ...options }: { projectId: string } & EditorOptions) {
  const { t } = useI18n();
  const userId = useAuthStore(s => s.user?.id);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", projectId], queryFn: () => academicSupportApi.settings(projectId) });
  if (settings.isLoading) return <Skeleton className="h-16 w-full" />;
  if (!settings.data) return <div role="alert" className="space-y-2 text-sm"><p>{t("Could not load mentor discovery settings.")}</p><Button type="button" size="sm" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button></div>;
  return <>{settings.isError && <p role="alert">{t("Could not load mentor discovery settings.")}</p>}<DiscoveryEditor key={`${userId}:${projectId}`} settings={settings.data} {...options} /></>;
}

const valueOf = (s: Settings) => {
  const profile: MentorRecruitmentProfile = s.mentorshipProfile ?? {};
  return {
    supportTypes: s.supportTypes ?? [],
    researchClassification: classificationInput(s.researchClassification),
    discovery: s.discovery,
    summary: s.summary,
    expertise: s.expertise,
    researchAreas: s.researchAreas,
    mentoringNeeds: s.mentoringNeeds,
    methodologies: s.methodologies ?? [],
    mentorshipProfile: {
      researchProblem: profile.researchProblem ?? "",
      researchObjectives: profile.researchObjectives ?? [],
      researchQuestions: profile.researchQuestions ?? [],
      expectedOutcomes: profile.expectedOutcomes ?? "",
      expectedDuration: profile.expectedDuration ?? "",
      expectedFrequency: profile.expectedFrequency ?? "",
      workingMode: profile.workingMode ?? "",
      mentoringGoals: profile.mentoringGoals ?? "",
      progressSummary: {
        completed: profile.progressSummary?.completed ?? "",
        inProgress: profile.progressSummary?.inProgress ?? "",
        notStarted: profile.progressSummary?.notStarted ?? "",
        challenges: profile.progressSummary?.challenges ?? "",
        feedbackNeeded: profile.progressSummary?.feedbackNeeded ?? "",
        upcomingMilestone: profile.progressSummary?.upcomingMilestone ?? "",
      },
      recruitingRoles: profile.recruitingRoles ?? [],
      sharedAttachmentIds: profile.sharedAttachmentIds ?? [],
      prospectiveAccess: profile.prospectiveAccess
        ? {
            preset: profile.prospectiveAccess.preset,
            permissions: [...profile.prospectiveAccess.permissions],
            expiresAt: profile.prospectiveAccess.expiresAt,
            scopeNote: profile.prospectiveAccess.scopeNote ?? "",
          }
        : null,
    },
  };
};

function cleanProfilePayload(raw: ReturnType<typeof valueOf>["mentorshipProfile"]): MentorRecruitmentProfile {
  const progress = raw.progressSummary;
  const cleanedProgress = {
    ...(progress.completed.trim() ? { completed: progress.completed.trim() } : {}),
    ...(progress.inProgress.trim() ? { inProgress: progress.inProgress.trim() } : {}),
    ...(progress.notStarted.trim() ? { notStarted: progress.notStarted.trim() } : {}),
    ...(progress.challenges.trim() ? { challenges: progress.challenges.trim() } : {}),
    ...(progress.feedbackNeeded.trim() ? { feedbackNeeded: progress.feedbackNeeded.trim() } : {}),
    ...(progress.upcomingMilestone.trim() ? { upcomingMilestone: progress.upcomingMilestone.trim() } : {}),
  };
  return {
    ...(raw.researchProblem.trim() ? { researchProblem: raw.researchProblem.trim() } : {}),
    ...(raw.researchObjectives.length ? { researchObjectives: raw.researchObjectives } : {}),
    ...(raw.researchQuestions.length ? { researchQuestions: raw.researchQuestions } : {}),
    ...(raw.expectedOutcomes.trim() ? { expectedOutcomes: raw.expectedOutcomes.trim() } : {}),
    ...(raw.expectedDuration.trim() ? { expectedDuration: raw.expectedDuration.trim() } : {}),
    ...(raw.expectedFrequency.trim() ? { expectedFrequency: raw.expectedFrequency.trim() } : {}),
    ...(raw.workingMode.trim() ? { workingMode: raw.workingMode.trim() } : {}),
    ...(raw.mentoringGoals.trim() ? { mentoringGoals: raw.mentoringGoals.trim() } : {}),
    ...(Object.keys(cleanedProgress).length ? { progressSummary: cleanedProgress } : {}),
    ...(raw.recruitingRoles.length ? { recruitingRoles: raw.recruitingRoles } : {}),
    ...(raw.sharedAttachmentIds.length ? { sharedAttachmentIds: raw.sharedAttachmentIds } : {}),
    prospectiveAccess: raw.prospectiveAccess
      ? {
          preset: raw.prospectiveAccess.preset,
          permissions: raw.prospectiveAccess.permissions,
          expiresAt: raw.prospectiveAccess.expiresAt,
          ...(raw.prospectiveAccess.scopeNote?.trim() ? { scopeNote: raw.prospectiveAccess.scopeNote.trim() } : {}),
        }
      : null,
  };
}

function DiscoveryEditor({ settings, startEditing = false, onDone, onEditingChange }: { settings: Settings } & EditorOptions) {
  const { t, language } = useI18n(), cache = useQueryClient(), lock = useRef(false);
  const isVi = language === "vi";
  const userId = useAuthStore(s => s.user?.id);
  const editorId = useId();
  const [baseline, setBaseline] = useState(settings);
  const [draft, setDraft] = useState(() => valueOf(settings));
  const [editing, setEditing] = useState(startEditing);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<MentorshipAttachment[]>(settings.sharedAttachments ?? []);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => { onEditingChange?.(editing); return () => onEditingChange?.(false); }, [editing, onEditingChange]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(valueOf(baseline));
  const latest = settings.version > baseline.version;
  useUnsavedWorkspace(dirty);
  // Keep the preview live on clean refetches, while retaining a dirty draft's version.
  if (!dirty && latest) {
    setBaseline(settings);
    setDraft(valueOf(settings));
    setUploadedAttachments(settings.sharedAttachments ?? []);
  }
  const taxonomy = useQuery({ queryKey: ["academic-profile", "research-taxonomy"], queryFn: () => authApi.academicOnboardingOptions(), staleTime: 300_000 });

  const save = useMutation({
    mutationFn: () =>
      academicSupportApi.saveSettings(settings.id, {
        supportTypes: draft.supportTypes,
        researchClassification: draft.researchClassification,
        discovery: draft.discovery,
        summary: draft.summary.trim(),
        expertise: draft.expertise,
        researchAreas: draft.researchAreas,
        mentoringNeeds: draft.mentoringNeeds,
        methodologies: draft.methodologies,
        mentorshipProfile: cleanProfilePayload(draft.mentorshipProfile),
        expectedVersion: baseline.version,
      }),
    onSuccess: result => {
      setBaseline(result);
      setDraft(valueOf(result));
      setUploadedAttachments(result.sharedAttachments ?? []);
      setEditing(false);
      cache.setQueryData(["academic-support", userId, "discovery-settings", settings.id], result);
      for (const key of [["project", settings.id], ["academic-support"], ["projects"]]) void cache.invalidateQueries({ queryKey: key });
      toast.success(t("Mentor preferences saved"));
      onDone?.();
    },
  });

  const handleUploadIntroFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const uploaded = await academicSupportApi.uploadAttachment(settings.id, "PROJECT_TO_LECTURER", file);
      setUploadedAttachments(prev => (prev.some(item => item.id === uploaded.id) ? prev : [...prev, uploaded]));
      setDraft(prev => ({
        ...prev,
        mentorshipProfile: {
          ...prev.mentorshipProfile,
          sharedAttachmentIds: [...new Set([...prev.mentorshipProfile.sharedAttachmentIds, uploaded.id])].slice(0, 5),
        },
      }));
      toast.success(isVi ? `Đã đính kèm tài liệu giới thiệu: ${uploaded.fileName}` : `Attached intro file: ${uploaded.fileName}`);
    } catch {
      toast.error(isVi ? "Không thể tải tệp lên. Chỉ hỗ trợ PDF, DOCX, JPG, PNG, WebP tối đa 5 MB." : "Could not upload file (PDF, DOCX, JPG, PNG, WebP up to 5 MB).");
    } finally {
      setUploadingFile(false);
    }
  };

  const seeking = baseline.discovery === "SEEKING_MENTOR";
  const conflict = (save.error as { response?: { status?: number } } | null)?.response?.status === 409;
  const configured = baseline.researchAreas.length > 0 || baseline.expertise.length > 0 || Boolean(baseline.mentoringNeeds.trim());
  const hasProspectiveAccess = Boolean(baseline.mentorshipProfile?.prospectiveAccess);

  const updateProfile = (patch: Partial<ReturnType<typeof valueOf>["mentorshipProfile"]>) =>
    setDraft(prev => ({ ...prev, mentorshipProfile: { ...prev.mentorshipProfile, ...patch } }));

  const updateProgress = (patch: Partial<ReturnType<typeof valueOf>["mentorshipProfile"]["progressSummary"]>) =>
    setDraft(prev => ({
      ...prev,
      mentorshipProfile: {
        ...prev.mentorshipProfile,
        progressSummary: { ...prev.mentorshipProfile.progressSummary, ...patch },
      },
    }));

  const currentPolicy: MentorPolicyInput = draft.mentorshipProfile.prospectiveAccess
    ? {
        preset: draft.mentorshipProfile.prospectiveAccess.preset,
        permissions: draft.mentorshipProfile.prospectiveAccess.permissions,
        expiresAt: draft.mentorshipProfile.prospectiveAccess.expiresAt,
      }
    : defaultMentorPolicy();

  return (
    <section className="mentor-preferences min-w-0 space-y-3" aria-label={t("Mentor preferences")}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{isVi ? "Hồ sơ tìm cố vấn" : t("Mentor preferences")}</h3>
          <Badge variant={seeking ? "default" : "secondary"} className="text-[11px]">
            {seeking ? (isVi ? "Đang bật tìm cố vấn" : "Seeking mentor") : (isVi ? "Đang ẩn khỏi khám phá" : "Discovery off")}
          </Badge>
          {hasProspectiveAccess ? (
            <Badge variant="outline" className="text-[11px] border-emerald-500/35 text-emerald-700 dark:text-emerald-300">
              {isVi ? "Đã duyệt chính sách quyền dự kiến" : "Prospective access ready"}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" variant="outline" className="gap-1.5 text-xs" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isVi ? "Xem trước hồ sơ dành cho giảng viên" : "Preview lecturer view"}</span>
          </Button>
          {!editing ? (
            <Button size="sm" type="button" variant="outline" onClick={() => setEditing(true)}>
              {t(configured ? "Edit preferences" : "Set up mentor preferences")}
            </Button>
          ) : null}
        </div>
      </div>

      {!editing ? (
        <div className="space-y-2">
          <ResearchClassificationSummary value={baseline.researchClassification} />
          {configured ? (
            <>
              <div className="mentor-preference-terms">
                {[...new Set([...baseline.researchAreas, ...baseline.expertise])].map(term => <span key={term}>{t(term)}</span>)}
              </div>
              {baseline.mentoringNeeds ? <p className="line-clamp-2 whitespace-pre-wrap text-sm leading-6">{baseline.mentoringNeeds}</p> : null}
            </>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {t("Tell us which fields and expertise your team needs. We will prioritize matching lecturers.")}
            </p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            {t(seeking ? "Verified lecturers can discover your shared project preview." : "Only lecturers you invite will see this preview. Project discovery is off.")}
          </p>
          {baseline.memberConsentSummary ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {isVi
                  ? `Thành viên chia sẻ hồ sơ học thuật: ${baseline.memberConsentSummary.consentedCount}/${baseline.memberConsentSummary.totalMembers} thành viên.`
                  : `Members sharing Academic Profile: ${baseline.memberConsentSummary.consentedCount}/${baseline.memberConsentSummary.totalMembers}.`}
              </span>
            </p>
          ) : null}

          <div className="grid gap-2 rounded-xl border border-border/75 bg-muted/20 p-3 text-xs sm:grid-cols-3">
            <div className="space-y-0.5">
              <p className="font-semibold text-foreground">{isVi ? "1. Hồ sơ tìm cố vấn" : "1. Discovery profile"}</p>
              <p className="text-muted-foreground">
                {configured && seeking
                  ? isVi ? "Đã bật hiển thị cho giảng viên" : "Visible to eligible lecturers"
                  : configured
                    ? isVi ? "Đã điền thông tin (đang ẩn)" : "Configured (discovery off)"
                    : isVi ? "Cần bổ sung lĩnh vực & tóm tắt" : "Needs fields & abstract"}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-foreground">{isVi ? "2. Quyền truy cập dự kiến" : "2. Prospective access"}</p>
              <p className="text-muted-foreground">
                {hasProspectiveAccess
                  ? isVi ? "Sẵn sàng nhận đề nghị trực tiếp" : "Ready for direct proposals"
                  : isVi ? "Chưa bật — chỉ nhận bày tỏ quan tâm" : "Off — non-binding interest only"}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-foreground">{isVi ? "3. Đồng thuận hồ sơ nhóm" : "3. Member consent"}</p>
              <p className="text-muted-foreground">
                {baseline.memberConsentSummary
                  ? isVi
                    ? `${baseline.memberConsentSummary.consentedCount}/${baseline.memberConsentSummary.totalMembers} thành viên đã bật chia sẻ`
                    : `${baseline.memberConsentSummary.consentedCount}/${baseline.memberConsentSummary.totalMembers} opted in`
                  : isVi ? "Mỗi thành viên tự bật/tắt riêng" : "Controlled individually by each member"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={async event => {
            event.preventDefault();
            if (!dirty || lock.current) return;
            lock.current = true;
            try { await save.mutateAsync(); } catch { /* Keep input for retry. */ } finally { lock.current = false; }
          }}
        >
          {latest ? (
            <div role="status" className="space-y-2 text-sm">
              <p>{t("A newer version is available. Your draft has been kept.")}</p>
              <Button size="sm" type="button" variant="outline" onClick={async () => { if ((await canLeaveWorkspace())) { setBaseline(settings); setDraft(valueOf(settings)); save.reset(); } }}>
                {t("Load latest version")}
              </Button>
            </div>
          ) : null}

          <fieldset disabled={save.isPending} className="min-w-0 space-y-5">
            <p className="text-xs leading-5 text-muted-foreground">
              {t("Saved fields and expertise are used to rank lecturers. Describe the support you need in your invitation.")}
            </p>

            <MentorTopicSuggestions
              projectId={settings.id}
              version={baseline.version}
              disabled={dirty || baseline.summary.trim().length < 20 || baseline.title.length + baseline.summary.length > 2000}
              value={draft.researchClassification}
              onChange={researchClassification => setDraft({ ...draft, researchClassification })}
            />
            <ResearchClassificationFields
              value={draft.researchClassification}
              onChange={researchClassification => setDraft({ ...draft, researchClassification })}
            />

            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">{t("Additional custom requirements (optional)")}</summary>
              <div className="space-y-4 pt-3">
                <ResearchAreaSelect label="Mentor research fields" values={draft.researchAreas} onChange={researchAreas => setDraft({ ...draft, researchAreas })} max={10} options={taxonomy.data?.researchAreas} />
                <ResearchAreaSelect label="Expertise requested" values={draft.expertise} onChange={expertise => setDraft({ ...draft, expertise })} max={10} options={taxonomy.data?.researchAreas} />
                <ResearchAreaSelect label="Methods requested" values={draft.methodologies} onChange={methodologies => setDraft({ ...draft, methodologies })} max={10} />
              </div>
            </details>

            <MentoringSupportFields values={draft.supportTypes} onChange={supportTypes => setDraft({ ...draft, supportTypes })} />

            <div className="space-y-2">
              <Label htmlFor={`${editorId}-needs`}>{t("Mentoring needs")}</Label>
              <textarea
                id={`${editorId}-needs`}
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={3}
                value={draft.mentoringNeeds}
                maxLength={2000}
                onChange={event => setDraft({ ...draft, mentoringNeeds: event.target.value })}
                placeholder={t("For example: study design, weekly feedback, or help evaluating results.")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${editorId}-summary`}>{t("Shared research abstract")}</Label>
              <textarea
                id={`${editorId}-summary`}
                aria-describedby={`${editorId}-summary-help`}
                className="min-h-32 w-full rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={5}
                value={draft.summary}
                maxLength={2000}
                required={draft.discovery === "SEEKING_MENTOR"}
                minLength={draft.discovery === "SEEKING_MENTOR" ? 10 : undefined}
                onChange={event => setDraft({ ...draft, summary: event.target.value })}
                placeholder={t("Describe the research problem, objectives and proposed approach. Share only what lecturers may read before accepting.")}
              />
              <p id={`${editorId}-summary-help`} className="text-xs leading-5 text-muted-foreground">
                {t("This approved abstract is visible before acceptance. Private project descriptions and manuscript source are never copied automatically.")}
              </p>
            </div>

            {/* Structured Overview, Progress & Expectations */}
            <details className="rounded-xl border border-border/80 bg-muted/15 p-3.5 space-y-3">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                {isVi ? "Thông tin mở rộng cho Hồ sơ nhóm (vấn đề, mục tiêu, tiến độ & kỳ vọng)" : "Extended team dossier details (problem, objectives, progress & expectations)"}
              </summary>
              <div className="space-y-3 pt-2 border-t border-border/60 text-xs">
                <label className="block space-y-1">
                  <span className="font-medium text-foreground">{isVi ? "Vấn đề nghiên cứu" : "Research problem"}</span>
                  <textarea rows={2} maxLength={1200} className="w-full rounded-md border bg-background p-2 text-xs" value={draft.mentorshipProfile.researchProblem} onChange={e => updateProfile({ researchProblem: e.target.value })} />
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Mục tiêu nghiên cứu (mỗi dòng 1 mục)" : "Research objectives (one per line)"}</span>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border bg-background p-2 text-xs"
                      value={draft.mentorshipProfile.researchObjectives.join("\n")}
                      onChange={e => updateProfile({ researchObjectives: e.target.value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 8) })}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Câu hỏi nghiên cứu dự kiến (không bắt buộc)" : "Draft research questions (optional)"}</span>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border bg-background p-2 text-xs"
                      value={draft.mentorshipProfile.researchQuestions.join("\n")}
                      onChange={e => updateProfile({ researchQuestions: e.target.value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 8) })}
                    />
                  </label>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Công việc đã thực hiện" : "Completed work"}</span>
                    <textarea rows={2} maxLength={1000} className="w-full rounded-md border bg-background p-2 text-xs" value={draft.mentorshipProfile.progressSummary.completed} onChange={e => updateProgress({ completed: e.target.value })} />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Công việc đang thực hiện" : "Work in progress"}</span>
                    <textarea rows={2} maxLength={1000} className="w-full rounded-md border bg-background p-2 text-xs" value={draft.mentorshipProfile.progressSummary.inProgress} onChange={e => updateProgress({ inProgress: e.target.value })} />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Khó khăn hiện tại" : "Current challenges"}</span>
                    <textarea rows={2} maxLength={1000} className="w-full rounded-md border bg-background p-2 text-xs" value={draft.mentorshipProfile.progressSummary.challenges} onChange={e => updateProgress({ challenges: e.target.value })} />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Nội dung cần giảng viên góp ý" : "Areas needing mentor feedback"}</span>
                    <textarea rows={2} maxLength={1000} className="w-full rounded-md border bg-background p-2 text-xs" value={draft.mentorshipProfile.progressSummary.feedbackNeeded} onChange={e => updateProgress({ feedbackNeeded: e.target.value })} />
                  </label>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Thời gian dự kiến" : "Expected duration"}</span>
                    <select className="h-8 w-full rounded-md border bg-background px-2" value={draft.mentorshipProfile.expectedDuration} onChange={e => updateProfile({ expectedDuration: e.target.value })}>
                      <option value="">{isVi ? "Chưa xác định" : "Not specified"}</option>
                      <option value="1_SEMESTER">{isVi ? "1 học kỳ" : "1 semester"}</option>
                      <option value="2_SEMESTERS">{isVi ? "2 học kỳ" : "2 semesters"}</option>
                      <option value="FULL_PROJECT">{isVi ? "Toàn bộ dự án" : "Full project"}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Tần suất trao đổi" : "Expected frequency"}</span>
                    <select className="h-8 w-full rounded-md border bg-background px-2" value={draft.mentorshipProfile.expectedFrequency} onChange={e => updateProfile({ expectedFrequency: e.target.value })}>
                      <option value="">{isVi ? "Thống nhất sau" : "Flexible"}</option>
                      <option value="WEEKLY">{isVi ? "Hàng tuần" : "Weekly"}</option>
                      <option value="BIWEEKLY">{isVi ? "2 tuần/lần" : "Biweekly"}</option>
                      <option value="MILESTONE_BASED">{isVi ? "Theo mốc nghiên cứu" : "By milestone"}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-foreground">{isVi ? "Hình thức làm việc" : "Working mode"}</span>
                    <select className="h-8 w-full rounded-md border bg-background px-2" value={draft.mentorshipProfile.workingMode} onChange={e => updateProfile({ workingMode: e.target.value })}>
                      <option value="">{isVi ? "Linh hoạt" : "Flexible"}</option>
                      <option value="ONLINE">{isVi ? "Trực tuyến" : "Online"}</option>
                      <option value="HYBRID">{isVi ? "Kết hợp" : "Hybrid"}</option>
                      <option value="IN_PERSON">{isVi ? "Trực tiếp" : "In person"}</option>
                    </select>
                  </label>
                </div>

                <div className="space-y-1">
                  <span className="font-medium text-foreground">{isVi ? "Vai trò mentor đang tuyển (tùy chọn)" : "Recruiting mentor roles (optional)"}</span>
                  <div className="flex flex-wrap gap-2">
                    {(["PRIMARY", "SECONDARY"] as const).map(role => {
                      const checked = draft.mentorshipProfile.recruitingRoles.includes(role);
                      return (
                        <label key={role} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 py-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              updateProfile({
                                recruitingRoles: checked
                                  ? draft.mentorshipProfile.recruitingRoles.filter(r => r !== role)
                                  : [...draft.mentorshipProfile.recruitingRoles, role],
                              })
                            }
                          />
                          <span>{role === "PRIMARY" ? (isVi ? "Cố vấn chính" : "Primary mentor") : (isVi ? "Cố vấn phụ" : "Secondary mentor")}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Safe introductory attachments */}
                <div className="space-y-2 border-t border-border/60 pt-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{isVi ? "Tài liệu giới thiệu an toàn (chỉ file tải lên tại đây)" : "Safe introductory files (explicitly attached)"}</span>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted">
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{uploadingFile ? t("Uploading attachments…") : (isVi ? "Đính kèm tệp giới thiệu" : "Attach intro file")}</span>
                      <input type="file" className="sr-only" disabled={uploadingFile || draft.mentorshipProfile.sharedAttachmentIds.length >= 5} onChange={e => void handleUploadIntroFile(e.target.files)} />
                    </label>
                  </div>
                  {uploadedAttachments.filter(f => draft.mentorshipProfile.sharedAttachmentIds.includes(f.id)).length > 0 ? (
                    <ul className="space-y-1">
                      {uploadedAttachments
                        .filter(f => draft.mentorshipProfile.sharedAttachmentIds.includes(f.id))
                        .map(file => (
                          <li key={file.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5">
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <FileText className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                              <span className="truncate">{file.fileName}</span>
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              aria-label={t("Remove attachment")}
                              onClick={() =>
                                updateProfile({
                                  sharedAttachmentIds: draft.mentorshipProfile.sharedAttachmentIds.filter(id => id !== file.id),
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </details>

            {/* Prospective Mentor Access Policy for Direct Lecturer Proposals */}
            <section className="rounded-xl border border-primary/25 bg-primary/[0.03] p-3.5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">
                      {isVi ? "Chính sách quyền truy cập dự kiến (cho đề nghị hướng dẫn trực tiếp)" : "Prospective Mentor Access Policy (for direct proposals)"}
                    </p>
                    <p className="text-[11.5px] leading-5 text-muted-foreground">
                      {isVi
                        ? "Quyền này CHƯA được kích hoạt khi lưu. Chỉ có hiệu lực sau khi giảng viên gửi đề nghị chính thức và bạn bấm Chấp nhận."
                        : "Saving this policy does NOT grant active access. It activates only when a lecturer proposes and you explicitly accept."}
                    </p>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.mentorshipProfile.prospectiveAccess)}
                    onChange={e =>
                      updateProfile({
                        prospectiveAccess: e.target.checked
                          ? { ...defaultMentorPolicy(), scopeNote: "" }
                          : null,
                      })
                    }
                  />
                  <span>{isVi ? "Bật nhận đề nghị trực tiếp" : "Enable direct proposals"}</span>
                </label>
              </div>

              {draft.mentorshipProfile.prospectiveAccess ? (
                <div className="space-y-2.5 border-t border-border/60 pt-2.5">
                  <MentorPolicyFields
                    projectId={settings.id}
                    value={currentPolicy}
                    onChange={next =>
                      updateProfile({
                        prospectiveAccess: {
                          preset: next.preset,
                          permissions: next.permissions,
                          expiresAt: next.expiresAt,
                          scopeNote: draft.mentorshipProfile.prospectiveAccess?.scopeNote ?? "",
                        },
                      })
                    }
                    disabled={save.isPending}
                  />
                  <Input
                    type="text"
                    maxLength={500}
                    className="h-8 text-xs bg-background"
                    placeholder={isVi ? "Ghi chú giới hạn phạm vi quyền dự kiến (không bắt buộc)..." : "Prospective scope limitations note (optional)..."}
                    value={draft.mentorshipProfile.prospectiveAccess.scopeNote ?? ""}
                    onChange={e =>
                      updateProfile({
                        prospectiveAccess: {
                          ...draft.mentorshipProfile.prospectiveAccess!,
                          scopeNote: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              ) : null}
            </section>

            {/* Member Profile Consent Overview (Read-only for Owner) */}
            {baseline.memberConsentSummary ? (
              <section className="rounded-xl border border-border/80 bg-muted/20 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-foreground">
                  {isVi ? "Trạng thái chia sẻ Hồ sơ học thuật của thành viên" : "Member Academic Profile sharing status"}
                </p>
                <p className="text-muted-foreground">
                  {isVi
                    ? "Mỗi thành viên tự quyết định việc chia sẻ hồ sơ trong mục Cố vấn. Thành viên chưa đồng ý sẽ không xuất hiện tên hay danh tính."
                    : "Each member controls their own consent. Unconsented members are omitted from lecturer dossiers."}
                </p>
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {baseline.memberConsentSummary.members.map(m => (
                    <li key={m.userId} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
                      <span className="font-medium text-foreground">{m.fullName}</span>
                      <span className={m.effectiveVisibleToLecturers ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                        · {m.effectiveVisibleToLecturers ? (isVi ? "Đã chia sẻ" : "Shared") : (isVi ? "Đang ẩn" : "Hidden")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <label className="flex items-start gap-3 text-sm leading-6">
              <input
                className="mt-1.5"
                type="checkbox"
                checked={draft.discovery === "SEEKING_MENTOR"}
                onChange={event => setDraft({ ...draft, discovery: event.target.checked ? "SEEKING_MENTOR" : "CLOSED" })}
              />
              <span>
                {t("Let verified lecturers discover this project")}
                <span className="block text-xs text-muted-foreground">
                  {t("Optional. You can save preferences and invite lecturers while discovery is off.")}
                </span>
              </span>
            </label>
          </fieldset>

          {save.error ? (
            <p role="alert" className="text-sm text-destructive">
              {t(conflict ? "Project settings changed. Refresh before saving again." : "Could not save discovery settings")}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={!dirty || save.isPending || (draft.discovery === "SEEKING_MENTOR" && draft.summary.trim().length < 10)}>
              {t(save.isPending ? "Saving…" : "Save mentor preferences")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={save.isPending}
              onClick={async () => {
                if ((await canLeaveWorkspace())) {
                  setDraft(valueOf(baseline));
                  setEditing(false);
                  save.reset();
                  onDone?.();
                }
              }}
            >
              {t("Cancel")}
            </Button>
          </div>
        </form>
      )}

      {previewOpen ? (
        <ResearchTeamDossierSheet
          projectId={settings.id}
          mode="owner-preview"
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </section>
  );
}
