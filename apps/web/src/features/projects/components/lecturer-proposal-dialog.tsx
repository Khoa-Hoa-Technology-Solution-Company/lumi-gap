import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MENTOR_SUPPORT_AREAS,
  hasMeaningfulResearchText,
  mentorRoleLabelKeys,
  type MentorProjectPreview,
  type MentorRole,
  type ResearchSupportType,
  type ResearchTeamDossier,
} from "@trend/shared-types";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  FileText,
  GraduationCap,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcademicProfile } from "@/features/academic-profile/hooks/use-academic-profile";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";
import { formatPermissionLabel, formatSupportLabel } from "./research-team-dossier-sheet";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";

export function LecturerProposalDialog({
  project,
  initialDossier,
  onClose,
  onOpenDossier,
  onFallbackLegacyInterest,
}: {
  project: MentorProjectPreview;
  initialDossier?: ResearchTeamDossier;
  onClose: () => void;
  onOpenDossier?: () => void;
  onFallbackLegacyInterest?: () => void;
}) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const user = useAuthStore(s => s.user);
  const userId = user?.id;
  const cache = useQueryClient();
  const profileQuery = useAcademicProfile(Boolean(userId));
  const profile = profileQuery.data;

  const dossierQuery = useQuery({
    queryKey: ["academic-support", userId, "team-dossier", "lecturer", project.id],
    queryFn: () => academicSupportApi.opportunityDossier(project.id),
    initialData: initialDossier,
    enabled: Boolean(userId && project.id),
    retry: false,
    staleTime: 0,
  });
  const dossier = dossierQuery.data;

  const availableRoles = dossier?.needs.availableRoles ?? [];
  const [selectedRole, setSelectedRole] = useState<MentorRole | "">(() =>
    availableRoles.length === 1 ? availableRoles[0]! : "",
  );
  const [supportAreas, setSupportAreas] = useState<ResearchSupportType[]>(() =>
    dossier?.needs.supportTypes?.length ? [...dossier.needs.supportTypes.slice(0, 3)] : [],
  );
  const [frequency, setFrequency] = useState("FLEXIBLE");
  const [duration, setDuration] = useState("FLEXIBLE");
  const [mode, setMode] = useState("FLEXIBLE");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [message, setMessage] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const lock = useRef(false);

  const effectiveRole: MentorRole | "" =
    selectedRole && availableRoles.includes(selectedRole)
      ? selectedRole
      : availableRoles.length === 1
        ? availableRoles[0]!
        : "";

  const trimmedMessage = message.trim();
  const messageValid = trimmedMessage.length >= 20 && hasMeaningfulResearchText(trimmedMessage);
  const prospectivePolicy = dossier?.collaborationTerms.prospectiveAccess ?? null;
  const canFormalPropose = Boolean(dossier?.viewerState?.canPropose && prospectivePolicy?.policyHash);

  useUnsavedWorkspace(Boolean(trimmedMessage || availabilityNote.trim()));

  const orderedSupportOptions = useMemo(() => {
    const teamNeeds = new Set(dossier?.needs.supportTypes ?? []);
    return [...MENTOR_SUPPORT_AREAS].sort((a, b) => Number(teamNeeds.has(b.id)) - Number(teamNeeds.has(a.id)));
  }, [dossier?.needs.supportTypes]);

  const toggleSupport = (area: ResearchSupportType) => {
    setSupportAreas(prev => (prev.includes(area) ? prev.filter(item => item !== area) : [...prev, area]));
    if (submitMutation.isError) {
      setIdempotencyKey(crypto.randomUUID());
      submitMutation.reset();
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (useAuthStore.getState().user?.id !== userId) {
        throw new Error("Your account changed. Reopen the proposal before continuing.");
      }
      if (!dossier || !prospectivePolicy?.policyHash || !effectiveRole) {
        throw new Error("Missing proposal preconditions");
      }
      return academicSupportApi.propose(project.id, {
        mentorRole: effectiveRole,
        supportAreas,
        availability: {
          frequency,
          duration,
          mode,
          ...(availabilityNote.trim() ? { note: availabilityNote.trim() } : {}),
        },
        message: trimmedMessage,
        consentConfirmed: true,
        expectedDiscoveryVersion: dossier.discoveryVersion,
        expectedPolicyHash: prospectivePolicy.policyHash,
        idempotencyKey,
      });
    },
    onSuccess: async () => {
      await Promise.all(
        ["mentor-workspace", "academic-support", "notifications", "projects"].map(key =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success(
        isVi
          ? "Đã gửi đề nghị hướng dẫn chính thức. Theo dõi phản hồi trong Đề nghị đã gửi."
          : "Formal mentorship proposal sent. Track the team's response in Sent Proposals.",
      );
      onClose();
    },
  });

  const canSubmit = Boolean(
    canFormalPropose &&
      effectiveRole &&
      supportAreas.length > 0 &&
      messageValid &&
      consentConfirmed &&
      !submitMutation.isPending &&
      !dossierQuery.isFetching,
  );

  const close = async () => {
    if (!submitMutation.isPending && (await canLeaveWorkspace())) onClose();
  };

  const lecturerName = profile?.displayName || user?.fullName || "";
  const lecturerMeta = [profile?.positionTitle || profile?.academicTitle, profile?.affiliation?.institutionName || profile?.institution]
    .filter(Boolean)
    .join(" · ");
  const lecturerExpertise = [
    ...(profile?.expertiseAreas ?? []),
    ...(profile?.researchSpecializations ?? []),
    ...(profile?.researchKeywords ?? []),
  ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx).slice(0, 4);

  const roleDescription =
    effectiveRole === "PRIMARY"
      ? isVi
        ? "Cố vấn chính: định hướng phương pháp luận tổng thể, theo sát tiến độ nghiên cứu và góp ý bản thảo chính cùng nhóm."
        : "Primary mentor: provides overarching methodology guidance, milestone direction, and main manuscript feedback."
      : effectiveRole === "SECONDARY"
        ? isVi
          ? "Cố vấn phụ: đồng hành hỗ trợ chuyên sâu một mảng kỹ thuật, phân tích dữ liệu hoặc phần việc cụ thể của dự án."
          : "Secondary mentor: supports a focused technical, analytical, or specialized aspect of the research project."
        : isVi
            ? "Chọn vai trò phù hợp với nhu cầu đang tuyển của nhóm để xác định rõ phạm vi đồng hành."
            : "Select an open mentor role to clarify expected responsibilities with the research team.";

  return (
    <Dialog open onOpenChange={open => { if (!open) void close(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-2xl" data-no-i18n>
        <div className="shrink-0 border-b border-border/75 px-6 pt-5 pb-4 pr-12">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {isVi ? "Đề nghị hướng dẫn nhóm" : "Offer Mentorship"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              {isVi
                ? "Gửi đề nghị hướng dẫn chính thức gắn với vai trò, phạm vi hỗ trợ và chính sách quyền truy cập đã được chủ dự án phê duyệt."
                : "Send a formal mentorship proposal bound to the role, support scope, and owner-approved prospective access policy."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async e => {
            e.preventDefault();
            if (!canSubmit || lock.current) return;
            lock.current = true;
            try {
              await submitMutation.mutateAsync();
            } catch {
              /* Retain input for retry */
            } finally {
              lock.current = false;
            }
          }}
        >
          <div className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
            {dossierQuery.isLoading ? (
              <Skeleton className="h-36 w-full rounded-xl" />
            ) : dossierQuery.isError ? (
              <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive space-y-2">
                <p>{t(mentorshipError(dossierQuery.error))}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void dossierQuery.refetch()}>
                  {t("Try again")}
                </Button>
              </div>
            ) : dossier ? (
              <>
                {/* Section A — Research Context */}
                <section className="rounded-xl border border-border/80 bg-muted/25 p-3.5 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {isVi ? "Nhóm nghiên cứu" : "Research team"}
                        </p>
                        <Badge variant="outline" className="text-[10.5px]">
                          {isVi ? `${dossier.team.teamMemberCount} thành viên` : `${dossier.team.teamMemberCount} members`}
                        </Badge>
                        {availableRoles.length > 0 ? (
                          <Badge variant="secondary" className="text-[10.5px]">
                            {isVi ? `${availableRoles.length} vị trí mở` : `${availableRoles.length} open role(s)`}
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{dossier.overview.title}</h3>
                    </div>
                    {onOpenDossier ? (
                      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onOpenDossier}>
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{isVi ? "Xem hồ sơ nhóm" : "View Team Profile"}</span>
                      </Button>
                    ) : null}
                  </div>
                  {dossier.overview.summary ? (
                    <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{dossier.overview.summary}</p>
                  ) : null}
                  {dossier.needs.supportTypes.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">{isVi ? "Nhóm cần:" : "Needs:"}</span>
                      {dossier.needs.supportTypes.slice(0, 4).map(area => (
                        <span key={area} className="rounded bg-background border border-border/70 px-1.5 py-0.5 text-[10.5px] text-foreground/85">
                          {formatSupportLabel(area, language, t)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>

                {/* Section B — Lecturer Profile (Auto-synced) */}
                <section className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3.5 py-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                      <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                      <span>{isVi ? "Hồ sơ học thuật của bạn (tự động gửi kèm đề nghị)" : "Your Academic Profile (shared with proposal)"}</span>
                    </span>
                    <Badge variant="outline" className="text-[10.5px] gap-1">
                      <BadgeCheck className="h-3 w-3 text-blue-600" aria-hidden="true" />
                      <span>{isVi ? "Tự động đồng bộ" : "Auto-synced"}</span>
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{lecturerName}</strong>
                    {lecturerMeta ? ` · ${lecturerMeta}` : ""}
                  </p>
                  {lecturerExpertise.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {lecturerExpertise.map(tag => (
                        <span key={tag} className="rounded border border-primary/20 bg-background px-1.5 py-0.5 text-[10.5px] text-foreground/85">
                          {t(tag)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>

                {!canFormalPropose ? (
                  <div role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                      <div className="space-y-1">
                        <p className="font-semibold text-amber-900 dark:text-amber-200">
                          {isVi
                            ? "Chưa thể gửi đề nghị hướng dẫn trực tiếp cho dự án này"
                            : "Direct formal proposal is currently unavailable for this project"}
                        </p>
                        <p className="leading-5 text-foreground/85">
                          {dossier.viewerState?.blockedReason === "PROSPECTIVE_ACCESS_NOT_CONFIGURED"
                            ? isVi
                              ? "Chủ dự án chưa thiết lập Chính sách quyền truy cập dự kiến trong Hồ sơ tìm cố vấn. Để bảo đảm an toàn quyền truy cập, bạn chỉ có thể gửi đề nghị bày tỏ quan tâm hoặc chờ chủ dự án hoàn thiện thiết lập."
                              : "The project owner has not approved a prospective access policy yet. You can send a non-binding support interest or wait for the owner to configure prospective permissions."
                            : dossier.viewerState?.blockedReason === "INCOMING_INVITATION_EXISTS"
                              ? isVi
                                ? "Nhóm này đã gửi lời mời hướng dẫn cho bạn. Vui lòng xem và phản hồi trong Lời mời nhận được."
                                : "This team has already sent you an invitation. Please respond in Received Invitations."
                              : isVi
                                ? "Dự án hiện không còn đủ điều kiện tiếp nhận đề nghị mới (đã có đề nghị chờ xử lý hoặc không còn vị trí trống)."
                                : "This project is currently not eligible for a new direct proposal."}
                        </p>
                      </div>
                    </div>
                    {dossier.viewerState?.blockedReason === "PROSPECTIVE_ACCESS_NOT_CONFIGURED" && onFallbackLegacyInterest ? (
                      <Button type="button" size="sm" variant="outline" onClick={onFallbackLegacyInterest}>
                        {isVi ? "Gửi đề nghị bày tỏ quan tâm (không ràng buộc)" : "Send non-binding support interest"}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <fieldset disabled={submitMutation.isPending} className="space-y-4">
                    {/* Section C — Proposed Role */}
                    <div className="space-y-1.5">
                      <Label htmlFor="proposal-role" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {isVi ? "Vai trò hướng dẫn đề xuất *" : "Proposed mentor role *"}
                      </Label>
                      <select
                        id="proposal-role"
                        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        value={effectiveRole}
                        onChange={e => {
                          setSelectedRole(e.target.value as MentorRole);
                          setConsentConfirmed(false);
                        }}
                        required
                      >
                        {availableRoles.length > 1 ? (
                          <option value="">{isVi ? "— Chọn vai trò đang tuyển —" : "— Select an open role —"}</option>
                        ) : null}
                        {availableRoles.map(role => (
                          <option key={role} value={role}>
                            {t(mentorRoleLabelKeys[role])}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11.5px] leading-5 text-muted-foreground">{roleDescription}</p>
                    </div>

                    {/* Section D — Support Scope */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {isVi ? "Phạm vi nội dung bạn có thể hỗ trợ *" : "Support scope you can provide *"}
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                          {isVi ? "Có thể chọn một phần nhu cầu của nhóm" : "Partial selection supported"}
                        </span>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {orderedSupportOptions.map(area => {
                          const checked = supportAreas.includes(area.id);
                          const requestedByTeam = dossier.needs.supportTypes.includes(area.id);
                          return (
                            <label
                              key={area.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                                checked ? "border-primary/50 bg-primary/[0.06] text-foreground" : "border-border/80 bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSupport(area.id)}
                                className="rounded border-input"
                              />
                              <span className="flex-1 truncate">{formatSupportLabel(area.id, language, t)}</span>
                              {requestedByTeam ? (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
                                  {isVi ? "Nhóm cần" : "Requested"}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section E — Availability */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {isVi ? "Khả năng đồng hành dự kiến (có thể thống nhất sau)" : "Expected mentoring availability (flexible)"}
                      </Label>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <label className="space-y-1 text-xs">
                          <span className="text-muted-foreground">{isVi ? "Tần suất" : "Frequency"}</span>
                          <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={frequency} onChange={e => setFrequency(e.target.value)}>
                            <option value="FLEXIBLE">{isVi ? "Thống nhất lịch sau" : "To be agreed"}</option>
                            <option value="WEEKLY">{isVi ? "Hàng tuần" : "Weekly"}</option>
                            <option value="BIWEEKLY">{isVi ? "Hai tuần một lần" : "Biweekly"}</option>
                            <option value="MILESTONE_BASED">{isVi ? "Theo mốc nghiên cứu" : "By milestone"}</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-xs">
                          <span className="text-muted-foreground">{isVi ? "Khoảng thời gian" : "Duration"}</span>
                          <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={duration} onChange={e => setDuration(e.target.value)}>
                            <option value="FLEXIBLE">{isVi ? "Trao đổi thêm" : "To be discussed"}</option>
                            <option value="1_SEMESTER">{isVi ? "1 học kỳ" : "1 semester"}</option>
                            <option value="2_SEMESTERS">{isVi ? "2 học kỳ" : "2 semesters"}</option>
                            <option value="FULL_PROJECT">{isVi ? "Toàn bộ dự án" : "Full project"}</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-xs">
                          <span className="text-muted-foreground">{isVi ? "Hình thức" : "Mode"}</span>
                          <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={mode} onChange={e => setMode(e.target.value)}>
                            <option value="FLEXIBLE">{isVi ? "Linh hoạt" : "Flexible"}</option>
                            <option value="ONLINE">{isVi ? "Trực tuyến" : "Online"}</option>
                            <option value="HYBRID">{isVi ? "Kết hợp" : "Hybrid"}</option>
                            <option value="IN_PERSON">{isVi ? "Trực tiếp" : "In person"}</option>
                          </select>
                        </label>
                      </div>
                      <input
                        type="text"
                        maxLength={600}
                        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                        placeholder={isVi ? "Ghi chú thêm về khả năng hỗ trợ (không bắt buộc)..." : "Additional availability note (optional)..."}
                        value={availabilityNote}
                        onChange={e => setAvailabilityNote(e.target.value)}
                      />
                    </div>

                    {/* Section F — Message */}
                    <div className="space-y-1.5">
                      <Label htmlFor="formal-proposal-message" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {isVi ? "Lời nhắn gửi nhóm nghiên cứu *" : "Message to the research team *"}
                      </Label>
                      <textarea
                        id="formal-proposal-message"
                        rows={4}
                        required
                        minLength={20}
                        maxLength={2000}
                        className="min-h-[96px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder={
                          isVi
                            ? "Mô tả ngắn cách bạn có thể đồng hành, phạm vi đảm nhận và các nội dung muốn trao đổi thêm..."
                            : "Describe how you can guide the team, the scope you can cover, and topics to clarify..."
                        }
                        value={message}
                        onChange={e => {
                          setMessage(e.target.value);
                          if (submitMutation.isError) {
                            setIdempotencyKey(crypto.randomUUID());
                            submitMutation.reset();
                          }
                        }}
                      />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {messageValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {isVi ? "Nội dung đề nghị hợp lệ" : "Message ready"}
                            </span>
                          ) : (
                            isVi ? "Nhập tối thiểu 20 ký tự mô tả nội dung hỗ trợ" : "Enter at least 20 meaningful characters"
                          )}
                        </span>
                        <span className="tabular-nums">{message.length}/2000</span>
                      </div>
                    </div>

                    {/* Section G — Owner-approved Prospective Access Policy (Read-only) */}
                    {prospectivePolicy ? (
                      <section className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                            <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                            <span>{isVi ? "Điều kiện hợp tác & Quyền truy cập dự kiến (do chủ dự án phê duyệt)" : "Owner-approved prospective access policy"}</span>
                          </span>
                          <Badge variant="secondary" className="text-[10.5px]">{prospectivePolicy.preset}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {prospectivePolicy.permissions.map(perm => (
                            <span key={perm} className="rounded border border-border/70 bg-background px-2 py-0.5 text-[11px] text-foreground">
                              {formatPermissionLabel(perm, language)}
                            </span>
                          ))}
                        </div>
                        {prospectivePolicy.expiresAt ? (
                          <p className="text-[11.5px] text-muted-foreground">
                            <strong className="text-foreground">{isVi ? "Thời hạn dự kiến: " : "Prospective expiry: "}</strong>
                            {new Date(prospectivePolicy.expiresAt).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                          </p>
                        ) : null}
                        {prospectivePolicy.scopeNote ? (
                          <p className="text-[11.5px] text-muted-foreground whitespace-pre-wrap">
                            <strong className="text-foreground">{isVi ? "Ghi chú phạm vi: " : "Scope note: "}</strong>
                            {prospectivePolicy.scopeNote}
                          </p>
                        ) : null}
                        <p className="text-[11.5px] leading-5 text-muted-foreground">
                          {isVi
                            ? "Các quyền trên chỉ được kích hoạt nếu chủ dự án chấp nhận nguyên vẹn đề nghị này. Thư viện bài báo, dữ liệu riêng tư và kênh chat nội bộ không tự động mở rộng."
                            : "These permissions activate only if the owner accepts this exact proposal. Private papers, datasets, and internal team chat are never opened automatically."}
                        </p>
                      </section>
                    ) : null}

                    {/* Section H — Explicit Consent */}
                    <label className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.03] p-3 text-xs leading-5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={consentConfirmed}
                        onChange={e => setConsentConfirmed(e.target.checked)}
                      />
                      <span className="text-foreground">
                        {isVi
                          ? "Tôi đồng ý bắt đầu hướng dẫn nhóm theo vai trò, phạm vi và điều kiện hợp tác đã nêu nếu nhóm chấp nhận đề nghị này."
                          : "I agree to begin mentoring this team under the stated role, support scope, and prospective collaboration terms if the project owner accepts this proposal."}
                      </span>
                    </label>
                  </fieldset>
                )}

                {submitMutation.isError ? (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{t(mentorshipError(submitMutation.error))}</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border/75 bg-muted/15 px-6 py-3.5">
            <Button type="button" variant="ghost" disabled={submitMutation.isPending} onClick={() => void close()}>
              {t("Cancel")}
            </Button>
            {canFormalPropose ? (
              <Button type="submit" className="gap-1.5" disabled={!canSubmit}>
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>{t("Sending…")}</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isVi ? "Gửi đề nghị hướng dẫn" : "Send mentorship proposal"}</span>
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
