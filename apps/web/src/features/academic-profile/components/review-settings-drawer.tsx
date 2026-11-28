import { useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, Check, Plus, ShieldCheck } from "lucide-react";
import {
  dedupeAcademicTerms,
  type AcademicProfile,
  type AcademicReviewType,
} from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { useUpdateAcademicProfile } from "../hooks/use-academic-profile";
import { toast } from "sonner";

const REVIEW_TYPES: Array<{ id: AcademicReviewType; vi: string; en: string }> = [
  { id: "RESEARCH_PROPOSAL", vi: "Đề cương nghiên cứu", en: "Research proposal" },
  { id: "LITERATURE_REVIEW", vi: "Tổng quan tài liệu", en: "Literature review" },
  { id: "THESIS_DRAFT", vi: "Bản thảo khóa luận / luận văn", en: "Thesis draft" },
  { id: "RESEARCH_GAP", vi: "Khoảng trống nghiên cứu", en: "Research gap" },
  { id: "METHODOLOGY", vi: "Phương pháp nghiên cứu", en: "Methodology" },
  { id: "EXPERIMENTAL_RESULTS", vi: "Kết quả thực nghiệm", en: "Experimental results" },
  { id: "RESEARCH_PAPER", vi: "Bài báo khoa học", en: "Research paper" },
  { id: "SOFTWARE_RESEARCH_PROJECT", vi: "Dự án nghiên cứu phần mềm", en: "Software research project" },
];

export interface ReviewSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: AcademicProfile;
  profileExpertiseTerms: string[];
}

