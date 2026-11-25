import { useRef, useState } from "react";
import { Archive, ArchiveRestore, GitBranch, Info, Lock, MoreHorizontal, RotateCcw, ShieldAlert, Trash2, Users } from "lucide-react";
import type { ManuscriptGovernanceSummary, ManuscriptSummary } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";

export type ManuscriptLifecycleAction = "SOFT_DELETE" | "ARCHIVE" | "UNARCHIVE" | "RESTORE" | "INFO";

function approvalBadgeText(governance: ManuscriptGovernanceSummary | undefined): string {
  if (!governance || governance.approvalStatus === "NOT_APPLICABLE") {
    return "Personal draft · recoverable by creator or project owner";
  }
  if (governance.approvalStatus === "PROTECTED_RECORD") {
    return "Academic record locked · direct deletion disabled";
  }
  return "Co-author approval required for deletion · MVP uses Archive";
}

function actionHeadingKey(action: ManuscriptLifecycleAction): string {
  switch (action) {
    case "ARCHIVE":
      return "Archive manuscript?";
    case "UNARCHIVE":
      return "Reopen archived manuscript?";
    case "RESTORE":
      return "Restore manuscript from trash?";
    case "INFO":
      return "Collaborative manuscript protection";
    case "SOFT_DELETE":
    default:
      return "Move personal draft to trash?";
  }
}

function actionReasonKey(action: ManuscriptLifecycleAction, governance?: ManuscriptGovernanceSummary): string {
  if (action === "ARCHIVE") {
    return governance?.ownershipScope === "COLLABORATIVE"
      ? "Archiving protects shared team work and prevents unilateral deletion when co-author sign-off is unavailable."
      : "Archiving switches this manuscript to read-only reference mode while keeping every version intact.";
  }
  if (action === "UNARCHIVE") {
    return "Reopening restores editing permissions for authorized team collaborators from the latest saved state.";
  }
  if (action === "RESTORE") {
    return "Restoring returns this personal draft from trash back to the active manuscripts list with all saved versions intact.";
  }
  if (action === "INFO") {
    if (governance?.deleteBlockedReason === "HAS_SUBMISSIONS_OR_REVIEWS") {
      return "This manuscript has formal submissions or review threads, so versions, comments, and contribution history cannot be deleted directly.";
    }
    if (governance?.deleteBlockedReason === "COLLABORATIVE_MANUSCRIPT") {
      return "Multiple collaborators have contributed to this manuscript. Direct deletion is blocked until a co-author approval workflow is available.";
    }
    if (governance?.deleteBlockedReason === "PROJECT_ARCHIVED") {
      return "This project is archived, so manuscripts cannot be modified or moved to trash.";
    }
    return "Only the draft creator or project owner can manage lifecycle state for an unshared personal draft.";
  }
  return "Only unshared personal drafts without reviews or submissions can be moved to trash and restored later.";
}

function actionImpactItems(
  action: ManuscriptLifecycleAction,
  governance: ManuscriptGovernanceSummary | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): string[] {
  const counts = governance
    ? t("Preserves {{snapshots}} snapshots, {{comments}} discussions, and {{submissions}} submissions.", {
        snapshots: governance.snapshotCount,
        comments: governance.commentCount,
        submissions: governance.submissionCount,
      })
    : t("Saved snapshots, contribution history, and audit trail remain intact.");

  if (action === "ARCHIVE") {
    return [
      t("Moves the manuscript to read-only mode so collaborators cannot overwrite sections."),
      counts,
      t("Only the project owner can reopen it later."),
    ];
  }
  if (action === "UNARCHIVE") {
    return [
      t("Re-enables collaborative editing and GitHub synchronization in LumiGap."),
      counts,
    ];
  }
  if (action === "RESTORE") {
    return [
      t("Makes this draft visible again in the active project manuscripts list."),
      counts,
    ];
  }
  if (action === "INFO") {
    return [
      t("Active editing, compiled versions, comments, and attribution records stay protected."),
      counts,
      t("If the shared work is finished or paused, the project owner should Archive it instead of deleting."),
    ];
  }
  return [
    t("Hides the draft from the active list and places it into recoverable project trash."),
    counts,
    t("You or the project owner can restore this draft anytime from Manuscript Trash."),
  ];
}

