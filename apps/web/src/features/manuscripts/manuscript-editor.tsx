import { confirmUnsavedChanges } from "@/services/confirmation";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Y from "yjs";
import type { EditorView } from "@codemirror/view";
import { ArrowLeft, Plus, Upload, Download, History, BookOpen, MessageSquare, ChevronRight, Trash2, Pencil, PanelLeft, PanelRight, MoreHorizontal, X, FileText, Maximize2, Columns3, Search, Sparkles, FilePenLine } from "lucide-react";
import type { ManuscriptFile, ManuscriptComment, ManuscriptSyncState, SnapshotFile, ManuscriptEngine, ManuscriptAiResult } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { manuscriptsApi, saveDownload } from "./manuscripts.api";
import { ManuscriptProvider } from "./collaboration-provider";
import { SourceEditor, SnapshotSourceEditor, type SourceSelection } from "./source-editor";
import { ManuscriptPanes } from "./manuscript-panes";
import { ManuscriptFileTree } from "./manuscript-file-tree";
import { ManuscriptSearch } from "./manuscript-search";
import { ManuscriptVersionDiff } from "./manuscript-version-diff";
import { ManuscriptProjectDiff } from "./manuscript-project-diff";
import { ManuscriptSuggestions } from "./manuscript-suggestions";
import { ManuscriptVisual } from "./manuscript-visual";
import { ManuscriptTrackedEditing } from "./manuscript-tracked-editing";
import { ManuscriptRemoteSync } from "./manuscript-remote-sync";
import { ManuscriptIntegrations } from "./manuscript-integrations";
import { ManuscriptFeedbackLink } from "./manuscript-feedback-link";
import { ManuscriptCommentThread } from "./manuscript-comment-thread";
import { ManuscriptPdf } from "./manuscript-pdf";
import { ManuscriptOutline } from "./manuscript-outline";
import { ManuscriptSourceToolbar } from "./manuscript-source-toolbar";
import { structureAt } from "./latex-structures";
import type { StructureDraft } from "./manuscript-structure-dialog";
import { sourceLanguage } from "./latex-tools";
import { ManuscriptAi } from "./manuscript-ai";
import { captureAiSelection, resolveAiSelection, type AiSelection } from "./ai-selection";
import { resolveWritingCitations } from "./ai-citations";
import "./manuscripts.css";

const StructureDialog = lazy(() => import("./manuscript-structure-dialog").then(module => ({ default: module.ManuscriptStructureDialog })));

const syncLabels: Record<ManuscriptSyncState, string> = { CONNECTING: "Connecting", SYNCING: "Synchronizing", SAVED: "Saved to server", RECONNECTING: "Reconnecting", OFFLINE: "Offline, local edits pending", SYNC_ERROR: "Synchronization error", READ_ONLY: "Read-only" };
const noProvider = { status: "CONNECTING" as ManuscriptSyncState, canWrite: false, ready: false, pending: 0, sequence: 0, fileVersion: 1, error: null };
const mobilePaneQuery = "(max-width: 780px)";
const getMobilePane = () => window.matchMedia?.(mobilePaneQuery).matches ?? false;
const subscribeMobilePane = (changed: () => void) => {
  const query = window.matchMedia?.(mobilePaneQuery);
  query?.addEventListener("change", changed);
  return () => query?.removeEventListener("change", changed);
};
type Pane = "files" | "editor" | "preview";
type Aside = "preview" | "references" | "comments" | "versions" | "ai" | "suggestions";
export function ManuscriptEditorPage() {
  const { projectId, id } = useParams(), [params] = useSearchParams();
  const userId = useAuthStore(s => s.user?.id ?? "");
  return <ManuscriptWorkspace key={`${userId}:${projectId}:${id}:${params.get("snapshot") ?? "live"}`} />;
}

