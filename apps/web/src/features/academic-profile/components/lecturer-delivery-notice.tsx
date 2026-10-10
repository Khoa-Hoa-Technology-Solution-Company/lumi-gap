import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { useLecturerDelivery } from "../hooks/use-lecturer-delivery";
import { activeDelivery, runLecturerDelivery } from "../services/lecturer-delivery";
import { lecturerDeliveryStore } from "../services/lecturer-delivery-store";
import { EvidenceBlobPreview, SavedEvidencePreview } from "./evidence-blob-preview";

export function LecturerDeliveryNotice() {
  const { t } = useI18n(), userId = useAuthStore(state => state.user?.id);
  const signedIn = useAuthStore(state => Boolean(state.tokens?.accessToken));
  const job = useLecturerDelivery(signedIn ? userId : undefined), queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false), [actionError, setActionError] = useState(false);
  const notified = useRef("");
  useEffect(() => { if (job?.state === "SENT") setPreviewOpen(false); }, [job?.state]);
  useEffect(() => {
    if (!userId || !signedIn || !activeDelivery(job) || !navigator.onLine) return;
    void runLecturerDelivery(userId, () => useAuthStore.getState().user?.id === userId && Boolean(useAuthStore.getState().tokens?.accessToken)).catch(() => { setActionError(true); });
  }, [job, userId, signedIn]);
  useEffect(() => {
    if (activeDelivery(job)) { notified.current = ""; return; }
    if (!job || !["SENT", "FAILED", "UNCERTAIN"].includes(job.state) || notified.current === `${job.id}:${job.state}`) return;
    notified.current = `${job.id}:${job.state}`;
    if (job.state === "SENT") {
      void queryClient.invalidateQueries({ queryKey: ["academic-profile", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["academic-profile", "verification-status"] });
      toast.success(t("Verification request submitted"));
    } else toast.error(t("Evidence delivery needs your attention"), { description: t("Your evidence is saved. Open the delivery notice to retry."), duration: 8000 });
  }, [job, queryClient, t]);
  if (!job || job.state === "SENT") return null;
  const failed = job.state === "FAILED" || job.state === "UNCERTAIN";
  const heading = t(failed ? "Evidence delivery needs your attention" : "Sending verification in the background…");
  async function retry() {
    setActionError(false);
    try { await lecturerDeliveryStore.update(job!.userId, current => current.id === job!.id && ["FAILED", "UNCERTAIN"].includes(current.state) ? { ...current, state: "QUEUED", error: undefined } : current); }
    catch { setActionError(true); }
  }
  async function dismiss() {
    try { await lecturerDeliveryStore.update(job!.userId, current => current.id === job!.id && current.state === "FAILED" && !current.lease ? undefined : current); }
    catch { setActionError(true); }
  }
  return <>
    <aside aria-label={t("Verification delivery")} className="fixed bottom-4 left-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-xl border bg-background p-4 shadow-lg" data-no-i18n>
      <div role={failed ? "alert" : "status"} aria-live="polite"><p className="text-sm font-semibold">{heading}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{job.institutionName}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("Your evidence is saved on this browser. You can use other pages while it sends; if you close the browser, delivery resumes when you return.")}</p>
        {job.error && <p className="mt-2 text-xs text-destructive">{t(job.error, { institution: job.institutionName })}</p>}
        {activeDelivery(job) && job.progress !== undefined && <progress className="mt-2 h-2 w-full" value={job.progress} max={100} aria-label={t("Evidence upload progress")} />}
      </div>
      {actionError && <p role="alert" className="mt-2 text-xs text-destructive">{t("Could not update delivery. Please try again.")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {failed && <Button size="sm" onClick={() => void retry()}>{t("Retry delivery")}</Button>}
        <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>{t("View evidence")}</Button>
        <Button asChild size="sm" variant="outline"><Link to={job.receipt ? `/settings/verification/lecturer?requestId=${encodeURIComponent(job.receipt.requestId)}` : "/settings/verification/lecturer"}>{t("Track Lecturer verification")}</Link></Button>
        {job.state === "FAILED" && <Button size="sm" variant="ghost" disabled={Boolean(job.lease)} onClick={() => void dismiss()}>{t("Discard saved delivery")}</Button>}
      </div>
    </aside>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl" data-no-i18n><DialogHeader><DialogTitle>{t("Verification evidence")}</DialogTitle><DialogDescription>{t("Review the evidence saved for this delivery.")}</DialogDescription></DialogHeader><div className="space-y-6">{job.sources.map((source, index) => <section key={source.id} className="space-y-2"><h3 className="break-all text-sm font-semibold">{t("Evidence {{number}}", { number: index + 1 })}: {source.file?.name ?? source.retainedFileName ?? source.customEvidenceName}</h3>{source.file ? <EvidenceBlobPreview blob={source.file} name={source.file.name} /> : source.retainedSourceId && job.input.supplementsRequestId ? <SavedEvidencePreview requestId={job.input.supplementsRequestId} sourceId={source.retainedSourceId} /> : source.reference.startsWith("https://") ? <a className="break-all text-sm underline" href={source.reference} target="_blank" rel="noopener noreferrer">{source.reference}</a> : null}{source.additionalExplanation && <p className="whitespace-pre-wrap break-words text-sm">{source.additionalExplanation}</p>}</section>)}</div></DialogContent></Dialog>
  </>;
}
