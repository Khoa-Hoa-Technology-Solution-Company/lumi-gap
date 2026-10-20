import { confirmUnsavedChanges } from "@/services/confirmation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Y from "yjs";
import type { EditorView } from "@codemirror/view";
import { ArrowLeft, Plus, Upload, Download, History, BookOpen, MessageSquare, ChevronRight, Trash2, Pencil, PanelLeft, PanelRight, MoreHorizontal, X, FileText, Maximize2, Columns3 } from "lucide-react";
import type { ManuscriptFile, ManuscriptComment, ManuscriptSyncState, SnapshotFile, ManuscriptEngine } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { manuscriptsApi, saveDownload } from "./manuscripts.api";
import { ManuscriptProvider } from "./collaboration-provider";
import { SourceEditor, SnapshotSourceEditor, type SourceSelection } from "./source-editor";
import { ManuscriptPanes } from "./manuscript-panes";
import { ManuscriptFileTree } from "./manuscript-file-tree";
import { ManuscriptFeedbackLink } from "./manuscript-feedback-link";
import { ManuscriptPdf } from "./manuscript-pdf";
import { ManuscriptOutline } from "./manuscript-outline";
import { ManuscriptSourceToolbar } from "./manuscript-source-toolbar";
import { sourceLanguage } from "./latex-tools";
import "./manuscripts.css";

