import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { useVerifiedLecturer } from "@/features/academic-profile/hooks/use-verified-lecturer";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Check, Clock3, FileCheck2, Inbox, Send, Shapes } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReviewCenter, useReviewRequestAction, type ReviewCenterItem } from "@/features/reviews";
import { useI18n } from "@/i18n";

type CenterTab = "incoming" | "sent" | "progress" | "completed";
const activeStatuses = new Set(["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED"]);
const finalStatuses = new Set(["COMPLETED", "DECLINED", "CANCELLED", "EXPIRED"]);

function statusClass(status: string) {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (["DECLINED", "CANCELLED", "EXPIRED"].includes(status)) return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
  if (["REQUESTED", "REVISION_REQUESTED"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
}

function artifactLabelKey(type?: string | null): string {
  if (!type) return "reviewTemplates.anyArtifact";
  const known = [
    "RESEARCH_PAPER",
    "LITERATURE_REVIEW",
    "RESEARCH_PROPOSAL",
    "METHODOLOGY",
    "SOFTWARE_RESEARCH_PROJECT",
    "MANUSCRIPT",
    "THESIS_CHAPTER",
    "THESIS_DRAFT",
    "GAP_ANALYSIS",
    "EVIDENCE_SYNTHESIS",
    "RESEARCH_PLAN",
    "GENERAL_REPORT",
  ];
  return known.includes(type) ? `reviewTemplates.artifact.${type}` : type.replaceAll("_", " ");
}

export function ReviewDashboardPage() {
  const { t, language } = useI18n();
  const { embedded, href } = useReviewPageNavigation();
  const Container = embedded ? "section" : "main";
  const canReview = useVerifiedLecturer();
  const query = useReviewCenter();
  const actions = useReviewRequestAction();
  const [tab, setTab] = useState<CenterTab>("incoming");
  const [declining, setDeclining] = useState<ReviewCenterItem>();
  const [declineReason, setDeclineReason] = useState("");
  const data = query.data ?? { incoming: [], sent: [] };

  const items = useMemo(() => {
    if (tab === "incoming") return data.incoming.filter((item) => item.status === "REQUESTED");
    if (tab === "sent") return data.sent.filter((item) => !finalStatuses.has(item.status));
    if (tab === "progress") return data.incoming.filter((item) => activeStatuses.has(item.status));
    const byId = new Map([...data.incoming, ...data.sent].filter((item) => finalStatuses.has(item.status)).map((item) => [item.id, item]));
    return [...byId.values()];
  }, [data.incoming, data.sent, tab]);

  const counts = {
    incoming: data.incoming.filter((item) => item.status === "REQUESTED").length,
    sent: data.sent.filter((item) => !finalStatuses.has(item.status)).length,
    progress: data.incoming.filter((item) => activeStatuses.has(item.status)).length,
    completed: new Set([...data.incoming, ...data.sent].filter((item) => finalStatuses.has(item.status)).map((item) => item.id)).size,
  };

  if (query.isLoading) {
    return (
      <Container className={embedded ? "space-y-4" : "mx-auto max-w-6xl px-4 py-10"}>
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </Container>
    );
  }
  if (query.error) {
    return (
      <Container className={embedded ? "space-y-4" : "mx-auto max-w-3xl px-4 py-16"}>
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {t("reviewCenter.loadError")}
        </div>
      </Container>
    );
  }

  async function accept(item: ReviewCenterItem) {
    try {
      await actions.accept.mutateAsync(item.id);
      toast.success(t("reviewCenter.toast.accepted"));
      setTab("progress");
    } catch {
      toast.error(t("reviewCenter.toast.acceptError"));
    }
  }

  async function decline() {
    if (!declining) return;
    const withdrawing = declining.status !== "REQUESTED";
    try {
      await actions.decline.mutateAsync({ id: declining.id, reason: declineReason || undefined });
      toast.success(t(withdrawing ? "reviewCenter.toast.withdrawn" : "reviewCenter.toast.declined"));
      setDeclining(undefined);
      setDeclineReason("");
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || t("reviewCenter.toast.declineError"));
    }
  }

  // Withdrawing is allowed after accepting, as long as no review round has been submitted.
  const canWithdraw = (item: ReviewCenterItem) =>
    ["ACCEPTED", "IN_REVIEW"].includes(item.status) &&
    (!item.latestReview || (item.latestReview.status === "DRAFT" && item.latestReview.roundNumber === 1));

  return (
    <Container className={embedded ? "min-w-0 w-full space-y-6" : "mx-auto min-w-0 w-full max-w-6xl py-4 sm:py-8"} data-no-i18n>
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("reviewCenter.title")}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{t("reviewCenter.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canReview && !embedded ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/mentor-workspace">
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                <span>{t("mentorWorkspace.title")}</span>
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link to={href("/review-templates")}>
              <Shapes className="h-4 w-4" aria-hidden="true" />
              <span>{t("reviewTemplates.title")}</span>
            </Link>
          </Button>
        </div>
      </header>

      <nav
        className="flex w-full max-w-full gap-1 overflow-x-auto overscroll-x-contain border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("reviewCenter.title")}
      >
        {(
          [
            ["incoming", "reviewCenter.tab.incoming", Inbox],
            ["progress", "reviewCenter.tab.progress", Clock3],
            ["sent", "reviewCenter.tab.sent", Send],
            ["completed", "reviewCenter.tab.completed", FileCheck2],
          ] as const
        ).map(([value, labelKey, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{t(labelKey)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{counts[value]}</span>
          </button>
        ))}
      </nav>

      {items.length ? (
        <div className="divide-y rounded-xl border bg-card">
          {items.map((item) => (
            <article key={item.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t(artifactLabelKey(item.artifact.type))}</Badge>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass(item.status)}`}>
                      {t(`reviewCenter.status.${item.status}`)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("reviewCenter.revision", { version: item.artifact.revisionNumber })}
                    </span>
                  </div>
                  <h2 className="mt-2.5 text-base font-semibold text-foreground">{item.artifact.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tab === "sent"
                      ? t("reviewCenter.reviewerLabel", { name: item.reviewer.fullName })
                      : t("reviewCenter.requesterLabel", { name: item.requester.fullName })}
                    {item.dueAt
                      ? ` · ${t("reviewCenter.dueLabel", { date: new Date(item.dueAt).toLocaleDateString(language) })}`
                      : ""}
                  </p>
                  {item.message ? (
                    <p className="mt-2.5 max-w-3xl text-sm leading-6 text-muted-foreground">{item.message}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {canReview && tab === "incoming" && item.status === "REQUESTED" ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setDeclining(item)}>
                        {t("reviewCenter.decline")}
                      </Button>
                      <Button size="sm" onClick={() => accept(item)} disabled={actions.accept.isPending}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        <span>{t("reviewCenter.accept")}</span>
                      </Button>
                    </>
                  ) : canReview && tab !== "sent" && activeStatuses.has(item.status) && item.status !== "REVISION_REQUESTED" ? (
                    <>
                      {canWithdraw(item) ? (
                        <Button variant="outline" size="sm" onClick={() => setDeclining(item)}>
                          {t("reviewCenter.withdraw")}
                        </Button>
                      ) : null}
                      <Button asChild size="sm">
                        <Link to={href(`/reviews/${encodeURIComponent(item.assignment.id)}`)}>
                          <span>
                            {t(item.latestReview?.status === "DRAFT" ? "reviewCenter.continueReview" : "reviewCenter.startReview")}
                          </span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <Link to={href(`/review-requests/${encodeURIComponent(item.id)}`)}>
                        <span>{t("reviewCenter.viewDetails")}</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card/60 p-10 text-center">
          <Inbox className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-foreground">
            {t(`reviewCenter.empty.${tab}`)}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(tab === "incoming" ? "reviewCenter.empty.incomingHint" : "reviewCenter.empty.defaultHint")}
          </p>
        </div>
      )}

      <Dialog open={Boolean(declining)} onOpenChange={(value) => { if (!value) setDeclining(undefined); }}>
        <DialogContent data-no-i18n>
          <DialogHeader>
            <DialogTitle>
              {t(
                declining && declining.status !== "REQUESTED"
                  ? "reviewCenter.dialog.withdrawTitle"
                  : "reviewCenter.dialog.declineTitle",
              )}
            </DialogTitle>
            <DialogDescription>{t("reviewCenter.dialog.description")}</DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">
            {t("reviewCenter.dialog.reasonLabel")}
            <textarea
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              maxLength={2000}
              className="mt-2 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={t("reviewCenter.dialog.reasonPlaceholder")}
            />
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclining(undefined)}>
              {t("reviewCenter.dialog.keep")}
            </Button>
            <Button variant="destructive" onClick={decline} disabled={actions.decline.isPending}>
              {t(
                declining && declining.status !== "REQUESTED"
                  ? "reviewCenter.dialog.confirmWithdraw"
                  : "reviewCenter.dialog.confirmDecline",
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
