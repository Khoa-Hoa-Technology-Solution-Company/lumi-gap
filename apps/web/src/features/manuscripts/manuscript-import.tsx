import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";

export function ImportManuscript({ project, onImported }: { project: string; onImported: (id: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false), [title, setTitle] = useState(""), [main, setMain] = useState(""), [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<{ id: string; ignoredFiles: string[] }>();
  const key = useRef(crypto.randomUUID()), submitting = useRef(false);
  const resetKey = () => { key.current = crypto.randomUUID(); setError(""); };
  return <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogTrigger asChild><Button variant="outline"><Upload size={16} />{t("Import source ZIP")}</Button></DialogTrigger>
    <DialogContent data-no-i18n closeLabel={t("Close")} showClose={!busy} onInteractOutside={event => { event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{t("Import source ZIP")}</DialogTitle><DialogDescription>{t("Import an Overleaf or LumiGap source project. Your existing manuscripts stay separate.")}</DialogDescription></DialogHeader>
      {result ? <div className="writing-create-form"><p role="status">{t("Manuscript imported.")}</p>{result.ignoredFiles.length ? <><p>{t("Files outside the supported source formats were skipped:")}</p><ul className="writing-import-skipped">{result.ignoredFiles.map(path => <li key={path}><code>{path}</code></li>)}</ul></> : null}<Button onClick={() => { setOpen(false); onImported(result.id); }}>{t("Open editor")}</Button></div> : <form className="writing-create-form" onSubmit={async event => {
        event.preventDefault(); if (!file || submitting.current) return;
        if (file.size > 10_000_000) { setError(t("ZIP must be smaller than 10 MB.")); return; }
        submitting.current = true; setBusy(true); setError("");
        try { const row = await manuscriptsApi.importZip(project, file, title.trim(), main.trim(), key.current); setResult(row); }
        catch (failure) { setError((failure as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? t("Could not import. Check the ZIP and main file path.")); }
        finally { submitting.current = false; setBusy(false); }
      }}><fieldset disabled={busy}><label>{t("Manuscript title")}<Input required minLength={2} maxLength={160} value={title} onChange={event => { setTitle(event.target.value); resetKey(); }} /></label>
        <label>{t("Source ZIP")}<input required type="file" accept=".zip,application/zip" onChange={event => { const next = event.target.files?.[0]; setFile(next); if (!title && next) setTitle(next.name.replace(/\.zip$/i, "").slice(0, 160)); resetKey(); }} /></label>
        <label>{t("Main .tex file (optional)")}<Input placeholder="main.tex" maxLength={240} value={main} onChange={event => { setMain(event.target.value); resetKey(); }} /></label>
        <p className="writing-small">{t("Detects main.tex or the only document class. Up to 200 files and 20 MB extracted. UTF-8 sources, images and PDF figures.")}</p></fieldset>
        {error ? <p role="alert" className="writing-error">{error}</p> : null}<Button type="submit" disabled={busy || !file || title.trim().length < 2}>{t(busy ? "Importing…" : "Import project")}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
}
