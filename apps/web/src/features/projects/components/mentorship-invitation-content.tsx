import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MentorRole, MentorshipAttachment } from "@trend/shared-types";
import { Download, FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";
import { mentorshipError } from "./mentoring-preferences";
import { useUnsavedWorkspace } from "./workspace-common";

type Form = { message: string; mentorRole: MentorRole; attachments: MentorshipAttachment[] };
const fingerprint = (value: Form) => JSON.stringify([value.message, value.mentorRole, value.attachments.map(a => a.id).sort()]);

export function useInvitationContent(projectId: string, direction: string, enabled: boolean, allowedRoles: MentorRole[], recipientId?: string) {
  const cache = useQueryClient(), userId = useAuthStore(s => s.user?.id);
  const queryKey = ["academic-support", userId, "invitation-draft", projectId, direction];
  const draft = useQuery({ queryKey, queryFn: () => academicSupportApi.draft(projectId, direction), enabled, staleTime: 0 });
  // Every async operation retains its own project/user context. A late response
  // must never initialize or overwrite a different project's invitation.
  const session = useMemo(() => ({ projectId, direction, userId, enabled,
    value: { message: "", mentorRole: "PRIMARY", attachments: [] } as Form,
    initialized: false, version: 0, saved: "", queue: Promise.resolve() as Promise<void>, uploading: false,
  }), [projectId, direction, userId, enabled, recipientId]);
  const current = useRef(session); current.current = session;
  const [status, setStatus] = useState<"loading" | "saving" | "saved" | "error">(enabled ? "loading" : "saved");
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [, rerender] = useState(0);
  const persistRef = useRef<() => Promise<void>>(async () => {});
  const ownsSession = () => current.current === session && useAuthStore.getState().user?.id === userId;
  useEffect(() => {
    setStatus(enabled ? "loading" : "saved"); setError(""); setUploadError(""); setUploading(false);
  }, [session, enabled]);
  useEffect(() => {
    if (!enabled || !draft.data || draft.isFetching || session.initialized) return;
    const initial: Form = { message: recipientId ? "" : draft.data.message, attachments: recipientId ? [] : draft.data.attachments, mentorRole: allowedRoles.includes(draft.data.mentorRole) ? draft.data.mentorRole : allowedRoles[0] ?? "PRIMARY" };
    session.initialized = true; session.value = initial; session.version = draft.data.version; session.saved = fingerprint(recipientId ? initial : draft.data);
    rerender(n => n + 1); setStatus("saved"); setError("");
  }, [enabled, draft.data, draft.isFetching, allowedRoles, session]);
  const change = (update: Partial<Form>) => {
    if (current.current !== session) return;
    session.value = { ...session.value, ...update }; rerender(n => n + 1); setError("");
    if (update.attachments) setUploadError("");
  };
  const persist = () => {
    if (!enabled || !session.initialized || !ownsSession()) return Promise.resolve();
    const snapshot = session.value, key = fingerprint(snapshot);
    const job = session.queue.catch(() => {}).then(async () => {
      if (session.saved === key || !ownsSession()) return;
      setStatus("saving"); setError("");
      try {
        const result = await academicSupportApi.saveDraft(projectId, direction, { message: snapshot.message, mentorRole: snapshot.mentorRole, attachmentIds: snapshot.attachments.map(a => a.id), expectedVersion: session.version });
        session.version = result.version; session.saved = key; cache.setQueryData(queryKey, result);
        if (current.current === session) { setStatus("saved"); rerender(n => n + 1); }
      } catch (failure) { if (current.current === session) { setStatus("error"); setError(mentorshipError(failure)); } throw failure; }
    });
    session.queue = job; return job;
  };
  persistRef.current = persist;
  // SPA Back/navigation can unmount the dialog before the debounce fires.
  // Flush only for the original signed-in account; never save after sign-out.
  useEffect(() => () => { void persistRef.current().catch(() => {}); }, []);
  const value = session.value, dirty = enabled && session.initialized && fingerprint(value) !== session.saved;
  useUnsavedWorkspace(dirty || uploading);
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => { void persistRef.current().catch(() => {}); }, 1000);
    return () => window.clearTimeout(timer);
  }, [value, dirty, session]);
  const upload = async (files: FileList | null) => {
    if (!files?.length || session.uploading || !ownsSession()) return;
    const selected = [...files];
    if (session.value.attachments.length + selected.length > 5) { setUploadError("Choose at most five different invitation files"); return; }
    if (selected.some(file => file.size > 5 * 1024 * 1024)) { setUploadError("Use PDF, DOCX, JPEG, PNG or WebP files up to 5 MB"); return; }
    const total = session.value.attachments.reduce((sum, file) => sum + file.byteSize, 0) + selected.reduce((sum, file) => sum + file.size, 0);
    if (total > 20 * 1024 * 1024) { setUploadError("Invitation attachments must total at most 20 MB"); return; }
    session.uploading = true; setUploading(true); setUploadError("");
    try {
      for (const file of selected) {
        if (!ownsSession()) return;
        const attachment = await academicSupportApi.uploadAttachment(projectId, direction, file);
        if (!ownsSession()) return;
        if (!session.value.attachments.some(a => a.id === attachment.id)) {
          if (session.value.attachments.reduce((sum, a) => sum + a.byteSize, attachment.byteSize) > 20 * 1024 * 1024) {
            setUploadError("Invitation attachments must total at most 20 MB"); return;
          }
          change({ attachments: [...session.value.attachments, attachment] });
        }
      }
    } catch (failure) { if (current.current === session) setUploadError(mentorshipError(failure)); }
    finally { session.uploading = false; if (current.current === session) setUploading(false); }
  };
  return { ...value, change, upload, uploading, persist, error: draft.isError ? mentorshipError(draft.error) : error || uploadError, status,
    canReload: draft.isError || status === "error", ready: !enabled || session.initialized, dirty,
    reload: async () => {
      const result = await draft.refetch();
      if (!result.isSuccess || current.current !== session) return;
      session.value = { message: result.data.message, attachments: result.data.attachments,
        mentorRole: allowedRoles.includes(result.data.mentorRole) ? result.data.mentorRole : allowedRoles[0] ?? "PRIMARY" };
      session.initialized = true; session.version = result.data.version; session.saved = fingerprint(result.data);
      setStatus("saved"); setError(""); rerender(n => n + 1);
    } };
}

