import { useRef } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MentorshipRequest } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipViewer } from "../utils/mentorship-viewer";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";
import { InvitationDossierView } from "./invitation-dossier-view";
import { mentorshipError } from "./mentoring-preferences";
import "../mentorship-invitation-viewer.css";

/** All viewers fetch the same authorized snapshot. Only server-derived actions can mutate it. */
export function MentorshipInvitationViewer(props: { projectId: string; requestId: string; currentProjectId?: string; onClose: () => void }) {
  const userId = useAuthStore(state => state.user?.id);
  return <InvitationViewer key={`${userId}:${props.projectId}:${props.requestId}`} {...props} />;
}
function InvitationViewer({ projectId, requestId, currentProjectId, onClose }: { projectId: string; requestId: string; currentProjectId?: string; onClose: () => void }) {
  const { t } = useI18n(), userId = useAuthStore(state => state.user?.id), cache = useQueryClient(), lock = useRef(false);
  const key = ["academic-support", userId, "invitation-detail", projectId, requestId];
  const query = useQuery({ queryKey: key, queryFn: () => academicSupportApi.requestDetail(projectId, requestId), enabled: Boolean(userId), retry: false, staleTime: 0, refetchOnWindowFocus: false });
  const item = query.data;
  const viewer = item ? mentorshipViewer(item, userId) : "TEAM";
  const pending = item?.status === "PENDING";
  const mutation = useMutation({ mutationFn: async (action: "accept" | "decline" | "cancel") => {
    if (!item || useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
    return academicSupportApi.respond(item, action, "");
  }, onSuccess: async (result: MentorshipRequest) => {
    if (useAuthStore.getState().user?.id !== userId) return;
    if (result?.kind === "REQUEST") cache.setQueryData(key, result);
    await Promise.all(["academic-support", "mentor-workspace", "notifications", "projects", "home-research"].map(group => cache.invalidateQueries({ queryKey: [group] })));
  }, onError: () => { void query.refetch(); } });
  const act = async (action: "accept" | "decline" | "cancel") => {
    if (lock.current || mutation.isPending || query.isFetching || !item || !pending || !item.actions[action] || (action === "cancel" ? viewer !== "SENDER" : viewer !== "RECIPIENT")) return;
    lock.current = true; try { await mutation.mutateAsync(action); } catch { /* Keep the snapshot and show the error. */ } finally { lock.current = false; }
  };
  const recipientMentor = viewer === "RECIPIENT" && item?.direction === "PROJECT_TO_LECTURER";
  return <Dialog open onOpenChange={open => { if (!open && !lock.current && !mutation.isPending) onClose(); }}>
    <DialogContent className="mentor-invitation-viewer" data-no-i18n showClose={!mutation.isPending} closeLabel={t("Close")} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="mentor-invitation-viewer-header"><DialogTitle>{t(viewer === "SENDER" ? "supervisor.sentTitle" : "supervisor.receivedTitle")}</DialogTitle><DialogDescription>{t("supervisor.snapshotDescription")}</DialogDescription></DialogHeader>
      <div className="mentor-invitation-viewer-body" role="region" aria-label={t("supervisor.invitationContent")} tabIndex={0}>
      <div className="space-y-4">
      {query.isLoading && <p role="status">{t("Loading…")}</p>}
      {query.isError ? <div role="alert" className="space-y-2 text-sm"><p>{t(mentorshipError(query.error))}</p><Button size="sm" variant="outline" onClick={() => void query.refetch()}>{t("Reload invitation")}</Button></div> : item && <>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 text-sm"><div className="min-w-0 space-y-1">
          {item.direction === "PROJECT_TO_LECTURER" && <p className="break-words"><span className="text-muted-foreground">{t("supervisor.recipient")}: </span><Link className="font-medium text-primary hover:underline" target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}>{item.mentorUser.fullName}</Link></p>}
          <p className="break-words"><span className="text-muted-foreground">{t("Requested by")}: </span>{item.requestedBy.fullName}</p>
          {item.createdAt && <p className="text-xs text-muted-foreground">{t("supervisor.sentOn")}: {new Date(item.createdAt).toLocaleString()}</p>}
        </div><Badge variant="secondary">{t(item.status)}</Badge></div>
        {item.legacyPreview && <p role="status" className="text-xs text-muted-foreground">{t("supervisor.legacySnapshot")}</p>}
        <InvitationDossierView dossier={item.dossier} legacyProject={item.project} legacySender={item.requestedBy} legacyMessage={item.message} attachments={item.attachments} showAccessNotice={false} />
        {pending && viewer === "SENDER" && <p role="status" className="text-sm text-muted-foreground">{t(item.direction === "PROJECT_TO_LECTURER" ? "supervisor.waitingMentor" : "supervisor.waitingTeam")}</p>}
        {pending && viewer === "RECIPIENT" && <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs leading-5"><p className="font-medium">{t("supervisor.ifAccepted")}</p><p className="text-muted-foreground">{t(recipientMentor ? "supervisor.acceptedAccess" : "supervisor.offerAccess")}</p></div>}
        {!pending && <p role="status" className="text-sm font-medium">{t(item.status === "ACCEPTED" && recipientMentor ? "supervisor.accepted" : item.status)}</p>}
        {query.isFetching && <p role="status" className="text-xs text-muted-foreground">{t("Checking the latest invitation…")}</p>}
        {mutation.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(mutation.error))}</p>}
      </>}
      </div>
      </div>
      <footer className="mentor-invitation-viewer-footer"><Button variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("Close")}</Button>
        {!query.isError && pending && viewer === "SENDER" && item?.actions.cancel && <Button variant="outline" disabled={mutation.isPending || query.isFetching} onClick={() => void act("cancel")}>{t("supervisor.withdraw")}</Button>}
        {!query.isError && pending && viewer === "RECIPIENT" && <>{item?.actions.decline && <Button variant="outline" disabled={mutation.isPending || query.isFetching} onClick={() => void act("decline")}>{t("Decline")}</Button>}{item?.actions.accept && <Button disabled={mutation.isPending || query.isFetching} onClick={() => void act("accept")}>{t("supervisor.accept")}</Button>}</>}
        {!query.isError && !pending && viewer === "RECIPIENT" && item?.actions.openProject && !currentProjectId && <Button asChild><Link to={recipientMentor ? mentorWorkspaceDestination(`/academic-support/projects/${encodeURIComponent(projectId)}`) : `/projects/${encodeURIComponent(projectId)}?tab=support`}>{t("Open project")}</Link></Button>}
      </footer>
    </DialogContent>
  </Dialog>;
}