const syncLabels: Record<ManuscriptSyncState, string> = { CONNECTING: "Connecting", SYNCING: "Synchronizing", SAVED: "Saved to server", RECONNECTING: "Reconnecting", OFFLINE: "Offline, local edits pending", SYNC_ERROR: "Synchronization error", READ_ONLY: "Read-only" };
const noProvider = { status: "CONNECTING" as ManuscriptSyncState, canWrite: false, ready: false, pending: 0, sequence: 0, fileVersion: 1, error: null };
type Pane = "files" | "editor" | "preview";
type Aside = "preview" | "references" | "comments" | "versions";
export function ManuscriptEditorPage() {
  const { projectId = "", id = "" } = useParams(), navigate = useNavigate(), [searchParams] = useSearchParams();
  const snapshotId = searchParams.get("snapshot") ?? undefined;
  const { t } = useI18n(), client = useQueryClient(), userId = useAuthStore(s => s.user?.id ?? "");
  const key = ["manuscript", userId, projectId, id];
  const detail = useQuery({ queryKey: key, queryFn: () => manuscriptsApi.detail(projectId, id), enabled: !snapshotId, refetchInterval: 15000 });
  const snapshot = useQuery({ queryKey: [...key, "snapshot", snapshotId], queryFn: () => manuscriptsApi.viewSnapshot(projectId, id, snapshotId!), enabled: Boolean(snapshotId) });
  const context = useQuery({ queryKey: [...key, "context"], queryFn: () => manuscriptsApi.context(projectId, id), enabled: !snapshotId && Boolean(detail.data), staleTime: 30000 });
  const comments = useQuery({ queryKey: [...key, "comments", snapshotId], queryFn: () => manuscriptsApi.comments(projectId, id, snapshotId), enabled: Boolean(detail.data || snapshot.data), refetchInterval: 10000 });
  const versions = useQuery({ queryKey: [...key, "versions"], queryFn: () => manuscriptsApi.snapshots(projectId, id), enabled: !snapshotId && Boolean(detail.data) });
  const mentors = useQuery({ queryKey: [...key, "mentors"], queryFn: () => manuscriptsApi.mentors(projectId, id), enabled: !snapshotId && Boolean(detail.data) });
  const compilations = useQuery({ queryKey: [...key, "compilations", snapshotId], queryFn: () => manuscriptsApi.compilations(projectId, id, snapshotId), enabled: Boolean(detail.data || snapshot.data), refetchInterval: query => ["QUEUED", "COMPILING"].includes(query.state.data?.latest?.status ?? "") ? 2000 : 15000 });
  const [engineChoice, setEngine] = useState<ManuscriptEngine>(), [compiling, setCompiling] = useState(false);
  const engine = engineChoice ?? compilations.data?.latest?.engine ?? "pdflatex";
  const [sourceTarget, setSourceTarget] = useState<{ fileId: string; line: number } | null>(null);
  const [fileId, setFileId] = useState(""), [pane, setPane] = useState<Pane>("editor"), [aside, setAside] = useState<Aside>("preview");
  const [filesOpen, setFilesOpen] = useState(true), [asideOpen, setAsideOpen] = useState(true);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [cursor, setCursor] = useState<SourceSelection>({ line: 1, column: 1, length: 0 });
  const onSelection = (next: SourceSelection) => setCursor(current => current.line === next.line && current.column === next.column && current.length === next.length ? current : next);
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [busy, setBusy] = useState(false), [fileForm, setFileForm] = useState<"TEXT" | "FOLDER" | "RENAME" | "DELETE" | null>(null), [path, setPath] = useState("");
  const [filter, setFilter] = useState(""), [note, setNote] = useState(""), [quote, setQuote] = useState<{ fileId: string; quote: string; start: unknown; end: unknown } | undefined>();
  const [commentFilter, setCommentFilter] = useState("ALL"), [commentTarget, setCommentTarget] = useState<ManuscriptComment | null>(null);
  const [label, setLabel] = useState(""), [feedback, setFeedback] = useState(""), [relationship, setRelationship] = useState(""), [authors, setAuthors] = useState<string[]>([]);
  const [noteKey, setNoteKey] = useState(() => crypto.randomUUID()), [snapshotKey, setSnapshotKey] = useState(() => crypto.randomUUID());
  const [fileKey, setFileKey] = useState(() => crypto.randomUUID());
  const providers = useRef(new Map<string, ManuscriptProvider>()), view = useRef<EditorView | null>(null), refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const [, setProviderVersion] = useState(0);
  const files: Array<ManuscriptFile | SnapshotFile> = snapshot.data?.manifest?.files ?? detail.data?.files ?? [];
  const selected = files.find(file => file.id === fileId) ?? files.find(file => file.id === (snapshot.data?.manifest?.mainFileId ?? detail.data?.mainFileId)) ?? files.find(file => file.kind === "TEXT");
  const provider = selected ? providers.current.get(selected.id) : undefined;
  const sync = useSyncExternalStore(provider?.subscribe ?? (() => () => {}), provider?.getSnapshot ?? (() => noProvider));
  const canWrite = Boolean(!snapshotId && detail.data?.canWrite);
  const canComment = snapshotId ? Boolean(snapshot.data?.canComment) : canWrite;
  const title = snapshot.data?.manifest?.title ?? detail.data?.title;
  const refresh = () => { clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(() => { void client.invalidateQueries({ queryKey: key, exact: true }); }, 250); };
  useEffect(() => {
    if (!selected || selected.kind !== "TEXT" || snapshotId || !detail.data || !userId) return;
    if (!providers.current.has(selected.id)) {
      for (const [other, existing] of providers.current) if (other !== selected.id && !existing.getSnapshot().pending && providers.current.size >= 12) { existing.destroy(); providers.current.delete(other); }
      const next = new ManuscriptProvider(projectId, id, selected.id, userId, refresh);
      next.subscribe(() => setProviderVersion(value => value + 1));
      providers.current.set(selected.id, next); setProviderVersion(value => value + 1);
    }
    // Canonical identity, not the mutable filename, binds the room.
  }, [selected?.id, selected?.kind, snapshotId, userId, projectId, id, Boolean(detail.data)]);
  useEffect(() => {
    const collection = providers.current;
    const warn = (event: BeforeUnloadEvent) => { if ([...collection.values()].some(p => p.getSnapshot().pending)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { clearTimeout(refreshTimer.current); window.removeEventListener("beforeunload", warn); for (const p of collection.values()) p.destroy(); collection.clear(); };
  }, [id, projectId, userId]);
  useEffect(() => {
    if (!detail.data) return;
    const live = new Set(detail.data.files.map(f => f.id));
    for (const [file, p] of providers.current) if (!live.has(file) && !p.getSnapshot().pending) { p.destroy(); providers.current.delete(file); }
  }, [detail.data]);
  useEffect(() => {
    if (!commentTarget || selected?.id !== commentTarget.context.fileId || !view.current || !sync.ready || !provider) return;
    let range: { from: number; to: number } | undefined;
    try {
      if (commentTarget.context.start && commentTarget.context.end) {
        const from = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(commentTarget.context.start as Parameters<typeof Y.createRelativePositionFromJSON>[0]), provider.doc);
        const to = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(commentTarget.context.end as Parameters<typeof Y.createRelativePositionFromJSON>[0]), provider.doc);
        if (from && to && to.index > from.index && provider.text.toString().slice(from.index, to.index).slice(0, 1000) === commentTarget.context.quote) range = { from: from.index, to: to.index };
      }
    } catch { /* A removed selection retains its historical quote. */ }
    if (range) { view.current.dispatch({ selection: { anchor: range.from, head: range.to }, scrollIntoView: true }); view.current.focus(); }
    else setSuccess(t("Historical quote; verify current context"));
    setCommentTarget(null);
  }, [commentTarget, selected?.id, sync.ready, provider, t]);
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(""); setSuccess(""); try { await work(); return true; } catch { setError(t("The operation failed. Your changes are retained; refresh and try again.")); return false; } finally { setBusy(false); } };
  const flush = async () => { await Promise.all([...providers.current.values()].map(p => p.waitForSaved())); };
  const exportSource = () => run(async () => { if (!snapshotId) await flush(); saveDownload(await manuscriptsApi.export(projectId, id, snapshotId), "manuscript-source.zip"); });
  const localRecovery = () => { if (provider) saveDownload(new Blob([provider.text.toString()], { type: "text/plain;charset=utf-8" }), selected?.path.split("/").pop() ?? "unsaved-source.tex"); };
  const openSide = (side: Aside) => { setAside(side); setAsideOpen(true); setPane("preview"); };
  const addCitation = (paperId: string) => run(async () => {
    if (!provider || !sync.canWrite) throw new Error("CITATION_NOT_READY");
    const active = view.current;
    await flush();
    const { key: citation } = await manuscriptsApi.insertCitation(projectId, id, paperId);
    if (!active || active !== view.current) return;
    active.dispatch({ changes: { from: active.state.selection.main.from, to: active.state.selection.main.to, insert: `\\cite{${citation}}` } }); active.focus(); setPane("editor");
  });
  const createSnapshot = () => run(async () => { await flush(); const minimumSequences = Object.fromEntries([...providers.current.entries()].map(([file, p]) => [file, p.getSnapshot().sequence])); await manuscriptsApi.snapshot(projectId, id, { label: label.trim(), clientKey: snapshotKey, minimumSequences }); setLabel(""); setSnapshotKey(crypto.randomUUID()); await versions.refetch(); });
  const compile = () => run(async () => {
    setCompiling(true); openSide("preview");
    try {
      await flush();
      const minimumSequences = Object.fromEntries([...providers.current.entries()].map(([file, p]) => [file, p.getSnapshot().sequence]));
      const sealed = await manuscriptsApi.snapshot(projectId, id, { label: `PDF · ${new Date().toISOString()}`, clientKey: crypto.randomUUID(), minimumSequences, reuseUnchanged: true });
      await manuscriptsApi.compile(projectId, id, sealed.id, engine);
      await compilations.refetch(); await versions.refetch();
    } finally { setCompiling(false); }
  });
  useEffect(() => {
    if (!sourceTarget || selected?.id !== sourceTarget.fileId || (!snapshotId && !sync.ready) || !view.current) return;
    const editor = view.current, position = editor.state.doc.line(Math.max(1, Math.min(sourceTarget.line, editor.state.doc.lines))).from;
    editor.dispatch({ selection: { anchor: position }, scrollIntoView: true }); editor.focus(); setSourceTarget(null);
  }, [sourceTarget, selected?.id, sync.ready, snapshotId]);
  const comment = () => run(async () => { await manuscriptsApi.comment(projectId, id, { body: note.trim(), clientKey: noteKey, fileId: selected?.id, snapshotId, ...quote }); setNote(""); setQuote(undefined); setNoteKey(crypto.randomUUID()); await comments.refetch(); });
  const fileOperation = () => run(async () => {
    if (fileForm === "TEXT" || fileForm === "FOLDER") await manuscriptsApi.createFile(projectId, id, path, fileForm, fileKey);
    else if (selected && "version" in selected) await manuscriptsApi.changeFile(projectId, id, selected.id, { expectedVersion: selected.version, ...(fileForm === "DELETE" ? { delete: true } : { path }) });
    setFileForm(null); setPath(""); setFileKey(crypto.randomUUID()); await detail.refetch();
  });
  const uploaded = (upload: File | undefined) => { if (!upload) return; if (upload.size > 5_000_000) { setError(t("Choose an image smaller than 5 MB.")); return; } void run(async () => { const replace = selected?.kind === "ASSET" && "version" in selected ? selected : undefined; await manuscriptsApi.upload(projectId, id, upload, replace?.path ?? `figures/${upload.name}`, replace); await detail.refetch(); }); };
  if ((snapshotId ? snapshot.isLoading : detail.isLoading)) return <div className="writing-skeleton" aria-busy="true">{t("Loading manuscript…")}</div>;
  if ((snapshotId ? snapshot.error : detail.error) || !title) return <section className="writing-notice"><h1>{t("Manuscript unavailable")}</h1><p>{t("This manuscript or version is unavailable, or your access has ended.")}</p><Link to={`/projects/${projectId}?tab=manuscripts`}>{t("Back to project")}</Link></section>;
  const online = provider ? [...provider.awareness.getStates()].filter(([, state]) => state.user).map(([clientId, state]) => ({ clientId, user: state.user as { id: string; name: string; color: string } })) : [];
  const pendingAny = [...providers.current.values()].some(p => p.getSnapshot().pending > 0);
  const compileRunning = compiling || ["QUEUED", "COMPILING"].includes(compilations.data?.latest?.status ?? "");
  const confirmNavigation = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!pendingAny || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = new URL(event.currentTarget.href);
    if (await confirmUnsavedChanges()) navigate(destination.pathname + destination.search + destination.hash);
  };
  const displayedSync = pendingAny && sync.status === "SAVED" ? "SYNCING" : sync.status;
  const selectFile = (target: string) => {
    setFileId(target);
    if (files.find(file => file.id === target)?.kind !== "FOLDER") {
      setOpenFiles(current => current.includes(target) ? current : [...current, target]);
      setPane("editor");
    }
  };
  const mainFileId = snapshot.data?.manifest?.mainFileId ?? detail.data?.mainFileId;
  const tabs = [...new Set([mainFileId, ...openFiles, selected?.id])].flatMap(target => {
    const file = files.find(file => file.id === target && file.kind !== "FOLDER");
    return file ? [file] : [];
  });
  const commentSelection = () => {
    const range = view.current?.state.selection.main;
    if (!range || range.empty || !provider || !sync.canWrite) return;
    setQuote({ fileId: provider.fileId, quote: provider.text.toString().slice(range.from, range.to).slice(0, 1000), start: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(provider.text, range.from)), end: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(provider.text, range.to)) });
    openSide("comments");
  };
  const cited = provider ? [...provider.text.toString().matchAll(/\\cite(?:[A-Za-z]*)\{([^}]+)\}/g)].flatMap(match => match[1]!.split(",")) : [];
  const bibliography = files.find(f => f.path === "references.bib"), bibContent = bibliography ? providers.current.get(bibliography.id)?.text.toString() : undefined;
  const missing = bibContent === undefined ? [] : cited.filter(c => !new RegExp(`@[A-Za-z]+\\s*\\{\\s*${c.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,`).test(bibContent));
  return <div className="writing-workspace" data-no-i18n>
    <nav className="writing-breadcrumbs" aria-label={t("Manuscript navigation")}><Link to={`/projects/${projectId}`} onClick={confirmNavigation}>{t("Project")}</Link><ChevronRight aria-hidden="true" /><Link to={`/projects/${projectId}?tab=manuscripts`} onClick={confirmNavigation}>{t("Manuscripts")}</Link><ChevronRight aria-hidden="true" /><span>{title}</span></nav>
    <header className="writing-toolbar"><div className="writing-title"><Link aria-label={t("Back to project")} to={`/projects/${projectId}?tab=manuscripts`} onClick={confirmNavigation}><ArrowLeft className="h-4 w-4" /></Link><div><h1 title={title}>{title}</h1><span className="writing-draft-label">{snapshotId ? `${t("Immutable version")} · ${snapshot.data?.label}` : t("Working draft")}</span></div></div>
      <div className="writing-online" aria-label={t("Online collaborators")}>{online.map(person => <span key={person.clientId} title={person.user.name} style={{ borderColor: person.user.color }} aria-label={person.user.name}>{person.user.name.split(" ").map(part => part[0]).join("").slice(0, 2)}</span>)}</div>
      <span role="status" className={`writing-sync ${displayedSync === "SAVED" ? "is-saved" : ""}`}>{snapshotId ? t("Read-only") : pendingAny || selected?.kind === "TEXT" ? t(syncLabels[displayedSync]) : t("Persisted file")}</span>
      <div className="writing-toolbar-actions">
        <Button size="sm" variant="ghost" aria-label={t("Comments")} aria-pressed={asideOpen && aside === "comments"} onClick={() => openSide("comments")}><MessageSquare className="h-4 w-4" /><span>{t("Comments")}</span>{comments.data?.filter(thread => thread.status === "OPEN").length ? <small className="writing-count">{comments.data.filter(thread => thread.status === "OPEN").length}</small> : null}</Button>
        <Button size="sm" variant="ghost" aria-label={t("Version history")} aria-pressed={asideOpen && aside === "versions"} onClick={() => openSide("versions")} disabled={Boolean(snapshotId)}><History className="h-4 w-4" /><span>{t("Version history")}</span></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" aria-label={t("Workspace layout")}><Columns3 className="h-4 w-4" /><span>{t("Layout")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" data-no-i18n>
          <DropdownMenuItem onSelect={() => { setFilesOpen(true); setAsideOpen(true); setAside("preview"); setPane("editor"); }}>{t("Editor and PDF")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setFilesOpen(false); setAsideOpen(false); setPane("editor"); }}>{t("Focus on writing")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFilesOpen(open => !open)}>{t("Toggle files panel")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setAsideOpen(open => !open); setPane(asideOpen ? "editor" : "preview"); }}>{t("Toggle information panel")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" aria-label={t("Manuscript actions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" data-no-i18n>
          <DropdownMenuItem onSelect={() => void exportSource()} disabled={busy}><Download />{t("Export source")}</DropdownMenuItem>
          {selected?.kind === "TEXT" && !snapshotId ? <DropdownMenuItem disabled={busy} onSelect={() => void run(async () => { await flush(); saveDownload(await manuscriptsApi.downloadAsset(projectId, id, selected.id), selected.path.split("/").pop()!); })}><Download />{t("Download file")}</DropdownMenuItem> : null}
          <DropdownMenuItem onSelect={() => openSide("references")} disabled={Boolean(snapshotId)}><BookOpen />{t("Research context")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { setFilesOpen(false); setAsideOpen(false); setPane("editor"); }}><Maximize2 />{t("Focus on writing")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <div className="writing-compile-action"><label className="sr-only" htmlFor="writing-tex-engine">{t("LaTeX engine")}</label><select id="writing-tex-engine" value={engine} disabled={!canWrite || compileRunning} onChange={event => setEngine(event.target.value as ManuscriptEngine)}><option value="pdflatex">pdfLaTeX</option><option value="xelatex">XeLaTeX</option></select><Button size="sm" aria-label={t("Compile PDF")} disabled={!canWrite || !detail.data?.compiler.available || busy || compileRunning} onClick={() => void compile()}><FileText className="h-4 w-4" />{t(compileRunning ? "Compiling PDF…" : "Compile PDF")}</Button></div>
      </div>
    </header>
    {error ? <div role="alert" className="writing-error">{error}</div> : null}
    {success ? <div role="status" className="writing-notice">{success}</div> : null}
    {snapshot.data?.formalAssignmentId ? <div className="writing-notice"><Link to={`/reviews/${snapshot.data.formalAssignmentId}`}>{t("Open formal review workspace")}</Link></div> : null}
    {[...providers.current.entries()].filter(([file, p]) => !files.some(f => f.id === file) && p.getSnapshot().pending).map(([file, p]) => <div key={file} role="alert" className="writing-notice"><p>{t("A file was removed while this tab had unsaved edits.")}</p><Button size="sm" variant="outline" onClick={() => saveDownload(new Blob([p.text.toString()], { type: "text/plain;charset=utf-8" }), "recovered-source.tex")}>{t("Download unsaved file")}</Button></div>)}
    {sync.error ? <div role="alert" className="writing-notice"><p>{t("Synchronization is interrupted. Unsaved edits remain in this tab.")}</p><Button size="sm" variant="outline" onClick={localRecovery}>{t("Download unsaved file")}</Button></div> : null}
    {!canWrite && !snapshotId ? <p className="writing-notice">{t("This manuscript is read-only.")}</p> : null}
    <nav className="writing-mobile-tabs" aria-label={t("Writing panels")}>{(["files", "editor", "preview"] as Pane[]).map(tab => <button key={tab} aria-pressed={pane === tab} onClick={() => setPane(tab)}>{t(tab === "files" ? "Files" : tab === "editor" ? "Editor" : "Preview")}</button>)}</nav>
    <div className="writing-viewbar"><div><Button size="sm" variant="ghost" aria-label={t("Toggle files panel")} aria-expanded={filesOpen} aria-controls="writing-files" onClick={() => setFilesOpen(open => !open)}><PanelLeft className="h-4 w-4" />{t("Files")}</Button><span className="writing-file-total">{files.filter(file => file.kind !== "FOLDER").length} {t("files")}</span></div><div><Button size="sm" variant="ghost" aria-label={t("Research context")} aria-pressed={asideOpen && aside === "references"} disabled={Boolean(snapshotId)} onClick={() => openSide("references")}><BookOpen className="h-4 w-4" />{t("Research context")}</Button><Button size="sm" variant="ghost" aria-label={t("Toggle information panel")} aria-expanded={asideOpen} aria-controls="writing-aside" onClick={() => setAsideOpen(open => !open)}><PanelRight className="h-4 w-4" />{t(aside === "preview" ? "PDF preview" : aside === "comments" ? "Comments" : aside === "versions" ? "Version history" : "Research context")}</Button></div></div>
    <ManuscriptPanes filesOpen={filesOpen} asideOpen={asideOpen} activePane={pane} files={
      <aside id="writing-files" className="writing-files" aria-label={t("Project files")}><header><h2>{t("Project files")}</h2>{canWrite ? <button aria-label={t("Create source file")} onClick={() => { setFileForm("TEXT"); setPath(""); setFileKey(crypto.randomUUID()); }}><Plus className="h-4 w-4" /></button> : null}</header>
        {canWrite ? <div className="writing-file-actions"><button onClick={() => { setFileForm("FOLDER"); setPath(""); }}>{t("New folder")}</button><label className="writing-upload"><Upload className="h-3 w-3" />{selected?.kind === "ASSET" ? t("Replace image") : t("Upload image")}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { uploaded(event.target.files?.[0]); event.target.value = ""; }} /></label></div> : null}
        {fileForm ? <form className="writing-file-form" onSubmit={event => { event.preventDefault(); void fileOperation(); }}><strong>{t(fileForm === "DELETE" ? "Delete selected file?" : fileForm === "RENAME" ? "Rename or move file" : fileForm === "FOLDER" ? "Create folder" : "Create source file")}</strong>{fileForm === "DELETE" ? <p>{t("The live file will be removed. Its saved history and existing snapshots are retained.")}</p> : <Input aria-label={t("File path")} required value={path} maxLength={240} placeholder={fileForm === "FOLDER" ? "figures" : "sections/discussion.tex"} onChange={e => setPath(e.target.value)} />}<div className="writing-actions"><Button size="sm" disabled={busy || (fileForm !== "DELETE" && !path)}>{t(fileForm === "DELETE" ? "Delete" : "Confirm")}</Button><Button size="sm" type="button" variant="ghost" onClick={() => setFileForm(null)}>{t("Cancel")}</Button></div></form> : null}
        <ManuscriptFileTree files={files} selectedId={selected?.id} mainFileId={detail.data?.mainFileId ?? snapshot.data?.manifest?.mainFileId} onSelect={selectFile} />
        {canWrite && selected && "version" in selected ? <footer><Button size="sm" variant="ghost" onClick={() => { setFileForm("RENAME"); setPath(selected.path); }}><Pencil className="h-3 w-3" />{t("Rename / move")}</Button><Button size="sm" variant="ghost" onClick={() => setFileForm("DELETE")}><Trash2 className="h-3 w-3" />{t("Delete")}</Button>{selected.kind === "TEXT" && selected.path.endsWith(".tex") ? <Button size="sm" variant="ghost" disabled={selected.id === detail.data?.mainFileId || busy} onClick={() => void run(async () => { await manuscriptsApi.changeFile(projectId, id, selected.id, { expectedVersion: selected.version, main: true }); await detail.refetch(); })}>{t("Set main file")}</Button> : null}</footer> : null}
        {selected?.kind === "TEXT" && selected.path.endsWith(".tex") ? <ManuscriptOutline provider={provider} text={snapshotId ? (selected as SnapshotFile).text ?? "" : ""} activeLine={cursor.line} onNavigate={line => { setSourceTarget({ fileId: selected.id, line }); setPane("editor"); }} /> : null}
      </aside>} editor={
      <section className="writing-source" aria-label={t("Editor")}>
        <header className="writing-file-tabs" role="tablist" aria-label={t("Open files")}>{tabs.map(file => <div className={`writing-file-tab ${selected?.id === file.id ? "is-active" : ""}`} key={file.id}><button role="tab" tabIndex={selected?.id === file.id ? 0 : -1} aria-selected={selected?.id === file.id} aria-controls="writing-source-document" title={file.path} onClick={() => selectFile(file.id)} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const index = tabs.findIndex(tab => tab.id === file.id);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          selectFile(tabs[next]!.id);
          event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}><FileText aria-hidden="true" /><span>{file.path.split("/").pop()}</span></button>{file.id !== mainFileId ? <button aria-label={t("Close file {{name}}", { name: file.path })} onClick={() => { setOpenFiles(current => current.filter(id => id !== file.id)); if (selected?.id === file.id) setFileId(mainFileId ?? tabs.find(tab => tab.id !== file.id)?.id ?? ""); }}><X /></button> : null}</div>)}</header>
        <ManuscriptSourceToolbar filename={selected?.path ?? ""} getView={() => view.current} canEdit={Boolean(provider && sync.canWrite)} canSearch={selected?.kind === "TEXT" && (Boolean(snapshotId) || sync.ready)} canComment={Boolean(provider && sync.canWrite && cursor.length)} onComment={commentSelection} />
        <div id="writing-source-document" className="writing-source-document">
        {selected?.kind === "TEXT" ? snapshotId ? <SnapshotSourceEditor text={(selected as SnapshotFile).text ?? ""} filename={selected.path} onSelection={onSelection} onView={instance => { view.current = instance; }} /> : <SourceEditor provider={provider} filename={selected.path} citationKeys={context.data?.references.map(r => r.citationKey) ?? []} onView={instance => { view.current = instance; }} onSelection={onSelection} /> : <div className="writing-empty"><p>{selected?.kind === "ASSET" ? t("Images are stored separately from collaborative source.") : t("Select a source file to start writing.")}</p>{selected?.kind === "ASSET" && !snapshotId ? <Button variant="outline" onClick={() => void run(async () => saveDownload(await manuscriptsApi.downloadAsset(projectId, id, selected.id), selected.path.split("/").pop()!))}>{t("Download image")}</Button> : null}</div>}
        </div>
        <footer className="writing-editor-status"><span>{selected?.kind === "TEXT" ? t("Line {{line}}, Col {{column}}", { line: cursor.line, column: cursor.column }) : t("Select a file")}</span><span>{t(sourceLanguage(selected?.path ?? ""))} · {t(snapshotId || !canWrite ? "Read-only" : "Auto-save")}</span></footer>
      </section>} aside={
      <aside id="writing-aside" className="writing-aside" aria-label={t("Context panel")}><header><label className="sr-only" htmlFor="writing-context-panel">{t("Context panel")}</label><select id="writing-context-panel" value={aside} onChange={e => setAside(e.target.value as Aside)}><option value="preview">{t("PDF preview")}</option>{!snapshotId ? <option value="references">{t("Research context")}</option> : null}<option value="comments">{t("Comments")}</option>{!snapshotId ? <option value="versions">{t("Version history")}</option> : null}</select><button className="writing-collapse-aside" aria-label={t("Hide information panel")} onClick={() => { setAsideOpen(false); setPane("editor"); }}><X className="h-4 w-4" /></button></header>
        {aside === "preview" ? compilations.error ? <div role="alert" className="writing-notice"><p>{t("Could not load the PDF. Check your access and try again.")}</p><Button size="sm" variant="outline" onClick={() => void compilations.refetch()}>{t("Try again")}</Button></div> : <ManuscriptPdf projectId={projectId} id={id} userId={userId} state={compilations.data} sourceVersion={snapshot.data?.sourceVersion ?? detail.data?.version} pending={pendingAny} available={canWrite && Boolean(detail.data?.compiler.available)} compiling={compiling} onCompile={() => void compile()} onSource={(path, line) => { const target = files.find(file => file.path === path); if (target) { setFileId(target.id); setSourceTarget({ fileId: target.id, line }); setPane("editor"); } }} /> : null}
        {aside === "references" ? <div className="writing-context"><Input aria-label={t("Search project references")} placeholder={t("Search project references")} value={filter} onChange={e => setFilter(e.target.value)} /><h2>{t("Project literature")}</h2>{context.isLoading ? <p>{t("Loading references…")}</p> : context.error ? <p className="writing-error">{t("Could not load research context.")}</p> : context.data?.references.filter(p => `${p.title} ${p.authors.join(" ")}`.toLowerCase().includes(filter.toLowerCase())).map(p => <article key={p.id}><h3>{p.title}</h3><p>{p.authors.join(", ")}{p.year ? ` (${p.year})` : ""}</p>{p.doi ? <small>DOI: {p.doi}</small> : null}<code>{p.citationKey}</code><Button size="sm" variant="outline" disabled={!sync.canWrite || busy || selected?.path.endsWith(".bib")} onClick={() => void addCitation(p.id)}>{t("Insert citation")}</Button></article>)}{missing.length ? <p role="alert" className="writing-error">{t("Missing citation keys")}: {missing.join(", ")}</p> : null}
          <h2>{t("Research questions")}</h2><p>{context.data?.plan?.objective || t("No research plan recorded.")}</p>{Array.isArray(context.data?.plan?.questions) ? context.data.plan.questions.map((q: unknown, index: number) => <p key={index}>{typeof q === "string" ? q : q && typeof q === "object" ? String((q as { question?: string; text?: string }).question ?? (q as { text?: string }).text ?? "") : ""}</p>) : null}
          <h2>{t("Research gaps")}</h2><p className="writing-small">{t("Gap candidates and evidence are research context, not established scientific conclusions.")}</p>{context.data?.gaps.map(g => <details key={g.id}><summary>{g.title}</summary><p>{g.description}</p><span>{t(g.status)}</span>{g.limitations ? <p>{g.limitations}</p> : null}<Link to={`/projects/${projectId}?tab=gaps`} target="_blank" rel="noreferrer">{t("Open related research gap")}</Link></details>)}
          <h2>{t("Supporting evidence and limitations")}</h2>{context.data?.evidence.map(e => <details key={e.id}><summary>{e.claim}</summary><p>{e.interpretation}</p><p>{t(e.evidenceRole)}</p><p>{e.limitations}</p><span>{t(e.status)}</span></details>)}
        </div> : null}
        {aside === "comments" ? <div className="writing-context"><h2>{t("Manuscript comments")}</h2><p className="writing-small">{snapshotId ? t("Feedback stays attached to this immutable version.") : t("Selections use collaborative anchors. Removed text is shown as a historical quote.")}</p>{comments.error ? <p className="writing-error">{t("Could not load comments.")}</p> : null}<label>{t("Filter comments")}<select value={commentFilter} onChange={e => setCommentFilter(e.target.value)}><option value="ALL">{t("All comments")}</option><option value="OPEN">{t("Open")}</option><option value="RESOLVED">{t("Resolved")}</option></select></label>{comments.data?.filter(thread => commentFilter === "ALL" || thread.status === commentFilter).map(thread => <CommentThread key={thread.id} thread={thread} provider={provider} canResolve={snapshotId ? Boolean(snapshot.data?.canResolve) : canWrite} canReply={canComment} onNavigate={target => { setFileId(target); setCommentTarget(thread); setPane("editor"); }} onReply={(body, clientKey) => run(async () => { await manuscriptsApi.reply(projectId, thread.id, body, clientKey); await comments.refetch(); })} onResolve={conclusion => run(async () => { await manuscriptsApi.resolve(projectId, thread.id, thread.status === "OPEN" ? "RESOLVED" : "OPEN", thread.version, conclusion); await comments.refetch(); })} />)}
          {canComment ? <form onSubmit={event => { event.preventDefault(); void comment(); }}><label>{t("Add comment")}<textarea value={note} maxLength={5000} onChange={e => setNote(e.target.value)} required /></label>{quote?.quote ? <blockquote>{quote.quote}</blockquote> : null}<Button size="sm" disabled={busy || !note.trim()}>{t("Post comment")}</Button></form> : <p>{t("This version is read-only. Use your assigned formal review workspace to submit an evaluation.")}</p>}
        </div> : null}
        {aside === "versions" ? <div className="writing-context"><h2>{t("Immutable source versions")}</h2><p className="writing-small">{t("Snapshots include server-persisted files. Unsynchronized edits must finish saving first.")}</p>{canWrite ? <form onSubmit={event => { event.preventDefault(); void createSnapshot(); }}><label>{t("Snapshot name")}<Input value={label} maxLength={160} onChange={e => setLabel(e.target.value)} required /></label><Button size="sm" disabled={busy || !label.trim() || pendingAny}>{t("Create snapshot")}</Button></form> : null}
          {versions.error ? <p className="writing-error">{t("Could not load version history.")}</p> : versions.data?.map(version => <article key={version.id}><h3>{version.label}</h3><p>{t("Source revision")} {version.sourceVersion} · {version.createdBy.name}</p><small>{new Date(version.createdAt).toLocaleString()}</small><div className="writing-actions">{version.submissionId ? <Link to={`/submissions/${version.submissionId}`}>{t("Open submitted version")}</Link> : null}<Link to={`?snapshot=${version.id}`}>{t("View version")}<ChevronRight className="h-3 w-3" /></Link>{canWrite ? <button disabled={busy} onClick={() => void run(async () => { await flush(); const restored = await manuscriptsApi.restore(projectId, id, version.id, `${title.slice(0, 125)} (${version.label.slice(0, 20)})`, crypto.randomUUID()); navigate(`/projects/${projectId}/manuscripts/${restored.id}`); })}>{t("Restore as new draft")}</button> : null}</div>
            {canWrite ? <details><summary>{t("Request mentor feedback")}</summary><label>{t("Project mentor")}<select value={relationship} onChange={e => setRelationship(e.target.value)}><option value="">{t("Select a mentor")}</option>{mentors.data?.map(m => <option key={m.id} value={m.id}>{m.mentor.name}</option>)}</select></label><label>{t("Questions for the mentor")}<textarea value={feedback} maxLength={5000} onChange={e => setFeedback(e.target.value)} /></label><Button size="sm" disabled={busy || !relationship || !feedback.trim()} onClick={() => void run(async () => { await manuscriptsApi.comment(projectId, id, { body: feedback.trim(), clientKey: crypto.randomUUID(), snapshotId: version.id, mentorRelationshipId: relationship }); setFeedback(""); setSuccess(t("Feedback request sent for this version.")); })}>{t("Send feedback request")}</Button></details> : null}
            {canWrite ? <details><summary>{t("Request formal academic review")}</summary><p className="writing-small">{t("Declare authors explicitly. This seals the source for the existing academic review workflow; mentor comments remain separate.")}</p>{detail.data?.collaborators.map(person => <label className="writing-checkbox" key={person.id}><input type="checkbox" checked={authors.includes(person.id)} onChange={event => setAuthors(value => event.target.checked ? [...value, person.id] : value.filter(id => id !== person.id))} />{person.name}</label>)}<Button size="sm" disabled={busy || !authors.length} onClick={() => void run(async () => { await flush(); const sealed = await manuscriptsApi.publish(projectId, id, version.id, authors); navigate(`/submissions/${sealed.submissionId}`); })}>{t("Seal version for review")}</Button></details> : null}
          </article>)}
        </div> : null}
      </aside>} />
    <footer className="writing-statusbar"><span>{snapshotId ? t("Immutable version") : t("Source sync") + ": " + (pendingAny || selected?.kind === "TEXT" ? t(syncLabels[displayedSync]) : t("Persisted file"))}</span>{!snapshotId && detail.data?.latestFeedback ? <ManuscriptFeedbackLink projectId={projectId} manuscriptId={id} feedback={detail.data.latestFeedback} onClick={confirmNavigation} /> : null}<span>{t("PDF")}: {t(compileRunning ? "Compiling PDF…" : compilations.data?.latest?.status === "TIMED_OUT" ? "PDF compilation timed out" : compilations.data?.latest?.status === "FAILED" ? "PDF compilation failed" : compilations.data?.successful ? "Compiled" : "Not compiled")}</span><span>{snapshotId ? `${t("Source revision")} ${snapshot.data?.sourceVersion}` : `${t("Source revision")} ${detail.data?.version}`}</span></footer>
  </div>;
}

