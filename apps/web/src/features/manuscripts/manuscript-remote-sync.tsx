import { useEffect, useRef, useState } from "react";
import { Github } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GithubConnectionFields, useGithubConnection, useGithubDialogOpen } from "./github-connection";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import { ManuscriptGithubClient, validateRepository, type RepositoryHead, type RepositoryFile } from "./manuscript-github-client";
import { planSync, mergedFiles, fingerprints, type SyncChange } from "./remote-sync-plan";

type Prepared = { files: RepositoryFile[]; sourceVersion: number; mainFile: string };
type Remote = Awaited<ReturnType<typeof manuscriptsApi.remote>>;
type Plan = { changes: SyncChange[]; head: RepositoryHead; source: Prepared; remote: RepositoryFile[]; binding: Remote };
export function ManuscriptRemoteSync({ project, manuscript, prepare, onChanged }: { project: string; manuscript: string; prepare: () => Promise<Prepared>; onChanged: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useGithubDialogOpen(), [repository, setRepository] = useState(""), [branch, setBranch] = useState("main"), [token, setToken] = useState("");
  const [transferBusy, setBusy] = useState(false), [connectionBusy, setConnectionBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [plan, setPlan] = useState<Plan>(), [choices, setChoices] = useState<Record<string, "LOCAL" | "REMOTE">>({});
  const busy = transferBusy || connectionBusy;
  const pending = useRef(false), abort = useRef<AbortController>(), requestKey = useRef(crypto.randomUUID());
  const connection = useGithubConnection(open);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void manuscriptsApi.remote(project, manuscript).then(binding => { if (live && binding) { setRepository(binding.repository); setBranch(binding.branch); } }).catch(() => { if (live) setError(t("Could not load the remote connection.")); });
    return () => { live = false; };
  }, [open, project, manuscript, connection.userId, t]);
  const run = async (work: (client: ManuscriptGithubClient) => Promise<void>) => {
    if (pending.current || connectionBusy) return; pending.current = true; setBusy(true); setError(""); setMessage("");
    abort.current = new AbortController();
    try { validateRepository(repository.trim(), branch.trim()); await work(new ManuscriptGithubClient(repository.trim(), token.trim(), abort.current.signal, connection.connectedUser)); }
    catch { setError(t("Synchronization interrupted. Inspect again before retrying; source snapshots and remote commits are retained.")); }
    finally { pending.current = false; setBusy(false); }
  };
  const invalidate = () => { setPlan(undefined); setChoices({}); setMessage(""); requestKey.current = crypto.randomUUID(); };
  useEffect(() => { setPlan(undefined); setChoices({}); setToken(""); abort.current?.abort(); }, [connection.connectedUser, connection.userId]);
  const inspect = () => run(async client => {
    const [binding, source, head] = await Promise.all([manuscriptsApi.remote(project, manuscript), prepare(), client.head(branch.trim())]);
    const remote = (await client.pull(head, () => undefined)).files.filter(file => file.path !== "lumigap-version.json");
    const sameRemote = binding?.repository === repository.trim() && binding.branch === branch.trim();
    const changes = await planSync(sameRemote ? binding.baseline : [], source.files, remote);
    setChoices({}); requestKey.current = crypto.randomUUID(); setPlan({ changes, head, source, remote, binding });
  });
  const apply = (direction: "pull" | "push") => run(async client => {
    if (!plan) return;
    const files = mergedFiles(plan.changes, choices), current = await manuscriptsApi.detail(project, manuscript);
    if (!current.canWrite || current.version !== plan.source.sourceVersion || (await client.head(branch.trim())).sha !== plan.head.sha) throw new Error("Source changed");
    const binding = await manuscriptsApi.remote(project, manuscript);
    if ((binding?.revision ?? 0) !== (plan.binding?.revision ?? 0)) throw new Error("Connection changed");
    let head = plan.head.sha, baseline = await fingerprints(plan.remote), version = plan.source.sourceVersion;
    const applied = await manuscriptsApi.syncSource(project, manuscript, { files }, plan.source.mainFile, version, requestKey.current); version = applied.version;
    if (direction === "push") {
      if (!client.authenticated || !plan.head.writable) throw new Error("Write access required");
      const changed = await client.changes(plan.head, files);
      const deleted = plan.remote.filter(file => !files.some(keep => keep.path === file.path)).map(file => file.path);
      if (changed.length || deleted.length) {
        const url = await client.push(plan.head, changed, branch.trim(), "Synchronize manuscript from LumiGap", () => undefined, true, deleted);
        head = url.split("/").at(-1)!;
      }
      baseline = await fingerprints(files);
    }
    await manuscriptsApi.bindRemote(project, manuscript, { repository: repository.trim(), branch: branch.trim(), head, baseline, expectedRevision: binding?.revision ?? 0, expectedVersion: version });
    setPlan(undefined); setMessage(t(direction === "pull" ? "Remote changes applied. Compile to verify the merged manuscript." : "Merged source saved locally and pushed to GitHub.")); onChanged();
  });
  const conflicts = plan?.changes.filter(change => change.kind === "CONFLICT") ?? [];
  return <Dialog open={open} onOpenChange={next => {
    if (busy) return; setOpen(next); invalidate(); setError("");
    if (!next) { abort.current?.abort(); setToken(""); }
  }}><DialogTrigger asChild><Button size="sm" variant="outline" className="writing-toolbar-trigger"><Github className="h-4 w-4" />GitHub</Button></DialogTrigger>
    <DialogContent className="writing-remote-dialog" closeLabel={t("Close")} showClose={!busy}>
      <DialogTitle>{t("Two-way source synchronization")}</DialogTitle><DialogDescription>{t("Inspect both sides, resolve conflicts, then pull or push explicitly. A saved source snapshot protects local work.")}</DialogDescription>
      <div className="writing-create-form"><fieldset disabled={busy}>
        <GithubConnectionFields connection={connection} repository={repository} branch={branch} token={token} disabled={busy} beforeConnect={prepare} onBusyChange={setConnectionBusy} onCredentialChange={invalidate} onRepository={value => { setRepository(value); invalidate(); }} onBranch={value => { setBranch(value); invalidate(); }} onToken={value => { setToken(value); invalidate(); }} />
        <Button size="sm" disabled={busy || !repository.trim()} onClick={() => void inspect()}>{t("Inspect synchronization")}</Button>
        {plan ? <section className="writing-sync-plan"><p><strong>{t(plan.head.private ? "Private GitHub repository" : "Public GitHub repository: exported source will be public")}</strong></p>
          {plan.changes.filter(change => change.kind !== "SAME").map(change => <div key={change.path}><code>{change.path}</code><span>{t(change.kind === "CONFLICT" ? "Conflict" : change.kind === "REMOTE" ? "Changed on GitHub" : "Changed in LumiGap")}</span>{change.kind === "CONFLICT" ? <select aria-label={`${t("Keep version")} ${change.path}`} value={choices[change.path] ?? ""} onChange={event => setChoices(current => ({ ...current, [change.path]: event.target.value as "LOCAL" | "REMOTE" }))}><option value="" disabled>{t("Choose a version")}</option><option value="LOCAL">{t("Keep LumiGap version")}{!change.local ? ` (${t("Deleted")})` : ""}</option><option value="REMOTE">{t("Keep GitHub version")}{!change.remote ? ` (${t("Deleted")})` : ""}</option></select> : null}</div>)}
          {!plan.changes.some(change => change.kind !== "SAME") ? <p>{t("Both sides are identical.")}</p> : null}
          <div className="writing-actions"><Button size="sm" disabled={busy || conflicts.some(change => !choices[change.path])} onClick={() => void apply("pull")}>{t("Pull merged source")}</Button><Button size="sm" variant="outline" disabled={busy || !(token.trim() || connection.connectedUser) || !plan.head.writable || conflicts.some(change => !choices[change.path])} onClick={() => void apply("push")}>{t("Push merged source")}</Button></div>
        </section> : null}
      </fieldset></div>
      {transferBusy ? <div className="writing-actions"><p role="status">{t("Synchronizing source…")}</p><Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>{t("Cancel")}</Button></div> : null}{error ? <p className="writing-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    </DialogContent>
  </Dialog>;
}
