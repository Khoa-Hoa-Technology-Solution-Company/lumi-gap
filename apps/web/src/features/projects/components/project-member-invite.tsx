import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { IProjectMember } from "@trend/shared-types";
import { Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { api } from "@/services/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useInviteProjectMember } from "../hooks/use-projects";

interface SearchUser { id: string; fullName: string | null; email: string; }
interface Props { projectId: string; projectTitle: string; ownerId: string; members: IProjectMember[]; }

export function ProjectMemberInvite({ projectId, projectTitle, ownerId, members }: Props) {
  const { t } = useI18n();
  const inviter = useAuthStore(state => state.user);
  const isOwner = Boolean(inviter?.id && inviter.id === ownerId);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [inviteError, setInviteError] = useState("");
  const submitLock = useRef(false);
  const invite = useInviteProjectMember(projectId);
  const queryEmail = useDebouncedValue(email.trim(), 250);
  const search = useQuery({
    queryKey: ["searchUsers", queryEmail],
    queryFn: async ({ signal }) => (await api.get<{ data: SearchUser[] }>(`/auth/search?email=${encodeURIComponent(queryEmail)}`, { signal })).data.data,
    enabled: isOwner && open && !selected && queryEmail.length >= 2,
    staleTime: 60_000,
  });
  const memberIds = new Set(members.map(member => typeof member.targetId === "string" ? member.targetId : member.targetId._id));
  const reset = () => { setInviteError(""); setEmail(""); setSelected(null); };
  const changeOpen = (next: boolean) => {
    if (invite.isPending || submitLock.current) return;
    setOpen(next);
    if (!next) reset();
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!isOwner || (!selected && !email.trim()) || invite.isPending || submitLock.current) return;
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

  if (!isOwner) return null;
  return <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild><Button type="button" size="sm" className="font-semibold shadow-xs"><UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />{t("Invite member")}</Button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" closeLabel={t("Close")} data-no-i18n>
          <DialogHeader><DialogTitle>{t("Invite member")}</DialogTitle><DialogDescription>{t("Invite someone to join the research team. They gain access after accepting.")}</DialogDescription></DialogHeader>
          <form onSubmit={send} className="space-y-4">
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
              <p className="break-words text-sm leading-6">{t("{{name}} invites you to collaborate on {{project}}.", { name: inviter?.fullName || t("Project owner"), project: projectTitle })}</p>
              <p className="text-xs leading-5">{t("Project role")}: <span className="font-medium">{t("Member")}</span></p>
              <p className="text-xs leading-5 text-muted-foreground">{t("The email includes a secure invitation link. They join only after accepting in LumiGap.")}</p>
            </section>
            {inviteError ? <p role="alert" className="text-sm text-destructive">{inviteError}</p> : null}
            <p className="text-xs leading-5 text-muted-foreground">{t("Looking for a lecturer?")} <Link className="text-primary underline underline-offset-4" to={`/projects/${encodeURIComponent(projectId)}?tab=support`} onClick={event => { if (invite.isPending || submitLock.current) event.preventDefault(); else changeOpen(false); }}>{t("Continue to Academic Support")}</Link></p>
            <DialogFooter><Button type="button" variant="outline" disabled={invite.isPending} onClick={() => changeOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={invite.isPending || (!selected && !email.trim())}>{t(invite.isPending ? "Sending..." : "Send invitation")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>;
}
