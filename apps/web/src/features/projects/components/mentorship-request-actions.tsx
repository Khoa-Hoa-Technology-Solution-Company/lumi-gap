import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MENTOR_SUPPORT_AREAS,
  mentorRoleLabelKeys,
  type MentorPolicyInput,
  type MentorRole,
  type MentorshipProposalHistoryEntry,
  type MentorshipRequest,
  type ResearchSupportType,
} from "@trend/shared-types";
import { AlertCircle, History, Loader2, MessageSquare, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";
import { defaultMentorPolicy, MentorPolicyFields } from "./mentor-access-workspace";
import { mentorshipError } from "./mentoring-preferences";
import { formatSupportLabel } from "./research-team-dossier-sheet";

export function MentorshipRevisionHistory({ history }: { history?: MentorshipProposalHistoryEntry[] }) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  if (!history || history.length <= 1) return null;

  return (
    <section className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5" aria-label={isVi ? "Lịch sử phiên bản điều kiện" : "Proposal version history"}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <History className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span>{isVi ? "Lịch sử phiên bản đề nghị" : "Proposal version history"}</span>
      </div>
      <ol className="space-y-2 text-xs">
        {history.map(entry => (
          <li key={entry.id} className="rounded-lg border border-border/70 bg-background px-3 py-2 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
                v{entry.proposalVersion} · {t(mentorRoleLabelKeys[entry.mentorRole])}
              </span>
              <Badge variant="outline" className="text-[10.5px]">
                {t(entry.status)}
              </Badge>
            </div>
            {entry.changeSummary ? (
              <p className="text-foreground/90">{entry.changeSummary}</p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {entry.requestedByName ? `${entry.requestedByName} · ` : ""}
              {new Date(entry.createdAt).toLocaleString(isVi ? "vi-VN" : "en-US")}
              {entry.accessPreset ? ` · ${entry.accessPreset} (${entry.accessPermissionCount ?? 0})` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MentorshipClarificationPanel({
  item,
}: {
  item: MentorshipRequest;
}) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const userId = useAuthStore(s => s.user?.id);
  const cache = useQueryClient();
  const [body, setBody] = useState("");
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());

  const messagesQuery = useQuery({
    queryKey: ["academic-support", userId, "request-messages", item.projectId, item.id],
    queryFn: () => academicSupportApi.messages(item.projectId, item.id),
    initialData: item.clarificationMessages,
    enabled: Boolean(userId && (item.viewer === "SENDER" || item.viewer === "RECIPIENT")),
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: () => academicSupportApi.sendMessage(item.projectId, item.id, { body: body.trim(), clientKey }),
    onSuccess: async () => {
      setBody("");
      setClientKey(crypto.randomUUID());
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["academic-support", userId, "request-messages", item.projectId, item.id] }),
        cache.invalidateQueries({ queryKey: ["academic-support", userId, "invitation-detail", item.projectId, item.id] }),
      ]);
      toast.success(isVi ? "Đã gửi nội dung trao đổi làm rõ." : "Clarification message sent.");
    },
  });

  if (item.viewer !== "SENDER" && item.viewer !== "RECIPIENT") return null;
  const messages = messagesQuery.data ?? [];

  return (
    <section className="rounded-xl border border-border/80 bg-muted/15 p-3.5 space-y-3" aria-label={isVi ? "Trao đổi làm rõ riêng tư" : "Private clarification"}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <MessageSquare className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>{isVi ? "Trao đổi thêm (riêng tư giữa hai bên)" : "Private clarification"}</span>
        </div>
        <p className="text-[11.5px] leading-4 text-muted-foreground">
          {isVi
            ? "Chỉ chủ dự án và giảng viên liên quan xem được trao đổi này. Không mở kênh chat nhóm và không cấp quyền truy cập dự án."
            : "Visible only to the project owner and this lecturer. Does not open internal team chat or grant project permissions."}
        </p>
      </div>

      {messages.length > 0 ? (
        <ol className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {messages.map(msg => (
            <li key={msg.id} className="rounded-lg border border-border/70 bg-background px-3 py-2 text-xs space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {msg.authorName}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({msg.authorRole === "LECTURER" ? (isVi ? "Giảng viên" : "Lecturer") : (isVi ? "Chủ dự án" : "Owner")})
                  </span>
                </span>
                <time className="text-[11px] text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleString(isVi ? "vi-VN" : "en-US")}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words leading-5 text-foreground/90">{msg.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          {isVi ? "Chưa có tin nhắn trao đổi nào." : "No clarification messages yet."}
        </p>
      )}

      {item.actions.clarify ? (
        <form
          className="space-y-2"
          onSubmit={e => {
            e.preventDefault();
            if (body.trim().length < 5 || sendMutation.isPending) return;
            sendMutation.mutate();
          }}
        >
          <textarea
            rows={2}
            minLength={5}
            maxLength={2000}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={isVi ? "Đặt câu hỏi làm rõ về mục tiêu, phương pháp, tần suất trao đổi hoặc phạm vi hướng dẫn (tối thiểu 5 ký tự)..." : "Clarify research goals, methods, schedule, or scope (at least 5 characters)..."}
            value={body}
            disabled={sendMutation.isPending}
            onChange={e => setBody(e.target.value)}
          />
          {sendMutation.isError ? (
            <p role="alert" className="text-xs text-destructive">{t(mentorshipError(sendMutation.error))}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={body.trim().length < 5 || sendMutation.isPending}>
              {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3 w-3" aria-hidden="true" />}
              <span>{isVi ? "Gửi trao đổi" : "Send clarification"}</span>
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function MentorshipCounterProposalDialog({
  item,
  onClose,
  onCreated,
}: {
  item: MentorshipRequest;
  onClose: () => void;
  onCreated?: (next: MentorshipRequest) => void;
}) {
  const { t, language } = useI18n();
  const isVi = language === "vi";
  const cache = useQueryClient();
  const isOwnerActing = item.direction === "LECTURER_TO_PROJECT";

  const [mentorRole, setMentorRole] = useState<MentorRole>(item.mentorRole ?? "UNASSIGNED");
  const [supportAreas, setSupportAreas] = useState<ResearchSupportType[]>(
    item.terms?.supportAreas?.length ? [...item.terms.supportAreas] : ["RESEARCH_DIRECTION"],
  );
  const [frequency, setFrequency] = useState(item.terms?.availability?.frequency ?? "FLEXIBLE");
  const [duration, setDuration] = useState(item.terms?.availability?.duration ?? "FLEXIBLE");
  const [mode, setMode] = useState(item.terms?.availability?.mode ?? "FLEXIBLE");
  const [changeSummary, setChangeSummary] = useState("");
  const [message, setMessage] = useState("");
  const [requestedAccessNote, setRequestedAccessNote] = useState("");
  const [accessPolicy, setAccessPolicy] = useState<MentorPolicyInput>(() =>
    item.accessPolicy
      ? {
          preset: item.accessPolicy.preset,
          permissions: [...item.accessPolicy.permissions],
          expiresAt: item.accessPolicy.expiresAt,
        }
      : defaultMentorPolicy(),
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const submit = useMutation({
    mutationFn: () =>
      academicSupportApi.counterPropose(item.projectId, item.id, {
        mentorRole,
        supportAreas,
        availability: { frequency, duration, mode },
        changeSummary: changeSummary.trim(),
        message: message.trim(),
        ...(isOwnerActing
          ? { access: { preset: accessPolicy.preset, permissions: accessPolicy.permissions, expiresAt: accessPolicy.expiresAt } }
          : requestedAccessNote.trim()
            ? { requestedAccessNote: requestedAccessNote.trim() }
            : {}),
        expectedProposalVersion: item.proposalVersion ?? 1,
        idempotencyKey,
      }),
    onSuccess: async next => {
      await Promise.all(
        ["academic-support", "mentor-workspace", "notifications", "projects"].map(key =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success(
        isVi
          ? `Đã gửi đề xuất điều chỉnh (phiên bản v${next.proposalVersion ?? (item.proposalVersion ?? 1) + 1}). Bên kia cần xác nhận lại trước khi kích hoạt.`
          : `Proposed terms revision v${next.proposalVersion ?? (item.proposalVersion ?? 1) + 1} sent for fresh confirmation.`,
      );
      onCreated?.(next);
      onClose();
    },
  });

  const canSubmit =
    supportAreas.length > 0 &&
    changeSummary.trim().length >= 5 &&
    message.trim().length >= 10 &&
    !submit.isPending;

  return (
    <Dialog open onOpenChange={open => { if (!open && !submit.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>{isVi ? "Đề xuất điều chỉnh điều kiện hợp tác" : "Propose Changes"}</span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {isVi
              ? `Phiên bản hiện tại (v${item.proposalVersion ?? 1}) sẽ chuyển sang trạng thái đã bị thay thế và tạo phiên bản v${(item.proposalVersion ?? 1) + 1}. Quan hệ hướng dẫn chỉ được kích hoạt khi cả hai bên đồng thuận cùng phiên bản.`
              : `Current version v${item.proposalVersion ?? 1} will be superseded by v${(item.proposalVersion ?? 1) + 1}. Mentorship activates only when both parties accept the exact same version.`}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            if (!canSubmit) return;
            submit.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="counter-role" className="text-xs font-semibold">{isVi ? "Vai trò cố vấn đề xuất" : "Proposed mentor role"}</Label>
            <select
              id="counter-role"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={mentorRole}
              onChange={e => setMentorRole(e.target.value as MentorRole)}
            >
              {(["UNASSIGNED", "PRIMARY", "SECONDARY"] as const).map(role => (
                <option key={role} value={role}>{t(mentorRoleLabelKeys[role])}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{isVi ? "Phạm vi nội dung hỗ trợ *" : "Support scope *"}</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {MENTOR_SUPPORT_AREAS.map(area => {
                const checked = supportAreas.includes(area.id);
                return (
                  <label key={area.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSupportAreas(prev =>
                          prev.includes(area.id) ? prev.filter(x => x !== area.id) : [...prev, area.id],
                        )
                      }
                    />
                    <span>{formatSupportLabel(area.id, language, t)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3 text-xs">
            <label className="space-y-1">
              <span className="text-muted-foreground">{isVi ? "Tần suất" : "Frequency"}</span>
              <select className="h-8 w-full rounded-md border bg-background px-2" value={frequency} onChange={e => setFrequency(e.target.value)}>
                <option value="FLEXIBLE">{isVi ? "Thống nhất sau" : "Flexible"}</option>
                <option value="WEEKLY">{isVi ? "Hàng tuần" : "Weekly"}</option>
                <option value="BIWEEKLY">{isVi ? "2 tuần/lần" : "Biweekly"}</option>
                <option value="MILESTONE_BASED">{isVi ? "Theo mốc" : "By milestone"}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">{isVi ? "Thời gian" : "Duration"}</span>
              <select className="h-8 w-full rounded-md border bg-background px-2" value={duration} onChange={e => setDuration(e.target.value)}>
                <option value="FLEXIBLE">{isVi ? "Trao đổi thêm" : "Flexible"}</option>
                <option value="1_SEMESTER">{isVi ? "1 học kỳ" : "1 semester"}</option>
                <option value="2_SEMESTERS">{isVi ? "2 học kỳ" : "2 semesters"}</option>
                <option value="FULL_PROJECT">{isVi ? "Toàn dự án" : "Full project"}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">{isVi ? "Hình thức" : "Mode"}</span>
              <select className="h-8 w-full rounded-md border bg-background px-2" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="FLEXIBLE">{isVi ? "Linh hoạt" : "Flexible"}</option>
                <option value="ONLINE">{isVi ? "Trực tuyến" : "Online"}</option>
                <option value="HYBRID">{isVi ? "Kết hợp" : "Hybrid"}</option>
                <option value="IN_PERSON">{isVi ? "Trực tiếp" : "In person"}</option>
              </select>
            </label>
          </div>

          {isOwnerActing ? (
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {isVi ? "Điều chỉnh quyền truy cập dự kiến (chỉ chủ dự án)" : "Update prospective access policy (Owner only)"}
              </p>
              <MentorPolicyFields projectId={item.projectId} value={accessPolicy} onChange={setAccessPolicy} disabled={submit.isPending} />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="counter-access-note" className="text-xs font-semibold">
                {isVi ? "Đề xuất điều chỉnh quyền truy cập để chủ dự án xem xét (không bắt buộc)" : "Note on access permissions for owner review (optional)"}
              </Label>
              <input
                id="counter-access-note"
                type="text"
                maxLength={500}
                className="h-8 w-full rounded-md border bg-background px-2.5 text-xs"
                placeholder={isVi ? "VD: Đề nghị mở thêm quyền xem bản thảo khi bắt đầu vòng góp ý..." : "Example: Request manuscript review access once drafts are ready..."}
                value={requestedAccessNote}
                onChange={e => setRequestedAccessNote(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="counter-summary" className="text-xs font-semibold">{isVi ? "Tóm tắt nội dung thay đổi *" : "Summary of changes *"}</Label>
            <input
              id="counter-summary"
              type="text"
              required
              minLength={5}
              maxLength={500}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              placeholder={isVi ? "VD: Điều chỉnh vai trò sang Cố vấn phụ và cập nhật phạm vi góp ý phương pháp" : "Example: Switch role to Secondary mentor and refine methodology scope"}
              value={changeSummary}
              onChange={e => { setChangeSummary(e.target.value); if (submit.isError) { setIdempotencyKey(crypto.randomUUID()); submit.reset(); } }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="counter-message" className="text-xs font-semibold">{isVi ? "Lời nhắn giải thích *" : "Explanation message *"}</Label>
            <textarea
              id="counter-message"
              rows={3}
              required
              minLength={10}
              maxLength={2000}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={isVi ? "Giải thích ngắn gọn lý do đề xuất điều chỉnh..." : "Briefly explain the proposed adjustments..."}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          {submit.isError ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{t(mentorshipError(submit.error))}</p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" disabled={submit.isPending} onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" disabled={!canSubmit}>
              {submit.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {isVi ? "Gửi đề xuất điều chỉnh" : "Send revised proposal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
