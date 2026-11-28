import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Compass, Mail, UserCheck, Users } from "lucide-react";
import { MENTOR_SUPPORT_AREAS, type MentoringPreferences, type ResearchSupportType } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { academicSupportApi } from "../api/academic-support.api";
import { useAuthStore } from "@/stores/auth-store";
import { formatSupportLabel } from "./research-team-dossier-sheet";

export function mentorshipError(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Could not complete this action. Please try again.";
}

export type MentoringPreferencesPatch = Partial<
  Pick<
    MentoringPreferences,
    | "acceptingMentorships"
    | "emailEnabled"
    | "locale"
    | "maxActiveProjects"
    | "externalGroupCount"
    | "supportTypes"
    | "preferredTopics"
    | "preferredRoles"
    | "expectedFrequency"
    | "expectedDuration"
    | "communicationMode"
    | "note"
  >
>;

export function useMentoringPreferences(enabled = true) {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ["academic-support", userId, "preferences"],
    queryFn: academicSupportApi.preferences,
    enabled: Boolean(userId) && enabled,
  });
}

export function useSaveMentoringPreferences(options?: {
  onSuccess?: (result: MentoringPreferences) => void;
}) {
  const { language } = useI18n();
  const cache = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  return useMutation({
    mutationFn: (input: MentoringPreferencesPatch) =>
      academicSupportApi.savePreferences({
        ...input,
        locale: input.locale ?? (language === "vi" ? "vi" : "en"),
      }),
    onSuccess: result => {
      cache.setQueryData(["academic-support", userId, "preferences"], result);
      void cache.invalidateQueries({ queryKey: ["academic-profile"] });
      void cache.invalidateQueries({ queryKey: ["academic-profiles", "lecturers"] });
      void cache.invalidateQueries({ queryKey: ["academic-support", userId, "opportunities"] });
      void cache.invalidateQueries({ queryKey: ["mentor-workspace"] });
      options?.onSuccess?.(result);
    },
  });
}

