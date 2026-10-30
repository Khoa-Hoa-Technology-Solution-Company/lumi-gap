import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Users,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Info,
  CheckCircle2,
  FileCheck2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "../manuscripts.api";
import { creditRoles, type CreditRole } from "@trend/shared-types";
import type {
  ManuscriptAttributionCheckView,
  SaveManuscriptAttributionInput,
} from "@trend/shared-types";

interface Props {
  projectId: string;
  manuscriptId: string;
  snapshotId: string;
  snapshotLabel: string;
  sourceVersion: number;
  canWrite: boolean;
  onPublished?: (sealed: { submissionId: string; revisionId: string }) => void;
}

export function ManuscriptAttributionDialog({
  projectId,
  manuscriptId,
  snapshotId,
  snapshotLabel,
  sourceVersion,
  canWrite,
  onPublished,
}: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const queryKey = ["manuscript-attribution-check", projectId, manuscriptId, snapshotId];

  const query = useQuery({
    queryKey,
    queryFn: () => manuscriptsApi.attributionCheck(projectId, manuscriptId, snapshotId),
    enabled: open,
  });

  const check = query.data;

  // Local draft state for editing declaration
  const [proposedAuthors, setProposedAuthors] = useState<
    Array<{ userId: string; order: number; creditRoles: CreditRole[]; rationale?: string }>
  >([]);
  const [omittedContributors, setOmittedContributors] = useState<
    Array<{ userId: string; justification: string }>
  >([]);
  const [decisionNote, setDecisionNote] = useState("");

  useEffect(() => {
    if (check) {
      setProposedAuthors(
        check.proposedAuthors.map((a, idx) => ({
          userId: a.userId,
          order: a.order || idx + 1,
          creditRoles: [...a.creditRoles],
          rationale: a.rationale || "",
        })),
      );
      setOmittedContributors(
        check.omittedContributors.map((o) => ({
          userId: o.userId,
          justification: o.justification || "",
        })),
      );
    }
  }, [check]);

  const saveMutation = useMutation({
    mutationFn: (input: SaveManuscriptAttributionInput) =>
      manuscriptsApi.saveAttributionCheck(projectId, manuscriptId, snapshotId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      toast.success(t("Attribution declaration saved."));
    },
    onError: (err: Error) => {
      toast.error(err.message || t("Could not save attribution declaration."));
    },
  });

  const decideMutation = useMutation({
    mutationFn: (data: { decision: "CONFIRM" | "CLARIFY" | "DISPUTE"; note?: string }) =>
      manuscriptsApi.decideAttributionCheck(projectId, manuscriptId, check!.checkId!, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      toast.success(t("Decision recorded."));
      setDecisionNote("");
    },
    onError: (err: Error) => {
      toast.error(err.message || t("Could not record decision."));
    },
  });

  const publishMutation = useMutation({
    mutationFn: (authorIds: string[]) =>
      manuscriptsApi.publish(projectId, manuscriptId, snapshotId, authorIds),
    onSuccess: (sealed) => {
      toast.success(t("Version sealed and submitted for review."));
      setOpen(false);
      onPublished?.(sealed);
    },
    onError: (err: Error) => {
      toast.error(err.message || t("Could not seal version for review."));
    },
  });

  const toggleAuthorRole = (userId: string, role: CreditRole) => {
    setProposedAuthors((prev) =>
      prev.map((a) => {
        if (a.userId !== userId) return a;
        const exists = a.creditRoles.includes(role);
        return {
          ...a,
          creditRoles: exists ? a.creditRoles.filter((r) => r !== role) : [...a.creditRoles, role],
        };
      }),
    );
  };

  const moveAuthor = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= proposedAuthors.length) return;
    setProposedAuthors((prev) => {
      const copy = [...prev];
      const temp = copy[index]!;
      copy[index] = copy[target]!;
      copy[target] = temp;
      return copy.map((a, i) => ({ ...a, order: i + 1 }));
    });
  };

  const setContributorAsAuthor = (userId: string) => {
    setOmittedContributors((prev) => prev.filter((o) => o.userId !== userId));
    setProposedAuthors((prev) => {
      if (prev.some((a) => a.userId === userId)) return prev;
      return [
        ...prev,
        {
          userId,
          order: prev.length + 1,
          creditRoles: ["WRITING_ORIGINAL_DRAFT"],
          rationale: "",
        },
      ];
    });
  };

  const setContributorAsOmitted = (userId: string) => {
    setProposedAuthors((prev) => prev.filter((a) => a.userId !== userId));
    setOmittedContributors((prev) => {
      if (prev.some((o) => o.userId === userId)) return prev;
      return [...prev, { userId, justification: "" }];
    });
  };

  const handleSaveDeclaration = () => {
    saveMutation.mutate({
      proposedAuthors,
      omittedContributors,
      acknowledgements: check?.acknowledgements || [],
    });
  };

  const handlePublish = () => {
    const authorIds = proposedAuthors.map((a) => a.userId);
    publishMutation.mutate(authorIds);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("Pre-Submission Attribution Check")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto space-y-6" data-no-i18n>
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>{t("Manuscript Attribution Check")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("Snapshot")}: <strong>{snapshotLabel}</strong> · {t("Revision")} #{sourceVersion}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !check ? (
          <div className="p-4 text-center text-muted-foreground">
            {t("Could not load attribution check details.")}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Legal Notice */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <p>{check.externalSubmissionNotice}</p>
            </div>

            {/* Check Status Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3.5 bg-muted/30">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider block font-medium">
                  {t("Attribution Verification Status")}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant={
                      check.status === "VERIFIED"
                        ? "default"
                        : check.status === "DISPUTED"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {t(check.status)}
                  </Badge>
                  {check.readyForInternalSubmission ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t("Ready for internal submission")}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 flex items-center gap-1 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("Submission blocked until resolved")}
                    </span>
                  )}
                </div>
              </div>

              {check.snapshotChecksum && (
                <div className="text-right text-xs text-muted-foreground font-mono">
                  <span>SHA-256: {check.snapshotChecksum.slice(0, 16)}…</span>
                </div>
              )}
            </div>

            {/* Blocking reasons alert */}
            {check.blockingReasons.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{t("Requirements before internal submission:")}</span>
                </div>
                <ul className="list-disc list-inside text-xs text-destructive/90 space-y-1">
                  {check.blockingReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Section 1: Detected Scope Contributors */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  {t("Detected Scope Contributors")} ({check.detectedContributors.length})
                </h4>
                <span className="text-xs text-muted-foreground">
                  {t("All detected contributors must be reviewed")}
                </span>
              </div>

              <div className="border rounded-lg divide-y">
                {check.detectedContributors.map((c) => {
                  const isAuthor = proposedAuthors.some((a) => a.userId === c.userId);
                  const isOmitted = omittedContributors.some((o) => o.userId === c.userId);

                  return (
                    <div key={c.userId} className="p-3 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{c.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {t(c.membershipStatus)}
                          </Badge>
                          {c.allocationPercentage && (
                            <Badge variant="outline" className="text-[10px]">
                              {c.allocationPercentage}% {t("matrix share")}
                            </Badge>
                          )}
                          {c.retainedWords > 0 && (
                            <span className="text-muted-foreground text-[11px]">
                              ~{c.retainedWords} {t("words in source")}
                            </span>
                          )}
                        </div>

                        {canWrite && check.viewerCanManage && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              variant={isAuthor ? "default" : "outline"}
                              onClick={() => setContributorAsAuthor(c.userId)}
                            >
                              {t("Declare Author")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              variant={isOmitted ? "secondary" : "ghost"}
                              onClick={() => setContributorAsOmitted(c.userId)}
                            >
                              {t("Omit with Justification")}
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{t("Evidence sources")}:</span>
                        <span>{c.sources.join(", ") || t("Recorded activity")}</span>
                      </div>

                      {/* If omitted, show justification input */}
                      {isOmitted && canWrite && (
                        <div className="mt-2 pt-2 border-t space-y-1">
                          <label className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            {t("Non-author justification (required for departed/qualifying contributors):")}
                          </label>
                          <input
                            type="text"
                            className="w-full text-xs px-2.5 py-1.5 rounded border bg-background"
                            placeholder={t("e.g. Contributed exploratory literature only; did not participate in manuscript drafting.")}
                            value={
                              omittedContributors.find((o) => o.userId === c.userId)?.justification || ""
                            }
                            onChange={(e) =>
                              setOmittedContributors((prev) =>
                                prev.map((o) =>
                                  o.userId === c.userId ? { ...o, justification: e.target.value } : o,
                                ),
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 2: Ordered Proposed Authors */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-primary" />
                {t("Ordered Authors & CRediT Roles")}
              </h4>

              {proposedAuthors.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-lg p-4 text-center">
                  {t("No authors declared yet. Use 'Declare Author' above.")}
                </div>
              ) : (
                <div className="border rounded-lg divide-y">
                  {proposedAuthors.map((author, index) => {
                    const contributor = check.detectedContributors.find(
                      (c) => c.userId === author.userId,
                    );
                    const decision = check.decisions.find((d) => d.userId === author.userId);

                    return (
                      <div key={author.userId} className="p-3.5 space-y-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">
                              #{index + 1}. {contributor?.name || author.userId}
                            </span>
                            {decision ? (
                              <Badge
                                variant={
                                  decision.decision === "CONFIRM"
                                    ? "default"
                                    : decision.decision === "DISPUTE"
                                      ? "destructive"
                                      : "outline"
                                }
                              >
                                {t(decision.decision)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                {t("Awaiting Confirmation")}
                              </Badge>
                            )}
                          </div>

                          {canWrite && check.viewerCanManage && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                className="h-6 w-6 p-0"
                                variant="outline"
                                disabled={index === 0}
                                onClick={() => moveAuthor(index, "up")}
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                className="h-6 w-6 p-0"
                                variant="outline"
                                disabled={index === proposedAuthors.length - 1}
                                onClick={() => moveAuthor(index, "down")}
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* CRediT roles tags */}
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground font-medium">
                            {t("CRediT Roles:")}
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {creditRoles.map((role) => {
                              const active = author.creditRoles.includes(role);
                              return (
                                <button
                                  type="button"
                                  key={role}
                                  disabled={!canWrite || !check.viewerCanManage}
                                  onClick={() => toggleAuthorRole(author.userId, role)}
                                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                    active
                                      ? "bg-primary text-primary-foreground border-primary font-medium"
                                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                                  }`}
                                >
                                  {role}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canWrite && check.viewerCanManage && (
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saveMutation.isPending}
                    onClick={handleSaveDeclaration}
                  >
                    {saveMutation.isPending
                      ? t("Saving declaration…")
                      : t("Save Attribution Declaration")}
                  </Button>
                </div>
              )}
            </section>

            {/* Section 3: Author Decision & Dispute Action */}
            {check.viewerCanDecide && (
              <section className="space-y-3 border rounded-lg p-4 bg-muted/20">
                <h4 className="text-sm font-semibold">{t("Your Attribution Decision")}</h4>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "As a participant in this research revision, confirm whether your declared authorship and role are accurate, or record a dispute.",
                  )}
                </p>

                <div className="space-y-2">
                  <textarea
                    className="w-full text-xs p-2 rounded border bg-background"
                    rows={2}
                    placeholder={t("Optional clarification or dispute explanation note…")}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({ decision: "CONFIRM", note: decisionNote })
                      }
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      {t("Confirm My Attribution")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({ decision: "CLARIFY", note: decisionNote })
                      }
                    >
                      {t("Request Clarification")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({ decision: "DISPUTE", note: decisionNote })
                      }
                    >
                      <AlertCircle className="h-4 w-4 mr-1.5" />
                      {t("Raise Attribution Dispute")}
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {/* Section 4: Final Seal Button */}
            {canWrite && (
              <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {check.readyForInternalSubmission ? (
                    <span className="text-emerald-600 font-medium">
                      ✓ {t("All contributors reviewed and verified. Revision ready for seal.")}
                    </span>
                  ) : (
                    <span>
                      {t(
                        "Resolve unreviewed contributors, author confirmations, and disputes to enable seal.",
                      )}
                    </span>
                  )}
                </div>

                <Button
                  size="sm"
                  disabled={!check.readyForInternalSubmission || publishMutation.isPending}
                  onClick={handlePublish}
                >
                  <FileCheck2 className="h-4 w-4 mr-1.5" />
                  {publishMutation.isPending
                    ? t("Sealing revision…")
                    : t("Seal Version for Academic Review")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
