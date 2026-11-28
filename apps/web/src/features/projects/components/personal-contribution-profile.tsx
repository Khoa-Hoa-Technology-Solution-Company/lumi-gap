import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  creditRoleMetadata,
  creditRoles,
  inferContributionCategoryFromRoles,
  type CreditRole,
  type GlobalPersonalContributionProjectSummary,
  type IntegrityCaseKind,
  type IntegrityTargetKind,
  type PersonalContributionHistoryExport,
  type PersonalContributionRecord,
  type PersonalIntegrityCaseSummary,
} from "@trend/shared-types";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Info,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionErrorState } from "@/components/loading";
import { useI18n } from "@/i18n";
import { contributionsApi } from "../api/contributions.api";
import { CreditRolePicker } from "./credit-role-picker";
import { contributionDate } from "../utils/contribution-date";
import "./personal-contribution-profile.css";

type PersonalTab = "mine" | "pending" | "saved";

interface Props {
  scope: "project" | "global";
  projectId?: string;
  embedded?: boolean;
}

const CREDIT_LABELS_VI: Partial<Record<CreditRole, string>> = {
  CONCEPTUALIZATION: "Hình thành ý tưởng",
  DATA_CURATION: "Quản lý & xử lý dữ liệu",
  FORMAL_ANALYSIS: "Phân tích hình thức",
  FUNDING_ACQUISITION: "Tìm kiếm tài trợ",
  INVESTIGATION: "Thực nghiệm & điều tra",
  METHODOLOGY: "Xây dựng phương pháp",
  PROJECT_ADMINISTRATION: "Điều phối dự án",
  RESOURCES: "Cung cấp tài nguyên",
  SOFTWARE: "Phát triển phần mềm",
  SUPERVISION: "Hướng dẫn nghiên cứu",
  VALIDATION: "Kiểm chứng kết quả",
  VISUALIZATION: "Trực quan hóa dữ liệu",
  WRITING_ORIGINAL_DRAFT: "Viết bản thảo gốc",
  WRITING_REVIEW_EDITING: "Rà soát & biên tập",
};

function formatCreditRole(role: CreditRole, language: string): string {
  const enName = creditRoleMetadata[role]?.name ?? role;
  if (language === "vi") {
    const vi = CREDIT_LABELS_VI[role];
    return vi ? `${enName} — ${vi}` : enName;
  }
  return enName;
}

function membershipLabel(status: string, language: string): string {
  const vi: Record<string, string> = {
    OWNER: "Trưởng nhóm",
    ACTIVE: "Thành viên",
    ADVISOR: "Cố vấn nghiên cứu",
    LEFT: "Đã kết thúc tham gia dự án",
    REMOVED: "Đã kết thúc tham gia dự án",
    HISTORICAL: "Hồ sơ tham gia lịch sử",
  };
  const en: Record<string, string> = {
    OWNER: "Project owner",
    ACTIVE: "Team member",
    ADVISOR: "Research mentor",
    LEFT: "Ended project participation",
    REMOVED: "Ended project participation",
    HISTORICAL: "Historical participation",
  };
  return (language === "vi" ? vi[status] : en[status]) ?? status;
}

function sourceKindLabel(source: PersonalContributionRecord["sourceKind"], language: string): string {
  const vi: Record<PersonalContributionRecord["sourceKind"], string> = {
    SYSTEM_RECORDED: "Hệ thống ghi nhận",
    SELF_DECLARED: "Tự khai báo",
    TEAM_DECLARED: "Nhóm ghi nhận",
    MENTOR_RECORDED: "Ghi nhận hướng dẫn",
    IMPORTED: "Hồ sơ đã lưu",
  };
  const en: Record<PersonalContributionRecord["sourceKind"], string> = {
    SYSTEM_RECORDED: "Recorded by system",
    SELF_DECLARED: "Self-declared",
    TEAM_DECLARED: "Declared by team",
    MENTOR_RECORDED: "Mentorship record",
    IMPORTED: "Imported record",
  };
  return language === "vi" ? vi[source] : en[source];
}

function statusMeta(record: PersonalContributionRecord, language: string) {
  if (record.reconciliationState === "DISPUTED") {
    return {
      tone: "disputed" as const,
      Icon: AlertCircle,
      label: language === "vi" ? "Đang có bất đồng" : "Under review",
    };
  }
  if (record.reconciliationState === "CLARIFICATION_REQUESTED") {
    return {
      tone: "pending" as const,
      Icon: MessageSquare,
      label: language === "vi" ? "Cần làm rõ thông tin" : "Clarification requested",
    };
  }
  if (record.needsMyAction) {
    return {
      tone: "pending" as const,
      Icon: Clock3,
      label: language === "vi" ? "Cần bạn phản hồi" : "Action required",
    };
  }
  if (record.waitingOnOthers) {
    return {
      tone: "waiting" as const,
      Icon: Clock3,
      label: language === "vi" ? "Đang chờ nhóm xác nhận" : "Waiting on team",
    };
  }
  if (record.reconciliationState === "ACKNOWLEDGED") {
    return {
      tone: "acknowledged" as const,
      Icon: CheckCircle2,
      label: language === "vi" ? "Đã đối soát" : "Acknowledged",
    };
  }
  if (record.reconciliationState === "HISTORICAL") {
    return {
      tone: "historical" as const,
      Icon: Archive,
      label: language === "vi" ? "Hồ sơ lịch sử được bảo toàn" : "Preserved historical record",
    };
  }
  if (record.reconciliationState === "SELF_DECLARED" || record.sourceKind === "SELF_DECLARED") {
    return {
      tone: "neutral" as const,
      Icon: FileText,
      label: language === "vi" ? "Người dùng khai báo" : "Self-declared",
    };
  }
  return {
    tone: "neutral" as const,
    Icon: ShieldCheck,
    label: language === "vi" ? "Hệ thống ghi nhận" : "Recorded by system",
  };
}

function reviewAssessmentLabel(assessment: string | null | undefined, language: string): string | null {
  if (!assessment) return null;
  const key = assessment.toUpperCase();
  const vi: Record<string, string> = {
    ACCEPT: "Đề xuất chấp nhận (nội bộ)",
    STRONG_ACCEPT: "Đánh giá cao — Sẵn sàng bước tiếp theo",
    MINOR_REVISION: "Cần chỉnh sửa nhỏ",
    MAJOR_REVISION: "Cần chỉnh sửa lớn",
    REJECT: "Chưa đạt yêu cầu học thuật",
    REVISE_AND_RESUBMIT: "Chỉnh sửa và nộp lại",
    READY_TO_ADVANCE: "Sẵn sàng cho bước tiếp theo (chưa xuất bản)",
  };
  const en: Record<string, string> = {
    ACCEPT: "Recommended to advance (internal)",
    STRONG_ACCEPT: "Strong internal assessment",
    MINOR_REVISION: "Minor revisions requested",
    MAJOR_REVISION: "Major revisions requested",
    REJECT: "Not ready to advance",
    REVISE_AND_RESUBMIT: "Revise and resubmit",
    READY_TO_ADVANCE: "Ready internally (not published)",
  };
  return (language === "vi" ? vi[key] : en[key]) ?? assessment;
}

function caseStatusLabel(status: string, language: string): string {
  const vi: Record<string, string> = {
    REPORTED: "Đã tiếp nhận",
    CONTAINED: "Đã bảo toàn dữ liệu",
    UNDER_REVIEW: "Vụ việc đang được xem xét",
    ESCALATED: "Đã chuyển xem xét độc lập",
    RESOLVED: "Đã hoàn tất xử lý",
    CLOSED: "Đã đóng hồ sơ",
  };
  const en: Record<string, string> = {
    REPORTED: "Received",
    CONTAINED: "Assets protected",
    UNDER_REVIEW: "Under review",
    ESCALATED: "Escalated for independent review",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  };
  return (language === "vi" ? vi[status] : en[status]) ?? status;
}

