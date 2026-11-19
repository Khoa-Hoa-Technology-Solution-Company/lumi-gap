import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MentorManuscriptSendInput, MentorManuscriptSendResult } from "@trend/shared-types";
import { MANUSCRIPT_DOCUMENT_TYPES } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useProject } from "@/features/projects/hooks/use-projects";
import { manuscriptsApi } from "@/features/manuscripts/manuscripts.api";
import { submissionsApi } from "../api/submissions.api";
import "@/features/manuscripts/manuscripts.css";
import "../mentor-manuscript.css";
const PdfPreview = lazy(() => import("@/features/academic-profile/components/private-evidence-pdf-preview"));
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; projectId: string; projectTitle?: string;
  manuscriptId?: string; submissionId?: string;
  prepareSnapshot?: () => Promise<{ id: string; sourceVersion: number }>;
  onSent: (result: MentorManuscriptSendResult) => void;
}
const errorMessage = (error: unknown, fallback: string) => (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
export function MentorManuscriptDialog(props: Props) {
  const userId = useAuthStore(state => state.user?.id);
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>{props.open ? <MentorManuscriptForm key={`${userId}:${props.projectId}:${props.manuscriptId ?? ""}:${props.submissionId ?? ""}`} {...props} /> : null}</Dialog>;
}
function MentorManuscriptForm(props: Props) {
  const { t } = useI18n(), client = useQueryClient(), userId = useAuthStore(state => state.user?.id);
  const { projectId } = props;
  const project = useProject(projectId);
  const manuscripts = useQuery({ queryKey: ["manuscripts", userId, projectId], queryFn: () => manuscriptsApi.list(projectId) });
  const mentors = useQuery({ queryKey: ["submissions", "active-mentors", userId, projectId], queryFn: () => submissionsApi.activeMentors(projectId), retry: false });
  const [source, setSource] = useState<"SNAPSHOT" | "PDF">(props.submissionId && !props.manuscriptId ? "PDF" : "SNAPSHOT"), [choice, setChoice] = useState(props.manuscriptId ?? "");
  const manuscriptId = choice || manuscripts.data?.[0]?.id || "";
  const manuscript = manuscripts.data?.find(item => item.id === manuscriptId);
  const [selectedMentor, setSelectedMentor] = useState("");
  const mentorId = selectedMentor || (mentors.data?.length === 1 ? mentors.data[0]!.canonicalId ?? mentors.data[0]!.id : "");
  const context = useQuery({ queryKey: ["mentor-send-context", userId, projectId, source === "SNAPSHOT" ? manuscriptId : "", props.submissionId], queryFn: () => submissionsApi.mentorFeedbackContext({ projectId, ...(props.submissionId ? { submissionId: props.submissionId } : source === "SNAPSHOT" ? { manuscriptId } : {}) }), enabled: Boolean(props.submissionId || source === "SNAPSHOT" && manuscriptId), retry: false });
  const [file, setFile] = useState<File>(), [message, setMessage] = useState(""), [responses, setResponses] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<{ snapshotId: string; compilationId: string; version: number; manuscriptId: string }>();
  const [preparing, setPreparing] = useState(false), [error, setError] = useState(""), [pdfValid, setPdfValid] = useState(false), [timedOut, setTimedOut] = useState(false);
  const submitting = useRef(false), generation = useRef(0), autoPrepared = useRef(false), retry = useRef({ signature: "", key: crypto.randomUUID() });
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { setTimedOut(false); if (!prepared) return; const timer = setTimeout(() => setTimedOut(true), 95000); return () => clearTimeout(timer); }, [prepared?.compilationId]);
  const compilation = useQuery({ queryKey: ["mentor-send-compile", userId, projectId, prepared?.manuscriptId, prepared?.snapshotId, prepared?.compilationId], queryFn: () => manuscriptsApi.compilations(projectId, prepared!.manuscriptId, prepared!.snapshotId, prepared!.compilationId), enabled: Boolean(prepared && source === "SNAPSHOT"), retry: false,
    refetchInterval: query => !timedOut && (!query.state.data?.latest || ["QUEUED", "COMPILING"].includes(query.state.data.latest.status)) ? 1200 : false });
  const successful = prepared && compilation.data?.successful?.id === prepared.compilationId ? compilation.data.successful : null;
  const pdf = useQuery({ queryKey: ["mentor-send-pdf", userId, projectId, prepared?.manuscriptId, prepared?.compilationId], queryFn: () => manuscriptsApi.pdf(projectId, prepared!.manuscriptId, prepared!.compilationId), enabled: Boolean(successful && source === "SNAPSHOT"), retry: false, gcTime: 0 });
  const blob = source === "PDF" ? file : pdf.data;
  const request = context.data?.requests.find(item => item.mentorId === mentorId);
  const waiting = request && ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(request.status);
  const items = request?.status === "REVISION_REQUESTED" ? request.items : [];
  const title = source === "SNAPSHOT" ? manuscript?.title : context.data?.submission?.title ?? file?.name.replace(/\.pdf$/i, "") ?? "";
  const send = useMutation({ mutationFn: ({ input, upload }: { input: MentorManuscriptSendInput; upload?: File }) => submissionsApi.sendMentorFeedback(input, upload), onSuccess: result => {
    for (const key of ["submissions", "mentor-workspace", "workspace-tasks", "mentor-send-context", "manuscripts"]) void client.invalidateQueries({ queryKey: [key] });
    props.onSent(result);
  } });
  const busy = preparing || send.isPending;
  async function prepare() {
    if (preparing || !manuscriptId) return;
    const current = ++generation.current;
    setPreparing(true); setError(""); setPrepared(undefined); setPdfValid(false);
    try {
      const detail = await manuscriptsApi.detail(projectId, manuscriptId);
      if (!detail.compiler?.available) throw new Error(t("PDF compilation is not available on this server."));
      const snapshot = props.prepareSnapshot && manuscriptId === props.manuscriptId ? await props.prepareSnapshot() : await manuscriptsApi.snapshot(projectId, manuscriptId, { label: t("Mentor feedback snapshot"), clientKey: crypto.randomUUID(), minimumSequences: {}, reuseUnchanged: true });
      if (current !== generation.current) return;
      const job = await manuscriptsApi.compile(projectId, manuscriptId, snapshot.id, detail.compilerSettings?.engine ?? "pdflatex", detail.compilerSettings?.texLiveVersion ?? detail.compiler.versions?.[0] ?? "2022");
      if (current === generation.current) setPrepared({ snapshotId: snapshot.id, compilationId: job.id, version: snapshot.sourceVersion, manuscriptId });
    } catch (failure) { if (current === generation.current) setError(t(errorMessage(failure, failure instanceof Error ? failure.message : t("Could not prepare the PDF. Your manuscript is retained.")))); }
    finally { if (current === generation.current) setPreparing(false); }
  }
  useEffect(() => { if (source === "SNAPSHOT" && props.manuscriptId && manuscript && !autoPrepared.current) { autoPrepared.current = true; void prepare(); } }, [source, props.manuscriptId, manuscript, prepare]);
  function reset() { generation.current++; setPrepared(undefined); setPdfValid(false); setError(""); setPreparing(false); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || busy || !mentorId || !pdfValid || !blob) return;
    const values: Omit<MentorManuscriptSendInput, "clientKey"> = { projectId, mentorId, source, message: message.trim() || undefined,
      ...(context.data?.submission ? { submissionId: context.data.submission.id, expectedRevisionNumber: context.data.submission.currentRevisionNumber } : {}),
      ...(source === "SNAPSHOT" && prepared ? { manuscriptSnapshotId: prepared.snapshotId, compilationId: prepared.compilationId } : { title: (title && title.trim().length >= 2 ? title : file!.name).slice(0, 300) }),
      ...(items.length ? { responses: items.map(item => ({ revisionItemId: item.id, responseText: responses[item.id]?.trim() ?? "" })) } : {}) };
    const signature = JSON.stringify({ values, name: file?.name, size: file?.size, modified: file?.lastModified });
    if (retry.current.signature && retry.current.signature !== signature) retry.current.key = crypto.randomUUID();
    retry.current.signature = signature;
    submitting.current = true; setError("");
    try { await send.mutateAsync({ input: { ...values, clientKey: retry.current.key }, upload: source === "PDF" ? file : undefined }); }
    catch (failure) { setError(t(errorMessage(failure, t("Could not send. Your selected PDF and message are retained; try again.")))); }
    finally { submitting.current = false; }
  }
  return <DialogContent className="mentor-manuscript-dialog" data-no-i18n showClose={!busy} closeLabel={t("Close")} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>{t("Send manuscript for feedback")}</DialogTitle><DialogDescription>{props.projectTitle ?? project.data?.title ?? t("Research project")} · {t("Internal mentor review")}</DialogDescription></DialogHeader>
    <form onSubmit={submit} aria-busy={busy} className="mentor-send-form"><fieldset disabled={busy}>
      {title ? <div className="mentor-send-metadata"><strong>{title}</strong><span>{source === "SNAPSHOT" && manuscript ? t(MANUSCRIPT_DOCUMENT_TYPES[manuscript.documentType].label) : "PDF"} · {t("Information from the selected manuscript")}</span></div> : null}
      <fieldset className="mentor-send-source"><legend>{t("Choose content to send")} *</legend>
        <label><input type="radio" name="mentor-send-source" checked={source === "SNAPSHOT"} onChange={() => { reset(); setSource("SNAPSHOT"); }} />{t("Manuscript written on LumiGap (recommended)")}</label>
        <label><input type="radio" name="mentor-send-source" checked={source === "PDF"} onChange={() => { reset(); setSource("PDF"); }} />{t("Upload a PDF from your computer")}</label>
      </fieldset>
      {source === "SNAPSHOT" ? <div className="mentor-send-snapshot">
        {!props.manuscriptId ? <label>{t("Manuscript")}<select required aria-label={t("Manuscript")} value={manuscriptId} onChange={event => { reset(); setChoice(event.target.value); }}><option value="">{t("Select a manuscript")}</option>{manuscripts.data?.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label> : null}
        {manuscripts.isLoading ? <p role="status">{t("Loading manuscripts…")}</p> : manuscripts.error ? <p role="alert">{t("Could not load manuscripts.")} <button type="button" onClick={() => void manuscripts.refetch()}>{t("Retry")}</button></p> : !manuscripts.data?.length ? <p>{t("No LumiGap manuscript yet. Upload a PDF or start writing in Manuscripts.")}</p> : null}
        <p className="mentor-send-hint">{t("A fixed saved version is sent. Your team can continue editing the working draft.")}</p>
        {prepared ? <p>{t("Source revision")} {prepared.version} · LaTeX Snapshot</p> : null}
        <Button type="button" variant="outline" disabled={!manuscript || preparing} onClick={() => void prepare()}>{t(preparing ? "Saving snapshot…" : prepared ? "Prepare PDF again" : "Save snapshot and preview PDF")}</Button>
        {prepared && !successful && !timedOut && !["FAILED", "TIMED_OUT", "BLOCKED"].includes(compilation.data?.latest?.status ?? "") ? <p role="status" aria-busy={compilation.isFetching}>{t("Compiling the selected snapshot…")}</p> : null}
        {prepared && (timedOut && !successful || ["FAILED", "TIMED_OUT", "BLOCKED"].includes(compilation.data?.latest?.status ?? "")) ? <div role="alert"><p>{t("The snapshot did not compile. Your source is retained; fix it and prepare the PDF again.")}</p>{compilation.data?.latest?.diagnostics ? <details><summary>{t("Compiler log")}</summary><pre>{compilation.data.latest.diagnostics}</pre></details> : null}</div> : null}
        {compilation.error || pdf.error ? <p role="alert">{t("Could not load the prepared PDF. Try again.")} <button type="button" onClick={() => void (compilation.error ? compilation.refetch() : pdf.refetch())}>{t("Retry")}</button></p> : null}
      </div> : <label className="mentor-send-upload">{t("Choose PDF manuscript")}<input type="file" accept="application/pdf,.pdf" onChange={event => { const next = event.target.files?.[0]; reset(); retry.current = { signature: "", key: crypto.randomUUID() }; if (!next) { setFile(undefined); return; } if (next.size <= 0 || next.size > 10 * 1024 * 1024 || !next.name.toLowerCase().endsWith(".pdf") || next.type && next.type !== "application/pdf") { setError(t("Use a PDF no larger than 10 MB")); setFile(undefined); return; } setFile(next); }} /><span className="mentor-send-hint">{t("PDF only · maximum 10 MB")}</span></label>}
      {blob ? <details className="mentor-send-preview"><summary>{t("Preview PDF to be shared")}</summary><Suspense fallback={<p role="status">{t("Loading private PDF…")}</p>}><PdfPreview blob={blob} compact zoomable onValidation={setPdfValid} /></Suspense></details> : null}
      <label>{t("Send to lecturer")} *<select required value={mentorId} onChange={event => { setSelectedMentor(event.target.value); setResponses({}); }}><option value="">{t("Select an accepted mentor")}</option>{mentors.data?.map(item => <option key={item.id} value={item.canonicalId ?? item.id}>{item.fullName}</option>)}</select></label>
      {mentors.isLoading ? <p role="status">{t("Loading mentors…")}</p> : mentors.error ? <p role="alert">{t("Could not load mentors.")} <button type="button" onClick={() => void mentors.refetch()}>{t("Retry")}</button></p> : !mentors.data?.length ? <p>{t("No accepted mentor with valid access is available.")} <Link to={`/projects/${projectId}?tab=support`}>{t("Find an advisor")}</Link></p> : <p className="mentor-send-hint">{t("Only accepted mentors with valid access can receive this version.")}</p>}
      {context.error ? <p role="alert">{t("Could not load review history.")} <button type="button" onClick={() => void context.refetch()}>{t("Retry")}</button></p> : null}
      {waiting ? <p className="mentor-send-hint">{t("This mentor has an open review. Sending the same version opens that request; a new version waits for their feedback.")} <Link to={`/projects/${projectId}?tab=submissions&submission=${context.data?.submission?.id}`}>{t("Open submitted version")}</Link></p> : null}
      {items.length ? <fieldset><legend>{t("Respond to requested changes")}</legend>{items.map(item => <label key={item.id}>{item.description}<textarea required maxLength={10000} rows={2} value={responses[item.id] ?? ""} onChange={event => setResponses(current => ({ ...current, [item.id]: event.target.value }))} /></label>)}</fieldset> : null}
      <label>{t("What would your team like feedback on? (optional)")}<textarea rows={3} maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} /></label>
      <p className="mentor-send-hint">{t("The mentor receives this request in Mentor Workspace and can only read and review the version you share. This is internal feedback, not a conference or journal submission.")}</p>
    </fieldset>{error ? <p role="alert" className="text-destructive">{error}</p> : null}
    <footer><Button type="button" variant="outline" disabled={busy} onClick={() => props.onOpenChange(false)}>{t("Cancel")}</Button><Button type="submit" disabled={busy || !mentorId || !pdfValid || !blob || context.isFetching || Boolean(context.error || mentors.error) || items.some(item => !responses[item.id]?.trim())}>{t(send.isPending ? "Sending…" : "Send for mentor feedback")}</Button></footer></form>
  </DialogContent>;
}
