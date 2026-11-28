import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AvailableMentor, MentorNeedRelationship, ValidatedMentorAiExplanation } from "@trend/shared-types";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Info,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { academicSupportApi } from "../api/academic-support.api";
import { ApplicantEvidence } from "./mentorship-applicants";
import "../mentor-discovery.css";

function initials(name?: string) {
  const parts = (name ?? "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "GV";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function relationshipBadgeStyle(rel: MentorNeedRelationship): string {
  switch (rel) {
    case "LECTURER_CONFIRMED":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "RELATED_EVIDENCE":
      return "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "DECLARED_SUPPORT":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300";
    case "NEEDS_DISCUSSION":
      return "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted/60 text-muted-foreground";
  }
}

export function MentorMatchEvidenceDialog({
  projectId,
  mentor,
  onClose,
  onInvite,
  canInvite,
}: {
  projectId: string;
  mentor: AvailableMentor;
  onClose: () => void;
  onInvite?: (mentor: AvailableMentor) => void;
  canInvite?: boolean;
}) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const locale = isVi ? "vi" : "en";
  const userId = useAuthStore(state => state.user?.id);
  const [aiExplanation, setAiExplanation] = useState<ValidatedMentorAiExplanation | null>(null);

  const evidence = useQuery({
    queryKey: ["academic-support", userId, "mentor-evidence", projectId, mentor._id],
    queryFn: () => academicSupportApi.mentorEvidence(projectId, mentor._id),
    retry: false,
  });

  const explainMutation = useMutation({
    mutationFn: () => academicSupportApi.explainMentor(projectId, mentor._id, locale),
    onSuccess: data => setAiExplanation(data),
  });

  const isDemo = Boolean(mentor.isDemo || /\bdemo\b/i.test(mentor.fullName ?? ""));
  const rec = evidence.data?.recommendation ?? mentor.recommendation;
  const eligibility = rec?.eligibility;
  const isCapacityReached = Boolean(eligibility?.currentAvailability === "CAPACITY_REACHED" || mentor.capacityReached);
  const effectiveCanInvite = Boolean(canInvite && onInvite && !mentor.mentorshipStatus && !isCapacityReached && (eligibility?.canInvite ?? true));

  const availabilityLabel = eligibility?.currentAvailability === "CAPACITY_REACHED"
    ? (isVi ? `Đã đủ chỉ tiêu (${eligibility.activeProjectCount}/${eligibility.maxActiveProjects})` : `Capacity reached (${eligibility.activeProjectCount}/${eligibility.maxActiveProjects})`)
    : eligibility?.currentAvailability === "PENDING_REQUEST"
      ? (isVi ? "Đang có lời mời/đề nghị chờ phản hồi" : "Pending request")
      : eligibility?.currentAvailability === "ACTIVE_MENTOR"
        ? (isVi ? "Đang hướng dẫn nhóm" : "Active mentor")
        : eligibility?.remainingSlots !== null && eligibility?.remainingSlots !== undefined
          ? (isVi ? `Đang nhận nhóm mới (còn ${eligibility.remainingSlots} suất)` : `Accepting new teams (${eligibility.remainingSlots} slots left)`)
          : (isVi ? "Đang nhận nhóm mới" : "Accepting new teams");

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="mentor-evidence-dialog max-h-[88dvh] overflow-hidden p-0 sm:max-w-2xl sm:p-0" data-no-i18n>
        {/* A. Lecturer Identity & Availability */}
        <DialogHeader className="mentor-evidence-dialog-header text-left">
          <div className="mentor-evidence-dialog-identity">
            <div className="mentor-evidence-dialog-avatar" aria-hidden="true">
              {mentor.avatarUrl ? (
                <img src={mentor.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initials(mentor.fullName)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold leading-snug text-foreground">
                  {isVi ? "Phân tích đề xuất hướng dẫn" : "Recommendation Analysis"}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={`text-[11px] font-medium ${
                    isCapacityReached
                      ? "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {availabilityLabel}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-foreground font-medium">
                <span>{mentor.fullName}</span>
                {mentor.verifiedLecturer && !isDemo && (
                  <BadgeCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                )}
                {isDemo && (
                  <Badge variant="outline" className="text-[10.5px] font-medium">
                    {t("supervisor.demo")}
                  </Badge>
                )}
              </div>
              {(mentor.positionTitle || mentor.institutionName) && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {[mentor.positionTitle, mentor.institutionName].filter(Boolean).join(" · ")}
                  </span>
                </p>
              )}
              <DialogDescription className={rec ? "sr-only" : "text-xs leading-5 text-muted-foreground"}>
                {rec
                  ? (isVi ? "Phân tích căn cứ học thuật và phạm vi hỗ trợ của giảng viên đối với nhu cầu nghiên cứu hiện tại." : "Evidence-based analysis of how this lecturer relates to your current research needs.")
                  : t("Review declared expertise and available publication evidence before inviting a mentor.")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mentor-evidence-dialog-body space-y-4">
          {evidence.isPending ? (
            <div role="status" className="space-y-3 py-2" aria-label={t("Loading…")}>
              <span className="sr-only">{t("Loading…")}</span>
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : evidence.data && rec ? (
            <>
              {/* B. Recommendation Summary + Optional On-Demand Validated AI Explanation */}
              <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span>{isVi ? "Tóm tắt đề xuất" : "Recommendation Summary"}</span>
                  </h4>
                  {evidence.data.canGenerateAiExplanation && !aiExplanation && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-[11.5px]"
                      disabled={explainMutation.isPending}
                      onClick={() => explainMutation.mutate()}
                    >
                      {explainMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
                      )}
                      <span>{isVi ? "Diễn giải chi tiết bằng AI" : "Generate AI explanation"}</span>
                    </Button>
                  )}
                </div>

                <p className="text-sm leading-6 text-foreground">
                  {aiExplanation ? aiExplanation.summary : rec.summary}
                </p>

                {rec.complementaryNote && (
                  <p className="rounded-lg border border-blue-500/25 bg-blue-500/[0.06] px-2.5 py-1.5 text-xs text-blue-900 dark:text-blue-200">
                    {rec.complementaryNote}
                  </p>
                )}

                {aiExplanation && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                      {aiExplanation.source === "AI_VALIDATED"
                        ? (isVi ? "Diễn giải do AI tổng hợp từ căn cứ hệ thống đã kiểm định — không phải đánh giá độc lập về giảng viên." : "AI-generated explanation validated against stored evidence — not an independent assessment.")
                        : (aiExplanation.fallbackReason ?? (isVi ? "Hiển thị diễn giải chuẩn hóa từ dữ liệu hệ thống." : "Showing deterministic system explanation."))}
                    </span>
                  </p>
                )}
              </section>

              {/* C. Research Needs Coverage Table (Neutral — Never Pass/Fail Grades) */}
              {rec.needs.length > 0 && (
                <section className="rounded-xl border border-border/80 bg-card overflow-hidden">
                  <div className="border-b border-border/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                      <span>{isVi ? "Mức độ liên quan theo từng nhu cầu nghiên cứu" : "Research Needs Coverage"}</span>
                    </h4>
                  </div>
                  <div className="divide-y divide-border/60">
                    {rec.needs.map(item => (
                      <div key={item.needId} className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">{item.needTitle}</p>
                          <p className="text-xs leading-5 text-muted-foreground">{item.explanation}</p>
                        </div>
                        <Badge variant="outline" className={`shrink-0 self-start text-[11px] font-medium ${relationshipBadgeStyle(item.relationship)}`}>
                          {item.evidenceLabel}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* D. Supporting Academic Evidence (Publications + Declared Expertise) */}
              <section className="rounded-xl border border-border/80 bg-card p-3.5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                  <span>{isVi ? "Căn cứ học thuật hỗ trợ" : "Supporting Academic Evidence"}</span>
                </h4>

                {/* Publications with Scope & Attribution Provenance */}
                {evidence.data.publications.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11.5px] font-medium text-muted-foreground">
                      {isVi ? `Công trình liên quan (${evidence.data.publications.length})` : `Related Publications (${evidence.data.publications.length})`}
                    </p>
                    <ul className="space-y-2">
                      {evidence.data.publications.map((pub, idx) => (
                        <li key={pub.paperId ?? idx} className="rounded-lg border border-border/75 bg-muted/15 p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            {pub.href ? (
                              <a href={pub.href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline inline-flex items-start gap-1 leading-5">
                                <span>{pub.title}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 mt-1" aria-hidden="true" />
                              </a>
                            ) : (
                              <p className="text-xs font-semibold text-foreground leading-5">{pub.title}</p>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {[
                              pub.authors?.length ? pub.authors.slice(0, 3).join(", ") : undefined,
                              pub.year,
                              pub.venue,
                              pub.attribution === "LINKED_IDENTITY"
                                ? (isVi ? "Liên kết qua định danh học thuật" : "Linked via academic identity")
                                : pub.attribution === "UNCERTAIN_ATTRIBUTION"
                                  ? (isVi ? "Quyền tác giả chưa xác thực" : "Unverified attribution")
                                  : (isVi ? "Công trình tự khai báo" : "Self-declared work"),
                            ].filter(Boolean).join(" · ")}
                          </p>
                          {pub.explanation && (
                            <p className="text-[11.5px] text-foreground/85">{pub.explanation}</p>
                          )}
                          {pub.evidenceExcerpt && (
                            <blockquote className="border-l-2 border-primary/40 pl-2.5 text-[11.5px] leading-5 text-muted-foreground italic">
                              “{pub.evidenceExcerpt}”
                            </blockquote>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isVi
                      ? "Chưa tìm thấy công trình đồng bộ trực tiếp trong dữ liệu hiện có (thiếu dữ liệu công bố không đồng nghĩa với thiếu chuyên môn)."
                      : "No synchronized publications matched in local records (missing publication data does not indicate lack of expertise)."}
                  </p>
                )}

                {/* Declared Expertise & Support Highlights */}
                {evidence.data.evidenceItems?.filter(ev => ev.source === "PROFILE_DECLARATION" || ev.source === "MENTORING_PREFERENCE" || ev.source === "PLATFORM_RECORDED_ACTIVITY").length ? (
                  <div className="space-y-1.5 pt-2 border-t border-border/60">
                    <p className="text-[11.5px] font-medium text-muted-foreground">
                      {isVi ? "Chuyên môn & phạm vi hỗ trợ khai báo" : "Declared Expertise & Mentoring Support"}
                    </p>
                    <ul className="space-y-1.5">
                      {evidence.data.evidenceItems
                        .filter(ev => ev.source === "PROFILE_DECLARATION" || ev.source === "MENTORING_PREFERENCE" || ev.source === "PLATFORM_RECORDED_ACTIVITY")
                        .slice(0, 6)
                        .map(ev => (
                          <li key={ev.id} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                            <span className="font-medium text-foreground">{ev.detail}</span>
                            <span className="text-[11px] text-muted-foreground">{ev.label}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </section>

              {/* E. Important Uncertainties (Specific & Non-Repetitive) */}
              {rec.uncertainties.length > 0 && (
                <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3.5 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{isVi ? "Điểm chưa rõ cần lưu ý" : "Important Uncertainties"}</span>
                  </h4>
                  <ul className="space-y-1 text-xs leading-5 text-foreground/85">
                    {rec.uncertainties.map(u => (
                      <li key={u.code}>• {u.message}</li>
                    ))}
                  </ul>
                </section>
              )}

              {/* F. Suggested Discussion Questions */}
              {(aiExplanation?.discussionQuestions.length || rec.suggestedDiscussionTopics.length) > 0 && (
                <section className="rounded-xl border border-border/80 bg-muted/15 p-3.5 space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/90 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                    <span>{isVi ? "Gợi ý câu hỏi nên trao đổi với giảng viên" : "Suggested Questions to Discuss"}</span>
                  </h4>
                  <ul className="space-y-1 text-xs leading-5 text-foreground/85">
                    {(aiExplanation?.discussionQuestions ?? rec.suggestedDiscussionTopics).map((q, idx) => (
                      <li key={idx}>• {q}</li>
                    ))}
                  </ul>
                </section>
              )}

              {/* G. Expandable Provenance & Methodology Details */}
              <details className="group rounded-xl border border-border/75 bg-card overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isVi ? "Nguồn thông tin & phương pháp đề xuất" : "Evidence provenance & methodology"}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-border/60 px-3.5 py-3 space-y-2 text-[11.5px] leading-5 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">{isVi ? "Tín hiệu hiện có:" : "Available signals:"}</strong>{" "}
                    {rec.evidenceCoverage.availableSignals.join(" · ") || (isVi ? "Hạn chế" : "Limited")}
                  </p>
                  {rec.evidenceCoverage.missingSignals.length > 0 && (
                    <p>
                      <strong className="text-foreground">{isVi ? "Tín hiệu chưa có dữ liệu:" : "Missing signals:"}</strong>{" "}
                      {rec.evidenceCoverage.missingSignals.join(" · ")}
                    </p>
                  )}
                  <p>
                    <strong className="text-foreground">{isVi ? "Chế độ đối chiếu:" : "Retrieval mode:"}</strong>{" "}
                    {rec.retrievalMode === "HYBRID_SEMANTIC"
                      ? (isVi ? "Kết hợp ngữ nghĩa, phân loại học thuật và căn cứ công trình" : "Hybrid semantic, taxonomy & publication evidence")
                      : (isVi ? "Kết hợp phân loại học thuật, từ khóa và căn cứ công trình" : "Hybrid taxonomy, lexical & publication evidence")}
                    {" · "}
                    <span className="font-mono text-[10.5px]">{rec.rankingConfigVersion}</span>
                  </p>
                  <p>
                    {isVi
                      ? "Đề xuất chỉ hỗ trợ sinh viên tìm hiểu giảng viên phù hợp với nhu cầu đề tài — không phải chứng nhận chất lượng hướng dẫn hay đánh giá năng lực cá nhân. Hai bên cần trao đổi và đồng thuận phạm vi hướng dẫn."
                      : "Recommendations help students explore relevant lecturers — they are not certifications of mentoring quality. Both sides confirm actual mentoring scope through mutual consent."}
                  </p>
                </div>
              </details>

              {/* H. Contextual Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-3">
                <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                  <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>
                    <span>{t("View profile")}</span>
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
                {effectiveCanInvite && (
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      onClose();
                      onInvite?.(mentor);
                    }}
                  >
                    {t("supervisor.invite")}
                  </Button>
                )}
              </div>
            </>
          ) : evidence.data ? (
            <ApplicantEvidence evidence={evidence.data} />
          ) : (
            <div role="alert" className="mentor-evidence-error-box">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-2.5">
                <p className="text-sm text-foreground">
                  {t("Matching evidence is unavailable or this lecturer is no longer eligible.")}
                </p>
                <Button size="sm" variant="outline" onClick={() => void evidence.refetch()}>
                  {t("Try again")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
