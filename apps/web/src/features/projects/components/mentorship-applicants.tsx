import { useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LecturerMatchEvidence, MentorshipApplicationStatus, MentorshipApplicationView, MentorProjectPreview } from "@trend/shared-types";
import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  HandHeart,
  Info,
  Loader2,
  Send,
  ShieldAlert,
  ShieldCheck,
  Target,
  Undo2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useAcademicProfile } from "@/features/academic-profile/hooks/use-academic-profile";
import { mentorshipApplicationsApi as api } from "../api/mentorship-applications.api";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import "../mentor-discovery.css";

export const applicationLabels = {
  APPLIED: "Awaiting response",
  SHORTLISTED: "Shortlisted",
  INVITED: "Official invitation sent",
  ACCEPTED: "Mentorship accepted",
  DECLINED: "Application declined",
  WITHDRAWN: "Application withdrawn",
  CLOSED: "Application closed",
} as const;

function statusBadgeStyle(status: MentorshipApplicationStatus): string {
  switch (status) {
    case "APPLIED":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "SHORTLISTED":
    case "INVITED":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "ACCEPTED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    default:
      return "border-border bg-muted/60 text-muted-foreground";
  }
}

function ErrorMessage({ error }: { error: unknown }) {
  const { t } = useI18n();
  const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs sm:text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="leading-5">{t(message ?? "Could not update the application. Your input is kept.")}</p>
    </div>
  );
}

