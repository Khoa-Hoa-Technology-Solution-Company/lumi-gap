import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, BadgeCheck, Check, Clock, FileWarning, ShieldQuestion, ShieldCheck, CircleX, ExternalLink, FileText, Link2, Mail, Building2, Eye } from "lucide-react";
import type { LecturerTrackingRequest } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { academicProfileApi } from "../api/academic-profile.api";
import { useAcademicProfile, useInstitutionalEmailStatus, useLecturerVerificationTracking } from "../hooks/use-academic-profile";
import { PositionVerificationPanel } from "./position-verification-panel";
import { useLecturerDelivery } from "../hooks/use-lecturer-delivery";
import "./lecturer-verification-status.css";

const PdfPreview = lazy(() => import("./private-evidence-pdf-preview"));
const states = {
  NOT_SUBMITTED: ["Lecturer position is not verified", "Verify your Lecturer position to participate in official Mentoring and Academic Review."],
  PENDING: ["Awaiting Admin review", "Your verification request has been recorded. LumiGap will notify you of a result or a request for additional information."],
  NEEDS_MORE_INFORMATION: ["More information required", "An administrator needs more information to continue verifying your Lecturer position."],
  VERIFIED: ["Lecturer position verified", "LumiGap has verified your Lecturer position at the declared institution."],
  REJECTED: ["Lecturer position could not be verified", "Your request was reviewed but did not meet the verification requirements."],
  INVALIDATED: ["Verification claim changed", "Your institution or academic position changed. Submit evidence for your current claim."],
  EXPIRED: ["Lecturer verification expired", "Submit updated evidence for your current Lecturer position."],
} as const;
const evidenceLabels: Record<string, string> = { OFFICIAL_FACULTY_PROFILE: "Official faculty/staff profile", OFFICIAL_STAFF_DIRECTORY: "Official staff directory", DEPARTMENT_DIRECTORY: "Department directory", INSTITUTION_ISSUED_PROFILE: "Institution-issued faculty/staff profile", EMPLOYMENT_DOCUMENT: "Employment confirmation", APPOINTMENT_DOCUMENT: "Appointment letter", STAFF_ID: "Staff/faculty ID", OTHER_INSTITUTION_SOURCE: "Other — Specify your evidence" };
const events = { SUBMITTED: "Verification request submitted", SUPPLEMENTED: "Supplementary evidence submitted", MORE_INFO: "Admin requested more information", APPROVED: "Lecturer position verified", REJECTED: "Lecturer position could not be verified", INVALIDATED: "Verification claim changed", EXPIRED: "Lecturer verification expired" };
const method = (value?: string) => value === "INSTITUTIONAL_EMAIL_AND_PROFILE" ? "Institutional email and position evidence" : value === "MANUAL_INSTITUTIONAL_EVIDENCE" ? "Manual institution evidence review" : "Manual review";

