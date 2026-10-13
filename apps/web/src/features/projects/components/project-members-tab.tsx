import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { IProject, IProjectMember } from "@trend/shared-types";
import { Mail, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { api } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useCancelProjectInvitation, useInviteProjectMember, useRemoveMemberFromProject, useTransferProjectOwnership } from "../hooks/use-projects";

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
  const [transfer, setTransfer] = useState<{ id: string; name: string } | null>(null);
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
    if (!canManage || kind !== "MEMBER" || (!selected && !email.trim()) || invite.isPending) return;
    try {
      // The server resolves the selected user's email and prepares the invitation.
      await invite.mutateAsync(selected ? { userId: selected.id } : { email: email.trim() });
      toast.success(t("Invitation sent"));
      setOpen(false);
      reset();
    } catch { toast.error(t("Could not send the invitation")); }
  };

  return <div className="space-y-5" data-no-i18n>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-lg font-semibold">{t("Project Members")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("Collaborators join only after accepting an invitation.")}</p></div>
      {canManage && <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />{t("Invite collaborator")}</Button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-no-i18n>
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
                    : search.data?.length ? <ul aria-label={t("Matching users")}>{search.data.map(user => <li key={user.id}><button type="button" disabled={memberIds.has(user.id)} className="w-full rounded p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60" onClick={() => setSelected(user)}><span className="block text-sm font-medium">{user.fullName || user.email}</span><span className="block text-xs text-muted-foreground">{user.email}{memberIds.has(user.id) ? ` · ${t("Already a project member")}` : ""}</span></button></li>)}</ul>
                    : <p className="p-2 text-xs text-muted-foreground">{t("No account found. You can invite this email address.")}</p>}
                </div>}
              </>}
              <p className="text-xs leading-5 text-muted-foreground">{t("Choose a user to use their account email, or enter an external email address.")}</p>
            </div>
            <section className="space-y-2 rounded-lg border bg-muted/30 p-3" aria-label={t("Invitation email")}>
              <h4 className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4 text-primary" />{t("Invitation email")}</h4>
              <p className="text-xs leading-5 text-muted-foreground">{t("LumiGap prepares the invitation email automatically. No message is required.")}</p>
              <p className="break-words text-sm leading-6">{t("{{name}} invites you to collaborate on {{project}}.", { name: inviter?.fullName || t("Project owner"), project: projectTitle })}</p>
              <p className="text-xs leading-5">{t("Project role")}: <span className="font-medium">{t("Member")}</span></p>
              <p className="text-xs leading-5 text-muted-foreground">{t("The email includes a secure invitation link. They join only after accepting in LumiGap.")}</p>
            </section>
            <DialogFooter><Button type="button" variant="outline" disabled={invite.isPending} onClick={() => changeOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={invite.isPending || (!selected && !email.trim())}>{t(invite.isPending ? "Sending..." : "Send invitation")}</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>}
    </header>

    {isOwner && Boolean(pendingInvitations?.length) && <section className="space-y-2">
      <h4 className="text-sm font-semibold">{t("Pending invitations")}</h4><p className="text-xs text-muted-foreground">{t("Invitations expire automatically after 7 days.")}</p>
      <div className="divide-y rounded-lg border">{pendingInvitations?.map(invitation => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0"><p className="break-words text-sm font-medium">{invitation.invitedUser?.fullName || invitation.email}</p><p className="break-words text-xs text-muted-foreground">{invitation.email} · {t("Invite expires")}: {new Date(invitation.expiresAt).toLocaleDateString(language)}</p></div>
        {canManage ? <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={async () => { try { await cancel.mutateAsync(invitation.id); toast.success(t("Invitation cancelled")); } catch { toast.error(t("Could not cancel invitation")); } }}>{t("Cancel invitation")}</Button> : null}
      </div>)}</div>
    </section>}

    {!members.length ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t("Invite researchers to collaborate on this project.")}</p> : <ul className="grid gap-3 md:grid-cols-2">
      {members.map(member => {
        const user = typeof member.targetId === "string" ? null : member.targetId;
        const id = user?._id ?? String(member.targetId);
        const primaryOwner = id === ownerId;
        const name = user?.fullName || t("Unknown User");
        return <li key={id} className="flex items-start gap-3 rounded-lg border bg-card p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary" aria-hidden="true">{user?.fullName?.trim().charAt(0) || <Users className="h-4 w-4" />}</div>
          <div className="min-w-0 flex-1"><Link to={`/academics/${encodeURIComponent(id)}`} className="block truncate text-sm font-semibold hover:underline">{name}</Link><p className="mt-1 break-all text-xs text-muted-foreground">{user?.email}</p><Badge variant={primaryOwner ? "secondary" : "outline"} className="mt-2 font-medium">{t(primaryOwner ? "Project owner" : "Member")}</Badge></div>
          {canManage && !primaryOwner && <div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="icon" title={t("Transfer ownership")} aria-label={t("Transfer ownership")} disabled={transferOwnership.isPending} className="h-8 w-8" onClick={() => setTransfer({ id, name })}><ShieldCheck className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title={t("Remove member")} aria-label={t("Remove member")} className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setRemoveId(id)}><Trash2 className="h-4 w-4" /></Button></div>}
        </li>;
      })}
    </ul>}

    <Dialog open={canManage && Boolean(removeId)} onOpenChange={next => { if (!next && !remove.isPending) setRemoveId(null); }}><DialogContent data-no-i18n><DialogHeader><DialogTitle>{t("Remove Member")}</DialogTitle><DialogDescription>{t("Are you sure you want to remove this member? They will lose permissions to add papers and generate reports.")}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={remove.isPending} onClick={() => setRemoveId(null)}>{t("Cancel")}</Button><Button type="button" variant="destructive" disabled={remove.isPending} onClick={async () => { if (!removeId) return; try { await remove.mutateAsync(removeId); toast.success(t("Member removed")); setRemoveId(null); } catch { toast.error(t("Failed to remove member")); } }}>{t(remove.isPending ? "Removing..." : "Remove")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={canManage && Boolean(transfer)} onOpenChange={next => { if (!next && !transferOwnership.isPending) setTransfer(null); }}><DialogContent data-no-i18n><DialogHeader><DialogTitle>{t("Transfer project ownership?")}</DialogTitle><DialogDescription>{transfer ? t("{{name}} will become the project owner. You will become a regular member and lose owner-only controls.", { name: transfer.name }) : null}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={transferOwnership.isPending} onClick={() => setTransfer(null)}>{t("Cancel")}</Button><Button type="button" disabled={transferOwnership.isPending} onClick={async () => { if (!transfer) return; try { await transferOwnership.mutateAsync(transfer.id); toast.success(t("Ownership transferred")); setTransfer(null); } catch { toast.error(t("Could not transfer ownership")); } }}>{t(transferOwnership.isPending ? "Transferring…" : "Transfer ownership")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