function useRefreshApplications() {
  const cache = useQueryClient();
  return () => {
    for (const key of ["mentor-workspace", "academic-support", "notifications"]) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function MentorshipApplicationDialog({ project, onClose }: { project: MentorProjectPreview; onClose: () => void }) {
  const { t } = useI18n();
  const user = useAuthStore(s => s.user);
  const userId = user?.id;
  const refresh = useRefreshApplications();
  const profileQuery = useAcademicProfile(Boolean(userId));
  const profile = profileQuery.data;

  const [message, setMessage] = useState("");
  const [availability, setAvailability] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const lock = useRef(false);

  const trimmedMessage = message.trim();
  const trimmedAvailability = availability.trim();
  const remainingChars = Math.max(0, 20 - trimmedMessage.length);

  useUnsavedWorkspace(Boolean(trimmedMessage || trimmedAvailability));

  const profileTerms = useMemo(() => {
    const raw = [
      ...(profile?.expertiseAreas ?? []),
      ...(profile?.researchSpecializations ?? []),
      ...(profile?.skills ?? []),
      ...(profile?.researchInterests ?? []),
    ];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const item of raw) {
      const clean = item?.trim();
      if (clean && !seen.has(clean.toLocaleLowerCase())) {
        seen.add(clean.toLocaleLowerCase());
        unique.push(clean);
      }
    }
    return unique;
  }, [profile?.expertiseAreas, profile?.researchSpecializations, profile?.skills, profile?.researchInterests]);

  const lecturerName = profile?.displayName || user?.fullName || "";
  const lecturerMeta = [profile?.positionTitle || profile?.academicTitle, profile?.affiliation?.institutionName || profile?.institution]
    .filter(Boolean)
    .join(" · ");
  const isVerified = profile?.verificationStatus === "VERIFIED" || profile?.academicRoleVerificationStatus === "VERIFIED";

  const send = useMutation({
    mutationFn: () => {
      if (useAuthStore.getState().user?.id !== userId) throw new Error("Account changed");
      return api.apply(project.id, {
        message: trimmedMessage,
        ...(trimmedAvailability ? { availability: trimmedAvailability } : {}),
        idempotencyKey: key,
      });
    },
    onSuccess: () => {
      refresh();
      toast.success(t("Offer sent toast"));
      onClose();
    },
  });

  const handleFieldChange = (setter: (value: string) => void, value: string) => {
    setter(value);
    if (send.isError) {
      setKey(crypto.randomUUID());
      send.reset();
    }
  };

  const close = async () => {
    if (!send.isPending && await canLeaveWorkspace()) onClose();
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) void close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-xl" data-no-i18n>
        <div className="border-b border-border/75 px-5 pt-5 pb-4 sm:px-6">
          <DialogHeader className="text-left space-y-1.5 pr-6">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                <HandHeart className="h-4 w-4" />
              </span>
              <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight">
                {t("Offer to support team")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs sm:text-[13px] leading-5">
              {t("Offer support subtitle")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form
          className="flex flex-col"
          onSubmit={async event => {
            event.preventDefault();
            if (lock.current || trimmedMessage.length < 20) return;
            lock.current = true;
            try {
              await send.mutateAsync();
            } catch {
              /* Retain user input for retry. */
            } finally {
              lock.current = false;
            }
          }}
        >
          <div className="space-y-4 px-5 py-4 sm:px-6">
            {/* Project context card */}
            <section className="rounded-xl border border-border/80 bg-muted/25 p-3.5 space-y-2.5">
              {project.researchAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {project.researchAreas.slice(0, 4).map(area => (
                    <span
                      key={area}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      {t(area)}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground leading-snug [overflow-wrap:anywhere]">
                  {project.title}
                </h3>
                {project.summary ? (
                  <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap line-clamp-3 [overflow-wrap:anywhere]">
                    {project.summary}
                  </p>
                ) : null}
              </div>

              {(project.mentoringNeeds || Boolean(project.methodologies?.length)) && (
                <div className="rounded-lg border border-border/65 bg-background/85 px-3 py-2 space-y-1.5">
                  {project.mentoringNeeds && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("Team mentoring needs")}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {project.mentoringNeeds}
                      </p>
                    </div>
                  )}
                  {Boolean(project.methodologies?.length) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">{t("Methods requested")}:</span>
                      {project.methodologies!.map(method => (
                        <span
                          key={method}
                          className="rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[11px] text-foreground/85"
                        >
                          {method}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Auto-pulled Academic Profile summary */}
            <section className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3.5 py-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                  <span>{t("Auto-attached academic profile")}</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">
                  <BadgeCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{t("Auto-synced")}</span>
                </span>
              </div>

              {profileQuery.isLoading ? (
                <Skeleton className="h-8 w-full rounded-md" />
              ) : (
                <div className="space-y-1.5">
                  {(lecturerName || lecturerMeta) && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                      {lecturerName && (
                        <span className="font-medium text-foreground inline-flex items-center gap-1">
                          <span>{lecturerName}</span>
                          {isVerified && (
                            <BadgeCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                          )}
                        </span>
                      )}
                      {lecturerMeta && (
                        <span className="text-muted-foreground">
                          {lecturerName ? "· " : ""}{lecturerMeta}
                        </span>
                      )}
                    </div>
                  )}

                  {profileTerms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {profileTerms.slice(0, 5).map(term => (
                        <span
                          key={term}
                          className="rounded-md border border-border/70 bg-background/90 px-2 py-0.5 text-[11px] text-foreground/85"
                        >
                          {term}
                        </span>
                      ))}
                      {profileTerms.length > 5 && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          +{profileTerms.length - 5}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-[11.5px] leading-4 text-muted-foreground">
                    {t("Academic profile auto-share note")}
                  </p>
                </div>
              )}
            </section>

            {/* Minimal Form Fields */}
            <fieldset disabled={send.isPending} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="application-message" className="text-sm font-medium text-foreground">
                  {t("How can you support this team?")} <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <textarea
                  id="application-message"
                  rows={4}
                  required
                  minLength={20}
                  maxLength={2000}
                  placeholder={t("Support offer message placeholder")}
                  className="min-h-[104px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground placeholder:text-muted-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={message}
                  onChange={e => handleFieldChange(setMessage, e.target.value)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                  <span className={remainingChars > 0 ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1"}>
                    {remainingChars > 0 ? (
                      t("Offer message min length hint")
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{t("Offer ready to send")}</span>
                      </>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{message.length}/2000</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="application-availability" className="text-sm font-medium text-foreground">
                    {t("Availability optional label")}
                  </Label>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {t("Optional")}
                  </span>
                </div>
                <textarea
                  id="application-availability"
                  rows={2}
                  maxLength={1000}
                  placeholder={t("Availability optional placeholder")}
                  className="min-h-[62px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground placeholder:text-muted-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={availability}
                  onChange={e => handleFieldChange(setAvailability, e.target.value)}
                />
              </div>
            </fieldset>

            {/* Non-binding consent explanation */}
            <div className="flex items-start gap-2 rounded-lg border border-border/75 bg-muted/30 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/80" aria-hidden="true" />
              <p>{t("Applying does not reserve a mentor position or grant project access.")}</p>
            </div>

            {send.isError && <ErrorMessage error={send.error} />}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-border/75 bg-muted/15 px-5 py-3.5 sm:px-6">
            <Button type="button" variant="ghost" disabled={send.isPending} onClick={() => void close()}>
              {t("Cancel")}
            </Button>
            <Button type="submit" className="gap-1.5" disabled={send.isPending || trimmedMessage.length < 20}>
              {send.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>{t("Sending…")}</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("Send support offer")}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApplicantEvidence({ evidence }: { evidence: LecturerMatchEvidence }) {
  const { t } = useI18n();
  return (
    <div className="mentor-evidence-stack">
      <section className={`mentor-evidence-card${evidence.verifiedLecturer ? " is-identity" : ""}`}>
        <div className="mentor-evidence-card-head">
          <h4 className="mentor-evidence-card-title">
            {evidence.verifiedLecturer ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span>{t("Identity verification")}</span>
          </h4>
          <span className={`mentor-evidence-status-pill ${evidence.verifiedLecturer ? "is-verified" : "is-unverified"}`}>
            {evidence.verifiedLecturer && <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>{t(evidence.verifiedLecturer ? "Verified Lecturer" : "Lecturer verification unavailable")}</span>
          </span>
        </div>

        {evidence.identities.length > 0 && (
          <div className="mentor-evidence-identities">
            {evidence.identities.map((identity, index) => (
              <a
                key={index}
                href={identity.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mentor-evidence-identity-chip"
              >
                <span className="font-medium text-primary">{identity.provider}</span>
                <span className="mentor-evidence-dot" aria-hidden="true">·</span>
                <span className="text-muted-foreground">
                  {t(identity.verified ? "Verified identity link" : "Self-declared identity link")}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}

        <p className="mentor-evidence-note">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
          <span>{t("Identity verification does not certify research fit or mentoring quality.")}</span>
        </p>
      </section>

      <div className="mentor-evidence-grid">
        <section className="mentor-evidence-card">
          <div className="mentor-evidence-card-head">
            <h4 className="mentor-evidence-card-title">
              <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{t("Research topic evidence")}</span>
            </h4>
          </div>
          {evidence.topics.length > 0 ? (
            <ul className="mentor-evidence-topic-list">
              {evidence.topics.map((topic, index) => {
                const isPub = topic.source === "PUBLICATION_TITLE";
                return (
                  <li key={index} className="mentor-evidence-topic-item">
                    <span className="mentor-evidence-topic-term">{topic.term}</span>
                    <span className={`mentor-evidence-source-tag ${isPub ? "is-publication" : "is-declared"}`}>
                      {t(
                        topic.source === "PUBLICATION_TITLE"
                          ? "Publication title"
                          : topic.source === "PROFILE_DECLARATION"
                            ? "Profile declaration"
                            : "Application declaration",
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mentor-evidence-empty">{t("No matching evidence available.")}</p>
          )}
        </section>

        <section className="mentor-evidence-card">
          <div className="mentor-evidence-card-head">
            <h4 className="mentor-evidence-card-title">
              <Compass className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{t("Methodology relevance")}</span>
            </h4>
          </div>
          {evidence.methodologies.length > 0 ? (
            <div className="mentor-evidence-chip-wrap">
              {evidence.methodologies.map((method, index) => (
                <span key={index} className="mentor-evidence-term-chip">{method}</span>
              ))}
            </div>
          ) : (
            <p className="mentor-evidence-empty">{t("No matching evidence available.")}</p>
          )}
          <p className="mentor-evidence-footnote">
            {t("Methods are explicitly declared by the applicant, not independently verified.")}
          </p>
        </section>
      </div>

      <section className="mentor-evidence-card">
        <div className="mentor-evidence-card-head">
          <h4 className="mentor-evidence-card-title">
            <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{t("Mentoring needs compatibility")}</span>
          </h4>
        </div>
        {evidence.mentoringNeeds.length > 0 ? (
          <div className="mentor-evidence-chip-wrap">
            {evidence.mentoringNeeds.map((need, index) => (
              <span key={index} className="mentor-evidence-term-chip is-accent">{need}</span>
            ))}
          </div>
        ) : (
          <p className="mentor-evidence-empty">{t("Review the declared support and clarify expectations.")}</p>
        )}
      </section>

      <section className="mentor-evidence-card">
        <div className="mentor-evidence-card-head">
          <h4 className="mentor-evidence-card-title">
            <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{t("Relevant public publications")}</span>
          </h4>
          {evidence.publications.length > 0 && (
            <span className="mentor-evidence-count-badge">{evidence.publications.length}</span>
          )}
        </div>
        {evidence.publications.length > 0 ? (
          <ul className="mentor-evidence-pub-list">
            {evidence.publications.map((publication, index) => (
              <li key={index} className="mentor-evidence-pub-item">
                {publication.href ? (
                  <a
                    href={publication.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mentor-evidence-pub-link"
                  >
                    <span>{publication.title}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="mentor-evidence-pub-title">{publication.title}</p>
                )}
                <p className="mentor-evidence-pub-meta">
                  {[
                    publication.year,
                    publication.source,
                    t(
                      publication.attribution === "LINKED_IDENTITY"
                        ? "Linked through verified identity"
                        : "Authorship self-declared",
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {publication.matchedTerms.length > 0 && (
                  <div className="mentor-evidence-pub-terms">
                    <span className="text-muted-foreground">{t("Matched topics")}:</span>
                    {publication.matchedTerms.map((term, termIdx) => (
                      <span key={termIdx} className="mentor-evidence-mini-chip">{term}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mentor-evidence-empty">{t("No matching evidence available.")}</p>
        )}
      </section>

      {evidence.missing.length > 0 && (
        <section className="mentor-evidence-limitations">
          <div className="mentor-evidence-card-head">
            <h4 className="mentor-evidence-card-title text-amber-900 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>{t("Unknowns and limitations")}</span>
            </h4>
          </div>
          <ul className="mentor-evidence-limitation-list">
            {evidence.missing.map((message, index) => (
              <li key={index}>
                {message.startsWith("Methodology not established: ")
                  ? `${t("Methodology not established")}: ${message.slice(29)}`
                  : t(message)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ApplicationDetailDialog({ item, onClose, onInvite }: { item: MentorshipApplicationView; onClose: () => void; onInvite?: (item: MentorshipApplicationView) => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id), refresh = useRefreshApplications();
  const [body, setBody] = useState(""), [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  useUnsavedWorkspace(Boolean(body));
  const key = ["academic-support", userId, "application-detail", item.projectId, item.id];
  const query = useQuery({ queryKey: key, queryFn: () => api.detail(item.projectId, item.id), retry: false, refetchInterval: 15000 });
  const action = useMutation({
    mutationFn: (kind: "SHORTLIST" | "DECLINE" | "WITHDRAW") => {
      if (useAuthStore.getState().user?.id !== userId || !query.data) throw new Error("Account or application changed");
      return api.action(item.projectId, query.data, kind);
    },
    onSuccess: (_data, kind) => {
      refresh();
      if (kind === "WITHDRAW") toast.success(t("Offer withdrawn toast"));
    },
    onError: refresh,
  });
  const note = useMutation({
    mutationFn: () => {
      if (useAuthStore.getState().user?.id !== userId) throw new Error("Account changed");
      return api.note(item.projectId, item.id, body.trim(), clientKey);
    },
    onSuccess: () => {
      setBody("");
      setClientKey(crypto.randomUUID());
      refresh();
    },
  });
  const data = query.data, busy = action.isPending || note.isPending;
  const close = async () => { if (!busy && await canLeaveWorkspace()) onClose(); };

  return (
    <Dialog open onOpenChange={open => { if (!open) void close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" data-no-i18n>
        <DialogHeader>
          <DialogTitle>{t("Mentoring application")} · {item.lecturer.name}</DialogTitle>
          <DialogDescription>{item.project.title}</DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-48" />
        ) : query.isError ? (
          <div className="space-y-3">
            <ErrorMessage error={query.error} />
            <Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button>
          </div>
        ) : data && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/25 p-3.5">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeStyle(data.status)}`}>
                    {t(applicationLabels[data.status])}
                  </span>
                  {data.invitation && (
                    <span className="text-xs text-muted-foreground">· {t(data.invitation.status)}</span>
                  )}
                </div>
                {(data.lecturer.positionTitle || data.lecturer.institutionName) && (
                  <p className="text-xs text-muted-foreground">
                    {[data.lecturer.positionTitle, data.lecturer.institutionName].filter(Boolean).join(" · ")}
                  </p>
                )}
                {Boolean(data.lecturer.expertiseAreas?.length) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {data.lecturer.expertiseAreas!.slice(0, 5).map(area => (
                      <span key={area} className="rounded-md border border-border/70 bg-background px-2 py-0.5 text-[11px] text-foreground/85">
                        {area}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <a
                href={`/academics/${encodeURIComponent(data.lecturer.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
              >
                <span>{t("View academic profile")}</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{t("Applicant statement")}</h3>
              <p className="whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-3.5 text-sm leading-6">
                {data.message}
              </p>
              {data.availability.trim().length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("Availability and feedback commitment")}
                  </h4>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{data.availability}</p>
                </div>
              )}
              {data.capabilities.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/85">{t("Mentoring support offered")}:</span>{" "}
                  {data.capabilities.join(", ")}
                </p>
              )}
            </section>

            {data.evidence && <ApplicantEvidence evidence={data.evidence} />}

            <section className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">{t("Clarify expectations")}</h3>
              <p className="text-xs text-muted-foreground">{t("Only the owner and this applicant can read these questions. No private research resources are shared.")}</p>
              <ol className="space-y-3">
                {data.notes.map(entry => (
                  <li key={entry.id} className="space-y-1 border-b pb-3 text-sm">
                    <p className="font-medium">
                      {entry.authorName}{" "}
                      <time className="text-xs font-normal text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</time>
                    </p>
                    <p className="whitespace-pre-wrap break-words leading-6">{entry.body}</p>
                  </li>
                ))}
              </ol>
              {data.canClarify && (
                <form onSubmit={e => { e.preventDefault(); if (!busy) note.mutate(); }} className="space-y-2">
                  <Label htmlFor="application-question">{t("Question or clarification")}</Label>
                  <textarea
                    id="application-question"
                    className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                    disabled={busy}
                    required
                    minLength={5}
                    maxLength={2000}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder={t("Ask about methods, feedback frequency or limitations.")}
                  />
                  <Button type="submit" size="sm" disabled={busy || body.trim().length < 5}>{t("Send clarification")}</Button>
                </form>
              )}
            </section>

            {(action.error || note.error) && <ErrorMessage error={action.error || note.error} />}

            <div className="flex flex-wrap gap-2 border-t pt-4">
              {data.canManage && ["APPLIED", "SHORTLISTED"].includes(data.status) && (
                <>
                  <Button variant="outline" disabled={busy || data.status === "SHORTLISTED"} onClick={() => action.mutate("SHORTLIST")}>
                    {t("Shortlist applicant")}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => action.mutate("DECLINE")}>
                    {t("Decline application")}
                  </Button>
                </>
              )}
              {data.canInvite && onInvite && (
                <Button disabled={busy || Boolean(body)} onClick={() => { onClose(); onInvite(data); }}>
                  {t("Prepare official invitation")}
                </Button>
              )}
              {data.canWithdraw && (
                <Button variant="outline" disabled={busy} className="gap-1.5" onClick={() => action.mutate("WITHDRAW")}>
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("Withdraw application")}</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MentorshipApplicantPool({ projectId, onInvite }: { projectId: string; onInvite: (item: MentorshipApplicationView) => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id);
  const [page, setPage] = useState(1), [detail, setDetail] = useState<MentorshipApplicationView>(), [selected, setSelected] = useState<MentorshipApplicationView[]>([]), [comparing, setComparing] = useState(false);
  const query = useQuery({ queryKey: ["academic-support", userId, "applicants", projectId, page], queryFn: () => api.list(projectId, page), retry: false });
  const comparisons = useQueries({ queries: selected.map(item => ({ queryKey: ["academic-support", userId, "application-detail", projectId, item.id], queryFn: () => api.detail(projectId, item.id), enabled: comparing, retry: false })) });
  const isEmpty = !query.isLoading && !query.isError && !query.data?.items.length;

  if (isEmpty) {
    return (
      <section aria-label={t("Mentor applicants")} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-border/80 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground shrink-0">
          <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {t("Mentor applicants")} ({query.data?.meta.total ?? 0})
        </span>
        <span className="hidden sm:inline text-border" aria-hidden="true">·</span>
        <span className="leading-5">{t("No applications yet. Enable lecturer discovery to collect interest without reserving positions.")}</span>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-b border-border/70 pb-4" aria-label={t("Mentor applicants")}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{t("Mentor applicants")}{query.data && ` (${query.data.meta.total})`}</h3>
          <p className="text-xs leading-5 text-muted-foreground">{t("Applications do not reserve mentor positions. Review applicant evidence before sending an official invitation.")}</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" disabled={selected.length < 2} onClick={() => setComparing(true)}>
          {t("Compare applicants")} ({selected.length}/3)
        </Button>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-12 w-full rounded-lg" />
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <ErrorMessage error={query.error} />
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t("Try again")}</Button>
        </div>
      ) : (
        <ul className="divide-y">
          {query.data?.items.map(item => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
              <input
                type="checkbox"
                aria-label={`${t("Select for comparison")}: ${item.lecturer.name}`}
                checked={selected.some(s => s.id === item.id)}
                disabled={selected.length === 3 && !selected.some(s => s.id === item.id)}
                onChange={e => setSelected(e.target.checked ? [...selected, item] : selected.filter(s => s.id !== item.id))}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words text-sm font-medium text-foreground">{item.lecturer.name}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeStyle(item.status)}`}>
                    {t(applicationLabels[item.status])}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    item.lecturer.positionTitle,
                    item.lecturer.institutionName,
                    t(item.lecturer.verifiedLecturer ? "Verified Lecturer" : "Lecturer verification unavailable"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="line-clamp-2 text-xs text-foreground/85">{item.message}</p>
                {Boolean(item.lecturer.expertiseAreas?.length) && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {item.lecturer.expertiseAreas!.slice(0, 4).map(area => (
                      <span key={area} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {area}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => setDetail(item)}>
                {t("Review applicant evidence")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {query.data && query.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button>
          <span>{page}/{query.data.meta.totalPages}</span>
          <Button variant="ghost" disabled={page >= query.data.meta.totalPages} onClick={() => setPage(page + 1)}>{t("Next")}</Button>
        </div>
      )}
      {detail && <ApplicationDetailDialog item={detail} onClose={() => setDetail(undefined)} onInvite={onInvite} />}
      {comparing && (
        <Dialog open onOpenChange={setComparing}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl" data-no-i18n>
            <DialogHeader>
              <DialogTitle>{t("Compare applicants")}</DialogTitle>
              <DialogDescription>{t("Compare evidence and declared commitments. The project owner makes the decision.")}</DialogDescription>
            </DialogHeader>
            <div className={`grid gap-6 ${selected.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
              {comparisons.map((result, index) => (
                <article key={selected[index]!.id} className="min-w-0 space-y-4">
                  <h3 className="text-lg font-semibold">{selected[index]!.lecturer.name}</h3>
                  {result.isLoading ? (
                    <Skeleton className="h-64" />
                  ) : result.isError ? (
                    <div className="space-y-2">
                      <ErrorMessage error={result.error} />
                      <Button variant="outline" onClick={() => void result.refetch()}>{t("Try again")}</Button>
                    </div>
                  ) : result.data && (
                    <>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeStyle(result.data.status)}`}>
                        {t(applicationLabels[result.data.status])}
                      </span>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{result.data.message}</p>
                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("Availability and feedback commitment")}
                        </h4>
                        <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                          {result.data.availability.trim() || t("Not specified")}
                        </p>
                      </div>
                      {result.data.capabilities.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t("Mentoring support offered")}: {result.data.capabilities.join(", ")}
                        </p>
                      )}
                      {result.data.evidence && <ApplicantEvidence evidence={result.data.evidence} />}
                      {result.data.canInvite && (
                        <Button onClick={() => { setComparing(false); onInvite(result.data!); }}>
                          {t("Prepare official invitation")}
                        </Button>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

export function MyMentorshipApplications() {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id), refresh = useRefreshApplications();
  const [page, setPage] = useState(1), [detail, setDetail] = useState<MentorshipApplicationView>();
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["academic-support", userId, "my-applications", page], queryFn: () => api.mine(page), retry: false });

  const withdraw = useMutation({
    mutationFn: (item: MentorshipApplicationView) => {
      if (useAuthStore.getState().user?.id !== userId) throw new Error("Account changed");
      setWithdrawingId(item.id);
      return api.action(item.projectId, item, "WITHDRAW");
    },
    onSuccess: () => {
      refresh();
      toast.success(t("Offer withdrawn toast"));
    },
    onError: refresh,
    onSettled: () => setWithdrawingId(null),
  });

  return (
    <section className="space-y-3" aria-label={t("My mentoring applications")}>
      <h2 className="font-semibold text-base">{t("My mentoring applications")}</h2>
      {withdraw.isError && <ErrorMessage error={withdraw.error} />}
      {query.isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : query.isError ? (
        <div className="space-y-2">
          <ErrorMessage error={query.error} />
          <Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button>
        </div>
      ) : !query.data?.items.length ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          {t("You have not applied to mentor a team yet.")}
        </p>
      ) : (
        <ul className="space-y-3">
          {query.data.items.map(item => (
            <li key={item.id} className="rounded-xl border border-border/80 bg-card p-4 space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{item.project.title}</h3>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusBadgeStyle(item.status)}`}>
                      {t(applicationLabels[item.status])}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{item.message}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {item.canWithdraw && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      disabled={withdraw.isPending}
                      onClick={() => withdraw.mutate(item)}
                    >
                      {withdrawingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{t("Withdraw application")}</span>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetail(item)}>
                    {t("View application")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.data && query.data.meta.totalPages > 1 && (
        <div className="flex gap-2">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button>
          <Button variant="ghost" disabled={page >= query.data.meta.totalPages} onClick={() => setPage(page + 1)}>{t("Next")}</Button>
        </div>
      )}
      {detail && <ApplicationDetailDialog item={detail} onClose={() => setDetail(undefined)} />}
    </section>
  );
}
