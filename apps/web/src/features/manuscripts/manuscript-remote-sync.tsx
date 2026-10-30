import { useEffect, useRef, useState } from "react";
import { Github, GitBranch, ArrowDownToLine, ArrowUpFromLine, GitFork, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GithubConnectionFields, useGithubConnection } from "./github-connection";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import { ManuscriptGithubClient, validateRepository, decodeRepositoryContent, type RepositoryHead, type RepositoryFile } from "./manuscript-github-client";
import { planSync, mergedFiles, fingerprints, hasIndependentHistories, type SyncChange } from "./remote-sync-plan";

type Prepared = { files: RepositoryFile[]; sourceVersion: number; mainFile: string };
type Remote = Awaited<ReturnType<typeof manuscriptsApi.remote>>;
type Plan = { changes: SyncChange[]; head: RepositoryHead; source: Prepared; remote: RepositoryFile[]; binding: Remote };
export function ManuscriptRemoteSync({ project, manuscript, active, canWrite, prepare, onChanged }: { project: string; manuscript: string; active: boolean; canWrite: boolean; prepare: () => Promise<Prepared>; onChanged: () => void }) {
  const { t } = useI18n();
  const [repository, setRepository] = useState(""), [branch, setBranch] = useState("main");
  const [binding, setBinding] = useState<Remote>(), [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false), [loadRevision, setLoadRevision] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState(false), [applying, setApplying] = useState(false);
  const [transferBusy, setBusy] = useState(false), [connectionBusy, setConnectionBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [plan, setPlan] = useState<Plan>(), [choices, setChoices] = useState<Record<string, "LOCAL" | "REMOTE">>({});
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [history, setHistory] = useState<import("@trend/shared-types").ManuscriptRemoteHistoryEntry[]>([]);
  const busy = transferBusy || connectionBusy;
  const pending = useRef(false), abort = useRef<AbortController>(), requestKey = useRef(crypto.randomUUID());
  // Keep an in-flight transfer mounted when the editor switches panels.
  const connection = useGithubConnection(active || busy);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!active || pending.current) return;
    let live = true; setLoading(true); setLoadFailed(false); setPlan(undefined); setConfirmTarget(false);
    void manuscriptsApi.remote(project, manuscript).then(value => { if (live) { setBinding(value); setRepository(value?.repository ?? ""); setBranch(value?.branch ?? "main"); } }).catch(() => { if (live) setLoadFailed(true); }).finally(() => { if (live) setLoading(false); });
    void manuscriptsApi.remoteHistory?.(project, manuscript)?.then(data => { if (live && data) setHistory(data); }).catch(() => undefined);
    return () => { live = false; };
  }, [active, project, manuscript, connection.userId, loadRevision]);
  useEffect(() => { if (!active && !busy) { setPlan(undefined); setChoices({}); setDiffFile(null); } }, [active, busy]);
  const run = async (work: (client: ManuscriptGithubClient) => Promise<void>) => {
    if (pending.current || connectionBusy || loading || loadFailed || !canWrite) return; pending.current = true; setBusy(true); setError(""); setMessage("");
    abort.current = new AbortController();
    try { validateRepository(repository.trim(), branch.trim()); await work(new ManuscriptGithubClient(repository.trim(), "", abort.current.signal, connection.connectedUser, project)); }
    catch { setPlan(undefined); setError(t("Synchronization interrupted. Inspect again before retrying; source snapshots and remote commits are retained.")); }
    finally { pending.current = false; setBusy(false); setApplying(false); }
  };
  const invalidate = () => { setPlan(undefined); setChoices({}); setDiffFile(null); setMessage(""); setError(""); setConfirmTarget(false); requestKey.current = crypto.randomUUID(); };
  useEffect(() => { setPlan(undefined); setChoices({}); setDiffFile(null); abort.current?.abort(); }, [connection.connectedUser, connection.userId]);
  const inspect = () => run(async client => {
    const [binding, source, head] = await Promise.all([manuscriptsApi.remote(project, manuscript), prepare(), client.head(branch.trim())]);
    const remote = (await client.pull(head, () => undefined)).files.filter(file => file.path !== "lumigap-version.json");
    const sameRemote = binding?.repository === repository.trim() && binding.branch === branch.trim();
    const changes = await planSync(sameRemote ? binding.baseline : [], source.files, remote);
    if (abort.current?.signal.aborted) throw new Error("Cancelled");
    setBinding(binding); setConfirmTarget(false);
    setChoices({}); setDiffFile(null); requestKey.current = crypto.randomUUID(); setPlan({ changes, head, source, remote, binding });
  });
  const apply = (direction: "pull" | "push") => run(async client => {
    if (!plan) return;
    if (plan.binding && (plan.binding.repository !== repository.trim() || plan.binding.branch !== branch.trim()) && !confirmTarget) throw new Error("Confirm shared target change");
    // Reject unwritable pushes before applying any incoming content locally.
    if (direction === "push" && (!client.authenticated || !plan.head.writable)) throw new Error("Write access required");
    setApplying(true);
    const files = mergedFiles(plan.changes, choices), current = await manuscriptsApi.detail(project, manuscript);
    if (!current.canWrite || current.version !== plan.source.sourceVersion || (await client.head(branch.trim())).sha !== plan.head.sha) throw new Error("Source changed");
    const binding = await manuscriptsApi.remote(project, manuscript);
    if ((binding?.revision ?? 0) !== (plan.binding?.revision ?? 0)) throw new Error("Connection changed");
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
    void manuscriptsApi.remoteHistory?.(project, manuscript)?.then(data => { if (data) setHistory(data); }).catch(() => undefined);
  });
  const createConflictBranch = () => run(async client => {
    if (!plan) return;
    setApplying(true);
    const result = await client.createConflictBranch(plan.head, plan.source.files);
    setPlan(undefined);
    setMessage(`${t("Created conflict branch on GitHub")}: ${result.branch}`);
    onChanged();
    void manuscriptsApi.remoteHistory?.(project, manuscript)?.then(data => { if (data) setHistory(data); }).catch(() => undefined);
  });
  const decodeSafe = (content?: string) => {
    if (!content) return "";
    try { return new TextDecoder().decode(decodeRepositoryContent(content)); }
    catch { return "[Binary or non-UTF8 content]"; }
  };
  const conflicts = plan?.changes.filter(change => change.kind === "CONFLICT") ?? [];
  const changedTarget = Boolean(plan?.binding && (plan.binding.repository !== repository.trim() || plan.binding.branch !== branch.trim()));
  const isUnbaselined = Boolean(plan && hasIndependentHistories(binding?.repository === repository.trim() && binding.branch === branch.trim() ? binding.baseline : [], plan.source.files, plan.remote));
  const blocked = busy || !canWrite || conflicts.some(change => !choices[change.path]) || (changedTarget && !confirmTarget);
  const selectedDiffChange = plan?.changes.find(c => c.path === diffFile);
  return <section className="writing-context writing-github-panel" aria-label={t("GitHub synchronization")}>
      <div className="writing-github-heading"><Github aria-hidden="true" className="h-5 w-5" /><div><h2>{t("GitHub synchronization")}</h2><p>{t("A shared source repository, personal GitHub access.")}</p></div></div>
      <p className="writing-small">{t("One sync coordinator is enough. Everyone can write in LumiGap without a GitHub account.")}</p>
      <details className="writing-github-team"><summary>{t("Who needs to connect GitHub?")}</summary><p>{t("Other editors can connect their own accounts to synchronize. Each person needs access to the repository; credentials are never shared with the team.")}</p><p>{t("Synchronization also follows the project's source export policy.")}</p></details>
      <section className="writing-github-remote" aria-label={t("Shared manuscript repository")}><h3><GitBranch aria-hidden="true" className="h-4 w-4" />{t("Shared manuscript repository")}</h3>
        {loading ? <p role="status">{t("Loading remote repository…")}</p> : loadFailed ? <div role="alert"><p>{t("Could not load the remote connection.")}</p><Button size="sm" variant="outline" onClick={() => setLoadRevision(value => value + 1)}>{t("Try again")}</Button></div> : binding ? <><strong>{binding.repository}</strong><code>{binding.branch}</code><p>{t("Last synchronized commit")}: <a href={`https://github.com/${binding.repository}/commit/${binding.head}`} target="_blank" rel="noopener noreferrer">{binding.head.slice(0, 7)}</a></p></> : <p>{t("No shared repository yet. Choose a repository below and complete a first synchronization to link it.")}</p>}
      </section>
      {!canWrite ? <p className="writing-github-readonly">{t("You can view the shared repository. Editing permission is required to synchronize this manuscript.")}</p> : <>
      <ol className="writing-github-steps" aria-label={t("Synchronization workflow")}>
        {["Connect GitHub", "Choose repository", "Compare", "Synchronize"].map((step, index) => {
          const currentStep = plan ? 3 : (repository.trim() && branch.trim()) ? 2 : connection.connectedUser ? 1 : 0;
          return <li key={step} aria-current={currentStep === index ? "step" : undefined}><span>{index + 1}</span>{t(step)}</li>;
        })}
      </ol>
      <div className="writing-create-form"><fieldset disabled={busy || loading || loadFailed}>
        <GithubConnectionFields connection={connection} repository={repository} branch={branch} disabled={busy || loading || loadFailed} beforeConnect={prepare} onBusyChange={setConnectionBusy} onCredentialChange={invalidate} onRepository={value => { setRepository(value); invalidate(); }} onBranch={value => { setBranch(value); invalidate(); }} projectId={project} />
        {!repository.trim() || !branch.trim() ? (
          <div className="writing-step-hint">
            <p className="writing-small">{t("Choose or enter a GitHub repository above to begin comparing source files.")}</p>
          </div>
        ) : (
          <div className="writing-compare-action">
            <p className="writing-small">{t("Inspect both sides, resolve conflicts, then pull or push explicitly. A saved source snapshot protects local work.")}</p>
            <Button size="sm" disabled={busy || loading || loadFailed} onClick={() => void inspect()}>{t(transferBusy && !applying ? "Comparing source…" : "Inspect synchronization")}</Button>
          </div>
        )}
        {plan ? <section className="writing-sync-plan"><p><strong>{t(plan.head.private ? "Private GitHub repository" : "Public GitHub repository: exported source will be public")}</strong></p>
          {isUnbaselined ? <div role="alert" className="writing-small writing-error"><p><strong>{t("Independent histories detected")}</strong>: {t("The manuscript and the remote repository both contain files with no common synchronization baseline. Inspect every file carefully or use a conflict branch.")}</p></div> : null}
          <div className="writing-github-summary" aria-live="polite"><span>{t("Changed in LumiGap")}: {plan.changes.filter(change => change.kind === "LOCAL").length}</span><span>{t("Changed on GitHub")}: {plan.changes.filter(change => change.kind === "REMOTE").length}</span><span>{t("Conflict")}: {conflicts.length}</span></div>
          {plan.changes.filter(change => change.kind !== "SAME").map(change => <div key={change.path} className="writing-sync-change-item">
            <code>{change.path}</code>
            <span>{t(change.kind === "CONFLICT" ? "Conflict" : change.kind === "REMOTE" ? "Changed on GitHub" : "Changed in LumiGap")}</span>
            <Button size="sm" variant="ghost" onClick={() => setDiffFile(current => current === change.path ? null : change.path)}>{t(diffFile === change.path ? "Hide diff" : "View diff")}</Button>
            {change.kind === "CONFLICT" ? <select aria-label={`${t("Keep version")} ${change.path}`} value={choices[change.path] ?? ""} onChange={event => setChoices(current => ({ ...current, [change.path]: event.target.value as "LOCAL" | "REMOTE" }))}><option value="" disabled>{t("Choose a version")}</option><option value="LOCAL">{t("Keep LumiGap version")}{!change.local ? ` (${t("Deleted")})` : ""}</option><option value="REMOTE">{t("Keep GitHub version")}{!change.remote ? ` (${t("Deleted")})` : ""}</option></select> : null}
          </div>)}
          {diffFile && selectedDiffChange ? <div className="writing-diff-preview" role="region" aria-label={t("Source comparison")}>
            <div><h4>LumiGap</h4><pre>{selectedDiffChange.local ? decodeSafe(selectedDiffChange.local.content).slice(0, 500) : `(${t("Deleted")})`}</pre></div>
            <div><h4>GitHub</h4><pre>{selectedDiffChange.remote ? decodeSafe(selectedDiffChange.remote.content).slice(0, 500) : `(${t("Deleted")})`}</pre></div>
          </div> : null}
          {!plan.changes.some(change => change.kind !== "SAME") ? <p>{t("Both sides are identical.")}</p> : null}
          {changedTarget ? <label className="writing-checkbox writing-github-target"><input type="checkbox" checked={confirmTarget} onChange={event => setConfirmTarget(event.target.checked)} />{t("I confirm changing the shared repository or branch for this manuscript.")}</label> : null}
          {conflicts.some(change => !choices[change.path]) ? <p>{t("Choose a version for every conflict before synchronizing.")}</p> : null}
          <div className="writing-actions">
            <Button size="sm" disabled={blocked} onClick={() => void apply("pull")}><ArrowDownToLine aria-hidden="true" className="h-4 w-4" />{t("Pull merged source")}</Button>
            <Button size="sm" variant="outline" disabled={blocked || !connection.connectedUser || !plan.head.writable} onClick={() => void apply("push")}><ArrowUpFromLine aria-hidden="true" className="h-4 w-4" />{t("Push merged source")}</Button>
            {conflicts.length ? <Button size="sm" variant="secondary" disabled={busy || !connection.connectedUser || !plan.head.writable} onClick={() => void createConflictBranch()}><GitFork aria-hidden="true" className="h-4 w-4" />{t("Create conflict branch")}</Button> : null}
          </div>
          {!plan.head.writable ? <p>{t("This GitHub account has read-only access. Push requires Contents write permission.")}</p> : null}
        </section> : null}
      </fieldset></div>
      </>}
      {history.length ? <section className="writing-github-history" aria-label={t("Synchronization history")}>
        <h3><History aria-hidden="true" className="h-4 w-4" />{t("Synchronization history")}</h3>
        <ul className="writing-github-history-list">
          {history.slice(0, 5).map(entry => <li key={entry.id}>
            <span>{entry.eventType === "MANUSCRIPT_REMOTE_BOUND" ? t("Repository linked") : entry.eventType === "MANUSCRIPT_REMOTE_APPLIED" ? t("Pulled from GitHub") : t("Pushed to GitHub")}</span>
            {entry.currentVersionRef ? <a href={`https://github.com/${repository || binding?.repository}/commit/${entry.currentVersionRef}`} target="_blank" rel="noopener noreferrer"><code>{entry.currentVersionRef.slice(0, 7)}</code></a> : null}
            <span className="writing-small">{entry.actor?.name ?? t("System")}</span>
          </li>)}
        </ul>
      </section> : null}
      {transferBusy ? <div className="writing-actions"><p role="status">{t(applying ? "Synchronizing source…" : "Comparing source…")}</p>{!applying ? <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>{t("Cancel")}</Button> : null}</div> : null}{error ? <p className="writing-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
  </section>;
}