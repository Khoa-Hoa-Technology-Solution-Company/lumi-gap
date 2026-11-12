import { useQuery } from "@tanstack/react-query";
import type { AvailableMentor } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { academicSupportApi } from "../api/academic-support.api";
import { ApplicantEvidence } from "./mentorship-applicants";

export function MentorMatchEvidenceDialog({ projectId, mentor, onClose }: { projectId: string; mentor: AvailableMentor; onClose: () => void }) {
  const { t } = useI18n(), userId = useAuthStore(state => state.user?.id);
  const evidence = useQuery({ queryKey: ["academic-support", userId, "mentor-evidence", projectId, mentor._id], queryFn: () => academicSupportApi.mentorEvidence(projectId, mentor._id), retry: false });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n><DialogHeader><DialogTitle>{mentor.fullName}</DialogTitle><DialogDescription>{t("Review declared expertise and available publication evidence before inviting a mentor.")}</DialogDescription></DialogHeader>{evidence.isPending ? <p role="status">{t("Loading…")}</p> : evidence.data ? <ApplicantEvidence evidence={evidence.data} /> : <div role="alert"><p>{t("Matching evidence is unavailable or this lecturer is no longer eligible.")}</p><Button variant="outline" onClick={() => void evidence.refetch()}>{t("Try again")}</Button></div>}</DialogContent></Dialog>;
}
