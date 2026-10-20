import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GithubConnectionStatus, GithubRepositoryOption } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { githubConnectionApi } from "./github-connection.api";

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

export function GithubConnectionFields({ connection, repository, branch, token, disabled, onRepository, onBranch, onToken, onCredentialChange, beforeConnect, onBusyChange }: {
  connection: GithubConnection; repository: string; branch: string; token: string; disabled: boolean;
  onRepository: (value: string) => void; onBranch: (value: string) => void; onToken: (value: string) => void;
  onCredentialChange: () => void; beforeConnect?: () => Promise<unknown>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useI18n(), location = useLocation();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [repositories, setRepositories] = useState<GithubRepositoryOption[]>([]), [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false), [advanced, setAdvanced] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const pending = useRef(false), abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { abort.current?.abort(); setRepositories([]); setPage(0); setHasMore(false); setConfirmDisconnect(false); }, [connection.connectedUser]);
  const run = async (work: () => Promise<void>) => {
    if (pending.current || !connection.userId) return;
    pending.current = true; setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    try { await work(); } catch { setError(t("GitHub connection failed. Retry or reconnect; your manuscript is retained.")); }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false); }
  };
  const loadRepositories = () => run(async () => {
    abort.current?.abort(); abort.current = new AbortController();
    const value = await githubConnectionApi.repositories(connection.userId!, page + 1, abort.current.signal);
    if (abort.current.signal.aborted) return;
    setRepositories(current => [...new Map([...current, ...value.repositories].map(repo => [repo.fullName, repo])).values()]); setPage(value.page); setHasMore(value.hasMore);
  });
  const choose = (name: string) => { onRepository(name); const repo = repositories.find(item => item.fullName === name); if (repo) onBranch(repo.defaultBranch); };
  return <section className="writing-github-connection" aria-label={t("GitHub connection")}>
    <div className="writing-actions">
      <strong>{connection.status?.connected ? `${t("Connected to GitHub")} · @${connection.status.login}` : t("Connect your GitHub account")}</strong>
      <Button type="button" size="sm" variant={connection.status?.connected ? "outline" : "default"} disabled={disabled || busy || !connection.status?.configured} onClick={() => void run(async () => {
        await beforeConnect?.(); const result = await githubConnectionApi.start(connection.userId!, `${location.pathname}${location.search}`);
        const url = new URL(result.url); if (url.origin !== "https://github.com" || url.pathname !== "/login/oauth/authorize") throw new Error();
        if (useAuthStore.getState().user?.id !== connection.userId) throw new Error();
        window.location.assign(url.toString());
      })}>{t(connection.status?.connected ? "Reconnect GitHub" : "Connect GitHub")}</Button>
      {connection.status?.connected ? <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={() => setConfirmDisconnect(value => !value)}>{t("Disconnect GitHub")}</Button> : null}
    </div>
    {!connection.status && !connection.error ? <p role="status" className="writing-small">{t("Checking GitHub connection…")}</p> : null}
    {connection.status && !connection.status.configured ? <p className="writing-small">{t("GitHub connection is not configured. Ask the administrator to register the GitHub App; manual tokens remain available below.")}</p> : null}
    {connection.error ? <div className="writing-actions"><p role="alert">{t("Could not load GitHub connection.")}</p><Button type="button" size="sm" variant="outline" onClick={connection.refresh}>{t("Try again")}</Button></div> : null}
    {confirmDisconnect ? <div className="writing-github-confirm"><p>{t("Disconnect this personal GitHub connection? Manuscripts and remote repositories are retained.")}</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
      const value = await githubConnectionApi.disconnect(connection.userId!); onToken(""); onCredentialChange(); connection.refresh(); setConfirmDisconnect(false);
      setNotice(t(value.revoked ? "GitHub disconnected." : "Local credentials removed. Revoke LumiGap in GitHub settings to finish removing upstream access."));
    })}>{t("Confirm disconnect")}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDisconnect(false)}>{t("Cancel")}</Button></div> : null}
    {connection.status?.connected ? <>
      <div className="writing-actions"><Button type="button" size="sm" variant="outline" disabled={disabled || busy || page > 0 && !hasMore} onClick={() => void loadRepositories()}>{t(page ? "Load more repositories" : "Choose an authorized repository")}</Button>
        {connection.status.installUrl ? <a href={connection.status.installUrl} target="_blank" rel="noopener noreferrer">{t("Manage repository access on GitHub")}</a> : null}</div>
      {page ? <label>{t("Authorized repositories")}<select value={repositories.some(repo => repo.fullName === repository) ? repository : ""} disabled={disabled || busy} onChange={event => choose(event.target.value)}><option value="">{t("Choose a repository")}</option>{repositories.map(repo => <option key={repo.fullName} value={repo.fullName}>{repo.fullName} · {t(repo.private ? "Private" : "Public")}{repo.writable ? "" : ` · ${t("Read only")}`}</option>)}</select></label> : null}
      {page > 0 && !repositories.length ? <p className="writing-small">{t("No repositories available. Install the GitHub App for the repositories you want to use, then reload the list.")}</p> : null}
      {page ? <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => { setPage(0); setRepositories([]); setHasMore(false); }}>{t("Reload repository list")}</Button> : null}
    </> : null}
    <label>{t("Repository (owner/name)")}<Input value={repository} maxLength={201} disabled={disabled || busy} placeholder="team/research-paper" onChange={event => onRepository(event.target.value)} /></label>
    <label>{t("Source branch")}<Input value={branch} maxLength={200} disabled={disabled || busy} onChange={event => onBranch(event.target.value)} /></label>
    <details open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}><summary>{t("Advanced: use a personal access token")}</summary><label>{t("GitHub access token")}<Input type="password" autoComplete="off" value={token} maxLength={500} disabled={disabled || busy} onChange={event => onToken(event.target.value)} /></label><p className="writing-small">{t("Token stays in this dialog only and is sent directly to api.github.com. Public imports work without a token. Export requires Contents write permission.")}</p></details>
    {token ? <p className="writing-small">{t("Using the manual token for this transfer.")}</p> : null}
    {busy ? <p role="status" className="writing-small">{t("Updating GitHub connection…")}</p> : null}
    {error ? <p role="alert" className="writing-error">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
  </section>;
}
