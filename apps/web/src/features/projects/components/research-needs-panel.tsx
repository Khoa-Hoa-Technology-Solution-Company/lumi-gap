import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  STUDENT_RESEARCH_CHALLENGES,
  type ResearchSupportNeed,
  type ResearchSupportNeedCategory,
  type ResearchSupportNeedPriority,
  type StudentResearchChallengeId,
} from "@trend/shared-types";
import {
  Check,
  CheckCircle2,
  Compass,
  Edit3,
  FileText,
  Globe,
  Info,
  Loader2,
  Lock,
  Plus,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";

const CATEGORY_LABELS: Record<ResearchSupportNeedCategory, { vi: string; en: string }> = {
  DOMAIN_EXPERTISE: { vi: "Chuyên môn lĩnh vực", en: "Domain expertise" },
  RESEARCH_METHOD: { vi: "Phương pháp nghiên cứu", en: "Research method" },
  TECHNICAL_EXPERTISE: { vi: "Kỹ thuật & hệ thống", en: "Technical expertise" },
  RESEARCH_STAGE: { vi: "Định hướng giai đoạn", en: "Research stage" },
  ACADEMIC_WRITING: { vi: "Viết học thuật", en: "Academic writing" },
  EVALUATION: { vi: "Thiết kế & đánh giá", en: "Evaluation" },
  OTHER: { vi: "Nhu cầu khác", en: "Other" },
};

const PRIORITY_LABELS: Record<ResearchSupportNeedPriority, { vi: string; en: string }> = {
  ESSENTIAL: { vi: "Thiết yếu", en: "Essential" },
  IMPORTANT: { vi: "Quan trọng", en: "Important" },
  OPTIONAL: { vi: "Tùy chọn", en: "Optional" },
};

interface ResearchNeedsPanelProps {
  projectId: string;
  canManage: boolean;
  isSeeking: boolean;
  discoveryMode: string;
  onOpenSettings: () => void;
  onOpenDossier?: () => void;
}

export function ResearchNeedsPanel({
  projectId,
  canManage,
  isSeeking,
  discoveryMode,
  onOpenSettings,
  onOpenDossier,
}: ResearchNeedsPanelProps) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const locale = isVi ? "vi" : "en";
  const userId = useAuthStore(s => s.user?.id);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftNeeds, setDraftNeeds] = useState<ResearchSupportNeed[]>([]);
  const [selectedChallenges, setSelectedChallenges] = useState<StudentResearchChallengeId[]>([]);
  const [extraContext, setExtraContext] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customCategory, setCustomCategory] = useState<ResearchSupportNeedCategory>("DOMAIN_EXPERTISE");
  const [customPriority, setCustomPriority] = useState<ResearchSupportNeedPriority>("IMPORTANT");
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);

  const needsQuery = useQuery({
    queryKey: ["academic-support", userId, "research-needs", projectId, locale],
    queryFn: () => academicSupportApi.researchNeeds(projectId, locale),
    enabled: Boolean(userId && projectId && typeof academicSupportApi.researchNeeds === "function"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!needsQuery.data || dialogOpen) return;
    setDraftNeeds(needsQuery.data.needs);
    setSelectedChallenges(needsQuery.data.selectedChallenges);
  }, [needsQuery.data, dialogOpen]);

  const openAnalysisDialog = () => {
    if (needsQuery.data) {
      setDraftNeeds(needsQuery.data.needs);
      setSelectedChallenges(needsQuery.data.selectedChallenges);
    }
    setAnalysisNote(null);
    setEditingId(null);
    setAddingCustom(false);
    setDialogOpen(true);
  };

  const analyzeMutation = useMutation({
    mutationFn: (preferAi: boolean) =>
      academicSupportApi.analyzeResearchNeeds(projectId, {
        challenges: selectedChallenges,
        ...(extraContext.trim() ? { extraContext: extraContext.trim() } : {}),
        preferAi,
        locale,
      }),
    onSuccess: result => {
      setDraftNeeds(result.needs);
      setSelectedChallenges(result.selectedChallenges);
      setAnalysisNote(
        result.fallbackReason
          ?? (result.mode === "AI_ASSISTED"
            ? (isVi
                ? "Đã gợi ý nhu cầu bằng AI từ ngữ cảnh dự án. Hãy xác nhận, chỉnh sửa hoặc bỏ qua từng mục."
                : "AI suggested needs from your project context. Confirm, edit, or dismiss each item.")
            : (isVi
                ? "Đã phân tích nhu cầu dựa trên thông tin đề tài và giai đoạn nghiên cứu hiện có."
                : "Analyzed support needs from your current project metadata and stage.")),
      );
    },
    onError: () => {
      toast.error(isVi ? "Không thể phân tích nhu cầu lúc này. Vui lòng thử lại." : "Could not analyze research needs right now.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      academicSupportApi.saveResearchNeeds(projectId, {
        needs: draftNeeds,
        selectedChallenges,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["academic-support"] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
      ]);
      toast.success(isVi ? "Đã lưu nhu cầu hướng dẫn và cập nhật danh sách đề xuất giảng viên." : "Saved confirmed research needs and refreshed lecturer recommendations.");
      setDialogOpen(false);
    },
    onError: () => {
      toast.error(isVi ? "Không thể lưu nhu cầu hướng dẫn. Vui lòng thử lại." : "Could not save research needs. Please try again.");
    },
  });

  const visibleNeeds = (needsQuery.data?.needs ?? []).filter(n => n.status !== "DISMISSED");
  const confirmedCount = visibleNeeds.filter(n => n.status === "CONFIRMED").length;
  const suggestedCount = visibleNeeds.filter(n => n.status === "SUGGESTED").length;

  const toggleChallenge = (id: StudentResearchChallengeId) => {
    setSelectedChallenges(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const setNeedStatus = (id: string, status: ResearchSupportNeed["status"]) => {
    setDraftNeeds(prev => prev.map(n => (n.id === id ? { ...n, status } : n)));
  };

  const updateNeedField = (id: string, patch: Partial<ResearchSupportNeed>) => {
    setDraftNeeds(prev => prev.map(n => (n.id === id ? { ...n, ...patch } : n)));
  };

  const addCustomNeed = () => {
    const title = customTitle.trim();
    if (title.length < 2) return;
    const newNeed: ResearchSupportNeed = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      title,
      description: customDesc.trim() || title,
      category: customCategory,
      priority: customPriority,
      taxonomyNodeIds: [],
      relatedTerms: [title],
      rationale: isVi ? "Nhu cầu do nhóm nghiên cứu tự bổ sung." : "Added directly by the research team.",
      source: "GROUP_DECLARED",
      status: "CONFIRMED",
      updatedAt: new Date().toISOString(),
    };
    setDraftNeeds(prev => [newNeed, ...prev]);
    setCustomTitle("");
    setCustomDesc("");
    setAddingCustom(false);
  };

  const statusOriginText = confirmedCount > 0
    ? (isVi ? `Nhóm đã xác nhận ${confirmedCount} nhu cầu` : `${confirmedCount} confirmed by team`)
    : suggestedCount > 0
      ? (isVi ? "Được đề xuất dựa trên chủ đề và giai đoạn nghiên cứu hiện tại" : "Suggested from current research topic and stage")
      : (isVi ? "Chưa xác định nhu cầu hướng dẫn cụ thể" : "No specific mentoring needs configured yet");

  return (
    <>
      <section className="mentor-needs-strip" aria-label={isVi ? "Nhu cầu hướng dẫn của nhóm" : "Research Support Needs"}>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/90 inline-flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
              <span>{isVi ? "Nhu cầu hướng dẫn của nhóm" : "Team Research Needs"}</span>
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help" tabIndex={0}>
                  <Badge
                    variant="secondary"
                    className={`gap-1.5 px-2 py-0.5 text-[11px] font-medium border ${
                      isSeeking
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                        : "bg-background text-muted-foreground border-border"
                    }`}
                    data-mode={discoveryMode}
                  >
                    {isSeeking ? <Globe className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />}
                    <span>{isSeeking ? (isVi ? "Đang mở tìm cố vấn" : "Seeking Mentor") : (isVi ? "Chỉ mời trực tiếp" : "Direct invitations only")}</span>
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs leading-relaxed">
                {isSeeking
                  ? t("Verified lecturers can discover your shared project preview.")
                  : t("Only lecturers you invite will see this preview. Project discovery is off.")}
              </TooltipContent>
            </Tooltip>
            <span className="text-[11px] text-muted-foreground">{statusOriginText}</span>
          </div>

          {visibleNeeds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleNeeds.slice(0, 5).map(need => (
                <span
                  key={need.id}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium ${
                    need.status === "CONFIRMED"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/80 bg-background text-foreground/85"
                  }`}
                >
                  {need.status === "CONFIRMED" ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="max-w-[220px] truncate">{need.title}</span>
                </span>
              ))}
              {visibleNeeds.length > 5 && (
                <span className="text-[11px] font-medium text-muted-foreground">+{visibleNeeds.length - 5}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isVi
                ? "Phân tích nhu cầu nghiên cứu giúp sinh viên xác định rõ chuyên môn và phương pháp cần cố vấn hỗ trợ."
                : "Analyze your research context to identify what expertise and methodological guidance your team needs."}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button type="button" size="sm" variant="default" className="h-8 gap-1.5 px-2.5 text-xs font-medium" onClick={openAnalysisDialog}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {confirmedCount > 0
                ? (isVi ? "Xem phân tích" : "View analysis")
                : (isVi ? "Phân tích & xác nhận nhu cầu" : "Analyze & confirm needs")}
            </span>
          </Button>
          {canManage && onOpenDossier && (
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={onOpenDossier}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isVi ? "Hồ sơ nhóm" : "Team dossier"}</span>
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs font-medium" onClick={onOpenSettings}>
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{canManage ? (isVi ? "Cài đặt tìm cố vấn" : "Discovery settings") : (isVi ? "Quyền chia sẻ" : "My consent")}</span>
          </Button>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n>
          <DialogHeader className="text-left space-y-1.5">
            <DialogTitle className="text-base font-semibold">
              {isVi ? "Phân tích nhu cầu hướng dẫn" : "Research Needs Analysis"}
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              {isVi
                ? "Hệ thống gợi ý các nội dung chuyên môn và phương pháp có thể cần cố vấn hỗ trợ. Nhóm toàn quyền xác nhận, chỉnh sửa hoặc bỏ qua trước khi áp dụng."
                : "Suggested expertise and methodological support needs based on your project context. Confirm, edit, or dismiss items before applying."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Beginner-friendly challenge helper ("Nhóm đang gặp khó khăn ở đâu?") */}
            <section className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5">
              <div className="space-y-0.5">
                <h4 className="text-xs font-semibold text-foreground">
                  {isVi ? "Nhóm đang gặp khó khăn ở đâu? (không bắt buộc)" : "Where is your team stuck right now? (optional)"}
                </h4>
                <p className="text-[11.5px] text-muted-foreground">
                  {isVi
                    ? "Chọn một hoặc nhiều tình huống gần nhất để hệ thống đề xuất nhu cầu hướng dẫn dễ hiểu hơn."
                    : "Select any challenges that apply so recommendations reflect your current stage."}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STUDENT_RESEARCH_CHALLENGES.map(item => {
                  const active = selectedChallenges.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleChallenge(item.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/80 bg-background text-foreground/85 hover:bg-muted/50"
                      }`}
                    >
                      {active && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      <span>{isVi ? item.labelVi : item.labelEn}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Input
                  value={extraContext}
                  onChange={e => setExtraContext(e.target.value)}
                  maxLength={500}
                  placeholder={isVi ? "Mô tả thêm ngắn gọn (tùy chọn): VD: nhóm làm hệ thống tìm research gap bằng LLM..." : "Optional short note about your research topic or question..."}
                  className="h-8.5 text-xs bg-background"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8.5 shrink-0 gap-1.5 text-xs"
                  disabled={analyzeMutation.isPending}
                  onClick={() => analyzeMutation.mutate(true)}
                >
                  {analyzeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>{isVi ? "Phân tích lại nhu cầu" : "Analyze needs"}</span>
                </Button>
              </div>
            </section>

            {analysisNote && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-2 text-xs text-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
                <span>{analysisNote}</span>
              </div>
            )}

            {Boolean(needsQuery.data?.missingContextHints.length) && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                {needsQuery.data!.missingContextHints.map((hint, idx) => (
                  <p key={idx}>• {hint}</p>
                ))}
              </div>
            )}

            {/* Structured Research Needs List with Confirm / Edit / Dismiss */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isVi ? `Danh sách nhu cầu (${draftNeeds.filter(n => n.status !== "DISMISSED").length})` : `Support Needs (${draftNeeds.filter(n => n.status !== "DISMISSED").length})`}
                </h4>
                {canManage && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setAddingCustom(v => !v)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isVi ? "Thêm nhu cầu khác" : "Add custom need"}</span>
                  </Button>
                )}
              </div>

              {addingCustom && (
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{isVi ? "Tên nhu cầu" : "Need title"}</Label>
                      <Input value={customTitle} onChange={e => setCustomTitle(e.target.value)} maxLength={140} className="h-8 text-xs bg-background" placeholder={isVi ? "VD: Phân tích thống kê định lượng" : "e.g. Quantitative statistical analysis"} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{isVi ? "Nhóm" : "Category"}</Label>
                        <select value={customCategory} onChange={e => setCustomCategory(e.target.value as ResearchSupportNeedCategory)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                          {(Object.keys(CATEGORY_LABELS) as ResearchSupportNeedCategory[]).map(cat => (
                            <option key={cat} value={cat}>{isVi ? CATEGORY_LABELS[cat].vi : CATEGORY_LABELS[cat].en}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{isVi ? "Mức ưu tiên" : "Priority"}</Label>
                        <select value={customPriority} onChange={e => setCustomPriority(e.target.value as ResearchSupportNeedPriority)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                          {(Object.keys(PRIORITY_LABELS) as ResearchSupportNeedPriority[]).map(pr => (
                            <option key={pr} value={pr}>{isVi ? PRIORITY_LABELS[pr].vi : PRIORITY_LABELS[pr].en}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <Input value={customDesc} onChange={e => setCustomDesc(e.target.value)} maxLength={400} className="h-8 text-xs bg-background" placeholder={isVi ? "Mô tả ngắn nội dung mong muốn cố vấn hỗ trợ" : "Short description of what guidance you need"} />
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingCustom(false)}>{t("Cancel")}</Button>
                    <Button type="button" size="sm" className="h-7 text-xs" disabled={customTitle.trim().length < 2} onClick={addCustomNeed}>{isVi ? "Thêm vào danh sách" : "Add need"}</Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {draftNeeds.filter(n => n.status !== "DISMISSED").map(need => {
                  const isEditing = editingId === need.id;
                  return (
                    <article
                      key={need.id}
                      className={`rounded-xl border p-3 space-y-2 transition-colors ${
                        need.status === "CONFIRMED"
                          ? "border-primary/35 bg-primary/[0.03]"
                          : "border-border/80 bg-card"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          {isEditing ? (
                            <div className="space-y-2">
                              <Input
                                value={need.title}
                                onChange={e => updateNeedField(need.id, { title: e.target.value })}
                                className="h-8 text-xs font-semibold"
                              />
                              <textarea
                                rows={2}
                                value={need.description}
                                onChange={e => updateNeedField(need.id, { description: e.target.value })}
                                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h5 className="text-sm font-semibold text-foreground">{need.title}</h5>
                                <Badge variant="outline" className="text-[10.5px] font-medium">
                                  {isVi ? CATEGORY_LABELS[need.category].vi : CATEGORY_LABELS[need.category].en}
                                </Badge>
                                <Badge variant="secondary" className="text-[10.5px] font-medium">
                                  {isVi ? PRIORITY_LABELS[need.priority].vi : PRIORITY_LABELS[need.priority].en}
                                </Badge>
                                <span className={`text-[10.5px] font-semibold ${need.status === "CONFIRMED" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                  {need.status === "CONFIRMED"
                                    ? (isVi ? "· Đã xác nhận" : "· Confirmed")
                                    : (isVi ? "· Gợi ý" : "· Suggested")}
                                </span>
                              </div>
                              <p className="text-xs leading-5 text-foreground/85">{need.description}</p>
                              <p className="text-[11.5px] leading-5 text-muted-foreground">
                                <strong className="font-medium text-foreground/80">{isVi ? "Lý do gợi ý:" : "Why suggested:"}</strong>{" "}
                                {need.rationale}
                              </p>
                              {need.plainExplanation && need.plainExplanation !== need.description && (
                                <p className="text-[11.5px] leading-5 text-muted-foreground italic">{need.plainExplanation}</p>
                              )}
                            </>
                          )}
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-1 shrink-0">
                            {need.status !== "CONFIRMED" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => setNeedStatus(need.id, "CONFIRMED")}
                              >
                                <Check className="h-3 w-3" aria-hidden="true" />
                                <span>{isVi ? "Xác nhận" : "Confirm"}</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-emerald-700 dark:text-emerald-400"
                                onClick={() => setNeedStatus(need.id, "SUGGESTED")}
                              >
                                {isVi ? "Đã xác nhận" : "Confirmed"}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground"
                              aria-label={isVi ? "Chỉnh sửa nhu cầu" : "Edit need"}
                              onClick={() => setEditingId(isEditing ? null : need.id)}
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              aria-label={isVi ? "Bỏ qua nhu cầu" : "Dismiss need"}
                              onClick={() => setNeedStatus(need.id, "DISMISSED")}
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <p className="flex items-start gap-1.5 text-[11.5px] leading-5 text-muted-foreground border-t border-border/70 pt-3">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {isVi
                  ? "Xác nhận nhu cầu chỉ giúp cải thiện đề xuất cố vấn học thuật — hệ thống không tự ý thay đổi Kế hoạch nghiên cứu (Research Plan), phương pháp chính thức hay gửi lời mời."
                  : "Confirming support needs only guides mentor recommendations — it never modifies your official Research Plan, classification, or sends invitations."}
              </span>
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                {t("Close")}
              </Button>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  <span>{isVi ? "Lưu nhu cầu & cập nhật đề xuất" : "Save needs & update recommendations"}</span>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