function ManuscriptWorkspace() {
  const { projectId = "", id = "" } = useParams(), navigate = useNavigate(), [searchParams] = useSearchParams();
  const snapshotId = searchParams.get("snapshot") ?? undefined;
  const { t } = useI18n(), client = useQueryClient(), userId = useAuthStore(s => s.user?.id ?? "");
  const key = ["manuscript", userId, projectId, id];
  const detail = useQuery({ queryKey: key, queryFn: () => manuscriptsApi.detail(projectId, id), enabled: !snapshotId, refetchInterval: 15000 });
  const snapshot = useQuery({ queryKey: [...key, "snapshot", snapshotId], queryFn: () => manuscriptsApi.viewSnapshot(projectId, id, snapshotId!), enabled: Boolean(snapshotId) });
  const context = useQuery({ queryKey: [...key, "context"], queryFn: () => manuscriptsApi.context(projectId, id), enabled: !snapshotId && Boolean(detail.data), staleTime: 30000 });
  const comments = useInfiniteQuery({ queryKey: [...key, "comment-pages", snapshotId], queryFn: ({ pageParam }) => manuscriptsApi.commentPage(projectId, id, snapshotId, pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: page => page.nextCursor ?? undefined, enabled: Boolean(detail.data || snapshot.data), refetchInterval: 10000 });
  const versions = useQuery({ queryKey: [...key, "versions"], queryFn: () => manuscriptsApi.snapshots(projectId, id), enabled: !snapshotId && Boolean(detail.data) });
  const mentors = useQuery({ queryKey: [...key, "mentors"], queryFn: () => manuscriptsApi.mentors(projectId, id), enabled: !snapshotId && Boolean(detail.data) });
  const compilations = useQuery({ queryKey: [...key, "compilations", snapshotId], queryFn: () => manuscriptsApi.compilations(projectId, id, snapshotId), enabled: Boolean(detail.data || snapshot.data), refetchInterval: query => ["QUEUED", "COMPILING"].includes(query.state.data?.latest?.status ?? "") ? 2000 : 15000 });
  const proposals = useQuery({ queryKey: [...key, "suggestions"], queryFn: () => manuscriptsApi.suggestions(projectId, id), enabled: !snapshotId && Boolean(detail.data), refetchInterval: 5000 });
  const commentItems = comments.data?.pages.flatMap(page => page.items) ?? [];
  const [engineChoice, setEngine] = useState<ManuscriptEngine>(), [compiling, setCompiling] = useState(false);
  const [texChoice, setTexChoice] = useState<import("@trend/shared-types").ManuscriptTexLive>();
  const texVersions = detail.data?.compiler.versions ?? ["2022"];
  const texLiveVersion = texChoice ?? detail.data?.compilerSettings?.texLiveVersion ?? compilations.data?.latest?.texLiveVersion ?? texVersions[texVersions.length - 1] ?? "2022";
  const engine = engineChoice ?? detail.data?.compilerSettings?.engine ?? compilations.data?.latest?.engine ?? "pdflatex";
  const [sourceTarget, setSourceTarget] = useState<{ fileId: string; line: number } | null>(null);
  const [pdfSourceTarget, setPdfSourceTarget] = useState<{ path: string; line: number; key: number }>();
  const [repairRequest, setRepairRequest] = useState(0);
  const [fileId, setFileId] = useState(""), [pane, setPane] = useState<Pane>("editor"), [aside, setAside] = useState<Aside>("preview");
  const mobilePane = useSyncExternalStore(subscribeMobilePane, getMobilePane);
  const [filesOpen, setFilesOpen] = useState(true), [asideOpen, setAsideOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [structure, setStructure] = useState<StructureDraft>();
  const [visual, setVisual] = useState(false);
  const [tracking, setTracking] = useState<{ target: AiSelection; path: string; request?: import("@trend/shared-types").CreateManuscriptSuggestion }>();
  const alternateEditor = useRef(false), trackingActive = useRef(false); alternateEditor.current = Boolean(tracking) || visual; trackingActive.current = Boolean(tracking);
  const [trackedDirty, setTrackedDirty] = useState(false);
  const [visualDirty, setVisualDirty] = useState(false), [suggestionsVisited, setSuggestionsVisited] = useState(false);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [cursor, setCursor] = useState<SourceSelection>({ line: 1, column: 1, length: 0 });
  const onSelection = (next: SourceSelection) => setCursor(current => current.line === next.line && current.column === next.column && current.length === next.length ? current : next);
  const [error, setError] = useState(""), [success, setSuccess] = useState(""), [busy, setBusy] = useState(false), [fileForm, setFileForm] = useState<"TEXT" | "FOLDER" | "RENAME" | "DELETE" | null>(null), [path, setPath] = useState("");
  const [fileTarget, setFileTarget] = useState<ManuscriptFile>();
  const [filter, setFilter] = useState(""), [note, setNote] = useState(""), [quote, setQuote] = useState<{ fileId: string; quote: string; start: unknown; end: unknown } | undefined>();
  const [commentFilter, setCommentFilter] = useState("ALL"), [commentTarget, setCommentTarget] = useState<ManuscriptComment | null>(null);
  const [label, setLabel] = useState(""), [feedback, setFeedback] = useState(""), [relationship, setRelationship] = useState(""), [authors, setAuthors] = useState<string[]>([]);
  const [noteKey, setNoteKey] = useState(() => crypto.randomUUID()), [snapshotKey, setSnapshotKey] = useState(() => crypto.randomUUID());
  const [fileKey, setFileKey] = useState(() => crypto.randomUUID());
  const providers = useRef(new Map<string, ManuscriptProvider>()), view = useRef<EditorView | null>(null), refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastSelected = useRef<ManuscriptFile | SnapshotFile>();
  const operation = useRef(false);
  const [, setProviderVersion] = useState(0);
  const files: Array<ManuscriptFile | SnapshotFile> = snapshot.data?.manifest?.files ?? detail.data?.files ?? [];
  // Metadata polling must not unmount an unfinished local buffer when a teammate removes its file.
  const removedDraft = (visualDirty || trackedDirty) && lastSelected.current && !files.some(file => file.id === lastSelected.current?.id) ? lastSelected.current : undefined;
  const selected = removedDraft ?? files.find(file => file.id === fileId) ?? files.find(file => file.id === (snapshot.data?.manifest?.mainFileId ?? detail.data?.mainFileId)) ?? files.find(file => file.kind === "TEXT");
  lastSelected.current = selected;
  const selectedAvailable = files.some(file => file.id === selected?.id);
  const provider = selected ? providers.current.get(selected.id) : undefined;
  const sync = useSyncExternalStore(provider?.subscribe ?? (() => () => {}), provider?.getSnapshot ?? (() => noProvider));
  const pendingAny = [...providers.current.values()].some(p => p.getSnapshot().pending > 0);
  useUnsavedWorkspace(pendingAny || visualDirty || trackedDirty || Boolean(note.trim()));
  const canWrite = Boolean(!snapshotId && detail.data?.canWrite);
  const canComment = snapshotId ? Boolean(snapshot.data?.canComment) : canWrite;
  const title = snapshot.data?.manifest?.title ?? detail.data?.title;
  const refresh = () => { clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(() => { void client.invalidateQueries({ queryKey: key, exact: true }); }, 250); };
  useEffect(() => {
    if (!selected || !selectedAvailable || selected.kind !== "TEXT" || snapshotId || !detail.data || !userId) return;
    if (!providers.current.has(selected.id)) {
      for (const [other, existing] of providers.current) if (other !== selected.id && !existing.getSnapshot().pending && providers.current.size >= 12) { existing.destroy(); providers.current.delete(other); }
      const next = new ManuscriptProvider(projectId, id, selected.id, userId, refresh);
      next.subscribe(() => setProviderVersion(value => value + 1));
      providers.current.set(selected.id, next); setProviderVersion(value => value + 1);
    }
    // Canonical identity, not the mutable filename, binds the room.
  }, [selected?.id, selected?.kind, selectedAvailable, snapshotId, userId, projectId, id, Boolean(detail.data)]);
  useEffect(() => {
    const collection = providers.current;
    return () => { clearTimeout(refreshTimer.current); for (const p of collection.values()) p.destroy(); collection.clear(); };
  }, [id, projectId, userId]);
  useEffect(() => {
    if (!detail.data) return;
    const live = new Set(detail.data.files.map(f => f.id));
    for (const [file, p] of providers.current) if (!live.has(file) && !p.getSnapshot().pending && file !== removedDraft?.id) { p.destroy(); providers.current.delete(file); }
  }, [detail.data, removedDraft?.id]);
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
  const run = async (work: () => Promise<void>) => { if (operation.current) return false; operation.current = true; setBusy(true); setError(""); setSuccess(""); try { await work(); return true; } catch { setError(t("The operation failed. Your changes are retained; refresh and try again.")); return false; } finally { operation.current = false; setBusy(false); } };
  const reviewProposal = (row: import("@trend/shared-types").ManuscriptSuggestion, status: "ACCEPTED" | "REJECTED") => {
    if (busy || !canWrite || pendingAny || alternateEditor.current) return;
    void run(async () => {
      await manuscriptsApi.resolveSuggestion(projectId, id, row.id, status, row.revision);
      await proposals.refetch(); await detail.refetch();
    });
  };
  const flush = async () => { await Promise.all([...providers.current.values()].map(p => p.waitForSaved())); };
  const exportSource = () => run(async () => { if (!snapshotId) await flush(); saveDownload(await manuscriptsApi.export(projectId, id, snapshotId), "manuscript-source.zip"); });
  const localRecovery = () => { if (provider) saveDownload(new Blob([provider.text.toString()], { type: "text/plain;charset=utf-8" }), selected?.path.split("/").pop() ?? "unsaved-source.tex"); };
  const openSide = (side: Aside) => { if (side === "suggestions") setSuggestionsVisited(true); setAside(side); setAsideOpen(true); setPane("preview"); };
  const addCitation = (paperId: string) => run(async () => {
    const active = view.current, source = provider;
    if (alternateEditor.current || !active || !source || !canWrite || !selected?.path.endsWith(".tex")) throw new Error("CITATION_NOT_READY");
    const selection = active.state.selection.main;
    const target = captureAiSelection(selected.id, source.text, selection.from, selection.to);
    const ensureTarget = () => {
      const state = source.getSnapshot(), range = resolveAiSelection(target, source.fileId, source.text, true);
      if (alternateEditor.current || !range || !state.canWrite || !state.ready || state.pending || active !== view.current || active.state.readOnly || active.state.doc.toString() !== source.text.toString()) throw new Error("CITATION_SOURCE_CHANGED");
      return range;
    };
    await flush();
    ensureTarget();
    const { key: citation } = await manuscriptsApi.insertCitation(projectId, id, paperId);
    void context.refetch();
    const range = ensureTarget();
    source.undoManager.stopCapturing();
    active.dispatch({ changes: { from: range.from, to: range.to, insert: `\\cite{${citation}}` } });
    source.undoManager.stopCapturing(); active.focus(); setPane("editor");
  });
  const createSnapshot = () => run(async () => { await flush(); const minimumSequences = Object.fromEntries([...providers.current.entries()].map(([file, p]) => [file, p.getSnapshot().sequence])); await manuscriptsApi.snapshot(projectId, id, { label: label.trim(), clientKey: snapshotKey, minimumSequences }); setLabel(""); setSnapshotKey(crypto.randomUUID()); await versions.refetch(); });
  const compile = () => run(async () => {
    setCompiling(true); openSide("preview");
    try {
      await flush();
      const minimumSequences = Object.fromEntries([...providers.current.entries()].map(([file, p]) => [file, p.getSnapshot().sequence]));
      const sealed = await manuscriptsApi.snapshot(projectId, id, { label: `PDF · ${new Date().toISOString()}`, clientKey: crypto.randomUUID(), minimumSequences, reuseUnchanged: true });
      await manuscriptsApi.compile(projectId, id, sealed.id, engine, texLiveVersion);
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
    if ((fileForm === "DELETE" || fileForm === "RENAME") && fileTarget && (fileTarget.id === selected?.id || (fileTarget.kind === "FOLDER" && selected?.path.startsWith(`${fileTarget.path}/`)))) {
      if ((trackedDirty || visualDirty) && !await confirmUnsavedChanges()) return;
      setTracking(undefined); setTrackedDirty(false); setVisualDirty(false); setVisual(false);
    }
    if (fileForm === "TEXT" || fileForm === "FOLDER") await manuscriptsApi.createFile(projectId, id, path, fileForm, fileKey);
    else if (fileTarget) await manuscriptsApi.changeFile(projectId, id, fileTarget.id, { expectedVersion: fileTarget.version, ...(fileForm === "DELETE" ? { delete: true } : { path }) });
    setFileForm(null); setFileTarget(undefined); setPath(""); setFileKey(crypto.randomUUID()); await detail.refetch();
  });
  const uploaded = (uploads: FileList | null) => { if (!uploads?.length) return; const batch = [...uploads]; void run(async () => {
    try {
      for (const upload of batch) {
        if (upload.size > 5_000_000) throw new Error("FILE_TOO_LARGE");
        if (/\.(tex|bib|txt|sty|cls|bst|csv|tsv|dat|tikz|pgf|ist|bbx|cbx|lbx|def|cfg|fd)$/.test(upload.name)) await manuscriptsApi.uploadSource(projectId, id, upload, upload.name, crypto.randomUUID());
        else await manuscriptsApi.upload(projectId, id, upload, `figures/${upload.name}`);
      }
    } finally { await detail.refetch(); }
  }); };
  if ((snapshotId ? snapshot.isLoading : detail.isLoading)) return <div className="writing-skeleton" aria-busy="true">{t("Loading manuscript…")}</div>;
  if (!title) return <section className="writing-notice"><h1>{t("Manuscript unavailable")}</h1><p>{t("This manuscript or version is unavailable, or your access has ended.")}</p>{(snapshotId ? snapshot.error : detail.error) ? <Button size="sm" variant="outline" disabled={snapshotId ? snapshot.isFetching : detail.isFetching} onClick={() => void (snapshotId ? snapshot.refetch() : detail.refetch())}>{t("Try again")}</Button> : null}<Link to={`/projects/${projectId}?tab=manuscripts`}>{t("Back to project")}</Link></section>;
  const online = provider ? [...provider.awareness.getStates()].filter(([, state]) => state.user).map(([clientId, state]) => ({ clientId, user: state.user as { id: string; name: string; color: string } })) : [];
  const compileRunning = compiling || ["QUEUED", "COMPILING"].includes(compilations.data?.latest?.status ?? "");
  const displayedSync = pendingAny && sync.status === "SAVED" ? "SYNCING" : sync.status;
  const selectFile = async (target: string) => {
    if (target !== selected?.id && (visualDirty || trackedDirty)) {
      if (!await confirmUnsavedChanges()) return false;
      setVisualDirty(false);
    }
    if (target !== selected?.id) { setTracking(undefined); setTrackedDirty(false); }
    setFileId(target);
    if (files.find(file => file.id === target)?.kind !== "FOLDER") {
      setOpenFiles(current => current.includes(target) ? current : [...current, target]);
      setPane("editor");
    }
    return true;
  };
  const navigateSource = async (target: string, line: number) => {
    if (tracking && target === selected?.id && !await stopTracking()) return false;
    if (!await selectFile(target)) return false;
    setVisual(false); setSourceTarget({ fileId: target, line }); setPane("editor");
    return true;
  };
  const closeFile = async (target: string) => {
    if (selected?.id === target && (visualDirty || trackedDirty) && !await confirmUnsavedChanges()) return;
    setOpenFiles(current => current.filter(file => file !== target));
    if (selected?.id === target) { setTracking(undefined); setTrackedDirty(false); setVisualDirty(false); setFileId(mainFileId ?? tabs.find(tab => tab.id !== target)?.id ?? ""); }
  };
  const mainFileId = snapshot.data?.manifest?.mainFileId ?? detail.data?.mainFileId;
  const captureWritingTarget = (wholeFileIfEmpty = false) => {
    const editor = view.current, live = provider?.getSnapshot();
    if (tracking || (visual && !wholeFileIfEmpty) || !editor || !provider || !selected || !selectedAvailable || !canWrite || !live?.canWrite || !live.ready || live.pending) throw new Error("Wait for synchronization");
    const selection = editor.state.selection.main;
    const range = wholeFileIfEmpty && selection.empty ? { from: 0, to: editor.state.doc.length } : selection;
    const target = captureAiSelection(selected.id, provider.text, range.from, range.to);
    return { target, input: { fileId: selected.id, from: range.from, to: range.to, original: target.original, sourceSequence: live.sequence } };
  };
  const stopTracking = async () => {
    if (trackedDirty && !await confirmUnsavedChanges()) return false;
    setTracking(undefined); setTrackedDirty(false); return true;
  };
  const editorMode = async (nextVisual: boolean) => { if (tracking && !await stopTracking()) return; setVisual(nextVisual); };
  const startTracking = () => {
    try {
      if (visualDirty) { setError(t("Save or cancel your visual draft before tracking changes.")); return; }
      const { target } = captureWritingTarget(true);
      if (target.original.length > 100000) throw new Error("SCOPE_TOO_LARGE");
      setTracking({ target, path: selected!.path }); setVisual(false); setPane("editor"); setError("");
    } catch { setError(t("Select up to 100,000 characters in a synchronized file to track changes. Small files can be tracked without a selection.")); }
  };
  const applyWritingSuggestion = async (target: AiSelection, text: string, mode: "insert" | "replace", paperId?: string, sources: ManuscriptAiResult["citations"] = [], preserveReferences = false) => {
    const editor = view.current, active = provider;
    const live = await manuscriptsApi.detail(projectId, id);
    if (!live.canWrite || !canWrite || !active || !editor || active !== providers.current.get(target.fileId) || !live.files.some(f => f.id === target.fileId)) throw new Error("Access or file changed");
    const ensureTarget = () => {
      const state = active.getSnapshot(), range = resolveAiSelection(target, active.fileId, active.text, true);
      if (trackingActive.current || (alternateEditor.current && !preserveReferences) || !range || !state.ready || state.pending || !state.canWrite || view.current !== editor || editor.state.readOnly || editor.state.doc.toString() !== active.text.toString()) throw new Error("Source changed");
      return range;
    };
    ensureTarget();
    let insertion = text;
    if (paperId) {
      const citation = await manuscriptsApi.insertCitation(projectId, id, paperId, true);
      insertion = `\\cite{${citation.key}}`;
      void context.refetch();
    } else if (!preserveReferences) {
      const references = /\\[A-Za-z]*cite/i.test(text) ? (await manuscriptsApi.context(projectId, id)).references : [];
      insertion = await resolveWritingCitations(text, sources, references, async referenceId => {
        ensureTarget();
        return manuscriptsApi.insertCitation(projectId, id, referenceId, sources.some(source => source.id === referenceId));
      });
      if (references.length) void context.refetch();
    }
    // Recheck after network requests: both collaboration and navigation can change while awaiting.
    const range = ensureTarget();
    active.undoManager.stopCapturing();
    editor.dispatch({ changes: { from: mode === "insert" ? range.to : range.from, to: range.to, insert: insertion } });
    if (paperId) target.after = insertion + target.after;
    active.undoManager.stopCapturing(); editor.focus();
  };
  const prepareIntegration = async () => {
    await flush();
    const minimumSequences = Object.fromEntries([...providers.current].map(([file, p]) => [file, p.getSnapshot().sequence]));
    const sealed = await manuscriptsApi.snapshot(projectId, id, { label: "External synchronization backup", clientKey: crypto.randomUUID(), minimumSequences, reuseUnchanged: true });
    void versions.refetch();
    const [bundle, version] = await Promise.all([manuscriptsApi.sourceBundle(projectId, id, sealed.id), manuscriptsApi.viewSnapshot(projectId, id, sealed.id)]);
    const mainFile = version.manifest?.files.find(file => file.id === version.manifest?.mainFileId)?.path;
    if (!mainFile) throw new Error("Missing main file");
    return { files: bundle.files.filter(file => file.path !== "lumigap-version.json"), sourceVersion: sealed.sourceVersion, mainFile, snapshotId: sealed.id };
  };
  const saveCompilerSettings = (nextEngine: ManuscriptEngine, release: import("@trend/shared-types").ManuscriptTexLive) => run(async () => {
    const expectedRevision = detail.data?.compilerSettings?.revision;
    if (!expectedRevision) throw new Error("Reload compiler settings");
    await manuscriptsApi.compilerSettings(projectId, id, { engine: nextEngine, texLiveVersion: release, expectedRevision });
    await detail.refetch(); setEngine(undefined); setTexChoice(undefined);
  });
  const openStructure = (kind: "table" | "equation") => {
    try {
      if (!view.current || !provider || !selected) throw new Error();
      const selection = view.current.state.selection.main;
      const range = structureAt(view.current.state.doc.toString(), selection.from, selection.to, kind);
      view.current.dispatch({ selection: { anchor: range.from, head: range.to } });
      const { target } = captureWritingTarget();
      setStructure({ kind, target });
    } catch { setError(t("Wait for synchronization")); }
  };
  const requestRepair = async (path?: string, line = 1) => {
    const target = files.find(file => file.kind === "TEXT" && file.path === path) ?? files.find(file => file.id === mainFileId);
    if (target && !await navigateSource(target.id, line)) return;
    setRepairRequest(value => value + 1); openSide("ai");
  };
  const tabs = [...new Set([mainFileId, ...openFiles, selected?.id])].flatMap(target => {
    const file = selected && selected.id === target && selected.kind !== "FOLDER" ? selected : files.find(file => file.id === target && file.kind !== "FOLDER");
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
    {structure ? <Suspense fallback={<p role="status">{t("Loading…")}</p>}><StructureDialog draft={structure} onClose={() => setStructure(undefined)} onApply={(target, text) => applyWritingSuggestion(target, text, "replace", undefined, [], true)} /></Suspense> : null}
    <nav className="writing-breadcrumbs" aria-label={t("Manuscript navigation")}><Link to={`/projects/${projectId}`}>{t("Project")}</Link><ChevronRight aria-hidden="true" /><Link to={`/projects/${projectId}?tab=manuscripts`}>{t("Manuscripts")}</Link><ChevronRight aria-hidden="true" /><span>{title}</span></nav>
    <header className="writing-toolbar"><div className="writing-title"><Link aria-label={t("Back to project")} to={`/projects/${projectId}?tab=manuscripts`}><ArrowLeft className="h-4 w-4" /></Link><div><h1 title={title}>{title}</h1><span className="writing-draft-label">{snapshotId ? `${t("Immutable version")} · ${snapshot.data?.label}` : t("Working draft")}</span></div></div>
      <div className="writing-online" aria-label={t("Online collaborators")}>{online.map(person => <span key={person.clientId} title={person.user.name} style={{ borderColor: person.user.color }} aria-label={person.user.name}>{person.user.name.split(" ").map(part => part[0]).join("").slice(0, 2)}</span>)}</div>
      <span role="status" className={`writing-sync ${displayedSync === "SAVED" ? "is-saved" : ""}`}>{snapshotId ? t("Read-only") : pendingAny || selected?.kind === "TEXT" ? t(syncLabels[displayedSync]) : t("Persisted file")}</span>
      <div className="writing-toolbar-actions">
        {!snapshotId && canWrite ? <><ManuscriptRemoteSync project={projectId} manuscript={id} prepare={prepareIntegration} onChanged={() => void detail.refetch()} /><ManuscriptIntegrations project={projectId} manuscript={id} prepare={prepareIntegration} onChanged={() => { void detail.refetch(); void context.refetch(); }} /></> : null}
        {!snapshotId ? <Button size="sm" variant="ghost" aria-label={t("AI Assistant")} title={t("AI Assistant")} aria-pressed={asideOpen && aside === "ai"} disabled={!canWrite} onClick={() => openSide("ai")}><Sparkles className="h-4 w-4" aria-hidden="true" /><span>{t("AI Assistant")}</span></Button> : null}
        <Button size="sm" variant="ghost" aria-label={t("Comments")} aria-pressed={asideOpen && aside === "comments"} onClick={() => openSide("comments")}><MessageSquare className="h-4 w-4" /><span>{t("Comments")}</span>{commentItems.filter(thread => thread.status === "OPEN").length ? <small className="writing-count">{commentItems.filter(thread => thread.status === "OPEN").length}{comments.hasNextPage ? "+" : ""}</small> : null}</Button>
        <Button size="sm" variant="ghost" aria-label={t("Version history")} aria-pressed={asideOpen && aside === "versions"} onClick={() => openSide("versions")} disabled={Boolean(snapshotId)}><History className="h-4 w-4" /><span>{t("Version history")}</span></Button>
        {!snapshotId ? <Button size="sm" variant="ghost" aria-label={t("Suggested edits")} title={t("Suggested edits")} aria-pressed={asideOpen && aside === "suggestions"} onClick={() => openSide("suggestions")}><FilePenLine className="h-4 w-4" aria-hidden="true" /><span>{t("Suggested edits")}</span></Button> : null}
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
        <div className="writing-compile-action"><label className="sr-only" htmlFor="writing-tex-release">TeX Live</label><select id="writing-tex-release" aria-label="TeX Live" value={texLiveVersion} disabled={!canWrite || busy || compileRunning} onChange={event => void saveCompilerSettings(engine, event.target.value as "2022" | "2025")}>{[...new Set([...texVersions, texLiveVersion])].map(version => <option key={version} value={version} disabled={!texVersions.includes(version)}>TeX Live {version === "2025" ? "2025/dev · Debian 13" : version}</option>)}</select><label className="sr-only" htmlFor="writing-tex-engine">{t("LaTeX engine")}</label><select id="writing-tex-engine" value={engine} disabled={!canWrite || busy || compileRunning} onChange={event => void saveCompilerSettings(event.target.value as ManuscriptEngine, texLiveVersion)}><option value="pdflatex">pdfLaTeX</option><option value="xelatex">XeLaTeX</option><option value="lualatex">LuaLaTeX</option></select><Button size="sm" aria-label={t("Compile PDF")} disabled={!canWrite || !detail.data?.compiler.available || busy || compileRunning} onClick={() => void compile()}><FileText className="h-4 w-4" />{t(compileRunning ? "Compiling PDF…" : "Compile PDF")}</Button></div>
      </div>
    </header>
    {error ? <div role="alert" className="writing-error">{error}</div> : null}
    {(snapshotId ? snapshot.error : detail.error) ? <div role="alert" className="writing-notice"><p>{t("The operation failed. Your changes are retained; refresh and try again.")}</p><Button size="sm" variant="outline" onClick={() => void (snapshotId ? snapshot.refetch() : detail.refetch())}>{t("Try again")}</Button></div> : null}
    {success ? <div role="status" className="writing-notice">{success}</div> : null}
    {sync.recoveryError ? <div role="alert" className="writing-notice">{t("Local recovery is unavailable in this browser. Keep this tab open until changes are saved to the server.")}</div> : null}
    {snapshot.data?.formalAssignmentId ? <div className="writing-notice"><Link to={`/reviews/${snapshot.data.formalAssignmentId}`}>{t("Open formal review workspace")}</Link></div> : null}
    {[...providers.current.entries()].filter(([file, p]) => !files.some(f => f.id === file) && (p.getSnapshot().pending || removedDraft?.id === file)).map(([file, p]) => <div key={file} role="alert" className="writing-notice"><p>{t("A file was removed while this tab had unsaved edits.")}</p><Button size="sm" variant="outline" onClick={() => saveDownload(new Blob([p.text.toString()], { type: "text/plain;charset=utf-8" }), "recovered-source.tex")}>{t("Download unsaved file")}</Button></div>)}
    {sync.error ? <div role="alert" className="writing-notice"><p>{t("Synchronization is interrupted. Unsaved edits remain in this tab.")}</p><Button size="sm" variant="outline" onClick={localRecovery}>{t("Download unsaved file")}</Button></div> : null}
    {!canWrite && !snapshotId ? <p className="writing-notice">{t("This manuscript is read-only.")}</p> : null}
    <nav className="writing-mobile-tabs" aria-label={t("Writing panels")}>{(["files", "editor", "preview"] as Pane[]).map(tab => <button key={tab} aria-pressed={pane === tab} onClick={() => setPane(tab)}>{t(tab === "files" ? "Files" : tab === "editor" ? "Editor" : "Preview")}</button>)}</nav>
    <div className="writing-viewbar"><div><Button size="sm" variant="ghost" aria-label={t("Toggle files panel")} aria-expanded={filesOpen} aria-controls="writing-files" onClick={() => setFilesOpen(open => !open)}><PanelLeft className="h-4 w-4" />{t("Files")}</Button><Button size="sm" variant="ghost" disabled={pendingAny || !selected?.path.endsWith(".tex") || !compilations.data?.successful || compilations.data.successful.sourceVersion !== (snapshot.data?.sourceVersion ?? detail.data?.version)} onClick={() => { if (selected) { setPdfSourceTarget({ path: selected.path, line: cursor.line, key: Date.now() }); openSide("preview"); } }}>{t("Find in PDF")}</Button><span className="writing-file-total">{files.filter(file => file.kind !== "FOLDER").length} {t("files")}</span></div><div><Button size="sm" variant="ghost" aria-label={t("Research context")} aria-pressed={asideOpen && aside === "references"} disabled={Boolean(snapshotId)} onClick={() => openSide("references")}><BookOpen className="h-4 w-4" />{t("Research context")}</Button><Button size="sm" variant="ghost" aria-label={t("Toggle information panel")} aria-expanded={asideOpen} aria-controls="writing-aside" onClick={() => setAsideOpen(open => !open)}><PanelRight className="h-4 w-4" />{t(aside === "preview" ? "PDF preview" : aside === "comments" ? "Comments" : aside === "versions" ? "Version history" : aside === "ai" ? "AI Assistant" : aside === "suggestions" ? "Suggested edits" : "Research context")}</Button></div></div>
    <ManuscriptPanes filesOpen={filesOpen} asideOpen={asideOpen} activePane={pane} files={
      <aside id="writing-files" className="writing-files" aria-label={t("Project files")}><header><h2>{t("Project files")}</h2><div className="writing-actions">{!snapshotId ? <button aria-label={t("Search all source files")} aria-pressed={searchOpen} onClick={() => setSearchOpen(open => !open)}><Search className="h-4 w-4" /></button> : null}{canWrite ? <button aria-label={t("Create source file")} onClick={() => { setFileForm("TEXT"); setFileTarget(undefined); setPath(""); setFileKey(crypto.randomUUID()); }}><Plus className="h-4 w-4" /></button> : null}</div></header>
        {searchOpen && !snapshotId ? <ManuscriptSearch project={projectId} manuscript={id} user={userId} beforeSearch={flush} onSelect={(fileId, line) => { void navigateSource(fileId, line); }} /> : null}
        {canWrite ? <div className="writing-file-actions"><button onClick={() => { setFileForm("FOLDER"); setFileTarget(undefined); setPath(""); }}>{t("New folder")}</button><label className="writing-upload"><Upload className="h-3 w-3" />{t("Upload files")}<input type="file" multiple accept=".tex,.bib,.sty,.cls,.bst,.txt,.csv,.tsv,.dat,.tikz,.pgf,.ist,.bbx,.cbx,.lbx,.def,.cfg,.fd,.png,.jpg,.jpeg,.webp,.pdf,.svg,.eps" disabled={busy} onChange={event => { uploaded(event.target.files); event.target.value = ""; }} /></label>{selected?.kind === "ASSET" && "version" in selected ? <label className="writing-upload">{t("Replace figure")}<input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.svg,.eps" disabled={busy} onChange={event => { const upload = event.target.files?.[0]; if (upload) void run(async () => { await manuscriptsApi.upload(projectId, id, upload, selected.path, selected); await detail.refetch(); }); event.target.value = ""; }} /></label> : null}</div> : null}
        {fileForm ? <form className="writing-file-form" onSubmit={event => { event.preventDefault(); void fileOperation(); }}><strong>{t(fileForm === "DELETE" ? "Delete selected file?" : fileForm === "RENAME" ? "Rename or move file" : fileForm === "FOLDER" ? "Create folder" : "Create source file")}</strong>{fileTarget ? <p>{fileTarget.path}</p> : null}{fileForm === "DELETE" ? <p>{t("The live file will be removed. Its saved history and existing snapshots are retained.")}</p> : <Input aria-label={t("File path")} required value={path} maxLength={240} placeholder={fileForm === "FOLDER" ? "figures" : "sections/discussion.tex"} onChange={e => setPath(e.target.value)} />}<div className="writing-actions"><Button size="sm" disabled={busy || (fileForm !== "DELETE" && !path)}>{t(fileForm === "DELETE" ? "Delete" : "Confirm")}</Button><Button size="sm" type="button" variant="ghost" onClick={() => setFileForm(null)}>{t("Cancel")}</Button></div></form> : null}
        <ManuscriptFileTree files={files} selectedId={selected?.id} mainFileId={snapshot.data?.manifest?.mainFileId ?? detail.data?.mainFileId} onSelect={selectFile} />
        {canWrite && selectedAvailable && selected && "version" in selected ? <footer><Button size="sm" variant="ghost" onClick={() => { setFileForm("RENAME"); setFileTarget({ ...selected }); setPath(selected.path); }}><Pencil className="h-3 w-3" />{t("Rename / move")}</Button><Button size="sm" variant="ghost" onClick={() => { setFileForm("DELETE"); setFileTarget({ ...selected }); }}><Trash2 className="h-3 w-3" />{t("Delete")}</Button>{selected.kind === "TEXT" && selected.path.endsWith(".tex") ? <Button size="sm" variant="ghost" disabled={selected.id === detail.data?.mainFileId || busy} onClick={() => void run(async () => { await manuscriptsApi.changeFile(projectId, id, selected.id, { expectedVersion: selected.version, main: true }); await detail.refetch(); })}>{t("Set main file")}</Button> : null}</footer> : null}
        {selected?.kind === "TEXT" && selected.path.endsWith(".tex") ? <ManuscriptOutline provider={snapshotId ? undefined : provider} text={snapshotId ? (selected as SnapshotFile).text ?? "" : ""} activeLine={cursor.line} onNavigate={line => { void navigateSource(selected.id, line); }} /> : null}
      </aside>} editor={
      <section className="writing-source" aria-label={t("Editor")}>
        <header className="writing-file-tabs" role="tablist" aria-label={t("Open files")}>{tabs.map(file => <div className={`writing-file-tab ${selected?.id === file.id ? "is-active" : ""}`} key={file.id}><button role="tab" tabIndex={selected?.id === file.id ? 0 : -1} aria-selected={selected?.id === file.id} aria-controls="writing-source-document" title={file.path} onClick={() => selectFile(file.id)} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const index = tabs.findIndex(tab => tab.id === file.id);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          selectFile(tabs[next]!.id);
          event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}><FileText aria-hidden="true" /><span>{file.path.split("/").pop()}</span></button>{file.id !== mainFileId ? <button aria-label={t("Close file {{name}}", { name: file.path })} onClick={() => void closeFile(file.id)}><X /></button> : null}</div>)}</header>
        <div hidden={Boolean(tracking) || (visual && !snapshotId && selected?.path.endsWith(".tex"))}><ManuscriptSourceToolbar onStructure={openStructure} filename={selected?.path ?? ""} getView={() => view.current} canEdit={Boolean(selectedAvailable && provider && sync.canWrite)} canStructure={Boolean(selectedAvailable && provider && sync.canWrite && sync.ready && !sync.pending)} canSearch={selected?.kind === "TEXT" && (Boolean(snapshotId) || sync.ready)} canComment={Boolean(selectedAvailable && provider && sync.canWrite && cursor.length)} onComment={commentSelection} /></div>
        <div id="writing-source-document" className="writing-source-document">
        {!snapshotId && provider && selected?.kind === "TEXT" && selected.path.endsWith(".tex") ? <div className="writing-editor-modes"><button aria-pressed={!visual && !tracking} onClick={() => void editorMode(false)}>{t("Source")}</button><button aria-pressed={visual && !tracking} onClick={() => void editorMode(true)}>{t("Visual writing")}</button>{canWrite ? <button aria-pressed={Boolean(tracking)} disabled={!selectedAvailable || !sync.canWrite || !sync.ready || Boolean(tracking)} onClick={startTracking}>{t("Track changes")}</button> : null}</div> : null}
        <div className="writing-source-code-host" hidden={Boolean(tracking) || (visual && !snapshotId && selected?.path.endsWith(".tex"))}>
        {selected?.kind === "TEXT" ? snapshotId || !selectedAvailable ? <SnapshotSourceEditor text={snapshotId ? (selected as SnapshotFile).text ?? "" : provider?.text.toString() ?? ""} filename={selected.path} onSelection={onSelection} onView={instance => { view.current = instance; }} /> : <SourceEditor proposals={proposals.data} reviewDisabled={busy || !canWrite || pendingAny || Boolean(tracking) || visual} onReview={reviewProposal} provider={provider} filename={selected.path} citationKeys={context.data?.references.map(r => r.citationKey) ?? []} filePaths={files.filter(file => file.kind !== "FOLDER").map(file => file.path)} onView={instance => { view.current = instance; }} onSelection={onSelection} /> : <div className="writing-empty"><p>{selected?.kind === "ASSET" ? t("Images are stored separately from collaborative source.") : t("Select a source file to start writing.")}</p>{selected?.kind === "ASSET" && !snapshotId ? <Button variant="outline" onClick={() => void run(async () => saveDownload(await manuscriptsApi.downloadAsset(projectId, id, selected.id), selected.path.split("/").pop()!))}>{t("Download image")}</Button> : null}</div>}
        </div>
        {tracking ? <ManuscriptTrackedEditing key={`${tracking.target.fileId}:${tracking.target.original}`} original={tracking.target.original} filename={tracking.path} disabled={!provider || provider.fileId !== tracking.target.fileId || !selectedAvailable || !canWrite || !sync.canWrite || !sync.ready || Boolean(sync.pending)} onDirty={setTrackedDirty} onClose={() => void stopTracking()} onReview={() => openSide("suggestions")} create={async replacement => {
          if (!provider || provider.fileId !== tracking.target.fileId) throw new Error("Source unavailable");
          if (!tracking.request) {
            await flush();
            const range = resolveAiSelection(tracking.target, provider.fileId, provider.text, true), state = provider.getSnapshot();
            if (!range || !state.canWrite || !state.ready || state.pending) throw new Error("Source changed");
            tracking.request = { fileId: provider.fileId, sourceSequence: state.sequence, from: range.from, to: range.to, original: tracking.target.original, replacement, note: "", clientKey: crypto.randomUUID() };
          }
          const receipt = await manuscriptsApi.suggest(projectId, id, tracking.request);
          void client.invalidateQueries({ queryKey: [...key, "suggestions"] }); return receipt;
        }} update={async (receipt, replacement) => {
          const updated = await manuscriptsApi.updateSuggestion(projectId, id, receipt.id, receipt.revision, replacement);
          void client.invalidateQueries({ queryKey: [...key, "suggestions"] }); return updated;
        }} /> : null}
        {!snapshotId && provider && selected?.kind === "TEXT" && selected.path.endsWith(".tex") ? <div hidden={!visual} className="writing-visual-host"><ManuscriptVisual onDirty={setVisualDirty} key={selected.id} provider={provider} canWrite={selectedAvailable && canWrite && sync.canWrite && sync.ready && !sync.pending} apply={(target, replacement) => applyWritingSuggestion(target, replacement, "replace", undefined, [], true)} source={line => { setVisual(false); setSourceTarget({ fileId: selected.id, line }); }} /></div> : null}
        </div>
        <footer className="writing-editor-status"><span>{selected?.kind === "TEXT" ? t("Line {{line}}, Col {{column}}", { line: cursor.line, column: cursor.column }) : t("Select a file")}</span><span>{t(sourceLanguage(selected?.path ?? ""))} · {t(snapshotId || !canWrite || !selectedAvailable ? "Read-only" : "Auto-save")}</span></footer>
      </section>} aside={
      <aside id="writing-aside" className="writing-aside" aria-label={t("Context panel")}><header><label className="sr-only" htmlFor="writing-context-panel">{t("Context panel")}</label><select id="writing-context-panel" value={aside} onChange={e => openSide(e.target.value as Aside)}><option value="preview">{t("PDF preview")}</option>{!snapshotId && canWrite ? <option value="ai">{t("AI Assistant")}</option> : null}{!snapshotId ? <option value="references">{t("Research context")}</option> : null}<option value="comments">{t("Comments")}</option>{!snapshotId ? <><option value="versions">{t("Version history")}</option><option value="suggestions">{t("Suggested edits")}</option></> : null}</select><button className="writing-collapse-aside" aria-label={t("Hide information panel")} onClick={() => { setAsideOpen(false); setPane("editor"); }}><X className="h-4 w-4" /></button></header>
        {aside === "preview" ? compilations.error ? <div role="alert" className="writing-notice"><p>{t("Could not load the PDF. Check your access and try again.")}</p><Button size="sm" variant="outline" onClick={() => void compilations.refetch()}>{t("Try again")}</Button></div> : <ManuscriptPdf sourceTarget={pdfSourceTarget} projectId={projectId} id={id} userId={userId} state={compilations.data} sourceVersion={snapshot.data?.sourceVersion ?? detail.data?.version} pending={pendingAny} available={canWrite && Boolean(detail.data?.compiler.available)} compiling={compiling} onCompile={() => void compile()} onRepair={canWrite && !snapshotId ? requestRepair : undefined} onSource={(path, line) => { const target = files.find(file => file.path === path); if (target) void navigateSource(target.id, line); }} /> : null}
        {!snapshotId && canWrite ? <div className="writing-ai-scroll" hidden={aside !== "ai"}><ManuscriptAi key={`${projectId}:${id}:${userId}`} project={projectId} manuscript={id} filename={selected?.path ?? ""} selectionLength={cursor.length} canWrite={selectedAvailable && !tracking && !visual && canWrite && sync.canWrite && sync.ready && !sync.pending && selected?.kind === "TEXT"} capture={captureWritingTarget} apply={applyWritingSuggestion} sourceVersion={detail.data?.version} repairRequest={repairRequest} onCompile={() => void compile()} canCompile={Boolean(detail.data?.compiler.available) && !compileRunning} repairCompiled={!pendingAny && compilations.data?.latest?.status === "SUCCESS" && compilations.data.latest.sourceVersion === detail.data?.version} /></div> : null}
        {aside === "references" ? <div className="writing-context"><Input aria-label={t("Search project references")} placeholder={t("Search project references")} value={filter} onChange={e => setFilter(e.target.value)} /><h2>{t("Project literature")}</h2>{context.isLoading ? <p>{t("Loading references…")}</p> : context.error ? <p className="writing-error">{t("Could not load research context.")}</p> : context.data?.references.filter(p => `${p.title} ${p.authors.join(" ")}`.toLowerCase().includes(filter.toLowerCase())).map(p => <article key={p.id}><h3>{p.title}</h3><p>{p.authors.join(", ")}{p.year ? ` (${p.year})` : ""}</p>{p.doi ? <small>DOI: {p.doi}</small> : null}<code>{p.citationKey}</code><Button size="sm" variant="outline" disabled={!selectedAvailable || Boolean(tracking) || visual || !canWrite || !sync.canWrite || busy || !selected?.path.endsWith(".tex")} onClick={() => void addCitation(p.id)}>{t("Insert citation")}</Button></article>)}{missing.length ? <p role="alert" className="writing-error">{t("Missing citation keys")}: {missing.join(", ")}</p> : null}
          <h2>{t("Research questions")}</h2><p>{context.data?.plan?.objective || t("No research plan recorded.")}</p>{Array.isArray(context.data?.plan?.questions) ? context.data.plan.questions.map((q: unknown, index: number) => <p key={index}>{typeof q === "string" ? q : q && typeof q === "object" ? String((q as { question?: string; text?: string }).question ?? (q as { text?: string }).text ?? "") : ""}</p>) : null}
          <h2>{t("Research gaps")}</h2><p className="writing-small">{t("Gap candidates and evidence are research context, not established scientific conclusions.")}</p>{context.data?.gaps.map(g => <details key={g.id}><summary>{g.title}</summary><p>{g.description}</p><span>{t(g.status)}</span>{g.limitations ? <p>{g.limitations}</p> : null}<Link to={`/projects/${projectId}?tab=gaps`} target="_blank" rel="noreferrer">{t("Open related research gap")}</Link></details>)}
          <h2>{t("Supporting evidence and limitations")}</h2>{context.data?.evidence.map(e => <details key={e.id}><summary>{e.claim}</summary><p>{e.interpretation}</p><p>{t(e.evidenceRole)}</p><p>{e.limitations}</p><span>{t(e.status)}</span></details>)}
        </div> : null}
        <div className="writing-context" hidden={aside !== "comments"}><h2>{t("Manuscript comments")}</h2><p className="writing-small">{snapshotId ? t("Feedback stays attached to this immutable version.") : t("Selections use collaborative anchors. Removed text is shown as a historical quote.")}</p>{comments.error ? <p className="writing-error">{t("Could not load comments.")}</p> : null}<label>{t("Filter comments")}<select value={commentFilter} onChange={e => setCommentFilter(e.target.value)}><option value="ALL">{t("All comments")}</option><option value="OPEN">{t("Open")}</option><option value="RESOLVED">{t("Resolved")}</option></select></label>{commentItems.map(thread => <ManuscriptCommentThread hidden={aside !== "comments" || (mobilePane ? pane !== "preview" : !asideOpen) || (commentFilter !== "ALL" && thread.status !== commentFilter)} projectId={projectId} userId={userId} key={thread.id} thread={thread} provider={provider} canResolve={snapshotId ? Boolean(snapshot.data?.canResolve) : canWrite} canReply={canComment} onNavigate={target => { void (async () => { if (tracking && target === selected?.id && !await stopTracking()) return false; return selectFile(target); })().then(allowed => { if (allowed) { setVisual(false); setCommentTarget(thread); setPane("editor"); } }); }} onReply={(body, clientKey) => run(async () => { await manuscriptsApi.reply(projectId, thread.id, body, clientKey); await comments.refetch(); })} onResolve={(conclusion, status, expectedVersion) => run(async () => { await manuscriptsApi.resolve(projectId, thread.id, status, expectedVersion, conclusion); await comments.refetch(); })} />)}
          {comments.hasNextPage ? <Button size="sm" variant="outline" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>{t("Load older comments")}</Button> : null}
          {canComment ? <form onSubmit={event => { event.preventDefault(); void comment(); }}><label>{t("Add comment")}<textarea value={note} disabled={busy} maxLength={5000} onChange={e => setNote(e.target.value)} required /></label>{quote?.quote ? <blockquote>{quote.quote}</blockquote> : null}<Button size="sm" disabled={busy || !note.trim()}>{t("Post comment")}</Button></form> : <p>{t("This version is read-only. Use your assigned formal review workspace to submit an evaluation.")}</p>}
        </div>
        {!snapshotId && suggestionsVisited ? <div hidden={aside !== "suggestions"} className="writing-ai-scroll"><ManuscriptSuggestions project={projectId} manuscript={id} user={userId} canWrite={canWrite} canCapture={selectedAvailable && !tracking && !visual && sync.canWrite && sync.ready && !sync.pending} refresh={() => { void detail.refetch(); }} capture={() => { const { input } = captureWritingTarget(); if (input.sourceSequence === undefined) throw new Error("Wait for synchronization"); return { fileId: input.fileId, from: input.from, to: input.to, sourceSequence: input.sourceSequence, original: input.original }; }} /></div> : null}
        {aside === "versions" ? <div className="writing-context"><h2>{t("Immutable source versions")}</h2><p className="writing-small">{t("Snapshots include server-persisted files. Unsynchronized edits must finish saving first.")}</p>{canWrite ? <form onSubmit={event => { event.preventDefault(); void createSnapshot(); }}><label>{t("Snapshot name")}<Input value={label} maxLength={160} onChange={e => setLabel(e.target.value)} required /></label><Button size="sm" disabled={busy || !label.trim() || pendingAny}>{t("Create snapshot")}</Button></form> : null}
          {versions.error ? <p className="writing-error">{t("Could not load version history.")}</p> : versions.data?.map(version => <article className="writing-history-entry" key={version.id}><h3>{version.label}</h3><p>{t("Source revision")} {version.sourceVersion} · {version.createdBy.name}</p><small>{new Date(version.createdAt).toLocaleString()}</small><p className="writing-small">{version.collaboration ? t("Source, comments and tracked changes retained") + " · " + version.collaboration.comments + " / " + version.collaboration.suggestions : t("Source-only snapshot")}</p><div className="writing-actions">{version.submissionId ? <Link to={`/submissions/${version.submissionId}`}>{t("Open submitted version")}</Link> : null}<Link to={`?snapshot=${version.id}`}>{t("View version")}<ChevronRight className="h-3 w-3" /></Link>{canWrite ? <button disabled={busy} onClick={() => void run(async () => { await flush(); const restored = await manuscriptsApi.restore(projectId, id, version.id, `${title.slice(0, 125)} (${version.label.slice(0, 20)})`, crypto.randomUUID()); navigate(`/projects/${projectId}/manuscripts/${restored.id}`); })}>{t("Restore as new draft")}</button> : null}</div>
            <ManuscriptProjectDiff key={`${version.id}:project`} project={projectId} manuscript={id} baseline={version} versions={versions.data ?? []} current={canWrite ? async () => { await flush(); const minimumSequences = Object.fromEntries([...providers.current].map(([file, source]) => [file, source.getSnapshot().sequence])); return manuscriptsApi.snapshot(projectId, id, { label: "History comparison", clientKey: crypto.randomUUID(), minimumSequences, reuseUnchanged: true }); } : undefined} />{selected?.kind === "TEXT" && provider && sync.ready ? <ManuscriptVersionDiff key={`${version.id}:${selected.id}`} project={projectId} manuscript={id} snapshot={version.id} file={selected} readCurrent={async () => { await flush(); return provider.text.toString(); }} /> : null}{canWrite ? <details><summary>{t("Request mentor feedback")}</summary><label>{t("Project mentor")}<select value={relationship} onChange={e => setRelationship(e.target.value)}><option value="">{t("Select a mentor")}</option>{mentors.data?.map(m => <option key={m.id} value={m.id}>{m.mentor.name}</option>)}</select></label><label>{t("Questions for the mentor")}<textarea value={feedback} maxLength={5000} onChange={e => setFeedback(e.target.value)} /></label><Button size="sm" disabled={busy || !relationship || !feedback.trim()} onClick={() => void run(async () => { await manuscriptsApi.comment(projectId, id, { body: feedback.trim(), clientKey: crypto.randomUUID(), snapshotId: version.id, mentorRelationshipId: relationship }); setFeedback(""); setSuccess(t("Feedback request sent for this version.")); })}>{t("Send feedback request")}</Button></details> : null}
            {canWrite ? <details><summary>{t("Request formal academic review")}</summary><p className="writing-small">{t("Declare authors explicitly. This seals the source for the existing academic review workflow; mentor comments remain separate.")}</p>{detail.data?.collaborators.map(person => <label className="writing-checkbox" key={person.id}><input type="checkbox" checked={authors.includes(person.id)} onChange={event => setAuthors(value => event.target.checked ? [...value, person.id] : value.filter(id => id !== person.id))} />{person.name}</label>)}<Button size="sm" disabled={busy || !authors.length} onClick={() => void run(async () => { await flush(); const sealed = await manuscriptsApi.publish(projectId, id, version.id, authors); navigate(`/submissions/${sealed.submissionId}`); })}>{t("Seal version for review")}</Button></details> : null}
          </article>)}
        </div> : null}
      </aside>} />
    <footer className="writing-statusbar"><span>{snapshotId ? t("Immutable version") : t("Source sync") + ": " + (pendingAny || selected?.kind === "TEXT" ? t(syncLabels[displayedSync]) : t("Persisted file"))}</span>{!snapshotId && detail.data?.latestFeedback ? <ManuscriptFeedbackLink projectId={projectId} manuscriptId={id} feedback={detail.data.latestFeedback} /> : null}<span>{t("PDF")}: {t(compileRunning ? "Compiling PDF…" : compilations.data?.latest?.status === "TIMED_OUT" ? "PDF compilation timed out" : compilations.data?.latest?.status === "FAILED" ? "PDF compilation failed" : compilations.data?.successful ? "Compiled" : "Not compiled")}</span><span>{snapshotId ? `${t("Source revision")} ${snapshot.data?.sourceVersion}` : `${t("Source revision")} ${detail.data?.version}`}</span></footer>
  </div>;
}
