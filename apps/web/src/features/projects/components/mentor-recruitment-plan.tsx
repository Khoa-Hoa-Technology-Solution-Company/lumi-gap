import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AvailableMentor, MentorPlanCandidate, MentorPlanCommand, MentorRole } from "@trend/shared-types";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";

const roles: MentorRole[] = ["PRIMARY", "SECONDARY"];
export const mentorRoleLabel = (role: MentorRole) => role === "PRIMARY" ? "Mentor chính" : "Mentor phụ";
const labels: Record<string, string> = { READY: "Sẵn sàng gửi", PLANNED: "Dự phòng — chưa gửi", INELIGIBLE: "Chưa đủ điều kiện", PENDING: "Đang mời", ACCEPTED: "Đã chấp nhận", DECLINED: "Đã từ chối", EXPIRED: "Hết hạn", CANCELLED: "Đã thu hồi", CANCELED_BY_PROJECT: "Đã thu hồi", CLOSED_CAPACITY_REACHED: "Đã đóng" };
export function useMentorPlan(projectId: string, enabled = true) {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({ queryKey: ["academic-support", userId, "mentor-plan", projectId], queryFn: () => academicSupportApi.plan(projectId), enabled, staleTime: 0, refetchInterval: 15_000 });
}
export function MentorRecruitmentPlan({ projectId, onSend }: { projectId: string; onSend: (candidate: MentorPlanCandidate, version: number) => void }) {
  const plan = useMentorPlan(projectId), cache = useQueryClient(), [restart, setRestart] = useState(false), lock = useRef(false);
  const update = useMutation({ mutationFn: (input: MentorPlanCommand) => academicSupportApi.changePlan(projectId, input), onSettled: () => cache.invalidateQueries({ queryKey: ["academic-support"] }) });
  const change = async (input: MentorPlanCommand) => { if (lock.current) return; lock.current = true; try { await update.mutateAsync(input); setRestart(false); } catch { /* Keep the current plan and error visible. */ } finally { lock.current = false; } };
  if (plan.isLoading) return <p role="status" className="text-sm text-muted-foreground">Đang tải kế hoạch mời…</p>;
  if (!plan.data) return <div role="alert" className="space-y-2 text-sm"><p>Chưa tải được kế hoạch mời người hướng dẫn.</p><Button variant="outline" size="sm" onClick={() => void plan.refetch()}>Thử lại</Button></div>;
  const data = plan.data, busy = update.isPending || plan.isFetching, writable = data.canManage && !busy;
  return <section className="min-w-0 space-y-4" aria-label="Người hướng dẫn" data-no-i18n>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">Người hướng dẫn</h3><p className="mt-1 text-xs text-muted-foreground">{data.candidates.length}/4 ứng viên · Tối đa 2 lời mời đồng thời</p></div><Button variant="ghost" size="sm" disabled={!writable} onClick={() => setRestart(true)}>Mở đợt mời mới</Button></header>
    <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={data.parallelInvitations} disabled={!writable} onChange={e => void change({ action: "configure", expectedVersion: data.version, parallelInvitations: e.target.checked })} /><span>Mời Mentor chính và Mentor phụ song song<span className="block text-xs text-muted-foreground">{data.parallelInvitations ? "Hai vai trò được giữ chỗ độc lập; Mentor phụ có thể nhận trước." : "Mặc định mời Mentor chính trước, rồi mới mời Mentor phụ."}</span></span></label>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{roles.map(role => {
      const queue = data.candidates.filter(c => c.mentorRole === role), unsent = queue.filter(c => !c.requestId), position = data.positions[role];
      const relationship = data.currentMentors.find(i => i.mentorRole === role);
      const invitation = data.currentInvitations.find(i => i.mentorRole === role);
      return <section key={role} className="min-w-0 rounded-lg border p-4" aria-label={mentorRoleLabel(role)}><div className="flex items-start justify-between gap-3"><h4 className="font-semibold">{mentorRoleLabel(role)}</h4><span className="text-xs text-muted-foreground">{position.status === "ASSIGNED" ? "Đã có người hướng dẫn" : position.pendingRequests ? "Đang mời" : "Chưa có người hướng dẫn"}</span></div>
        {position.pendingRequests > 1 && <p role="alert" className="mt-3 text-sm text-destructive">Có {position.pendingRequests} lời mời cũ cùng vai trò. Hãy rà soát và thu hồi lời mời trước khi tiếp tục.</p>}
        {relationship && <p className="mt-3 break-words text-sm font-medium">{relationship.fullName}</p>}
        {invitation && <p className="mt-3 break-words text-sm">Đang chờ {invitation.fullName} phản hồi.</p>}
        {data.closedRoles.includes(role) && <p role="status" className="mt-3 text-sm text-muted-foreground">Đã dừng tuyển sau khi kết thúc hướng dẫn. Mở đợt mới để xác nhận tuyển lại.</p>}
        {!queue.length && <p className="mt-4 text-sm leading-6 text-muted-foreground">Chưa có ứng viên. Chọn giảng viên trong danh sách bên dưới để thêm vào kế hoạch.</p>}
        <ol className="mt-3 divide-y">{queue.map(c => <li key={c.id} className="min-w-0 space-y-2 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{c.fullName}</p><p className="mt-1 text-xs text-muted-foreground">{labels[c.status] ?? "Chưa gửi"}</p></div>{!c.requestId && <div className="flex shrink-0"><Button size="icon" variant="ghost" aria-label={`Ưu tiên ${c.fullName}`} disabled={!writable || unsent[0]?.id === c.id} onClick={() => void change({ action: "move", expectedVersion: data.version, candidateId: c.id, offset: -1 })}><ArrowUp size={15} /></Button><Button size="icon" variant="ghost" aria-label={`Lùi ưu tiên ${c.fullName}`} disabled={!writable || unsent.at(-1)?.id === c.id} onClick={() => void change({ action: "move", expectedVersion: data.version, candidateId: c.id, offset: 1 })}><ArrowDown size={15} /></Button><Button size="icon" variant="ghost" aria-label={`Bỏ ${c.fullName} khỏi kế hoạch`} disabled={!writable} onClick={() => void change({ action: "remove", expectedVersion: data.version, candidateId: c.id })}><Trash2 size={15} /></Button></div>}</div>{c.unavailableReason && <p className="text-xs leading-5 text-muted-foreground">{c.unavailableReason}</p>}{c.canSend && <Button size="sm" disabled={!writable} onClick={() => onSend(c, data.version)}>Xem trước và gửi lời mời</Button>}</li>)}</ol>
      </section>;
    })}</div>
    <p className="text-xs leading-5 text-muted-foreground">Ứng viên dự phòng chưa nhận thông báo hay tài liệu. Mỗi lần gửi cần bạn xác nhận; không tự gửi dự phòng.</p>
    {(update.error || plan.isError) && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><p>{update.error ? mentorshipError(update.error) : "Kế hoạch có thể đã thay đổi."}</p><Button size="sm" variant="outline" onClick={() => void plan.refetch()}>Tải lại kế hoạch</Button></div>}
    <Dialog open={restart} onOpenChange={open => { if (!busy) setRestart(open); }}><DialogContent><DialogHeader><DialogTitle>Mở đợt mời mới?</DialogTitle><DialogDescription>Lưu kế hoạch hiện tại vào lịch sử và bắt đầu danh sách ứng viên mới. Mentor đã nhận vẫn giữ vai trò; hệ thống không liên hệ ứng viên cũ. Hãy xử lý các lời mời đang chờ trước.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setRestart(false)}>Quay lại</Button><Button disabled={!writable} onClick={() => void change({ action: "restart", expectedVersion: data.version })}>Mở đợt mới</Button></div>{update.error && <p role="alert" className="text-sm text-destructive">{mentorshipError(update.error)}</p>}</DialogContent></Dialog>
  </section>;
}

export function AddMentorCandidate({ projectId, mentor, onClose }: { projectId: string; mentor: AvailableMentor; onClose: () => void }) {
  const plan = useMentorPlan(projectId), cache = useQueryClient(), [role, setRole] = useState<MentorRole>("PRIMARY"), lock = useRef(false);
  const roleAvailable = (value: MentorRole) => Boolean(plan.data && !plan.data.closedRoles.includes(value) && plan.data.positions[value].status !== "ASSIGNED");
  const save = useMutation({ mutationFn: () => academicSupportApi.changePlan(projectId, { action: "add", expectedVersion: plan.data!.version, mentorUserId: mentor._id, mentorRole: role }), onSuccess: () => { void cache.invalidateQueries({ queryKey: ["academic-support"] }); onClose(); }, onError: () => void plan.refetch() });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent data-no-i18n><DialogHeader><DialogTitle>Thêm ứng viên vào kế hoạch</DialogTitle><DialogDescription>{mentor.fullName} chưa nhận được lời mời, thông báo hay quyền truy cập.</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span>Vai trò dự kiến</span><select className="block h-10 w-full rounded-md border bg-background px-3" value={role} disabled={save.isPending} onChange={e => setRole(e.target.value as MentorRole)}>{roles.map(r => <option key={r} value={r} disabled={!roleAvailable(r)}>{mentorRoleLabel(r)}{!roleAvailable(r) ? " — chưa mở tuyển" : ""}</option>)}</select></label><p className="text-xs text-muted-foreground">Chọn vai trò còn mở tuyển. Tối đa 4 ứng viên. Thứ tự riêng cho từng vai trò; bạn có thể đổi thứ tự trước khi gửi.</p>{(save.error || plan.isError) && <p role="alert" className="text-sm text-destructive">{save.error ? mentorshipError(save.error) : "Chưa tải được kế hoạch. Hãy đóng và mở lại."}</p>}<div className="flex justify-end gap-2"><Button variant="ghost" disabled={save.isPending} onClick={onClose}>Quay lại</Button><Button disabled={!plan.data?.canManage || !roleAvailable(role) || plan.isFetching || save.isPending} onClick={async () => { if (lock.current) return; lock.current = true; try { await save.mutateAsync(); } catch { /* Preserve role for retry. */ } finally { lock.current = false; } }}>Thêm vào kế hoạch</Button></div></DialogContent></Dialog>;
}