export function LecturerVerificationStatusPage() {
  const { t, language } = useI18n(), navigate = useNavigate(), [params, setParams] = useSearchParams();
  const requestId = params.get("requestId") ?? undefined, page = Math.max(1, Number(params.get("page")) || 1);
  const tracking = useLecturerVerificationTracking(requestId, page), profile = useAcademicProfile(), identity = useInstitutionalEmailStatus();
  const delivery = useLecturerDelivery(profile.data?.userId);
  const [open, setOpen] = useState(false), [preview, setPreview] = useState<{ requestId: string; sourceId?: string; name: string }>();
  const [section, setSection] = useState<"evidence" | "information" | "history">("evidence");
  const panel = useRef<HTMLDivElement>(null);
  const tabsId = useId();
  const data = tracking.data?.lecturer;
  const date = (value: string) => new Date(value).toLocaleString(language);
  if (tracking.isPending) return <main className="lecturer-verification" role="status" aria-label={t("Checking verification status…")}><div className="lv-sheet lv-skeleton"><div className="h-8 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="mt-6 h-24 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="mt-10 h-48 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div></main>;
  if (tracking.isError || !data) return <main className="lecturer-verification" data-no-i18n><section className="lv-sheet lv-skeleton"><ShieldQuestion className="mb-4 h-7 w-7 text-muted-foreground" aria-hidden="true" /><h1 className="text-2xl font-semibold">{t("Lecturer verification")}</h1><p role="alert" className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t("Could not load verification tracking. Your verification status has not changed.")}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => void tracking.refetch()}>{t("Retry")}</Button><Button asChild variant="outline"><Link to="/settings/verification/lecturer">{t("View current verification")}</Link></Button></div></section></main>;
  const request = data.selectedRequest, historical = Boolean(requestId && request && (request.id !== data.currentRequestId || request.invalidatedAt || data.academicRole !== "LECTURER"));
  const displayedStatus = historical && request ? request.status : data.status;
  const copy = states[displayedStatus as keyof typeof states] ?? ["Verification status", "Review your current verification details."];
  const Icon = displayedStatus === "VERIFIED" ? BadgeCheck : displayedStatus === "PENDING" ? Clock : displayedStatus === "NEEDS_MORE_INFORMATION" ? FileWarning : displayedStatus === "REJECTED" ? CircleX : ShieldQuestion;
  const action = historical ? undefined : data.allowedActions.find(value => ["START", "SUPPLEMENT", "NEW_REQUEST", "MENTORING_SETTINGS"].includes(value));
  const activeSection = request ? section : section === "history" ? "history" : "information";
  function changeSection(next: typeof section, focus = false) {
    setSection(next);
    if (focus) {
      panel.current?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      panel.current?.focus({ preventScroll: true });
    }
  }
  const currentPosition = request?.position || data.position;
  const translatedPosition = currentPosition ? t(currentPosition) : t("Not provided");
  const tabs = [
    ...(request ? [{ id: "evidence" as const, label: "lecturerVerification.tabs.evidence", count: request.evidence.length }] : []),
    { id: "information" as const, label: "lecturerVerification.tabs.information", count: undefined },
    { id: "history" as const, label: "lecturerVerification.tabs.history", count: data.history.length || undefined },
  ];
  const tone = displayedStatus === "VERIFIED" ? "success" : ["PENDING", "NEEDS_MORE_INFORMATION"].includes(displayedStatus) ? "waiting" : displayedStatus === "REJECTED" ? "rejected" : "neutral";
  return <main className="lecturer-verification" aria-labelledby="lecturer-verification-title" data-no-i18n>
    <Link to="/profile?tab=affiliation" className="lv-back"><ArrowLeft aria-hidden="true" size={16} />{t("Back to profile")}</Link>
    <div className="lv-sheet">
      <header className="lv-header">
        <div className="lv-header-top"><p className="lv-eyebrow">{t("Lecturer verification")}</p>{historical && <span className="lv-historical">{t("Historical request")}</span>}</div>
        <div className="lv-status-row">
          <div className="lv-status-copy"><span className="lv-status-icon" data-tone={tone}><Icon size={24} aria-hidden="true" /></span><h1 id="lecturer-verification-title">{t(copy[0])}</h1></div>
          <div className="lv-actions">
            {action && <Button disabled={action !== "MENTORING_SETTINGS" && (!profile.data || profile.isError || Boolean(delivery && delivery.state !== "SENT"))} onClick={() => action === "MENTORING_SETTINGS" ? navigate("/academic-support#mentoring-settings") : setOpen(true)}>{t(action === "SUPPLEMENT" ? "Supplement evidence" : action === "NEW_REQUEST" ? "Submit new verification" : action === "MENTORING_SETTINGS" ? "Configure mentoring availability" : "Start verification")}</Button>}
            {displayedStatus === "PENDING" && <Button variant="outline" onClick={() => changeSection("information", true)}>{t("View request details")}</Button>}
            {data.allowedActions.includes("WORKSPACE") && !historical && <Button asChild variant="outline"><Link to="/academic-support">{t("Open Lecturer workspace")}</Link></Button>}
            {historical && <Button asChild variant="outline"><Link to="/settings/verification/lecturer">{t("View current verification")}</Link></Button>}
          </div>
        </div>
        <p className="lv-status-description">{t(copy[1])}</p>
        {params.get("submitted") === "1" && request && <p role="status" className="lv-submitted"><Check size={16} aria-hidden="true" />{t("Verification request submitted")} · {date(request.submittedAt)}</p>}
        {request?.invalidatedAt && <p className="lv-status-description">{t("This historical decision does not verify your current academic claim.")}</p>}
        {data.academicRole !== "LECTURER" && <p className="lv-status-description">{t("Your current academic role is not Lecturer. Previous requests remain available in history.")}</p>}
        {!action && !historical && displayedStatus !== "PENDING" && displayedStatus !== "VERIFIED" && <p className="lv-status-description">{t("Complete your institution, Lecturer position and account email verification before submitting.")} <Link className="underline underline-offset-4" to="/profile?tab=affiliation&edit=affiliation">{t("Edit details")}</Link></p>}
        <div className="lv-claim"><Building2 size={20} aria-hidden="true" /><div><p className="lv-institution">{request?.institutionName || data.institutionName || t("Not provided")}</p><p className="lv-position">{typeof translatedPosition === "string" ? translatedPosition : currentPosition || t("Not provided")}{request && <><span aria-hidden="true"> · </span><span>{t("Submitted on")} {date(request.submittedAt)}</span></>}</p></div></div>
        {request && ["PENDING", "NEEDS_MORE_INFORMATION", "VERIFIED", "REJECTED"].includes(displayedStatus) && <ol className="lv-progress" aria-label={t("Verification progress")}>
          {["Request received", "lecturerVerification.progress.review", "Review result"].map((label, index) => {
            const terminal = ["VERIFIED", "REJECTED"].includes(displayedStatus);
            const complete = index === 0 || (index === 1 && terminal);
            const current = terminal ? index === 2 : index === 1;
            return <li key={label} data-complete={complete} aria-current={current ? "step" : undefined}><span>{complete ? <Check size={14} aria-hidden="true" /> : current ? <Icon size={14} aria-hidden="true" /> : index + 1}</span><p>{t(label)}</p></li>;
          })}
        </ol>}
      </header>
      {request?.applicantMessage && <section className="lv-feedback"><FileWarning size={18} aria-hidden="true" /><div><h2>{t(request.status === "NEEDS_MORE_INFORMATION" ? "lecturerVerification.feedback.moreInfo" : request.status === "REJECTED" ? "lecturerVerification.feedback.rejection" : "Admin feedback")}</h2><p>{request.applicantMessage}</p></div></section>}
      <div className="lv-tablist" role="tablist" aria-label={t("Verification sections")}>
        {tabs.map((tab, index) => <button key={tab.id} id={`${tabsId}-${tab.id}`} type="button" role="tab" aria-selected={activeSection === tab.id} aria-controls={`${tabsId}-${tab.id}-panel`} tabIndex={activeSection === tab.id ? 0 : -1} onClick={() => changeSection(tab.id)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
          if (next !== undefined) { event.preventDefault(); changeSection(tabs[next]!.id); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus(); }
        }}>{t(tab.label)}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}
      </div>
      <div ref={panel} className="lv-content" tabIndex={-1}>
        {request && <section id={`${tabsId}-evidence-panel`} role="tabpanel" aria-labelledby={`${tabsId}-evidence`} hidden={activeSection !== "evidence"}>
          <Evidence request={request} date={date} onPreview={sourceId => setPreview({ requestId: request.id, sourceId, name: sourceId ? request.evidence.find(item => item.id === sourceId)!.displayName : t("Verification evidence") })} />
        </section>}
        <section id={`${tabsId}-information-panel`} role="tabpanel" aria-labelledby={`${tabsId}-information`} hidden={activeSection !== "information"}>
          {!request && displayedStatus === "NOT_SUBMITTED" && <section className="lv-preparation"><h2>{t("Before you begin")}</h2><p>{t("Prepare evidence that confirms your current position at your institution.")}</p><ul><li><Mail size={18} aria-hidden="true" />{t("An institutional email, if you have one.")}</li><li><FileText size={18} aria-hidden="true" />{t("An official staff profile or a document issued by your institution.")}</li><li><Eye size={18} aria-hidden="true" />{t("Preview your evidence before sending.")}</li></ul><p>{t("After submitting, you can leave this form. We will send your saved evidence in the background and notify you if it needs retrying.")}</p></section>}
          <h2 className="lv-section-title">{t("Verification information")}</h2>
          <dl className="lv-information-grid">
            <Info label={t("Account email ownership")} value={t(data.accountEmailVerified ? "Verified" : "Not verified")} verified={data.accountEmailVerified} />
            <Info label={t("Institutional email ownership")} value={identity.isError ? t("Could not check institutional identity.") : identity.isPending ? t("Checking…") : identity.data?.verified ? `${identity.data.email} · ${t("Verified")}` : t("Not verified")} verified={!identity.isError && !identity.isPending && identity.data?.verified} />
            {request && <><Info label={t("Verification method")} value={t(method(request.verificationMethod))} /><Info label={t("Submitted on")} value={date(request.submittedAt)} />{request.reviewedAt && <Info label={t("Decision date")} value={date(request.reviewedAt)} />}<Info label={t("Request ID")} value={request.id} mono /></>}
          </dl>
          {displayedStatus === "VERIFIED" && !historical && <section className="lv-eligibility"><h2>{t("Lecturer eligibility")}</h2><p>{t("You may configure mentorship availability, offer mentorship and receive Formal Academic Review requests. Mentoring requires mutual consent; formal review requires an accepted assignment for a specific artifact. Verification does not grant project access.")}</p></section>}
        </section>
        <section id={`${tabsId}-history-panel`} role="tabpanel" aria-labelledby={`${tabsId}-history`} hidden={activeSection !== "history"}>
          {data.timeline.length > 0 && <section className="lv-timeline"><h2 className="lv-section-title">{t("Verification timeline")}</h2><ol>{data.timeline.map(event => <li key={event.id}><span className="lv-event-dot" aria-hidden="true" /><div><p>{t(events[event.eventType])}</p>{event.message && <p className="lv-event-message">{event.message}</p>}</div><time dateTime={event.createdAt}>{date(event.createdAt)}</time></li>)}</ol></section>}
          <h2 className="lv-section-title">{t("Verification history")}</h2>
          {data.history.length ? <ul className="lv-history">{data.history.map(item => <li key={item.id}><Link aria-current={item.id === request?.id ? "page" : undefined} onClick={() => setSection("evidence")} to={`?requestId=${encodeURIComponent(item.id)}&page=${data.page}`}><div><p>{item.institutionName} · {typeof t(item.position) === "string" ? t(item.position) : item.position}</p><span>{t((states[item.status as keyof typeof states] ?? states.NOT_SUBMITTED)[0])} · {date(item.submittedAt)} · {t("Revision")} {item.revision}</span></div><ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}</ul> : <p className="lv-empty">{t("No verification history yet.")}</p>}
          {data.totalPages > 1 && <div className="lv-pagination"><Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => setParams({ ...(requestId ? { requestId } : {}), page: String(data.page - 1) })}>{t("Previous")}</Button><span>{data.page} / {data.totalPages}</span><Button size="sm" variant="outline" disabled={data.page >= data.totalPages} onClick={() => setParams({ ...(requestId ? { requestId } : {}), page: String(data.page + 1) })}>{t("Next")}</Button></div>}
        </section>
      </div>
      <footer className="lv-privacy"><ShieldCheck size={16} aria-hidden="true" /><p>{t("Evidence is private to you and authorized administrators.")}</p></footer>
    </div>
    {open && profile.data && <PositionVerificationPanel profile={profile.data} editable trackingMode open={open} onOpenChange={setOpen} supplement={action === "SUPPLEMENT" && request ? request : undefined} onEditPosition={() => navigate("/settings/academic?tab=affiliation")} />}
    <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) setPreview(undefined); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle className="break-all">{preview?.name}</DialogTitle></DialogHeader>{preview && <PrivatePreview key={`${preview.requestId}:${preview.sourceId}`} requestId={preview.requestId} sourceId={preview.sourceId} />}</DialogContent></Dialog>
  </main>;
}
function Info({ label, value, verified, mono }: { label: string; value: string; verified?: boolean; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className={cn("mt-1 flex items-start gap-1.5 break-words font-medium leading-6 [overflow-wrap:anywhere]", mono && "font-mono text-xs font-normal", verified && "text-emerald-700 dark:text-emerald-300")}>{verified && <BadgeCheck className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />}<span className="min-w-0">{value}</span></dd></div>;
}
function Evidence({ request, date, onPreview }: { request: LecturerTrackingRequest; date: (value: string) => string; onPreview: (sourceId?: string) => void }) {
  const { t } = useI18n();
  return <div>
    <h2>{t("lecturerVerification.evidence.title")}</h2><p className="lv-caption">{t("Review the files and official sources included in this request.")}</p>
    {!request.evidence.length ? <p className="lv-empty">{t("No retained evidence metadata is available for this historical request.")}</p> : <ul className="lv-evidence-list">{request.evidence.map(item => {
      const SourceIcon = item.sourceKind === "DOCUMENT" ? FileText : Link2;
      const href = safeSourceUrl(item.reference);
      const format = item.sourceKind === "URL" ? "LINK" : item.mimeType === "application/pdf" || /\.pdf$/i.test(item.displayName) ? "PDF" : item.mimeType === "image/png" || /\.png$/i.test(item.displayName) ? "PNG" : item.mimeType === "image/jpeg" || /\.jpe?g$/i.test(item.displayName) ? "JPEG" : "FILE";
      return <li key={item.id}>
        <span className="lv-file-symbol"><SourceIcon size={21} aria-hidden="true" /><span>{format}</span></span>
        <div className="min-w-0">
          <p className="lv-file-name">{item.displayName !== item.type ? item.displayName : t(evidenceLabels[item.type] ?? "Verification evidence")}</p>
          <p className="lv-file-meta">{item.displayName !== item.type && <span>{t(evidenceLabels[item.type] ?? "Verification evidence")}</span>}<span>{date(item.submittedAt)}</span></p>
          {item.sourceKind === "URL" && href && <p className="lv-source-detail">{href.hostname}{href.pathname === "/" ? "" : href.pathname}</p>}
          {item.replaced && <p className="lv-source-detail">{t("Replaced in a later revision")}</p>}
          {item.additionalExplanation && <p className="lv-source-detail">{item.additionalExplanation}</p>}
        </div>
        {!item.isAvailable ? <p className="lv-file-unavailable">{t("This document is no longer stored.")}</p> : <div className="lv-file-action">{item.sourceKind === "DOCUMENT" ? <Button size="sm" variant="outline" onClick={() => onPreview(item.id === request.id ? undefined : item.id)}><Eye size={15} className="mr-1.5 shrink-0" aria-hidden="true" />{t("View evidence")}</Button> : href && <Button size="sm" variant="outline" asChild><a href={href.href} target="_blank" rel="noopener noreferrer">{t("Open submitted source")}<ExternalLink className="ml-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a></Button>}</div>}
      </li>;
    })}</ul>}
    <p className="lv-evidence-note">{t("Submitted sources are evidence for review; submission alone does not verify them.")}</p>
  </div>;
}
function safeSourceUrl(value?: string) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url : null; } catch { return null; }
}
function PrivatePreview({ requestId, sourceId }: { requestId: string; sourceId?: string }) {
  const { t } = useI18n(), [blob, setBlob] = useState<Blob>(), [url, setUrl] = useState<string>(), [error, setError] = useState(false);
  useEffect(() => { let active = true, objectUrl: string | undefined;
    void academicProfileApi.ownVerificationEvidenceFile(requestId, sourceId).then(result => { if (!active) return; objectUrl = URL.createObjectURL(result); setBlob(result); setUrl(objectUrl); }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [requestId, sourceId]);
  if (error) return <p role="alert" className="text-sm">{t("Evidence is unavailable or you no longer have access. Refresh verification status.")}</p>;
  if (!blob) return <p role="status">{t("Loading private evidence…")}</p>;
  return <div className="space-y-3">{blob.type === "application/pdf" ? <Suspense fallback={<p>{t("Loading private evidence…")}</p>}><PdfPreview blob={blob} /></Suspense> : ["image/png", "image/jpeg"].includes(blob.type) ? <img src={url} className="mx-auto max-h-[60dvh] max-w-full object-contain" alt={t("Private verification evidence")} /> : null}<Button asChild variant="outline"><a href={url} download="verification-evidence">{t("Download private document")}</a></Button></div>;
}
