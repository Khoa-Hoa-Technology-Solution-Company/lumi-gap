import { useEffect, useId, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Github, GitBranch, ArrowDownToLine, ArrowUpFromLine, GitFork, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubConnectionFields, useGithubConnection } from "./github-connection";
import { githubConnectionApi } from "./github-connection.api";
import { GithubRecentCommits } from "./github-recent-commits";
import { GithubSourceDiff } from "./github-source-diff";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import { ManuscriptGithubClient, validateRepository, type RepositoryHead, type RepositoryFile, type ConflictBranchResult } from "./manuscript-github-client";
import { planSync, mergedFiles, fingerprints, hasIndependentHistories, type SyncChange } from "./remote-sync-plan";

type Prepared = { files: RepositoryFile[]; sourceVersion: number; mainFile: string };
type Remote = Awaited<ReturnType<typeof manuscriptsApi.remote>>;
type Plan = { changes: SyncChange[]; head: RepositoryHead; source: Prepared; remote: RepositoryFile[]; binding: Remote; base?: RepositoryHead };
type GithubSection = "sync" | "settings" | "history";
export function ManuscriptRemoteSync({ project, manuscript, active, canWrite: manuscriptWritable, canManageGithub, prepare, onChanged }: { project: string; manuscript: string; active: boolean; canWrite: boolean; canManageGithub: boolean; prepare: () => Promise<Prepared>; onChanged: () => void }) {
  const { t, language } = useI18n();
  const canWrite = manuscriptWritable && canManageGithub;
  const [changingRepository, setChangingRepository] = useState(false);
  const [repository, setRepository] = useState(""), [branch, setBranch] = useState("main");
  const [binding, setBinding] = useState<Remote>(), [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false), [loadRevision, setLoadRevision] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState(false), [applying, setApplying] = useState(false), [linking, setLinking] = useState(false);
  const [emptyRepository, setEmptyRepository] = useState(false);
  const [confirmConflict, setConfirmConflict] = useState(false), [conflictResult, setConflictResult] = useState<ConflictBranchResult>();
  const [transferBusy, setBusy] = useState(false), [connectionBusy, setConnectionBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [plan, setPlan] = useState<Plan>(), [choices, setChoices] = useState<Record<string, "LOCAL" | "REMOTE">>({});
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [history, setHistory] = useState<import("@trend/shared-types").ManuscriptRemoteHistoryEntry[]>([]);
  const [section, setSection] = useState<GithubSection>("sync");
  const [historyLoading, setHistoryLoading] = useState(true), [historyFailed, setHistoryFailed] = useState(false), [historyRevision, setHistoryRevision] = useState(0);
  const sectionId = useId();
  const visibleSection = !canWrite && section === "settings" ? "sync" : section;
  const busy = transferBusy || connectionBusy;
  const pending = useRef(false), abort = useRef<AbortController>(), requestKey = useRef(crypto.randomUUID());
  // Keep an in-flight transfer mounted when the editor switches panels.
  const connection = useGithubConnection(active || busy);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!active || pending.current) return;
    let live = true; setLoading(true); setLoadFailed(false); setPlan(undefined); setConfirmTarget(false); setEmptyRepository(false); setChangingRepository(false); setError(""); setMessage("");
    void manuscriptsApi.remote(project, manuscript).then(value => { if (live) { setBinding(value); setRepository(value?.repository ?? ""); setBranch(value?.branch ?? "main"); setSection(value ? "sync" : "settings"); } }).catch(() => { if (live) setLoadFailed(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active, project, manuscript, connection.userId, loadRevision]);
  useEffect(() => {
    if (!active) return;
    let live = true; setHistory([]); setHistoryLoading(true); setHistoryFailed(false);
    void manuscriptsApi.remoteHistory(project, manuscript).then(data => { if (live) setHistory(data); }).catch(() => { if (live) setHistoryFailed(true); }).finally(() => { if (live) setHistoryLoading(false); });
    return () => { live = false; };
  }, [active, project, manuscript, connection.userId, historyRevision]);
  useEffect(() => { if (!active && !busy) { setPlan(undefined); setChoices({}); setDiffFile(null); } }, [active, busy]);
  const run = async (work: (client: ManuscriptGithubClient) => Promise<void>) => {
    if (pending.current || connectionBusy || loading || loadFailed || !canWrite) return; pending.current = true; setBusy(true); setError(""); setMessage("");
    abort.current = new AbortController();
    try { validateRepository(repository.trim(), branch.trim()); await work(new ManuscriptGithubClient(repository.trim(), "", abort.current.signal, connection.connectedUser, project)); }
    catch (error) {
      setPlan(undefined);
      if (linkOperation.current && isAxiosError<{ error?: { details?: { reason?: string } } }>(error) && error.response?.data.error?.details?.reason === "EMPTY_REPOSITORY") setEmptyRepository(true);
      else setError(t(linkOperation.current ? "Could not connect the repository. Check GitHub access and that the branch has an initial commit, then retry." : "Synchronization interrupted. Inspect again before retrying; source snapshots and remote commits are retained."));
    }
    finally { pending.current = false; setBusy(false); setApplying(false); setLinking(false); linkOperation.current = false; }
  };
  const linkOperation = useRef(false);
  const invalidate = () => { setPlan(undefined); setConfirmConflict(false); setChoices({}); setDiffFile(null); setMessage(""); setError(""); setEmptyRepository(false); setConfirmTarget(false); requestKey.current = crypto.randomUUID(); };
  useEffect(() => { setPlan(undefined); setChoices({}); setDiffFile(null); setEmptyRepository(false); abort.current?.abort(); }, [connection.connectedUser, connection.userId]);
  useEffect(() => { setConflictResult(undefined); setConfirmConflict(false); }, [project, manuscript, connection.connectedUser, connection.userId]);
  const targetLinked = Boolean(binding && binding.repository === repository.trim() && binding.branch === branch.trim());
  const replacingTarget = Boolean(binding && !targetLinked);
  let validTarget = false;
  try { validateRepository(repository.trim(), branch.trim()); validTarget = Boolean(repository.trim() && branch.trim()); } catch { /* Keep invalid targets in the selection step. */ }
  const connectRepository = (initialize = false) => {
    if (!connection.connectedUser || !validTarget || targetLinked || replacingTarget && !confirmTarget) return;
    void run(async client => {
      linkOperation.current = true; setLinking(true);
      // Linking records the shared destination only. It neither exports source
      // nor declares either side to be a common synchronization baseline.
      const [current, detail] = await Promise.all([manuscriptsApi.remote(project, manuscript), manuscriptsApi.detail(project, manuscript)]);
      if (!detail.canWrite || !detail.canManageGithub || (current?.revision ?? 0) !== (binding?.revision ?? 0) || abort.current?.signal.aborted) throw new Error("Connection changed");
      if (initialize) {
        await githubConnectionApi.initializeRepository(connection.connectedUser!, { repository: repository.trim(), branch: branch.trim(), projectId: project });
        setEmptyRepository(false);
      }
      const head = await client.head(branch.trim());
      if (abort.current?.signal.aborted) return;
      await manuscriptsApi.bindRemote(project, manuscript, { repository: repository.trim(), branch: branch.trim(), head: head.sha, baseline: [], isPrivate: head.private, expectedRevision: current?.revision ?? 0, expectedVersion: detail.version });
      if (abort.current?.signal.aborted) return;
      setBinding({ repository: repository.trim(), branch: branch.trim(), head: head.sha, baseline: [], revision: (current?.revision ?? 0) + 1 });
      setEmptyRepository(false);
      setConfirmTarget(false); setChangingRepository(false); setSection("sync"); setMessage(t("Repository connected. You can now receive or send source."));
      setHistoryRevision(value => value + 1);
    });
  };
  const prepareComparison = async (client: ManuscriptGithubClient): Promise<Plan> => {
    if (!targetLinked || !connection.connectedUser) throw new Error("Connect repository first");
    const [binding, source, head] = await Promise.all([manuscriptsApi.remote(project, manuscript), prepare(), client.head(branch.trim())]);
    setBinding(binding);
    if (!binding || binding.repository !== repository.trim() || binding.branch !== branch.trim()) throw new Error("Connect repository first");
    const remote = (await client.pull(head, () => undefined, true)).files.filter(file => file.path !== "lumigap-version.json");
    const sameRemote = binding?.repository === repository.trim() && binding.branch === branch.trim();
    let changes = await planSync(sameRemote ? binding.baseline : [], source.files, remote);
    let base: RepositoryHead | undefined;
    if (changes.some(change => change.kind === "CONFLICT") && binding.baseline.length) {
      try {
        base = await client.commonBase(head, binding.head, binding.baseline);
        if (base) {
          const paths = new Set(changes.filter(change => change.kind === "CONFLICT" && change.local && change.remote).map(change => change.path));
          const entries = base.entries.filter(entry => paths.has(entry.path) && (entry.size ?? Infinity) <= 128_000 && /\.(tex|bib|txt|sty|cls|bst|csv|tsv|dat|tikz|pgf|ist|bbx|cbx|lbx|def|cfg|fd)$/.test(entry.path));
          const original = (await client.pull({ ...base, entries }, () => undefined, true)).files;
          changes = await planSync(binding.baseline, source.files, remote, original);
        }
      } catch { base = undefined; /* Keep manual conflict review available if old Git objects cannot be verified. */ }
    }
    if (abort.current?.signal.aborted) throw new Error("Cancelled");
    setBinding(binding); setConfirmTarget(false);
    const result = { changes, head, source, remote, binding, base };
    setChoices({}); setDiffFile(null); setConfirmConflict(false); requestKey.current = crypto.randomUUID(); setPlan(result);
    return result;
  };
  const inspect = () => run(async client => { await prepareComparison(client); });
  const apply = (direction: "pull" | "push") => run(async client => {
    const prepared = plan ?? await prepareComparison(client);
    if (plan) {
      const latest = await prepare();
      const sourceFiles = (files: RepositoryFile[]) => files.filter(file => file.path !== "lumigap-version.json");
      const latestFiles = sourceFiles(latest.files), comparedFiles = sourceFiles(plan.source.files);
      if (latest.sourceVersion !== plan.source.sourceVersion || latest.mainFile !== plan.source.mainFile || latestFiles.length !== comparedFiles.length || latestFiles.some(file => !comparedFiles.some(previous => previous.path === file.path && previous.content === file.content))) throw new Error("Source changed since comparison");
    }
    const selected = plan ? choices : {};
    // Direct actions still verify both sources. New conflicts and the first
    // combination of independent histories require review before any write.
    if (prepared.changes.some(change => change.kind === "CONFLICT" && !selected[change.path]) || !plan && hasIndependentHistories(prepared.binding?.baseline ?? [], prepared.source.files, prepared.remote)) {
      setMessage(t("Review the differences below before synchronizing. Neither side has been changed.")); return;
    }
    await applyPrepared(client, prepared, direction, selected);
  });
  const applyPrepared = async (client: ManuscriptGithubClient, plan: Plan, direction: "pull" | "push", choices: Record<string, "LOCAL" | "REMOTE">) => {
    if (plan.binding && (plan.binding.repository !== repository.trim() || plan.binding.branch !== branch.trim()) && !confirmTarget) throw new Error("Confirm shared target change");
    // Reject unwritable pushes before applying any incoming content locally.
    if (direction === "push" && (!client.authenticated || !plan.head.writable)) throw new Error("Write access required");
    setApplying(true);
    const files = mergedFiles(plan.changes, choices), current = await manuscriptsApi.detail(project, manuscript);
    if (!current.canWrite || !current.canManageGithub || current.version !== plan.source.sourceVersion || (await client.head(branch.trim())).sha !== plan.head.sha) throw new Error("Source changed");
    const binding = await manuscriptsApi.remote(project, manuscript);
    if ((binding?.revision ?? 0) !== (plan.binding?.revision ?? 0)) throw new Error("Connection changed");
    if (!plan.changes.some(change => change.kind !== "SAME")) {
      // First sync of already identical source must still establish the shared
      // baseline. No file application or GitHub commit is needed.
      if (!binding?.baseline.length && plan.remote.length) {
        const baseline = await fingerprints(plan.remote);
        await manuscriptsApi.bindRemote(project, manuscript, { repository: repository.trim(), branch: branch.trim(), head: plan.head.sha, baseline, isPrivate: plan.head.private, expectedRevision: binding?.revision ?? 0, expectedVersion: plan.source.sourceVersion });
        setBinding({ repository: repository.trim(), branch: branch.trim(), head: plan.head.sha, baseline, revision: (binding?.revision ?? 0) + 1 });
        setHistoryRevision(value => value + 1);
      }
      setPlan(undefined); setMessage(t("Both sides are identical.")); return;
    }
    if (direction === "pull" && plan.changes.every(change => change.kind === "SAME" || change.kind === "LOCAL")) {
      setMessage(t("No new changes on GitHub. Your LumiGap edits are kept; use Send to upload them.")); return;
    }
    let head = plan.head.sha, baseline = await fingerprints(plan.remote), version = plan.source.sourceVersion;
    const applied = await manuscriptsApi.syncSource(project, manuscript, { files }, plan.source.mainFile, version, requestKey.current); version = applied.version;
    if (direction === "push") {
      const changed = await client.changes(plan.head, files);
      const deleted = plan.remote.filter(file => !files.some(keep => keep.path === file.path)).map(file => file.path);
      if (changed.length || deleted.length) {
        const url = await client.push(plan.head, changed, branch.trim(), "Synchronize manuscript from LumiGap", () => undefined, true, deleted);
        head = url.split("/").at(-1)!;
      }
      baseline = await fingerprints(files);
    }
    await manuscriptsApi.bindRemote(project, manuscript, { repository: repository.trim(), branch: branch.trim(), head, baseline, isPrivate: plan.head.private, expectedRevision: binding?.revision ?? 0, expectedVersion: version });
    setBinding({ repository: repository.trim(), branch: branch.trim(), head, baseline, revision: (binding?.revision ?? 0) + 1 });
    setPlan(undefined); setMessage(t(direction === "pull" ? "Remote changes applied. Compile to verify the merged manuscript." : "Merged source saved locally and pushed to GitHub.")); onChanged();
    setHistoryRevision(value => value + 1);
  };
  const createConflictBranch = () => run(async client => {
    if (!plan?.base || !confirmConflict || !client.authenticated || !plan.head.writable) return;
    const [current, binding, head] = await Promise.all([manuscriptsApi.detail(project, manuscript), manuscriptsApi.remote(project, manuscript), client.head(branch.trim())]);
    if (!current.canWrite || !current.canManageGithub || current.version !== plan.source.sourceVersion || head.sha !== plan.head.sha || !binding || binding.revision !== plan.binding?.revision || binding.repository !== repository.trim() || binding.branch !== branch.trim() || abort.current?.signal.aborted) throw new Error("Source or connection changed");
    setApplying(true);
    const result = await client.createConflictBranch(plan.base, plan.source.files, binding.branch);
    setPlan(undefined); setConfirmConflict(false); setConflictResult(result);
    setHistoryRevision(value => value + 1);
  });
  const conflicts = plan?.changes.filter(change => change.kind === "CONFLICT") ?? [];
  const changedTarget = Boolean(plan?.binding && (plan.binding.repository !== repository.trim() || plan.binding.branch !== branch.trim()));
  const isUnbaselined = Boolean(plan && hasIndependentHistories(binding?.repository === repository.trim() && binding.branch === branch.trim() ? binding.baseline : [], plan.source.files, plan.remote));
  const blocked = busy || !canWrite || conflicts.some(change => !choices[change.path]) || (changedTarget && !confirmTarget);
  const selectedDiffChange = plan?.changes.find(c => c.path === diffFile);
  const selectSection = (next: GithubSection) => {
    if (busy) return;
    // Leaving setup cancels an unlinked target selection, never a saved binding.
    if (next === "sync" && binding && !targetLinked) {
      setRepository(binding.repository); setBranch(binding.branch); invalidate();
    }
    if (next !== "settings") setChangingRepository(false);
    setSection(next);
  };
  const sections = ([{ key: "sync", label: "Synchronization" }, ...(canWrite ? [{ key: "settings", label: "Connection settings" }] : []), { key: "history", label: "GitHub history" }] as { key: GithubSection; label: string }[]);
  return <section className="writing-context writing-github-panel" aria-label={t("GitHub synchronization")}>
    <div className="writing-github-heading"><Github aria-hidden="true" className="h-5 w-5" /><h2>{t("GitHub synchronization")}</h2></div>
    <div className="writing-github-sections" role="tablist" aria-label={t("GitHub workspace")} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
      const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]?.focus();
    }}>
      {sections.map(item => <button type="button" role="tab" key={item.key} id={sectionId + "-" + item.key} aria-controls={sectionId + "-panel"} aria-selected={visibleSection === item.key} tabIndex={visibleSection === item.key ? 0 : -1} disabled={busy || loading} onClick={() => selectSection(item.key)}>{t(item.label)}</button>)}
    </div>
    <div role="tabpanel" id={sectionId + "-panel"} aria-labelledby={sectionId + "-" + visibleSection} tabIndex={0} className="writing-github-section-body">
      {loading ? <p role="status">{t("Loading remote repository…")}</p> : loadFailed ? <div role="alert"><p>{t("Could not load the remote connection.")}</p><Button size="sm" variant="outline" onClick={() => setLoadRevision(value => value + 1)}>{t("Try again")}</Button></div> : <>
      {visibleSection === "sync" ? <>
        <section className="writing-github-remote" aria-label={t("Shared manuscript repository")}>
          <h3><GitBranch aria-hidden="true" className="h-4 w-4" />{t("Shared manuscript repository")}</h3>
          {binding ? <><strong>{binding.repository}</strong><div className="writing-github-ref"><code>{binding.branch}</code><span aria-hidden="true">·</span><a href={"https://github.com/" + binding.repository + "/commit/" + binding.head} title={t(binding.baseline.length ? "Last synchronized commit" : "Repository commit")} target="_blank" rel="noopener noreferrer">{binding.head.slice(0, 7)}</a></div>{!binding.baseline.length ? <p className="writing-small">{t("No source synchronized yet.")}</p> : null}</> : <p>{t("No repository connected to this manuscript. Select one below and connect it first.")}</p>}
        </section>
        {!canWrite ? <p className="writing-github-readonly">{t("Only the project owner can create, connect, replace and synchronize repositories. You can continue writing in LumiGap.")}</p> : !connection.connectedUser || !binding ? <div className="writing-compare-action"><p>{t("Finish connection setup to compare and synchronize this manuscript.")}</p><Button size="sm" disabled={busy} onClick={() => selectSection("settings")}>{t("Open connection settings")}</Button></div> : <div className="writing-create-form"><fieldset disabled={busy}>
          <div className="writing-github-identity"><Github aria-hidden="true" className="h-4 w-4" /><span>{t("Connected to GitHub")}{connection.status?.login ? " · @" + connection.status.login : ""}</span></div>
          <div className="writing-sync-primary">
            <p className="writing-small">{t("Choose Receive or Send. Changes are checked automatically; conflicts will ask for your review.")}</p>
            <div className="writing-actions writing-sync-directions">
              <Button size="sm" variant="outline" disabled={blocked || !targetLinked} onClick={() => void apply("pull")}><ArrowDownToLine aria-hidden="true" className="h-4 w-4" />{t("Receive changes from GitHub")}</Button>
              <Button size="sm" disabled={blocked || !targetLinked || plan?.head.writable === false} onClick={() => void apply("push")}><ArrowUpFromLine aria-hidden="true" className="h-4 w-4" />{t("Send changes to GitHub")}</Button>
            </div>
            <Button size="sm" variant="ghost" disabled={busy || !targetLinked} onClick={() => void inspect()}>{t(transferBusy && !applying ? "Comparing source…" : "Inspect synchronization")}</Button>
          </div>
        {plan ? <section className="writing-sync-plan"><p><strong>{t(plan.head.private ? "Private GitHub repository" : "Public GitHub repository: exported source will be public")}</strong></p>
          {!plan.remote.length ? <p className="writing-small">{t("This repository has no manuscript source yet. Send the saved LumiGap files to add them to GitHub.")}</p> : null}
          {isUnbaselined ? <p role="alert" className="writing-small writing-error"><strong>{t("Independent histories detected")}</strong>: {t("No common baseline is available. Review each file and choose a version for every conflict before the first synchronization.")}</p> : null}
          <div className="writing-github-summary" aria-live="polite">{([{ kind: "LOCAL", label: "Changed in LumiGap" }, { kind: "REMOTE", label: "Changed on GitHub" }, { kind: "MERGED", label: "Automatically merged" }, { kind: "CONFLICT", label: "Conflict" }]).map(item => { const count = plan.changes.filter(change => change.kind === item.kind).length; return count ? <span key={item.kind}>{t(item.label)}: {count}</span> : null; })}</div>
          {plan.changes.filter(change => change.kind !== "SAME").map(change => <div key={change.path} className="writing-sync-change-item">
            <code>{change.path}</code>
            <span>{t(change.kind === "CONFLICT" ? "Conflict" : change.kind === "MERGED" ? "Automatically merged" : change.kind === "REMOTE" ? "Changed on GitHub" : "Changed in LumiGap")}</span>
            <Button size="sm" variant="ghost" onClick={() => setDiffFile(current => current === change.path ? null : change.path)}>{t(diffFile === change.path ? "Hide diff" : "View diff")}</Button>
            {change.kind === "CONFLICT" ? <select aria-label={`${t("Keep version")} ${change.path}`} value={choices[change.path] ?? ""} onChange={event => setChoices(current => ({ ...current, [change.path]: event.target.value as "LOCAL" | "REMOTE" }))}><option value="" disabled>{t("Choose a version")}</option><option value="LOCAL">{t("Keep LumiGap version")}{!change.local ? ` (${t("Deleted")})` : ""}</option><option value="REMOTE">{t("Keep GitHub version")}{!change.remote ? ` (${t("Deleted")})` : ""}</option></select> : null}
          </div>)}
          {diffFile && selectedDiffChange ? <GithubSourceDiff change={selectedDiffChange} /> : null}
          {!plan.changes.some(change => change.kind !== "SAME") ? <p>{t("Both sides are identical.")}</p> : null}
          {changedTarget ? <label className="writing-checkbox writing-github-target"><input type="checkbox" checked={confirmTarget} onChange={event => setConfirmTarget(event.target.checked)} />{t("I confirm changing the shared repository or branch for this manuscript.")}</label> : null}
          {conflicts.some(change => !choices[change.path]) ? <p>{t("Choose a version for every conflict before synchronizing.")}</p> : null}
          {conflicts.length ? <section className="writing-conflict-action">
            <p><strong>{t("Resolve conflicts on GitHub")}</strong></p><p className="writing-small">{t("Save the LumiGap version on a separate branch, then open a pull request and resolve conflicts on GitHub.")}</p>
            {!plan.base ? <p className="writing-small">{t("The common commit could not be verified. Choose file versions above; a conflict branch is unavailable.")}</p> : confirmConflict ? <div className="writing-github-confirm"><p>{t("This sends the saved LumiGap source to a new GitHub branch. The connected branch and LumiGap source stay unchanged.")}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmConflict(false)}>{t("Cancel")}</Button><Button size="sm" disabled={busy} onClick={() => void createConflictBranch()}>{t("Confirm and create branch")}</Button></div> : <Button size="sm" variant="secondary" disabled={busy || !connection.connectedUser || !plan.head.writable} onClick={() => setConfirmConflict(true)}><GitFork aria-hidden="true" className="h-4 w-4" />{t("Create conflict branch")}</Button>}
          </section> : null}
          {!plan.head.writable ? <p>{t("This GitHub account has read-only access. Push requires Contents write permission.")}</p> : null}
        </section> : null}
        </fieldset></div>}
        {conflictResult && binding?.repository === conflictResult.repository && binding.branch === conflictResult.target ? <section className="writing-conflict-result" role="status"><h3>{t("Created conflict branch on GitHub")}</h3><code>{conflictResult.branch}</code><p className="writing-small">{t("The connected branch is unchanged. Resolve conflicts in a pull request, merge it into the connected branch, then compare again in LumiGap.")}</p><div className="writing-actions"><a href={conflictResult.compareUrl} target="_blank" rel="noopener noreferrer">{t("Open a pull request on GitHub")}</a><a href={conflictResult.commitUrl} target="_blank" rel="noopener noreferrer">{t("View saved commit")}</a></div></section> : null}
        {canWrite && binding && connection.connectedUser ? <GithubRecentCommits repository={binding.repository} branch={binding.branch} userId={connection.connectedUser} project={project} active={active && visibleSection === "sync"} revision={historyRevision} disabled={busy} /> : null}
      </> : null}
      {visibleSection === "settings" && canWrite ? <>
        <p className="writing-small">{t("Manage your GitHub account and the shared repository here.")}</p>
        {!binding ? <ol className="writing-github-steps" aria-label={t("Synchronization workflow")}>{["Connect GitHub", "Connect repository"].map((step, index) => <li key={step} aria-current={(!connection.connectedUser ? 0 : 1) === index ? "step" : undefined}><span>{index + 1}</span>{t(step)}</li>)}</ol> : null}
        <div className="writing-create-form"><fieldset disabled={busy}>
          {binding && !changingRepository ? <div className="writing-repository-link"><p className="writing-small">{t("Repository linked")}: <strong>{binding.repository}</strong> · <code>{binding.branch}</code></p><Button size="sm" variant="outline" disabled={busy} onClick={() => setChangingRepository(true)}>{t("Change repository")}</Button></div> : null}
          <GithubConnectionFields connection={connection} repository={repository} disabled={busy} showRepositories={!binding || changingRepository} beforeConnect={prepare} onBusyChange={setConnectionBusy} onCredentialChange={invalidate} onRepository={value => { setRepository(value); invalidate(); }} onBranch={value => { setBranch(value); invalidate(); }} projectId={project} />
          {changingRepository && binding ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setRepository(binding.repository); setBranch(binding.branch); setChangingRepository(false); invalidate(); }}>{t("Cancel repository change")}</Button> : null}
          {!targetLinked ? <div className="writing-repository-link">
          {repository.trim() ? <p className="writing-small">{t("Selected repository")}: <strong>{repository.trim()}</strong> · <code>{branch.trim()}</code></p> : null}
          <p className="writing-small">{t("Connect this repository to the manuscript first. Source files are transferred only when you explicitly synchronize.")}</p>
          {replacingTarget ? <label className="writing-checkbox writing-github-target"><input type="checkbox" checked={confirmTarget} onChange={event => setConfirmTarget(event.target.checked)} />{t("I confirm changing the shared repository or branch for this manuscript.")}</label> : null}
          {emptyRepository ? <p className="writing-small" role="status">{t("This repository has no commits yet. Initialize a README on GitHub and connect it. Manuscript files will not be uploaded.")}</p> : null}
          <Button size="sm" disabled={busy || loading || loadFailed || !connection.connectedUser || !validTarget || replacingTarget && !confirmTarget} onClick={() => connectRepository(emptyRepository)}>{t(linking ? "Connecting repository…" : emptyRepository ? "Initialize README and connect" : replacingTarget ? "Change connected repository" : "Connect repository")}</Button>
          {emptyRepository ? <Button size="sm" variant="ghost" disabled={busy || loading || loadFailed || !connection.connectedUser || !validTarget || replacingTarget && !confirmTarget} onClick={() => connectRepository(false)}>{t("Check repository again")}</Button> : null}
        </div> : <div className="writing-repository-link"><Button size="sm" variant="ghost" disabled={busy} onClick={() => selectSection("sync")}>{t("Back to synchronization")}</Button></div>}
        </fieldset></div>
        <details className="writing-github-team"><summary>{t("Who needs to connect GitHub?")}</summary><p>{t("One sync coordinator is enough. Everyone can write in LumiGap without a GitHub account.")}</p><p>{t("The project owner manages the shared repository using their own GitHub account. GitHub repository access is still required; credentials are never shared with the team.")}</p><p>{t("Synchronization also follows the project's source export policy.")}</p></details>
      </> : null}
      {visibleSection === "history" ? <section className="writing-github-history" aria-label={t("Synchronization history")}>
        <h3><History aria-hidden="true" className="h-4 w-4" />{t("Synchronization history")}</h3>
        {historyLoading ? <p role="status">{t("Loading synchronization history…")}</p> : historyFailed ? <div role="alert"><p>{t("Could not load synchronization history.")}</p><Button size="sm" variant="outline" onClick={() => setHistoryRevision(value => value + 1)}>{t("Try again")}</Button></div> : !history.length ? <p className="writing-small">{t("No synchronization events recorded yet.")}</p> : <ul className="writing-github-history-list">{history.map(entry => {
          const repo = entry.metadata.repository;
          let commitUrl: string | undefined;
          // Historical commits belong to the recorded repository, which may
          // differ from the manuscript's current or newly selected target.
          if (typeof repo === "string" && entry.currentVersionRef && /^[a-f0-9]{7,40}$/i.test(entry.currentVersionRef)) {
            try { validateRepository(repo, "main"); commitUrl = "https://github.com/" + repo + "/commit/" + entry.currentVersionRef; } catch { /* Keep malformed historical data as plain text. */ }
          }
          const createdAt = new Date(entry.createdAt);
          return <li key={entry.id}>
          <span>{t(entry.eventType === "MANUSCRIPT_REMOTE_BOUND" ? "Repository linked" : entry.eventType === "MANUSCRIPT_REMOTE_APPLIED" ? "Pulled from GitHub" : "Pushed to GitHub")}</span>
          {entry.currentVersionRef ? commitUrl ? <a href={commitUrl} target="_blank" rel="noopener noreferrer"><code>{entry.currentVersionRef.slice(0, 7)}</code></a> : <code>{entry.currentVersionRef.slice(0, 7)}</code> : null}
          <span className="writing-small">{entry.actor?.name ?? t("System")}</span>
          {Number.isFinite(createdAt.getTime()) ? <time className="writing-small" dateTime={entry.createdAt}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(createdAt)}</time> : null}
        </li>; })}</ul>}
      </section> : null}
      </>}
    </div>
    {transferBusy ? <div className="writing-actions"><p role="status">{t(linking ? "Connecting repository…" : applying ? "Synchronizing source…" : "Comparing source…")}</p>{!applying && !linking ? <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>{t("Cancel")}</Button> : null}</div> : null}
    {error ? <p className="writing-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
  </section>;
}
