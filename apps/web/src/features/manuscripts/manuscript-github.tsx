import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { manuscriptsApi } from "./manuscripts.api";
import { ManuscriptGithubClient, validateRepository, type RepositoryFile, type RepositoryHead } from "./manuscript-github-client";
import { GithubConnectionFields, useGithubConnection, useGithubDialogOpen } from "./github-connection";

export function ManuscriptGithub({ project, manuscript, prepare }: { project: string; manuscript?: string; prepare?: () => Promise<{ files: RepositoryFile[] }> }) {
  const { t } = useI18n(), navigate = useNavigate();
  const [open, setOpen] = useGithubDialogOpen(), [repository, setRepository] = useState(""), [branch, setBranch] = useState("main"), [target, setTarget] = useState(`lumigap/source-${Date.now()}`);
  const [title, setTitle] = useState(""), [main, setMain] = useState("");
  const [error, setError] = useState(""), [transferBusy, setBusy] = useState(false), [connectionBusy, setConnectionBusy] = useState(false), [progress, setProgress] = useState("");
  const busy = transferBusy || connectionBusy;
  const [result, setResult] = useState<{ url?: string; id?: string; skipped?: string[] }>(), [plan, setPlan] = useState<{ head: RepositoryHead; files: RepositoryFile[] }>();
  const abort = useRef<AbortController>(), pending = useRef(false), key = useRef(crypto.randomUUID());
  const connection = useGithubConnection(open);
  useEffect(() => { setPlan(undefined); setResult(undefined); abort.current?.abort(); }, [connection.connectedUser, connection.userId]);
  useEffect(() => () => abort.current?.abort(), []);
  const change = (work: () => void) => { work(); setPlan(undefined); setResult(undefined); key.current = crypto.randomUUID(); };
  const run = async (work: (client: ManuscriptGithubClient) => Promise<void>) => {
    if (pending.current || connectionBusy) return;
    pending.current = true; setBusy(true); setError(""); setProgress("");
    try { validateRepository(repository.trim(), branch.trim()); abort.current = new AbortController(); await work(new ManuscriptGithubClient(repository.trim(), "", abort.current.signal, connection.connectedUser, project)); }
    catch (error) { setError(t(abort.current?.signal.aborted ? "Source transfer cancelled. Check the destination before retrying an export." : error instanceof Error && error.message === "GitHub rate limit reached" ? "GitHub's request limit has been reached. Wait before retrying or use a GitHub token for a higher limit. Existing drafts are retained." : "GitHub operation failed. Check the repository, branch, token permissions, rate limit and source limits. Existing drafts and remote files are retained.")); }
    finally { pending.current = false; setBusy(false); }
  };
  const report = (done: number, total: number) => setProgress(`${done} / ${total}`);
  return <Dialog open={open} onOpenChange={next => { if (!busy) { setOpen(next); if (!next) { abort.current?.abort(); setPlan(undefined); setResult(undefined); } } }}>
    <DialogTrigger asChild><Button className="writing-github-trigger" variant="outline" size="sm" aria-label="GitHub" title="GitHub"><Github className="h-4 w-4" aria-hidden="true" /><span>GitHub</span></Button></DialogTrigger>
    <DialogContent closeLabel={t("Close")} showClose={!busy} data-no-i18n onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{t("GitHub source sync")}</DialogTitle><DialogDescription>{t("Import a repository as a new draft, or publish a saved source version to a branch. Existing remote files are not deleted.")}</DialogDescription></DialogHeader>
      <div className="writing-create-form"><fieldset disabled={busy}>
        <GithubConnectionFields connection={connection} projectId={project} repository={repository} disabled={busy} beforeConnect={prepare} onBusyChange={setConnectionBusy} onCredentialChange={() => change(() => undefined)} onRepository={value => change(() => setRepository(value))} onBranch={value => change(() => setBranch(value))} />
        {!plan ? <><label>{t("Imported manuscript title")}<Input value={title} minLength={2} maxLength={160} onChange={event => change(() => setTitle(event.target.value))} /></label><label>{t("Main file path (optional)")}<Input value={main} maxLength={240} onChange={event => change(() => setMain(event.target.value))} placeholder="main.tex" /></label>
          <div className="writing-actions"><Button size="sm" variant="outline" disabled={busy || title.trim().length < 2 || !repository.trim()} onClick={() => void run(async client => { const head = await client.head(branch.trim()), bundle = await client.pull(head, report); const imported = await manuscriptsApi.importBundle(project, { files: bundle.files }, title.trim(), main.trim(), key.current); setResult({ id: imported.id, skipped: [...new Set([...bundle.skipped, ...imported.ignoredFiles])] }); })}>{t("Import as new draft")}</Button>
          {prepare ? <Button size="sm" disabled={busy || !connection.connectedUser || !repository.trim()} onClick={() => void run(async client => { const head = await client.head(branch.trim()); if (!head.writable) throw new Error(); const bundle = await prepare(), files = await client.changes(head, bundle.files); setPlan({ head, files }); })}>{t("Preview export changes")}</Button> : null}</div></> : <>
          <p><strong>{repository} · {branch}</strong></p><p>{t(plan.head.private ? "Private GitHub repository" : "Public GitHub repository: exported source will be public")}</p>
          <p>{t("Saved source files to add or update")}: {plan.files.length}</p><ul className="writing-import-skipped">{plan.files.map(file => <li key={file.path}><code>{file.path}</code></li>)}</ul>
          <label>{t("Destination branch")}<Input value={target} maxLength={200} onChange={event => setTarget(event.target.value)} /></label><p className="writing-small">{t("A new branch is created by default. Using the source branch advances it only when fast-forward is safe; protected or concurrently changed branches are rejected.")}</p>
          <div className="writing-actions"><Button size="sm" disabled={busy || !plan.files.length || !target.trim()} onClick={() => void run(async client => { if (!manuscript || !(await manuscriptsApi.detail(project, manuscript)).canWrite) throw new Error(); const url = await client.push(plan.head, plan.files, target.trim(), "Update manuscript source from LumiGap", report, target.trim() === branch.trim()); setResult({ url }); setPlan(undefined); })}>{t("Publish these files to GitHub")}</Button><Button size="sm" variant="ghost" onClick={() => setPlan(undefined)}>{t("Back")}</Button></div>
        </>}
      </fieldset>
      {transferBusy ? <div className="writing-actions"><p role="status">{t("Synchronizing source…")} {progress}</p><Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>{t("Cancel")}</Button></div> : null}{error ? <p role="alert" className="writing-error">{error}</p> : null}
      {result?.url ? <a href={result.url} target="_blank" rel="noreferrer">{t("Open GitHub commit")}</a> : null}
      {result?.id ? <><p role="status">{t("Manuscript imported.")}</p>{result.skipped?.length ? <details><summary>{t("Skipped repository files")}</summary><ul className="writing-import-skipped">{result.skipped.map(path => <li key={path}>{path}</li>)}</ul></details> : null}<Button onClick={() => { setOpen(false); navigate(`/projects/${project}/manuscripts/${result.id}`); }}>{t("Open editor")}</Button></> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
