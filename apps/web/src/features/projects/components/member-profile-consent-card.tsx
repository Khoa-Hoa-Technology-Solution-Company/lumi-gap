import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";

export function MemberProfileConsentCard({ projectId }: { projectId: string }) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const userId = useAuthStore(s => s.user?.id);
  const cache = useQueryClient();
  const [roleNoteDraft, setRoleNoteDraft] = useState<string | null>(null);

  const consentQuery = useQuery({
    queryKey: ["academic-support", userId, "my-profile-consent", projectId],
    queryFn: () => academicSupportApi.myProfileConsent(projectId),
    enabled: Boolean(userId && projectId),
    retry: false,
  });

  const save = useMutation({
    mutationFn: (input: { shared: boolean; roleNote?: string }) =>
      academicSupportApi.updateMyProfileConsent(projectId, input),
    onSuccess: updated => {
      cache.setQueryData(["academic-support", userId, "my-profile-consent", projectId], updated);
      setRoleNoteDraft(null);
      void cache.invalidateQueries({ queryKey: ["academic-support", userId, "discovery-settings", projectId] });
      void cache.invalidateQueries({ queryKey: ["academic-support", userId, "team-dossier"] });
      toast.success(
        updated.shared
          ? isVi ? "Đã bật chia sẻ hồ sơ của bạn trong Hồ sơ tìm cố vấn." : "Your profile is now shared in the Mentor Recruitment Profile."
          : isVi ? "Đã rút quyền chia sẻ hồ sơ của bạn khỏi Hồ sơ tìm cố vấn." : "Your profile sharing consent has been withdrawn.",
      );
    },
  });

  if (consentQuery.isLoading || !consentQuery.data) return null;
  const data = consentQuery.data;
  const currentNote = roleNoteDraft !== null ? roleNoteDraft : (data.roleNote ?? "");

  return (
    <section
      aria-label={isVi ? "Quyền chia sẻ hồ sơ cá nhân khi tìm cố vấn" : "Personal profile sharing consent"}
      className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5"
      data-no-i18n
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${data.shared ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
            {data.shared ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-semibold text-foreground">
              {isVi ? "Chia sẻ Hồ sơ học thuật của tôi khi nhóm tìm cố vấn" : "Share my Academic Profile in Mentor Recruitment Profile"}
            </p>
            <p className="text-[11.5px] leading-5 text-muted-foreground">
              {isVi
                ? "Bạn toàn quyền bật hoặc rút chia sẻ bất kỳ lúc nào. Chủ dự án không thể tự bật thay cho thành viên khác."
                : "You control your own profile visibility for mentor discovery. The project owner cannot override your consent."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={data.shared ? "outline" : "default"}
          className="h-7 text-xs shrink-0"
          disabled={save.isPending}
          onClick={() => save.mutate({ shared: !data.shared, roleNote: currentNote })}
        >
          {data.shared
            ? isVi ? "Rút chia sẻ" : "Withdraw consent"
            : isVi ? "Đồng ý chia sẻ" : "Opt in to share"}
        </Button>
      </div>

      {data.shared && data.profileVisibility === "PRIVATE" ? (
        <p role="status" className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-800 dark:text-amber-200">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {isVi
              ? "Hồ sơ học thuật chung của bạn đang đặt ở chế độ Riêng tư nên giảng viên vẫn chưa nhìn thấy thông tin cá nhân."
              : "Your global Academic Profile is set to PRIVATE, so lecturers still will not see your profile details."}
          </span>
        </p>
      ) : null}

      {data.shared ? (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Input
            type="text"
            maxLength={200}
            className="h-8 flex-1 min-w-[200px] text-xs bg-background"
            aria-label={isVi ? "Trách nhiệm nghiên cứu dự kiến trong dự án" : "Expected project responsibility"}
            placeholder={isVi ? "Vai trò/trách nhiệm nghiên cứu dự kiến (VD: Xử lý dữ liệu, Thiết kế thực nghiệm)..." : "Expected research responsibility (e.g., Data analysis, Experiments)..."}
            value={currentNote}
            onChange={e => setRoleNoteDraft(e.target.value)}
          />
          {roleNoteDraft !== null && roleNoteDraft.trim() !== (data.roleNote ?? "") ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={save.isPending}
              onClick={() => save.mutate({ shared: data.shared, roleNote: currentNote })}
            >
              {isVi ? "Lưu vai trò" : "Save note"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {save.isError ? <p role="alert" className="text-xs text-destructive">{t(mentorshipError(save.error))}</p> : null}
    </section>
  );
}