function InvitationFile({ file, onRemove }: { file: MentorshipAttachment; onRemove?: () => void }) {
  const { t } = useI18n(), [preview, setPreview] = useState<string>(), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!file.mimeType.startsWith("image/")) return;
    let url: string | undefined, disposed = false;
    void academicSupportApi.attachment(file.id).then(blob => {
      if (!disposed) { url = URL.createObjectURL(blob); setPreview(url); }
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [file.id, file.mimeType]);
  const download = async () => {
    setBusy(true); setError(false);
    try {
      const blob = await academicSupportApi.attachment(file.id), url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = file.fileName; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <li className="mentor-invitation-file">
    {preview ? <img src={preview} alt={file.fileName} /> : <FileText size={22} aria-hidden="true" />}
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={file.fileName}>{file.fileName}</p><p className="text-xs text-muted-foreground">{file.byteSize < 1024 ? `${file.byteSize} B` : `${Math.ceil(file.byteSize / 1024)} KB`}</p>{error && <p role="alert" className="text-xs text-destructive">{t("Could not load this attachment. Try again.")}</p>}</div>
    <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`${t("Download attachment")}: ${file.fileName}`} onClick={() => void download()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}</Button>
    {onRemove && <Button type="button" size="icon" variant="ghost" aria-label={`${t("Remove attachment")}: ${file.fileName}`} onClick={onRemove}><X size={16} /></Button>}
  </li>;
}

export function InvitationAttachments({ attachments, onRemove }: { attachments: MentorshipAttachment[]; onRemove?: (id: string) => void }) {
  if (!attachments.length) return null;
  return <ul className="space-y-2">{attachments.map(file => <InvitationFile key={file.id} file={file} onRemove={onRemove ? () => onRemove(file.id) : undefined} />)}</ul>;
}

export function InvitationUpload({ disabled, uploading, onUpload }: { disabled: boolean; uploading: boolean; onUpload: (files: FileList | null) => void }) {
  const { t } = useI18n(), input = useRef<HTMLInputElement>(null);
  return <div className="flex flex-wrap items-center gap-2">
    <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} aria-label={t("Invitation attachments")} accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" disabled={disabled || uploading} onChange={e => { onUpload(e.target.files); e.target.value = ""; }} />
    <Button type="button" size="sm" variant="outline" disabled={disabled || uploading} onClick={() => input.current?.click()}>{uploading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Paperclip size={15} className="mr-2" />}{t(uploading ? "Uploading attachments…" : "Attach images or documents")}</Button>
    <span className="text-xs text-muted-foreground">{t("PDF, DOCX, JPG, PNG, WebP · 5 MB each · 20 MB total · up to 5 files")}</span>
  </div>;
}
