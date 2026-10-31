import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GithubConnectionStatus, GithubRepositoryOption } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { githubConnectionApi } from "./github-connection.api";
import { manuscriptsApi } from "./manuscripts.api";

export function useGithubConnection(open: boolean) {
  const userId = useAuthStore(state => state.user?.id);
  const [status, setStatus] = useState<GithubConnectionStatus>(), [error, setError] = useState(false);
  const [identity, setIdentity] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setStatus(undefined); setError(false); setIdentity(userId);
    if (!open || !userId) return;
    const abort = new AbortController();
    void githubConnectionApi.status(userId, abort.signal).then(value => { if (!abort.signal.aborted) setStatus(value); }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [open, userId, revision]);
  return { userId, status: identity === userId ? status : undefined, error, refresh: () => setRevision(value => value + 1), connectedUser: identity === userId && status?.connected ? userId : undefined };
}
export type GithubConnection = ReturnType<typeof useGithubConnection>;

/** Reopen the originating dialog after OAuth without putting any credential in the URL. */
export function useGithubDialogOpen() {
  const location = useLocation(), navigate = useNavigate();
  const [open, setOpen] = useState(() => location.state?.githubConnected === true);
  useEffect(() => {
    if (location.state?.githubConnected === true) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);
  return [open, setOpen] as const;
}

export function GithubConnectionFields({ connection, repository, disabled, onRepository, onBranch, onCredentialChange, beforeConnect, onBusyChange, projectId, showRepositories = true }: {
  connection: GithubConnection; repository: string; disabled: boolean;
  onRepository: (value: string) => void; onBranch: (value: string) => void;
  onCredentialChange: () => void; beforeConnect?: () => Promise<unknown>;
  onBusyChange?: (busy: boolean) => void;
  projectId?: string;
  showRepositories?: boolean;
}) {
  const { t } = useI18n(), location = useLocation();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [repositories, setRepositories] = useState<GithubRepositoryOption[]>([]), [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [createOpen, setCreateOpen] = useState(false), [newName, setNewName] = useState(""), [newDesc, setNewDesc] = useState(""), [newPrivate, setNewPrivate] = useState(true);
  const pending = useRef(false), abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { abort.current?.abort(); setRepositories([]); setPage(0); setHasMore(false); setConfirmDisconnect(false); }, [connection.connectedUser]);
  const run = async (work: () => Promise<void>) => {
    if (pending.current || !connection.userId) return;
    pending.current = true; setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    try { await work(); } catch { setError(t("GitHub connection failed. Retry or reconnect; your manuscript is retained.")); }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false); }
  };
  const loadRepositories = (reload = false) => run(async () => {
    abort.current?.abort(); abort.current = new AbortController();
    const value = await githubConnectionApi.repositories(connection.userId!, reload ? 1 : page + 1, abort.current.signal);
    if (abort.current.signal.aborted) return;
    setRepositories(current => [...new Map([...(reload ? [] : current), ...value.repositories].map(repo => [repo.fullName, repo])).values()]); setPage(value.page); setHasMore(value.hasMore);
  });
  const choose = (name: string) => { onRepository(name); const repo = repositories.find(item => item.fullName === name); if (repo) onBranch(repo.defaultBranch); };
  useEffect(() => {
    if (showRepositories && connection.status?.connected && connection.userId && page === 0 && !repositories.length && !pending.current) {
      void loadRepositories();
    }
  }, [showRepositories, connection.status?.connected, connection.userId, page, repositories.length]);
  return <section className="writing-github-connection" aria-label={t("GitHub connection")}>
    <h3>{t("Your personal GitHub account")}</h3>
    <p className="writing-small">{t("Connecting authorizes your account only. It never uploads the manuscript automatically.")}</p>
    <strong>{connection.status?.connected ? `${t("Connected to GitHub")} · @${connection.status.login}` : t("Connect your GitHub account")}</strong>
    <details className="writing-github-account-actions" open={!connection.status?.connected}>
      <summary>{t(connection.status?.connected ? "Manage GitHub connection" : "Connect GitHub")}</summary>
    <div className="writing-actions">
      <Button type="button" size="sm" variant={connection.status?.connected ? "outline" : "default"} disabled={disabled || busy || !connection.status?.configured} onClick={() => void run(async () => {
        await beforeConnect?.(); const result = await githubConnectionApi.start(connection.userId!, `${location.pathname}${location.search}`);
        const url = new URL(result.url); if (url.origin !== "https://github.com" || url.pathname !== "/login/oauth/authorize") throw new Error();
        if (useAuthStore.getState().user?.id !== connection.userId) throw new Error();
        window.location.assign(url.toString());
      })}>{t(connection.status?.connected ? "Reconnect GitHub" : "Connect GitHub")}</Button>
      {connection.status?.connected ? <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={() => setConfirmDisconnect(value => !value)}>{t("Disconnect GitHub")}</Button> : null}
    </div>
    </details>
    {!connection.status && !connection.error ? <p role="status" className="writing-small">{t("Checking GitHub connection…")}</p> : null}
    {connection.status && !connection.status.configured ? <p className="writing-small">{t("GitHub connection is not configured. Ask the administrator to register the GitHub App.")}</p> : null}
    {connection.error ? <div className="writing-actions"><p role="alert">{t("Could not load GitHub connection.")}</p><Button type="button" size="sm" variant="outline" onClick={connection.refresh}>{t("Try again")}</Button></div> : null}
    {confirmDisconnect ? <div className="writing-github-confirm"><p>{t("Disconnect this personal GitHub connection? Manuscripts and remote repositories are retained.")}</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
      const value = await githubConnectionApi.disconnect(connection.userId!); onCredentialChange(); connection.refresh(); setConfirmDisconnect(false);
      setNotice(t(value.revoked ? "GitHub disconnected." : "Local credentials removed. Revoke LumiGap in GitHub settings to finish removing upstream access."));
    })}>{t("Confirm disconnect")}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDisconnect(false)}>{t("Cancel")}</Button></div> : null}
    {connection.status?.connected && showRepositories ? <>
      <Dialog open={createOpen} onOpenChange={value => { if (!busy && !disabled) { setCreateOpen(value); setError(""); } }}>
        <DialogTrigger asChild><Button type="button" size="sm" disabled={disabled || busy || !projectId}>{t("Create new GitHub repository")}</Button></DialogTrigger>
        <DialogContent closeLabel={t("Close")} showClose={!busy} data-no-i18n onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
          <DialogHeader><DialogTitle>{t("Create new GitHub repository")}</DialogTitle><DialogDescription>{t("Create a repository in your connected GitHub account, then connect it to this manuscript. Source files are not uploaded yet.")}</DialogDescription></DialogHeader>
          <form className="writing-create-form writing-github-repository-form" onSubmit={event => { event.preventDefault(); if (disabled || busy || !projectId || !/^[A-Za-z0-9._-]{1,100}$/.test(newName.trim())) return; void run(async () => {
            if (useAuthStore.getState().user?.id !== connection.userId) throw new Error("Account changed");
            const created = await manuscriptsApi.createRepository({ name: newName.trim(), description: newDesc.trim() || undefined, isPrivate: newPrivate, projectId }, connection.userId!);
            if (useAuthStore.getState().user?.id !== connection.userId) return;
            setRepositories(current => [{ ...created, writable: true }, ...current.filter(repo => repo.fullName !== created.fullName)]);
            setPage(current => Math.max(1, current)); onRepository(created.fullName); onBranch(created.defaultBranch);
            setCreateOpen(false); setNewName(""); setNewDesc(""); setNewPrivate(true);
            setNotice(`${t("Created repository")}: ${created.fullName}. ${t("Repository selected. Connect it to the manuscript below.")}`);
          }); }}>
            <label>{t("Repository name")}<Input autoFocus required pattern="[A-Za-z0-9._-]+" value={newName} placeholder="research-paper" maxLength={100} disabled={disabled || busy} onChange={e => setNewName(e.target.value)} /></label>
            <p className="text-sm text-muted-foreground">{t("Use letters, numbers, periods, hyphens or underscores.")}</p>
            <label>{t("Description (optional)")}<Input value={newDesc} placeholder="LumiGap manuscript source" maxLength={300} disabled={disabled || busy} onChange={e => setNewDesc(e.target.value)} /></label>
            <label className="writing-checkbox"><input type="checkbox" checked={newPrivate} disabled={disabled || busy} onChange={e => setNewPrivate(e.target.checked)} />{t("Private GitHub repository")}</label>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {busy ? <p role="status">{t("Creating repository…")}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={disabled || busy || !/^[A-Za-z0-9._-]{1,100}$/.test(newName.trim())}>{t("Create repository")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p className="writing-small">{t("Or choose an existing repository")}</p>
      <label>{t("Authorized repositories")}<select value={repositories.some(repo => repo.fullName === repository) ? repository : ""} disabled={disabled || busy || !page} onChange={event => choose(event.target.value)}><option value="">{t("Choose a repository")}</option>{repositories.map(repo => <option key={repo.fullName} value={repo.fullName}>{repo.fullName} · {t(repo.private ? "Private" : "Public")}{repo.writable ? "" : ` · ${t("Read only")}`}</option>)}</select></label>
      <div className="writing-actions"><Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => void loadRepositories(true)}>{t("Reload repository list")}</Button>
        {hasMore ? <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void loadRepositories()}>{t("Load more repositories")}</Button> : null}
      </div>
      {page > 0 && !repositories.length ? <p className="writing-small">{t("No repositories available. Install the GitHub App for the repositories you want to use, then reload the list.")}</p> : null}
      <p className="writing-small">{t("Created a repository on GitHub? Reload the list. If it is missing, grant this app access to the new repository.")}{" "}{connection.status.installUrl ? <a href={connection.status.installUrl} target="_blank" rel="noopener noreferrer">{t("Manage repository access on GitHub")}</a> : null}</p>
    </> : null}
    {busy ? <p role="status" className="writing-small">{t("Updating GitHub connection…")}</p> : null}
    {error && !createOpen ? <p role="alert" className="writing-error">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
  </section>;
}
