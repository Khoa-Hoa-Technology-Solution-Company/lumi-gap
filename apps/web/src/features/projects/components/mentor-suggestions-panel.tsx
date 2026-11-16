import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Inbox,
  ListPlus,
  Send,
  UserCheck,
  UserMinus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { AvailableMentor, MentorSuggestion, MentorSuggestionScope } from "@trend/shared-types";
import { academicSupportApi } from "@/features/projects/api/academic-support.api";
import { mentorshipError } from "@/features/projects/components/mentoring-preferences";
import { AddMentorCandidate } from "@/features/projects/components/mentor-recruitment-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

function formatViDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("vi-VN");
}

function roleLabel(role?: "PRIMARY" | "SECONDARY") {
  return role === "SECONDARY" ? "Cố vấn phụ" : "Cố vấn chính";
}

function toAvailableMentorStub(s: MentorSuggestion): AvailableMentor {
  return {
    _id: s.mentorUser._id,
    fullName: s.mentorUser.fullName ?? "Giảng viên",
    avatarUrl: s.mentorUser.avatarUrl,
    positionTitle: s.mentorUser.positionTitle,
    institutionName: s.mentorUser.institutionName,
    academicRole: s.mentorUser.academicRole ?? "LECTURER",
    verifiedLecturer: s.mentorUser.verifiedLecturer ?? true,
    expertiseAreas: s.expertiseAreas ?? [],
    researchInterests: [],
    matchedTerms: [],
    sameInstitution: false,
    acceptingMentorships: true,
  };
}

