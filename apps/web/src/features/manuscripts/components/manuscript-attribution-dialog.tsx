import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  AlertTriangle,
  Users,
  AlertCircle,
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
import type { ProposedManuscriptAcknowledgement, ManuscriptPublicationPolicy } from "@trend/shared-types";
import { AttributionAuthorFields } from "./attribution-author-fields";
import { CreditStatement } from "./credit-statement";
import { AttributionReviewDocument } from "./attribution-review-document";
import { attributionReadinessItems } from "./attribution-readiness";
import { Link } from "react-router-dom";
import type {
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
  defaultOpen?: boolean;
}

export function ManuscriptAttributionDialog({
  projectId,
  manuscriptId,
  snapshotId,
  snapshotLabel,
  sourceVersion,
  canWrite,
  onPublished,
  defaultOpen = false,
}: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);

  const queryKey = ["manuscript-attribution-check", projectId, manuscriptId, snapshotId];

  const query = useQuery({
    queryKey,
    queryFn: () => manuscriptsApi.attributionCheck(projectId, manuscriptId, snapshotId),
    enabled: open,
  });

  const check = query.data;

  // Local draft state for editing declaration
  const [proposedAuthors, setProposedAuthors] = useState<
    SaveManuscriptAttributionInput["proposedAuthors"]
  >([]);
  const [omittedContributors, setOmittedContributors] = useState<
    Array<{ userId: string; justification: string }>
  >([]);
  const actionLock = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [acks, setAcks] = useState<ProposedManuscriptAcknowledgement[]>([]);
  const [policy, setPolicy] = useState<ManuscriptPublicationPolicy>({ name: "Team publication policy", version: "1", requireAcknowledgementPermission: true });
  const [decisionNote, setDecisionNote] = useState("");
  useEffect(() => { setDirty(false); }, [snapshotId]);

  useEffect(() => {
    if (check && !dirty) {
      setAcks(check.acknowledgements);
      setPolicy(check.publicationPolicy ?? { name: "Team publication policy", version: "1", requireAcknowledgementPermission: true });
      setProposedAuthors(
        check.proposedAuthors.map((a, idx) => ({
          displayName: a.displayName,
          email: a.email,
          affiliation: a.affiliation,
          orcid: a.orcid,
          corresponding: a.corresponding,
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
  }, [check, dirty]);

  const saveMutation = useMutation({
    mutationFn: (input: SaveManuscriptAttributionInput) =>
      manuscriptsApi.saveAttributionCheck(projectId, manuscriptId, snapshotId, input),
    onSuccess: (updated) => {
      setDirty(false);
      queryClient.setQueryData(queryKey, updated);
      toast.success(t("Attribution declaration saved."));
    },
    onError: (err: Error) => {
      toast.error(err.message || t("Could not save attribution declaration."));
    },
  });

  const decideMutation = useMutation({
    mutationFn: (data: { decision: "CONFIRM" | "CLARIFY" | "DISPUTE"; note?: string }) =>
      manuscriptsApi.decideAttributionCheck(projectId, manuscriptId, check!.checkId!, { ...data, expectedVersion: check!.version, expectedDecisionId: check!.decisions.filter(d => d.userId === check!.viewerId).at(-1)?.id ?? null }),
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

  const setContributorAsAuthor = (userId: string) => {
    setDirty(true);
    setAcks(prev => prev.filter(a => a.userId !== userId));
    setOmittedContributors((prev) => prev.filter((o) => o.userId !== userId));
    setProposedAuthors((prev) => {
      if (prev.some((a) => a.userId === userId)) return prev;
      return [
        ...prev,
        {
          userId,
          order: prev.length + 1,
          creditRoles: [],
          displayName: check?.detectedContributors.find(c => c.userId === userId)?.name,
          rationale: "",
        },
      ];
    });
  };

  const setContributorAsOmitted = (userId: string) => {
    setDirty(true);
    setAcks(prev => prev.filter(a => a.userId !== userId));
    setProposedAuthors((prev) => prev.filter((a) => a.userId !== userId).map((a,i) => ({ ...a, order: i+1 })));
    setOmittedContributors((prev) => {
      if (prev.some((o) => o.userId === userId)) return prev;
      return [...prev, { userId, justification: "" }];
    });
  };

  const handleSaveDeclaration = () => {
    if (actionLock.current) return; actionLock.current = true;
    saveMutation.mutate({
      expectedVersion: check!.version,
      publicationPolicy: policy,
      proposedAuthors,
      omittedContributors,
      acknowledgements: acks,
      acknowledgementText: check?.acknowledgementText || "",
    }, { onSettled: () => { actionLock.current = false; } });
  };

  const handlePublish = () => {
    if (dirty || actionLock.current) return; actionLock.current = true;
    const authorIds = check!.proposedAuthors.map((a) => a.userId);
    publishMutation.mutate(authorIds, { onSettled: () => { actionLock.current = false; } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("Pre-Submission Attribution Check")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto space-y-6" closeLabel={t("Close")} data-no-i18n>
        <DialogHeader className="space-y-1 pr-10 text-left">
          <div className="flex min-w-0 items-start gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            <DialogTitle className="min-w-0 leading-snug">{t("Manuscript Attribution Check")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("Snapshot")}: <strong>{snapshotLabel || check?.snapshotLabel}</strong> · {t("Revision")} #{sourceVersion || check?.sourceVersion}
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
              <p>{t(check.externalSubmissionNotice)}</p>
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
                    {t({ UNINITIALIZED: "Attribution not declared", PENDING_CONFIRMATION: "Awaiting individual approvals", DISPUTED: "Attribution disputed", VERIFIED: "Individual approvals complete", SUPERSEDED: "Replaced by a newer declaration" }[check.status])}
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
                  {attributionReadinessItems(check, t).map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <Link className="text-sm text-primary underline" to={`/projects/${projectId}?tab=contributions&contributionTab=work`}>{t("Open research contributions")}</Link>
            {/* Section 1: Detected Scope Contributors */}
            <AttributionReviewDocument key={snapshotId} projectId={projectId} manuscriptId={manuscriptId} snapshotId={snapshotId} available={check.hasSucceededCompilation} />
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
                              {c.allocationPercentage} {t("matrix share")}
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
                            <Button type="button" size="sm" variant="outline" onClick={() => {
                              setDirty(true);
                              setProposedAuthors(values => values.filter(author => author.userId !== c.userId).map((author, index) => ({ ...author, order: index + 1 })));
                              setOmittedContributors(values => values.filter(person => person.userId !== c.userId));
                              setAcks(values => values.some(person => person.userId === c.userId) ? values : [...values, { userId: c.userId, name: c.name, contributionSummary: "", creditRoles: [] }]);
                            }}>{t("Acknowledge contributor")}</Button>
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
                        <span>{c.sources.map(source => t(source)).join(", ") || t("Recorded activity")}</span>
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
                            onChange={(e) => {
                              setDirty(true);
                              setOmittedContributors((prev) =>
                                prev.map((o) =>
                                  o.userId === c.userId ? { ...o, justification: e.target.value } : o,
                                ),
                              );
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <AttributionAuthorFields authors={proposedAuthors} onAuthors={values => {setProposedAuthors(values);setDirty(true);}} acknowledgements={acks} onAcknowledgements={values=>{setAcks(values);setDirty(true);}} policy={policy} onPolicy={value=>{setPolicy(value);setDirty(true);}} disabled={!canWrite || !check.viewerCanManage || saveMutation.isPending || decideMutation.isPending} />
            {canWrite && check.viewerCanManage && <Button disabled={!dirty || saveMutation.isPending} onClick={handleSaveDeclaration}>{t("Save Attribution Declaration")}</Button>}
            {dirty && <p role="status" className="text-sm text-muted-foreground">{t("Save changes before confirming or sealing. Material changes require new individual approvals.")}</p>}
            {(saveMutation.error || decideMutation.error || publishMutation.error) && <div role="alert" className="text-sm text-destructive">{(saveMutation.error || decideMutation.error || publishMutation.error)?.message}<Button variant="outline" onClick={()=>{setDirty(false);void query.refetch();}}>{t("Reload saved declaration")}</Button></div>}
            <CreditStatement key={check.checkId} projectId={projectId} manuscriptId={manuscriptId} snapshotId={snapshotId} enabled={!dirty && check.readyForInternalSubmission} />
            {/* Section 3: Author Decision & Dispute Action */}
            {check.viewerCanDecide && (
              <section className="space-y-3 border rounded-lg p-4 bg-muted/20">
                <h4 className="text-sm font-semibold">{t("Your Attribution Decision")}</h4>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Confirm your own authorship, order, roles and final snapshot under the selected publication policy. You do not approve for anyone else.",
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
                      disabled={dirty || decideMutation.isPending}
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
                      disabled={dirty || decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({ decision: "CLARIFY", note: decisionNote })
                      }
                    >
                      {t("Request Clarification")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={dirty || decideMutation.isPending}
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
                  disabled={dirty || check.sealed || !check.readyForInternalSubmission || publishMutation.isPending}
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
