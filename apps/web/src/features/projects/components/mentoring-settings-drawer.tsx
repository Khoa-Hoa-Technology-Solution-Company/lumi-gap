import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, HandHeart, Plus } from "lucide-react";
import {
  dedupeAcademicTerms,
  MENTOR_SUPPORT_AREAS,
  type MentoringPreferences,
  type ResearchSupportType,
} from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { toast } from "sonner";
import {
  mentorshipError,
  useMentoringPreferences,
  useSaveMentoringPreferences,
} from "./mentoring-preferences";
import { formatSupportLabel } from "./research-team-dossier-sheet";

export interface MentoringSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileExpertiseTerms: string[];
  /** Optional fallback data if preferences query hasn't settled yet. */
  fallbackPreferences?: Partial<MentoringPreferences>;
}

export function MentoringSettingsDrawer({
  open,
  onOpenChange,
  profileExpertiseTerms,
  fallbackPreferences,
}: MentoringSettingsDrawerProps) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const prefQuery = useMentoringPreferences(open);
  const savePref = useSaveMentoringPreferences();

  const maxLimitId = useId();
  const externalCountId = useId();
  const customTopicId = useId();
  const noteId = useId();

  const pref = prefQuery.data ?? fallbackPreferences;
  const syncedOpenRef = useRef(false);
  const syncedServerDataRef = useRef(false);

  const [accepting, setAccepting] = useState(Boolean(pref?.acceptingMentorships));
  const [maxLimit, setMaxLimit] = useState(pref?.maxActiveProjects != null ? String(pref.maxActiveProjects) : "");
  const [externalGroups, setExternalGroups] = useState(
    pref?.externalGroupCount != null ? String(pref.externalGroupCount) : "",
  );
  const [topics, setTopics] = useState<string[]>(pref?.preferredTopics ?? []);
  const [customTopic, setCustomTopic] = useState("");
  const [supportTypes, setSupportTypes] = useState<ResearchSupportType[]>(pref?.supportTypes ?? []);
  const [preferredRoles, setPreferredRoles] = useState<("PRIMARY" | "SECONDARY")[]>(pref?.preferredRoles ?? []);
  const [frequency, setFrequency] = useState(pref?.expectedFrequency ?? "FLEXIBLE");
  const [duration, setDuration] = useState(pref?.expectedDuration ?? "FLEXIBLE");
  const [mode, setMode] = useState(pref?.communicationMode ?? "FLEXIBLE");
  const [note, setNote] = useState(pref?.note ?? "");
  const [emailEnabled, setEmailEnabled] = useState(pref?.emailEnabled ?? true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      syncedOpenRef.current = false;
      syncedServerDataRef.current = false;
      return;
    }
    const hasServerData = Boolean(prefQuery.data);
    if (syncedOpenRef.current && (syncedServerDataRef.current || !hasServerData)) {
      return;
    }
    if (!pref) return;
    syncedOpenRef.current = true;
    if (hasServerData) syncedServerDataRef.current = true;
    setAccepting(Boolean(pref.acceptingMentorships));
    setMaxLimit(pref.maxActiveProjects != null ? String(pref.maxActiveProjects) : "");
    setExternalGroups(pref.externalGroupCount != null ? String(pref.externalGroupCount) : "");
    setTopics(pref.preferredTopics ?? []);
    setCustomTopic("");
    setSupportTypes(pref.supportTypes ?? []);
    setPreferredRoles(pref.preferredRoles ?? []);
    setFrequency(pref.expectedFrequency ?? "FLEXIBLE");
    setDuration(pref.expectedDuration ?? "FLEXIBLE");
    setMode(pref.communicationMode ?? "FLEXIBLE");
    setNote(pref.note ?? "");
    setEmailEnabled(pref.emailEnabled ?? true);
    setErrorMessage(null);
  }, [open, prefQuery.data, pref]);

  const activeCount = pref?.activeProjectCount ?? 0;
  const parsedMaxPreview = maxLimit.trim() === "" ? null : Number(maxLimit.trim());
  const validMaxPreview =
    parsedMaxPreview !== null && Number.isInteger(parsedMaxPreview) && parsedMaxPreview >= 1 && parsedMaxPreview <= 20
      ? parsedMaxPreview
      : null;
  const previewRemainingSlots = validMaxPreview !== null ? Math.max(0, validMaxPreview - activeCount) : null;
  const previewCapacityReached = validMaxPreview !== null && activeCount >= validMaxPreview;

  const extraCustomTopics = useMemo(
    () =>
      topics.filter(
        topic => !profileExpertiseTerms.some(term => term.toLocaleLowerCase() === topic.toLocaleLowerCase()),
      ),
    [topics, profileExpertiseTerms],
  );

  const isDirty = useMemo(() => {
    if (!pref) return false;
    const initMax = pref.maxActiveProjects != null ? String(pref.maxActiveProjects) : "";
    const initExt = pref.externalGroupCount != null ? String(pref.externalGroupCount) : "";
    return (
      accepting !== Boolean(pref.acceptingMentorships)
      || maxLimit.trim() !== initMax
      || externalGroups.trim() !== initExt
      || JSON.stringify([...topics].sort()) !== JSON.stringify([...(pref.preferredTopics ?? [])].sort())
      || JSON.stringify([...supportTypes].sort()) !== JSON.stringify([...(pref.supportTypes ?? [])].sort())
      || JSON.stringify([...preferredRoles].sort()) !== JSON.stringify([...(pref.preferredRoles ?? [])].sort())
      || frequency !== (pref.expectedFrequency ?? "FLEXIBLE")
      || duration !== (pref.expectedDuration ?? "FLEXIBLE")
      || mode !== (pref.communicationMode ?? "FLEXIBLE")
      || note.trim() !== (pref.note ?? "").trim()
      || emailEnabled !== (pref.emailEnabled ?? true)
    );
  }, [accepting, maxLimit, externalGroups, topics, supportTypes, preferredRoles, frequency, duration, mode, note, emailEnabled, pref]);

  function requestClose(nextOpen: boolean) {
    if (!nextOpen && isDirty) {
      const confirmed = window.confirm(
        isVi
          ? "Bạn có thay đổi chưa lưu trong thiết lập hướng dẫn. Bạn có chắc muốn đóng không?"
          : "You have unsaved changes in mentoring settings. Discard them?",
      );
      if (!confirmed) return;
    }
    onOpenChange(nextOpen);
  }

  function toggleTopic(term: string) {
    setTopics(prev => {
      const exists = prev.some(item => item.toLocaleLowerCase() === term.toLocaleLowerCase());
      return exists
        ? prev.filter(item => item.toLocaleLowerCase() !== term.toLocaleLowerCase())
        : dedupeAcademicTerms([...prev, term], 12);
    });
  }

  function addCustomTopic() {
    const clean = customTopic.trim();
    if (!clean) return;
    setTopics(prev => dedupeAcademicTerms([...prev, clean], 12));
    setCustomTopic("");
  }

  function toggleSupportArea(id: ResearchSupportType) {
    setSupportTypes(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  }

  function toggleRole(role: "PRIMARY" | "SECONDARY") {
    setPreferredRoles(prev => (prev.includes(role) ? prev.filter(item => item !== role) : [...prev, role]));
  }

  async function handleSave() {
    setErrorMessage(null);
    const trimmedMax = maxLimit.trim();
    const parsedMax = trimmedMax === "" ? null : Number(trimmedMax);
    if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 20)) {
      setErrorMessage(
        isVi
          ? "Giới hạn nhóm trên LumiGap phải là số nguyên từ 1 đến 20 (hoặc để trống nếu chưa đặt)."
          : "LumiGap group limit must be a whole number from 1 to 20 (or blank if unset).",
      );
      return;
    }

    const trimmedExt = externalGroups.trim();
    const parsedExt = trimmedExt === "" ? null : Number(trimmedExt);
    if (parsedExt !== null && (!Number.isInteger(parsedExt) || parsedExt < 0 || parsedExt > 20)) {
      setErrorMessage(
        isVi
          ? "Số nhóm bên ngoài phải là số nguyên từ 0 đến 20 (hoặc để trống nếu chưa khai báo)."
          : "External group count must be a whole number from 0 to 20 (or blank if not declared).",
      );
      return;
    }

    try {
      await savePref.mutateAsync({
        acceptingMentorships: accepting,
        maxActiveProjects: parsedMax,
        externalGroupCount: parsedExt,
        preferredTopics: dedupeAcademicTerms(topics, 12),
        supportTypes,
        preferredRoles,
        expectedFrequency: frequency,
        expectedDuration: duration,
        communicationMode: mode,
        note: note.trim(),
        emailEnabled,
      });
      toast.success(isVi ? "Đã lưu thiết lập hướng dẫn nghiên cứu" : "Mentoring settings saved");
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(t(mentorshipError(error)));
    }
  }

  return (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetContent
        closeLabel={isVi ? "Đóng thiết lập hướng dẫn" : "Close mentoring settings"}
        className="flex flex-col p-0 sm:max-w-xl"
      >
        {/* Drawer Header */}
        <div className="border-b border-border/80 px-6 py-5 pr-14">
          <div className="flex items-center gap-2 text-primary">
            <HandHeart className="h-4 w-4 shrink-0" aria-hidden="true" />
            <SheetTitle className="text-base font-semibold text-foreground">
              {isVi ? "Thiết lập hướng dẫn" : "Mentoring settings"}
            </SheetTitle>
          </div>
          <SheetDescription className="mt-1 text-xs leading-5">
            {isVi
              ? "Đồng bộ trực tiếp giữa Hồ sơ học thuật và Không gian giảng viên. Thay đổi chỉ áp dụng cho lời mời mới."
              : "Synced directly between your Academic Profile and Lecturer Workspace. Changes only apply to new invitations."}
          </SheetDescription>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {prefQuery.isLoading && !pref ? (
            <p role="status" className="text-sm text-muted-foreground">
              {isVi ? "Đang tải thiết lập hướng dẫn…" : "Loading mentoring settings…"}
            </p>
          ) : null}

          {errorMessage ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* Section A: Availability & Effective Status */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {isVi ? "Nhận hướng dẫn nhóm nghiên cứu mới" : "Accept new research teams"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {accepting && previewCapacityReached
                    ? isVi
                      ? "Đã bật nhận hướng dẫn · Hiện đã đạt giới hạn tiếp nhận."
                      : "Mentoring enabled · Currently at full mentoring capacity."
                    : accepting
                      ? isVi
                        ? "Nhóm nghiên cứu có thể tìm thấy bạn và gửi lời mời hướng dẫn."
                        : "Research teams can discover your profile and send mentorship invitations."
                      : isVi
                        ? "Tạm ngừng nhận lời mời mới. Các nhóm đang hướng dẫn không bị ảnh hưởng."
                        : "Not accepting new invitations. Existing mentored teams remain unaffected."}
                </p>
              </div>
              <Switch
                checked={accepting}
                onCheckedChange={setAccepting}
                aria-label={isVi ? "Nhận hướng dẫn nhóm nghiên cứu mới" : "Accept new research teams"}
              />
            </div>

            {accepting && previewCapacityReached ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-5 text-amber-900 dark:text-amber-200">
                {isVi
                  ? `Bạn đang hướng dẫn ${activeCount}/${validMaxPreview} nhóm theo giới hạn hiện tại. Tăng giới hạn hoặc hoàn thành một nhóm để mở lại trạng thái tiếp nhận.`
                  : `You are mentoring ${activeCount}/${validMaxPreview} teams under your current limit. Increase the limit or complete a team to reopen effective availability.`}
              </div>
            ) : null}
          </section>

          {/* Section B: Capacity */}
          <section className="space-y-3 border-t border-border/70 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Khả năng tiếp nhận" : "Mentoring capacity"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isVi
                  ? `Đang hướng dẫn ${activeCount} nhóm trên LumiGap · ${
                      validMaxPreview !== null
                        ? `Còn nhận thêm: ${previewRemainingSlots} nhóm`
                        : "Chưa cung cấp giới hạn"
                    }. Giảm giới hạn không bao giờ xóa nhóm đang hướng dẫn.`
                  : `Currently mentoring ${activeCount} team(s) on LumiGap · ${
                      validMaxPreview !== null
                        ? `Remaining slots: ${previewRemainingSlots}`
                        : "Limit not provided"
                    }. Lowering your limit never removes active teams.`}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={maxLimitId} className="block text-xs font-medium text-foreground">
                  {isVi ? "Giới hạn nhóm trên LumiGap (1–20)" : "LumiGap team limit (1–20)"}
                </label>
                <Input
                  id={maxLimitId}
                  type="number"
                  min={1}
                  max={20}
                  value={maxLimit}
                  onChange={e => setMaxLimit(e.target.value)}
                  placeholder={isVi ? "Chưa cung cấp giới hạn" : "Not provided"}
                  className="h-9 text-sm tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground">
                  {isVi ? "Để trống nếu bạn chưa muốn đặt giới hạn cụ thể." : "Leave blank if you do not want a fixed cap."}
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={externalCountId} className="block text-xs font-medium text-foreground">
                  {isVi ? "Nhóm bên ngoài (tự khai báo, không bắt buộc)" : "External groups (self-declared, optional)"}
                </label>
                <Input
                  id={externalCountId}
                  type="number"
                  min={0}
                  max={20}
                  value={externalGroups}
                  onChange={e => setExternalGroups(e.target.value)}
                  placeholder={isVi ? "Chưa khai báo" : "Not declared"}
                  className="h-9 text-sm tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground">
                  {isVi ? "Chỉ hiển thị riêng cho bạn để tự theo dõi khối lượng; để trống khác với 0." : "Visible only to you for personal workload tracking; blank differs from 0."}
                </p>
              </div>
            </div>
          </section>

          {/* Section C: Preferred Research Topics */}
          <section className="space-y-2.5 border-t border-border/70 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Chủ đề nghiên cứu ưu tiên hướng dẫn" : "Preferred supervision topics"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isVi
                  ? "Chọn trực tiếp từ chuyên môn trên Hồ sơ học thuật hoặc bổ sung chủ đề riêng (không thay đổi Hồ sơ học thuật)."
                  : "Pick from your Academic Profile expertise or add custom topics (does not modify your profile expertise)."}
              </p>
            </div>

            {profileExpertiseTerms.length > 0 ? (
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={isVi ? "Chủ đề từ hồ sơ học thuật" : "Topics from academic profile"}
              >
                {profileExpertiseTerms.map(term => {
                  const active = topics.some(item => item.toLocaleLowerCase() === term.toLocaleLowerCase());
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
            ) : (
              <p className="rounded-lg border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">
                {isVi
                  ? "Bạn chưa khai báo lĩnh vực chuyên môn trên Hồ sơ học thuật. Bạn vẫn có thể thêm chủ đề ưu tiên ở dưới."
                  : "No expertise terms on your Academic Profile yet. You can still add custom supervision topics below."}
              </p>
            )}

            {extraCustomTopics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {extraCustomTopics.map(topic => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                    title={isVi ? "Xóa chủ đề" : "Remove topic"}
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
                placeholder={isVi ? "Bổ sung chủ đề ưu tiên (tối đa 12)…" : "Add custom topic (up to 12)…"}
                className="h-9 text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomTopic} className="h-9 shrink-0 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isVi ? "Thêm" : "Add"}</span>
              </Button>
            </div>
          </section>

          {/* Section D: Support Areas */}
          <section className="space-y-2.5 border-t border-border/70 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Nội dung có thể hỗ trợ" : "Support areas"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isVi
                  ? "Giúp nhóm nghiên cứu hiểu rõ hình thức đồng hành mà bạn ưu tiên."
                  : "Helps research teams understand the mentoring formats you prefer."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={isVi ? "Nội dung hỗ trợ" : "Support areas"}>
              {MENTOR_SUPPORT_AREAS.map(area => {
                const active = supportTypes.includes(area.id);
                return (
                  <button
                    key={area.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleSupportArea(area.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {active ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    <span>{formatSupportLabel(area.id, language, t)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section E: Additional Preferences (Collapsible) */}
          <details className="group rounded-xl border border-border/80 bg-muted/15">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-foreground">
              <span>{isVi ? "Tùy chọn bổ sung (vai trò, lịch trao đổi, email thông báo)" : "Additional preferences (roles, schedule, email alerts)"}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>

            <div className="space-y-4 border-t border-border/70 px-4 py-4">
              {/* Preferred mentor roles */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  {isVi ? "Vai trò hướng dẫn mong muốn" : "Preferred mentor roles"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["PRIMARY", "SECONDARY"] as const).map(role => {
                    const active = preferredRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleRole(role)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {active ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                        <span>
                          {role === "PRIMARY"
                            ? isVi
                              ? "Cố vấn chính"
                              : "Primary mentor"
                            : isVi
                              ? "Đồng hướng dẫn"
                              : "Secondary mentor"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Frequency / Duration / Mode */}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{isVi ? "Tần suất trao đổi" : "Frequency"}</span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={frequency}
                    onChange={e => setFrequency(e.target.value)}
                  >
                    <option value="FLEXIBLE">{isVi ? "Trao đổi thêm" : "Flexible"}</option>
                    <option value="WEEKLY">{isVi ? "Hàng tuần" : "Weekly"}</option>
                    <option value="BIWEEKLY">{isVi ? "2 tuần/lần" : "Biweekly"}</option>
                    <option value="MILESTONE_BASED">{isVi ? "Theo mốc nghiên cứu" : "By milestone"}</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{isVi ? "Thời gian đồng hành" : "Duration"}</span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                  >
                    <option value="FLEXIBLE">{isVi ? "Trao đổi thêm" : "Flexible"}</option>
                    <option value="1_SEMESTER">{isVi ? "1 học kỳ" : "1 semester"}</option>
                    <option value="2_SEMESTERS">{isVi ? "2 học kỳ" : "2 semesters"}</option>
                    <option value="FULL_PROJECT">{isVi ? "Toàn dự án" : "Full project"}</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">{isVi ? "Hình thức trao đổi" : "Mode"}</span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={mode}
                    onChange={e => setMode(e.target.value)}
                  >
                    <option value="FLEXIBLE">{isVi ? "Linh hoạt" : "Flexible"}</option>
                    <option value="ONLINE">{isVi ? "Trực tuyến" : "Online"}</option>
                    <option value="HYBRID">{isVi ? "Kết hợp" : "Hybrid"}</option>
                    <option value="IN_PERSON">{isVi ? "Trực tiếp" : "In person"}</option>
                  </select>
                </label>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label htmlFor={noteId} className="block text-xs font-medium text-foreground">
                  {isVi ? "Ghi chú thêm (không bắt buộc)" : "Availability note (optional)"}
                </label>
                <textarea
                  id={noteId}
                  rows={2}
                  maxLength={1000}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={
                    isVi
                      ? "VD: Phản hồi bản thảo vào cuối tuần, ưu tiên nhóm đã có đề cương sơ bộ…"
                      : "e.g. Review drafts on weekends; prefer teams with an initial proposal…"
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {/* Email notifications */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {isVi ? "Email thông báo lời mời hướng dẫn" : "Mentorship invitation email alerts"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {isVi
                      ? "Nhận email khi có lời mời hoặc cập nhật trạng thái hướng dẫn."
                      : "Receive emails when teams send mentorship invitations or updates."}
                  </p>
                </div>
                <Switch
                  size="sm"
                  checked={emailEnabled}
                  onCheckedChange={setEmailEnabled}
                  aria-label={isVi ? "Email thông báo lời mời hướng dẫn" : "Mentorship invitation email alerts"}
                />
              </div>
            </div>
          </details>
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border/80 bg-background px-6 py-4">
          <Button type="button" variant="outline" size="sm" onClick={() => requestClose(false)}>
            {isVi ? "Hủy" : "Cancel"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={savePref.isPending}
            onClick={() => void handleSave()}
          >
            {savePref.isPending
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
