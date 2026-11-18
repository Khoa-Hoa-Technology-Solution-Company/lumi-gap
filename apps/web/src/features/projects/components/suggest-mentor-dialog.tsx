import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MentorProjectPreview } from "@trend/shared-types";
import { academicSupportApi, type MentorPreview } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";
import { LecturerInvitationCard } from "./lecturer-invitation-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import "../supervisor-invitation.css";

export type SuggestMentorTarget = {
  _id: string;
  fullName?: string;
  avatarUrl?: string;
  positionTitle?: string;
  institutionName?: string;
  verifiedLecturer?: boolean;
  acceptingMentorships?: boolean;
  expertiseAreas?: string[];
  researchInterests?: string[];
  matchedTerms?: string[];
  sameInstitution?: boolean;
};

interface SuggestMentorDialogProps {
  project: MentorPreview | MentorProjectPreview;
  mentor: SuggestMentorTarget;
  onClose: () => void;
  onSubmitted?: (lecturerName: string) => void;
}
export function SuggestMentorDialog(props: SuggestMentorDialogProps) {
  const userId = useAuthStore(state => state.user?.id);
  return <SuggestMentorForm key={`${userId}:${props.project.id}:${props.mentor._id}`} {...props} />;
}
function SuggestMentorForm({ project, mentor, onClose, onSubmitted }: SuggestMentorDialogProps) {
  const { t } = useI18n(), cache = useQueryClient(), userId = useAuthStore(state => state.user?.id);
  const [message, setMessage] = useState(""), [validationError, setValidationError] = useState("");
  const submitLock = useRef(false);
  const mutation = useMutation({
    mutationFn: () => {
      if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
      return academicSupportApi.suggest(project.id, mentor._id, message.trim());
    },
    onSuccess: () => {
      if (useAuthStore.getState().user?.id !== userId) return;
      void cache.invalidateQueries({ queryKey: ["academic-support"] });
      toast.success(t("supervisor.proposalSent")); onSubmitted?.(mentor.fullName || t("supervisor.profile")); onClose();
    },
  });
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending && !submitLock.current) onClose(); }}>
    <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg" data-no-i18n showClose={!mutation.isPending} closeLabel={t("Close")} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader><DialogTitle>{t("supervisor.propose")}</DialogTitle><DialogDescription>{project.title}</DialogDescription></DialogHeader>
      <LecturerInvitationCard mentor={mentor} onChooseAgain={onClose} disabled={mutation.isPending} />
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (submitLock.current || mutation.isPending) return;
        if (!message.trim() || message.trim().length > 1000) { setValidationError(t("supervisor.proposalError")); return; }
        setValidationError(""); submitLock.current = true;
        try { await mutation.mutateAsync(); } catch { /* Keep the reason for retry. */ } finally { submitLock.current = false; }
      }}>
        <label className="block space-y-2 text-sm font-medium" htmlFor="mentor-proposal-reason"><span>{t("supervisor.proposalReason")} *</span><textarea id="mentor-proposal-reason" autoFocus rows={4} maxLength={1000} disabled={mutation.isPending} value={message} onChange={event => { setMessage(event.target.value); setValidationError(""); mutation.reset(); }} placeholder={t("supervisor.proposalPlaceholder")} aria-invalid={Boolean(validationError)} aria-describedby="mentor-proposal-disclosure" className="w-full resize-y rounded-md border bg-background p-3 font-normal leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <p id="mentor-proposal-disclosure" className="text-xs leading-5 text-muted-foreground">{t("supervisor.proposalDisclosure")}</p>
        {(validationError || mutation.error) && <p role="alert" className="text-sm text-destructive">{validationError || t(mentorshipError(mutation.error))}</p>}
        <footer className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>{t("Cancel")}</Button><Button type="submit" disabled={mutation.isPending || !message.trim()}>{t(mutation.isPending ? "Sending…" : "Send suggestion")}</Button></footer>
      </form>
    </DialogContent>
  </Dialog>;
}
