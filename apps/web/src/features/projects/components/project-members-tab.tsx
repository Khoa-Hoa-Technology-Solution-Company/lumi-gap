import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { IProject, IProjectMember } from "@trend/shared-types";
import { Mail, MoreHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { useCancelProjectInvitation, useResendProjectInvitation, useRemoveMemberFromProject, useTransferProjectOwnership } from "../hooks/use-projects";

import { ProjectMemberInvite } from "./project-member-invite";

interface Props {
  projectId: string;
  projectTitle: string;
  members: IProjectMember[];
  pendingInvitations: IProject["pendingInvitations"];
  ownerId: string;
  currentUserId?: string;
  readOnly?: boolean;
  showInviteAction?: boolean;
}

export function ProjectMembersTab({ projectId, projectTitle, members, pendingInvitations, ownerId, currentUserId, readOnly = false, showInviteAction = true }: Props) {
  const { t, language } = useI18n();
  const isOwner = currentUserId === ownerId;
  const canManage = isOwner && !readOnly;
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [transfer, setTransfer] = useState<{ id: string; name: string } | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const resend = useResendProjectInvitation(projectId);
  useEffect(() => { if (!pendingInvitations?.length) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [pendingInvitations?.length]);
  const cancel = useCancelProjectInvitation(projectId);
  const remove = useRemoveMemberFromProject(projectId);
  const transferOwnership = useTransferProjectOwnership(projectId);
  return <div className="project-members-card rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-6" data-no-i18n>
    <header className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-border/60">
      <div>
        <div className="flex items-center gap-2.5">
          <h3 className="text-lg font-bold text-foreground">{t("Project Members")}</h3>
          <Badge variant="secondary" className="font-semibold text-xs py-0.5 px-2 bg-muted/80">
            {members.length}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{t("Collaborators join only after accepting an invitation.")}</p>
        {!isOwner && <p className="mt-1 text-xs text-muted-foreground">{t("Only the project owner can invite members.")}</p>}
      </div>
      {canManage && showInviteAction && <ProjectMemberInvite projectId={projectId} projectTitle={projectTitle} ownerId={ownerId} members={members} />}
    </header>

    {isOwner && Boolean(pendingInvitations?.length) && <section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <h4 className="text-sm font-semibold text-foreground">{t("Pending invitations")}</h4>
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs py-0 px-1.5">
            {pendingInvitations?.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{t("Invitations expire automatically after 7 days.")}</p>
      </div>
      <div className="divide-y divide-amber-500/20 rounded-lg border border-amber-500/20 bg-card/60 overflow-hidden">
        {pendingInvitations?.map(invitation => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors hover:bg-muted/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <Mail className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-foreground">{invitation.invitedUser?.fullName || invitation.email}</p>
              <p className="break-all text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span>{invitation.email}</span>
                <span>·</span>
                <span>{t("Invite expires")}: {new Date(invitation.expiresAt).toLocaleDateString(language)}</span>
              </p>
            </div>
          </div>
          {canManage ? <div className="flex shrink-0 items-center gap-2">
            {invitation.resendAvailableAt && new Date(invitation.resendAvailableAt).getTime() > now ? <span className="text-xs text-muted-foreground tabular-nums">{t("Resend in {{seconds}}s", { seconds: Math.ceil((new Date(invitation.resendAvailableAt).getTime() - now) / 1000) })}</span> : null}
            <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-lg" aria-label={t("Invitation actions for {{email}}", { email: invitation.email })}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              <DropdownMenuItem disabled={resend.isPending || Boolean(invitation.resendAvailableAt && new Date(invitation.resendAvailableAt).getTime() > now)} onSelect={() => { void resend.mutateAsync(invitation.id).then(() => toast.success(t("Invitation resent"))).catch(() => toast.error(t("Could not resend invitation. Please wait and try again."))); }}>{t("Resend invitation")}</DropdownMenuItem>
              <DropdownMenuSeparator /><DropdownMenuItem className="text-destructive font-medium" onSelect={() => setCancelId(invitation.id)}>{t("Cancel invitation")}</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div> : null}
        </div>)}
      </div>
    </section>}

    {!members.length ? <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-muted/10"><Users className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" /><p className="text-sm font-medium text-foreground">{t("No project members yet")}</p><p className="text-xs text-muted-foreground mt-1">{t("Invite researchers to collaborate on this project.")}</p></div> : <ul className="space-y-3" role="list">
      {members.map(member => {
        const user = typeof member.targetId === "string" ? null : member.targetId;
        const id = user?._id ?? String(member.targetId);
        const primaryOwner = id === ownerId;
        const name = user?.fullName || t("Unknown User");
        const initial = user?.fullName?.trim().charAt(0) || "";
        return <li key={id} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card hover:border-primary/30 hover:shadow-xs transition-all duration-150">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={cn("relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold text-base shadow-2xs transition-transform duration-150 group-hover:scale-105", primaryOwner ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-2 ring-amber-500/30" : "bg-primary/10 text-primary ring-2 ring-primary/20")} aria-hidden="true">
              {initial || <Users className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <Link to={`/academics/${encodeURIComponent(id)}`} className="text-sm font-bold text-foreground hover:text-primary transition-colors hover:underline truncate">
                  {name}
                </Link>
                <Badge variant={primaryOwner ? "secondary" : "outline"} className={cn("font-semibold text-xs py-0.5 px-2.5 rounded-full inline-flex items-center gap-1 shrink-0", primaryOwner ? "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300" : "border-border/80 bg-muted/50 text-muted-foreground")}>
                  {t(primaryOwner ? "Project owner" : "Member")}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground truncate">
                <Mail className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                <span className="truncate">{user?.email}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Link to={`/academics/${encodeURIComponent(id)}`}>
                {t("View profile")}
              </Link>
            </Button>
            {canManage && !primaryOwner && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" aria-label={t("Member actions for {{name}}", { name })}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={transferOwnership.isPending} onSelect={() => setTransfer({ id, name })}>{t("Transfer ownership")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive font-medium" onSelect={() => setRemoveId(id)}>{t("Remove member")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
          </div>
        </li>;
      })}
    </ul>}

    <Dialog open={canManage && Boolean(cancelId)} onOpenChange={next => { if (!next && !cancel.isPending) setCancelId(null); }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("Cancel this invitation?")}</DialogTitle><DialogDescription>{t("The recipient will no longer be able to join with this invitation.")}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={cancel.isPending} onClick={() => setCancelId(null)}>{t("Keep invitation")}</Button><Button type="button" variant="destructive" disabled={cancel.isPending} onClick={() => { if (cancelId) void cancel.mutateAsync(cancelId).then(() => { setCancelId(null); toast.success(t("Invitation cancelled")); }).catch(() => toast.error(t("Could not cancel invitation"))); }}>{t("Cancel invitation")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={canManage && Boolean(removeId)} onOpenChange={next => { if (!next && !remove.isPending) { setRemoveId(null); setRemoveReason(""); } }}>
      <DialogContent closeLabel={t("Close")} data-no-i18n>
        <DialogHeader>
          <DialogTitle>
            {language === "vi"
              ? "Kết thúc cộng tác với thành viên này?"
              : "End collaboration with this member?"}
          </DialogTitle>
          <DialogDescription>
            {language === "vi"
              ? "Hành động này chỉ điều chỉnh quyền truy cập dự án và không làm mất lịch sử công lao."
              : "This adjusts project workspace access and preserves the contributor's recorded history."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground list-disc pl-6">
          <li>{language === "vi" ? "Quyền truy cập không gian dự án và tài liệu nội bộ sẽ bị thu hồi ngay." : "Project workspace access and internal files will be revoked immediately."}</li>
          <li>{language === "vi" ? "Những công việc đã thực hiện và minh chứng ghi nhận vẫn được bảo toàn vĩnh viễn." : "Previously recorded work and evidence remain permanently preserved."}</li>
          <li>{language === "vi" ? "Việc kết thúc cộng tác không tự động thay đổi quyền tác giả của bản thảo." : "Ending collaboration does not automatically change manuscript authorship."}</li>
          <li>{language === "vi" ? "Thành viên sẽ được thông báo kèm kênh xem hồ sơ đóng góp cá nhân và gửi phản hồi nếu cần." : "The member will be notified with access to their personal contribution record and review channel."}</li>
        </ul>
        <div className="space-y-1.5 py-1">
          <Label htmlFor="remove-member-reason" className="text-xs font-semibold">
            {language === "vi" ? "Lý do kết thúc cộng tác (ghi nhận trong lịch sử dự án)" : "Reason for ending collaboration (recorded in project history)"}
          </Label>
          <Input
            id="remove-member-reason"
            placeholder={language === "vi" ? "VD: Thay đổi phân công nhóm hoặc thành viên chuyển hướng đề tài" : "e.g., Team scope change or member moved to another topic"}
            value={removeReason}
            onChange={e => setRemoveReason(e.target.value)}
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => { setRemoveId(null); setRemoveReason(""); }}>
            {t("Cancel")}
          </Button>
          <Button type="button" variant="destructive" disabled={remove.isPending} onClick={async () => { if (!removeId) return; try { await remove.mutateAsync({ memberId: removeId, reason: removeReason.trim() || undefined }); toast.success(language === "vi" ? "Đã kết thúc cộng tác và bảo toàn lịch sử đóng góp" : "Collaboration ended; contribution history preserved"); setRemoveId(null); setRemoveReason(""); } catch { toast.error(t("Failed to remove member")); } }}>
            {remove.isPending ? t("Removing...") : language === "vi" ? "Xác nhận kết thúc cộng tác" : "End collaboration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={canManage && Boolean(transfer)} onOpenChange={next => { if (!next && !transferOwnership.isPending) setTransfer(null); }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("Transfer project ownership?")}</DialogTitle><DialogDescription>{transfer ? t("{{name}} will become the project owner. You will become a regular member and lose owner-only controls.", { name: transfer.name }) : null}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={transferOwnership.isPending} onClick={() => setTransfer(null)}>{t("Cancel")}</Button><Button type="button" disabled={transferOwnership.isPending} onClick={async () => { if (!transfer) return; try { await transferOwnership.mutateAsync(transfer.id); toast.success(t("Ownership transferred")); setTransfer(null); } catch { toast.error(t("Could not transfer ownership")); } }}>{t(transferOwnership.isPending ? "Transferring…" : "Transfer ownership")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
