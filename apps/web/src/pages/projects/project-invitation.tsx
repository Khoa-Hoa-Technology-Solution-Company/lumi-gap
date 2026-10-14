import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout } from "@/features/auth";
import { useProjectInvitationPreview, useRespondToProjectInvitationToken } from "@/features/projects/hooks/use-projects";
import { useI18n } from "@/i18n";

function InvitationShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20" data-no-i18n>{children}</main>;
}

export function ProjectInvitationPage() {
  const { t, language } = useI18n();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate(), logout = useLogout();
  const preview = useProjectInvitationPreview(token), respond = useRespondToProjectInvitationToken(token ?? "");
  const lock = useRef(false);
  const invitation = preview.data;
  const returnTo = `/invitations/${encodeURIComponent(token ?? "")}`;
  const respondTo = async (decision: "accept" | "decline") => {
    if (lock.current || respond.isPending) return;
    lock.current = true;
    try {
      await respond.mutateAsync(decision);
      toast.success(t(decision === "accept" ? "Invitation accepted" : "Invitation declined"));
      await preview.refetch();
    } catch { toast.error(t("Could not update this invitation. Refresh its status and try again.")); void preview.refetch(); }
    finally { lock.current = false; }
  };
  if (preview.isLoading) return <InvitationShell><div role="status" aria-label={t("Loading invitation…")} className="space-y-5"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-28 w-full" /></div></InvitationShell>;
  if (preview.isError || !invitation) return <InvitationShell><Mail className="mb-5 h-8 w-8 text-muted-foreground" /><h1 className="text-2xl font-semibold">{t("This invitation could not be opened")}</h1><p className="mt-3 leading-7 text-muted-foreground">{t("Check your connection and use the latest invitation link. It may have been replaced or cancelled.")}</p><div className="mt-6 flex gap-3"><Button variant="outline" onClick={() => void preview.refetch()}>{t("Try again")}</Button><Button asChild><Link to="/projects">{t("Go to projects")}</Link></Button></div></InvitationShell>;
  const statuses = { PENDING: "Pending", ACCEPTED: "Accepted", DECLINED: "Declined", CANCELLED: "Cancelled", EXPIRED: "Expired" };
  const showDetails = invitation.authenticated && invitation.emailMatches;
  return <InvitationShell>
    <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" />{t("Project invitation")}</p>
    <h1 className="break-words text-3xl font-semibold leading-tight">{showDetails ? invitation.projectTitle : t("Join a research project")}</h1>
    <div className="mt-5 flex flex-wrap items-center gap-3"><Badge variant="outline">{t(statuses[invitation.status])}</Badge><span className="text-sm text-muted-foreground">{t("Expires")}: {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitation.expiresAt))}</span></div>
    {showDetails ? <div className="my-7 space-y-4 border-y py-5"><p className="break-all text-sm">{t("Invited by")}: <strong>{invitation.inviterName}</strong></p><p className="break-all text-sm">{t("Recipient email")}: {invitation.invitedEmail}</p><p className="text-sm">{t("Project role")}: {t("Member")}</p>{invitation.message ? <p className="whitespace-pre-wrap break-words text-sm leading-7">{invitation.message}</p> : null}</div> : null}
    <p className="mt-5 text-sm leading-7 text-muted-foreground">{t(!invitation.authenticated ? "Sign in or register with the invited email to view this invitation. Private project details are hidden until your identity is verified."
      : !invitation.emailMatches ? "This invitation is for another verified identity. Use the account that received it, or verify your email in account settings."
      : invitation.alreadyMember ? "You are already a member of this project."
      : invitation.status === "PENDING" ? "Accept to join the project as a member. You can also decline."
      : "This invitation has already been handled or is no longer active. Ask the project owner for a new invitation if needed.")}</p>
    <div className="mt-7 flex flex-col gap-3 sm:flex-row">
      {!invitation.authenticated ? <><Button asChild><Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>{t("Sign in")}</Link></Button><Button asChild variant="outline"><Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>{t("Create account")}</Link></Button></>
        : !invitation.emailMatches ? <><Button variant="outline" disabled={logout.isPending} onClick={() => { void logout.mutateAsync().then(() => navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })); }}>{t("Switch account")}</Button><Button asChild variant="outline"><Link to="/settings">{t("Account settings")}</Link></Button><Button variant="ghost" onClick={() => void preview.refetch()}>{t("Check again")}</Button></>
        : invitation.alreadyMember ? <Button asChild><Link to={`/projects/${encodeURIComponent(invitation.projectId)}`}><CheckCircle2 className="mr-2 h-4 w-4" />{t("Open project")}</Link></Button>
        : invitation.status === "PENDING" ? <><Button disabled={respond.isPending} onClick={() => void respondTo("accept")}>{t(respond.isPending ? "Updating…" : "Accept invitation")}</Button><Button variant="outline" disabled={respond.isPending} onClick={() => void respondTo("decline")}>{t("Decline invitation")}</Button></>
        : <Button asChild variant="outline"><Link to="/projects">{t("Go to projects")}</Link></Button>}
    </div>
  </InvitationShell>;
}
