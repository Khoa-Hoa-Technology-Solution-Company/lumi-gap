import { useQuery } from "@tanstack/react-query";
import type { AvailableMentor } from "@trend/shared-types";
import { AlertCircle, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { academicSupportApi } from "../api/academic-support.api";
import { ApplicantEvidence } from "./mentorship-applicants";
import "../mentor-discovery.css";

function initials(name?: string) {
  const parts = (name ?? "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "GV";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function MentorMatchEvidenceDialog({ projectId, mentor, onClose }: { projectId: string; mentor: AvailableMentor; onClose: () => void }) {
  const { t } = useI18n(), userId = useAuthStore(state => state.user?.id);
  const evidence = useQuery({ queryKey: ["academic-support", userId, "mentor-evidence", projectId, mentor._id], queryFn: () => academicSupportApi.mentorEvidence(projectId, mentor._id), retry: false });
  const isDemo = /\bdemo\b/i.test(mentor.fullName ?? "");

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="mentor-evidence-dialog max-h-[86dvh] overflow-hidden p-0 sm:max-w-2xl sm:p-0" data-no-i18n>
        <DialogHeader className="mentor-evidence-dialog-header text-left">
          <div className="mentor-evidence-dialog-identity">
            <div className="mentor-evidence-dialog-avatar" aria-hidden="true">
              {mentor.avatarUrl ? (
                <img src={mentor.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initials(mentor.fullName)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold leading-snug text-foreground">
                  {mentor.fullName}
                </DialogTitle>
                {isDemo && (
                  <Badge variant="outline" className="text-[11px] font-medium">
                    {t("supervisor.demo")}
                  </Badge>
                )}
              </div>
              {mentor.institution && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{mentor.institution}</span>
                </p>
              )}
              <DialogDescription className="text-xs leading-5 text-muted-foreground">
                {t("Review declared expertise and available publication evidence before inviting a mentor.")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mentor-evidence-dialog-body">
          {evidence.isPending ? (
            <div role="status" className="space-y-3 py-2" aria-label={t("Loading…")}>
              <span className="sr-only">{t("Loading…")}</span>
              <Skeleton className="h-24 w-full rounded-xl" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : evidence.data ? (
            <ApplicantEvidence evidence={evidence.data} />
          ) : (
            <div role="alert" className="mentor-evidence-error-box">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-2.5">
                <p className="text-sm text-foreground">
                  {t("Matching evidence is unavailable or this lecturer is no longer eligible.")}
                </p>
                <Button size="sm" variant="outline" onClick={() => void evidence.refetch()}>
                  {t("Try again")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