function submitLabelKey(action: ManuscriptLifecycleAction, busy: boolean): string {
  switch (action) {
    case "ARCHIVE":
      return busy ? "Archiving…" : "Archive manuscript";
    case "UNARCHIVE":
      return busy ? "Reopening…" : "Reopen manuscript";
    case "RESTORE":
      return busy ? "Restoring…" : "Restore manuscript";
    case "SOFT_DELETE":
    default:
      return busy ? "Moving to trash…" : "Move to trash";
  }
}

export function ManuscriptActionsMenu({
  projectId,
  manuscript,
  mode = "active",
  onDeleted,
  onChanged,
  onRefresh,
}: {
  projectId: string;
  manuscript: ManuscriptSummary;
  mode?: "active" | "trash";
  onDeleted?: () => void;
  onChanged?: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const governance = manuscript.governance;
  const canDelete = Boolean(manuscript.canDelete);
  const canArchive = Boolean(governance?.canArchive);
  const canUnarchive = Boolean(governance?.canUnarchive);
  const canRestore = Boolean(governance?.canRestore);
  const hasProtectionInfo = Boolean(governance && !canDelete);

  const [action, setAction] = useState<ManuscriptLifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const version = useRef(manuscript.version);

  const openAction = (nextAction: ManuscriptLifecycleAction) => {
    version.current = manuscript.version;
    setAction(nextAction);
    setReason("");
    setStale(false);
    setError("");
  };

  const closeDialog = () => {
    if (submitting.current) return;
    setAction(null);
    setReason("");
    setError("");
    setStale(false);
  };

  const confirmAction = async () => {
    if (!action || action === "INFO" || submitting.current || stale) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const trimmedReason = reason.trim() || undefined;
    try {
      if (action === "SOFT_DELETE") {
        await manuscriptsApi.remove(projectId, manuscript.id, version.current, trimmedReason);
        setAction(null);
        onDeleted?.();
      } else if (action === "ARCHIVE") {
        await manuscriptsApi.archive(projectId, manuscript.id, version.current, trimmedReason);
        setAction(null);
      } else if (action === "UNARCHIVE") {
        await manuscriptsApi.unarchive(projectId, manuscript.id, version.current, trimmedReason);
        setAction(null);
      } else if (action === "RESTORE") {
        await manuscriptsApi.restoreDeleted(projectId, manuscript.id, version.current, trimmedReason);
        setAction(null);
      }
      onChanged?.();
    } catch (caught) {
      const status = (caught as { response?: { status?: number; data?: { error?: { message?: string }; message?: string } } })?.response?.status;
      const serverMessage =
        (caught as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data?.error?.message ??
        (caught as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (status === 409) {
        setStale(true);
        setError(serverMessage || t("This manuscript changed or is protected by collaborative rules. Refresh before trying again."));
        onRefresh();
      } else {
        setError(serverMessage || t("Could not complete this manuscript action. Your data was not modified; try again."));
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (mode === "trash") {
    if (!canRestore) return null;
    return (
      <>
        <Button type="button" variant="outline" size="sm" onClick={() => openAction("RESTORE")}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          {t("Restore")}
        </Button>
        <ManuscriptGovernanceDialog
          open={action !== null}
          action={action}
          manuscript={manuscript}
          reason={reason}
          busy={busy}
          stale={stale}
          error={error}
          onReasonChange={setReason}
          onClose={closeDialog}
          onConfirm={() => void confirmAction()}
        />
      </>
    );
  }

  if (!canDelete && !canArchive && !canUnarchive && !hasProtectionInfo) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="writing-actions-trigger"
            aria-label={t("Manuscript actions")}
            title={t("Manuscript actions")}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {canArchive ? (
            <DropdownMenuItem onSelect={() => openAction("ARCHIVE")}>
              <Archive aria-hidden="true" />
              <span>{t("Archive manuscript")}</span>
            </DropdownMenuItem>
          ) : null}
          {canUnarchive ? (
            <DropdownMenuItem onSelect={() => openAction("UNARCHIVE")}>
              <ArchiveRestore aria-hidden="true" />
              <span>{t("Reopen manuscript")}</span>
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              {(canArchive || canUnarchive) ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/40"
                onSelect={() => openAction("SOFT_DELETE")}
              >
                <Trash2 aria-hidden="true" />
                <span>{t("Move to trash")}</span>
              </DropdownMenuItem>
            </>
          ) : null}
          {hasProtectionInfo ? (
            <>
              {(canArchive || canUnarchive) ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onSelect={() => openAction("INFO")}>
                <Info aria-hidden="true" />
                <span>{t("Deletion protection details")}</span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ManuscriptGovernanceDialog
        open={action !== null}
        action={action}
        manuscript={manuscript}
        reason={reason}
        busy={busy}
        stale={stale}
        error={error}
        onReasonChange={setReason}
        onClose={closeDialog}
        onConfirm={() => void confirmAction()}
      />
    </>
  );
}

function ManuscriptGovernanceDialog({
  open,
  action,
  manuscript,
  reason,
  busy,
  stale,
  error,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  action: ManuscriptLifecycleAction | null;
  manuscript: ManuscriptSummary;
  reason: string;
  busy: boolean;
  stale: boolean;
  error: string;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  if (!open || !action) return null;

  const governance = manuscript.governance;
  const contributors = governance?.contributors?.length ? governance.contributors : manuscript.collaborators ?? [];
  const impactItems = actionImpactItems(action, governance, t);

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onClose(); }}>
      <DialogContent
        className="writing-governance-dialog max-w-lg"
        data-no-i18n
        closeLabel={t("Close")}
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={event => { if (busy) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{t(actionHeadingKey(action))}</DialogTitle>
          <DialogDescription>
            <strong>{manuscript.title}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="writing-governance-body">
          <div className="writing-governance-section">
            <h4>{t("Policy & reason")}</h4>
            <p>{t(actionReasonKey(action, governance))}</p>
          </div>

          <div className="writing-governance-section">
            <h4>{t("Impact & preserved records")}</h4>
            <ul className="writing-governance-list">
              {impactItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {contributors.length > 0 || governance?.createdBy ? (
            <div className="writing-governance-section">
              <h4>
                <Users size={14} aria-hidden="true" />
                {t("Involved stakeholders")}
              </h4>
              <div className="writing-governance-people">
                {governance?.createdBy ? (
                  <span className="writing-governance-chip">
                    {t("Created by")}: {governance.createdBy.name}
                  </span>
                ) : null}
                {contributors.map(person => (
                  <span key={person.id} className="writing-governance-chip">
                    {person.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="writing-governance-section">
            <h4>
              {governance?.hasReviewsOrSubmissions ? (
                <Lock size={14} aria-hidden="true" />
              ) : (
                <ShieldAlert size={14} aria-hidden="true" />
              )}
              {t("Approval & protection status")}
            </h4>
            <p className="writing-governance-status-text">{t(approvalBadgeText(governance))}</p>
          </div>

          <div className="writing-governance-remote-note">
            <GitBranch size={14} aria-hidden="true" />
            <span>
              {governance?.remoteBinding
                ? t("Linked GitHub repository ({{repo}} · {{branch}}) and any external Overleaf links will never be deleted automatically.", {
                    repo: governance.remoteBinding.repository,
                    branch: governance.remoteBinding.branch,
                  })
                : t("Linked GitHub repositories and Overleaf references are never modified or deleted automatically by LumiGap.")}
            </span>
          </div>

          {action !== "INFO" ? (
            <div className="writing-governance-reason-input">
              <label htmlFor={`manuscript-action-reason-${manuscript.id}`}>
                {t("Audit log note (optional)")}
              </label>
              <Input
                id={`manuscript-action-reason-${manuscript.id}`}
                maxLength={500}
                value={reason}
                disabled={busy || stale}
                placeholder={t("Summarize why this action is being taken…")}
                onChange={event => onReasonChange(event.target.value)}
              />
            </div>
          ) : null}

          {error ? <p role="alert" className="writing-error">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {action === "INFO" ? t("Close") : t("Cancel")}
          </Button>
          {action !== "INFO" ? (
            <Button
              type="button"
              variant={action === "SOFT_DELETE" ? "destructive" : "default"}
              disabled={busy || stale}
              onClick={onConfirm}
            >
              {t(submitLabelKey(action, busy))}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const DeleteManuscript = ManuscriptActionsMenu;