export function MentoringPreferencesPanel({ lecturer = true, plain = false }: { lecturer?: boolean; plain?: boolean }) {
  const { t, language } = useI18n(), preferences = useMentoringPreferences();
  const isVi = language === "vi";
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  const [externalDraft, setExternalDraft] = useState<string | null>(null);
  const [supportDraft, setSupportDraft] = useState<ResearchSupportType[] | null>(null);
  const [topicsDraft, setTopicsDraft] = useState<string | null>(null);
  const [rolesDraft, setRolesDraft] = useState<("PRIMARY" | "SECONDARY")[] | null>(null);
  const [frequencyDraft, setFrequencyDraft] = useState<string | null>(null);
  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  const [modeDraft, setModeDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const update = useSaveMentoringPreferences({
    onSuccess: () => {
      setMaxDraft(null);
      setExternalDraft(null);
      setSupportDraft(null);
      setTopicsDraft(null);
      setRolesDraft(null);
      setFrequencyDraft(null);
      setDurationDraft(null);
      setModeDraft(null);
      setNoteDraft(null);
    },
  });

  if (preferences.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  if (!preferences.data) return <p role="alert" className="text-sm text-destructive">{t("Unable to load mentoring preferences.")}</p>;
  const pref = preferences.data;

  const effectiveSupport = supportDraft ?? pref.supportTypes ?? [];
  const effectiveRoles = rolesDraft ?? pref.preferredRoles ?? [];
  const effectiveTopics = topicsDraft ?? (pref.preferredTopics ?? []).join(", ");
  const effectiveFrequency = frequencyDraft ?? pref.expectedFrequency ?? "FLEXIBLE";
  const effectiveDuration = durationDraft ?? pref.expectedDuration ?? "FLEXIBLE";
  const effectiveMode = modeDraft ?? pref.communicationMode ?? "FLEXIBLE";
  const effectiveNote = noteDraft ?? pref.note ?? "";
  const hasArrangementChanges =
    supportDraft !== null ||
    topicsDraft !== null ||
    rolesDraft !== null ||
    frequencyDraft !== null ||
    durationDraft !== null ||
    modeDraft !== null ||
    noteDraft !== null;

  return (
    <section
      className={plain ? "space-y-3" : "space-y-4 rounded-xl border bg-card p-4"}
      data-no-i18n
    >
      {lecturer ? (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
          {pref.canEnable ? (
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <UserCheck size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t("Open to mentoring new teams")}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {pref.acceptingMentorships && pref.capacityReached
                      ? isVi
                        ? "Đã bật nhận hướng dẫn · Hiện đã đạt giới hạn tiếp nhận."
                        : "Mentoring enabled · Currently at full mentoring capacity."
                      : t(
                          pref.acceptingMentorships
                            ? "Teams may discover your profile and send mentorship requests."
                            : "You're not currently accepting new mentorship requests. Existing mentorships are not affected.",
                        )}
                  </span>
                </div>
              </div>
              <Switch
                aria-label={t("Open to mentoring new teams")}
                checked={pref.acceptingMentorships}
                pending={update.isPending}
                onCheckedChange={checked => update.mutate({ acceptingMentorships: checked })}
                className="mt-0.5"
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold">{t("Mentoring availability")}</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("Lecturer verification is required before accepting official mentorships.")}
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link to="/settings/verification/lecturer">{t("Verify Lecturer Status")}</Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {lecturer && pref.canEnable ? (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {isVi ? "Khả năng tiếp nhận hướng dẫn" : "Mentoring capacity"}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {isVi
                  ? `Đang hướng dẫn ${pref.activeProjectCount ?? 0} dự án trên LumiGap${pref.maxActiveProjects ? ` · Còn nhận thêm: ${pref.remainingSlots ?? 0}` : " · Chưa cung cấp giới hạn tiếp nhận"}. Giảm giới hạn không tự động loại các nhóm đang hướng dẫn.`
                  : `Currently mentoring ${pref.activeProjectCount ?? 0} project(s) on LumiGap${pref.maxActiveProjects ? ` · Remaining capacity: ${pref.remainingSlots ?? 0}` : " · Capacity limit not set"}. Lowering your limit never removes existing teams.`}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-medium text-foreground">
              <span>{isVi ? "Giới hạn dự án trên LumiGap (để trống nếu chưa đặt)" : "LumiGap project limit (leave blank if unset)"}</span>
              <Input
                type="number"
                min={1}
                max={20}
                className="h-8 text-sm"
                placeholder={isVi ? "Chưa cung cấp giới hạn tiếp nhận" : "Not specified"}
                value={maxDraft ?? (pref.maxActiveProjects != null ? String(pref.maxActiveProjects) : "")}
                onChange={e => setMaxDraft(e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-foreground">
              <span>{isVi ? "Số nhóm bên ngoài tự khai báo (không bắt buộc)" : "Self-declared external groups (optional)"}</span>
              <Input
                type="number"
                min={0}
                max={20}
                className="h-8 text-sm"
                placeholder="0"
                value={externalDraft ?? (pref.externalGroupCount != null ? String(pref.externalGroupCount) : "")}
                onChange={e => setExternalDraft(e.target.value)}
              />
            </label>
          </div>

          {maxDraft !== null || externalDraft !== null ? (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setMaxDraft(null); setExternalDraft(null); }}>
                {isVi ? "Hủy" : "Cancel"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={update.isPending}
                onClick={() => {
                  const rawMax = maxDraft !== null ? maxDraft.trim() : pref.maxActiveProjects != null ? String(pref.maxActiveProjects) : "";
                  const rawExt = externalDraft !== null ? externalDraft.trim() : pref.externalGroupCount != null ? String(pref.externalGroupCount) : "";
                  const parsedMax = rawMax === "" ? null : Math.max(1, Math.min(20, Math.floor(Number(rawMax))));
                  const parsedExt = rawExt === "" ? null : Math.max(0, Math.min(20, Math.floor(Number(rawExt))));
                  update.mutate({
                    maxActiveProjects: parsedMax !== null && Number.isNaN(parsedMax) ? null : parsedMax,
                    externalGroupCount: parsedExt !== null && Number.isNaN(parsedExt) ? null : parsedExt,
                  });
                }}
              >
                {isVi ? "Lưu khả năng tiếp nhận" : "Save capacity"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {lecturer && pref.canEnable ? (
        <details className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-foreground">
            <span className="inline-flex items-center gap-2">
              <Compass size={15} className="text-primary shrink-0" aria-hidden="true" />
              <span>{isVi ? "Phạm vi hướng dẫn, chủ đề & lịch dự kiến" : "Support scope, topics & preferred arrangements"}</span>
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {effectiveSupport.length > 0 ? `${effectiveSupport.length} ${isVi ? "nội dung" : "areas"}` : (isVi ? "Tùy chọn" : "Optional")}
            </span>
          </summary>

          <div className="space-y-3 pt-2 border-t border-border/60">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">{isVi ? "Loại hỗ trợ có thể cung cấp" : "Available support areas"}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {MENTOR_SUPPORT_AREAS.map(area => {
                  const checked = effectiveSupport.includes(area.id);
                  return (
                    <label key={area.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSupportDraft(
                            checked
                              ? effectiveSupport.filter(item => item !== area.id)
                              : [...effectiveSupport, area.id],
                          )
                        }
                      />
                      <span className="truncate">{formatSupportLabel(area.id, language, t)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground" htmlFor="mentor-pref-topics">
                {isVi ? "Chủ đề nghiên cứu muốn ưu tiên hướng dẫn (phân cách bằng dấu phẩy)" : "Preferred supervision topics (comma-separated)"}
              </label>
              <Input
                id="mentor-pref-topics"
                className="h-8 text-xs bg-background"
                placeholder={isVi ? "VD: NLP tiếng Việt, Thị giác máy tính y sinh..." : "Example: Biomedical NLP, Empirical Software Engineering..."}
                value={effectiveTopics}
                onChange={e => setTopicsDraft(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">{isVi ? "Vai trò hướng dẫn mong muốn" : "Preferred mentor roles"}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["PRIMARY", "SECONDARY"] as const).map(role => {
                  const checked = effectiveRoles.includes(role);
                  return (
                    <label key={role} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setRolesDraft(
                            checked ? effectiveRoles.filter(r => r !== role) : [...effectiveRoles, role],
                          )
                        }
                      />
                      <span>{role === "PRIMARY" ? (isVi ? "Cố vấn chính" : "Primary mentor") : (isVi ? "Cố vấn phụ" : "Secondary mentor")}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3 text-xs">
              <label className="space-y-1">
                <span className="text-muted-foreground">{isVi ? "Tần suất trao đổi" : "Frequency"}</span>
                <select className="h-8 w-full rounded-md border bg-background px-2" value={effectiveFrequency} onChange={e => setFrequencyDraft(e.target.value)}>
                  <option value="FLEXIBLE">{isVi ? "Trao đổi thêm" : "Flexible"}</option>
                  <option value="WEEKLY">{isVi ? "Hàng tuần" : "Weekly"}</option>
                  <option value="BIWEEKLY">{isVi ? "2 tuần/lần" : "Biweekly"}</option>
                  <option value="MILESTONE_BASED">{isVi ? "Theo mốc nghiên cứu" : "By milestone"}</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">{isVi ? "Thời gian đồng hành" : "Duration"}</span>
                <select className="h-8 w-full rounded-md border bg-background px-2" value={effectiveDuration} onChange={e => setDurationDraft(e.target.value)}>
                  <option value="FLEXIBLE">{isVi ? "Trao đổi thêm" : "Flexible"}</option>
                  <option value="1_SEMESTER">{isVi ? "1 học kỳ" : "1 semester"}</option>
                  <option value="2_SEMESTERS">{isVi ? "2 học kỳ" : "2 semesters"}</option>
                  <option value="FULL_PROJECT">{isVi ? "Toàn dự án" : "Full project"}</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">{isVi ? "Hình thức trao đổi" : "Mode"}</span>
                <select className="h-8 w-full rounded-md border bg-background px-2" value={effectiveMode} onChange={e => setModeDraft(e.target.value)}>
                  <option value="FLEXIBLE">{isVi ? "Linh hoạt" : "Flexible"}</option>
                  <option value="ONLINE">{isVi ? "Trực tuyến" : "Online"}</option>
                  <option value="HYBRID">{isVi ? "Kết hợp" : "Hybrid"}</option>
                  <option value="IN_PERSON">{isVi ? "Trực tiếp" : "In person"}</option>
                </select>
              </label>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground" htmlFor="mentor-pref-note">
                {isVi ? "Ghi chú thêm về khả năng hỗ trợ" : "Mentoring availability note"}
              </label>
              <Input
                id="mentor-pref-note"
                maxLength={1000}
                className="h-8 text-xs bg-background"
                placeholder={isVi ? "VD: Phản hồi bản thảo vào cuối tuần, ưu tiên nhóm đã có đề cương sơ bộ..." : "Example: Draft reviews on weekends..."}
                value={effectiveNote}
                onChange={e => setNoteDraft(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Link to="/profile" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <span>{isVi ? "Cập nhật chuyên môn, kỹ năng & phương pháp trong Hồ sơ học thuật" : "Edit expertise, skills & methods in Academic Profile"}</span>
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
              {hasArrangementChanges ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSupportDraft(null);
                      setTopicsDraft(null);
                      setRolesDraft(null);
                      setFrequencyDraft(null);
                      setDurationDraft(null);
                      setModeDraft(null);
                      setNoteDraft(null);
                    }}
                  >
                    {isVi ? "Hủy" : "Cancel"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        supportTypes: effectiveSupport,
                        preferredTopics: effectiveTopics.split(",").map(s => s.trim()).filter(Boolean).slice(0, 12),
                        preferredRoles: effectiveRoles,
                        expectedFrequency: effectiveFrequency,
                        expectedDuration: effectiveDuration,
                        communicationMode: effectiveMode,
                        note: effectiveNote.trim(),
                      })
                    }
                  >
                    {isVi ? "Lưu thiết lập hướng dẫn" : "Save mentoring preferences"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {t("Email for mentorship invitations and decisions")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {isVi
                  ? "Nhận email khi có nhóm nghiên cứu gửi lời mời hoặc cập nhật trạng thái hướng dẫn."
                  : "Receive emails when research teams send invitations or update mentorship decisions."}
              </span>
            </div>
          </div>
          <Switch
            aria-label={t("Email for mentorship invitations and decisions")}
            checked={pref.emailEnabled}
            pending={update.isPending}
            onCheckedChange={checked => update.mutate({ emailEnabled: checked })}
            className="mt-0.5"
          />
        </div>
      </div>

      {pref.emailDelivery ? (
        <p role="status" className="break-words text-xs leading-5 text-muted-foreground">
          {t(pref.emailDelivery.status === "TEST_ADDRESS"
            ? "The account uses test address {{email}}, which cannot receive messages in a real inbox."
            : pref.emailDelivery.status === "NOT_CONFIGURED"
              ? "Email delivery is not enabled on this server. Your preference is saved, but messages cannot be sent yet."
              : pref.emailEnabled
                ? "New mentorship invitations and decisions will be emailed to {{email}}."
                : "Email notifications are off. Enable them to receive new mentorship invitations and decisions at {{email}}.",
          { email: pref.emailDelivery.recipient })}
        </p>
      ) : null}

      {update.error ? <p role="alert" className="text-sm text-destructive">{t(mentorshipError(update.error))}</p> : null}
    </section>
  );
}
