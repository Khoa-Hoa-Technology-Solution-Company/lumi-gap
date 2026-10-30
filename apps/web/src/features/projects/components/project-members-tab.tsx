import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { IProject, IProjectMember } from "@trend/shared-types";
import { Mail, MoreHorizontal, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { api } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { useCancelProjectInvitation, useResendProjectInvitation, useInviteProjectMember, useRemoveMemberFromProject, useTransferProjectOwnership } from "../hooks/use-projects";

interface SearchUser { id: string; fullName: string | null; email: string; }
const COLLABORATION_TYPES = ["MEMBER", "MENTOR"] as const;
interface Props {
  projectId: string;
  projectTitle: string;
  members: IProjectMember[];
  pendingInvitations: IProject["pendingInvitations"];
  ownerId: string;
  currentUserId?: string;
  readOnly?: boolean;
}

export function ProjectMembersTab({ projectId, projectTitle, members, pendingInvitations, ownerId, currentUserId, readOnly = false }: Props) {
  const { t, language } = useI18n();
  const inviter = useAuthStore(state => state.user);
  const isOwner = currentUserId === ownerId;
  const canManage = isOwner && !readOnly;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"MEMBER" | "MENTOR">("MEMBER");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [transfer, setTransfer] = useState<{ id: string; name: string } | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const submitLock = useRef(false);
  const resend = useResendProjectInvitation(projectId);
  useEffect(() => { if (!pendingInvitations?.length) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [pendingInvitations?.length]);
  const invite = useInviteProjectMember(projectId);
  const cancel = useCancelProjectInvitation(projectId);
  const remove = useRemoveMemberFromProject(projectId);
  const transferOwnership = useTransferProjectOwnership(projectId);
  const queryEmail = useDebouncedValue(email.trim(), 250);
  const search = useQuery({
    queryKey: ["searchUsers", queryEmail],
    queryFn: async ({ signal }) => (await api.get<{ data: SearchUser[] }>(`/auth/search?email=${encodeURIComponent(queryEmail)}`, { signal })).data.data,
    enabled: open && kind === "MEMBER" && !selected && queryEmail.length >= 2,
    staleTime: 60_000,
  });
  const memberIds = new Set(members.map(member => typeof member.targetId === "string" ? member.targetId : member.targetId._id));
  const reset = () => { setKind("MEMBER"); setEmail(""); setSelected(null); };
  const changeOpen = (next: boolean) => {
    if (invite.isPending) return;
    setOpen(next);
    if (!next) reset();
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || kind !== "MEMBER" || (!selected && !email.trim()) || invite.isPending || submitLock.current) return;
    submitLock.current = true; setInviteError("");
    try {
      // The server resolves the selected user's email and prepares the invitation.
      await invite.mutateAsync(selected ? { userId: selected.id } : { email: email.trim() });
      toast.success(t("Invitation sent"));
      setOpen(false);
      reset();
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      setInviteError(t(status === 409 ? "This person is already a member or has a pending invitation." : "Could not send the invitation. Check the address and try again."));
    } finally { submitLock.current = false; }
  };

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
      </div>
      {canManage && <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild><Button size="sm" className="font-semibold shadow-xs"><Plus className="mr-2 h-4 w-4" />{t("Invite collaborator")}</Button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" closeLabel={t("Close")} data-no-i18n>
          <DialogHeader><DialogTitle>{t("Invite collaborator")}</DialogTitle><DialogDescription>{t("Choose how this person will collaborate on the project.")}</DialogDescription></DialogHeader>
          <fieldset disabled={invite.isPending} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("Collaboration type")}</legend>
            {COLLABORATION_TYPES.map(value => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${kind === value ? "border-primary/50 bg-primary/5" : "bg-background"}`}>
              <input type="radio" name="collaboration-type" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 accent-primary" />
              <span><span className="block text-sm font-medium">{t(value === "MEMBER" ? "Project member" : "Academic Mentor")}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t(value === "MEMBER" ? "Work with papers, evidence and reports." : "Read research context and provide guidance.")}</span></span>
            </label>)}
          </fieldset>
          {kind === "MENTOR" ? <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">{t("Invite a verified academic mentor in Academic Support. Both parties agree before mentor access is granted.")}</p>
            <DialogFooter><Button type="button" variant="outline" onClick={() => changeOpen(false)}>{t("Cancel")}</Button><Button asChild><Link to={`/projects/${encodeURIComponent(projectId)}?tab=support`} onClick={() => changeOpen(false)}>{t("Continue to Academic Support")}</Link></Button></DialogFooter>
          </div> : <form onSubmit={send} className="space-y-4">
            <div className="relative space-y-2">
              <Label htmlFor="project-invite-email">{t("Recipient email")}</Label>
              {selected ? <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{selected.fullName || selected.email}</p><p className="truncate text-xs text-muted-foreground">{selected.email}</p></div>
                <Button type="button" size="sm" variant="ghost" disabled={invite.isPending} onClick={() => { setSelected(null); setEmail(""); }}>{t("Change")}</Button>
              </div> : <>
                <Input id="project-invite-email" type="email" required maxLength={320} value={email} disabled={invite.isPending} onChange={event => setEmail(event.target.value)} placeholder="user@example.com" autoComplete="off" />
                {email.trim().length >= 2 && <div className="space-y-1 rounded-md border bg-background p-1">
                  {queryEmail !== email.trim() || search.isFetching ? <p className="p-2 text-xs text-muted-foreground" role="status">{t("Searching...")}</p>
                    : search.isError ? <p className="p-2 text-xs text-muted-foreground">{t("Could not search users. You can still invite by email.")}</p>
                    : search.data?.length ? <ul aria-label={t("Matching users")}>{search.data.map(user => <li key={user.id}><button type="button" disabled={memberIds.has(user.id)} className="w-full rounded p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60" onClick={() => setSelected(user)}><span className="block break-words text-sm font-medium">{user.fullName || user.email}</span><span className="block break-all text-xs text-muted-foreground">{user.email}{memberIds.has(user.id) ? ` · ${t("Already a project member")}` : ""}</span></button></li>)}</ul>
                    : <p className="p-2 text-xs text-muted-foreground">{t("No account found. You can invite this email address.")}</p>}
                </div>}
              </>}
              <p className="text-xs leading-5 text-muted-foreground">{t("Choose a user to use their account email, or enter an external email address.")}</p>
            </div>
            <section className="space-y-2 rounded-lg border bg-muted/30 p-3" aria-label={t("Invitation email")}>
              <h4 className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4 text-primary" />{t("Invitation email")}</h4>
              <p className="text-xs leading-5 text-muted-foreground">{t("LumiGap prepares the invitation email automatically. No message is required.")}</p>
              <p className="break-all text-sm leading-6">{t("{{name}} invites you to collaborate on {{project}}.", { name: inviter?.fullName || t("Project owner"), project: projectTitle })}</p>
              <p className="text-xs leading-5">{t("Project role")}: <span className="font-medium">{t("Member")}</span></p>
              <p className="text-xs leading-5 text-muted-foreground">{t("The email includes a secure invitation link. They join only after accepting in LumiGap.")}</p>
            </section>
            {inviteError ? <p role="alert" className="text-sm text-destructive">{inviteError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={invite.isPending} onClick={() => changeOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={invite.isPending || (!selected && !email.trim())}>{t(invite.isPending ? "Sending..." : "Send invitation")}</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>}
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
    <Dialog open={canManage && Boolean(removeId)} onOpenChange={next => { if (!next && !remove.isPending) { setRemoveId(null); setRemoveReason(""); } }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("Remove Member")}</DialogTitle><DialogDescription>{t("Current project access and realtime sessions will be revoked immediately. Historical contributions, verified evidence, and attribution eligibility remain permanently recorded.")}</DialogDescription></DialogHeader><div className="space-y-1.5 py-2"><Label htmlFor="remove-member-reason" className="text-xs font-semibold">{t("Reason for removal (optional)")}</Label><Input id="remove-member-reason" placeholder={t("Reason recorded in project audit log")} value={removeReason} onChange={e => setRemoveReason(e.target.value)} maxLength={500} /></div><DialogFooter><Button type="button" variant="outline" disabled={remove.isPending} onClick={() => { setRemoveId(null); setRemoveReason(""); }}>{t("Cancel")}</Button><Button type="button" variant="destructive" disabled={remove.isPending} onClick={async () => { if (!removeId) return; try { await remove.mutateAsync({ memberId: removeId, reason: removeReason.trim() || undefined }); toast.success(t("Member removed")); setRemoveId(null); setRemoveReason(""); } catch { toast.error(t("Failed to remove member")); } }}>{t(remove.isPending ? "Removing..." : "Remove")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={canManage && Boolean(transfer)} onOpenChange={next => { if (!next && !transferOwnership.isPending) setTransfer(null); }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("Transfer project ownership?")}</DialogTitle><DialogDescription>{transfer ? t("{{name}} will become the project owner. You will become a regular member and lose owner-only controls.", { name: transfer.name }) : null}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={transferOwnership.isPending} onClick={() => setTransfer(null)}>{t("Cancel")}</Button><Button type="button" disabled={transferOwnership.isPending} onClick={async () => { if (!transfer) return; try { await transferOwnership.mutateAsync(transfer.id); toast.success(t("Ownership transferred")); setTransfer(null); } catch { toast.error(t("Could not transfer ownership")); } }}>{t(transferOwnership.isPending ? "Transferring…" : "Transfer ownership")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
