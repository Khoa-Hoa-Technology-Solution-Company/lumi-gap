import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Info,
  Lock,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import {
  MENTOR_SUPPORT_AREAS,
  mentorRoleLabelKeys,
  type MentorPermission,
  type MentorshipAttachment,
  type ResearchTeamDossier,
} from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";
import { ResearchClassificationSummary } from "@/features/academic-profile/components/research-classification-fields";

const STAGE_LABELS: Record<string, { vi: string; en: string }> = {
  PLANNING: { vi: "Đang lập kế hoạch", en: "Planning" },
  ACTIVE: { vi: "Đang triển khai", en: "Active" },
  ON_HOLD: { vi: "Tạm dừng", en: "On hold" },
  COMPLETED: { vi: "Đã hoàn thành", en: "Completed" },
  ARCHIVED: { vi: "Đã lưu trữ", en: "Archived" },
};

const FREQUENCY_LABELS: Record<string, { vi: string; en: string }> = {
  FLEXIBLE: { vi: "Thống nhất lịch sau", en: "To be agreed" },
  WEEKLY: { vi: "Hàng tuần", en: "Weekly" },
  BIWEEKLY: { vi: "Hai tuần một lần", en: "Biweekly" },
  MONTHLY: { vi: "Hàng tháng", en: "Monthly" },
  MILESTONE_BASED: { vi: "Theo từng mốc nghiên cứu", en: "By research milestone" },
};

const DURATION_LABELS: Record<string, { vi: string; en: string }> = {
  FLEXIBLE: { vi: "Trao đổi thêm", en: "To be discussed" },
  "1_SEMESTER": { vi: "1 học kỳ", en: "1 semester" },
  "2_SEMESTERS": { vi: "2 học kỳ", en: "2 semesters" },
  FULL_PROJECT: { vi: "Toàn bộ dự án", en: "Full project" },
};

const MODE_LABELS: Record<string, { vi: string; en: string }> = {
  FLEXIBLE: { vi: "Linh hoạt", en: "Flexible" },
  ONLINE: { vi: "Trực tuyến", en: "Online" },
  HYBRID: { vi: "Kết hợp trực tuyến và trực tiếp", en: "Hybrid" },
  IN_PERSON: { vi: "Trực tiếp", en: "In person" },
};

const PERMISSION_LABELS: Record<MentorPermission, { vi: string; en: string }> = {
  OVERVIEW_VIEW: { vi: "Xem tổng quan dự án", en: "View project overview" },
  PAPERS_VIEW: { vi: "Xem bài báo được chia sẻ", en: "View shared papers" },
  PAPERS_COMMENT: { vi: "Nhận xét bài báo", en: "Comment on papers" },
  PAPERS_SUGGEST: { vi: "Đề xuất bài báo tham khảo", en: "Suggest reference papers" },
  GAPS_VIEW: { vi: "Xem khoảng trống nghiên cứu", en: "View research gaps" },
  GAPS_COMMENT: { vi: "Nhận xét khoảng trống", en: "Comment on gaps" },
  GAPS_RECOMMEND: { vi: "Gợi ý hướng nghiên cứu", en: "Recommend research directions" },
  TASKS_VIEW: { vi: "Xem kế hoạch & công việc chia sẻ", en: "View shared tasks" },
  TASKS_SUGGEST: { vi: "Đề xuất công việc", en: "Suggest tasks" },
  MANUSCRIPTS_VIEW: { vi: "Xem bản thảo được chia sẻ", en: "View shared manuscripts" },
  MANUSCRIPTS_COMMENT: { vi: "Nhận xét bản thảo", en: "Comment on manuscripts" },
  MANUSCRIPTS_SUGGEST: { vi: "Đề xuất chỉnh sửa bản thảo", en: "Suggest manuscript edits" },
  MANUSCRIPTS_REVIEW: { vi: "Phản biện học thuật bản thảo", en: "Review assigned manuscripts" },
  MENTOR_CHAT: { vi: "Trao đổi kênh cố vấn", en: "Mentor communication channel" },
  SUBMISSIONS_VIEW: { vi: "Xem bản nộp nghiên cứu", en: "View research submissions" },
  CONTRIBUTIONS_VIEW: { vi: "Xem ghi nhận đóng góp", en: "View contribution records" },
};

