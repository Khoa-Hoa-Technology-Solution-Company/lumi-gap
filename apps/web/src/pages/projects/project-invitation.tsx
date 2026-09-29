import { Link, useNavigate, useParams } from "react-router-dom";
import type { AxiosError } from "axios";
import type { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, LogOut, Mail, UserRoundCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser, useLogout } from "@/features/auth";
import { authApi } from "@/features/auth/api/auth.api";
import { useProjectInvitationPreview, useRespondToProjectInvitationToken } from "@/features/projects/hooks/use-projects";
import { cn } from "@/utils/cn";

const STATUS_COPY = {
  PENDING: { label: "Pending", className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" },
  ACCEPTED: { label: "Accepted", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200" },
  DECLINED: { label: "Declined", className: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" },
  CANCELLED: { label: "Cancelled", className: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" },
  EXPIRED: { label: "Expired", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" },
} as const;

function returnTo(token: string) {
  return `/invitations/${encodeURIComponent(token)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function InvitationShell({ children }: { children: ReactNode }) {
  return (
    <main className="container flex min-h-[calc(100vh-9rem)] max-w-3xl items-center py-10">
      <Card className="w-full overflow-hidden border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
        <CardContent className="p-0">
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

export function ProjectInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const logout = useLogout();
  const preview = useProjectInvitationPreview(token);
  const respond = useRespondToProjectInvitationToken(token ?? "");
  const addInvitedEmail = useMutation({
    mutationFn: (email: string) => authApi.addEmail(email, "CONTACT"),
    onSuccess: () => {
      toast.success("Verification email sent. Open it, then return to this invitation.");
    },
    onError: (error) => {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>;
      toast.error(axiosError.response?.data?.error?.message ?? "Could not send verification email");
    },
  });

  if (!token) {
    return (
      <InvitationShell>
        <div className="p-8 text-center">
          <AlertTriangle className="mx-auto h-9 w-9 text-amber-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Invalid invitation link</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please open the invitation from the latest LumiGap email.</p>
        </div>
      </InvitationShell>
    );
  }

  const invitation = preview.data;
  const isLoggedIn = Boolean(currentUser.data?.user);
  const canRespond = Boolean(invitation?.authenticated && invitation.emailMatches && invitation.status === "PENDING" && !invitation.alreadyMember);

  const handleRespond = async (decision: "accept" | "decline") => {
    try {
      await respond.mutateAsync(decision);
      toast.success(decision === "accept" ? "Invitation accepted" : "Invitation declined");
      await preview.refetch();
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>;
      toast.error(axiosError.response?.data?.error?.message ?? "Could not update this invitation");
    }
  };

  const handleSwitchAccount = async () => {
    await logout.mutateAsync();
    navigate(`/login?returnTo=${encodeURIComponent(returnTo(token))}`, { replace: true });
  };

  if (preview.isLoading) {
    return (
      <InvitationShell>
        <div className="space-y-5 p-8">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </InvitationShell>
    );
  }

  if (preview.isError || !invitation) {
    return (
      <InvitationShell>
        <div className="p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">This invitation link is no longer valid.</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            It may have expired, been cancelled, or a newer invitation link may have been requested.
          </p>
          <Button asChild className="mt-6">
            <Link to="/projects">Go to projects</Link>
          </Button>
        </div>
      </InvitationShell>
    );
  }

  const status = STATUS_COPY[invitation.status];

  return (
    <InvitationShell>
      <div className="border-b bg-muted/25 px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Project invitation</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{invitation.projectTitle}</h1>
          </div>
          <Badge variant="outline" className={cn("w-fit", status.className)}>{status.label}</Badge>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6 sm:px-8">
        <div className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Invited by</p>
            <p className="mt-1 font-medium">{invitation.inviterName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Invited email</p>
            <p className="mt-1 font-medium">{invitation.invitedEmail}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Project role</p>
            <p className="mt-1 font-medium capitalize">{invitation.role.toLowerCase()}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Expires</p>
            <p className="mt-1 font-medium">{formatDate(invitation.expiresAt)}</p>
          </div>
        </div>

        {invitation.projectDescription ? (
          <section>
            <h2 className="text-sm font-semibold">Project description</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{invitation.projectDescription}</p>
          </section>
        ) : null}

        {invitation.message ? (
          <section className="rounded-xl border bg-muted/20 p-4">
            <h2 className="text-sm font-semibold">Invitation message</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{invitation.message}</p>
          </section>
        ) : null}

        {!isLoggedIn ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">Sign in with the invited email to respond.</p>
                <p className="mt-1 leading-6">Use {invitation.invitedEmail} so LumiGap can match this invitation to your account.</p>
              </div>
            </div>
          </div>
        ) : !invitation.emailMatches ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">Verify the invited email on this account, or switch accounts.</p>
                <p className="mt-1 leading-6">Invited email: {invitation.invitedEmail}. Current account: {invitation.currentUserEmail ?? "unknown"}.</p>
                <p className="mt-1 leading-6">LumiGap cannot accept this invitation until the invited email is linked and verified on the signed-in account.</p>
              </div>
            </div>
          </div>
        ) : invitation.alreadyMember ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            <div className="flex gap-3">
              <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>You are already a member of this project.</p>
            </div>
          </div>
        ) : invitation.status === "PENDING" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>This invitation is ready for your response.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/25 p-4 text-sm text-muted-foreground">
            This invitation is {status.label.toLowerCase()} and can no longer be changed from this link.
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-end">
          {!isLoggedIn ? (
            <>
              <Button variant="outline" asChild>
                <Link to={`/register?returnTo=${encodeURIComponent(returnTo(token))}`}>Create account</Link>
              </Button>
              <Button asChild>
                <Link to={`/login?returnTo=${encodeURIComponent(returnTo(token))}`}>Sign in to respond</Link>
              </Button>
            </>
          ) : !invitation.emailMatches ? (
            <>
              <Button
                variant="outline"
                onClick={() => addInvitedEmail.mutate(invitation.invitedEmail)}
                disabled={addInvitedEmail.isPending}
              >
                {addInvitedEmail.isPending ? "Sending..." : "Verify invited email"}
              </Button>
              <Button variant="outline" onClick={handleSwitchAccount} disabled={logout.isPending}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Switch account
              </Button>
            </>
          ) : invitation.alreadyMember || invitation.status === "ACCEPTED" ? (
            <Button asChild>
              <Link to={`/projects/${invitation.projectId}`}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Open project
              </Link>
            </Button>
          ) : canRespond ? (
            <>
              <Button variant="outline" onClick={() => void handleRespond("decline")} disabled={respond.isPending}>Decline</Button>
              <Button onClick={() => void handleRespond("accept")} disabled={respond.isPending}>
                {respond.isPending ? "Updating..." : "Accept invitation"}
              </Button>
            </>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/projects">Go to projects</Link>
            </Button>
          )}
        </div>
      </div>
    </InvitationShell>
  );
}