function publicationStatusLabel(status: string | null | undefined, language: string): string | null {
  if (!status) return null;
  const normalized = status.toLowerCase();
  const vi: Record<string, string> = {
    draft: "Đang chuẩn bị bản thảo",
    submitted: "Đã nộp xem xét nội bộ",
    ready_for_review: "Sẵn sàng phản biện nội bộ",
    under_review: "Đang phản biện",
    revision_requested: "Cần chỉnh sửa bản thảo",
    revised: "Đã cập nhật bản thảo",
    ready_to_advance: "Sẵn sàng cho bước tiếp theo (chưa xuất bản)",
    completed: "Đã hoàn tất vòng phản biện",
    published: "Đã công bố",
  };
  const en: Record<string, string> = {
    draft: "Preparing manuscript",
    submitted: "Submitted for internal review",
    ready_for_review: "Ready for review",
    under_review: "Under review",
    revision_requested: "Revisions requested",
    revised: "Revised manuscript",
    ready_to_advance: "Ready internally (not published)",
    completed: "Review round completed",
    published: "Published",
  };
  return (language === "vi" ? vi[normalized] : en[normalized]) ?? status;
}

function normalizeProjectHistory(history: PersonalContributionHistoryExport) {
  const items = history.unifiedRecords ?? [];
  const cases = history.integrityCases ?? [];
  const projects: GlobalPersonalContributionProjectSummary[] = [
    {
      projectId: history.projectId,
      title: history.projectTitle,
      membershipStatus: history.membershipStatus,
      projectStatus: history.projectStatus ?? "ACTIVE",
      projectDeleted: Boolean(history.projectDeleted),
      canViewWorkspace: Boolean(history.canViewWorkspace),
      canDeclareContribution: Boolean(history.canDeclareInProject),
      recordCount: items.length,
      pendingCount: items.filter(i => i.needsMyAction).length,
      publicationStatus: history.publicationOutcomes?.[0]?.status ?? null,
    },
  ];
  return {
    userId: history.userId,
    userName: history.userName,
    accountRestricted: Boolean(history.accountRestricted),
    summary: {
      recordedWorkCount: items.length,
      acknowledgedCount: items.filter(i => i.reconciliationState === "ACKNOWLEDGED").length,
      needsMyResponseCount:
        items.filter(i => i.needsMyAction).length +
        cases.filter(c => !["RESOLVED", "CLOSED"].includes(c.status) && c.myRole === "RESPONDENT").length,
      projectCount: 1,
    },
    projects,
    items,
    cases,
    attributionLimitations: history.attributionLimitations ?? [],
    membershipStatus: history.membershipStatus,
    privacyRedacted: history.privacyRedacted,
    projectDeleted: Boolean(history.projectDeleted),
    integrityDigestSha256: history.integrityDigestSha256,
  };
}

