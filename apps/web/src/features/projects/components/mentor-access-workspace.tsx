import { MentorSharedPaper } from "./mentor-paper-sharing";
import { automaticTaskStatuses } from "../my-work-model";
import { caseStatusLabels } from "./screening-case-controls";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { AlertTriangle, FileText, Send, ShieldCheck, MessageSquare, MessagesSquare, CornerDownRight, Clock, Users, ExternalLink } from "lucide-react";
import { useSubmissions } from "@/features/submissions";
import { Badge } from "@/components/ui/badge";
import { mentorDefaultPermissions, creditRoles, type MentorAccessWorkspace as WorkspaceData, type MentorAccessPolicy, type MentorPolicyInput, type MentorPermission, type MentorResourceKind, type MentorFeedback, type MentorAgreement } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { mentorAccessApi } from "../api/mentor-access.api";
import { screeningApi } from "../api/screening.api";
import { canLeaveWorkspace, useUnsavedWorkspace, WorkspaceLoading } from "./workspace-common";
import { MentorMessageThread } from "./mentor-message-thread";
import "../mentor-access.css";

const kindLabels: Record<MentorResourceKind, string> = { OVERVIEW: "Tổng quan", PAPER: "Bài báo", GAP: "Cơ hội nghiên cứu", TASK: "Công việc", MILESTONE: "Cột mốc", MANUSCRIPT: "Phần bản thảo", SUBMISSION: "Nộp bài", CONTRIBUTION: "Đóng góp" };
const sectionLabels: Record<string, string> = { abstract: "Tóm tắt", introduction: "Giới thiệu", methodology: "Phương pháp", results: "Kết quả", discussion: "Thảo luận", conclusion: "Kết luận", appendix: "Phụ lục được duyệt" };
const statusLabels: Record<string, string> = { PENDING: "Chờ xử lý", ACCEPTED: "Đã chấp nhận", REJECTED: "Đã từ chối", RESOLVED: "Đã giải quyết", PROPOSED: "Chờ thống nhất", WITHDRAWN: "Đã rút lại", CANCELLED: "Đã hủy", EXPIRED: "Hết hạn" };
const roleLabels: Record<string, string> = { CONCEPTUALIZATION: "Hình thành ý tưởng", DATA_CURATION: "Quản lý dữ liệu", FORMAL_ANALYSIS: "Phân tích", FUNDING_ACQUISITION: "Huy động kinh phí", INVESTIGATION: "Thực hiện nghiên cứu", METHODOLOGY: "Phương pháp", PROJECT_ADMINISTRATION: "Điều phối", RESOURCES: "Nguồn lực", SOFTWARE: "Phần mềm", SUPERVISION: "Hướng dẫn", VALIDATION: "Kiểm chứng", VISUALIZATION: "Trực quan hóa", WRITING_ORIGINAL_DRAFT: "Viết bản đầu", WRITING_REVIEW_EDITING: "Rà soát và biên tập" };
const denied = (error: unknown) => isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0);
export function MentorPolicySummary({ policy }: { policy?: MentorAccessPolicy }) { if (!policy) return null; return <p className="text-sm text-muted-foreground">Cố vấn chỉ xem tổng quan và nội dung được chia sẻ. Không có quyền sửa bản gốc hoặc quản trị dự án.</p>; }
function AccessError({ error }: { error: unknown }) { if (!error) return null; const message = isAxiosError(error) ? error.response?.data?.error?.message : null; return <p role="alert" className="mentor-access-error">{typeof message === "string" && /[À-ỹĐđ]/.test(message) ? message : "Chưa thể thực hiện. Bản nháp vẫn được giữ, vui lòng thử lại."}</p>; }
function useAccessCommand(projectId: string) {
  const cache = useQueryClient(), busy = useRef(false), attempt = useRef<{ text: string; key: string }>();
  const mutation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: async () => { await Promise.all([cache.invalidateQueries({ queryKey: ["mentor-access"] }), cache.invalidateQueries({ queryKey: ["academic-support"] }), cache.invalidateQueries({ queryKey: ["mentor-workspace"] }), cache.invalidateQueries({ queryKey: ["reviews"] }), cache.invalidateQueries({ queryKey: ["review-requests"] }), cache.invalidateQueries({ queryKey: ["submissions"] })]); } });
  const run = async (body: unknown, execute: (key: string) => Promise<unknown>) => { if (busy.current) return false; const text = JSON.stringify([projectId, body]); if (attempt.current?.text !== text) attempt.current = { text, key: crypto.randomUUID() }; busy.current = true; try { await mutation.mutateAsync(() => execute(attempt.current!.key)); attempt.current = undefined; return true; } catch { return false; } finally { busy.current = false; } };
  return { ...mutation, run };
}
function PageButtons({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (value: number) => void }) { if (page === 1 && !hasNext) return null; return <nav className="mentor-access-actions" aria-label="Phân trang"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trang trước</Button><span>Trang {page}</span><Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => onPage(page + 1)}>Trang sau</Button></nav>; }
export const defaultMentorPolicy = (): MentorPolicyInput => ({ preset: "ADVISOR", permissions: [...mentorDefaultPermissions], expiresAt: null, shares: [] });
export function MentorPolicyFields(_props: { projectId: string; value: MentorPolicyInput; onChange: (value: MentorPolicyInput) => void; disabled?: boolean }) {
 return <p className="text-sm text-muted-foreground">Sau khi chấp nhận, cố vấn có thể xem tổng quan và trao đổi với nhóm. Bài báo và phiên bản bản thảo chỉ được mở khi nhóm chủ động chia sẻ hoặc gửi góp ý.</p>;
}

