import { useRef, useState } from "react";
import type { ManuscriptSummary } from "@trend/shared-types";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";

export function DeleteManuscript({ projectId, manuscript, onDeleted, onRefresh }: { projectId: string; manuscript: ManuscriptSummary; onDeleted: () => void; onRefresh: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const submitting = useRef(false), version = useRef(manuscript.version);
  if (!manuscript.canDelete) return null;
  return <Dialog open={open} onOpenChange={value => {
    if (submitting.current) return;
    if (value) { version.current = manuscript.version; setError(""); setConflict(false); }
    setOpen(value);
  }}>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="writing-delete-trigger" aria-label={`${t("Delete manuscript")}: ${manuscript.title}`}><Trash2 size={15} aria-hidden="true" />{t("Delete")}</Button></DialogTrigger>
    <DialogContent data-no-i18n showClose={!busy} closeLabel={t("Close")} onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{t("Delete manuscript")}</DialogTitle><DialogDescription>{t("This removes the manuscript from the project and stops shared editing. Versions submitted for academic review are retained.")}</DialogDescription></DialogHeader>
      <p className="writing-delete-title">{manuscript.title}</p>
      {error ? <p role="alert" className="writing-error">{error}</p> : null}
      <div className="writing-actions justify-end"><Button autoFocus variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button variant="destructive" disabled={busy || conflict} onClick={async () => {
        if (submitting.current) return;
        submitting.current = true; setBusy(true); setError("");
        try {
          await manuscriptsApi.remove(projectId, manuscript.id, version.current);
          setOpen(false); onDeleted();
        } catch (failure) {
          const status = (failure as { response?: { status?: number } })?.response?.status;
          if (status === 409) { setConflict(true); onRefresh(); }
          setError(t(status === 409 ? "The manuscript changed. Close this dialog and review the latest version before deleting." : status === 403 || status === 404 ? "You no longer have permission to delete this manuscript. Refresh the list." : "Could not delete the manuscript. Please try again."));
          if (status === 403 || status === 404) onRefresh();
        } finally { submitting.current = false; setBusy(false); }
      }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{t(busy ? "Deleting…" : "Delete manuscript")}</Button></div>
    </DialogContent>
  </Dialog>;
}
