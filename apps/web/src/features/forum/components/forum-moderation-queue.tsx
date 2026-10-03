import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, ExternalLink, EyeOff, History, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useForumModerationActions, useForumReports, type ForumReportView } from "@/features/forum";
import { forumApi } from "../api/forum.api";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { forumPostHref } from "../utils/forum-helpers";

export function ForumModerationQueue({ communityId }: { communityId?: string }) {
  const { t } = useI18n(); const [view, setView] = useState<"reports" | "history">("reports");
  const reportsQuery = useForumReports(communityId, "all", view === "reports"); const history = useForumModerationActions(communityId, view === "history");
  const reports = { ...reportsQuery, data: reportsQuery.data?.filter((report) => ["open", "claimed", "under_review"].includes(report.status) && !report.requiresAdminReview && report.reason !== "COPYRIGHT_CONCERN") };
  const client = useQueryClient();
  const decision = useMutation({ mutationFn: async ({ report, action }: { report: ForumReportView; action: "DISMISS_REPORT" | "HIDE_CONTENT" | "RESTORE_CONTENT" | "ESCALATE_REPORT" }) => {
    const claim = await forumApi.claimReport(report.id, report.version);
    await forumApi.reportAction(report.id, action, { expectedVersion: claim.version, reason: notes[report.id]?.trim() || report.reason });
  }, onSettled: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["forum"] }), client.invalidateQueries({ queryKey: ["communities"] }), client.invalidateQueries({ queryKey: ["community"] })]); } });
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function dismiss(report: ForumReportView) {
    try { await decision.mutateAsync({ report, action: "DISMISS_REPORT" }); toast.success(t("Report dismissed")); }
    catch { toast.error(t("Could not update this report.")); }
  }

  async function escalate(report: ForumReportView) {
    try { await decision.mutateAsync({ report, action: "ESCALATE_REPORT" }); toast.success(t("Report forwarded for Admin review")); }
    catch { toast.error(t("Could not update this report.")); }
  }

  async function moderateAndResolve(report: ForumReportView) {
    const restore = report.target.status === "hidden";
    try {
      await decision.mutateAsync({ report, action: restore ? "RESTORE_CONTENT" : "HIDE_CONTENT" });
      toast.success(t(restore ? "Content restored and report resolved" : "Content hidden and report resolved"));
    } catch { toast.error(t("Could not complete the moderation action.")); }
  }

  return <section><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-blue-700" /><h2 className="text-lg font-semibold">{t("Forum moderation")}</h2></div><p className="mt-1 text-sm text-muted-foreground">{t("Review policy and community-rule reports. Academic disagreement alone is not a moderation issue.")}</p></div><div className="inline-flex rounded-lg bg-muted p-1"><button type="button" onClick={() => setView("reports")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", view === "reports" ? "bg-background shadow-sm" : "text-muted-foreground")}>{t("Open reports")}</button><button type="button" onClick={() => setView("history")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", view === "history" ? "bg-background shadow-sm" : "text-muted-foreground")}>{t("Audit history")}</button></div></div>
    {view === "reports" ? reports.isLoading ? <Loading /> : reports.error ? <ErrorState text={t("Could not load moderation reports.")} /> : reports.data?.length ? <div className="mt-5 space-y-4">{reports.data.map((report) => <article key={report.id} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(report.reason)}</Badge><Badge variant="secondary">{t(report.targetType === "post" ? "Thread" : "Response")}</Badge>{report.community ? <span className="text-xs text-muted-foreground">{report.community.name}</span> : null}</div><h3 className="mt-3 font-semibold">{report.target.title || t("Reported response")}</h3><p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">{report.target.excerpt || t("No preview is available.")}</p></div><Button asChild size="sm" variant="outline"><Link to={forumPostHref({ id: report.postId }) + (report.targetType === "comment" ? "#comment-" + encodeURIComponent(report.targetId) : "")}><ExternalLink className="h-3.5 w-3.5" />{t("Open discussion")}</Link></Button></div>
          <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><div><dt className="font-medium text-foreground">{t("Reported by")}</dt><dd>{report.reporter.fullName}</dd></div><div><dt className="font-medium text-foreground">{t("Submitted")}</dt><dd>{new Date(report.createdAt).toLocaleString()}</dd></div></dl>{report.description ? <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm leading-6"><span className="font-medium">{t("Reporter context")}:</span> {report.description}</div> : null}
          <label className="mt-4 block space-y-2"><span className="text-xs font-medium">{t("Moderator note")}</span><textarea rows={2} maxLength={2000} value={notes[report.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={t("Explain the decision for the audit history")} /></label>
          <div className="mt-4 flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={decision.isPending} onClick={() => escalate(report)}><ShieldAlert className="h-4 w-4" />{t("Escalate to Admin")}</Button><Button size="sm" variant="ghost" disabled={decision.isPending} onClick={() => dismiss(report)}><XCircle className="h-4 w-4" />{t("Dismiss report")}</Button><Button size="sm" disabled={decision.isPending} onClick={() => moderateAndResolve(report)}>{report.target.status === "hidden" ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{t(report.target.status === "hidden" ? "Restore and resolve" : "Hide and resolve")}</Button></div>
        </article>)}</div> : <Empty icon={CheckCircle2} title={t("Moderation queue is clear")} detail={t("There are no open reports in this scope.")} />
      : history.isLoading ? <Loading /> : history.error ? <ErrorState text={t("Could not load moderation history.")} /> : history.data?.length ? <div className="mt-5 divide-y overflow-hidden rounded-xl border bg-card">{history.data.map((action) => <div key={action.id} className="p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(action.action)}</Badge>{action.community ? <span className="text-xs text-muted-foreground">{action.community.name}</span> : null}<time className="ml-auto text-xs text-muted-foreground">{new Date(action.createdAt).toLocaleString()}</time></div><p className="mt-2 text-sm"><span className="font-medium">{action.actor.fullName}</span>{action.reason ? ` · ${action.reason}` : ""}</p></div>)}</div> : <Empty icon={History} title={t("No moderation actions yet")} detail={t("Completed actions will appear here for auditability.")} />}
  </section>;
}

function Loading() { return <div className="mt-5 space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl bg-muted" />)}</div>; }
function ErrorState({ text }: { text: string }) { return <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{text}</p>; }
function Empty({ icon: Icon, title, detail }: { icon: typeof CheckCircle2; title: string; detail: string }) { return <div className="mt-5 rounded-xl border border-dashed px-6 py-12 text-center"><Icon className="mx-auto h-7 w-7 text-emerald-600" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>; }