function CommentThread({ thread, provider, canResolve, canReply, onNavigate, onReply, onResolve }: { thread: ManuscriptComment; provider?: ManuscriptProvider; canResolve: boolean; canReply: boolean; onNavigate: (file: string) => void; onReply: (body: string, key: string) => Promise<boolean>; onResolve: (conclusion: string) => Promise<boolean> }) {
  const { t } = useI18n(); const [replyBusy, setReplyBusy] = useState(false); const [reply, setReply] = useState(""), [conclusion, setConclusion] = useState(""), [key, setKey] = useState(() => crypto.randomUUID());
  let anchored = false;
  if (provider && provider.fileId === thread.context.fileId && thread.context.start && thread.context.end) {
    try { const start = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(thread.context.start as Parameters<typeof Y.createRelativePositionFromJSON>[0]), provider.doc), end = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(thread.context.end as Parameters<typeof Y.createRelativePositionFromJSON>[0]), provider.doc); anchored = Boolean(start && end && end.index > start.index && provider.text.toString().slice(start.index, end.index).slice(0, 1000) === thread.context.quote); } catch { anchored = false; }
  }
  return <article className="writing-comment"><div><strong>{thread.author.name}</strong><span>{t(thread.status === "OPEN" ? "Open" : "Resolved")}</span></div><p>{thread.body}</p>{thread.context.quote ? <blockquote>{thread.context.quote}<small>{t(anchored ? "Selection anchor available" : "Historical quote; verify current context")}</small></blockquote> : null}{thread.context.fileId ? <button onClick={() => onNavigate(thread.context.fileId!)}>{t("Open commented file")}</button> : null}{thread.messages.map(message => <div className="writing-reply" key={message.id}><strong>{message.author.name}</strong><p>{message.body}</p></div>)}{canReply && thread.status === "OPEN" ? <form onSubmit={event => { event.preventDefault(); if (replyBusy || !reply.trim()) return; setReplyBusy(true); void onReply(reply.trim(), key).then(saved => { if (saved) { setReply(""); setKey(crypto.randomUUID()); } }).finally(() => setReplyBusy(false)); }}><label>{t("Reply")}<Input value={reply} disabled={replyBusy} maxLength={5000} onChange={e => setReply(e.target.value)} required /></label><Button size="sm" variant="outline" disabled={replyBusy || !reply.trim()}>{t("Send reply")}</Button></form> : null}{canResolve ? <div>{thread.status === "OPEN" ? <Input aria-label={t("Resolution summary")} placeholder={t("Resolution summary")} value={conclusion} onChange={e => setConclusion(e.target.value)} /> : null}<Button size="sm" variant="ghost" disabled={thread.status === "OPEN" && !conclusion.trim()} onClick={() => void onResolve(conclusion)}>{t(thread.status === "OPEN" ? "Resolve" : "Reopen")}</Button></div> : null}</article>;
}
