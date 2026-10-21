import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import { fetchBibliography, inspectDropbox, downloadDropbox, uploadDropbox } from "./manuscript-connectors";
import type { RepositoryFile } from "./manuscript-github-client";
type Prepared = { files: RepositoryFile[]; sourceVersion: number; mainFile: string; snapshotId: string };
const base64 = (text: string) => { const bytes = new TextEncoder().encode(text); let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); };
export function ManuscriptIntegrations({ project, manuscript, prepare, onChanged }: { project: string; manuscript: string; prepare: () => Promise<Prepared>; onChanged: () => void }) {
  const { t } = useI18n(), navigate = useNavigate();
  const [open, setOpen] = useState(false), [provider, setProvider] = useState<"ZOTERO" | "MENDELEY" | "DROPBOX">("ZOTERO"), [token, setToken] = useState("");
  const [library, setLibrary] = useState(""), [group, setGroup] = useState(false), [path, setPath] = useState("references-zotero.bib"), [page, setPage] = useState(0);
  const [dropboxPath, setDropboxPath] = useState("/LumiGap/manuscript.zip"), [title, setTitle] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ source: Prepared; text: string; path: string; next?: string; replacing: boolean }>(), [exportPlan, setExportPlan] = useState<{ snapshotId: string; revision: string | null }>();
  const pending = useRef(false), abort = useRef<AbortController>(), key = useRef(crypto.randomUUID());
  useEffect(() => () => abort.current?.abort(), []);
  const clear = () => { setPreview(undefined); setExportPlan(undefined); setMessage(""); key.current = crypto.randomUUID(); };
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (pending.current) return; pending.current = true; setBusy(true); setError(""); setMessage(""); abort.current = new AbortController();
    try { await work(abort.current.signal); } catch { setError(t("Provider operation failed. Check credentials, permissions, file limits and concurrent edits. Your current manuscript is retained.")); }
    finally { pending.current = false; setBusy(false); }
  };
  const load = (next?: string) => run(async signal => {
    if (provider === "DROPBOX" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.bib$/.test(path)) throw new Error();
    const [source, result] = await Promise.all([prepare(), fetchBibliography(provider, token.trim(), library.trim(), group, page, signal, next)]);
    setPreview({ source, path, text: result.content, next: result.next, replacing: source.files.some(file => file.path === path) }); key.current = crypto.randomUUID();
  });
  return <Dialog open={open} onOpenChange={next => { if (busy) return; setOpen(next); clear(); setError(""); if (!next) { abort.current?.abort(); setToken(""); } }}>
    <DialogTrigger asChild><Button size="sm" variant="outline" className="writing-toolbar-trigger" aria-label={t("Integrations")} title={t("Integrations")}><Link2 className="h-4 w-4" /><span>{t("Integrations")}</span></Button></DialogTrigger>
    <DialogContent className="writing-integrations-dialog" closeLabel={t("Close")} showClose={!busy}>
      <DialogTitle>{t("Reference libraries and Dropbox")}</DialogTitle><DialogDescription>{t("Preview before importing. Provider credentials stay in this dialog and clear when closed.")}</DialogDescription>
      <div className="writing-create-form"><fieldset disabled={busy}>
        <label>{t("Provider")}<select value={provider} onChange={event => { const next = event.target.value as typeof provider; setProvider(next); setToken(""); setPage(0); setPath(`references-${next.toLowerCase()}.bib`); clear(); }}><option value="ZOTERO">Zotero</option><option value="MENDELEY">Mendeley</option><option value="DROPBOX">Dropbox</option></select></label>
        <label>{provider === "ZOTERO" ? t("Library API key (optional for public libraries)") : t("Provider access token")}<Input type="password" autoComplete="off" maxLength={3000} value={token} onChange={event => { setToken(event.target.value); clear(); }} /></label>
        {provider !== "DROPBOX" ? <>
          {provider === "ZOTERO" ? <><label>{t("Library ID")}<Input inputMode="numeric" maxLength={15} value={library} onChange={event => { setLibrary(event.target.value); clear(); }} /></label><label className="writing-checkbox"><input type="checkbox" checked={group} onChange={event => { setGroup(event.target.checked); clear(); }} />{t("Group library")}</label><label>{t("Library page (100 items)")}<Input type="number" min={1} max={1001} value={page + 1} onChange={event => { setPage(Number(event.target.value) - 1); clear(); }} /></label></> : null}
          <label>{t("Bibliography file")}<Input maxLength={105} value={path} onChange={event => { setPath(event.target.value); clear(); }} /></label>
          <p className="writing-small">{t("Library metadata is not verified research evidence. Imported keys stay in a separate .bib file; include that file in your bibliography configuration.")}</p>
          <Button size="sm" disabled={busy || provider === "MENDELEY" && !token.trim() || provider === "ZOTERO" && !library.trim()} onClick={() => void load()}>{t("Preview bibliography")}</Button>
          {preview ? <section><p><strong>{preview.path}</strong> · {t(preview.replacing ? "Replace this bibliography file" : "Create bibliography file")}</p><pre className="writing-integration-source">{preview.text}</pre><div className="writing-actions"><Button size="sm" disabled={busy} onClick={() => void run(async () => { const files = preview.source.files.filter(file => file.path !== "lumigap-version.json" && file.path !== preview.path); files.push({ path: preview.path, content: base64(preview.text) }); await manuscriptsApi.syncSource(project, manuscript, { files }, preview.source.mainFile, preview.source.sourceVersion, key.current); clear(); setMessage(t("Bibliography saved. Add its filename to your bibliography configuration, then compile.")); onChanged(); })}>{t("Import displayed bibliography")}</Button>{provider === "MENDELEY" && preview.next ? <Button size="sm" variant="outline" onClick={() => void load(preview.next)}>{t("Next library page")}</Button> : null}</div></section> : null}
        </> : <>
          <label>{t("Dropbox ZIP path")}<Input maxLength={240} value={dropboxPath} onChange={event => { setDropboxPath(event.target.value); clear(); }} /></label>
          <label>{t("Imported manuscript title")}<Input maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <p className="writing-small">{t("Import creates a new draft. Export uploads a sealed source ZIP and refuses to overwrite a changed Dropbox revision.")}</p>
          <div className="writing-actions"><Button size="sm" variant="outline" disabled={busy || !token.trim() || title.trim().length < 2} onClick={() => void run(async signal => { const zip = await downloadDropbox(token.trim(), dropboxPath, signal); const created = await manuscriptsApi.importZip(project, new File([zip], "source.zip", { type: "application/zip" }), title.trim(), "", key.current); setToken(""); setOpen(false); navigate(`/projects/${project}/manuscripts/${created.id}`); })}>{t("Import Dropbox ZIP")}</Button><Button size="sm" disabled={busy || !token.trim()} onClick={() => void run(async signal => { const [source, revision] = await Promise.all([prepare(), inspectDropbox(token.trim(), dropboxPath, signal)]); setExportPlan({ snapshotId: source.snapshotId, revision }); })}>{t("Preview Dropbox export")}</Button></div>
          {exportPlan ? <section><p>{dropboxPath} · {t(exportPlan.revision ? "Replace the inspected Dropbox version" : "Create a new Dropbox ZIP")}</p><Button size="sm" disabled={busy} onClick={() => void run(async signal => { if (!(await manuscriptsApi.detail(project, manuscript)).canWrite) throw new Error(); const blob = await manuscriptsApi.export(project, manuscript, exportPlan.snapshotId); await uploadDropbox(token.trim(), dropboxPath, exportPlan.revision, blob, signal); clear(); setMessage(t("Source ZIP saved to Dropbox.")); })}>{t("Confirm Dropbox export")}</Button></section> : null}
        </>}
      </fieldset></div>
      {busy ? <div className="writing-actions"><p role="status">{t("Loading provider data…")}</p><Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>{t("Cancel")}</Button></div> : null}{error ? <p role="alert" className="writing-error">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    </DialogContent>
  </Dialog>;
}