type MentorWorkspaceMode = "manage" | "conversation" | "all";
function conversationHref(projectId: string, accessId: string, page: number) {
  const params = new URLSearchParams({ tab: "chat", channel: "mentors", mentorAccess: accessId, mentorPage: String(page) });
  return `/projects/${encodeURIComponent(projectId)}?${params}`;
}
function mentorInitials(name?: string) {
  const clean = (name ?? "").replace(/\([^)]*\)/g, "").replace(/\b(TS|ThS|GS|PGS|Dr|Prof)\b\.?/gi, "").trim() || name || "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toLocaleUpperCase("vi-VN");
  return parts[0]?.slice(0, 2).toLocaleUpperCase("vi-VN") || "GV";
}
function policyPriority(entry: Entry): number {
  if (entry.policy.effective && !entry.policy.revokedAt) return 0;
  if (entry.invitationState === "ACCEPTED" && !entry.policy.revokedAt) return 1;
  if (entry.invitationState === "PENDING" && !entry.policy.revokedAt) return 2;
  return 3;
}
function policyStatusText(p: Entry): string {
  if (p.policy.revokedAt) return "Đã thu hồi";
  if (p.policy.effective) return "Đang hướng dẫn";
  if (p.policy.expiresAt && new Date(p.policy.expiresAt) <= new Date()) return "Hết hạn truy cập";
  if (p.invitationState === "PENDING") return "Chờ chấp nhận";
  return statusLabels[p.invitationState] ?? "Chưa có quyền";
}
export function MentorAccessWorkspace({
  projectId,
  mentorView = false,
  mode = mentorView ? "all" : "manage",
  focusMentorId,
  embedded = false,
}: {
  projectId: string;
  mentorView?: boolean;
  mode?: MentorWorkspaceMode;
  focusMentorId?: string;
  embedded?: boolean;
}) {
  const [params] = useSearchParams();
  const requestedPage = Number(params.get("mentorPage"));
  const actorId = useAuthStore(s => s.user?.id), [selected, setSelected] = useState(params.get("mentorAccess") ?? ""), [page, setPage] = useState(mode === "conversation" && Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1);
  const [showInactive, setShowInactive] = useState(false);
  const query = useQuery({ queryKey: ["mentor-access", actorId, projectId, "workspace", page], queryFn: () => mentorAccessApi.workspace(projectId, page), retry: false, refetchInterval: 5000 });
  const forbidden = denied(query.error);

  const rawPolicies = query.data
    ? (mode === "conversation"
        ? query.data.policies.filter(p => p.invitationState === "ACCEPTED" || p.policy.relationshipId)
        : [...query.data.policies].sort((a, b) => policyPriority(a) - policyPriority(b)))
    : [];

  useEffect(() => {
    if (!focusMentorId || !rawPolicies.length) return;
    const target = rawPolicies.find(p => p.mentorId === focusMentorId);
    if (target) setSelected(target.policy.id);
  }, [focusMentorId, rawPolicies.length]);

  if (query.isLoading) return <WorkspaceLoading />;
  if (!query.data || forbidden) return <section className={`mentor-access-workspace ${embedded ? "is-embedded" : ""}`} data-no-i18n><h2>Không gian cố vấn chưa khả dụng</h2><p>Cần lời mời được hai bên chấp nhận và quyền truy cập còn hiệu lực.</p><AccessError error={query.error} /><Button variant="outline" onClick={() => void query.refetch()}>Tải lại</Button></section>;
  const data = query.data;
  const policies = rawPolicies;
  const activePolicies = policies.filter(p => policyPriority(p) <= 2);
  const inactivePolicies = policies.filter(p => policyPriority(p) > 2);
  const visibleManagePolicies = mode === "manage" && !showInactive && activePolicies.length > 0 ? activePolicies : policies;
  const entry = selected ? policies.find(p => p.policy.id === selected) : (visibleManagePolicies[0] ?? policies[0]);

  return <section className={`mentor-access-workspace ${mode === "conversation" ? "mentor-conversation-workspace" : ""} ${embedded ? "is-embedded" : ""}`} data-no-i18n>
    {!embedded && mode !== "conversation" && (
      <header>
        <h2>{mentorView ? data.title : "Tài liệu đã chia sẻ"}</h2>
        <p>{mentorView ? "Bạn chỉ xem được nội dung nhóm đã duyệt. Mã nguồn và cuộc trò chuyện nội bộ không được chia sẻ." : "Theo dõi bài báo đã chia sẻ và các phiên bản bản thảo đã gửi góp ý."}</p>
      </header>
    )}
    {mode === "conversation" && (
      <header className="mentor-chat-header">
        <div className="mentor-chat-header-title">
          <span className="mentor-chat-header-icon" aria-hidden="true">
            <MessagesSquare size={16} />
          </span>
          <div className="min-w-0">
            <h2>Nhóm và cố vấn</h2>
            {entry && <p className="mentor-chat-header-sub">{mentorView ? "Trao đổi trực tiếp cùng các thành viên nhóm nghiên cứu" : "Trao đổi trực tiếp với cố vấn hướng dẫn"}</p>}
          </div>
        </div>
        <div className="mentor-chat-header-controls">
          {((!entry || policies.length > 1) && policies.length > 0) && (
            <label className="mentor-chat-picker">
              <span className="sr-only">Cuộc trò chuyện</span>
              <select aria-label="Chọn cố vấn để trao đổi" value={entry?.policy.id ?? ""} onChange={async e => { const next = e.target.value; if (await canLeaveWorkspace()) setSelected(next); }}>
                {!entry && <option value="" disabled>Chọn cố vấn trên trang này</option>}
                {policies.map(p => <option key={p.policy.id} value={p.policy.id}>{`${p.mentorName}${p.policy.effective ? "" : " · Chỉ đọc"}`}</option>)}
              </select>
            </label>
          )}
          {entry && <MentorChatParticipants entry={entry} basics={data.basics} />}
        </div>
      </header>
    )}
    <AccessError error={query.error} />
    {mentorView && mode !== "conversation" && (
      <div className="space-y-4">
        <MentorSubmissionTasks projectId={projectId} />
        <MentorAdjudicationTasks projectId={projectId} />
      </div>
    )}
    {!policies.length ? <p className="p-4 text-xs text-muted-foreground">{mode === "conversation" ? "Chưa có cố vấn đã nhận hướng dẫn trên trang này. Khi lời mời được chấp nhận, nhóm có thể bắt đầu trao đổi tại đây." : "Chưa có quyền cố vấn. Chủ dự án có thể gửi lời mời trong mục Tìm cố vấn."}</p> : <>
      {mode === "manage" ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Chọn cố vấn để quản lý quyền">
            {visibleManagePolicies.map(p => {
              const isSelected = p.policy.id === entry?.policy.id;
              const isEffective = p.policy.effective && !p.policy.revokedAt;
              const isPending = p.invitationState === "PENDING" && !p.policy.revokedAt;
              return (
                <button
                  key={p.policy.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={async () => { if (await canLeaveWorkspace()) setSelected(p.policy.id); }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-primary/40 bg-background text-foreground shadow-2xs ring-1 ring-primary/15"
                      : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isEffective ? "bg-emerald-500" : isPending ? "bg-amber-500" : "bg-muted-foreground/45"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="max-w-[200px] truncate">{p.mentorName}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">· {policyStatusText(p)}</span>
                </button>
              );
            })}
          </div>
          {inactivePolicies.length > 0 && activePolicies.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive(v => !v)}
              className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {showInactive ? "Ẩn lời mời đã hủy/thu hồi" : `+${inactivePolicies.length} lời mời đã hủy/thu hồi`}
            </button>
          )}
        </div>
      ) : mode !== "conversation" ? (
        <label>Cố vấn và lời mời<select aria-label="Chọn cố vấn để quản lý quyền" value={entry?.policy.id ?? ""} onChange={async e => { const next = e.target.value; if (await canLeaveWorkspace()) setSelected(next); }}>
          {!entry && <option value="" disabled>Chọn cố vấn trên trang này</option>}
          {policies.map(p => <option key={p.policy.id} value={p.policy.id}>{`${p.mentorName} · ${statusLabels[p.invitationState]} · ${policyStatusText(p)}`}</option>)}
        </select></label>
      ) : null}
      {entry && (mode === "conversation" ? <MentorConversationPanel key={entry.policy.id} projectId={projectId} entry={entry} readOnly={data.readOnly || !entry.policy.effective} actorId={data.viewerId} /> : <AccessEntry key={entry.policy.id} projectId={projectId} data={data} entry={entry} actorId={data.viewerId} showCollaboration={mode === "all"} page={page} embedded={embedded} />)}
    </>}
    {selected && !entry && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">Cuộc trao đổi này không còn ở trang hiện tại hoặc bạn không còn quyền truy cập. Hãy chọn cố vấn hoặc chuyển trang.</p>}
    {!mentorView && mode === "conversation" && <div className="border-t border-border/60 px-4 py-2"><Button asChild variant="link" className="h-auto p-0 text-xs"><Link to={`/projects/${encodeURIComponent(projectId)}?tab=support`}>Tìm cố vấn và quản lý lời mời</Link></Button></div>}
    {data.total > data.pageSize && <PageButtons page={page} hasNext={data.hasNext} onPage={next => { void (async () => { if (await canLeaveWorkspace()) { setSelected(""); setPage(next); } })(); }} />}
  </section>;
}

