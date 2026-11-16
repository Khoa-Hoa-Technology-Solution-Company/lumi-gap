import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, BadgeCheck, Building2, Info, Sparkles, UserCheck } from "lucide-react";
import { toast } from "sonner";
import type { MentorProjectPreview } from "@trend/shared-types";
import { academicSupportApi, type MentorPreview } from "@/features/projects/api/academic-support.api";
import { mentorshipError } from "@/features/projects/components/mentoring-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

export type SuggestMentorTarget = {
  _id: string;
  fullName?: string;
  avatarUrl?: string;
  positionTitle?: string;
  institutionName?: string;
  verifiedLecturer?: boolean;
  acceptingMentorships?: boolean;
  expertiseAreas?: string[];
  researchInterests?: string[];
  matchedTerms?: string[];
  sameInstitution?: boolean;
};

interface SuggestMentorDialogProps {
  project: MentorPreview | MentorProjectPreview;
  mentor: SuggestMentorTarget;
  onClose: () => void;
  onSubmitted?: (lecturerName: string) => void;
}

export function SuggestMentorDialog({ project, mentor, onClose, onSubmitted }: SuggestMentorDialogProps) {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const submitLock = useRef(false);

  const trimmedMessage = message.trim();
  const lecturerName = mentor.fullName || "Giảng viên";
  const isVerified = Boolean(mentor.verifiedLecturer && !mentor.fullName?.includes("Demo"));
  const expertise = mentor.expertiseAreas ?? [];
  const interests = (mentor.researchInterests ?? []).filter(
    term => !expertise.some(area => area.toLocaleLowerCase() === term.toLocaleLowerCase()),
  );
  const matchedTerms = mentor.matchedTerms ?? [];
  const projectTopics = [...new Set([...(project.researchAreas ?? []), ...(project.expertise ?? [])])];

  const mutation = useMutation({
    mutationFn: () => academicSupportApi.suggest(project.id, mentor._id, trimmedMessage),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["academic-support"] });
      toast.success("Đã gửi đề xuất đến chủ dự án. Giảng viên chưa nhận được lời mời.");
      onSubmitted?.(lecturerName);
      onClose();
    },
  });

  const handleSubmit = async () => {
    if (submitLock.current || mutation.isPending) return;
    if (!trimmedMessage) {
      setValidationError("Vui lòng nhập lý do đề xuất giảng viên này (1–1.000 ký tự).");
      return;
    }
    if (trimmedMessage.length > 1000) {
      setValidationError("Lý do đề xuất tối đa 1.000 ký tự.");
      return;
    }
    setValidationError(null);
    submitLock.current = true;
    try {
      await mutation.mutateAsync();
    } catch {
      /* Preserve entered reason for user retry. */
    } finally {
      submitLock.current = false;
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n>
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="break-words leading-snug">
            Đề xuất cố vấn · {lecturerName}
          </DialogTitle>
          <DialogDescription>
            Gửi đề xuất nội bộ để chủ dự án xem xét. Giảng viên chưa nhận được lời mời hay thông báo ở bước này.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section A: Lecturer Profile */}
          <section aria-label="Hồ sơ giảng viên" className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="mentor-composer-recipient-avatar shrink-0" aria-hidden="true">
                {mentor.avatarUrl ? (
                  <img src={mentor.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  lecturerName.slice(0, 2).toUpperCase() || "?"
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-sm text-foreground">{lecturerName}</span>
                    {isVerified && (
                      <BadgeCheck size={16} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                    )}
                    {mentor.acceptingMentorships !== false && (
                      <Badge variant="secondary" className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                        <UserCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                        Đang nhận hướng dẫn
                      </Badge>
                    )}
                  </div>
                  <Link
                    target="_blank"
                    rel="noopener noreferrer"
                    to={`/academics/${encodeURIComponent(mentor._id)}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    <span>Xem hồ sơ giảng viên</span>
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>

                {(mentor.positionTitle || mentor.institutionName) && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{[mentor.positionTitle, mentor.institutionName].filter(Boolean).join(" · ")}</span>
                  </p>
                )}

                {expertise.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {expertise.slice(0, 6).map(area => (
                      <span key={area} className="mentor-tag-neutral">{area}</span>
                    ))}
                    {expertise.length > 6 && (
                      <span className="mentor-tag-more">+{expertise.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Section B: Read-only Project Context */}
          <section aria-label="Bối cảnh dự án" className="rounded-xl border border-border/70 bg-card p-3.5 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bối cảnh dự án</p>
            <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">{project.title}</p>
            {project.researchField && (
              <p className="text-xs text-muted-foreground">Lĩnh vực chính: {project.researchField}</p>
            )}
            {projectTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {projectTopics.map(topic => (
                  <Badge key={topic} variant="outline" className="text-[11px] font-normal">
                    {topic}
                  </Badge>
                ))}
              </div>
            )}
          </section>

          {/* Section C: Verified Matching Evidence */}
          <section aria-label="Vì sao giảng viên này có thể phù hợp?" className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Vì sao giảng viên này có thể phù hợp?</span>
            </div>
            {matchedTerms.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Chủ đề trùng khớp với đề tài nhóm:</p>
                <div className="flex flex-wrap gap-1.5">
                  {matchedTerms.map(term => (
                    <span key={term} className="mentor-tag-matched">{term}</span>
                  ))}
                </div>
              </div>
            ) : interests.length > 0 || expertise.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Hướng nghiên cứu & chuyên môn công khai: {[...expertise, ...interests].slice(0, 5).join(" · ")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Giảng viên đã xác minh học thuật và đang bật trạng thái sẵn sàng nhận hướng dẫn nhóm mới.
              </p>
            )}
            {mentor.sameInstitution && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Cùng đơn vị công tác với chủ dự án.</span>
              </p>
            )}
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Đây là gợi ý đối chiếu từ hồ sơ công khai, không phải cam kết giảng viên sẽ nhận hướng dẫn.</span>
            </p>
          </section>

          {/* Section D: Required Reason Field */}
          <div className="space-y-2">
            <label htmlFor={`suggest-reason-${mentor._id}`} className="block text-sm font-medium text-foreground">
              Vì sao bạn đề xuất giảng viên này? <span className="text-destructive">*</span>
            </label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Nêu rõ chuyên môn, phương pháp hoặc kinh nghiệm của giảng viên phù hợp với mục tiêu hoặc vấn đề nghiên cứu nào của nhóm.
            </p>
            <textarea
              id={`suggest-reason-${mentor._id}`}
              aria-label="Vì sao bạn đề xuất giảng viên này?"
              autoFocus
              rows={4}
              maxLength={1000}
              disabled={mutation.isPending}
              value={message}
              onChange={e => {
                setMessage(e.target.value);
                if (validationError) setValidationError(null);
                if (mutation.isError) mutation.reset();
              }}
              placeholder="Ví dụ: Thầy/Cô có chuyên môn sâu về đánh giá mô hình NLP và từng hướng dẫn các đề tài cùng lĩnh vực, phù hợp hỗ trợ nhóm hoàn thiện phương pháp thực nghiệm và phản biện thiết kế nghiên cứu."
              className="min-h-28 w-full rounded-lg border border-input bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{trimmedMessage.length === 0 ? "Bắt buộc nhập ít nhất 1 ký tự (không chỉ dấu cách)." : "Chỉ chủ dự án xem được lý do này."}</span>
              <span className="tabular-nums font-medium">{message.length}/1000</span>
            </div>
          </div>

          {(validationError || mutation.error) && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {validationError ?? t(mentorshipError(mutation.error))}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 mt-1">
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || !trimmedMessage}
            onClick={() => void handleSubmit()}
          >
            {mutation.isPending ? "Đang gửi đề xuất…" : "Gửi đề xuất cho chủ dự án"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
