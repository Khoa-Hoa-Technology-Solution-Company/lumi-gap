import { useEffect, useState } from "react";
import { GitCommitHorizontal, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { ManuscriptGithubClient, type RepositoryCommit } from "./manuscript-github-client";

export function GithubRecentCommits({ repository, branch, userId, project, active, revision, disabled }: { repository: string; branch: string; userId: string; project: string; active: boolean; revision: number; disabled: boolean }) {
  const { t, language } = useI18n();
  const [commits, setCommits] = useState<RepositoryCommit[]>([]), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [reload, setReload] = useState(0);
  const key = `${project}:${userId}:${repository}:${branch}`, [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); setLoading(true); setFailed(false); setCommits([]); setLoadedKey(key);
    void new ManuscriptGithubClient(repository, "", controller.signal, userId, project).recentCommits(branch)
      .then(result => { if (!controller.signal.aborted) setCommits(result); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, repository, branch, userId, project, revision, reload, key]);
  return <section className="writing-github-commits" aria-label={t("Recent commits on GitHub")}>
    <div className="writing-github-commits-heading"><h3><GitCommitHorizontal aria-hidden="true" className="h-4 w-4" />{t("Recent commits on GitHub")}</h3><Button size="sm" variant="ghost" disabled={disabled || loading} aria-label={t("Refresh GitHub commits")} onClick={() => setReload(value => value + 1)}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /></Button></div>
    {loading || loadedKey !== key ? <p className="writing-small" role="status">{t("Loading GitHub commits…")}</p> : failed ? <div><p className="writing-small">{t("Could not load GitHub commits. You can still compare source.")}</p><Button size="sm" variant="outline" disabled={disabled} onClick={() => setReload(value => value + 1)}>{t("Try again")}</Button></div> : !commits.length ? <p className="writing-small">{t("No GitHub commits found.")}</p> : <ol>{commits.map(commit => {
      const date = new Date(commit.date);
      return <li key={commit.sha}><a href={`https://github.com/${repository}/commit/${commit.sha}`} target="_blank" rel="noopener noreferrer"><span>{commit.message}</span><code>{commit.sha.slice(0, 7)}</code></a><div className="writing-small">{commit.author ? <span>{commit.author}</span> : null}{Number.isFinite(date.getTime()) ? <time dateTime={commit.date}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date)}</time> : null}</div></li>;
    })}</ol>}
  </section>;
}