type Entry = WorkspaceData["policies"][number];
function MentorChatParticipants({ entry, basics }: { entry: Entry; basics: WorkspaceData["basics"] }) {
  const people = [...new Map([
    { id: entry.mentorId, name: entry.mentorName, role: "Cố vấn" },
    ...(basics?.team.filter(person => person.id !== entry.mentorId).map(person => ({ ...person, role: person.role === "OWNER" ? "Chủ dự án" : "Thành viên" })) ?? []),
  ].map(person => [person.id, person])).values()];
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline" size="sm" className="mentor-chat-participants-btn h-8 gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
    <Users size={14} className="shrink-0" aria-hidden="true" /><span className="min-w-0 truncate max-w-[260px]">{entry.mentorName} · {basics ? `${people.length} người tham gia` : "Cố vấn và nhóm dự án"}</span>
  </Button></DialogTrigger><DialogContent className="sm:max-w-md" closeLabel="Đóng danh sách người tham gia" data-no-i18n>
    <DialogTitle className="pr-8">Người tham gia{basics ? ` (${people.length})` : ""}</DialogTitle>
    <DialogDescription>Cuộc trò chuyện giữa cố vấn và các thành viên dự án.</DialogDescription>
    <ul className="max-h-[55dvh] divide-y overflow-y-auto">{people.map(person => <li key={person.id}><Link to={`/academics/${encodeURIComponent(person.id)}`} target="_blank" rel="noopener noreferrer" aria-label={`Mở hồ sơ ${person.name} (tab mới)`} className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold" aria-hidden="true">{person.name.trim().charAt(0).toLocaleUpperCase("vi-VN")}</span>
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.role}</p></div><ExternalLink size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link></li>)}</ul>
    {!basics && <p className="text-sm text-muted-foreground">Danh sách thành viên nhóm hiện chưa khả dụng.</p>}
  </DialogContent></Dialog>;
}
function MentorConversationPanel({ projectId, entry, readOnly, actorId }: { projectId: string; entry: Entry; readOnly: boolean; actorId: string }) {
  const command = useAccessCommand(projectId);
  return <MentorMessageThread projectId={projectId} entry={entry} readOnly={readOnly} actorId={actorId} pending={command.isPending} error={<AccessError error={command.error} />}
    onSend={(body, replyToId) => {
      const input = { shareId: null, replyToId, kind: "MESSAGE", body, creditRoles: [] };
      return command.run(input, clientKey => mentorAccessApi.comment(projectId, entry.policy.id, { ...input, clientKey }));
    }} />;
}