export function PersonalContributionProfile({ scope, projectId, embedded = false }: Props) {
  const { language } = useI18n();
  const isVi = language === "vi";
  const queryClient = useQueryClient();

  // Navigation & filter state (preserved across detail sheet open/close)
  const [activeTab, setActiveTab] = useState<PersonalTab>("mine");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Detail drawer, Declare contribution dialog, Export preview dialog, Review request dialog
  const [selectedRecord, setSelectedRecord] = useState<PersonalContributionRecord | null>(null);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [declareOpen, setDeclareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reviewRequestRecord, setReviewRequestRecord] = useState<PersonalContributionRecord | null>(null);
  const [caseResponseId, setCaseResponseId] = useState<string | null>(null);
  const [caseResponseText, setCaseResponseText] = useState("");

  // Declare missing contribution form state
  const [declareProjectId, setDeclareProjectId] = useState(projectId ?? "");
  const [declareTitle, setDeclareTitle] = useState("");
  const [declareDescription, setDeclareDescription] = useState("");
  const [declareOutcome, setDeclareOutcome] = useState("");
  const [declareRoles, setDeclareRoles] = useState<CreditRole[]>([]);
  const [declareDate, setDeclareDate] = useState(contributionDate());
  const [declareEvidence, setDeclareEvidence] = useState("");
  const [declareEvidenceUrl, setDeclareEvidenceUrl] = useState("");

  // Friendly Review Request (Integrity Case) form state
  const [caseKind, setCaseKind] = useState<IntegrityCaseKind>("CONTRIBUTION_DISPUTE");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [caseDesiredOutcome, setCaseDesiredOutcome] = useState("");

  const projectQuery = useQuery({
    queryKey: ["my-contribution-history", projectId],
    queryFn: () => contributionsApi.myHistory(projectId!),
    enabled: scope === "project" && Boolean(projectId),
  });

  const globalQuery = useQuery({
    queryKey: ["my-global-contributions"],
    queryFn: () => contributionsApi.myGlobal({ page: 1, pageSize: 50 }),
    enabled: scope === "global",
  });

  const activeQuery = scope === "project" ? projectQuery : globalQuery;

  const normalized = useMemo(() => {
    if (scope === "project") {
      if (!projectQuery.data) return null;
      return normalizeProjectHistory(projectQuery.data);
    }
    if (!globalQuery.data) return null;
    return {
      ...globalQuery.data,
      membershipStatus: undefined,
      privacyRedacted: false,
      projectDeleted: false,
    };
  }, [scope, projectQuery.data, globalQuery.data]);

  const declarableProjects = useMemo(
    () => (normalized?.projects ?? []).filter(p => p.canDeclareContribution),
    [normalized?.projects],
  );

  const visibleRecords = useMemo(() => {
    const items = normalized?.items ?? [];
    const q = searchQuery.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return items.filter(item => {
      if (scope === "global" && selectedProjectFilter && item.projectId !== selectedProjectFilter) return false;
      if (activeTab === "pending" && !item.needsMyAction) return false;
      if (
        activeTab === "saved" &&
        !(
          item.reconciliationState === "ACKNOWLEDGED" ||
          item.reconciliationState === "HISTORICAL" ||
          item.projectDeleted ||
          ["LEFT", "REMOVED", "HISTORICAL"].includes(item.membershipStatus)
        )
      ) {
        return false;
      }
      if (statusFilter) {
        if (statusFilter === "WAITING_ON_OTHERS") {
          if (!item.waitingOnOthers) return false;
        } else if (statusFilter === "PENDING_RESPONSE") {
          if (!item.needsMyAction) return false;
        } else if (item.reconciliationState !== statusFilter) {
          return false;
        }
      }
      if (
        roleFilter &&
        !item.roles.includes(roleFilter as CreditRole) &&
        !item.suggestedRoles?.includes(roleFilter as CreditRole)
      ) {
        return false;
      }
      if (sourceFilter && item.sourceKind !== sourceFilter) return false;
      if (fromMs && !Number.isNaN(fromMs) && new Date(item.workDate).getTime() < fromMs) return false;
      if (toMs && !Number.isNaN(toMs) && new Date(item.workDate).getTime() > toMs) return false;
      if (q) {
        const hay = `${item.title} ${item.summary} ${item.projectTitle} ${item.roles.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [normalized?.items, scope, selectedProjectFilter, activeTab, statusFilter, roleFilter, sourceFilter, dateFrom, dateTo, searchQuery]);

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-global-contributions"] });
    if (projectId) {
      await queryClient.invalidateQueries({ queryKey: ["my-contribution-history", projectId] });
    }
  };

  const reviewWorkMutation = useMutation({
    mutationFn: (payload: { projectId: string; recordId: string; version: number; decision: string; note: string }) =>
      contributionsApi.review(payload.projectId, payload.recordId, {
        expectedVersion: payload.version,
        decision: payload.decision,
        note: payload.note,
      }),
    onSuccess: async () => {
      toast.success(isVi ? "Đã ghi nhận phản hồi của bạn." : "Your response has been recorded.");
      setReviewNote("");
      setSelectedRecord(null);
      await invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || (isVi ? "Không thể gửi phản hồi lúc này." : "Could not record your response."));
    },
  });

  const declareMutation = useMutation({
    mutationFn: async () => {
      const targetProjectId = scope === "project" ? projectId! : declareProjectId;
      if (!targetProjectId) throw new Error(isVi ? "Vui lòng chọn dự án liên quan." : "Please select a project.");
      if (!normalized?.userId) throw new Error("User unavailable");
      const externalEvidence = declareEvidenceUrl.trim()
        ? [{ kind: "LINK" as const, url: declareEvidenceUrl.trim(), label: isVi ? "Minh chứng liên kết" : "Evidence link" }]
        : [];
      return contributionsApi.save(targetProjectId, {
        title: declareTitle.trim(),
        description: declareDescription.trim(),
        category: inferContributionCategoryFromRoles(declareRoles),
        source: "MANUAL",
        workDate: `${declareDate}T00:00:00+07:00`,
        participants: [{ userId: normalized.userId, roles: declareRoles }],
        evidence: declareEvidence.trim(),
        outcome: declareOutcome.trim(),
        evidenceRefs: [],
        externalEvidence,
        clientKey: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      toast.success(
        isVi
          ? "Đã lưu đóng góp dưới dạng tự khai báo. Nhóm nghiên cứu có thể đối soát bổ sung."
          : "Contribution recorded as self-declared. Team members can review it.",
      );
      setDeclareOpen(false);
      setDeclareTitle("");
      setDeclareDescription("");
      setDeclareOutcome("");
      setDeclareRoles([]);
      setDeclareEvidence("");
      setDeclareEvidenceUrl("");
      await invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || (isVi ? "Không thể bổ sung đóng góp lúc này." : "Could not save contribution."));
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      if (!reviewRequestRecord) throw new Error("No target record");
      const targetKind: IntegrityTargetKind =
        reviewRequestRecord.recordKind === "WORK_CONTRIBUTION"
          ? "WORK_CONTRIBUTION"
          : reviewRequestRecord.recordKind === "MANUSCRIPT_ATTRIBUTION"
            ? "MANUSCRIPT_ATTRIBUTION"
            : "PROJECT";
      const fullDescription = caseDesiredOutcome.trim()
        ? `${caseDescription.trim()}\n\n${isVi ? "Kết quả mong muốn:" : "Requested outcome:"} ${caseDesiredOutcome.trim()}`
        : caseDescription.trim();
      return contributionsApi.createIntegrityCase(reviewRequestRecord.projectId, {
        kind: caseKind,
        targetKind,
        targetId: reviewRequestRecord.sourceRecordId,
        title: caseTitle.trim(),
        description: fullDescription,
        evidenceRefs: reviewRequestRecord.evidenceSources.slice(0, 10).map(e => ({
          kind: e.kind,
          id: e.id,
          label: e.label,
        })),
      });
    },
    onSuccess: async () => {
      toast.success(
        isVi
          ? "Đã gửi yêu cầu xem xét. Minh chứng hiện tại đã được bảo toàn."
          : "Review request submitted. Existing evidence has been preserved.",
      );
      setReviewRequestRecord(null);
      setCaseTitle("");
      setCaseDescription("");
      setCaseDesiredOutcome("");
      await invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || (isVi ? "Chưa thể gửi yêu cầu xem xét." : "Could not submit review request."));
    },
  });

  const respondCaseMutation = useMutation({
    mutationFn: ({ targetProjectId, caseId, note }: { targetProjectId: string; caseId: string; note: string }) =>
      contributionsApi.respondIntegrityCase(targetProjectId, caseId, note),
    onSuccess: async () => {
      toast.success(isVi ? "Đã gửi giải trình bổ sung." : "Response recorded.");
      setCaseResponseId(null);
      setCaseResponseText("");
      await invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || (isVi ? "Không thể gửi phản hồi." : "Could not add response."));
    },
  });

  const handleOpenDeclare = () => {
    setDeclareProjectId(projectId ?? declarableProjects[0]?.projectId ?? "");
    setDeclareOpen(true);
  };

  const handleOpenReviewRequest = (record: PersonalContributionRecord) => {
    setReviewRequestRecord(record);
    setCaseKind(record.recordKind === "MANUSCRIPT_ATTRIBUTION" ? "ATTRIBUTION_DISPUTE" : "CONTRIBUTION_DISPUTE");
    setCaseTitle(
      isVi
        ? `Yêu cầu xem xét ghi nhận: ${record.title.slice(0, 120)}`
        : `Review request for record: ${record.title.slice(0, 120)}`,
    );
    setCaseDescription("");
    setCaseDesiredOutcome("");
  };

  const handleConfirmExport = async () => {
    setExporting(true);
    try {
      const payload =
        scope === "project" && projectId
          ? await contributionsApi.exportMyHistory(projectId)
          : await contributionsApi.exportMyGlobal({
              ...(selectedProjectFilter ? { projectId: selectedProjectFilter } : {}),
            });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        scope === "project" && projectId
          ? `lumigap-contributions-${projectId.slice(0, 8)}.json`
          : `lumigap-my-contributions.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(
        isVi
          ? "Đã xuất hồ sơ đóng góp cá nhân (kèm mã kiểm tra toàn vẹn tệp)."
          : "Personal contribution record exported with file integrity digest.",
      );
      setExportOpen(false);
    } catch {
      toast.error(isVi ? "Chưa thể xuất hồ sơ đóng góp. Vui lòng thử lại." : "Could not export contribution record.");
    } finally {
      setExporting(false);
    }
  };

  if (activeQuery.isLoading) {
    return (
      <div className="pcp-root" data-no-i18n aria-busy="true">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="pcp-summary-strip">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }

  if (activeQuery.isError || !normalized) {
    return (
      <div className="pcp-root" data-no-i18n>
        <SectionErrorState
          error={activeQuery.error}
          title={isVi ? "Chưa thể tải hồ sơ đóng góp. Vui lòng thử lại." : "Could not load contribution records. Please try again."}
          onRetry={() => void activeQuery.refetch()}
          retrying={activeQuery.isFetching}
        />
      </div>
    );
  }

  const pendingCount = normalized.summary.needsMyResponseCount;
  const savedCount = normalized.items.filter(
    i =>
      i.reconciliationState === "ACKNOWLEDGED" ||
      i.reconciliationState === "HISTORICAL" ||
      i.projectDeleted ||
      ["LEFT", "REMOVED", "HISTORICAL"].includes(i.membershipStatus),
  ).length;
  const canAddContribution = declarableProjects.length > 0 && !normalized.accountRestricted;

  return (
    <section className="pcp-root" data-no-i18n aria-label={isVi ? "Đóng góp của tôi" : "My contributions"}>
      {/* Header */}
      <header className="pcp-header">
        <div className="pcp-header-copy">
          {embedded ? (
            <h2 className="pcp-title">
              {scope === "project"
                ? isVi
                  ? "Đóng góp của tôi trong dự án"
                  : "My contributions in this project"
                : isVi
                  ? "Đóng góp của tôi"
                  : "My contributions"}
            </h2>
          ) : (
            <h1 className="pcp-title">
              {scope === "project"
                ? isVi
                  ? "Đóng góp của tôi trong dự án"
                  : "My contributions in this project"
                : isVi
                  ? "Đóng góp của tôi"
                  : "My contributions"}
            </h1>
          )}
          <p className="pcp-subtitle">
            {isVi
              ? "Theo dõi những công việc bạn đã thực hiện và cách chúng được ghi nhận trong các dự án nghiên cứu."
              : "Track the research work you contributed and how it is recorded across your projects."}
          </p>
        </div>
        <div className="pcp-header-actions">
          <Button type="button" variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {isVi ? "Xuất hồ sơ" : "Export record"}
          </Button>
          {canAddContribution ? (
            <Button type="button" size="sm" onClick={handleOpenDeclare}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {isVi ? "Bổ sung đóng góp" : "Add contribution"}
            </Button>
          ) : null}
        </div>
      </header>

      {/* Calm preservation context banners when project deleted / departed / account restricted */}
      {normalized.projectDeleted || normalized.accountRestricted || normalized.privacyRedacted ? (
        <div className="pcp-context-banner" role="status">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
          <span>
            {normalized.projectDeleted
              ? isVi
                ? "Dự án này đã được đưa khỏi danh sách hoạt động, nhưng hồ sơ ghi nhận công lao cá nhân của bạn vẫn được bảo toàn."
                : "This project is no longer active, while your personal contribution record remains preserved."
              : normalized.accountRestricted
                ? isVi
                  ? "Tài khoản hiện đang ở chế độ hạn chế thao tác. Bạn vẫn có quyền xem và xuất hồ sơ công lao cá nhân của mình."
                  : "Your account currently has restricted actions, while read-only access to your personal contribution history remains available."
                : isVi
                  ? "Bạn có thể xem hồ sơ công lao của mình ngay cả khi không còn truy cập không gian làm việc. Một số tài liệu nội bộ của nhóm có thể không nằm trong phạm vi chia sẻ."
                  : "You can view your own contribution record even without active workspace access. Internal team files remain scoped to project permissions."}
          </span>
        </div>
      ) : null}

      {/* Calm 3-item summary strip */}
      <div className="pcp-summary-strip" aria-label={isVi ? "Tóm tắt hồ sơ đóng góp" : "Contribution summary"}>
        <div className="pcp-summary-item">
          <span className="pcp-summary-label">{isVi ? "Công việc được ghi nhận" : "Recorded work"}</span>
          <strong className="pcp-summary-value">{normalized.summary.recordedWorkCount}</strong>
        </div>
        <div className="pcp-summary-item">
          <span className="pcp-summary-label">{isVi ? "Đóng góp đã đối soát" : "Acknowledged"}</span>
          <strong className="pcp-summary-value">{normalized.summary.acknowledgedCount}</strong>
        </div>
        <div className="pcp-summary-item" data-attention={pendingCount > 0 ? "true" : undefined}>
          <span className="pcp-summary-label">{isVi ? "Mục cần bạn phản hồi" : "Needs your review"}</span>
          <strong className="pcp-summary-value">{pendingCount}</strong>
        </div>
      </div>

      {/* 3-mode personal navigation */}
      <div className="pcp-nav-row">
        <div className="pcp-tabs" role="tablist" aria-label={isVi ? "Chế độ xem đóng góp" : "Contribution views"}>
          <button
            type="button"
            role="tab"
            className="pcp-tab"
            aria-selected={activeTab === "mine"}
            data-active={activeTab === "mine" ? "true" : undefined}
            onClick={() => setActiveTab("mine")}
          >
            <span>{isVi ? "Tất cả công việc" : "All work"}</span>
            <span className="pcp-tab-count">{normalized.items.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            className="pcp-tab"
            aria-selected={activeTab === "pending"}
            data-active={activeTab === "pending" ? "true" : undefined}
            onClick={() => setActiveTab("pending")}
          >
            <span>{isVi ? "Cần tôi phản hồi" : "Needs my response"}</span>
            <span className="pcp-tab-count" data-tone={pendingCount > 0 ? "warn" : undefined}>
              {pendingCount}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            className="pcp-tab"
            aria-selected={activeTab === "saved"}
            data-active={activeTab === "saved" ? "true" : undefined}
            onClick={() => setActiveTab("saved")}
          >
            <span>{isVi ? "Hồ sơ đã lưu" : "Saved records"}</span>
            <span className="pcp-tab-count">{savedCount}</span>
          </button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          aria-expanded={showAdvancedFilters}
          onClick={() => setShowAdvancedFilters(v => !v)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {isVi ? "Bộ lọc nâng cao" : "More filters"}
        </Button>
      </div>

      {/* Filters (essential visible; advanced collapsible) */}
      <div className="pcp-filters">
        <div className="pcp-filters-main">
          <div className="pcp-search-wrap">
            <Search className="pcp-search-icon h-4 w-4" aria-hidden="true" />
            <Input
              type="text"
              className="h-9 pcp-search-input text-sm"
              aria-label={isVi ? "Tìm công việc hoặc dự án" : "Search work or project"}
              placeholder={isVi ? "Tìm theo tên công việc, dự án hoặc vai trò…" : "Search by work, project, or role…"}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <button
                type="button"
                className="pcp-search-clear"
                aria-label={isVi ? "Xóa tìm kiếm" : "Clear search"}
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {scope === "global" && normalized.projects.length > 0 ? (
            <select
              className="pcp-select"
              aria-label={isVi ? "Lọc theo dự án" : "Filter by project"}
              value={selectedProjectFilter}
              onChange={e => setSelectedProjectFilter(e.target.value)}
            >
              <option value="">{isVi ? `Tất cả dự án (${normalized.projects.length})` : `All projects (${normalized.projects.length})`}</option>
              {normalized.projects.map(proj => (
                <option key={proj.projectId} value={proj.projectId}>
                  {proj.title} ({proj.recordCount})
                </option>
              ))}
            </select>
          ) : null}

          <select
            className="pcp-select"
            aria-label={isVi ? "Trạng thái đối soát" : "Review status"}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">{isVi ? "Mọi trạng thái" : "All statuses"}</option>
            <option value="ACKNOWLEDGED">{isVi ? "Đã đối soát" : "Acknowledged"}</option>
            <option value="PENDING_RESPONSE">{isVi ? "Cần bạn phản hồi" : "Action required"}</option>
            <option value="WAITING_ON_OTHERS">{isVi ? "Đang chờ nhóm xác nhận" : "Waiting on team"}</option>
            <option value="CLARIFICATION_REQUESTED">{isVi ? "Cần làm rõ thông tin" : "Clarification requested"}</option>
            <option value="SELF_DECLARED">{isVi ? "Người dùng khai báo" : "Self-declared"}</option>
            <option value="RECORDED">{isVi ? "Hệ thống ghi nhận" : "Recorded by system"}</option>
            <option value="DISPUTED">{isVi ? "Đang có bất đồng" : "Under review"}</option>
            <option value="HISTORICAL">{isVi ? "Hồ sơ lịch sử" : "Historical"}</option>
          </select>
        </div>

        {showAdvancedFilters ? (
          <div className="pcp-filters-advanced">
            <select
              className="pcp-select w-full"
              aria-label={isVi ? "Vai trò đóng góp" : "CRediT role"}
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="">{isVi ? "Tất cả vai trò CRediT" : "All CRediT roles"}</option>
              {creditRoles.map(role => (
                <option key={role} value={role}>
                  {formatCreditRole(role, language)}
                </option>
              ))}
            </select>

            <select
              className="pcp-select w-full"
              aria-label={isVi ? "Nguồn ghi nhận" : "Record source"}
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
            >
              <option value="">{isVi ? "Mọi nguồn ghi nhận" : "All sources"}</option>
              <option value="SYSTEM_RECORDED">{sourceKindLabel("SYSTEM_RECORDED", language)}</option>
              <option value="SELF_DECLARED">{sourceKindLabel("SELF_DECLARED", language)}</option>
              <option value="TEAM_DECLARED">{sourceKindLabel("TEAM_DECLARED", language)}</option>
              <option value="MENTOR_RECORDED">{sourceKindLabel("MENTOR_RECORDED", language)}</option>
            </select>

            <Input
              type="date"
              className="h-9 text-xs"
              aria-label={isVi ? "Từ ngày" : "From date"}
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <Input
              type="date"
              className="h-9 text-xs"
              aria-label={isVi ? "Đến ngày" : "To date"}
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {/* Contribution compact list */}
      {visibleRecords.length > 0 ? (
        <div className="pcp-list" role="list">
          {visibleRecords.map(record => {
            const st = statusMeta(record, language);
            const StIcon = st.Icon;
            const pubLabel = publicationStatusLabel(record.manuscriptContext?.publicationStatus, language);
            return (
              <article key={record.id} className="pcp-row" role="listitem">
                <div className="pcp-row-main">
                  <div className="pcp-row-top">
                    <button
                      type="button"
                      className="pcp-row-title-btn"
                      onClick={() => {
                        setSelectedRecord(record);
                        setMoreActionsOpen(false);
                        setReviewNote("");
                      }}
                    >
                      {record.title}
                    </button>
                  </div>

                  <div className="pcp-row-meta">
                    {scope === "global" ? (
                      <>
                        <span className="font-medium text-foreground/85">{record.projectTitle}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    ) : null}
                    <span>{membershipLabel(record.membershipStatus, language)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sourceKindLabel(record.sourceKind, language)}</span>
                    {record.reviewContext ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isVi
                            ? `Vòng ${record.reviewContext.roundNumber}${record.reviewContext.revisionNumber ? ` · v${record.reviewContext.revisionNumber}` : ""}`
                            : `Round ${record.reviewContext.roundNumber}${record.reviewContext.revisionNumber ? ` · v${record.reviewContext.revisionNumber}` : ""}`}
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={record.workDate}>
                      {new Date(record.workDate).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                    </time>
                    {record.evidenceCount > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isVi ? `${record.evidenceCount} minh chứng` : `${record.evidenceCount} evidence item(s)`}
                        </span>
                      </>
                    ) : null}
                    {pubLabel ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{pubLabel}</span>
                      </>
                    ) : null}
                  </div>

                  {record.roles.length > 0 || (record.suggestedRoles && record.suggestedRoles.length > 0) ? (
                    <div className="pcp-row-roles">
                      {record.roles.map(role => (
                        <span key={role} className="pcp-role-chip">
                          {formatCreditRole(role, language)}
                        </span>
                      ))}
                      {record.roles.length === 0 &&
                        record.suggestedRoles?.map(role => (
                          <span key={`sug-${role}`} className="pcp-role-chip opacity-80">
                            {isVi ? "Gợi ý: " : "Suggested: "}
                            {formatCreditRole(role, language)}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </div>

                <div className="pcp-row-actions">
                  <span className="pcp-status-pill" data-tone={st.tone}>
                    <StIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{st.label}</span>
                  </span>
                  <Button
                    type="button"
                    variant={record.needsMyAction ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setSelectedRecord(record);
                      setMoreActionsOpen(false);
                      setReviewNote("");
                    }}
                  >
                    {record.needsMyAction
                      ? isVi
                        ? "Xem xét & phản hồi"
                        : "Review & respond"
                      : isVi
                        ? "Xem chi tiết"
                        : "View details"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="pcp-empty">
          {activeTab === "pending" ? (
            <>
              <CheckCircle2 className="h-7 w-7 text-emerald-600/70" aria-hidden="true" />
              <h3>{isVi ? "Hiện không có mục nào cần bạn xem xét." : "Nothing needs your review right now."}</h3>
              <p>
                {isVi
                  ? "Khi có ghi nhận đóng góp hoặc đề xuất quyền tác giả cần phản hồi của bạn, mục đó sẽ xuất hiện tại đây."
                  : "When a contribution record or authorship review awaits your response, it will appear here."}
              </p>
            </>
          ) : searchQuery || statusFilter || roleFilter || sourceFilter || selectedProjectFilter ? (
            <>
              <Filter className="h-7 w-7 text-muted-foreground/50" aria-hidden="true" />
              <h3>{isVi ? "Không tìm thấy mục nào khớp bộ lọc." : "No records match your filters."}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("");
                  setRoleFilter("");
                  setSourceFilter("");
                  setSelectedProjectFilter("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                {isVi ? "Xóa bộ lọc" : "Clear filters"}
              </Button>
            </>
          ) : (
            <>
              <FileText className="h-7 w-7 text-muted-foreground/50" aria-hidden="true" />
              <h3>
                {scope === "project"
                  ? isVi
                    ? "Chưa có công việc được ghi nhận trong dự án này."
                    : "No work recorded in this project yet."
                  : isVi
                    ? "Những công việc nghiên cứu của bạn sẽ xuất hiện tại đây khi được ghi nhận."
                    : "Your research contributions will appear here as they are recorded."}
              </h3>
              {canAddContribution ? (
                <Button type="button" variant="outline" size="sm" className="mt-1" onClick={handleOpenDeclare}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {isVi ? "Bổ sung công việc đã thực hiện" : "Add completed work"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* Personal Review Requests / Integrity Cases Tracker */}
      {normalized.cases.length > 0 ? (
        <section className="pcp-cases-box" aria-label={isVi ? "Yêu cầu xem xét của tôi" : "My review requests"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Yêu cầu xem xét liên quan đến bạn" : "Review requests involving you"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isVi
                  ? "Theo dõi trạng thái giải trình và kết quả xử lý. Vụ việc đang mở không phải kết luận sai phạm."
                  : "Track responses and outcomes. An open review request is never a misconduct verdict."}
              </p>
            </div>
            <Badge variant="secondary">{normalized.cases.length}</Badge>
          </div>

          <div className="divide-y rounded-xl border bg-background">
            {normalized.cases.map((item: PersonalIntegrityCaseSummary) => {
              const isOpenCase = !["RESOLVED", "CLOSED"].includes(item.status);
              const responding = caseResponseId === item.id;
              return (
                <div key={item.id} className="p-3.5 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground">{item.title}</p>
                      <p className="text-muted-foreground">
                        {item.projectTitle} ·{" "}
                        {item.myRole === "REPORTER"
                          ? isVi
                            ? "Bạn đã gửi yêu cầu"
                            : "Submitted by you"
                          : isVi
                            ? "Bạn được mời giải trình"
                            : "Your response requested"}
                      </p>
                    </div>
                    <Badge variant="outline">{caseStatusLabel(item.status, language)}</Badge>
                  </div>
                  {item.resolutionSummary ? (
                    <p className="rounded-lg bg-muted/40 p-2.5 text-foreground/90">{item.resolutionSummary}</p>
                  ) : null}
                  {isOpenCase && !normalized.accountRestricted ? (
                    responding ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                          placeholder={
                            isVi
                              ? "Nhập thông tin giải trình hoặc bổ sung minh chứng…"
                              : "Provide your explanation or additional context…"
                          }
                          value={caseResponseText}
                          onChange={e => setCaseResponseText(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setCaseResponseId(null)}>
                            {isVi ? "Hủy" : "Cancel"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={caseResponseText.trim().length < 2 || respondCaseMutation.isPending}
                            onClick={() =>
                              respondCaseMutation.mutate({
                                targetProjectId: item.projectId,
                                caseId: item.id,
                                note: caseResponseText.trim(),
                              })
                            }
                          >
                            <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            {isVi ? "Gửi giải trình" : "Submit response"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setCaseResponseId(item.id);
                          setCaseResponseText("");
                        }}
                      >
                        {isVi ? "Bổ sung giải trình" : "Add explanation"}
                      </Button>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Detail Drawer (keeps filters, scroll position & pagination intact) */}
      <Sheet
        open={Boolean(selectedRecord)}
        onOpenChange={open => {
          if (!open) {
            setSelectedRecord(null);
            setMoreActionsOpen(false);
          }
        }}
      >
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-xl" data-no-i18n>
          {selectedRecord ? (() => {
            const st = statusMeta(selectedRecord, language);
            const StIcon = st.Icon;
            const exactReviewHref =
              selectedRecord.evidenceSources.find(ev => ev.accessible && ev.href)?.href ?? null;
            const workspaceHref =
              selectedRecord.membershipStatus === "ADVISOR"
                ? `/mentor-workspace?tab=contributions&view=project&projectId=${encodeURIComponent(selectedRecord.projectId)}`
                : selectedRecord.manuscriptContext?.manuscriptId
                  ? `/projects/${encodeURIComponent(selectedRecord.projectId)}?tab=manuscripts`
                  : `/projects/${encodeURIComponent(selectedRecord.projectId)}?tab=contributions`;

            return (
              <>
                <div className="pcp-drawer-header">
                  <div className="space-y-1.5 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="pcp-status-pill" data-tone={st.tone}>
                        <StIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{st.label}</span>
                      </span>
                      {sourceKindLabel(selectedRecord.sourceKind, language) !== st.label ? (
                        <Badge variant="outline" className="text-[11px] font-medium">
                          {sourceKindLabel(selectedRecord.sourceKind, language)}
                        </Badge>
                      ) : null}
                    </div>
                    <SheetTitle className="text-base leading-snug">{selectedRecord.title}</SheetTitle>
                    <SheetDescription className="text-xs">
                      {selectedRecord.projectTitle} · {membershipLabel(selectedRecord.membershipStatus, language)} ·{" "}
                      {new Date(selectedRecord.workDate).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                    </SheetDescription>
                  </div>
                </div>

                <div className="pcp-drawer-scroll">
                  <div className="pcp-drawer-body">
                    {/* Summary & Review Context */}
                    <div className="pcp-drawer-section">
                      <span className="pcp-drawer-label">{isVi ? "Nội dung công việc" : "Work summary"}</span>
                      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {selectedRecord.summary}
                      </p>

                      {selectedRecord.reviewContext ? (
                        <div className="pcp-review-card">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <ClipboardCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                            <span>{isVi ? "Chi tiết vòng phản biện học thuật" : "Academic review round details"}</span>
                          </div>
                          <dl className="pcp-review-meta-grid">
                            <div>
                              <dt className="text-[11px] text-muted-foreground">{isVi ? "Vòng phản biện" : "Review round"}</dt>
                              <dd className="font-medium text-foreground">
                                {isVi ? `Vòng ${selectedRecord.reviewContext.roundNumber}` : `Round ${selectedRecord.reviewContext.roundNumber}`}
                              </dd>
                            </div>
                            {selectedRecord.reviewContext.revisionNumber ? (
                              <div>
                                <dt className="text-[11px] text-muted-foreground">{isVi ? "Phiên bản bản thảo" : "Reviewed version"}</dt>
                                <dd className="font-medium text-foreground">v{selectedRecord.reviewContext.revisionNumber}</dd>
                              </div>
                            ) : null}
                            <div>
                              <dt className="text-[11px] text-muted-foreground">{isVi ? "Ngày nộp phản biện" : "Submitted on"}</dt>
                              <dd className="font-medium text-foreground">
                                {new Date(selectedRecord.reviewContext.submittedAt).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                              </dd>
                            </div>
                            {selectedRecord.reviewContext.overallAssessment ? (
                              <div>
                                <dt className="text-[11px] text-muted-foreground">{isVi ? "Đánh giá học thuật nội bộ" : "Internal assessment"}</dt>
                                <dd className="font-medium text-foreground">
                                  {reviewAssessmentLabel(selectedRecord.reviewContext.overallAssessment, language)}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                          {selectedRecord.reviewContext.commentExcerpt ? (
                            <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/85">
                                {isVi ? "Trích lược nhận xét đã gửi: " : "Submitted comment excerpt: "}
                              </span>
                              <span>{selectedRecord.reviewContext.commentExcerpt}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {/* CRediT Roles */}
                    <div className="pcp-drawer-section">
                      <span className="pcp-drawer-label">{isVi ? "Vai trò đóng góp (CRediT)" : "CRediT roles"}</span>
                      {selectedRecord.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedRecord.roles.map(role => (
                            <Badge key={role} variant="secondary" className="text-xs font-normal">
                              {formatCreditRole(role, language)}
                            </Badge>
                          ))}
                        </div>
                      ) : selectedRecord.suggestedRoles?.length ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">
                            {isVi
                              ? "Vai trò gợi ý tự động từ hoạt động học thuật (chưa phải vai trò tác giả chính thức):"
                              : "Suggested from recorded academic activity (not an official authorship role):"}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedRecord.suggestedRoles.map(role => (
                              <Badge key={role} variant="outline" className="text-xs font-normal">
                                {formatCreditRole(role, language)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {isVi ? "Chưa gắn vai trò CRediT cụ thể." : "No specific CRediT role assigned yet."}
                        </p>
                      )}
                    </div>

                    {/* Evidence & Access */}
                    <div className="pcp-drawer-section">
                      <span className="pcp-drawer-label">{isVi ? "Minh chứng liên quan" : "Linked evidence"}</span>
                      {selectedRecord.evidenceAccessRestricted ? (
                        <div className="rounded-lg border bg-muted/35 p-3 flex items-start gap-2 text-xs text-muted-foreground">
                          <Lock className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>
                            {isVi
                              ? "Minh chứng gốc không còn thuộc phạm vi truy cập của bạn. Hồ sơ ghi nhận công việc vẫn được bảo toàn."
                              : "Original source artifacts are outside your current workspace access. Your contribution record remains preserved."}
                          </span>
                        </div>
                      ) : selectedRecord.evidenceSources.length > 0 ? (
                        <ul className="space-y-2 text-xs">
                          {selectedRecord.evidenceSources.map((ev, idx) => (
                            <li
                              key={`${ev.kind}:${ev.id}:${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/15 px-3 py-2.5"
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-foreground">{ev.label}</span>
                                  {ev.versionLabel ? (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {ev.versionLabel}
                                    </Badge>
                                  ) : null}
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  {ev.accessible
                                    ? isVi
                                      ? "Trong phạm vi truy cập hợp lệ"
                                      : "Within authorized scope"
                                    : isVi
                                      ? "Bảo toàn siêu dữ liệu minh chứng"
                                      : "Metadata preserved"}
                                </span>
                              </div>
                              {ev.accessible && ev.href ? (
                                <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0">
                                  <Link to={ev.href}>
                                    <span>{isVi ? "Mở xem" : "Open"}</span>
                                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  </Link>
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  {ev.accessible
                                    ? isVi
                                      ? "Đã ghi nhận"
                                      : "Recorded"
                                    : isVi
                                      ? "Chỉ siêu dữ liệu"
                                      : "Metadata only"}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {isVi ? "Chưa đính kèm tài liệu minh chứng riêng." : "No linked files attached."}
                        </p>
                      )}
                    </div>

                    {/* Manuscript & Publication context */}
                    {selectedRecord.manuscriptContext ? (
                      <div className="pcp-drawer-section">
                        <span className="pcp-drawer-label">
                          {isVi ? "Liên hệ bản thảo & công bố" : "Manuscript & publication"}
                        </span>
                        <div className="rounded-lg border bg-muted/25 p-3 space-y-1 text-xs">
                          <p className="font-medium text-foreground">{selectedRecord.manuscriptContext.title}</p>
                          {selectedRecord.manuscriptContext.classification ? (
                            <p className="text-muted-foreground">
                              {isVi ? "Hình thức ghi nhận đề xuất: " : "Proposed attribution: "}
                              <strong className="text-foreground">
                                {selectedRecord.manuscriptContext.classification === "AUTHOR"
                                  ? isVi
                                    ? "Đề xuất là tác giả"
                                    : "Proposed author"
                                  : selectedRecord.manuscriptContext.classification === "ACKNOWLEDGED"
                                    ? isVi
                                      ? "Lời cảm ơn"
                                      : "Acknowledgement"
                                    : isVi
                                      ? "Chưa đưa vào danh sách tác giả (có giải trình)"
                                      : "Non-author with justification"}
                              </strong>
                            </p>
                          ) : null}
                          {selectedRecord.manuscriptContext.publicationStatus ? (
                            <p className="text-muted-foreground">
                              {isVi ? "Trạng thái bản thảo nội bộ: " : "Internal manuscript status: "}
                              {publicationStatusLabel(selectedRecord.manuscriptContext.publicationStatus, language)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {/* Acknowledgements */}
                    {selectedRecord.acknowledgements.length > 0 ? (
                      <div className="pcp-drawer-section">
                        <span className="pcp-drawer-label">{isVi ? "Phản hồi & đối soát" : "Acknowledgements"}</span>
                        <ul className="space-y-1.5 text-xs">
                          {selectedRecord.acknowledgements.map((ack, idx) => (
                            <li key={`${ack.userId}:${idx}`} className="rounded-lg border px-3 py-2 space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <strong className="text-foreground">{ack.name}</strong>
                                <span className="text-muted-foreground">
                                  {new Date(ack.createdAt).toLocaleDateString(isVi ? "vi-VN" : "en-US")}
                                </span>
                              </div>
                              {ack.note ? <p className="text-muted-foreground">{ack.note}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* Inline response actions for work contributions needing user's review */}
                    {selectedRecord.needsMyAction && selectedRecord.actionKind === "ACKNOWLEDGE_CONTRIBUTION" ? (
                      <div className="pcp-drawer-section space-y-2.5">
                        <span className="pcp-drawer-label">
                          {isVi ? "Phản hồi thông tin về bạn" : "Respond to this attribution"}
                        </span>
                        <textarea
                          className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                          placeholder={
                            isVi
                              ? "Ghi chú thêm (bắt buộc tối thiểu 10 ký tự nếu yêu cầu chỉnh sửa hoặc phản đối)…"
                              : "Optional note (at least 10 characters when requesting edits or disputing)…"
                          }
                          value={reviewNote}
                          onChange={e => setReviewNote(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={reviewWorkMutation.isPending}
                            onClick={() =>
                              reviewWorkMutation.mutate({
                                projectId: selectedRecord.projectId,
                                recordId: selectedRecord.sourceRecordId,
                                version: selectedRecord.version,
                                decision: "ACKNOWLEDGE",
                                note: reviewNote.trim(),
                              })
                            }
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {isVi ? "Xác nhận thông tin về tôi" : "Confirm my roles"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={reviewWorkMutation.isPending || reviewNote.trim().length < 10}
                            onClick={() =>
                              reviewWorkMutation.mutate({
                                projectId: selectedRecord.projectId,
                                recordId: selectedRecord.sourceRecordId,
                                version: selectedRecord.version,
                                decision: "NEEDS_CHANGES",
                                note: reviewNote.trim(),
                              })
                            }
                          >
                            {isVi ? "Yêu cầu chỉnh sửa" : "Request edits"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={reviewWorkMutation.isPending}
                            onClick={() =>
                              reviewWorkMutation.mutate({
                                projectId: selectedRecord.projectId,
                                recordId: selectedRecord.sourceRecordId,
                                version: selectedRecord.version,
                                decision: "INSUFFICIENT_INFORMATION",
                                note: reviewNote.trim(),
                              })
                            }
                          >
                            {isVi ? "Chưa đủ thông tin" : "Not enough info"}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {/* Progressive Disclosure: technical metadata hidden by default */}
                    <details className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium text-foreground/80">
                        {isVi ? "Thông tin kỹ thuật & phiên bản" : "Technical & version details"}
                      </summary>
                      <dl className="mt-2 space-y-1">
                        <div>
                          <dt className="inline font-medium">{isVi ? "Phiên bản bản ghi: " : "Version: "}</dt>
                          <dd className="inline">v{selectedRecord.version}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">{isVi ? "Loại dữ liệu: " : "Record type: "}</dt>
                          <dd className="inline">{selectedRecord.recordKind}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">{isVi ? "Mã bản ghi gốc: " : "Source ID: "}</dt>
                          <dd className="inline font-mono text-[11px]">{selectedRecord.sourceRecordId}</dd>
                        </div>
                      </dl>
                    </details>
                  </div>
                </div>

                {/* Sticky Drawer Footer: contextual primary action + discreet overflow menu for error/correction reporting */}
                <footer className="pcp-drawer-footer">
                  <div className="pcp-overflow-wrap">
                    {selectedRecord.canOpenReviewRequest ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          aria-expanded={moreActionsOpen}
                          aria-haspopup="menu"
                          onClick={() => setMoreActionsOpen(v => !v)}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          <span>{isVi ? "Tùy chọn khác" : "More options"}</span>
                        </Button>
                        {moreActionsOpen ? (
                          <div className="pcp-overflow-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="pcp-overflow-item"
                              onClick={() => {
                                setMoreActionsOpen(false);
                                handleOpenReviewRequest(selectedRecord);
                              }}
                            >
                              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                              <span>
                                {isVi ? "Báo sai sót hoặc đề nghị điều chỉnh" : "Report inaccuracy or request correction"}
                              </span>
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRecord(null);
                        setMoreActionsOpen(false);
                      }}
                    >
                      {isVi ? "Đóng" : "Close"}
                    </Button>
                    {selectedRecord.recordKind === "ACADEMIC_REVIEW" && exactReviewHref ? (
                      <Button asChild size="sm">
                        <Link to={exactReviewHref}>
                          <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          {isVi ? "Xem phản biện" : "View review"}
                        </Link>
                      </Button>
                    ) : selectedRecord.canViewWorkspace ? (
                      <Button asChild size="sm" variant="default">
                        <Link to={workspaceHref}>
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          {isVi ? "Mở trong dự án" : "Open in project"}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </footer>
              </>
            );
          })() : null}
        </SheetContent>
      </Sheet>

      {/* Dialog: Add Missing Contribution */}
      <Dialog open={declareOpen} onOpenChange={setDeclareOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-no-i18n>
          <DialogHeader>
            <DialogTitle>{isVi ? "Bổ sung đóng góp" : "Add missing contribution"}</DialogTitle>
            <DialogDescription>
              {isVi
                ? "Ghi nhận công việc bạn đã thực hiện (kể cả công việc ngoài LumiGap). Bản ghi được lưu dưới dạng tự khai báo để nhóm đối soát."
                : "Record research work you completed (including offline work). It is saved as self-declared for team acknowledgement."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3.5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              declareMutation.mutate();
            }}
          >
            {scope === "global" ? (
              <div className="space-y-1.5">
                <Label htmlFor="pcp-declare-project">{isVi ? "Dự án liên quan" : "Project"}</Label>
                <select
                  id="pcp-declare-project"
                  required
                  className="pcp-select w-full"
                  value={declareProjectId}
                  onChange={e => setDeclareProjectId(e.target.value)}
                >
                  <option value="">{isVi ? "Chọn dự án…" : "Select a project…"}</option>
                  {declarableProjects.map(proj => (
                    <option key={proj.projectId} value={proj.projectId}>
                      {proj.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="pcp-declare-title">{isVi ? "Công việc đã thực hiện" : "Work performed"}</Label>
              <Input
                id="pcp-declare-title"
                required
                minLength={3}
                maxLength={240}
                placeholder={isVi ? "VD: Thiết kế kịch bản thực nghiệm và đối chiếu baseline" : "e.g., Designed ablation experiments and baseline comparison"}
                value={declareTitle}
                onChange={e => setDeclareTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcp-declare-desc">{isVi ? "Mô tả chi tiết" : "Description"}</Label>
              <textarea
                id="pcp-declare-desc"
                required
                minLength={20}
                maxLength={5000}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={isVi ? "Mô tả cụ thể phạm vi công việc bạn đã làm (tối thiểu 20 ký tự)…" : "Describe what you contributed (at least 20 characters)…"}
                value={declareDescription}
                onChange={e => setDeclareDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pcp-declare-outcome">{isVi ? "Kết quả / sản phẩm tạo ra" : "Output / deliverable"}</Label>
                <Input
                  id="pcp-declare-outcome"
                  maxLength={500}
                  placeholder={isVi ? "VD: Bảng kết quả đánh giá, mã nguồn huấn luyện" : "e.g., Evaluation table, training script"}
                  value={declareOutcome}
                  onChange={e => setDeclareOutcome(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pcp-declare-date">{isVi ? "Thời gian thực hiện" : "Work date"}</Label>
                <Input
                  id="pcp-declare-date"
                  type="date"
                  required
                  max={contributionDate()}
                  value={declareDate}
                  onChange={e => setDeclareDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{isVi ? "Vai trò CRediT" : "CRediT roles"}</Label>
              <CreditRolePicker value={declareRoles} onChange={setDeclareRoles} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcp-declare-evidence">{isVi ? "Minh chứng / ghi chú nguồn" : "Evidence notes"}</Label>
              <Input
                id="pcp-declare-evidence"
                maxLength={1000}
                placeholder={isVi ? "VD: Mục 3.2 bản thảo, nhật ký thí nghiệm tuần 6" : "e.g., Section 3.2, week 6 experiment log"}
                value={declareEvidence}
                onChange={e => setDeclareEvidence(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcp-declare-url">
                {isVi ? "Liên kết minh chứng (không bắt buộc)" : "Evidence URL (optional)"}
              </Label>
              <Input
                id="pcp-declare-url"
                type="url"
                placeholder="https://…"
                value={declareEvidenceUrl}
                onChange={e => setDeclareEvidenceUrl(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeclareOpen(false)}>
                {isVi ? "Hủy" : "Cancel"}
              </Button>
              <Button type="submit" disabled={declareMutation.isPending}>
                {declareMutation.isPending
                  ? isVi
                    ? "Đang lưu…"
                    : "Saving…"
                  : isVi
                    ? "Lưu đóng góp"
                    : "Save contribution"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Friendly Review Request (Integrity Case) */}
      <Dialog open={Boolean(reviewRequestRecord)} onOpenChange={open => !open && setReviewRequestRecord(null)}>
        <DialogContent className="max-w-lg" data-no-i18n>
          <DialogHeader>
            <DialogTitle>{isVi ? "Gửi yêu cầu xem xét" : "Submit a review request"}</DialogTitle>
            <DialogDescription>
              {isVi
                ? "Yêu cầu xem xét giúp làm rõ thông tin ghi nhận hoặc bảo toàn bằng chứng. Việc gửi yêu cầu không phải kết luận vi phạm hay chế tài tài khoản."
                : "Review requests help clarify attribution or preserve evidence. Filing one is never a misconduct verdict or account penalty."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3.5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              createCaseMutation.mutate();
            }}
          >
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">{reviewRequestRecord?.projectTitle}</p>
              <p>{reviewRequestRecord?.title}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcp-case-kind">{isVi ? "Vấn đề cần xem xét" : "Topic to review"}</Label>
              <select
                id="pcp-case-kind"
                className="pcp-select w-full"
                value={caseKind}
                onChange={e => setCaseKind(e.target.value as IntegrityCaseKind)}
              >
                <option value="CONTRIBUTION_DISPUTE">
                  {isVi ? "Thiếu hoặc sai thông tin đóng góp" : "Missing or inaccurate contribution"}
                </option>
                <option value="ATTRIBUTION_DISPUTE">
                  {isVi ? "Rà soát quyền tác giả / ghi nhận bản thảo" : "Authorship or manuscript attribution review"}
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcp-case-title">{isVi ? "Tiêu đề ngắn gọn" : "Summary title"}</Label>
              <Input
                id="pcp-case-title"
                required
                minLength={3}
                maxLength={200}
                value={caseTitle}
                onChange={e => setCaseTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcp-case-desc">{isVi ? "Mô tả chi tiết & minh chứng" : "Details & supporting evidence"}</Label>
              <textarea
                id="pcp-case-desc"
                required
                minLength={5}
                maxLength={5000}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={
                  isVi
                    ? "Trình bày rõ công việc cần làm rõ, mốc thời gian và bằng chứng liên quan…"
                    : "Describe what needs clarification, timeline, and supporting evidence…"
                }
                value={caseDescription}
                onChange={e => setCaseDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcp-case-outcome">
                {isVi ? "Kết quả bạn mong muốn (không bắt buộc)" : "Desired outcome (optional)"}
              </Label>
              <Input
                id="pcp-case-outcome"
                maxLength={400}
                placeholder={isVi ? "VD: Cập nhật lại vai trò Methodology và lưu lịch sử xác nhận" : "e.g., Update Methodology role and preserve confirmation record"}
                value={caseDesiredOutcome}
                onChange={e => setCaseDesiredOutcome(e.target.value)}
              />
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isVi
                ? "Lưu ý: LumiGap hỗ trợ bảo toàn bằng chứng và điều phối đối soát; quyết định học thuật cuối cùng thuộc cơ sở đào tạo/nghiên cứu có thẩm quyền."
                : "Note: LumiGap preserves timestamped evidence and coordinates clarification; formal institutional academic rulings remain with the relevant university or institution."}
            </p>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setReviewRequestRecord(null)}>
                {isVi ? "Hủy" : "Cancel"}
              </Button>
              <Button type="submit" disabled={createCaseMutation.isPending}>
                {createCaseMutation.isPending
                  ? isVi
                    ? "Đang gửi…"
                    : "Submitting…"
                  : isVi
                    ? "Gửi yêu cầu xem xét"
                    : "Submit review request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Transparent Export Preview */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md" data-no-i18n>
          <DialogHeader>
            <DialogTitle>{isVi ? "Xuất hồ sơ đóng góp cá nhân" : "Export personal contribution record"}</DialogTitle>
            <DialogDescription>
              {isVi
                ? "Kiểm tra phạm vi dữ liệu trước khi tải tệp JSON."
                : "Review the export scope before downloading your JSON record."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 rounded-xl border bg-muted/25 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="text-foreground font-medium">
              {isVi
                ? `Bao gồm ${normalized.summary.recordedWorkCount} mục đóng góp đã ghi nhận thuộc ${normalized.summary.projectCount} dự án.`
                : `Includes ${normalized.summary.recordedWorkCount} recorded item(s) across ${normalized.summary.projectCount} project(s).`}
            </p>
            <p>
              {isVi
                ? "• Chỉ xuất dữ liệu công lao trong phạm vi quyền của bạn; không kèm tệp riêng tư chưa được chia sẻ."
                : "• Includes only contribution metadata within your permission scope; private unshared files are never included."}
            </p>
            <p>
              {isVi
                ? "• Mã SHA-256 chỉ dùng để kiểm tra tính toàn vẹn của tệp tải về, không phải chứng nhận học thuật chính thức của trường."
                : "• The SHA-256 digest verifies file integrity only; it is not an official university certification."}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setExportOpen(false)}>
              {isVi ? "Đóng" : "Close"}
            </Button>
            <Button type="button" disabled={exporting} onClick={() => void handleConfirmExport()}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {exporting ? (isVi ? "Đang xuất…" : "Exporting…") : isVi ? "Tải tệp JSON" : "Download JSON"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subtle honest attribution limitation disclosure */}
      {normalized.attributionLimitations.length > 0 ? (
        <details className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
          <summary className="cursor-pointer inline-flex items-center gap-1.5 font-medium text-foreground/80">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            {isVi ? "Phạm vi dữ liệu và nguyên tắc ghi nhận" : "Data scope & attribution notes"}
          </summary>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {normalized.attributionLimitations.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
