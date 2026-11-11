import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  FileCheck,
  Bot,
  Users,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Download,
  FileText,
  Plus,
  Trash2,
  Scale,
  Sparkles,
  HelpCircle,
  Copy,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectsApi } from "../api/projects.api";
import { useI18n } from "@/i18n";
import type {
  CreditRole,
  DeclareExternalAiInput,
  UpdateAuthorshipInput,
  ProjectIntegrityOverview,
} from "@trend/shared-types";
import { creditRoles } from "@trend/shared-types";

const ALL_CREDIT_ROLES: CreditRole[] = [...creditRoles];

export function SubmissionReadinessPackage({
  projectId,
  currentUserId,
  isOwner,
  readOnly = false,
}: {
  projectId: string;
  currentUserId: string;
  isOwner: boolean;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [activeSubTab, setActiveSubTab] = useState<"authorship" | "credit" | "mentors" | "ai" | "citations" | "export">("authorship");

  // Dispute modal / prompt state
  const [disputeNote, setDisputeNote] = useState("");
  const [showDisputeDialog, setShowDisputeDialog] = useState<"credit" | "authorship" | null>(null);

  // New AI declaration modal state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiToolName, setAiToolName] = useState("");
  const [aiPurpose, setAiPurpose] = useState<DeclareExternalAiInput["purpose"]>("LANGUAGE_POLISH");
  const [aiDescription, setAiDescription] = useState("");
  const [aiScope, setAiScope] = useState("");
  const [aiHumanOversightNote, setAiHumanOversightNote] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["projects", projectId, "scientific-integrity"],
    queryFn: () => projectsApi.integrityOverview(projectId),
    staleTime: 30_000,
  });

  const confirmCreditMutation = useMutation({
    mutationFn: (vars: { decision: "CONFIRM" | "DISPUTE"; note?: string }) =>
      projectsApi.confirmCredit(projectId, vars),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái xác nhận CRediT");
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "scientific-integrity"] });
      setShowDisputeDialog(null);
      setDisputeNote("");
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? "Không thể xác nhận CRediT"),
  });

  const confirmAuthorshipMutation = useMutation({
    mutationFn: (vars: { decision: "CONFIRM" | "DISPUTE"; note?: string }) =>
      projectsApi.confirmAuthorship(projectId, vars),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái xác nhận Đồng tác giả");
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "scientific-integrity"] });
      setShowDisputeDialog(null);
      setDisputeNote("");
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? "Không thể xác nhận đồng tác giả"),
  });

  const declareAiMutation = useMutation({
    mutationFn: (data: DeclareExternalAiInput) => projectsApi.declareExternalAi(projectId, data),
    onSuccess: () => {
      toast.success("Đã ghi nhận khai báo AI hỗ trợ theo chuẩn COPE/ICMJE");
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "scientific-integrity"] });
      setShowAiModal(false);
      setAiToolName("");
      setAiDescription("");
      setAiScope("");
      setAiHumanOversightNote("");
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? "Lỗi khi khai báo AI"),
  });

  const deleteAiMutation = useMutation({
    mutationFn: (declarationId: string) => projectsApi.deleteExternalAi(projectId, declarationId),
    onSuccess: () => {
      toast.success("Đã xóa khai báo AI");
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "scientific-integrity"] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? "Không thể xóa khai báo"),
  });

  const verifyCitationMutation = useMutation({
    mutationFn: (vars: { citationKey: string; action: "VERIFY" | "UNVERIFY" }) =>
      projectsApi.verifyCitation(projectId, vars),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái kiểm chứng trích dẫn");
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "scientific-integrity"] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? "Lỗi cập nhật trích dẫn"),
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!overviewQuery.data || overviewQuery.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
        <p>Không thể tải thông tin gói hồ sơ nộp bài & liêm chính học thuật.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void overviewQuery.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  const overview: ProjectIntegrityOverview = overviewQuery.data;
  const checklist = overview.submissionChecklist;

  const currentMemberCredit = overview.contributions.members.find(m => m.userId === currentUserId);
  const currentAuthorItem = overview.contributions.authors.find(a => a.userId === currentUserId);

  // Filter mentors from access roles
  const mentors = overview.access.roles.filter(r => r.projectRole === "MENTOR");

  function exportManifestBundle() {
    const bundle = {
      projectTitle: overview.projectTitle,
      projectId: overview.projectId,
      exportedAt: new Date().toISOString(),
      disclaimer: "LumiGap Research Package. Note: Direct external submissions (e.g. EasyChair, OpenReview) require manual submission by corresponding author.",
      authorship: overview.contributions.authors.map(a => ({
        order: a.order,
        name: a.name,
        email: a.email,
        isCorresponding: a.isCorresponding,
        creditRoles: a.creditRoles,
        status: a.confirmationStatus,
      })),
      creditRolesSummary: overview.contributions.members.map(m => ({
        name: m.name,
        email: m.email,
        roles: m.creditRoles,
        status: m.confirmationStatus,
      })),
      mentorAcknowledgments: mentors.map(m => ({
        name: m.name,
        email: m.email,
        role: "Research Mentor & Academic Advisor",
        acknowledgmentNote: "We thank the mentor for academic guidance and constructive feedback.",
      })),
      aiTransparency: {
        summary: overview.aiTransparency.declarationSummaryMarkdown,
        declarations: overview.aiTransparency.items,
      },
      citationsSummary: {
        total: overview.citations.totalCount,
        valid: overview.citations.validCount,
        unverified: overview.citations.unverifiedCount,
      },
      submissionChecklist: overview.submissionChecklist,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumigap-submission-package-${projectId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải xuống gói hồ sơ bài báo (JSON Bundle)");
  }

  function copyCreditStatement() {
    const lines = overview.contributions.authors.map(a => {
      const roles = a.creditRoles.join(", ");
      return `**${a.name}**: ${roles || "Contributor"}.`;
    });
    const statement = `### CRediT Authorship Contribution Statement\n\n${lines.join("\n")}\n\nAll authors have reviewed and agreed to the published version of the manuscript.`;
    navigator.clipboard.writeText(statement);
    toast.success("Đã sao chép CRediT Authorship Statement");
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Readiness Checklist */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b">
          <div>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">
                Hồ sơ tác giả & Sẵn sàng nộp bài (Submission Readiness Package)
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Quản lý thứ tự tác giả, vai trò CRediT, ghi nhận cố vấn (Mentors), và khai báo liêm chính học thuật theo chuẩn COPE/ICMJE.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9"
              onClick={exportManifestBundle}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất gói hồ sơ (JSON)
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs h-9"
              onClick={copyCreditStatement}
            >
              <Copy className="h-3.5 w-3.5" />
              Sao chép CRediT Statement
            </Button>
          </div>
        </div>

        {/* Readiness Indicators */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`rounded-lg border p-3 text-xs space-y-1 ${checklist.authorshipReady ? "bg-emerald-500/10 border-emerald-300 dark:border-emerald-800" : "bg-amber-500/10 border-amber-300 dark:border-amber-800"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" /> Tác giả & Thứ tự
              </span>
              {checklist.authorshipReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              {checklist.authorshipWarning ?? "Tất cả tác giả đã đồng thuận thứ tự."}
            </p>
          </div>

          <div className={`rounded-lg border p-3 text-xs space-y-1 ${checklist.aiDeclarationsReady ? "bg-emerald-500/10 border-emerald-300 dark:border-emerald-800" : "bg-amber-500/10 border-amber-300 dark:border-amber-800"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-primary" /> Minh bạch AI
              </span>
              {checklist.aiDeclarationsReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              {checklist.aiWarning ?? `${overview.aiTransparency.manualDeclarationsCount} công cụ đã khai báo.`}
            </p>
          </div>

          <div className={`rounded-lg border p-3 text-xs space-y-1 ${checklist.citationsReady ? "bg-emerald-500/10 border-emerald-300 dark:border-emerald-800" : "bg-amber-500/10 border-amber-300 dark:border-amber-800"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <FileCheck className="h-4 w-4 text-primary" /> Kiểm chứng trích dẫn
              </span>
              {checklist.citationsReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              {checklist.citationsWarning ?? `${overview.citations.validCount}/${overview.citations.totalCount} trích dẫn chuẩn xác.`}
            </p>
          </div>

          <div className={`rounded-lg border p-3 text-xs space-y-1 ${checklist.readyForOfficialSubmission ? "bg-emerald-500/10 border-emerald-300 dark:border-emerald-800" : "bg-blue-500/10 border-blue-300 dark:border-blue-800"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" /> Sẵn sàng nộp bài
              </span>
              {checklist.readyForOfficialSubmission ? (
                <Badge className="bg-emerald-600 text-white text-[10px] h-5">SẴN SÀNG</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] h-5">ĐANG HOÀN TẤT</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              {checklist.readyForOfficialSubmission ? "Hồ sơ đã đầy đủ và đạt chuẩn học thuật." : "Còn các mục cần đối soát trước khi nộp."}
            </p>
          </div>
        </div>

        {/* Ethical Submission Notice */}
        <div className="mt-4 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Lưu ý nộp bài và quyền tác giả học thuật:</p>
            <p className="text-[11px] leading-relaxed">
              1. <strong>Tách biệt cố vấn và tác giả:</strong> Giảng viên và Mentor không tự động được đưa vào danh sách tác giả trừ khi có đóng góp học thuật thực chất được nhóm sinh viên đồng thuận theo chuẩn ICMJE. Sự hướng dẫn của Mentor được ghi nhận trang trọng trong mục <em>Lời cảm ơn (Acknowledgments)</em>.
              <br />
              2. <strong>Quy trình nộp hội nghị:</strong> LumiGap cung cấp hồ sơ bài báo hoàn chỉnh và đã kiểm chứng. LumiGap <em>không tự động nộp bài sang các hội nghị bên ngoài</em> (như EasyChair, OpenReview) nếu không có ủy quyền trực tiếp từ tác giả liên hệ.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border/80 gap-2">
        {[
          { key: "authorship", label: `Danh sách tác giả (${overview.contributions.authors.length})` },
          { key: "credit", label: `Vai trò CRediT (${overview.contributions.members.length})` },
          { key: "mentors", label: `Ghi nhận Cố vấn (${mentors.length})` },
          { key: "ai", label: `Minh bạch AI (${overview.aiTransparency.manualDeclarationsCount})` },
          { key: "citations", label: `Kiểm chứng trích dẫn (${overview.citations.totalCount})` },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveSubTab(tab.key as any)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeSubTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Authorship Registry & Order */}
      {activeSubTab === "authorship" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              Thứ tự tác giả và Xác nhận đồng tác giả (Authorship Order)
            </h4>
            {currentAuthorItem && currentAuthorItem.confirmationStatus === "PENDING" && !readOnly && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                  onClick={() => confirmAuthorshipMutation.mutate({ decision: "CONFIRM" })}
                  disabled={confirmAuthorshipMutation.isPending}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Xác nhận vị trí tác giả của tôi
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 text-rose-600 border-rose-300 hover:bg-rose-50"
                  onClick={() => setShowDisputeDialog("authorship")}
                >
                  <AlertCircle className="h-3.5 w-3.5 mr-1" />
                  Gửi khiếu nại / Ý kiến khác
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-4 w-16">Thứ tự</th>
                  <th className="py-3 px-4">Tác giả</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Vai trò chính</th>
                  <th className="py-3 px-4">Trạng thái xác nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.contributions.authors.map(author => (
                  <tr key={author.userId} className={author.userId === currentUserId ? "bg-primary/5" : undefined}>
                    <td className="py-3 px-4 font-bold text-primary">#{author.order}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{author.name}</span>
                        {author.isCorresponding && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-blue-500/10 text-blue-700 border-blue-200">
                            Tác giả liên hệ
                          </Badge>
                        )}
                        {author.userId === currentUserId && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">Bạn</Badge>
                        )}
                      </div>
                      {author.rationale && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{author.rationale}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{author.email}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {author.creditRoles?.slice(0, 3).map(r => (
                          <Badge key={r} variant="outline" className="text-[10px] py-0 px-1.5">
                            {r}
                          </Badge>
                        ))}
                        {author.creditRoles?.length > 3 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{author.creditRoles.length - 3} vai trò
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {author.confirmationStatus === "CONFIRMED" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-800 border-emerald-300 dark:text-emerald-300 text-[11px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Đã xác nhận
                        </Badge>
                      ) : author.confirmationStatus === "DISPUTED" ? (
                        <Badge className="bg-rose-500/15 text-rose-800 border-rose-300 dark:text-rose-300 text-[11px]">
                          <AlertCircle className="h-3 w-3 mr-1" /> Có khiếu nại
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 text-[11px]">
                          Chờ xác nhận
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 2: CRediT Contributions Matrix */}
      {activeSubTab === "credit" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Phân định vai trò đóng góp CRediT (Contributor Roles Taxonomy)
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chuẩn mực 14 vai trò khoa học để đảm bảo minh bạch, không ai bị lãng quên hoặc nhận vơ công lao.
              </p>
            </div>
            {currentMemberCredit && currentMemberCredit.confirmationStatus === "PENDING" && !readOnly && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                onClick={() => confirmCreditMutation.mutate({ decision: "CONFIRM" })}
                disabled={confirmCreditMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Xác nhận vai trò của tôi
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.contributions.members.map(member => (
              <div
                key={member.userId}
                className={`rounded-xl border p-4 bg-card space-y-3 ${
                  member.userId === currentUserId ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm text-foreground">{member.name}</span>
                    <span className="text-xs text-muted-foreground block">{member.email}</span>
                  </div>
                  {member.confirmationStatus === "CONFIRMED" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-800 border-emerald-300 text-[11px]">
                      Đã xác nhận
                    </Badge>
                  ) : member.confirmationStatus === "DISPUTED" ? (
                    <Badge className="bg-rose-500/15 text-rose-800 border-rose-300 text-[11px]">
                      Đang khiếu nại
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700 border-amber-300 text-[11px]">
                      Chờ xác nhận
                    </Badge>
                  )}
                </div>

                <div>
                  <h5 className="text-[11px] font-semibold uppercase text-muted-foreground mb-1.5">
                    Các vai trò CRediT ({member.creditRoles.length}):
                  </h5>
                  <div className="flex flex-wrap gap-1.5">
                    {member.creditRoles.map(role => (
                      <Badge key={role} variant="secondary" className="text-xs py-0.5 px-2">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>

                {member.externalContribution && (
                  <p className="text-xs text-muted-foreground bg-muted/20 p-2 rounded border">
                    {member.externalContribution}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab 3: Mentor Acknowledgments */}
      {activeSubTab === "mentors" && (
        <section className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-1">
            <h4 className="font-semibold text-sm text-primary flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Nguyên tắc Đạo đức Xuất bản (COPE/ICMJE) về Giảng viên Hướng dẫn
            </h4>
            <p className="text-muted-foreground leading-relaxed">
              Theo quy chuẩn quốc tế, hoạt động hướng dẫn khoa học, góp ý bản thảo, hoặc cung cấp tài nguyên thông thường được ghi nhận trang trọng trong phần <strong>Lời cảm ơn (Acknowledgments)</strong>. Giảng viên chỉ đứng tên đồng tác giả khi trực tiếp tham gia nghiên cứu thực chất và cùng chịu trách nhiệm học thuật về toàn bộ nội dung.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mentors.length === 0 ? (
              <p className="text-xs text-muted-foreground italic col-span-2 py-6 text-center">
                Dự án chưa gán Mentor cố vấn chính thức.
              </p>
            ) : (
              mentors.map(mentor => (
                <div key={mentor.userId} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-foreground">{mentor.name}</span>
                      <span className="text-xs text-muted-foreground block">{mentor.email}</span>
                    </div>
                    <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50/50 text-[11px]">
                      Cố vấn học thuật
                    </Badge>
                  </div>

                  <div className="rounded-lg bg-muted/20 p-3 text-xs space-y-1">
                    <span className="font-medium text-foreground block">Đoạn ghi nhận trong bài báo (Draft Acknowledgment):</span>
                    <p className="italic text-muted-foreground">
                      “We express our sincere gratitude to {mentor.name} for their dedicated guidance, constructive review, and valuable discussions throughout this research.”
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Tab 4: AI Transparency Declarations */}
      {activeSubTab === "ai" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Khai báo sử dụng AI hỗ trợ (AI Transparency & Ethics Disclosure)
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tuân thủ quy định của COPE, Nature, Elsevier, IEEE về minh bạch công cụ sinh ngôn ngữ và lập trình trợ giúp.
              </p>
            </div>
            {!readOnly && (
              <Button size="sm" className="text-xs h-8 gap-1.5" onClick={() => setShowAiModal(true)}>
                <Plus className="h-3.5 w-3.5" />
                Thêm khai báo AI
              </Button>
            )}
          </div>

          {/* AI Declarations List */}
          <div className="space-y-3">
            {overview.aiTransparency.items.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                Chưa có công cụ AI bên ngoài nào được khai báo cho nghiên cứu này.
              </div>
            ) : (
              overview.aiTransparency.items.map(item => (
                <div key={item.id} className="rounded-xl border border-border bg-card p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm text-foreground">{item.toolName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        Mục đích: {item.purpose}
                      </Badge>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive p-1"
                        onClick={() => deleteAiMutation.mutate(item.id)}
                        disabled={deleteAiMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-foreground leading-relaxed">{item.purposeDescription}</p>

                  {(item.humanOversightNote ?? item.verificationNote) && (
                    <div className="rounded bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
                      <strong className="text-foreground block">Kiểm soát con người:</strong>
                      {item.humanOversightNote ?? item.verificationNote}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Tab 5: Citations Integrity */}
      {activeSubTab === "citations" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Đối soát danh mục trích dẫn ({overview.citations.totalCount} tài liệu)
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Kiểm tra tính hợp lệ của BibTeX keys, DOI và đối chiếu với cơ sở dữ liệu học thuật OpenAlex.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-4">Khóa trích dẫn (BibTeX Key)</th>
                  <th className="py-3 px-4">Nhan đề bài báo</th>
                  <th className="py-3 px-4">DOI / Nguồn</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.citations.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground italic">
                      Chưa tìm thấy tệp tài liệu tham khảo (.bib) trong bản thảo LaTeX.
                    </td>
                  </tr>
                ) : (
                  overview.citations.items.map(citation => {
                    const citKey = citation.citationKey ?? citation.key;
                    const citTitle = citation.title ?? citation.bibEntry?.title ?? "Chưa rõ nhan đề";
                    const citDoi = citation.doi ?? citation.bibEntry?.doi ?? "Không có DOI";
                    const citStatus = citation.status ?? (citation.doiStatus === "VALID" ? "VALID" : citation.doiStatus === "NOT_FOUND" ? "BROKEN" : "PENDING");
                    return (
                    <tr key={citKey}>
                      <td className="py-3 px-4 font-mono font-semibold text-primary">{citKey}</td>
                      <td className="py-3 px-4 max-w-xs truncate text-foreground">{citTitle}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">{citDoi}</td>
                      <td className="py-3 px-4">
                        {citStatus === "VALID" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-800 border-emerald-300 text-[10px]">
                            Hợp lệ
                          </Badge>
                        ) : citStatus === "BROKEN" ? (
                          <Badge className="bg-rose-500/15 text-rose-800 border-rose-300 text-[10px]">
                            Lỗi trích dẫn
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 text-[10px]">
                            Chờ kiểm chứng
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!readOnly && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                            onClick={() => verifyCitationMutation.mutate({
                              citationKey: citKey,
                              action: citStatus === "VALID" ? "UNVERIFY" : "VERIFY",
                            })}
                            disabled={verifyCitationMutation.isPending}
                          >
                            {citStatus === "VALID" ? "Hủy xác thực" : "Xác nhận nguồn"}
                          </Button>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: Add AI Declaration */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-foreground">Khai báo công cụ AI sử dụng trong nghiên cứu</h3>
            <p className="text-xs text-muted-foreground">
              Minh bạch công cụ AI (như ChatGPT, Claude, Grammarly, GitHub Copilot) theo hướng dẫn của COPE và ICMJE.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Tên công cụ AI (ví dụ: Claude 3.5 Sonnet, Grammarly)</label>
                <Input
                  className="text-xs h-9"
                  placeholder="Nhập tên công cụ..."
                  value={aiToolName}
                  onChange={e => setAiToolName(e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Mục đích sử dụng chính</label>
                <select
                  className="w-full rounded-md border border-input bg-background p-2 text-xs"
                  value={aiPurpose}
                  onChange={e => setAiPurpose(e.target.value as any)}
                >
                  <option value="LANGUAGE_POLISH">Hiệu đính và trau chuốt ngôn ngữ (Language Polish)</option>
                  <option value="SUMMARY">Tóm tắt và tổng hợp tài liệu (Literature Summary)</option>
                  <option value="CODE_ASSISTANCE">Hỗ trợ viết mã / thuật toán (Code Assistance)</option>
                  <option value="OUTLINE">Gợi ý dàn ý nghiên cứu (Outline)</option>
                  <option value="SEARCH">Tìm kiếm tài liệu sơ bộ (Search)</option>
                  <option value="OTHER">Mục đích khác</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Mô tả cụ thể cách thức sử dụng</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background p-2 text-xs min-h-20"
                  placeholder="Mô tả phạm vi văn bản hoặc mã nguồn mà AI tham gia hỗ trợ..."
                  value={aiDescription}
                  onChange={e => setAiDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Ghi chú về kiểm soát của con người (Human Oversight)</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background p-2 text-xs min-h-16"
                  placeholder="Tác giả đã trực tiếp đọc lại, đối chiếu dữ liệu và chịu toàn bộ trách nhiệm về nội dung..."
                  value={aiHumanOversightNote}
                  onChange={e => setAiHumanOversightNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowAiModal(false)}>Hủy</Button>
              <Button
                size="sm"
                onClick={() => declareAiMutation.mutate({
                  toolName: aiToolName.trim(),
                  purpose: aiPurpose,
                  purposeDescription: aiDescription.trim(),
                  humanOversightVerified: true,
                  humanOversightNote: aiHumanOversightNote.trim() || undefined,
                })}
                disabled={declareAiMutation.isPending || !aiToolName.trim() || !aiDescription.trim()}
              >
                Lưu khai báo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dispute */}
      {showDisputeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-foreground">Gửi ý kiến khiếu nại / Không đồng thuận</h3>
            <p className="text-xs text-muted-foreground">
              Ý kiến của bạn sẽ được ghi nhận vào lịch sử liêm chính của dự án để nhóm cùng thảo luận và giải quyết trước khi nộp bài.
            </p>

            <textarea
              className="w-full rounded-md border border-input bg-background p-3 text-xs min-h-24"
              placeholder="Nêu rõ lý do bạn không đồng thuận với thứ tự tác giả hoặc vai trò CRediT hiện tại..."
              value={disputeNote}
              onChange={e => setDisputeNote(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setShowDisputeDialog(null); setDisputeNote(""); }}>Hủy</Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (showDisputeDialog === "authorship") {
                    confirmAuthorshipMutation.mutate({ decision: "DISPUTE", note: disputeNote.trim() });
                  } else {
                    confirmCreditMutation.mutate({ decision: "DISPUTE", note: disputeNote.trim() });
                  }
                }}
                disabled={!disputeNote.trim()}
              >
                Gửi khiếu nại
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