export function MentorSubmissionTasks({ projectId }: { projectId: string }) {
  const query = useSubmissions(projectId);
  const pendingSubmissions = query.data?.filter(s =>
    ["waiting_feedback", "submitted", "WAITING_FEEDBACK"].includes(s.status)
  ) ?? [];

  if (!pendingSubmissions.length) return null;

  return (
    <section aria-label="Bản thảo cần góp ý" className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-500/10 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" />
          Cần góp ý bản thảo ({pendingSubmissions.length})
        </h3>
      </div>
      <ul className="space-y-3">
        {pendingSubmissions.map(sub => (
          <li key={sub._id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium text-sm">{sub.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sub.submissionType?.replaceAll("_", " ") || "Bản thảo"} · Phiên bản v{sub.currentRevisionNumber} · Cập nhật {new Date(sub.updatedAt).toLocaleDateString("vi-VN")}
              </p>
            </div>
            <Button asChild size="sm">
              <Link to={`/projects/${encodeURIComponent(projectId)}?tab=submissions&submission=${sub._id}`}>
                Góp ý bản thảo
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MentorAdjudicationTasks({ projectId }: { projectId: string }) {
  const actorId = useAuthStore(s => s.user?.id);
  const query = useQuery({ queryKey: ["mentor-access", actorId, projectId, "adjudication-tasks"], queryFn: () => screeningApi.adjudicationTasks(projectId), retry: false, refetchInterval: 10000 });
  const ledger = useQuery({ queryKey: ["mentor-access", actorId, projectId, "automatic-tasks"], queryFn: () => screeningApi.automaticTasks(projectId), retry: false, refetchInterval: 10000 });
  const history = ledger.data?.filter(task => task.actionType === "ADJUDICATION" && task.endedAt).slice(0, 20) ?? [];
  return <section aria-label="Việc phân xử được giao" className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Cần tôi phân xử</h3><AccessError error={query.error} />{query.isLoading ? <p role="status">Đang tải công việc…</p> : query.data?.length ? <ul className="space-y-3">{query.data.map(task => <li key={task.roundId} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"><div className="min-w-0 flex-1"><p className="break-words font-medium">{task.title}</p><p className="text-sm text-muted-foreground">{caseStatusLabels[task.caseStatus ?? ""] ?? "Cần phân xử"} · {task.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề / tóm tắt"}</p></div><Button asChild size="sm"><Link to={`/academic-support/projects/${encodeURIComponent(projectId)}/screening/${task.roundId}${task.automaticTaskId ? `?automaticTask=${task.automaticTaskId}&taskReturn=${encodeURIComponent(`/academic-support/projects/${encodeURIComponent(projectId)}`)}` : ""}`}>Mở hồ sơ phân xử</Link></Button></li>)}</ul> : !query.error && <p className="text-sm text-muted-foreground">Chưa có bài cần bạn phân xử.</p>}{history.length > 0 && <details><summary className="cursor-pointer text-sm">Công việc đã kết thúc ({history.length})</summary><ul className="space-y-3 pt-3">{history.map(task => <li key={task.id} className="text-sm"><Link className="font-medium text-primary underline" to={`/academic-support/projects/${encodeURIComponent(projectId)}/screening/${task.roundId}?automaticTask=${task.id}&taskReturn=${encodeURIComponent(`/academic-support/projects/${encodeURIComponent(projectId)}`)}`}>{task.title}</Link><p className="text-muted-foreground">{automaticTaskStatuses[task.status]} · {task.reason}</p></li>)}</ul></details>}</section>;
}
const reviewResourceStatusMeta: Record<string, { label: string; className: string; dot: string }> = {
  REQUESTED: { label: "Chờ phản hồi", className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300", dot: "bg-amber-500" },
  ACCEPTED: { label: "Đã chấp nhận", className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  IN_REVIEW: { label: "Đang đánh giá", className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  REVISION_REQUESTED: { label: "Cần chỉnh sửa", className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  RESUBMITTED: { label: "Đã nộp lại", className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
  SUBMITTED: { label: "Đã có góp ý", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  COMPLETED: { label: "Đã hoàn tất", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  DECLINED: { label: "Đã từ chối", className: "border-border bg-muted/60 text-muted-foreground", dot: "bg-muted-foreground/50" },
  CANCELLED: { label: "Đã hủy", className: "border-border bg-muted/60 text-muted-foreground", dot: "bg-muted-foreground/50" },
};
function AccessEntry({ projectId, data, entry, actorId, showCollaboration, page, embedded = false }: { projectId: string; data: WorkspaceData; entry: Entry; actorId: string; showCollaboration: boolean; page: number; embedded?: boolean }) {
  const [revoke, setRevoke] = useState<string | null>(null), [revokeConfirmed, setRevokeConfirmed] = useState(false), command = useAccessCommand(projectId);
  const openRevoke = (target: string) => { setRevokeConfirmed(false); setRevoke(target); };
  const closeRevoke = () => { if (!command.isPending) { setRevoke(null); setRevokeConfirmed(false); } };
  const targetShare = revoke && revoke !== "access" ? entry.shares.find(s => s.id === revoke) : undefined;
  const totalSharedCount = entry.shares.length + (entry.reviewResources?.length ?? 0);
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/80 bg-card overflow-hidden divide-y divide-border/70">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
              {entry.mentorAvatarUrl ? <img src={entry.mentorAvatarUrl} alt="" className="h-9 w-9 rounded-xl object-cover" /> : mentorInitials(entry.mentorName)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link to={"/academics/" + entry.mentorId} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-semibold text-foreground hover:underline">
                  {entry.mentorName}
                </Link>
                <Badge
                  variant="outline"
                  className={`h-5 px-2 text-[11px] font-medium ${
                    entry.policy.effective && !entry.policy.revokedAt
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {policyStatusText(entry)}
                </Badge>
              </div>
              <p className="!my-0.5 truncate text-xs text-muted-foreground">
                {[
                  entry.mentorInstitution,
                  entry.mentorRole === "PRIMARY" ? "Cố vấn chính" : entry.mentorRole === "SECONDARY" ? "Cố vấn phụ" : null,
                  entry.startedAt ? `Từ ${new Date(entry.startedAt).toLocaleDateString("vi-VN")}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {!embedded && (
              <>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild>
                  <Link to={conversationHref(projectId, entry.policy.id, page)}>
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    Trao đổi
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                  <a href={"#resources-" + entry.policy.id}>Tài liệu đã chia sẻ</a>
                </Button>
              </>
            )}
            {data.canManage && !entry.policy.revokedAt && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => openRevoke("access")}>
                Kết thúc hướng dẫn
              </Button>
            )}
          </div>
        </header>

        <div id={"resources-" + entry.policy.id} className="px-4 py-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
              <h3 className="!m-0 !text-xs font-semibold uppercase tracking-wide text-foreground/85">Tài liệu đã chia sẻ</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {totalSharedCount}
              </span>
            </div>
          </div>

          {!totalSharedCount && (
            <p className="!m-0 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              Chưa có tài liệu nào được chia sẻ với cố vấn. Bạn có thể chia sẻ trực tiếp từ Thư viện hoặc gửi bản thảo để góp ý.
            </p>
          )}

          {entry.shares.map(resource => (
            <article key={resource.id} className="rounded-lg border border-border/75 bg-muted/15 px-3.5 py-2.5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="!m-0 text-[11.5px] text-muted-foreground">
                  {kindLabels[resource.kind]} · {resource.accessMode ? (resource.accessMode === "VIEW" ? "Chỉ xem" : "Xem và góp ý") : "Theo quyền đã chia sẻ trước đây"} · {new Date(resource.createdAt).toLocaleDateString("vi-VN")}
                </p>
                {(resource.canUnshare ?? data.canManage) && !data.readOnly && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => openRevoke(resource.id)}>
                    Ngừng chia sẻ
                  </Button>
                )}
              </div>
              {resource.kind === "PAPER" && resource.accessMode ? (
                <MentorSharedPaper projectId={projectId} accessId={entry.policy.id} version={entry.policy.version} resource={resource} />
              ) : (
                <SharedResourceText projectId={projectId} accessId={entry.policy.id} version={entry.policy.version} resource={resource} />
              )}
            </article>
          ))}

          {entry.reviewResources?.map(resource => {
            const st = reviewResourceStatusMeta[resource.status] ?? {
              label: statusLabels[resource.status] ?? resource.status,
              className: "border-border bg-muted/60 text-muted-foreground",
              dot: "bg-muted-foreground/50",
            };
            const primaryTo = data.canManage
              ? `/projects/${encodeURIComponent(projectId)}?tab=submissions&submission=${encodeURIComponent(resource.submissionId)}&revision=${encodeURIComponent(resource.revisionId)}`
              : `/mentor-workspace?view=review-request&requestId=${encodeURIComponent(resource.id)}`;
            const requestTo = data.canManage
              ? `/review-requests/${encodeURIComponent(resource.id)}`
              : `/mentor-workspace?view=review-request&requestId=${encodeURIComponent(resource.id)}`;
            return (
              <article key={resource.id} className="flex flex-col gap-2 rounded-lg border border-border/75 bg-background px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="truncate text-sm font-semibold text-foreground hover:text-primary hover:underline" to={primaryTo}>
                      {resource.title}
                    </Link>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-semibold">
                      v{resource.revisionNumber}
                    </Badge>
                    <Badge variant="outline" className={`h-5 gap-1 px-2 text-[11px] font-medium ${st.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden="true" />
                      {st.label}
                    </Badge>
                  </div>
                  <p className="!m-0 text-xs text-muted-foreground">
                    Bản thảo gửi góp ý · Ngày gửi {new Date(resource.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" asChild>
                    <Link to={primaryTo}>
                      {data.canManage ? "Xem bản thảo" : "Mở yêu cầu"}
                    </Link>
                  </Button>
                  {data.canManage && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" asChild>
                      <Link to={requestTo}>
                        Chi tiết yêu cầu
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {revoke && (
        <Dialog open onOpenChange={v => { if (!v) closeRevoke(); }}>
          <DialogContent className="max-w-md space-y-4" data-no-i18n>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1 pr-6">
                <DialogTitle className="text-base leading-snug">
                  {revoke === "access"
                    ? `Kết thúc hướng dẫn với ${entry.mentorName}?`
                    : `Ngừng chia sẻ tài liệu với ${entry.mentorName}?`}
                </DialogTitle>
                <DialogDescription className="text-xs leading-5">
                  {revoke === "access"
                    ? "Hành động này sẽ thu hồi quyền truy cập cố vấn hiện tại của giảng viên đối với dự án."
                    : targetShare
                      ? `Tài liệu: "${targetShare.title}".`
                      : "Hành động này sẽ thu hồi quyền xem đối với mục tài liệu đã chia sẻ này."}
                </DialogDescription>
              </div>
            </div>

            <ul className="space-y-1.5 rounded-lg border border-border/80 bg-muted/25 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground list-disc pl-7">
              {revoke === "access" ? (
                <>
                  <li>Giảng viên sẽ không còn quyền truy cập các tài liệu đã chia sẻ và kênh trao đổi của dự án.</li>
                  <li>Lịch sử góp ý, các bản thảo đã đánh giá và ghi nhận đóng góp học thuật luôn được giữ nguyên.</li>
                </>
              ) : (
                <>
                  <li>Giảng viên sẽ không thể mở lại tài liệu này từ danh sách tài liệu đã chia sẻ.</li>
                  <li>Các yêu cầu đánh giá bản thảo và lịch sử góp ý trước đó không bị ảnh hưởng.</li>
                </>
              )}
            </ul>

            <label className="flex items-start gap-2.5 rounded-lg border border-border/80 bg-background px-3 py-2.5 text-xs leading-5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 accent-destructive"
                checked={revokeConfirmed}
                disabled={command.isPending}
                onChange={e => setRevokeConfirmed(e.target.checked)}
              />
              <span className="text-foreground">
                {revoke === "access"
                  ? `Tôi hiểu tác động trên và xác nhận kết thúc hướng dẫn với ${entry.mentorName}.`
                  : "Tôi xác nhận ngừng chia sẻ tài liệu này với cố vấn."}
              </span>
            </label>

            <AccessError error={command.error} />

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" disabled={command.isPending} onClick={closeRevoke}>
                Giữ nguyên
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={command.isPending || !revokeConfirmed}
                onClick={async () => {
                  const payload = {
                    expectedVersion: entry.policy.version,
                    confirmed: true,
                    reason: revoke === "access" ? "Nhóm kết thúc hướng dẫn" : "Nhóm ngừng chia sẻ tài liệu",
                  };
                  if (await command.run({ revoke }, () => revoke === "access" ? mentorAccessApi.revoke(projectId, entry.policy.id, payload) : mentorAccessApi.unshare(projectId, entry.policy.id, revoke, payload))) {
                    setRevoke(null);
                    setRevokeConfirmed(false);
                  }
                }}
              >
                {revoke === "access" ? "Xác nhận kết thúc" : "Xác nhận ngừng chia sẻ"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showCollaboration ? <MentorCollaboration projectId={projectId} entry={entry} readOnly={data.readOnly || !entry.policy.effective} canManage={data.canManage} actorId={actorId} /> : null}
    </div>
  );
}
function SharedResourceText({ projectId, accessId, version, resource }: { projectId: string; accessId: string; version: number; resource: Entry["shares"][number] }) {
  const [open, setOpen] = useState(false), actorId = useAuthStore(s => s.user?.id);
  const packetRoundId = resource.kind === "PAPER" && /^screening:[0-9a-f-]{36}$/.test(resource.sectionKey) ? resource.sectionKey.slice(10) : null;
  const query = useQuery({ queryKey: ["mentor-access", actorId, projectId, accessId, version, "resource", resource.id], queryFn: () => mentorAccessApi.resource(projectId, accessId, resource.id), enabled: open, retry: false, refetchInterval: open ? 5000 : false });
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>{kindLabels[resource.kind]} · {resource.title}{resource.sectionKey ? ` · ${packetRoundId ? "Gói phân xử" : sectionLabels[resource.sectionKey] ?? resource.sectionKey}` : ""}</summary>
    {open && <>{query.isLoading && <WorkspaceLoading />}<AccessError error={query.error} />{query.data && !denied(query.error) && <div>{packetRoundId ? <Link className="text-primary underline" to={`/academic-support/projects/${encodeURIComponent(projectId)}/screening/${encodeURIComponent(packetRoundId)}`}>Mở gói phân xử bài báo</Link> : <p className="mentor-shared-text">{query.data.content}</p>}</div>}<small>Được chia sẻ {new Date(resource.createdAt).toLocaleString("vi-VN")}</small></>}
  </details>;
}
type FeedbackKind = MentorFeedback["kind"];
function feedbackActions(kind: MentorResourceKind, permissions: readonly MentorPermission[], team: boolean): FeedbackKind[] {
  const allowed = (permission: MentorPermission) => team || permissions.includes(permission);
  const actions: FeedbackKind[] = [];
  if (kind === "PAPER") { if (allowed("PAPERS_COMMENT")) actions.push("COMMENT"); if (allowed("PAPERS_SUGGEST")) actions.push("SUGGESTION"); }
  if (kind === "GAP") { if (allowed("GAPS_COMMENT")) actions.push("COMMENT"); if (allowed("GAPS_RECOMMEND")) actions.push("SUGGESTION"); }
  if (["TASK", "MILESTONE"].includes(kind) && allowed("TASKS_SUGGEST")) actions.push("SUGGESTION");
  if (kind === "MANUSCRIPT") { if (allowed("MANUSCRIPTS_COMMENT")) actions.push("COMMENT"); if (allowed("MANUSCRIPTS_SUGGEST")) actions.push("SUGGESTION"); if (allowed("MANUSCRIPTS_REVIEW")) actions.push("REVIEW"); }
  return actions;
}
const feedbackLabels: Record<FeedbackKind, string> = { MESSAGE: "Trao đổi", COMMENT: "Nhận xét", SUGGESTION: "Đề xuất thay đổi", REVIEW: "Phản biện nội dung được chia sẻ" };
function CreditRolePicker({ label, value, onChange, disabled }: { label: string; value: string[]; onChange: (value: string[]) => void; disabled: boolean }) {
  return <fieldset className="mentor-credit-picker" disabled={disabled}><legend>{label}</legend><div>{creditRoles.map(role => <label key={role}><input type="checkbox" checked={value.includes(role)} onChange={event => onChange(event.target.checked ? [...value, role] : value.filter(item => item !== role))} /><span>{roleLabels[role]}</span></label>)}</div></fieldset>;
}
function MentorCollaboration({ projectId, entry, readOnly, canManage, actorId, showHeading = true, conversationOnly = false }: { projectId: string; entry: Entry; readOnly: boolean; canManage: boolean; actorId: string; showHeading?: boolean; conversationOnly?: boolean }) {
  const [page, setPage] = useState(1), [historyPage, setHistoryPage] = useState(1), [agreementPage, setAgreementPage] = useState(1);
  const [shareId, setShareId] = useState(""), [kind, setKind] = useState<FeedbackKind>("MESSAGE"), [body, setBody] = useState("");
  const [roles, setRoles] = useState<string[]>([]), [agreementRoles, setAgreementRoles] = useState<string[]>(["SUPERVISION"]), [acknowledgement, setAcknowledgement] = useState(""), [replyToId, setReplyToId] = useState<string | null>(null);
  const command = useAccessCommand(projectId); useUnsavedWorkspace(Boolean(body || acknowledgement) || command.isPending);
  // A policy change uses fresh queries and cannot continue displaying previously permitted feedback.
  const queryKey = ["mentor-access", actorId, projectId, entry.policy.id, entry.policy.version];
  const feedback = useQuery({ queryKey: [...queryKey, "feedback", page], queryFn: () => mentorAccessApi.feedback(projectId, entry.policy.id, page), refetchInterval: 5000, retry: false });
  const history = useQuery({ queryKey: [...queryKey, "history", historyPage], queryFn: () => mentorAccessApi.history(projectId, entry.policy.id, historyPage), retry: false, enabled: !conversationOnly });
  const agreements = useQuery({ queryKey: [...queryKey, "agreements", agreementPage], queryFn: () => mentorAccessApi.agreements(projectId, entry.policy.id, agreementPage), refetchInterval: 5000, retry: false, enabled: !conversationOnly });
  const team = actorId !== entry.mentorId, party = canManage || !team;
  const resources = entry.shares.filter(s => !s.revokedAt && !s.accessMode && feedbackActions(s.kind, entry.policy.permissions, team).length);
  const chat = team || entry.policy.permissions.includes("MENTOR_CHAT");
  const canWrite = !readOnly && (chat || resources.length > 0);
  const target = shareId || (chat ? "" : resources[0]?.id ?? "");
  const share = resources.find(s => s.id === target);
  const actions: FeedbackKind[] = share ? feedbackActions(share.kind, entry.policy.permissions, team) : chat ? ["MESSAGE"] : [];
  const selectedKind = actions.includes(kind) ? kind : actions[0];
  const visibleFeedback = denied(feedback.error) ? [] : feedback.data?.items.filter(item => team || (item.shareId ? entry.shares.some(s => s.id === item.shareId && !s.revokedAt) : chat)) ?? [];
  return (
    <section className="mentor-collaboration-panel rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-6" data-no-i18n>
      {showHeading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground">Trao đổi và phản hồi riêng với cố vấn</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Mỗi cố vấn có kênh trao đổi độc lập với nhóm. Cố vấn chỉ thấy nội dung và tài liệu nhóm chủ động chia sẻ.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8.5 text-xs font-semibold gap-1.5 shrink-0 self-start sm:self-center border-primary/30 text-primary hover:bg-primary/5">
            <Link to={`/projects/${projectId}?tab=chat&channel=mentors`}>
              <MessagesSquare className="h-3.5 w-3.5" />
              <span>Mở trong Kênh Chat "Với Mentor"</span>
            </Link>
          </Button>
        </div>
      )}

      {!conversationOnly && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground space-y-1">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Nguyên tắc bảo vệ dữ liệu nghiên cứu</span>
        </div>
        <p className="text-muted-foreground leading-relaxed pl-6">
          Quyền trao đổi với cố vấn được cách ly riêng: không tự động mở quyền truy cập Thư viện bài báo, Bản thảo LaTeX hay Ma trận minh chứng. Nhóm chia sẻ bài báo tại Library hoặc gửi phiên bản bản thảo để góp ý.
        </p>
      </div>}

      {feedback.isLoading && <WorkspaceLoading />}
      <AccessError error={feedback.error} />
      {!chat && !team && conversationOnly && <p role="status">Nhóm chưa cấp quyền trao đổi cho cố vấn. Chủ dự án có thể bật quyền này trong mục quản lý cố vấn.</p>}
      {readOnly && <p role="status">Cuộc trao đổi đang ở chế độ chỉ đọc. Dự án hoặc quyền cố vấn hiện không cho phép gửi phản hồi mới.</p>}

      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Trao đổi đã gửi
        </h4>

        {feedback.data?.total === 0 && (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-8 text-center">
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Chưa có trao đổi. Bắt đầu bằng một câu hỏi hoặc đề xuất cụ thể.
            </p>
          </div>
        )}

        <ol className="mentor-feedback-list space-y-3">
          {visibleFeedback.map(item => (
            <FeedbackItem
              key={item.id}
              projectId={projectId}
              accessId={entry.policy.id}
              item={item}
              contextLabel={item.shareId ? entry.shares.find(s => s.id === item.shareId)?.title ?? "Nội dung đã ngừng chia sẻ" : "Trao đổi riêng"}
              canManage={team && !readOnly}
              onReply={() => {
                void (async () => { if (body && !await canLeaveWorkspace()) return; setShareId(item.shareId ?? ""); setKind(item.kind); setReplyToId(item.id); })();
              }}
              canReply={canWrite && (item.shareId ? resources.some(s => s.id === item.shareId) : chat)}
            />
          ))}
        </ol>

        {feedback.data && !denied(feedback.error) && <PageButtons page={page} hasNext={feedback.data.hasNext} onPage={setPage} />}
      </div>

      {canWrite && (
        <form
          className="mentor-collab-composer rounded-xl border border-border/80 bg-muted/20 p-4 sm:p-5 space-y-4 shadow-2xs"
          onSubmit={async e => {
            e.preventDefault(); if (!selectedKind || target && !share) return;
            const input = { shareId: target || null, replyToId, kind: selectedKind, body, creditRoles: roles };
            if (await command.run(input, clientKey => mentorAccessApi.comment(projectId, entry.policy.id, { ...input, clientKey }))) { setBody(""); setReplyToId(null); }
          }}
        >
          <fieldset disabled={command.isPending} className="space-y-4">
            {(!conversationOnly || resources.length > 0) && <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <label className="space-y-1.5 text-xs font-semibold text-foreground">
                <span>Nội dung liên quan</span>
                <select
                  className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary/20"
                  value={target}
                  onChange={async e => {
                    const next = e.target.value; if (body && !await canLeaveWorkspace()) return;
                    setShareId(next); setReplyToId(null); setKind("MESSAGE");
                  }}
                >
                  {chat && <option value="">Cuộc trao đổi riêng</option>}
                  {resources.map(s => <option key={s.id} value={s.id}>{s.title}{s.sectionKey ? ` · ${sectionLabels[s.sectionKey] ?? s.sectionKey}` : ""}</option>)}
                </select>
              </label>

              {target && (
                <label className="space-y-1.5 text-xs font-semibold text-foreground">
                  <span>Loại phản hồi</span>
                  <select
                    className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary/20"
                    value={selectedKind ?? ""}
                    onChange={e => setKind(e.target.value as FeedbackKind)}
                  >
                    {actions.map(action => <option key={action} value={action}>{feedbackLabels[action]}</option>)}
                  </select>
                </label>
              )}
            </div>}

            {replyToId && (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary">
                <span>Đang trả lời phản hồi đã chọn</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs font-medium hover:bg-primary/20" onClick={() => setReplyToId(null)}>
                  Hủy trả lời
                </Button>
              </div>
            )}

            <label className="space-y-1.5 text-xs font-semibold text-foreground block">
              <span>Tin nhắn hoặc phản hồi</span>
              <textarea
                className="block w-full rounded-lg border border-border bg-background p-3 text-xs sm:text-sm font-normal text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 leading-relaxed resize-y"
                placeholder="Nhập câu hỏi, phản biện phương pháp hoặc trao đổi học thuật dành riêng cho cố vấn..."
                value={body}
                onChange={e => setBody(e.target.value)}
                required
                rows={4}
                maxLength={5000}
              />
            </label>

            <details className="mentor-credit-options">
              <summary>Gắn vai trò CRediT (không bắt buộc)</summary>
              <p>Chỉ gắn khi cần mô tả đóng góp học thuật. Lựa chọn này không tự tính tỷ lệ đóng góp hay quyền tác giả.</p>
              <CreditRolePicker label="Vai trò CRediT liên quan" value={roles} onChange={setRoles} disabled={command.isPending} />
            </details>
          </fieldset>

          <AccessError error={command.error} />

          <div className="flex justify-end pt-1">
            <Button
              className="gap-2 font-semibold shadow-xs h-9 text-xs sm:text-sm px-4"
              disabled={command.isPending || !body.trim() || !selectedKind || Boolean(target && !share)}
            >
              <Send size={14} />
              <span>Gửi phản hồi</span>
            </Button>
          </div>
        </form>
      )}

      {!conversationOnly && <div className="space-y-4 pt-4 border-t border-border/70">
        <details className="rounded-xl border border-border/80 bg-card p-4.5 shadow-2xs group cursor-pointer">
          <summary className="font-bold text-sm text-foreground flex items-center justify-between hover:text-primary transition-colors">
            <span>Thỏa thuận ghi nhận và đóng góp</span>
          </summary>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Vai trò cố vấn không tự tạo đồng tác giả hoặc tỷ lệ đóng góp. Thỏa thuận phải được hai bên xác nhận và có thể dùng làm minh chứng cho quy trình đóng góp của nhóm.
          </p>

          {!readOnly && party && (
            <form
              className="mentor-access-form mt-4 p-4 rounded-lg bg-muted/20 border border-border/60 space-y-3"
              onSubmit={async e => {
                e.preventDefault(); const input = { creditRoles: agreementRoles, acknowledgement, note: "" };
                if (await command.run(input, clientKey => mentorAccessApi.propose(projectId, entry.policy.id, { ...input, clientKey }))) setAcknowledgement("");
              }}
            >
              <label className="space-y-1.5 text-xs font-semibold text-foreground block">
                <span>Nội dung ghi nhận đề xuất</span>
                <textarea
                  className="block w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:ring-2 focus:ring-primary/20"
                  disabled={command.isPending}
                  required
                  minLength={3}
                  maxLength={3000}
                  value={acknowledgement}
                  onChange={e => setAcknowledgement(e.target.value)}
                />
              </label>

              <CreditRolePicker label="Vai trò đóng góp" value={agreementRoles} onChange={setAgreementRoles} disabled={command.isPending} />

              <AccessError error={command.error} />
              <Button disabled={command.isPending || acknowledgement.trim().length < 3 || !agreementRoles.length} size="sm">
                Đề xuất thỏa thuận
              </Button>
            </form>
          )}

          <AccessError error={agreements.error} />
          <ul className="mt-4 space-y-2.5">
            {!denied(agreements.error) && agreements.data?.items.map(a => (
              <AgreementItem key={a.id} agreement={a} actorId={actorId} projectId={projectId} accessId={entry.policy.id} canRespond={!readOnly && party} />
            ))}
          </ul>
          {agreements.data && !denied(agreements.error) && <PageButtons page={agreementPage} hasNext={agreements.data.hasNext} onPage={setAgreementPage} />}
        </details>

        <details className="rounded-xl border border-border/80 bg-card p-4.5 shadow-2xs group cursor-pointer">
          <summary className="font-bold text-sm text-foreground flex items-center justify-between hover:text-primary transition-colors">
            <span>Lịch sử quyền và hoạt động</span>
          </summary>
          <AccessError error={history.error} />
          <ol className="mt-3 space-y-2 text-xs divide-y divide-border/50">
            {!denied(history.error) && history.data?.items.map(h => (
              <li key={h.id} className="pt-2">
                <span className="font-semibold text-foreground">{eventLabel(h.type)}</span> · <span>{h.actorName}</span> · <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleString("vi-VN")}</span>
                {typeof h.details?.reason === "string" && <p className="mt-0.5 text-muted-foreground">{h.details.reason}</p>}
              </li>
            ))}
          </ol>
          {history.data && !denied(history.error) && <PageButtons page={historyPage} hasNext={history.data.hasNext} onPage={setHistoryPage} />}
        </details>
      </div>}
    </section>
  );
}
function AgreementItem({ agreement: a, actorId, projectId, accessId, canRespond }: { agreement: MentorAgreement; actorId: string; projectId: string; accessId: string; canRespond: boolean }) {
  const command = useAccessCommand(projectId), [confirmed, setConfirmed] = useState(false);
  return <li><p className="mentor-shared-text">{a.acknowledgement}</p><small>{a.creditRoles.map(r => roleLabels[r]).join(", ")} · {statusLabels[a.status]}</small>
    {a.status === "PROPOSED" && canRespond && <><label className="mentor-access-check"><input type="checkbox" checked={confirmed} disabled={command.isPending} onChange={e => setConfirmed(e.target.checked)} />Tôi đã đọc nội dung và vai trò đóng góp trong thỏa thuận này.</label><div className="mentor-access-actions">
    {(a.proposedById === actorId ? ["WITHDRAWN"] : ["ACCEPTED", "REJECTED"]).map(status => <Button type="button" key={status} variant="outline" disabled={command.isPending || !confirmed} onClick={async () => {
      if (await command.run({ agreementId: a.id, status }, () => mentorAccessApi.respond(projectId, accessId, a.id, status))) setConfirmed(false);
    }}>{status === "ACCEPTED" ? "Chấp nhận thỏa thuận" : status === "REJECTED" ? "Từ chối thỏa thuận" : "Rút đề xuất"}</Button>)}</div><AccessError error={command.error} /></>}
  </li>;
}
function FeedbackItem({ projectId, accessId, item, contextLabel, canManage, canReply, onReply }: { projectId: string; accessId: string; item: MentorFeedback; contextLabel: string; canManage: boolean; canReply: boolean; onReply: () => void }) {
  const command = useAccessCommand(projectId), [response, setResponse] = useState(""), [status, setStatus] = useState("RESOLVED"); useUnsavedWorkspace(Boolean(response) || command.isPending);
  return (
    <li className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-semibold text-xs py-0.5 px-2 bg-primary/5 text-primary border-primary/20">
            {feedbackLabels[item.kind]}
          </Badge>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-muted-foreground">{contextLabel}</span>
          {item.kind !== "MESSAGE" && (
            <>
              <span className="text-muted-foreground">·</span>
              <Badge variant="secondary" className="text-2xs font-semibold">
                {statusLabels[item.status]}
              </Badge>
            </>
          )}
          {item.replyToId && (
            <Badge variant="outline" className="text-2xs text-muted-foreground border-border/60">
              Trả lời phản hồi
            </Badge>
          )}
        </div>
        <time className="text-2xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleString("vi-VN")}
        </time>
      </div>

      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold text-xs ring-1 ${item.mentor ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20" : "bg-primary/10 text-primary ring-primary/20"}`}>
          {item.authorName.charAt(0) || (item.mentor ? "M" : "T")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <strong className="text-sm font-semibold text-foreground">{item.authorName}</strong>
            <span className="text-2xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
              {item.mentor ? "Cố vấn" : "Nhóm dự án"}
            </span>
          </div>
          <div className="mentor-shared-text mt-2 text-sm text-foreground bg-muted/30 border border-border/50 rounded-xl p-3.5 leading-relaxed">
            {item.body}
          </div>
        </div>
      </div>

      {item.creditRoles.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pl-11 text-xs">
          <span className="text-2xs text-muted-foreground font-medium">Vai trò CRediT:</span>
          {item.creditRoles.map(r => (
            <Badge key={r} variant="outline" className="text-2xs py-0 px-2 bg-muted/40 text-foreground font-medium border-border/60">
              {roleLabels[r]}
            </Badge>
          ))}
        </div>
      )}

      {item.response && (
        <div className="ml-11 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-foreground space-y-1">
          <div className="font-semibold text-primary flex items-center gap-1.5">
            <CornerDownRight size={13} />
            <span>Phản hồi của nhóm</span>
          </div>
          <p className="text-foreground leading-relaxed pl-4">{item.response}</p>
        </div>
      )}

      {item.handledAt && (
        <div className="ml-11 text-2xs text-muted-foreground">
          {item.handledByName ?? "Thành viên"} xử lý {new Date(item.handledAt).toLocaleString("vi-VN")}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
        <div>
          {canReply && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs font-semibold text-primary hover:bg-primary/10 gap-1 px-2.5" onClick={onReply}>
              <CornerDownRight size={13} />
              <span>Trả lời</span>
            </Button>
          )}
        </div>
        <div>
          {canManage && item.kind !== "MESSAGE" && !["REJECTED", "RESOLVED"].includes(item.status) && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-primary hover:underline">Xử lý phản hồi</summary>
              <form className="mentor-access-form mt-2 p-3 bg-muted/20 border border-border rounded-lg space-y-2" onSubmit={async e => { e.preventDefault(); const input = { expectedVersion: item.version, status, response }; if (await command.run(input, () => mentorAccessApi.handle(projectId, accessId, item.id, input))) setResponse(""); }}>
                <select aria-label="Trạng thái xử lý phản hồi" disabled={command.isPending} value={status} onChange={e => setStatus(e.target.value)} className="h-8 text-xs rounded border border-border bg-background px-2">
                  {item.status === "PENDING" && <><option value="ACCEPTED">Chấp nhận</option><option value="REJECTED">Từ chối</option></>}
                  <option value="RESOLVED">Đã giải quyết</option>
                </select>
                <textarea aria-label="Giải thích xử lý phản hồi" disabled={command.isPending} minLength={3} maxLength={2000} required value={response} onChange={e => setResponse(e.target.value)} className="text-xs p-2 rounded border border-border bg-background" />
                <AccessError error={command.error} />
                <Button size="sm" disabled={command.isPending || response.trim().length < 3}>Lưu xử lý</Button>
              </form>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}
function eventLabel(type: string) { return ({ ACCESS_PROPOSED: "Đề xuất quyền trong lời mời", ACCESS_ACCEPTED: "Chấp nhận truy cập", PERMISSIONS_CHANGED: "Thay đổi quyền", ACCESS_REVOKED: "Thu hồi quyền", RESOURCE_SHARED: "Chia sẻ nội dung", RESOURCE_REVOKED: "Ngừng chia sẻ nội dung", FEEDBACK_CREATED: "Gửi phản hồi", FEEDBACK_HANDLED: "Xử lý phản hồi", AGREEMENT_PROPOSED: "Đề xuất thỏa thuận", AGREEMENT_RESPONDED: "Phản hồi thỏa thuận" } as Record<string, string>)[type] ?? "Cập nhật cố vấn"; }