export function formatOptionLabel(map: Record<string, { vi: string; en: string }>, value: string | undefined, language: string): string | undefined {
  if (!value) return undefined;
  const entry = map[value];
  if (!entry) return value;
  return language === "vi" ? entry.vi : entry.en;
}

export function formatSupportLabel(id: string, language: string, t: (key: string) => string): string {
  const found = MENTOR_SUPPORT_AREAS.find(item => item.id === id);
  if (!found) return t(id);
  const translated = t(`supervisor.support.${id}`);
  if (translated !== `supervisor.support.${id}`) return translated;
  return language === "vi" ? t(found.label) : found.label;
}

export function formatPermissionLabel(permission: MentorPermission, language: string): string {
  const entry = PERMISSION_LABELS[permission];
  return entry ? (language === "vi" ? entry.vi : entry.en) : permission;
}

export function ResearchTeamDossierSheet({
  projectId,
  mode,
  onClose,
  onPropose,
  onOpenExistingRequest,
}: {
  projectId: string;
  mode: "lecturer" | "owner-preview";
  onClose: () => void;
  onPropose?: (dossier: ResearchTeamDossier) => void;
  onOpenExistingRequest?: (projectId: string, requestId: string) => void;
}) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const userId = useAuthStore(s => s.user?.id);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["academic-support", userId, "team-dossier", mode, projectId],
    queryFn: () =>
      mode === "owner-preview"
        ? academicSupportApi.previewTeamDossier(projectId)
        : academicSupportApi.opportunityDossier(projectId),
    enabled: Boolean(userId && projectId),
    retry: false,
    staleTime: 0,
  });

  const dossier = query.data;

  const handleDownload = async (file: MentorshipAttachment) => {
    setDownloadingId(file.id);
    setDownloadError(null);
    try {
      const blob = await academicSupportApi.attachment(file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(isVi ? "Không thể tải tệp giới thiệu. Vui lòng thử lại." : "Could not download the file. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const renderBlockedBanner = (d: ResearchTeamDossier) => {
    if (mode === "owner-preview") {
      return (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.05] px-3.5 py-2.5 text-xs leading-5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="font-semibold text-foreground">
              {isVi ? "Chế độ xem trước dành cho giảng viên" : "Lecturer-facing preview"}
            </p>
            <p className="text-muted-foreground">
              {isVi
                ? "Đây là dữ liệu thực tế từ máy chủ mà giảng viên đủ điều kiện được phép xem. Các thành viên chưa đồng ý chia sẻ và tài nguyên nội bộ đã được ẩn."
                : "This is the exact server-projected view visible to eligible lecturers. Unconsented members and internal resources are excluded."}
            </p>
          </div>
        </div>
      );
    }

    const vs = d.viewerState;
    if (!vs || vs.canPropose) return null;

    if (vs.blockedReason === "INCOMING_INVITATION_EXISTS" && vs.existingRequestId) {
      return (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {isVi
              ? "Nhóm này đã gửi lời mời hướng dẫn cho bạn. Bạn có thể xem và phản hồi lời mời."
              : "This team has already sent you a supervision invitation. Review and respond to that invitation."}
          </p>
          {onOpenExistingRequest ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenExistingRequest(d.projectId, vs.existingRequestId!)}>
              {isVi ? "Xem lời mời hiện tại" : "View invitation"}
            </Button>
          ) : null}
        </div>
      );
    }

    if (vs.blockedReason === "PROPOSAL_ALREADY_PENDING" && vs.existingRequestId) {
      return (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2.5 text-xs">
          <p className="font-medium text-blue-900 dark:text-blue-200">
            {isVi
              ? "Bạn đã gửi đề nghị hướng dẫn cho nhóm này và đang chờ chủ dự án phản hồi."
              : "You have already sent a mentorship proposal to this team and are awaiting the owner's response."}
          </p>
          {onOpenExistingRequest ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenExistingRequest(d.projectId, vs.existingRequestId!)}>
              {isVi ? "Xem đề nghị đã gửi" : "View sent proposal"}
            </Button>
          ) : null}
        </div>
      );
    }

    const reasonText =
      vs.blockedReason === "ALREADY_ACTIVE_MENTOR"
        ? isVi ? "Bạn hiện đang hướng dẫn dự án này." : "You are already actively mentoring this project."
        : vs.blockedReason === "PROSPECTIVE_ACCESS_NOT_CONFIGURED"
          ? isVi
            ? "Nhóm chưa cấu hình chính sách quyền truy cập dự kiến để nhận đề nghị hướng dẫn trực tiếp."
            : "This team has not configured a prospective access policy for direct formal proposals yet."
          : vs.blockedReason === "PROSPECTIVE_ACCESS_EXPIRED"
            ? isVi
              ? "Chính sách quyền truy cập dự kiến của nhóm đã hết hạn. Vui lòng chờ chủ dự án cập nhật."
              : "This team's prospective access policy has expired."
            : vs.blockedReason === "NO_OPEN_ROLE"
              ? isVi ? "Nhóm hiện không còn vị trí cố vấn trống." : "No mentor role is currently vacant."
              : isVi ? "Nhóm hiện không còn mở tiếp nhận đề nghị hướng dẫn mới." : "This team is no longer accepting new mentorship proposals.";

    return (
      <div role="status" className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{reasonText}</p>
      </div>
    );
  };

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent
        className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col"
        closeLabel={t("Close")}
        data-no-i18n
      >
        <div className="sticky top-0 z-10 border-b border-border/80 bg-background/95 backdrop-blur px-6 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
              {dossier ? dossier.overview.title : isVi ? "Hồ sơ nhóm nghiên cứu" : "Research Team Profile"}
            </SheetTitle>
            {dossier ? (
              <Badge variant="outline" className="text-[11px] font-medium">
                {formatOptionLabel(STAGE_LABELS, dossier.overview.stage, language)}
              </Badge>
            ) : null}
          </div>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            {isVi
              ? "Thông tin giới thiệu do nhóm chủ động chia sẻ để giảng viên cân nhắc hướng dẫn nghiên cứu."
              : "Approved research introduction shared by the team for mentorship consideration."}
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          {query.isLoading ? (
            <div className="space-y-4" role="status" aria-label={t("Loading…")}>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 space-y-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>{t(mentorshipError(query.error))}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
                {t("Try again")}
              </Button>
            </div>
          ) : dossier ? (
            <>
              {renderBlockedBanner(dossier)}

              {/* Section 1 — Overview */}
              <section className="space-y-3 rounded-xl border border-border/80 bg-card p-4" aria-label={isVi ? "Tổng quan nghiên cứu" : "Research overview"}>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {isVi ? "Tổng quan nghiên cứu" : "Research overview"}
                  </h3>
                </div>

                {dossier.overview.researchAreas.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {dossier.overview.researchAreas.map(area => (
                      <span key={area} className="rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/90">
                        {t(area)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <ResearchClassificationSummary value={dossier.overview.researchClassification} />

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {isVi ? "Tóm tắt nghiên cứu" : "Research abstract"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                    {dossier.overview.summary || (isVi ? "Nhóm chưa bổ sung tóm tắt chi tiết." : "No detailed abstract yet.")}
                  </p>
                </div>

                {dossier.overview.researchProblem ? (
                  <div className="space-y-1 border-t border-border/60 pt-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Vấn đề nghiên cứu" : "Research problem"}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{dossier.overview.researchProblem}</p>
                  </div>
                ) : null}

                {dossier.overview.researchObjectives.length > 0 ? (
                  <div className="space-y-1 border-t border-border/60 pt-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Mục tiêu nghiên cứu" : "Research objectives"}
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90">
                      {dossier.overview.researchObjectives.map((obj, idx) => <li key={idx}>{obj}</li>)}
                    </ul>
                  </div>
                ) : null}

                {dossier.overview.researchQuestions.length > 0 ? (
                  <div className="space-y-1 border-t border-border/60 pt-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Câu hỏi nghiên cứu dự kiến" : "Draft research questions"}
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90">
                      {dossier.overview.researchQuestions.map((q, idx) => <li key={idx}>{q}</li>)}
                    </ul>
                  </div>
                ) : null}

                {dossier.overview.methodologies.length > 0 ? (
                  <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Phương pháp nghiên cứu" : "Research methodologies"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {dossier.overview.methodologies.map(method => (
                        <span key={method} className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground">
                          {method}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(dossier.overview.expectedOutcomes || dossier.overview.expectedDuration) ? (
                  <div className="grid gap-3 border-t border-border/60 pt-2.5 sm:grid-cols-2 text-xs">
                    {dossier.overview.expectedOutcomes ? (
                      <div className="space-y-0.5">
                        <p className="font-semibold text-muted-foreground">{isVi ? "Kết quả kỳ vọng" : "Expected outcomes"}</p>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{dossier.overview.expectedOutcomes}</p>
                      </div>
                    ) : null}
                    {dossier.overview.expectedDuration ? (
                      <div className="space-y-0.5">
                        <p className="font-semibold text-muted-foreground">{isVi ? "Thời gian dự kiến" : "Expected duration"}</p>
                        <p className="text-sm text-foreground/90">{formatOptionLabel(DURATION_LABELS, dossier.overview.expectedDuration, language)}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {/* Section 2 — Consented Team Members */}
              <section className="space-y-3 rounded-xl border border-border/80 bg-card p-4" aria-label={isVi ? "Thành viên nghiên cứu" : "Research team members"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {isVi ? "Thành viên nghiên cứu" : "Research team"}
                    </h3>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {isVi ? `Quy mô nhóm: ${dossier.team.teamMemberCount} thành viên` : `Team size: ${dossier.team.teamMemberCount} member(s)`}
                  </span>
                </div>

                {dossier.team.consentedMembers.length > 0 ? (
                  <ul className="space-y-2.5">
                    {dossier.team.consentedMembers.map(member => (
                      <li key={member.userId} className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground">{member.fullName}</span>
                              {member.affiliationVerified ? (
                                <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label={isVi ? "Đơn vị đã xác minh" : "Verified affiliation"} />
                              ) : null}
                              <Badge variant="secondary" className="text-[10.5px]">
                                {member.projectRole === "OWNER" ? (isVi ? "Chủ dự án" : "Project Owner") : (isVi ? "Thành viên" : "Member")}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {[member.institutionName, member.department, member.programName, member.academicYearLabel].filter(Boolean).join(" · ") || (member.academicRole ? t(member.academicRole) : "")}
                            </p>
                          </div>
                          <Link
                            to={`/academics/${encodeURIComponent(member.publicHandle || member.userId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                          >
                            <span>{isVi ? "Xem hồ sơ học thuật" : "View Academic Profile"}</span>
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </div>

                        {member.researchResponsibility ? (
                          <p className="text-xs text-foreground/90">
                            <span className="font-medium text-muted-foreground">{isVi ? "Trách nhiệm dự kiến: " : "Project responsibility: "}</span>
                            {member.researchResponsibility}
                          </p>
                        ) : null}

                        {member.headline || member.shortBio ? (
                          <p className="text-xs leading-5 text-muted-foreground">{member.headline || member.shortBio}</p>
                        ) : null}

                        {(member.researchInterests.length > 0 || member.skills.length > 0 || member.researchMethods.length > 0) ? (
                          <div className="space-y-1.5 pt-0.5 text-[11px]">
                            {member.researchInterests.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-muted-foreground font-medium">{isVi ? "Quan tâm:" : "Interests:"}</span>
                                {member.researchInterests.slice(0, 5).map(item => (
                                  <span key={item} className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-foreground/85">{item}</span>
                                ))}
                              </div>
                            ) : null}
                            {member.skills.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-muted-foreground font-medium">{isVi ? "Kỹ năng:" : "Skills:"}</span>
                                {member.skills.slice(0, 5).map(item => (
                                  <span key={item} className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-foreground/85">{item}</span>
                                ))}
                              </div>
                            ) : null}
                            {member.researchMethods.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-muted-foreground font-medium">{isVi ? "Phương pháp:" : "Methods:"}</span>
                                {member.researchMethods.slice(0, 4).map(item => (
                                  <span key={item} className="rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-primary">{item}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-start gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {isVi
                        ? `Nhóm gồm ${dossier.team.teamMemberCount} thành viên. Hồ sơ học thuật cá nhân chưa được chia sẻ trong ngữ cảnh tìm cố vấn.`
                        : `This team has ${dossier.team.teamMemberCount} member(s). Individual Academic Profiles are not shared in mentor discovery.`}
                    </span>
                  </p>
                )}

                {dossier.team.consentedMembers.length > 0 && dossier.team.unsharedMemberCount > 0 ? (
                  <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {isVi
                        ? `${dossier.team.unsharedMemberCount} thành viên khác giữ hồ sơ ở chế độ không chia sẻ trong hồ sơ tìm cố vấn.`
                        : `${dossier.team.unsharedMemberCount} other member(s) have not shared their profile for discovery.`}
                    </span>
                  </p>
                ) : null}
              </section>

              {/* Section 3 — Progress */}
              {dossier.progress.hasSharedProgress ? (
                <section className="space-y-2.5 rounded-xl border border-border/80 bg-card p-4" aria-label={isVi ? "Tiến độ và mức độ chuẩn bị" : "Progress and preparation"}>
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {isVi ? "Tiến độ và mức độ chuẩn bị" : "Progress and preparation"}
                    </h3>
                  </div>
                  <dl className="grid gap-2.5 sm:grid-cols-2 text-xs">
                    {dossier.progress.completed ? (
                      <div className="rounded-lg bg-muted/30 p-2.5 space-y-0.5">
                        <dt className="font-semibold text-foreground">{isVi ? "Đã thực hiện" : "Completed"}</dt>
                        <dd className="whitespace-pre-wrap text-muted-foreground leading-5">{dossier.progress.completed}</dd>
                      </div>
                    ) : null}
                    {dossier.progress.inProgress ? (
                      <div className="rounded-lg bg-muted/30 p-2.5 space-y-0.5">
                        <dt className="font-semibold text-foreground">{isVi ? "Đang thực hiện" : "In progress"}</dt>
                        <dd className="whitespace-pre-wrap text-muted-foreground leading-5">{dossier.progress.inProgress}</dd>
                      </div>
                    ) : null}
                    {dossier.progress.notStarted ? (
                      <div className="rounded-lg bg-muted/30 p-2.5 space-y-0.5">
                        <dt className="font-semibold text-foreground">{isVi ? "Chưa bắt đầu" : "Not started"}</dt>
                        <dd className="whitespace-pre-wrap text-muted-foreground leading-5">{dossier.progress.notStarted}</dd>
                      </div>
                    ) : null}
                    {dossier.progress.challenges ? (
                      <div className="rounded-lg bg-muted/30 p-2.5 space-y-0.5">
                        <dt className="font-semibold text-foreground">{isVi ? "Khó khăn hiện tại" : "Current challenges"}</dt>
                        <dd className="whitespace-pre-wrap text-muted-foreground leading-5">{dossier.progress.challenges}</dd>
                      </div>
                    ) : null}
                    {dossier.progress.feedbackNeeded ? (
                      <div className="rounded-lg bg-muted/30 p-2.5 space-y-0.5">
                        <dt className="font-semibold text-foreground">{isVi ? "Nội dung cần góp ý" : "Feedback needed"}</dt>
                        <dd className="whitespace-pre-wrap text-muted-foreground leading-5">{dossier.progress.feedbackNeeded}</dd>
                      </div>
                    ) : null}
                    {dossier.progress.upcomingMilestone ? (
                      <div className="rounded-lg bg-muted/30 p-2.5 space-y-0.5">
                        <dt className="font-semibold text-foreground">{isVi ? "Mốc nghiên cứu sắp tới" : "Upcoming milestone"}</dt>
                        <dd className="whitespace-pre-wrap text-muted-foreground leading-5">{dossier.progress.upcomingMilestone}</dd>
                      </div>
                    ) : null}
                  </dl>
                </section>
              ) : null}

              {/* Section 4 — Mentoring Needs & Expectations */}
              <section className="space-y-3 rounded-xl border border-border/80 bg-card p-4" aria-label={isVi ? "Nhu cầu và kỳ vọng hướng dẫn" : "Mentoring needs and expectations"}>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {isVi ? "Nhu cầu hướng dẫn và kỳ vọng hợp tác" : "Mentoring needs and expectations"}
                  </h3>
                </div>

                {dossier.needs.researchSupportNeeds && dossier.needs.researchSupportNeeds.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Nhu cầu hướng dẫn đã xác nhận bởi nhóm" : "Group-confirmed research support needs"}
                    </p>
                    <ul className="space-y-1.5">
                      {dossier.needs.researchSupportNeeds.map(need => (
                        <li key={need.id} className="rounded-lg border border-border/75 bg-muted/20 px-3 py-2 text-xs space-y-0.5">
                          <p className="font-semibold text-foreground">{need.title}</p>
                          <p className="text-muted-foreground leading-5">{need.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {dossier.needs.supportTypes.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Nội dung cần hỗ trợ" : "Requested support areas"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {dossier.needs.supportTypes.map(type => (
                        <span key={type} className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {formatSupportLabel(type, language, t)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {dossier.needs.expertise.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Chuyên môn nhóm đang tìm" : "Desired expertise"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {dossier.needs.expertise.map(item => (
                        <span key={item} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                          {t(item)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {dossier.needs.mentoringNeeds ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Mô tả nhu cầu chi tiết" : "Detailed mentoring needs"}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{dossier.needs.mentoringNeeds}</p>
                  </div>
                ) : null}

                <div className="grid gap-2.5 border-t border-border/60 pt-2.5 sm:grid-cols-2 text-xs">
                  <div>
                    <p className="font-semibold text-muted-foreground">{isVi ? "Vai trò cố vấn đang mở" : "Open mentor roles"}</p>
                    <p className="mt-0.5 text-foreground">
                      {dossier.needs.availableRoles.length > 0
                        ? dossier.needs.availableRoles.map(role => t(mentorRoleLabelKeys[role])).join(" · ")
                        : isVi ? "Không còn vị trí trống" : "None available"}
                    </p>
                  </div>
                  {dossier.needs.expectedFrequency ? (
                    <div>
                      <p className="font-semibold text-muted-foreground">{isVi ? "Tần suất trao đổi dự kiến" : "Expected frequency"}</p>
                      <p className="mt-0.5 text-foreground">{formatOptionLabel(FREQUENCY_LABELS, dossier.needs.expectedFrequency, language)}</p>
                    </div>
                  ) : null}
                  {dossier.needs.workingMode ? (
                    <div>
                      <p className="font-semibold text-muted-foreground">{isVi ? "Hình thức làm việc" : "Working mode"}</p>
                      <p className="mt-0.5 text-foreground">{formatOptionLabel(MODE_LABELS, dossier.needs.workingMode, language)}</p>
                    </div>
                  ) : null}
                  {dossier.needs.mentoringGoals ? (
                    <div className="sm:col-span-2">
                      <p className="font-semibold text-muted-foreground">{isVi ? "Mục tiêu quan hệ hướng dẫn" : "Mentorship goals"}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">{dossier.needs.mentoringGoals}</p>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Section 5 — Introductory Documents & Prospective Access Policy */}
              <section className="space-y-3 rounded-xl border border-border/80 bg-card p-4" aria-label={isVi ? "Tài liệu và điều kiện hợp tác" : "Documents and collaboration terms"}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {isVi ? "Tài liệu giới thiệu & Quyền truy cập dự kiến" : "Shared documents & prospective access policy"}
                  </h3>
                </div>

                {dossier.collaborationTerms.sharedAttachments.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isVi ? "Tài liệu giới thiệu được phép xem" : "Explicitly shared introductory documents"}
                    </p>
                    <ul className="space-y-1.5">
                      {dossier.collaborationTerms.sharedAttachments.map(file => (
                        <li key={file.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                          <span className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                            <span className="truncate">{file.fileName}</span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs shrink-0"
                            disabled={downloadingId === file.id}
                            onClick={() => void handleDownload(file)}
                          >
                            <Download className="h-3 w-3" aria-hidden="true" />
                            <span>{isVi ? "Tải xuống" : "Download"}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {downloadError ? <p role="alert" className="text-xs text-destructive">{downloadError}</p> : null}
                  </div>
                ) : null}

                <div className="rounded-lg border border-border/75 bg-muted/20 p-3 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">
                      {isVi ? "Chính sách quyền truy cập dự kiến sau khi đồng thuận" : "Prospective access policy after mutual consent"}
                    </p>
                    {dossier.collaborationTerms.prospectiveAccess ? (
                      <Badge variant="secondary" className="text-[11px]">
                        {dossier.collaborationTerms.prospectiveAccess.preset}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] text-amber-700 dark:text-amber-300">
                        {isVi ? "Chưa thiết lập" : "Not configured"}
                      </Badge>
                    )}
                  </div>

                  {dossier.collaborationTerms.prospectiveAccess ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {dossier.collaborationTerms.prospectiveAccess.permissions.map(perm => (
                          <span key={perm} className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-0.5 text-[11px] text-foreground">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" aria-hidden="true" />
                            <span>{formatPermissionLabel(perm, language)}</span>
                          </span>
                        ))}
                      </div>
                      {dossier.collaborationTerms.prospectiveAccess.expiresAt ? (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {isVi ? "Thời hạn dự kiến: " : "Prospective expiry: "}
                            {new Date(dossier.collaborationTerms.prospectiveAccess.expiresAt).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                          </span>
                        </p>
                      ) : null}
                      {dossier.collaborationTerms.prospectiveAccess.scopeNote ? (
                        <p className="text-muted-foreground whitespace-pre-wrap">{dossier.collaborationTerms.prospectiveAccess.scopeNote}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {isVi
                        ? "Chủ dự án chưa phê duyệt chính sách quyền truy cập dự kiến. Quyền truy cập sẽ không tự động mở rộng cho đến khi chủ dự án thiết lập rõ."
                        : "The project owner has not approved a prospective access policy yet."}
                    </p>
                  )}
                </div>

                <div className="space-y-1 text-[11.5px] leading-5 text-muted-foreground">
                  <p>{dossier.collaborationTerms.beforeAcceptNotice}</p>
                  <p className="font-medium text-foreground/80">{dossier.collaborationTerms.confidentialityNotice}</p>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-border/80 bg-background/95 backdrop-blur px-6 py-3.5">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("Close")}
          </Button>
          {mode === "lecturer" && dossier && onPropose && dossier.viewerState?.canPropose ? (
            <Button type="button" onClick={() => onPropose(dossier)}>
              {isVi ? "Đề nghị hướng dẫn" : "Offer Mentorship"}
            </Button>
          ) : null}
        </footer>
      </SheetContent>
    </Sheet>
  );
}