function SuggestionStatusBadge({ item }: { item: MentorSuggestion }) {
  if (item.status === "PENDING") {
    return (
      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
        <Clock className="h-3 w-3" aria-hidden="true" />
        Đang chờ chủ dự án xem xét
      </Badge>
    );
  }
  if (item.status === "INVITED") {
    return (
      <Badge variant="secondary" className="gap-1 bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
        <Send className="h-3 w-3" aria-hidden="true" />
        Chủ dự án đã gửi lời mời chính thức
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <XCircle className="h-3 w-3" aria-hidden="true" />
      Đề xuất đã được bỏ qua
    </Badge>
  );
}

function SecondaryOutcomePills({ item }: { item: MentorSuggestion }) {
  return (
    <>
      {item.status === "PENDING" && item.inRecruitmentPlan && (
        <Badge variant="outline" className="border-indigo-300 bg-indigo-50/70 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
          Đã đưa vào kế hoạch mời ({roleLabel(item.plannedRole)})
        </Badge>
      )}
      {item.status === "INVITED" && (item.requestStatus === "ACCEPTED" || item.hasActiveRelationship) && (
        <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Giảng viên đã chấp nhận hướng dẫn dự án
        </Badge>
      )}
      {item.status === "INVITED" && item.requestStatus === "DECLINED" && (
        <Badge variant="outline" className="text-muted-foreground">
          Giảng viên đã từ chối lời mời chính thức
        </Badge>
      )}
      {item.status === "INVITED" && item.requestStatus === "EXPIRED" && (
        <Badge variant="outline" className="text-muted-foreground">
          Lời mời chính thức đã hết hạn
        </Badge>
      )}
      {item.status === "PENDING" && item.hasPendingRequest && (
        <Badge variant="outline" className="text-blue-700 border-blue-200">
          Đang có lời mời chờ phản hồi
        </Badge>
      )}
      {item.status === "PENDING" && item.hasActiveRelationship && (
        <Badge variant="outline" className="text-emerald-700 border-emerald-200">
          Đã là cố vấn dự án
        </Badge>
      )}
    </>
  );
}

export function OwnerMentorSuggestionsInbox({
  projectId,
  disabled = false,
  onOpenPlan,
}: {
  projectId: string;
  disabled?: boolean;
  onOpenPlan: () => void;
}) {
  const { t } = useI18n();
  const userId = useAuthStore(s => s.user?.id);
  const cache = useQueryClient();
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [page, setPage] = useState(1);
  const [addingCandidate, setAddingCandidate] = useState<AvailableMentor>();
  const [dismissTarget, setDismissTarget] = useState<MentorSuggestion>();
  const [dismissReason, setDismissReason] = useState("");

  const suggestions = useQuery({
    queryKey: ["academic-support", userId, "suggestions-inbox", projectId, scope, page],
    queryFn: () => academicSupportApi.suggestions(projectId, page, scope as MentorSuggestionScope),
    enabled: Boolean(userId && projectId),
  });

  const dismiss = useMutation({
    mutationFn: () => academicSupportApi.dismissSuggestion(projectId, dismissTarget!.id, dismissReason),
    onSuccess: () => {
      toast.success("Đã bỏ qua đề xuất cố vấn và thông báo cho thành viên đề xuất.");
      setDismissTarget(undefined);
      setDismissReason("");
      void cache.invalidateQueries({ queryKey: ["academic-support"] });
    },
  });

  const pendingCount = suggestions.data?.counts?.pending ?? suggestions.data?.items.filter(i => i.status === "PENDING").length ?? 0;
  const totalCount = suggestions.data?.counts?.total ?? suggestions.data?.meta.total ?? 0;
  const items = suggestions.data?.items ?? [];

  if (suggestions.isLoading) return <Skeleton className="h-24 w-full rounded-2xl" />;
  if (suggestions.isError || !suggestions.data) return null;
  if (totalCount === 0 && scope === "pending") return null;

  return (
    <section
      id={`owner-mentor-suggestions-${projectId}`}
      aria-label="Đề xuất từ thành viên"
      className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Inbox className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Đề xuất từ thành viên</h3>
              <Badge variant={pendingCount > 0 ? "default" : "secondary"} className="tabular-nums text-xs">
                {pendingCount} đang chờ xem xét
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Các giảng viên do thành viên gợi ý nội bộ. Giảng viên chỉ nhận được thông báo khi bạn gửi lời mời chính thức.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${scope === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setScope("pending"); setPage(1); }}
          >
            Đang chờ ({pendingCount})
          </button>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${scope === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setScope("all"); setPage(1); }}
          >
            Tất cả ({totalCount})
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Không còn đề xuất nào đang chờ xem xét. Chuyển sang "Tất cả" để xem lịch sử xử lý.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map(item => {
            const lecturerName = item.mentorUser.fullName ?? "Giảng viên";
            const canAddToPlan =
              item.status === "PENDING" &&
              !disabled &&
              !item.inRecruitmentPlan &&
              !item.hasPendingRequest &&
              !item.hasActiveRelationship &&
              item.acceptingMentorships !== false;

            return (
              <li key={item.id} className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{lecturerName}</span>
                      {Boolean(item.mentorUser.verifiedLecturer && !lecturerName.includes("Demo")) && (
                        <BadgeCheck size={16} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                      )}
                      {item.acceptingMentorships !== false ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          <UserCheck className="h-3 w-3" aria-hidden="true" />
                          Đang nhận hướng dẫn
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Hiện tạm ngưng nhận hướng dẫn
                        </span>
                      )}
                    </div>

                    {(item.mentorUser.positionTitle || item.mentorUser.institutionName) && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{[item.mentorUser.positionTitle, item.mentorUser.institutionName].filter(Boolean).join(" · ")}</span>
                      </p>
                    )}

                    {Boolean(item.expertiseAreas?.length) && (
                      <div className="flex flex-wrap gap-1">
                        {item.expertiseAreas!.slice(0, 5).map(area => (
                          <span key={area} className="mentor-tag-neutral">{area}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <SuggestionStatusBadge item={item} />
                    <SecondaryOutcomePills item={item} />
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Thành viên đề xuất: <strong className="font-medium text-foreground">{item.suggestedBy.fullName ?? "Thành viên nhóm"}</strong>
                    </span>
                    <span>Gửi ngày {formatViDate(item.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">{item.message}</p>
                </div>

                {item.status === "DISMISSED" && item.dismissReason && (
                  <p className="text-xs text-muted-foreground">
                    Ghi chú bỏ qua: <span className="text-foreground/90">{item.dismissReason}</span>
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Link
                    target="_blank"
                    rel="noopener noreferrer"
                    to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <span>Xem hồ sơ giảng viên</span>
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>

                  {item.status === "PENDING" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => { setDismissTarget(item); setDismissReason(""); dismiss.reset(); }}
                      >
                        <UserMinus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Bỏ qua
                      </Button>

                      {item.inRecruitmentPlan ? (
                        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onOpenPlan}>
                          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          Mở kế hoạch mời
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!canAddToPlan}
                          onClick={() => setAddingCandidate(toAvailableMentorStub(item))}
                        >
                          <ListPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          Thêm vào kế hoạch mời
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {suggestions.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Trước
          </Button>
          <span className="tabular-nums text-muted-foreground">Trang {page}/{suggestions.data.meta.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= suggestions.data.meta.totalPages} onClick={() => setPage(p => p + 1)}>
            Sau
          </Button>
        </div>
      )}

      {addingCandidate && (
        <AddMentorCandidate
          projectId={projectId}
          mentor={addingCandidate}
          onClose={() => setAddingCandidate(undefined)}
        />
      )}

      <Dialog open={Boolean(dismissTarget)} onOpenChange={open => { if (!open && !dismiss.isPending) setDismissTarget(undefined); }}>
        <DialogContent className="sm:max-w-lg" data-no-i18n>
          <DialogHeader>
            <DialogTitle>Bỏ qua đề xuất cố vấn?</DialogTitle>
            <DialogDescription>
              Đề xuất mời {dismissTarget?.mentorUser.fullName ?? "giảng viên này"} sẽ được đóng trong nội bộ nhóm. Giảng viên chưa từng nhận thông báo hay lời mời.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <label htmlFor={`dismiss-reason-${projectId}`} className="font-medium block">
              Ghi chú gửi thành viên đề xuất (không bắt buộc)
            </label>
            <textarea
              id={`dismiss-reason-${projectId}`}
              rows={3}
              maxLength={500}
              disabled={dismiss.isPending}
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              placeholder="Ví dụ: Nhóm đã ưu tiên hướng tiếp cận khác hoặc vị trí cố vấn hiện đã đủ ứng viên."
              className="w-full rounded-md border bg-background p-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {dismiss.error && (
            <p role="alert" className="text-sm text-destructive">{t(mentorshipError(dismiss.error))}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={dismiss.isPending} onClick={() => setDismissTarget(undefined)}>
              Hủy
            </Button>
            <Button type="button" variant="destructive" disabled={dismiss.isPending} onClick={() => void dismiss.mutateAsync()}>
              {dismiss.isPending ? "Đang xử lý…" : "Xác nhận bỏ qua"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function MemberMentorSuggestionsList({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const userId = useAuthStore(s => s.user?.id);
  const [page, setPage] = useState(1);

  const suggestions = useQuery({
    queryKey: ["academic-support", userId, "my-suggestions", projectId, page],
    queryFn: () => academicSupportApi.suggestions(projectId, page, "mine"),
    enabled: Boolean(userId && projectId),
  });

  if (suggestions.isLoading) return <Skeleton className="h-24 w-full rounded-2xl" />;
  if (suggestions.isError || !suggestions.data) return null;

  const items = suggestions.data.items;
  const total = suggestions.data.counts?.mine ?? suggestions.data.meta.total;
  const pending = suggestions.data.counts?.minePending ?? items.filter(i => i.status === "PENDING").length;

  return (
    <section
      id={`my-mentor-suggestions-${projectId}`}
      aria-label="Đề xuất của tôi"
      className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">Đề xuất của tôi</h3>
          <Badge variant="secondary" className="tabular-nums text-xs">
            {total} đề xuất{pending > 0 ? ` · ${pending} đang chờ` : ""}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Theo dõi trạng thái xem xét nội bộ từ chủ dự án.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Bạn chưa đề xuất giảng viên nào cho dự án này. Hãy chọn giảng viên phù hợp bên dưới và nhấn "Đề xuất cố vấn".
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map(item => {
            const lecturerName = item.mentorUser.fullName ?? "Giảng viên";
            return (
              <li key={item.id} className="rounded-xl border border-border/70 bg-background/60 p-3.5 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-sm text-foreground">{lecturerName}</span>
                      {Boolean(item.mentorUser.verifiedLecturer && !lecturerName.includes("Demo")) && (
                        <BadgeCheck size={15} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                      )}
                    </div>
                    {(item.mentorUser.positionTitle || item.mentorUser.institutionName || item.expertiseAreas?.length) && (
                      <p className="text-xs text-muted-foreground">
                        {[item.mentorUser.positionTitle, item.mentorUser.institutionName, ...(item.expertiseAreas ?? []).slice(0, 2)].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SuggestionStatusBadge item={item} />
                    <SecondaryOutcomePills item={item} />
                  </div>
                </div>

                <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2">
                  {item.message}
                </p>

                {item.status === "DISMISSED" && (
                  <p className="text-xs text-muted-foreground">
                    Đề xuất nội bộ đã được chủ dự án bỏ qua; giảng viên chưa nhận được lời mời.
                    {item.dismissReason ? ` Ghi chú: ${item.dismissReason}` : ""}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Đã gửi {formatViDate(item.createdAt)}</span>
                  <Link
                    target="_blank"
                    rel="noopener noreferrer"
                    to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <span>Xem hồ sơ giảng viên</span>
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {suggestions.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Trước
          </Button>
          <span className="tabular-nums text-muted-foreground">Trang {page}/{suggestions.data.meta.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= suggestions.data.meta.totalPages} onClick={() => setPage(p => p + 1)}>
            Sau
          </Button>
        </div>
      )}
    </section>
  );
}