export function ReviewSettingsDrawer({
  open,
  onOpenChange,
  profile,
  profileExpertiseTerms,
}: ReviewSettingsDrawerProps) {
  const { language } = useI18n();
  const isVi = language === "vi";
  const updateProfile = useUpdateAcademicProfile();
  const maxInputId = useId();
  const noteInputId = useId();
  const customTopicId = useId();

  const [enabled, setEnabled] = useState(profile.reviewAvailability.enabled);
  const [types, setTypes] = useState<AcademicReviewType[]>(profile.reviewAvailability.types);
  const [topics, setTopics] = useState<string[]>(profile.reviewAvailability.preferredTopics);
  const [customTopic, setCustomTopic] = useState("");
  const [maxActiveReviews, setMaxActiveReviews] = useState(
    profile.reviewAvailability.maximumActiveReviews ? String(profile.reviewAvailability.maximumActiveReviews) : "3",
  );
  const [note, setNote] = useState(profile.reviewAvailability.note ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEnabled(profile.reviewAvailability.enabled);
    setTypes(profile.reviewAvailability.types);
    setTopics(profile.reviewAvailability.preferredTopics);
    setCustomTopic("");
    setMaxActiveReviews(
      profile.reviewAvailability.maximumActiveReviews ? String(profile.reviewAvailability.maximumActiveReviews) : "3",
    );
    setNote(profile.reviewAvailability.note ?? "");
    setErrorMessage(null);
  }, [open, profile.reviewAvailability]);

  const isDirty = useMemo(() => {
    const initialMax = profile.reviewAvailability.maximumActiveReviews
      ? String(profile.reviewAvailability.maximumActiveReviews)
      : "3";
    return (
      enabled !== profile.reviewAvailability.enabled
      || JSON.stringify([...types].sort()) !== JSON.stringify([...profile.reviewAvailability.types].sort())
      || JSON.stringify([...topics].sort()) !== JSON.stringify([...profile.reviewAvailability.preferredTopics].sort())
      || maxActiveReviews.trim() !== initialMax
      || note.trim() !== (profile.reviewAvailability.note ?? "").trim()
    );
  }, [enabled, types, topics, maxActiveReviews, note, profile.reviewAvailability]);

  const extraCustomTopics = useMemo(
    () =>
      topics.filter(
        topic => !profileExpertiseTerms.some(term => term.toLocaleLowerCase() === topic.toLocaleLowerCase()),
      ),
    [topics, profileExpertiseTerms],
  );

  function requestClose(nextOpen: boolean) {
    if (!nextOpen && isDirty) {
      const confirmed = window.confirm(
        isVi
          ? "Bạn có thay đổi chưa lưu trong thiết lập phản biện. Bạn có chắc muốn đóng không?"
          : "You have unsaved changes in your peer review settings. Discard them?",
      );
      if (!confirmed) return;
    }
    onOpenChange(nextOpen);
  }

  function toggleType(id: AcademicReviewType) {
    setTypes(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  }

  function toggleTopic(term: string) {
    setTopics(prev => {
      const exists = prev.some(item => item.toLocaleLowerCase() === term.toLocaleLowerCase());
      return exists
        ? prev.filter(item => item.toLocaleLowerCase() !== term.toLocaleLowerCase())
        : dedupeAcademicTerms([...prev, term], 30);
    });
  }

  function addCustomTopic() {
    const clean = customTopic.trim();
    if (!clean) return;
    setTopics(prev => dedupeAcademicTerms([...prev, clean], 30));
    setCustomTopic("");
  }

  async function handleSave() {
    setErrorMessage(null);
    const trimmedMax = maxActiveReviews.trim();
    const parsedMax = trimmedMax === "" ? 3 : Number(trimmedMax);
    if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 20) {
      setErrorMessage(
        isVi
          ? "Số yêu cầu phản biện đồng thời phải là số nguyên từ 1 đến 20."
          : "Maximum active reviews must be a whole number from 1 to 20.",
      );
      return;
    }

    try {
      const { updatedAt: _omit, ...currentReview } = profile.reviewAvailability;
      await updateProfile.mutateAsync({
        reviewAvailability: {
          ...currentReview,
          enabled,
          types: enabled && types.length === 0 ? ["RESEARCH_PAPER"] : types,
          preferredTopics: dedupeAcademicTerms(topics, 30),
          maximumActiveReviews: parsedMax,
          note: note.trim() || undefined,
        },
      });
      toast.success(isVi ? "Đã lưu thiết lập phản biện học thuật" : "Peer review settings saved");
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : isVi
            ? "Không thể lưu thiết lập phản biện. Vui lòng thử lại."
            : "Could not save peer review settings. Please try again.";
      setErrorMessage(message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetContent
        closeLabel={isVi ? "Đóng thiết lập phản biện" : "Close peer review settings"}
        className="flex flex-col p-0 sm:max-w-lg"
      >
        {/* Header */}
        <div className="border-b border-border/80 px-6 py-5 pr-14">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <SheetTitle className="text-base font-semibold text-foreground">
              {isVi ? "Thiết lập phản biện học thuật" : "Academic peer review settings"}
            </SheetTitle>
          </div>
          <SheetDescription className="mt-1 text-xs leading-5">
            {isVi
              ? "Tùy chỉnh loại tài liệu và chủ đề bạn sẵn sàng phản biện khi nhận lời mời chính thức."
              : "Choose the artifact types and research topics you are open to reviewing when formally assigned."}
          </SheetDescription>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {errorMessage ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* Section 1: Availability toggle */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {isVi ? "Nhận lời mời phản biện học thuật" : "Accept academic peer review invitations"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isVi
                  ? "Phản biện chính thức luôn yêu cầu lời mời và phân công riêng theo từng bản thảo."
                  : "Formal peer review always requires a separate invitation and manuscript assignment."}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label={isVi ? "Nhận lời mời phản biện học thuật" : "Accept academic peer review invitations"}
            />
          </div>

          {/* Section 2: Review artifact types */}
          <section className="space-y-2.5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Loại tài liệu sẵn sàng phản biện" : "Artifact types you can review"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isVi
                  ? "Chọn các loại bản thảo hoặc sản phẩm nghiên cứu phù hợp với chuyên môn của bạn."
                  : "Select manuscript or research artifact types suited to your expertise."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={isVi ? "Loại tài liệu phản biện" : "Review artifact types"}>
              {REVIEW_TYPES.map(item => {
                const active = types.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleType(item.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {active ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    <span>{isVi ? item.vi : item.en}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: Preferred review topics */}
          <section className="space-y-2.5 border-t border-border/70 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Chủ đề ưu tiên phản biện" : "Preferred review topics"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isVi
                  ? "Chọn nhanh từ chuyên môn trên Hồ sơ học thuật hoặc bổ sung chủ đề riêng mà không làm thay đổi hồ sơ."
                  : "Pick from your Academic Profile expertise or add review-specific topics without altering your profile."}
              </p>
            </div>
            {profileExpertiseTerms.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {profileExpertiseTerms.map(term => {
                  const active = topics.some(t => t.toLocaleLowerCase() === term.toLocaleLowerCase());
                  return (
                    <button
                      key={term}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleTopic(term)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {active ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                      <span>{term}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {extraCustomTopics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {extraCustomTopics.map(topic => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                    title={isVi ? "Bỏ chọn chủ đề" : "Remove topic"}
                  >
                    <span>{topic}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Input
                id={customTopicId}
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTopic();
                  }
                }}
                placeholder={isVi ? "Thêm chủ đề phản biện khác…" : "Add another review topic…"}
                className="h-9 text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomTopic} className="h-9 shrink-0 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isVi ? "Thêm" : "Add"}</span>
              </Button>
            </div>
          </section>

          {/* Section 4: Workload & note */}
          <section className="space-y-4 border-t border-border/70 pt-5">
            <div className="space-y-1.5">
              <label htmlFor={maxInputId} className="block text-xs font-medium text-foreground">
                {isVi ? "Số phản biện tối đa cùng lúc (1–20)" : "Maximum concurrent reviews (1–20)"}
              </label>
              <Input
                id={maxInputId}
                type="number"
                min={1}
                max={20}
                value={maxActiveReviews}
                onChange={e => setMaxActiveReviews(e.target.value)}
                className="h-9 max-w-[140px] text-sm tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor={noteInputId} className="block text-xs font-medium text-foreground">
                {isVi ? "Ghi chú thêm (không bắt buộc)" : "Additional note (optional)"}
              </label>
              <textarea
                id={noteInputId}
                rows={3}
                maxLength={1000}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={
                  isVi
                    ? "Ví dụ: ưu tiên phản biện phương pháp nghiên cứu hoặc bản thảo tiếng Anh…"
                    : "e.g. Prefer methodology or English manuscript reviews…"
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </section>
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border/80 bg-background px-6 py-4">
          <Button type="button" variant="outline" size="sm" onClick={() => requestClose(false)}>
            {isVi ? "Hủy" : "Cancel"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={updateProfile.isPending}
            onClick={() => void handleSave()}
          >
            {updateProfile.isPending
              ? isVi
                ? "Đang lưu…"
                : "Saving…"
              : isVi
                ? "Lưu thiết lập"
                : "Save settings"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
